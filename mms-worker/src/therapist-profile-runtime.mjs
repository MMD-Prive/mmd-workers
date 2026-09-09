const AIRTABLE_API = "https://api.airtable.com/v0";
const PROFILE_PREFIX = "/male-massage/therapists/api/auth/profile";
const SESSION_COOKIE = "__Secure-mms_therapist_session";
const SESSION_ROLE = "mms_therapist";
const SESSION_VERSION = 1;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_JSON_CHARS = 60_000;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS = 12;
const MAX_PUBLIC_PHOTOS = 6;
const MAX_COURSES = 8;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isMmsTherapistProfileRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === PROFILE_PREFIX || path.startsWith(`${PROFILE_PREFIX}/`);
}

export async function handleMmsTherapistProfileRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = String(request.method || "GET").toUpperCase();

  if (!isMmsTherapistProfileRequest(path)) return json({ ok: false, error: { code: "NOT_FOUND" } }, 404, request, env);

  if (method === "OPTIONS") {
    requireTrustedOrigin(request, env);
    return new Response(null, { status: 204, headers: responseHeaders(request, env) });
  }

  requireEnabled(env);
  requireRuntimeConfig(env);

  const publicPhoto = path.match(new RegExp(`^${escapeRegExp(PROFILE_PREFIX)}/public-photo/([A-Za-z0-9_-]{4,80})/(ph_[A-Za-z0-9]{20,80})$`));
  if (publicPhoto) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET,HEAD", request, env);
    return servePublicPhoto(publicPhoto[1], publicPhoto[2], method === "HEAD", env);
  }

  const current = await requireCurrentTherapist(request, env);

  if (path === PROFILE_PREFIX) {
    if (method === "GET") return getProfile(current, request, env);
    if (method === "PUT") {
      requireTrustedOrigin(request, env);
      return updateProfile(current, request, env);
    }
    return methodNotAllowed("GET,PUT", request, env);
  }

  if (path === `${PROFILE_PREFIX}/photos`) {
    if (method === "POST") {
      requireTrustedOrigin(request, env);
      return uploadPhoto(current, request, env);
    }
    return methodNotAllowed("POST", request, env);
  }

  if (path === `${PROFILE_PREFIX}/photos/public`) {
    if (method === "PUT") {
      requireTrustedOrigin(request, env);
      return setPublicPhotos(current, request, env);
    }
    return methodNotAllowed("PUT", request, env);
  }

  const photoContent = path.match(new RegExp(`^${escapeRegExp(PROFILE_PREFIX)}/photos/(ph_[A-Za-z0-9]{20,80})/content$`));
  if (photoContent) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET,HEAD", request, env);
    return servePrivatePhoto(current, photoContent[1], method === "HEAD", request, env);
  }

  const photoDelete = path.match(new RegExp(`^${escapeRegExp(PROFILE_PREFIX)}/photos/(ph_[A-Za-z0-9]{20,80})$`));
  if (photoDelete) {
    if (method !== "DELETE") return methodNotAllowed("DELETE", request, env);
    requireTrustedOrigin(request, env);
    return deletePhoto(current, photoDelete[1], request, env);
  }

  return json({ ok: false, error: { code: "NOT_FOUND" } }, 404, request, env);
}

export function therapistProfileErrorResponse(error, request, env = {}) {
  if (error instanceof TherapistProfileError) return json({ ok: false, error: { code: error.code } }, error.status, request, env);
  return json({ ok: false, error: { code: "THERAPIST_PROFILE_UNAVAILABLE" } }, 503, request, env);
}

async function getProfile(current, request, env) {
  const manifest = await loadManifest(current.therapist_id, env);
  return json({ ok: true, data: safeProfile(current, manifest) }, 200, request, env);
}

async function updateProfile(current, request, env) {
  const body = await readJson(request);
  const manifest = await loadManifest(current.therapist_id, env);

  const displayName = body.display_name === undefined ? current.display_name : clean(body.display_name, 120);
  if (!displayName) throw profileError(400, "DISPLAY_NAME_REQUIRED");

  const intro = body.intro === undefined ? manifest.intro : clean(body.intro, 600);
  const visibility = body.profile_visibility === undefined ? manifest.profile_visibility : clean(body.profile_visibility, 20).toLowerCase();
  if (!new Set(["public", "hidden"]).has(visibility)) throw profileError(400, "PROFILE_VISIBILITY_INVALID");

  const courses = body.courses === undefined ? manifest.courses : validateCourses(body.courses);

  if (displayName !== current.display_name) {
    await updateTherapist(env, current.record_id, { "Display Name": displayName });
    current.display_name = displayName;
  }

  const next = {
    ...manifest,
    version: 1,
    intro,
    profile_visibility: visibility,
    courses,
    updated_at: new Date().toISOString(),
  };
  await saveManifest(current.therapist_id, next, env);
  return json({ ok: true, data: safeProfile(current, next) }, 200, request, env);
}

