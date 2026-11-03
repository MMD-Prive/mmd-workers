import { PROFILE_OPERATION_CONTEXT } from "./therapist-profile-operation-context.mjs";
import { profileWritePaused, profileWritePauseResponse } from './therapist-profile-write-pause.mjs';
import { linkedServiceZoneCodes, loadMmsServiceZoneIndex, MAX_COVERAGE_ZONES } from "./service-zones-runtime.mjs";
import { isTherapistPhotoContent } from "./therapist-photo-content.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const PROFILE_PREFIX = "/male-massage/therapists/api/auth/profile";
const SESSION_COOKIE = "__Secure-mms_therapist_session";
const SESSION_ROLE = "mms_therapist";
const SESSION_VERSION = 1;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_JSON_CHARS = 60_000;
const MANIFEST_ETAG = Symbol("observed manifest etag");
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
  if (profileWritePaused(request, env)) return profileWritePauseResponse();
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
  // The namespace is private to this Worker; owner selection is authenticated
  // here and checked again inside the owner coordinator, never accepted in JSON.
  if (!env[PROFILE_OPERATION_CONTEXT]) {
    const owner = await profileCoordinatorOwner(request,env);
    if (!env.MMS_THERAPIST_PROFILES?.getByName) throw profileError(503, "PROFILE_COORDINATOR_REQUIRED");
    return env.MMS_THERAPIST_PROFILES.getByName(owner).fetch(request);
  }
  if (publicPhoto) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed("GET,HEAD", request, env);
    return servePublicPhoto(publicPhoto[1], publicPhoto[2], method === "HEAD", env);
  }

  const current = await requireCurrentTherapist(request, env);
  const expectedTherapist = request.headers.get("X-MMS-Therapist-Context");
  if (!["GET", "HEAD"].includes(method) && expectedTherapist !== null && expectedTherapist !== current.therapist_id) throw profileError(409,"PROFILE_ACCOUNT_CHANGED");

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
  if (error instanceof TherapistProfileError) return json({ ok: false, error: { code: error.code }, ...(error.save_state ? { retryable: true, save_state: error.save_state } : {}) }, error.status, request, env);
  return json({ ok: false, error: { code: "THERAPIST_PROFILE_UNAVAILABLE" } }, 503, request, env);
}

async function getProfile(current, request, env) {
  const manifest = await loadManifest(current.therapist_id, env);
  let serviceZoneIndex = null;
  try { serviceZoneIndex = await loadMmsServiceZoneIndex(env); } catch { /* Keep profile editing available if the zone catalog is temporarily down. */ }
  return json({ ok: true, data: safeProfile(current, manifest, serviceZoneIndex, env[PROFILE_OPERATION_CONTEXT]?.revision) }, 200, request, env);
}

