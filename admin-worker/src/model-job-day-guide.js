const STATUS_PATH = "/v1/model/profile/job-day-guide";
const ACK_PATH = "/v1/model/profile/job-day-guide/ack";
const COOKIE_NAME = "mmd_model_session_v1";
const MODELS_TABLE_DEFAULT = "Models";
const ACK_FIELD_DEFAULT = "job_day_guide_acknowledged_at";
const GUIDE_VERSION = "job-day-v1";
const GUIDE_URL = "https://mmdbkk.com/rules/model/private/job-day";

export const MODEL_JOB_DAY_GUIDE_STATUS_PATH = STATUS_PATH;
export const MODEL_JOB_DAY_GUIDE_ACK_PATH = ACK_PATH;
export const MODEL_JOB_DAY_GUIDE_VERSION = GUIDE_VERSION;

export function isModelJobDayGuideRequest(path = "") {
  const normalized = normalizePath(path);
  return normalized === STATUS_PATH || normalized === ACK_PATH;
}

export async function handleModelJobDayGuideRequest(request, env = {}) {
  const path = normalizePath(new URL(request.url).pathname);
  const method = request.method.toUpperCase();

  if (!isModelJobDayGuideRequest(path)) return null;

  if (method === "OPTIONS") {
    if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (!isAllowedOrigin(request, env)) {
    return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
  }

  if (path === STATUS_PATH && method !== "GET") {
    return json({ ok: false, error: "method_not_allowed" }, 405, request, env);
  }
  if (path === ACK_PATH && method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, request, env);
  }

  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);

  const model = await airtableGetRecord(env, modelsTable(env), auth.payload.model_record_id);
  if (!model.ok) {
    const error = model.status === 404 ? "model_not_found" : "model_lookup_unavailable";
    return json({ ok: false, error }, model.status || 503, request, env);
  }
  if (!isActiveModel(model.record?.fields || {}, env)) {
    return json({ ok: false, error: "model_not_active" }, 403, request, env);
  }

  const currentAck = readAcknowledgedAt(model.record?.fields || {}, env);
  if (path === STATUS_PATH) {
    return statusResponse(request, env, currentAck);
  }

  const body = await request.json().catch(() => null);
  if (!body || body.completed !== true) {
    return json({ ok: false, error: "job_day_guide_completion_required" }, 400, request, env);
  }
  if (body.guide_version !== undefined && clean(body.guide_version) !== GUIDE_VERSION) {
    return json({
      ok: false,
      error: "job_day_guide_version_mismatch",
      expected_guide_version: GUIDE_VERSION,
    }, 409, request, env);
  }

  // Idempotent: once the canonical model has acknowledged this guide, never
  // replace the original server timestamp with a browser-supplied or later value.
  if (currentAck) return statusResponse(request, env, currentAck);

  const acknowledgedAt = new Date().toISOString();
  const updated = await airtableUpdateRecord(
    env,
    modelsTable(env),
    auth.payload.model_record_id,
    { [ackField(env)]: acknowledgedAt },
    true,
  );
  if (!updated.ok) {
    return json({ ok: false, error: "job_day_guide_ack_write_failed" }, updated.status || 503, request, env);
  }

  const persistedAck = readAcknowledgedAt(updated.record?.fields || {}, env) || acknowledgedAt;
  return statusResponse(request, env, persistedAck);
}

function statusResponse(request, env, acknowledgedAt = "") {
  return json({
    ok: true,
    guide_version: GUIDE_VERSION,
    guide_url: GUIDE_URL,
    required: !acknowledgedAt,
    acknowledged_at: acknowledgedAt || null,
    authority: "models.job_day_guide_acknowledged_at",
  }, 200, request, env);
}

function readAcknowledgedAt(fields = {}, env = {}) {
  return firstText(fields, [ackField(env), ACK_FIELD_DEFAULT]);
}

function ackField(env = {}) {
  return clean(env.AT_MODELS__JOB_DAY_GUIDE_ACK) || ACK_FIELD_DEFAULT;
}

async function requireModelSession(request, env) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return { ok: false, status: 401, error: "model_session_required" };
  const verified = await verifySessionToken(token, env);
  if (!verified.ok) return verified;
  if (
    verified.payload.kind !== "model_session" ||
    verified.payload.role !== "model" ||
    !clean(verified.payload.model_record_id)
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

function isActiveModel(fields, env) {
  const status = firstText(fields, [env.AT_MODELS__STATUS, "status", "Status", "model_status", "Model Status"]);
  if (!status) return true;
  return !/inactive|disabled|suspended|blocked|archived|rejected|offboard/i.test(status);
}

async function airtableGetRecord(env, table, recordId) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`,
    { headers: { authorization: `Bearer ${apiKey}` } },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, status: 200, record: data };
}

async function airtableUpdateRecord(env, table, recordId, fields, typecast = false) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ records: [{ id: recordId, fields }], typecast }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: data };
  return { ok: true, status: 200, record: data.records?.[0] || null };
}

function modelsTable(env = {}) {
  return clean(env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT);
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
    "access-control-allow-methods": "GET, POST, OPTIONS",
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
  headers.set("x-mmd-job-day-guide", GUIDE_VERSION);
  return new Response(JSON.stringify(payload), { status, headers });
}

function readCookie(header, name) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies[name] || "";
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function firstText(fields, names) {
  for (const name of names) {
    if (!name) continue;
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) return clean(value[0]);
    if (value !== undefined && value !== null && clean(value)) return clean(value);
  }
  return "";
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
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

function clean(value) {
  return String(value ?? "").trim();
}