async function uploadPhoto(current, request, env) {
  const contentType = clean(String(request.headers.get("Content-Type") || "").split(";")[0], 80).toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw profileError(415, "PHOTO_TYPE_NOT_ALLOWED");

  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_PHOTO_BYTES) throw profileError(413, "PHOTO_TOO_LARGE");

  const manifest = await loadManifest(current.therapist_id, env);
  if (manifest.photos.length >= MAX_PHOTOS) throw profileError(409, "PHOTO_LIMIT_REACHED");

  let bytes;
  try { bytes = new Uint8Array(await request.arrayBuffer()); }
  catch { throw profileError(400, "PHOTO_READ_FAILED"); }
  if (!bytes.byteLength) throw profileError(400, "PHOTO_EMPTY");
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw profileError(413, "PHOTO_TOO_LARGE");

  const photoId = `ph_${crypto.randomUUID().replace(/-/g, "")}`;
  const key = photoKey(current.therapist_id, photoId);
  const fileName = clean(request.headers.get("X-File-Name"), 180) || `${photoId}.${extensionFor(contentType)}`;

  try {
    await env.MMS_PRIVATE_UPLOADS.put(key, bytes, {
      httpMetadata: { contentType },
      customMetadata: { therapist_id: current.therapist_id, photo_id: photoId, file_name: fileName },
    });
  } catch { throw profileError(503, "PHOTO_STORAGE_UNAVAILABLE"); }

  const next = {
    ...manifest,
    photos: [...manifest.photos, { id: photoId, key, file_name: fileName, content_type: contentType, created_at: new Date().toISOString() }],
    updated_at: new Date().toISOString(),
  };
  await saveManifest(current.therapist_id, next, env);

  return json({ ok: true, data: photoView(current.therapist_id, next, next.photos[next.photos.length - 1]) }, 201, request, env);
}

async function setPublicPhotos(current, request, env) {
  const body = await readJson(request);
  if (!Array.isArray(body.photo_ids)) throw profileError(400, "PHOTO_IDS_REQUIRED");
  const ids = [...new Set(body.photo_ids.map((value) => clean(value, 100)).filter(Boolean))];
  if (ids.length > MAX_PUBLIC_PHOTOS) throw profileError(400, "PUBLIC_PHOTO_LIMIT_REACHED");
  const manifest = await loadManifest(current.therapist_id, env);
  const owned = new Set(manifest.photos.map((photo) => photo.id));
  if (ids.some((id) => !owned.has(id))) throw profileError(400, "PHOTO_NOT_OWNED");
  const next = { ...manifest, public_photo_ids: ids, updated_at: new Date().toISOString() };
  await saveManifest(current.therapist_id, next, env);
  return json({ ok: true, data: safeProfile(current, next) }, 200, request, env);
}

async function deletePhoto(current, photoId, request, env) {
  const manifest = await loadManifest(current.therapist_id, env);
  const photo = manifest.photos.find((item) => item.id === photoId);
  if (!photo) throw profileError(404, "PHOTO_NOT_FOUND");
  try { await env.MMS_PRIVATE_UPLOADS.delete(photo.key); }
  catch { throw profileError(503, "PHOTO_STORAGE_UNAVAILABLE"); }
  const next = {
    ...manifest,
    photos: manifest.photos.filter((item) => item.id !== photoId),
    public_photo_ids: manifest.public_photo_ids.filter((id) => id !== photoId),
    updated_at: new Date().toISOString(),
  };
  await saveManifest(current.therapist_id, next, env);
  return new Response(null, { status: 204, headers: responseHeaders(request, env) });
}

async function servePrivatePhoto(current, photoId, headOnly, request, env) {
  const manifest = await loadManifest(current.therapist_id, env);
  const photo = manifest.photos.find((item) => item.id === photoId);
  if (!photo) throw profileError(404, "PHOTO_NOT_FOUND");
  const object = await env.MMS_PRIVATE_UPLOADS.get(photo.key);
  if (!object) throw profileError(404, "PHOTO_NOT_FOUND");
  const headers = responseHeaders(request, env);
  headers["Content-Type"] = photo.content_type || object.httpMetadata?.contentType || "application/octet-stream";
  headers["Content-Length"] = String(object.size || 0);
  headers["Cache-Control"] = "private, no-store";
  return new Response(headOnly ? null : object.body, { status: 200, headers });
}