async function updateProfile(current, request, env) {
  const body = await readJson(request);
  const allowed = new Set(['display_name', 'intro', 'profile_visibility', 'courses', 'base_service_zone_code', 'coverage_service_zone_codes']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw profileError(400, 'PROFILE_FIELD_NOT_ALLOWED');
  const manifest = await loadManifest(current.therapist_id, env);
  const displayName = body.display_name === undefined ? current.display_name : clean(body.display_name, 120);
  if (!displayName) throw profileError(400, 'DISPLAY_NAME_REQUIRED');
  const visibility = body.profile_visibility === undefined ? manifest.profile_visibility : clean(body.profile_visibility, 20).toLowerCase();
  if (!['public', 'hidden'].includes(visibility)) throw profileError(400, 'PROFILE_VISIBILITY_INVALID');
  const fields = {};
  if (displayName !== current.display_name) fields['Display Name'] = displayName;
  if (body.base_service_zone_code !== undefined || body.coverage_service_zone_codes !== undefined) {
    if (body.base_service_zone_code === undefined || body.coverage_service_zone_codes === undefined) throw profileError(400, 'SERVICE_ZONES_INVALID');
    const index=await loadMmsServiceZoneIndex(env);
    if (unresolvedZoneLinks(current,index)>0) throw profileError(409,'SERVICE_ZONE_REVIEW_REQUIRED');
    Object.assign(fields, validateServiceZoneSelection(body.base_service_zone_code, body.coverage_service_zone_codes, index));
    for(const field of ['Base Service Zone','Coverage Service Zones']) if(JSON.stringify([...fields[field]].sort())===JSON.stringify([...(current.fields[field]||[])].sort()))delete fields[field];
  }
  const next = { ...manifest, intro: body.intro === undefined ? manifest.intro : clean(body.intro, 600), profile_visibility: visibility, courses: body.courses === undefined ? manifest.courses : validateCourses(body.courses) };
  return persistProfilePlan(current, request, env, mutationPlan(current, manifest, next, 'profile', fields));
}

async function uploadPhoto(current, request, env) {
  const contentType = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw profileError(415, 'PHOTO_TYPE_NOT_ALLOWED');
  if (Number(request.headers.get('Content-Length') || 0) > MAX_PHOTO_BYTES) throw profileError(413, 'PHOTO_TOO_LARGE');
  const uploadId = request.headers.get('X-Upload-Id');
  if (uploadId !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(uploadId)) throw profileError(400, 'PHOTO_UPLOAD_ID_INVALID');
  let bytes;
  try { bytes = new Uint8Array(await request.arrayBuffer()); } catch { throw profileError(400, 'PHOTO_READ_FAILED'); }
  if (!bytes.length) throw profileError(400, 'PHOTO_EMPTY');
  if (bytes.length > MAX_PHOTO_BYTES) throw profileError(413, 'PHOTO_TOO_LARGE');
  if (!isTherapistPhotoContent(bytes, contentType)) throw profileError(415, 'PHOTO_CONTENT_INVALID');
  const op = env[PROFILE_OPERATION_CONTEXT];
  const photoId = `ph_${await sha256Hex(new TextEncoder().encode(`${current.therapist_id}.${(uploadId || op.id).toLowerCase()}`))}`;
  if (await op.deleted(photoId)) throw profileError(409, 'PHOTO_UPLOAD_DELETED');
  const digest = await sha256Hex(bytes), manifest = await loadManifest(current.therapist_id, env);
  const existing = manifest.photos.find(photo => photo.id === photoId);
  if (existing && (existing.content_sha256 !== digest || existing.content_type !== contentType)) throw profileError(409, 'PHOTO_UPLOAD_ID_REUSED');
  if (!existing && manifest.photos.length >= MAX_PHOTOS) throw profileError(409, 'PHOTO_LIMIT_REACHED');
  const photo = existing || { id: photoId, key: photoKey(current.therapist_id, photoId), file_name: clean(request.headers.get('X-File-Name'), 180) || `${photoId}.${extensionFor(contentType)}`, content_type: contentType, content_sha256: digest, created_at: new Date().toISOString() };
  const plan = mutationPlan(current, manifest, { ...manifest, photos: existing ? manifest.photos : [...manifest.photos, photo] }, 'upload');
  plan.photo = photo; plan.status = existing ? 200 : 201;
  return persistProfilePlan(current, request, env, plan, bytes);
}

async function setPublicPhotos(current, request, env) {
  const body = await readJson(request);
  if (!Array.isArray(body.photo_ids)) throw profileError(400, 'PHOTO_IDS_REQUIRED');
  const ids = [...new Set(body.photo_ids.map(value => clean(value, 100)).filter(Boolean))];
  if (ids.length > MAX_PUBLIC_PHOTOS) throw profileError(400, 'PUBLIC_PHOTO_LIMIT_REACHED');
  const manifest = await loadManifest(current.therapist_id, env);
  if (ids.some(id => !manifest.photos.some(photo => photo.id === id))) throw profileError(400, 'PHOTO_NOT_OWNED');
  return persistProfilePlan(current, request, env, mutationPlan(current, manifest, { ...manifest, public_photo_ids: ids }, 'selection'));
}

async function deletePhoto(current, photoId, request, env) {
  const manifest = await loadManifest(current.therapist_id, env);
  const plan = mutationPlan(current, manifest, { ...manifest, photos: manifest.photos.filter(photo => photo.id !== photoId), public_photo_ids: manifest.public_photo_ids.filter(id => id !== photoId) }, 'delete');
  plan.deletedPhoto = photoId;
  return persistProfilePlan(current, request, env, plan);
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
  if (clean(record.fields?.["Therapist ID"], 80) !== session.therapist_id) throw profileError(401, "THERAPIST_SESSION_INVALID");
  assertTherapistCanAuthenticate(record);
  const binding = await hmacHex(sessionSecret(env), 'mms-therapist-line-binding-v1.' + clean(record.fields?.["LINE Subject Hash"], 200));
  if (!constantTimeEqual(session.line_binding, binding)) throw profileError(401, "THERAPIST_SESSION_INVALID");
  return {
    record_id: record.id,
    therapist_id: clean(record.fields?.["Therapist ID"], 80),
    display_name: clean(record.fields?.["Display Name"], 120),
    availability_status: clean(record.fields?.["Availability Status"], 40) || "Unavailable",
    fields: {
      "Base Service Zone": record.fields?.["Base Service Zone"],
      "Coverage Service Zones": record.fields?.["Coverage Service Zones"],
    },
    role: SESSION_ROLE,
  };
}

function unresolvedZoneLinks(current,index) {
  return ['Base Service Zone','Coverage Service Zones'].reduce((count,key)=>count+(current.fields?.[key]||[]).filter(id=>!index?.byRecordId.has(String(id))).length,0);
}

function safeProfile(current, manifest, serviceZoneIndex = null, revision) {
  const baseCodes = linkedServiceZoneCodes(current.fields?.["Base Service Zone"], serviceZoneIndex);
  const coverageCodes = linkedServiceZoneCodes(current.fields?.["Coverage Service Zones"], serviceZoneIndex);
  const unresolvedCount = (field) => (Array.isArray(current.fields?.[field]) ? current.fields[field] : [])
    .filter((id) => !serviceZoneIndex?.byRecordId.has(String(id))).length;
  return {
    ...(Number.isSafeInteger(revision) ? { profile_revision: revision } : {}),
    therapist_id: current.therapist_id,
    display_name: current.display_name,
    availability_status: current.availability_status,
    service_zones: serviceZoneIndex ? {
      base_service_zone_code: baseCodes[0] || "",
      coverage_service_zone_codes: coverageCodes,
    } : null,
    service_zone_review_required: serviceZoneIndex ? unresolvedZoneLinks(current,serviceZoneIndex)>0 : false,
    service_zone_conflicts: serviceZoneIndex ? {
      unresolved_base_count: unresolvedCount("Base Service Zone"),
      unresolved_coverage_count: unresolvedCount("Coverage Service Zones"),
      base_not_in_coverage: Boolean(baseCodes[0] && !coverageCodes.includes(baseCodes[0])),
    } : null,
    role: SESSION_ROLE,
    intro: manifest.intro,
    profile_visibility: manifest.profile_visibility,
    courses: manifest.courses,
    public_photo_ids: manifest.public_photo_ids,
    photos: manifest.photos.map((photo) => photoView(current.therapist_id, manifest, photo)),
    limits: { photos: MAX_PHOTOS, public_photos: MAX_PUBLIC_PHOTOS, courses: MAX_COURSES, photo_bytes: MAX_PHOTO_BYTES, coverage_zones: MAX_COVERAGE_ZONES, coverage_service_zones: MAX_COVERAGE_ZONES },
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

function validateServiceZoneSelection(baseValue, coverageValue, index) {
  const baseCode = clean(baseValue, 80);
  if (typeof baseValue !== "string" || !Array.isArray(coverageValue)) throw profileError(400, "SERVICE_ZONES_INVALID");
  if (coverageValue.length > MAX_COVERAGE_ZONES) throw profileError(400, "SERVICE_ZONES_TOO_MANY");
  const coverageCodes = [...new Set(coverageValue.map((value) => typeof value === "string" ? clean(value, 80) : ""))];
  if (coverageCodes.some((code) => !code)) throw profileError(400, "SERVICE_ZONES_INVALID");
  if (!baseCode && coverageCodes.length === 0) return { "Base Service Zone": [], "Coverage Service Zones": [] };
  if (!baseCode || coverageCodes.length === 0 || !coverageCodes.includes(baseCode)) throw profileError(400, "SERVICE_ZONES_INVALID");
  const records = coverageCodes.map((code) => index.byCode.get(code));
  const base = index.byCode.get(baseCode);
  if (!base || records.some((zone) => !zone)) throw profileError(400, "SERVICE_ZONE_NOT_ACTIVE");
  return {
    "Base Service Zone": [base.record_id],
    "Coverage Service Zones": records.map((zone) => zone.record_id),
  };
}

function validateCourses(value) {
  if (!Array.isArray(value) || value.length > MAX_COURSES) throw profileError(400, "COURSES_INVALID");
  return value.map((course, index) => {
    if (!course || typeof course !== "object" || Array.isArray(course)) throw profileError(400, "COURSES_INVALID");
    if (Object.keys(course).some((key) => !["name", "duration_minutes", "price_thb"].includes(key))) throw profileError(400, "COURSES_INVALID");
    const name = clean(course.name, 80);
    const duration = Number(course.duration_minutes);
    const price = Number(course.price_thb);
    const numeric = (value) => typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value));
    if (typeof course.name !== "string" || !name) throw profileError(400, `COURSE_${index + 1}_NAME_REQUIRED`);
    if (!numeric(course.duration_minutes) || !Number.isInteger(duration) || duration < 30 || duration > 360 || duration % 30 !== 0) throw profileError(400, `COURSE_${index + 1}_DURATION_INVALID`);
    if (!numeric(course.price_thb) || !Number.isInteger(price) || price < 0 || price > 99999) throw profileError(400, `COURSE_${index + 1}_PRICE_INVALID`);
    return { name, duration_minutes: duration, price_thb: price };
  });
}

function defaultManifest() {
  return { version: 1, intro: "", profile_visibility: "hidden", courses: [], photos: [], public_photo_ids: [], updated_at: null };
}

async function loadManifest(therapistId, env) {
  let object;
  try { object = await env.MMS_PRIVATE_UPLOADS.get(manifestKey(therapistId)); }
  catch { throw profileError(503, "PROFILE_STORAGE_UNAVAILABLE"); }
  if (!object) return Object.defineProperty(defaultManifest(), MANIFEST_ETAG, { value: null });
  try {
    const parsed = JSON.parse(await object.text());
    // Corrupt existing data must not become an empty successful profile that a
    // later edit could overwrite. Reject it intact instead of silently slicing.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
      || !Array.isArray(parsed.courses) || !Array.isArray(parsed.photos) || !Array.isArray(parsed.public_photo_ids)
      || parsed.photos.length > MAX_PHOTOS || parsed.public_photo_ids.length > MAX_PUBLIC_PHOTOS
      || parsed.photos.some((photo) => !validStoredPhoto(photo) || photo.key !== photoKey(therapistId, photo.id))
      || new Set(parsed.photos.map((photo) => photo.id)).size !== parsed.photos.length
      || new Set(parsed.public_photo_ids).size !== parsed.public_photo_ids.length
      || parsed.public_photo_ids.some((id) => !parsed.photos.some((photo) => photo.id === id))) throw new Error("invalid manifest");
    const courses = validateCourses(parsed.courses);
    return Object.defineProperty({
      version: 1,
      write_id: clean(parsed.write_id, 80) || null,
      intro: clean(parsed.intro, 600),
      profile_visibility: parsed.profile_visibility === "public" ? "public" : "hidden",
      courses,
      photos: parsed.photos,
      public_photo_ids: parsed.public_photo_ids,
      updated_at: clean(parsed.updated_at, 80) || null,
    }, MANIFEST_ETAG, { value: object.etag || undefined });
  } catch { throw profileError(503, "PROFILE_STORAGE_CORRUPT"); }
}

