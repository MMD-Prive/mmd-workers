import baseWorker from "./admin-login-hero-worker.js";
export { KenjiKnowledgeCoordinator } from "./admin-login-hero-worker.js";

const PROFILE_PATH = "/v1/model/profile";
const MEDIA_PATH = "/v1/model/media";
const MEDIA_UPLOAD_PATH = "/v1/model/media/upload";
const SESSION_ACTION_PATH = "/v1/model/session/action";
const SESSION_CURRENT_PATH = "/v1/model/session/current";
const COOKIE_NAME = "mmd_model_session_v1";
const MEDIA_TABLE_DEFAULT = "tblrpQXhHnbTU9RhW";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const PUBLIC_SELF_MANAGED_TYPES = new Set(["profile_photo", "public_gallery", "intro_video"]);
const LIFF_PUBLIC_UPLOAD_TYPES = new Set(["profile_photo", "public_gallery"]);
const PER_APPROVAL_TYPES = new Set(["private_gallery", "flash_preview"]);
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const PROFILE_LANGUAGES = new Set(["thai", "english"]);
const AIRTABLE_API = "https://api.airtable.com/v0";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (path === PROFILE_PATH && method === "GET") {
      return filterProfileResponse(await baseWorker.fetch(request, env, ctx), request, env);
    }

    if (path === PROFILE_PATH && method === "PATCH") {
      const validation = await validateProfilePatch(request);
      if (!validation.ok) return json(validation.payload, validation.status, request, env);
      return filterProfileResponse(await baseWorker.fetch(request, env, ctx), request, env);
    }

    if (path === MEDIA_PATH && method === "GET") return handleMediaList(request, env);
    if (path === MEDIA_UPLOAD_PATH && method === "POST") return handleMediaUpload(request, env);

    const mediaRoute = parseMediaRoute(path);
    if (mediaRoute?.action === "set-main" && method === "POST") {
      return handleMediaSetMain(request, env, mediaRoute.mediaId);
    }
    if (mediaRoute?.action === "delete" && method === "DELETE") {
      return handleMediaDelete(request, env, mediaRoute.mediaId);
    }

    if (path === SESSION_ACTION_PATH && method === "POST") {
      const body = await request.clone().json().catch(() => ({}));
      if (normalizeWord(body?.action) === "send_eta") return handleSendEta(request, env, ctx, body);
    }

    return baseWorker.fetch(request, env, ctx);
  },
};

export function modelMediaPolicy(fields = {}) {
  const mediaType = normalizeWord(fields.media_type);
  const role = normalizeWord(fields.asset_role);
  const visibility = normalizeWord(fields.media_visibility);

  if (PER_APPROVAL_TYPES.has(mediaType) || /(^|_)private(_|$)|flash|sensitive/.test(`${role} ${visibility}`)) {
    return {
      self_managed: false,
      requires_per_approval: true,
      policy: "per_approved_private",
    };
  }

  if (PUBLIC_SELF_MANAGED_TYPES.has(mediaType)) {
    return {
      self_managed: true,
      requires_per_approval: false,
      policy: "model_self_managed_public",
    };
  }

  return {
    self_managed: false,
    requires_per_approval: true,
    policy: "per_approved_private",
  };
}

export function normalizeProfileLanguages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    const value = normalizeWord(raw);
    const canonical = value === "th" ? "thai" : value === "en" ? "english" : value;
    if (PROFILE_LANGUAGES.has(canonical) && !out.includes(canonical)) out.push(canonical);
  }
  return out;
}

export function normalizeEtaMinutes(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 240 ? number : 0;
}

async function validateProfilePatch(request) {
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object") return { ok: true };
  if (!Object.prototype.hasOwnProperty.call(body, "languages")) return { ok: true };
  if (!Array.isArray(body.languages)) {
    return { ok: false, status: 400, payload: { ok: false, error: "validation_failed", fields: ["languages_invalid"] } };
  }
  const normalized = body.languages.map((value) => normalizeWord(value));
  if (normalized.some((value) => !PROFILE_LANGUAGES.has(value))) {
    return {
      ok: false,
      status: 400,
      payload: { ok: false, error: "validation_failed", fields: ["languages_invalid"], allowed: ["thai", "english"] },
    };
  }
  return { ok: true };
}

async function filterProfileResponse(response, request, env) {
  const contentType = clean(response.headers.get("content-type"));
  if (!contentType.includes("application/json")) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== "object") return response;
  if (data.model && typeof data.model === "object") {
    data.model.languages = normalizeProfileLanguages(data.model.languages);
    const auth = await requireModelSession(request, env);
    if (auth.ok) {
      const main = await findOwnedMainMedia(env, auth.payload.model_record_id);
      if (main?.media_id) data.model.current_profile_image_url = `${MEDIA_PATH}/${encodeURIComponent(main.media_id)}/file`;
    }
  }
  return copyJsonResponse(response, data, request, env);
}

