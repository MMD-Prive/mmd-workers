const GPS_VISIBILITY_PATH = "/v1/model/settings/gps-visibility";
const COOKIE_NAME = "mmd_model_session_v1";
const MODELS_TABLE_DEFAULT = "Models";
const GPS_FIELD_DEFAULT = "gps_visibility_enabled";
const MAX_JSON_CHARS = 4_000;
const ALLOWED_PATCH_FIELDS = new Set(["enabled"]);
const COORDINATE_FIELDS = new Set([
  "lat",
  "lng",
  "lon",
  "latitude",
  "longitude",
  "coords",
  "coordinates",
  "position",
  "location",
  "gps_position",
]);

export const MODEL_GPS_VISIBILITY_PATH = GPS_VISIBILITY_PATH;

export const modelGpsVisibilityContract = Object.freeze({
  path: GPS_VISIBILITY_PATH,
  default_enabled: false,
  active_job_only: true,
  visibility: "private_customer",
  stores_coordinates: false,
  requests_device_location: false,
});

export function isModelGpsVisibilityRequest(pathname = "") {
  return normalizePath(pathname) === GPS_VISIBILITY_PATH;
}

export function normalizeModelGpsVisibilityPatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "invalid_json" };
  }

  const keys = Object.keys(input);
  const coordinateKey = keys.find((key) => COORDINATE_FIELDS.has(normalizeWord(key)));
  if (coordinateKey) {
    return { ok: false, error: "gps_coordinates_not_accepted" };
  }

  const unsupported = keys.filter((key) => !ALLOWED_PATCH_FIELDS.has(key));
  if (unsupported.length) {
    return { ok: false, error: "unsupported_fields", fields: unsupported };
  }

  if (typeof input.enabled !== "boolean") {
    return { ok: false, error: "gps_visibility_invalid" };
  }

  return { ok: true, enabled: input.enabled };
}

export async function handleModelGpsVisibilityRequest(request, env = {}) {
  const path = normalizePath(new URL(request.url).pathname);
  const method = String(request.method || "GET").toUpperCase();

  if (path !== GPS_VISIBILITY_PATH) {
    return json({ ok: false, error: "not_found" }, 404, request, env);
  }

  if (method === "OPTIONS") {
    if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (method !== "GET" && method !== "PATCH") {
    const response = json({ ok: false, error: "method_not_allowed" }, 405, request, env);
    response.headers.set("allow", "GET, PATCH, OPTIONS");
    return response;
  }

  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);

  const model = await airtableGetModel(env, auth.payload.model_record_id);
  if (!model.ok) {
    return json({ ok: false, error: model.status === 404 ? "model_not_found" : "model_lookup_unavailable" }, model.status, request, env);
  }
  if (!isActiveModel(model.record?.fields || {}, env)) {
    return json({ ok: false, error: "model_not_active" }, 403, request, env);
  }

  if (method === "GET") {
    return json({ ok: true, data: safeSetting(model.record?.fields || {}, env) }, 200, request, env);
  }

  if (!isAllowedOrigin(request, env)) {
    return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
  }

  const body = await readJson(request);
  const normalized = normalizeModelGpsVisibilityPatch(body);
  if (!normalized.ok) {
    return json({
      ok: false,
      error: normalized.error,
      ...(normalized.fields ? { fields: normalized.fields } : {}),
    }, 400, request, env);
  }

  const updated = await airtableUpdateModel(env, auth.payload.model_record_id, {
    [gpsField(env)]: normalized.enabled,
  });
  if (!updated.ok) {
    return json({ ok: false, error: "gps_visibility_update_failed" }, updated.status, request, env);
  }

  // Turning visibility OFF is also a purge signal. If the short-lived location
  // coordinator exists, delete its current point immediately. This never makes
  // the permission endpoint accept or store coordinates.
  if (normalized.enabled === false) {
    await clearEphemeralLocation(env, auth.payload.model_record_id);
  }

  return json({ ok: true, data: safeSetting(updated.record?.fields || {}, env) }, 200, request, env);
}

function safeSetting(fields, env) {
  const enabled = fields?.[gpsField(env)] === true;
  return {
    enabled,
    active_job_only: true,
    visibility: "private_customer",
    stores_coordinates: false,
    requests_device_location: false,
    permission: enabled ? "allow_during_active_job" : "deny",
  };
}

async function requireModelSession(request, env) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return { ok: false, status: 401, error: "model_session_required" };
  const verified = await verifySessionToken(token, env);
  if (!verified.ok) return verified;
  if (
    verified.payload?.kind !== "model_session" ||
    verified.payload?.role !== "model" ||
    !clean(verified.payload?.model_record_id)
  ) {
    return { ok: false, status: 403, error: "model_session_invalid" };
  }
  return verified;
}

async function verifySessionToken(token, env) {
  const value = clean(token);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { ok: false, status: 401, error: "model_session_invalid" };

  const encoded = value.slice(0, dot);
  const suppliedSignature = value.slice(dot + 1);
  const secret = clean(env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) return { ok: false, status: 503, error: "signing_not_ready" };

  const expectedSignature = await hmacHex(encoded, secret);
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
    return { ok: false, status: 401, error: "model_session_invalid" };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded));
  } catch {
    return { ok: false, status: 401, error: "model_session_invalid" };
  }

  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, status: 401, error: "model_session_expired" };
  }
  return { ok: true, status: 200, payload };
}

async function airtableGetModel(env, recordId) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const table = clean(env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };

  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`,
    { headers: { authorization: `Bearer ${apiKey}` } },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, status: 200, record: data };
}

async function airtableUpdateModel(env, recordId, fields) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const table = clean(env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };

  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast: false }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, status: 200, record: data.records?.[0] || null };
}

function isActiveModel(fields, env) {
  const candidates = [env.AT_MODELS__STATUS, "status", "Status", "model_status", "Model Status"];
  let status = "";
  for (const field of candidates) {
    if (!field) continue;
    const value = clean(fields?.[field]);
    if (value) {
      status = value;
      break;
    }
  }
  if (!status) return true;
  return !/inactive|disabled|suspended|blocked|archived|rejected|offboard/i.test(status);
}

async function readJson(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (!text || text.length > MAX_JSON_CHARS) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function clearEphemeralLocation(env, modelRecordId) {
  const namespace = env.MODEL_LOCATION_COORDINATOR;
  const recordId = clean(modelRecordId);
  if (!recordId || !namespace?.idFromName || !namespace?.get) return false;
  try {
    const id = namespace.idFromName(`model:${recordId}`);
    const response = await namespace.get(id).fetch("https://model-location.internal/clear", { method: "POST" });
    return response.ok;
  } catch {
    // Permission OFF is authoritative even if the ephemeral purge path is
    // temporarily unavailable; the location read/ingest gates still fail closed.
    return false;
  }
}

function gpsField(env) {
  return clean(env.AT_MODELS__GPS_VISIBILITY_ENABLED || GPS_FIELD_DEFAULT);
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(a, b) {
  const left = clean(a);
  const right = clean(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function normalizeWord(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
}

function clean(value) {
  return String(value ?? "").trim();
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
    "access-control-allow-methods": "GET, PATCH, OPTIONS",
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
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  return new Response(JSON.stringify(payload), { status, headers });
}