function mutationPlan(current, before, next, kind, fields = {}) {
  if (before[MANIFEST_ETAG] === undefined) throw profileError(503, 'PROFILE_STORAGE_REVISION_REQUIRED');
  return { manifestChanged: JSON.stringify([before.intro,before.profile_visibility,before.courses,before.photos,before.public_photo_ids]) !== JSON.stringify([next.intro,next.profile_visibility,next.courses,next.photos,next.public_photo_ids]), owner: current.therapist_id, recordId: current.record_id, kind, fields, baseEtag: before[MANIFEST_ETAG], next: { ...next, write_id: crypto.randomUUID(), updated_at: new Date().toISOString() } };
}

async function persistProfilePlan(current, request, env, proposed, bytes) {
  const op = env[PROFILE_OPERATION_CONTEXT];
  if (!op.record.plan) await op.start(proposed);
  const plan = op.record.plan;
  if (plan.owner !== current.therapist_id || plan.recordId !== current.record_id) throw profileError(403, 'PROFILE_ACCOUNT_MISMATCH');
  // A recovered inflight Airtable PATCH has no operation-status/fencing API.
  // Neither elapsed time nor an equal readback can prove it will not apply later.
  // A terminal rejection can survive a crash before its receipt is committed.
  // It must never fall through to R2 persistence on recovery.
  if (op.record.phase === 'rejected') throw incompleteSave('rejected', 'not_attempted');
  if (!['prepared', 'airtable_saved', 'manifest_saved'].includes(op.record.phase)) throw profileError(503, 'PROFILE_OPERATION_UNCERTAIN');
  if (op.record.phase === 'prepared') {
    if (Object.keys(plan.fields).length) {
      await op.phase('airtable_inflight');
      let saved;
      try { saved = await updateTherapist(env, current.record_id, plan.fields); }
      catch (error) {
        if (error.write_state === 'rejected') {
          try { await op.reject(); }
          catch { // The provider rejection is known even if its journal acknowledgement is lost.
            throw incompleteSave('rejected', 'not_attempted');
          }
          throw incompleteSave('rejected', 'not_attempted');
        }
        await op.phase('airtable_unknown'); throw profileError(503, 'PROFILE_OPERATION_UNCERTAIN');
      }
      if (saved?.id !== current.record_id || Object.entries(plan.fields).some(([key, value]) => JSON.stringify(saved?.fields?.[key]) !== JSON.stringify(value))) {
        await op.phase('airtable_unknown'); throw profileError(503, 'PROFILE_OPERATION_UNCERTAIN');
      }
    }
    await op.phase('airtable_saved');
  }
  if (plan.fields['Display Name']) current.display_name = plan.fields['Display Name'];
  for (const field of ['Base Service Zone', 'Coverage Service Zones']) if (plan.fields[field]) current.fields[field] = plan.fields[field];
  if (plan.photo) {
    if (!bytes || await sha256Hex(bytes) !== plan.photo.content_sha256) throw profileError(409, 'PHOTO_UPLOAD_ID_REUSED');
    await ensurePhotoObject(current.therapist_id, plan.photo, bytes, env);
  }
  const storageKey = manifestKey(current.therapist_id), serialized = JSON.stringify(plan.next);
  if (op.record.phase !== 'manifest_saved') {
    try {
      if (plan.manifestChanged !== false) {
      const stored = await env.MMS_PRIVATE_UPLOADS.get(storageKey);
      const contents = stored ? await stored.text() : null;
      if (contents !== serialized) {
        if ((stored?.etag ?? null) !== plan.baseEtag) throw profileError(503, 'PROFILE_STORAGE_CONFLICT');
        const onlyIf = plan.baseEtag === null ? new Headers({ 'If-None-Match': '*' }) : { etagMatches: plan.baseEtag };
        const result = await env.MMS_PRIVATE_UPLOADS.put(storageKey, serialized, { onlyIf, httpMetadata: { contentType: 'application/json' } });
        if (!result?.etag) throw profileError(503, result === null ? 'PROFILE_STORAGE_CONFLICT' : 'PROFILE_STORAGE_UNAVAILABLE');
      }
      }
      await op.phase('manifest_saved');
    } catch (error) {
      if (error instanceof TherapistProfileError) throw error;
      throw plan.kind === 'profile' ? incompleteSave(Object.keys(plan.fields).length ? 'saved' : 'not_needed', 'unknown') : incompletePhotoSave(plan.photo ? 'saved' : 'preserved', 'unknown');
    }
  }
  if (plan.deletedPhoto) {
    try { await env.MMS_PRIVATE_UPLOADS.delete(photoKey(current.therapist_id, plan.deletedPhoto)); }
    catch { throw incompletePhotoSave('unknown', 'saved'); }
    return new Response(null, { status: 204, headers: responseHeaders(request, env) });
  }
  if (plan.photo) return json({ ok: true, data: photoView(current.therapist_id, plan.next, plan.photo) }, plan.status, request, env);
  let index = null;
  try { index = await loadMmsServiceZoneIndex(env); } catch { /* Existing zone-locking contract remains in force. */ }
  return json({ ok: true, data: safeProfile(current, plan.next, index, op.revision + 1) }, 200, request, env);
}