async function handleSendEta(request, env, ctx, body) {
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);

  const etaMinutes = normalizeEtaMinutes(body?.eta_minutes);
  if (!etaMinutes) return json({ ok: false, error: "eta_minutes_invalid", min: 1, max: 240 }, 400, request, env);

  const currentRequest = new Request(new URL(SESSION_CURRENT_PATH, request.url), {
    method: "GET",
    headers: request.headers,
  });
  const currentResponse = await baseWorker.fetch(currentRequest, env, ctx);
  const current = await currentResponse.clone().json().catch(() => ({}));
  if (!currentResponse.ok) return copyJsonResponse(currentResponse, current, request, env);

  const session = current?.session || {};
  const allowed = Array.isArray(session.allowed_actions) ? session.allowed_actions.map(normalizeWord) : [];
  if (!allowed.includes("send_eta")) return json({ ok: false, error: "invalid_transition" }, 409, request, env);
  const sessionId = clean(session.session_id || auth.payload.session_id);
  if (!sessionId) return json({ ok: false, error: "active_session_not_found" }, 404, request, env);

  if (!env.EVENTS_WORKER || typeof env.EVENTS_WORKER.fetch !== "function") {
    return json({ ok: false, error: "eta_service_not_ready" }, 503, request, env);
  }
  const serviceToken = clean(env.AUTH_SERVICE_ADMIN_TO_EVENTS || env.CONFIRM_KEY);
  if (!serviceToken) return json({ ok: false, error: "eta_service_auth_not_ready" }, 503, request, env);

  const upstream = await env.EVENTS_WORKER.fetch(new Request("https://events-worker.internal/__internal/model/session/eta", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Token": serviceToken,
    },
    body: JSON.stringify({
      session_id: sessionId,
      eta_minutes: etaMinutes,
      model_record_id: clean(auth.payload.model_record_id),
      source: "model_liff",
    }),
  }));
  const eta = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ ok: false, error: eta.error || "eta_update_failed", detail: eta }, upstream.status, request, env);

  return json({
    ok: true,
    session,
    eta: {
      owner: "events-worker",
      eta_minutes: etaMinutes,
      updated_at: eta.eta_updated_at || null,
    },
  }, 200, request, env);
}

async function handleMediaList(request, env) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);

  const formula = `FIND("${escapeFormula(auth.payload.model_record_id)}", ARRAYJOIN({Model}))`;
  const result = await airtableList(env, mediaTable(env), formula, 100);
  if (!result.ok) return json({ ok: false, error: "media_lookup_unavailable" }, 503, request, env);
  return json({ ok: true, media: result.records.map(safeMediaRecord) }, 200, request, env);
}

async function handleMediaUpload(request, env) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.put !== "function") {
    return json({ ok: false, error: "media_storage_unavailable" }, 503, request, env);
  }

  const contentType = clean(request.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("multipart/form-data")) return json({ ok: false, error: "multipart_required" }, 415, request, env);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ ok: false, error: "invalid_multipart" }, 400, request, env);

  const mediaType = normalizeWord(form.get("media_type"));
  if (PER_APPROVAL_TYPES.has(mediaType)) {
    return json({ ok: false, error: "per_approval_required", policy: "per_approved_private" }, 403, request, env);
  }
  if (!LIFF_PUBLIC_UPLOAD_TYPES.has(mediaType)) return json({ ok: false, error: "media_type_invalid" }, 400, request, env);

  const file = form.get("file");
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    return json({ ok: false, error: "file_required" }, 400, request, env);
  }
  const mime = clean(file.type).toLowerCase();
  const size = Number(file.size || 0);
  if (!IMAGE_MIMES.has(mime)) return json({ ok: false, error: "file_type_not_allowed" }, 415, request, env);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    return json({ ok: false, error: "file_size_invalid", max_bytes: MAX_IMAGE_BYTES }, 413, request, env);
  }

  const mediaId = `media_${crypto.randomUUID().replace(/-/g, "")}`;
  const objectKey = `models/${auth.payload.model_record_id}/${mediaType}/${mediaId}.${imageExtension(mime)}`;
  const uploadedAt = new Date().toISOString();

  try {
    await env.MMD_MODEL_ASSETS.put(objectKey, file.stream(), {
      httpMetadata: { contentType: mime },
      customMetadata: {
        media_id: mediaId,
        model_record_id: auth.payload.model_record_id,
        media_type: mediaType,
        policy: "model_self_managed_public",
      },
    });
  } catch {
    return json({ ok: false, error: "media_storage_write_failed" }, 503, request, env);
  }

  const created = await airtableCreateRecord(env, mediaTable(env), {
    media_id: mediaId,
    Model: [auth.payload.model_record_id],
    media_type: mediaType,
    media_visibility: "public_candidate",
    asset_role: mediaType === "profile_photo" ? "profile_candidate" : "gallery_candidate",
    review_status: "active",
    public_safe: true,
    private_safe: false,
    flash_safe: false,
    file_name: clean(file.name).slice(0, 180) || `${mediaId}.${imageExtension(mime)}`,
    file_type: mime,
    file_size_bytes: size,
    r2_bucket: "mmd-models",
    private_original_key: objectKey,
    uploaded_at: uploadedAt,
  }, true);
  if (!created.ok) {
    await env.MMD_MODEL_ASSETS.delete(objectKey).catch(() => {});
    return json({ ok: false, error: "media_registry_write_failed" }, created.status, request, env);
  }

  return json({
    ok: true,
    media: safeMediaRecord(created.record),
    policy: "model_self_managed_public",
    review_required: false,
  }, 201, request, env);
}