async function servePublicPhoto(therapistId, photoId, headOnly, env) {
  const manifest = await loadManifest(therapistId, env);
  if (manifest.profile_visibility !== "public" || !manifest.public_photo_ids.includes(photoId)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" } });
  }
  const photo = manifest.photos.find((item) => item.id === photoId);
  if (!photo) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  const object = await env.MMS_PRIVATE_UPLOADS.get(photo.key);
  if (!object) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  const headers = new Headers({
    "Content-Type": photo.content_type || object.httpMetadata?.contentType || "application/octet-stream",
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(headOnly ? null : object.body, { status: 200, headers });
}

async function requireCurrentTherapist(request, env) {
  const token = readCookie(request.headers.get("Cookie") || "", SESSION_COOKIE);
  if (!token) throw profileError(401, "THERAPIST_SESSION_REQUIRED");
  const session = await verifySessionToken(token, env);
  const record = await findUniqueTherapist(env, session.therapist_id);
  if (!record) throw profileError(401, "THERAPIST_SESSION_INVALID");
  assertTherapistCanAuthenticate(record);
  return {
    record_id: record.id,
    therapist_id: clean(record.fields?.["Therapist ID"], 80),
    display_name: clean(record.fields?.["Display Name"], 120),
    availability_status: clean(record.fields?.["Availability Status"], 40) || "Unavailable",
    role: SESSION_ROLE,
  };
}

function safeProfile(current, manifest) {
  return {
    therapist_id: current.therapist_id,
    display_name: current.display_name,
    availability_status: current.availability_status,
    role: SESSION_ROLE,
    intro: manifest.intro,
    profile_visibility: manifest.profile_visibility,
    courses: manifest.courses,
    public_photo_ids: manifest.public_photo_ids,
    photos: manifest.photos.map((photo) => photoView(current.therapist_id, manifest, photo)),
    limits: { photos: MAX_PHOTOS, public_photos: MAX_PUBLIC_PHOTOS, courses: MAX_COURSES, photo_bytes: MAX_PHOTO_BYTES },
  };
}

function photoView(therapistId, manifest, photo) {
  const isPublic = manifest.profile_visibility === "public" && manifest.public_photo_ids.includes(photo.id);
  return {
    id: photo.id,
    file_name: photo.file_name,
    content_type: photo.content_type,
    created_at: photo.created_at,
    selected_public: manifest.public_photo_ids.includes(photo.id),
    preview_url: `${PROFILE_PREFIX}/photos/${encodeURIComponent(photo.id)}/content`,
    public_url: isPublic ? `${PROFILE_PREFIX}/public-photo/${encodeURIComponent(therapistId)}/${encodeURIComponent(photo.id)}` : null,
  };
}

function validateCourses(value) {
  if (!Array.isArray(value) || value.length > MAX_COURSES) throw profileError(400, "COURSES_INVALID");
  return value.map((course, index) => {
    if (!course || typeof course !== "object" || Array.isArray(course)) throw profileError(400, "COURSES_INVALID");
    const name = clean(course.name, 80);
    const duration = Number(course.duration_minutes);
    const price = Number(course.price_thb);
    if (!name) throw profileError(400, `COURSE_${index + 1}_NAME_REQUIRED`);
    if (!Number.isInteger(duration) || duration < 30 || duration > 360 || duration % 30 !== 0) throw profileError(400, `COURSE_${index + 1}_DURATION_INVALID`);
    if (!Number.isInteger(price) || price < 0 || price > 99999) throw profileError(400, `COURSE_${index + 1}_PRICE_INVALID`);
    return { name, duration_minutes: duration, price_thb: price };
  });
}

function defaultManifest() {
  return { version: 1, intro: "", profile_visibility: "hidden", courses: [], photos: [], public_photo_ids: [], updated_at: null };
}

async function loadManifest(therapistId, env) {
  const object = await env.MMS_PRIVATE_UPLOADS.get(manifestKey(therapistId));
  if (!object) return defaultManifest();
  try {
    const parsed = JSON.parse(await object.text());
    return {
      version: 1,
      intro: clean(parsed.intro, 600),
      profile_visibility: parsed.profile_visibility === "public" ? "public" : "hidden",
      courses: Array.isArray(parsed.courses) ? parsed.courses.slice(0, MAX_COURSES) : [],
      photos: Array.isArray(parsed.photos) ? parsed.photos.filter(validStoredPhoto).slice(0, MAX_PHOTOS) : [],
      public_photo_ids: Array.isArray(parsed.public_photo_ids) ? parsed.public_photo_ids.map((id) => clean(id, 100)).filter(Boolean).slice(0, MAX_PUBLIC_PHOTOS) : [],
      updated_at: clean(parsed.updated_at, 80) || null,
    };
  } catch { throw profileError(503, "PROFILE_STORAGE_CORRUPT"); }
}

async function saveManifest(therapistId, manifest, env) {
  try {
    await env.MMS_PRIVATE_UPLOADS.put(manifestKey(therapistId), JSON.stringify(manifest), { httpMetadata: { contentType: "application/json" } });
  } catch { throw profileError(503, "PROFILE_STORAGE_UNAVAILABLE"); }
}

function validStoredPhoto(photo) {
  return photo && typeof photo === "object" && /^ph_[A-Za-z0-9]{20,80}$/.test(String(photo.id || "")) && typeof photo.key === "string";
}

function manifestKey(therapistId) { return `therapist-dashboard/v1/${therapistId}/profile.json`; }
function photoKey(therapistId, photoId) { return `therapist-dashboard/v1/${therapistId}/photos/${photoId}`; }
function extensionFor(type) { return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"; }

async function findUniqueTherapist(env, therapistId) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableId(env))}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{Therapist ID}=${formulaString(therapistId)}`);
  for (const field of ["Therapist ID", "Display Name", "Availability Status", "Status", "Therapist Auth Status", "LINE Subject Hash"]) url.searchParams.append("fields[]", field);
  const payload = await airtableFetch(url, { method: "GET" }, env);
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length > 1) throw profileError(503, "THERAPIST_IDENTITY_CONFLICT");
  return records[0] || null;
}

async function updateTherapist(env, recordId, fields) {
  if (!/^rec[A-Za-z0-9]{10,30}$/.test(String(recordId || ""))) throw profileError(503, "THERAPIST_PROFILE_UNAVAILABLE");
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableId(env))}/${encodeURIComponent(recordId)}`;
  return airtableFetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields, typecast: false }) }, env);
}