async function ensurePhotoObject(owner, photo, bytes, env) {
  async function verify(object) {
    if (!object || object.customMetadata?.therapist_id !== owner || object.customMetadata?.photo_id !== photo.id || object.customMetadata?.content_sha256 !== photo.content_sha256 || object.httpMetadata?.contentType !== photo.content_type || typeof object.arrayBuffer !== 'function' || await sha256Hex(new Uint8Array(await object.arrayBuffer())) !== photo.content_sha256) throw profileError(409, 'PHOTO_UPLOAD_ID_REUSED');
  }
  try {
    const existing = await env.MMS_PRIVATE_UPLOADS.get(photo.key);
    if (existing) { await verify(existing); return; }
    const result = await env.MMS_PRIVATE_UPLOADS.put(photo.key, bytes, {
      onlyIf: new Headers({ 'If-None-Match': '*' }), httpMetadata: { contentType: photo.content_type },
      customMetadata: { therapist_id: owner, photo_id: photo.id, file_name: photo.file_name, content_sha256: photo.content_sha256 },
    });
    if (result === null) await verify(await env.MMS_PRIVATE_UPLOADS.get(photo.key));
    else if (!result?.etag) throw profileError(503, 'PROFILE_STORAGE_UNAVAILABLE');
  } catch (error) {
    if (error instanceof TherapistProfileError) throw error;
    throw incompletePhotoSave('unknown', 'not_attempted');
  }
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
  for (const field of ["Therapist ID", "Display Name", "Availability Status", "Base Service Zone", "Coverage Service Zones", "Status", "Therapist Auth Status", "LINE Subject Hash", "MY MMS Access", "Matching Enabled", "Manual Review Only"]) url.searchParams.append("fields[]", field);
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
  if (!response.ok) {
    const error = profileError(503, "THERAPIST_PROFILE_UNAVAILABLE");
    // A status alone (notably 408 or an intermediary HTML error) cannot prove
    // an Airtable mutation was rejected before execution. Only recognize the
    // documented validation responses; all other failures remain uncertain.
    if (init.method === "PATCH" && response.status === 422 && String(response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase() === "application/json") {
      try {
        const body = await response.json();
        if (["UNKNOWN_FIELD_NAME", "INVALID_REQUEST_BODY"].includes(body?.error?.type)) error.write_state = "rejected";
      } catch { /* An unreadable validation response is still ambiguous. */ }
    }
    throw error;
  }
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
  if (!/^[a-f0-9]{64}$/.test(payload?.line_binding || "")) throw profileError(401, "THERAPIST_SESSION_INVALID");
  if (payload?.v !== SESSION_VERSION || payload?.role !== SESSION_ROLE) throw profileError(401, "THERAPIST_SESSION_INVALID");
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(therapistId)) throw profileError(401, "THERAPIST_SESSION_INVALID");
  if (!Number.isFinite(payload?.iat) || !Number.isFinite(payload?.exp)) throw profileError(401, "THERAPIST_SESSION_INVALID");
  if (payload.exp <= now || payload.iat > now + 300 || payload.exp - payload.iat > SESSION_TTL_SECONDS) throw profileError(401, "THERAPIST_SESSION_INVALID");
  return { therapist_id: therapistId, role: SESSION_ROLE, line_binding: payload.line_binding };
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
    headers["Access-Control-Allow-Headers"] = "Content-Type,X-File-Name,X-Upload-Id,X-Profile-Operation-Id,X-Profile-Revision,X-MMS-Therapist-Context";
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
function incompleteSave(airtable, profile) {
  const error = profileError(503, "PROFILE_SAVE_INCOMPLETE");
  error.save_state = { airtable, profile };
  return error;
}
function incompletePhotoSave(photo, profile) {
  const error = profileError(503, "PHOTO_SAVE_INCOMPLETE");
  error.save_state = { photo, profile };
  return error;
}

async function sha256Hex(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const therapistProfileContract = Object.freeze({
  prefix: PROFILE_PREFIX,
  limits: Object.freeze({ photos: MAX_PHOTOS, public_photos: MAX_PUBLIC_PHOTOS, courses: MAX_COURSES, photo_bytes: MAX_PHOTO_BYTES, coverage_zones: MAX_COVERAGE_ZONES, coverage_service_zones: MAX_COVERAGE_ZONES }),
  course_duration_minutes: Object.freeze({ min: 30, max: 360, step: 30 }),
});

// Internal binding-only helpers; these are not public HTTP endpoints.
export async function profileCoordinatorOwner(request, env) {
  const path = new URL(request.url).pathname;
  const publicMatch = path.match(/^\/male-massage\/therapists\/api\/auth\/profile\/public-photo\/([A-Za-z0-9_-]{4,80})\/ph_[A-Za-z0-9]{20,80}$/);
  const owner = publicMatch ? publicMatch[1] : (await requireCurrentTherapist(request, env)).therapist_id;
  if (!['GET','HEAD'].includes(request.method)) {
    requireTrustedOrigin(request,env);
    const expected=request.headers.get('X-MMS-Therapist-Context');
    if(expected!==null&&expected!==owner)throw profileError(409,'PROFILE_ACCOUNT_CHANGED');
  }
  return owner;
}
export async function resumeProfilePlan(request, env) {
  const current = await requireCurrentTherapist(request, env);
  return persistProfilePlan(current, request, env, env[PROFILE_OPERATION_CONTEXT].record.plan, new Uint8Array(await request.arrayBuffer()));
}
export async function profileDirectorySnapshot(id, env) {
  if (!env.MMS_THERAPIST_PROFILES?.getByName) throw profileError(503, "PROFILE_COORDINATOR_REQUIRED");
  const response = await env.MMS_THERAPIST_PROFILES.getByName(id).fetch(new Request(`https://profile.internal/directory/${encodeURIComponent(id)}`));
  if (!response.ok) throw profileError(503, "PROFILE_OPERATION_PENDING");
  return response.json();
}
export async function readProfileDirectoryInternal(id, env) {
  const record = await findUniqueTherapist(env, id), fields = record?.fields || {};
  if (fields['Therapist ID'] !== id) throw profileError(503, 'THERAPIST_IDENTITY_CONFLICT');
  return { manifest: await loadManifest(id, env), therapist: {
    therapist_id: id, display_name: clean(fields['Display Name'],120),
    active: fields.Status === 'Active' && fields['Therapist Auth Status'] === 'Active',
    approved: fields['MY MMS Access'] === 'Approved', line_linked: Boolean(fields['LINE Subject Hash']),
    matching_enabled: fields['Matching Enabled'] === true, manual_review_only: fields['Manual Review Only'] === true,
    availability_status: fields['Availability Status'], coverage_links: Array.isArray(fields['Coverage Service Zones']) ? fields['Coverage Service Zones'] : [],
  } };
}

export function profileProtocolProblem(status, code, request, env) { return json({ ok:false,error:{code} },status,request,env); }

export function profileProtocolHeaders(request, env) { return responseHeaders(request, env); }