async function handleMediaSetMain(request, env, mediaId) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const media = await findOwnedMedia(env, auth.payload.model_record_id, mediaId);
  if (!media.ok) return json({ ok: false, error: media.error }, media.status, request, env);
  const policy = modelMediaPolicy(media.record.fields || {});
  if (!policy.self_managed) return json({ ok: false, error: "per_approval_required", policy: policy.policy }, 403, request, env);

  const all = await listOwnedMedia(env, auth.payload.model_record_id);
  if (!all.ok) return json({ ok: false, error: "media_lookup_unavailable" }, 503, request, env);
  for (const record of all.records) {
    if (record.id === media.record.id) continue;
    if (normalizeWord(record.fields?.asset_role) !== "profile_main") continue;
    const otherPolicy = modelMediaPolicy(record.fields || {});
    if (!otherPolicy.self_managed) continue;
    await airtableUpdateRecord(env, mediaTable(env), record.id, {
      asset_role: normalizeWord(record.fields?.media_type) === "profile_photo" ? "profile_candidate" : "gallery_candidate",
    }, true);
  }

  const updated = await airtableUpdateRecord(env, mediaTable(env), media.record.id, {
    asset_role: "profile_main",
    review_status: "active",
    public_safe: true,
    media_visibility: "public_candidate",
  }, true);
  if (!updated.ok) return json({ ok: false, error: "media_registry_write_failed" }, updated.status, request, env);

  return json({
    ok: true,
    status: "active",
    media: safeMediaRecord(updated.record),
    policy: "model_self_managed_public",
    review_required: false,
  }, 200, request, env);
}

async function handleMediaDelete(request, env, mediaId) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const media = await findOwnedMedia(env, auth.payload.model_record_id, mediaId);
  if (!media.ok) return json({ ok: false, error: media.error }, media.status, request, env);
  const policy = modelMediaPolicy(media.record.fields || {});
  if (!policy.self_managed) return json({ ok: false, error: "per_approval_required", policy: policy.policy }, 403, request, env);

  const key = clean(media.record.fields?.private_original_key);
  const deleted = await airtableDeleteRecord(env, mediaTable(env), media.record.id);
  if (!deleted.ok) return json({ ok: false, error: "media_registry_delete_failed" }, deleted.status, request, env);
  if (key && env.MMD_MODEL_ASSETS && typeof env.MMD_MODEL_ASSETS.delete === "function") {
    await env.MMD_MODEL_ASSETS.delete(key).catch(() => {});
  }
  return json({ ok: true, media_id: mediaId, policy: "model_self_managed_public" }, 200, request, env);
}

function safeMediaRecord(record) {
  const fields = record?.fields || {};
  const mediaId = firstText(fields, ["media_id"]);
  const policy = modelMediaPolicy(fields);
  const actualStatus = clean(fields.review_status) || (policy.self_managed ? "active" : "pending_review");
  return {
    media_id: mediaId,
    media_type: clean(fields.media_type),
    asset_role: clean(fields.asset_role),
    review_status: actualStatus,
    file_name: clean(fields.file_name),
    file_type: clean(fields.file_type),
    file_size_bytes: finiteOrNull(fields.file_size_bytes),
    uploaded_at: clean(fields.uploaded_at),
    preview_url: mediaId ? `${MEDIA_PATH}/${encodeURIComponent(mediaId)}/file` : "",
    can_delete: policy.self_managed,
    can_request_main: policy.self_managed && Boolean(mediaId),
    self_managed: policy.self_managed,
    requires_per_approval: policy.requires_per_approval,
    policy: policy.policy,
    main_action: policy.self_managed ? "set_main" : "request_per_approval",
  };
}