async function airtableFetch(url, init, env) {
  let response;
  try {
    response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`, ...(init.headers || {}) } });
  } catch { throw profileError(503, "THERAPIST_PROFILE_UNAVAILABLE"); }
  if (!response.ok) throw profileError(503, "THERAPIST_PROFILE_UNAVAILABLE");
  try { return await response.json(); }
  catch { throw profileError(503, "THERAPIST_PROFILE_UNAVAILABLE"); }
}

function assertTherapistCanAuthenticate(record) {
  const fields = record?.fields || {};
  const therapistId = clean(fields["Therapist ID"], 80);
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(therapistId)) throw profileError(403, "THERAPIST_ACCESS_DENIED");
  if (clean(fields.Status, 40) !== "Active") throw profileError(403, "THERAPIST_ACCESS_DENIED");
  if (clean(fields["Therapist Auth Status"], 40) !== "Active") throw profileError(403, "THERAPIST_ACCESS_DENIED");
  if (!clean(fields["LINE Subject Hash"], 200)) throw profileError(403, "THERAPIST_ACCESS_DENIED");
}

async function verifySessionToken(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw profileError(401, "THERAPIST_SESSION_INVALID");
  const [, encoded, signature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[a-f0-9]{64}$/.test(signature)) throw profileError(401, "THERAPIST_SESSION_INVALID");
  const expected = await hmacHex(sessionSecret(env), `mms-therapist-session-v1.${encoded}`);
  if (!constantTimeEqual(signature, expected)) throw profileError(401, "THERAPIST_SESSION_INVALID");
  let payload;
  try { payload = JSON.parse(base64UrlDecodeText(encoded)); }
  catch { throw profileError(401, "THERAPIST_SESSION_INVALID"); }
  const now = Math.floor(Date.now() / 1000);
  const therapistId = clean(payload?.therapist_id, 80);
  if (payload?.v !== SESSION_VERSION || payload?.role !== SESSION_ROLE) throw profileError(401, "THERAPIST_SESSION_INVALID");
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(therapistId)) throw profileError(401, "THERAPIST_SESSION_INVALID");
  if (!Number.isFinite(payload?.iat) || !Number.isFinite(payload?.exp)) throw profileError(401, "THERAPIST_SESSION_INVALID");
  if (payload.exp <= now || payload.iat > now + 300 || payload.exp - payload.iat > SESSION_TTL_SECONDS) throw profileError(401, "THERAPIST_SESSION_INVALID");
  return { therapist_id: therapistId, role: SESSION_ROLE };
}

function requireRuntimeConfig(env) {
  if (!String(env.AIRTABLE_API_TOKEN || "") || !clean(env.AIRTABLE_BASE_ID, 80) || !tableId(env)) throw profileError(503, "THERAPIST_PROFILE_NOT_CONFIGURED");
  if (String(env.MMS_THERAPIST_SESSION_SECRET || "").length < 32) throw profileError(503, "THERAPIST_PROFILE_NOT_CONFIGURED");
  if (!env.MMS_PRIVATE_UPLOADS || typeof env.MMS_PRIVATE_UPLOADS.get !== "function" || typeof env.MMS_PRIVATE_UPLOADS.put !== "function") throw profileError(503, "THERAPIST_PROFILE_NOT_CONFIGURED");
}
function requireEnabled(env) { if (String(env.MMS_THERAPIST_AUTH_ENABLED || "").toLowerCase() !== "true") throw profileError(503, "THERAPIST_AUTH_NOT_ENABLED"); }
function tableId(env) { const id = clean(env.AIRTABLE_THERAPISTS_TABLE_ID, 80); if (!/^tbl[A-Za-z0-9]{10,30}$/.test(id)) throw profileError(503, "THERAPIST_PROFILE_NOT_CONFIGURED"); return id; }
function sessionSecret(env) { const secret = String(env.MMS_THERAPIST_SESSION_SECRET || ""); if (secret.length < 32) throw profileError(503, "THERAPIST_PROFILE_NOT_CONFIGURED"); return secret; }

function requireTrustedOrigin(request, env) {
  const origin = clean(request.headers.get("Origin"), 300);
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (!origin || !allowed.has(origin)) throw profileError(403, "ORIGIN_NOT_ALLOWED");
}

async function readJson(request) {
  let text;
  try { text = await request.text(); }
  catch { throw profileError(400, "BAD_REQUEST"); }
  if (!text || text.length > MAX_JSON_CHARS) throw profileError(400, "BAD_REQUEST");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bad");
    return value;
  } catch { throw profileError(400, "BAD_REQUEST"); }
}

function responseHeaders(request, env) {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  const origin = clean(request?.headers?.get?.("Origin"), 300);
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (origin && allowed.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Headers"] = "Content-Type,X-File-Name";
    headers["Access-Control-Allow-Methods"] = "GET,HEAD,POST,PUT,DELETE,OPTIONS";
    headers.Vary = "Origin";
  }
  return headers;
}

function json(payload, status, request, env, extra = {}) { return Response.json(payload, { status, headers: { ...responseHeaders(request, env), ...extra } }); }
function methodNotAllowed(allow, request, env) { return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, request, env, { Allow: allow }); }
function formulaString(value) { return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function readCookie(header, name) { for (const part of String(header || "").split(";")) { const i = part.indexOf("="); if (i >= 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); } return ""; }
function normalizePath(pathname = "") { const path = String(pathname || "").trim() || "/"; return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path; }
function clean(value, max = 500) { if (value === undefined || value === null) return ""; return String(value).trim().slice(0, max); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value))));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function base64UrlDecodeText(value) { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4); const binary = atob(padded); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); return new TextDecoder().decode(bytes); }
function constantTimeEqual(a, b) { const left = String(a || ""); const right = String(b || ""); if (left.length !== right.length) return false; let mismatch = 0; for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i); return mismatch === 0; }

class TherapistProfileError extends Error { constructor(status, code) { super(code); this.name = "TherapistProfileError"; this.status = status; this.code = code; } }
function profileError(status, code) { return new TherapistProfileError(status, code); }

export const therapistProfileContract = Object.freeze({
  prefix: PROFILE_PREFIX,
  limits: Object.freeze({ photos: MAX_PHOTOS, public_photos: MAX_PUBLIC_PHOTOS, courses: MAX_COURSES, photo_bytes: MAX_PHOTO_BYTES }),
  course_duration_minutes: Object.freeze({ min: 30, max: 360, step: 30 }),
});