async function findOwnedMainMedia(env, modelRecordId) {
  const formula = `AND(FIND("${escapeFormula(modelRecordId)}",ARRAYJOIN({Model})),{asset_role}="profile_main")`;
  const result = await airtableList(env, mediaTable(env), formula, 10);
  if (!result.ok) return null;
  const record = result.records.find((item) => modelMediaPolicy(item.fields || {}).self_managed);
  if (!record) return null;
  return { media_id: firstText(record.fields || {}, ["media_id"]) };
}

async function listOwnedMedia(env, modelRecordId) {
  const formula = `FIND("${escapeFormula(modelRecordId)}",ARRAYJOIN({Model}))`;
  return airtableList(env, mediaTable(env), formula, 100);
}

async function findOwnedMedia(env, modelRecordId, mediaId) {
  const id = clean(mediaId);
  if (!/^media_[A-Za-z0-9-]+$/.test(id)) return { ok: false, status: 400, error: "media_id_invalid" };
  const formula = `AND({media_id}="${escapeFormula(id)}",FIND("${escapeFormula(modelRecordId)}",ARRAYJOIN({Model})))`;
  const result = await airtableList(env, mediaTable(env), formula, 1);
  if (!result.ok) return { ok: false, status: 503, error: "media_lookup_unavailable" };
  if (!result.records[0]) return { ok: false, status: 404, error: "media_not_found" };
  return { ok: true, status: 200, record: result.records[0] };
}

function parseMediaRoute(path) {
  const prefix = `${MEDIA_PATH}/`;
  if (!path.startsWith(prefix)) return null;
  const parts = path.slice(prefix.length).split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const action = parts[1];
  if (!["file", "set-main", "delete"].includes(action)) return null;
  return { mediaId: decodeURIComponent(parts[0]), action };
}

async function requireModelSession(request, env) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return { ok: false, status: 401, error: "model_session_required" };
  const verified = await verifySessionToken(token, env);
  if (!verified.ok) return verified;
  if (verified.payload.kind !== "model_session" || verified.payload.role !== "model" || !clean(verified.payload.model_record_id)) {
    return { ok: false, status: 403, error: "model_session_invalid" };
  }
  return verified;
}

async function verifySessionToken(token, env) {
  const value = clean(token);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { ok: false, status: 401, error: "model_session_invalid" };
  const encoded = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  const secret = clean(env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) return { ok: false, status: 503, error: "signing_not_ready" };
  const expected = await hmacHex(encoded, secret);
  if (!constantTimeEqual(expected, supplied)) return { ok: false, status: 401, error: "model_session_invalid" };

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded));
  } catch {
    return { ok: false, status: 401, error: "model_session_invalid" };
  }
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return { ok: false, status: 401, error: "model_session_expired" };
  return { ok: true, status: 200, payload };
}

async function airtableList(env, table, formula, pageSize) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503, records: [] };
  const params = new URLSearchParams();
  params.set("pageSize", String(pageSize || 10));
  if (formula) params.set("filterByFormula", formula);
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, records: [] };
  return { ok: true, status: 200, records: Array.isArray(data.records) ? data.records : [] };
}

async function airtableCreateRecord(env, table, fields, typecast = false) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503 };
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: data };
  return { ok: true, status: 201, record: data.records?.[0] || null };
}

async function airtableUpdateRecord(env, table, recordId, fields, typecast = false) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: data };
  return { ok: true, status: 200, record: data.records?.[0] || null };
}

async function airtableDeleteRecord(env, table, recordId) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  return response.ok ? { ok: true, status: 200 } : { ok: false, status: response.status };
}

function mediaTable(env) {
  return clean(env.AIRTABLE_TABLE_MODEL_MEDIA || MEDIA_TABLE_DEFAULT);
}

function imageExtension(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  return "jpg";
}

function firstText(fields, names) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) return clean(value[0]);
    if (value !== undefined && value !== null && clean(value)) return clean(value);
  }
  return "";
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeWord(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
}

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isAllowedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return true;
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(clean).filter(Boolean));
  return allowed.has(origin);
}

function corsHeaders(request, env) {
  const origin = clean(request.headers.get("origin"));
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(payload, status, request, env) {
  const headers = corsHeaders(request, env);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}

function copyJsonResponse(source, payload, request, env) {
  const headers = new Headers(source.headers);
  const cors = corsHeaders(request, env);
  cors.forEach((value, key) => headers.set(key, value));
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status: source.status, headers });
}

function parseCookieHeader(header = "") {
  const result = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(value); }
    catch { result[key] = value; }
  }
  return result;
}

function readCookie(header, name) {
  return parseCookieHeader(header)[name] || "";
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  const left = clean(a);
  const right = clean(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function clean(value) {
  return String(value ?? "").trim();
}
