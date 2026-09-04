import dashboardWorker from "./dashboard-worker.js";

export const MODEL_LOCATION_CAPABILITY_PATH = "/v1/model/location/capability";
export const MODEL_LOCATION_CURRENT_PATH = "/v1/model/location/current";
export const MODEL_LOCATION_INTERNAL_READ_PATH = "/__internal/model/location/current";

const COOKIE_NAME = "mmd_model_session_v1";
const MODELS_TABLE_DEFAULT = "Models";
const SESSIONS_TABLE_DEFAULT = "tblC98mKWbzmPuNzX";
const GPS_FIELD_DEFAULT = "gps_visibility_enabled";
const MAX_JSON_CHARS = 4_000;
const DEFAULT_RETENTION_SECONDS = 180;
const MIN_RETENTION_SECONDS = 60;
const MAX_RETENTION_SECONDS = 600;
const MAX_CAPTURE_AGE_MS = 5 * 60 * 1000;
const MAX_CAPTURE_FUTURE_MS = 60 * 1000;
const ACTIVE_SESSION_STATES = new Set([
  "confirmed",
  "accepted",
  "en_route",
  "traveling",
  "nearby",
  "arrived",
  "met_customer",
  "final_payment_pending",
  "final_payment_confirmed",
  "work_started",
  "work_finished",
]);
const ALLOWED_LOCATION_FIELDS = new Set(["lat", "lng", "accuracy_m", "captured_at"]);

export const modelLocationContract = Object.freeze({
  capability_path: MODEL_LOCATION_CAPABILITY_PATH,
  current_path: MODEL_LOCATION_CURRENT_PATH,
  internal_read_path: MODEL_LOCATION_INTERNAL_READ_PATH,
  permission_source: "/v1/model/settings/gps-visibility",
  default_ingest_enabled: false,
  active_job_only: true,
  audience: "private_customer",
  stores_history: false,
  storage: "durable_object_ephemeral_latest_only",
  retention_seconds_default: DEFAULT_RETENTION_SECONDS,
  retention_seconds_max: MAX_RETENTION_SECONDS,
  model_read_exposes_coordinates: false,
  customer_read_requires_internal_service_auth: true,
});

export function isModelLocationRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === MODEL_LOCATION_CAPABILITY_PATH || path === MODEL_LOCATION_CURRENT_PATH || path === MODEL_LOCATION_INTERNAL_READ_PATH;
}

export function normalizeModelLocationPoint(input, nowMs = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "invalid_json" };
  }

  const unsupported = Object.keys(input).filter((key) => !ALLOWED_LOCATION_FIELDS.has(key));
  if (unsupported.length) return { ok: false, error: "unsupported_fields", fields: unsupported };

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: "latitude_invalid" };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, error: "longitude_invalid" };

  let accuracyM = null;
  if (input.accuracy_m !== undefined && input.accuracy_m !== null && input.accuracy_m !== "") {
    accuracyM = Number(input.accuracy_m);
    if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 5000) {
      return { ok: false, error: "accuracy_invalid" };
    }
    accuracyM = Math.round(accuracyM * 10) / 10;
  }

  let capturedAtMs = nowMs;
  if (input.captured_at !== undefined && input.captured_at !== null && input.captured_at !== "") {
    capturedAtMs = Date.parse(String(input.captured_at));
    if (!Number.isFinite(capturedAtMs)) return { ok: false, error: "captured_at_invalid" };
    if (capturedAtMs < nowMs - MAX_CAPTURE_AGE_MS || capturedAtMs > nowMs + MAX_CAPTURE_FUTURE_MS) {
      return { ok: false, error: "captured_at_out_of_range" };
    }
  }

  return {
    ok: true,
    point: {
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      accuracy_m: accuracyM,
      captured_at: new Date(capturedAtMs).toISOString(),
    },
  };
}

export function modelLocationFeatureEnabled(env = {}) {
  return normalizeBool(env.MODEL_LOCATION_INGEST_ENABLED, false);
}

export function modelLocationCustomerReadEnabled(env = {}) {
  return normalizeBool(env.MODEL_LOCATION_CUSTOMER_READ_ENABLED, false);
}

export function modelLocationRetentionSeconds(env = {}) {
  return clampInt(env.MODEL_LOCATION_RETENTION_SECONDS, MIN_RETENTION_SECONDS, MAX_RETENTION_SECONDS, DEFAULT_RETENTION_SECONDS);
}

export async function handleModelLocationRequest(request, env = {}, ctx) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = String(request.method || "GET").toUpperCase();

  if (path === MODEL_LOCATION_INTERNAL_READ_PATH) {
    return handleInternalLocationRead(request, env);
  }

  if (path !== MODEL_LOCATION_CAPABILITY_PATH && path !== MODEL_LOCATION_CURRENT_PATH) {
    return json({ ok: false, error: "not_found" }, 404, request, env);
  }

  if (method === "OPTIONS") {
    if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (path === MODEL_LOCATION_CAPABILITY_PATH) {
    if (method !== "GET") return methodNotAllowed(request, env, "GET, OPTIONS");
    const context = await resolveModelLocationContext(request, env, ctx);
    if (!context.ok) return json({ ok: false, error: context.error }, context.status, request, env);
    return json({ ok: true, data: safeCapability(context, env) }, 200, request, env);
  }

  if (!["GET", "POST", "DELETE"].includes(method)) {
    return methodNotAllowed(request, env, "GET, POST, DELETE, OPTIONS");
  }

  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);

  if ((method === "POST" || method === "DELETE") && !isAllowedOrigin(request, env)) {
    return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
  }

  if (method === "DELETE") {
    await clearStoredModelLocation(env, auth.payload.model_record_id);
    return json({ ok: true, data: { sharing: false, cleared: true } }, 200, request, env);
  }

  const context = await resolveModelLocationContext(request, env, ctx, auth);
  if (!context.ok) return json({ ok: false, error: context.error }, context.status, request, env);

  if (method === "GET") {
    if (!context.permission_enabled || !context.active_job) {
      await clearStoredModelLocation(env, auth.payload.model_record_id);
      return json({ ok: true, data: safeCurrentMetadata(null, context, env) }, 200, request, env);
    }
    const stored = await readStoredModelLocation(env, auth.payload.model_record_id);
    const valid = stored && stored.session_id === context.session_id ? stored : null;
    if (stored && !valid) await clearStoredModelLocation(env, auth.payload.model_record_id);
    return json({ ok: true, data: safeCurrentMetadata(valid, context, env) }, 200, request, env);
  }

  if (!context.permission_enabled) return json({ ok: false, error: "gps_visibility_off" }, 403, request, env);
  if (!context.active_job || !context.session_id) return json({ ok: false, error: "active_job_required" }, 409, request, env);
  if (!modelLocationFeatureEnabled(env)) return json({ ok: false, error: "model_location_ingest_disabled" }, 503, request, env);
  if (!hasLocationCoordinator(env)) return json({ ok: false, error: "model_location_storage_not_ready" }, 503, request, env);

  const body = await readJson(request);
  const normalized = normalizeModelLocationPoint(body);
  if (!normalized.ok) {
    return json({ ok: false, error: normalized.error, ...(normalized.fields ? { fields: normalized.fields } : {}) }, 400, request, env);
  }

  const now = Date.now();
  const retentionSeconds = modelLocationRetentionSeconds(env);
  const stored = {
    version: 1,
    model_record_id: auth.payload.model_record_id,
    session_id: context.session_id,
    lat: normalized.point.lat,
    lng: normalized.point.lng,
    accuracy_m: normalized.point.accuracy_m,
    captured_at: normalized.point.captured_at,
    received_at: new Date(now).toISOString(),
    expires_at: new Date(now + retentionSeconds * 1000).toISOString(),
  };

  await writeStoredModelLocation(env, auth.payload.model_record_id, stored);
  return json({ ok: true, data: safeCurrentMetadata(stored, context, env) }, 200, request, env);
}

export class ModelLocationCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = String(request.method || "GET").toUpperCase();

    if (path === "/write" && method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || !body.model_record_id || !body.session_id || !body.expires_at) {
        return doJson({ ok: false, error: "invalid_payload" }, 400);
      }
      await this.state.storage.put("current", body);
      const alarmAt = Date.parse(body.expires_at);
      if (Number.isFinite(alarmAt)) await this.state.storage.setAlarm(alarmAt);
      return doJson({ ok: true }, 200);
    }

    if (path === "/read" && method === "GET") {
      const current = await this.state.storage.get("current");
      if (!current) return doJson({ ok: true, data: null }, 200);
      const expiresAt = Date.parse(current.expires_at || "");
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        await this.state.storage.delete("current");
        return doJson({ ok: true, data: null }, 200);
      }
      return doJson({ ok: true, data: current }, 200);
    }

    if (path === "/clear" && method === "POST") {
      await this.state.storage.delete("current");
      return doJson({ ok: true }, 200);
    }

    return doJson({ ok: false, error: "not_found" }, 404);
  }

  async alarm() {
    await this.state.storage.delete("current");
  }
}

export async function clearStoredModelLocation(env, modelRecordId) {
  const id = clean(modelRecordId);
  if (!id || !hasLocationCoordinator(env)) return false;
  const stub = locationStub(env, id);
  const response = await stub.fetch("https://model-location.internal/clear", { method: "POST" });
  return response.ok;
}

export async function readStoredModelLocation(env, modelRecordId) {
  const id = clean(modelRecordId);
  if (!id || !hasLocationCoordinator(env)) return null;
  const stub = locationStub(env, id);
  const response = await stub.fetch("https://model-location.internal/read", { method: "GET" });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.data || null;
}

async function writeStoredModelLocation(env, modelRecordId, payload) {
  const stub = locationStub(env, modelRecordId);
  const response = await stub.fetch("https://model-location.internal/write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("MODEL_LOCATION_STORAGE_WRITE_FAILED");
}

async function handleInternalLocationRead(request, env) {
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "POST") return internalJson({ ok: false, error: "method_not_allowed" }, 405, { allow: "POST" });
  if (!modelLocationCustomerReadEnabled(env)) return internalJson({ ok: false, error: "model_location_customer_read_disabled" }, 503);

  const expected = clean(env.AUTH_SERVICE_MEMBER_TO_ADMIN);
  if (!expected) return internalJson({ ok: false, error: "model_location_service_auth_not_ready" }, 503);
  const supplied = clean(request.headers.get("X-Internal-Token"));
  if (!supplied || !constantTimeEqual(supplied, expected)) return internalJson({ ok: false, error: "unauthorized" }, 401);

  const body = await readJson(request);
  const modelRecordId = clean(body?.model_record_id);
  const sessionId = clean(body?.session_id);
  if (!/^rec[A-Za-z0-9]+$/.test(modelRecordId) || !sessionId) {
    return internalJson({ ok: false, error: "model_location_read_context_invalid" }, 400);
  }

  const gate = await resolveServerSideReadGate(env, modelRecordId, sessionId);
  if (!gate.ok) return internalJson({ ok: false, error: gate.error }, gate.status);

  const stored = await readStoredModelLocation(env, modelRecordId);
  if (!stored || stored.session_id !== sessionId) return internalJson({ ok: true, data: null }, 200);

  return internalJson({
    ok: true,
    data: {
      session_id: stored.session_id,
      lat: stored.lat,
      lng: stored.lng,
      accuracy_m: stored.accuracy_m,
      captured_at: stored.captured_at,
      received_at: stored.received_at,
      expires_at: stored.expires_at,
      visibility: "private_customer",
    },
  }, 200);
}

async function resolveModelLocationContext(request, env, ctx, providedAuth = null) {
  const auth = providedAuth || await requireModelSession(request, env);
  if (!auth.ok) return auth;

  const permission = await readModelPermission(env, auth.payload.model_record_id);
  if (!permission.ok) return permission;

  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  const currentUrl = new URL("/v1/model/session/current", request.url);
  currentUrl.searchParams.set("t", token);
  const currentRequest = new Request(currentUrl.toString(), { method: "GET", headers: request.headers });
  const currentResponse = await dashboardWorker.fetch(currentRequest, env, ctx);
  const current = await currentResponse.clone().json().catch(() => ({}));

  let session = null;
  if (currentResponse.ok && current?.session && typeof current.session === "object") session = current.session;
  const sessionId = clean(session?.session_id);
  return {
    ok: true,
    status: 200,
    auth,
    permission_enabled: permission.enabled,
    active_job: Boolean(sessionId),
    session_id: sessionId,
    session_state: clean(session?.state || session?.status),
  };
}

async function resolveServerSideReadGate(env, modelRecordId, sessionId) {
  const permission = await readModelPermission(env, modelRecordId);
  if (!permission.ok) return permission;
  if (!permission.enabled) return { ok: false, status: 403, error: "gps_visibility_off" };

  const active = await sessionIsActiveForModel(env, modelRecordId, sessionId);
  if (!active.ok) return active;
  if (!active.active) return { ok: false, status: 409, error: "active_job_required" };
  return { ok: true, status: 200 };
}

async function readModelPermission(env, modelRecordId) {
  const model = await airtableGetRecord(env, clean(env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT), modelRecordId);
  if (!model.ok) return { ok: false, status: model.status === 404 ? 404 : 503, error: model.status === 404 ? "model_not_found" : "model_lookup_unavailable" };
  const fields = model.record?.fields || {};
  if (!isActiveModel(fields, env)) return { ok: false, status: 403, error: "model_not_active" };
  return { ok: true, status: 200, enabled: fields[gpsField(env)] === true };
}

async function sessionIsActiveForModel(env, modelRecordId, sessionId) {
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || SESSIONS_TABLE_DEFAULT);
  const assignedField = clean(env.AT_SESSIONS__MODEL_RECORD_ID || "Assigned Model");
  const sessionIdField = clean(env.AT_SESSIONS__SESSION_ID || "session_id");
  const formula = `AND({${sessionIdField}}="${escapeFormula(sessionId)}",FIND("${escapeFormula(modelRecordId)}",ARRAYJOIN({${assignedField}})))`;
  const listed = await airtableList(env, table, formula, 1);
  if (!listed.ok) return { ok: false, status: 503, error: "session_lookup_unavailable" };
  const record = listed.records[0];
  if (!record) return { ok: true, status: 200, active: false };
  const state = firstText(record.fields || {}, unique([env.AT_SESSIONS__STATE, env.AT_SESSIONS__STATUS, "session_state", "status"].map(clean).filter(Boolean))).toLowerCase();
  return { ok: true, status: 200, active: !state || ACTIVE_SESSION_STATES.has(state) };
}

function safeCapability(context, env) {
  const ingestEnabled = modelLocationFeatureEnabled(env);
  return {
    gps_visibility_enabled: context.permission_enabled === true,
    active_job: context.active_job === true,
    session_id: context.active_job ? context.session_id : null,
    ingest_enabled: ingestEnabled,
    can_request_device_location: ingestEnabled && context.permission_enabled === true && context.active_job === true,
    active_job_only: true,
    visibility: "private_customer",
    retention_seconds: modelLocationRetentionSeconds(env),
    stores_history: false,
  };
}

function safeCurrentMetadata(stored, context, env) {
  return {
    sharing: Boolean(stored),
    gps_visibility_enabled: context.permission_enabled === true,
    active_job: context.active_job === true,
    session_id: context.active_job ? context.session_id : null,
    last_update_at: stored?.received_at || null,
    captured_at: stored?.captured_at || null,
    expires_at: stored?.expires_at || null,
    accuracy_m: stored?.accuracy_m ?? null,
    coordinates_exposed_to_model: false,
    visibility: "private_customer",
    retention_seconds: modelLocationRetentionSeconds(env),
    stores_history: false,
  };
}

async function requireModelSession(request, env) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return { ok: false, status: 401, error: "model_session_required" };
  const verified = await verifySessionToken(token, env);
  if (!verified.ok) return verified;
  if (verified.payload?.kind !== "model_session" || verified.payload?.role !== "model" || !clean(verified.payload?.model_record_id)) {
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
  const expected = await hmacHex(encoded, secret);
  if (!constantTimeEqual(suppliedSignature, expected)) return { ok: false, status: 401, error: "model_session_invalid" };
  let payload;
  try { payload = JSON.parse(base64UrlDecode(encoded)); } catch { return { ok: false, status: 401, error: "model_session_invalid" }; }
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return { ok: false, status: 401, error: "model_session_expired" };
  return { ok: true, status: 200, payload };
}

async function airtableGetRecord(env, table, recordId) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, status: 200, record: data };
}

async function airtableList(env, table, formula, pageSize = 10) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, records: [] };
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (formula) params.set("filterByFormula", formula);
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, records: [] };
  return { ok: true, status: 200, records: Array.isArray(data.records) ? data.records : [] };
}

function hasLocationCoordinator(env) {
  return Boolean(env.MODEL_LOCATION_COORDINATOR?.idFromName && env.MODEL_LOCATION_COORDINATOR?.get);
}

function locationStub(env, modelRecordId) {
  const id = env.MODEL_LOCATION_COORDINATOR.idFromName(`model:${modelRecordId}`);
  return env.MODEL_LOCATION_COORDINATOR.get(id);
}

function gpsField(env) {
  return clean(env.AT_MODELS__GPS_VISIBILITY_ENABLED || GPS_FIELD_DEFAULT);
}

function isActiveModel(fields, env) {
  const status = firstText(fields, [env.AT_MODELS__STATUS, "status", "Status", "model_status", "Model Status"]);
  if (!status) return true;
  return !/inactive|disabled|suspended|blocked|archived|rejected|offboard/i.test(status);
}

async function readJson(request) {
  let text;
  try { text = await request.text(); } catch { return null; }
  if (!text || text.length > MAX_JSON_CHARS) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return "";
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

function unique(values) { return [...new Set(values)]; }
function escapeFormula(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function clean(value) { return String(value ?? "").trim(); }
function normalizePath(pathname = "") { const path = String(pathname || "/").replace(/\/{2,}/g, "/"); return path.length > 1 ? path.replace(/\/+$/g, "") : path; }
function normalizeBool(value, fallback) { const text = clean(value).toLowerCase(); if (["1", "true", "yes", "on"].includes(text)) return true; if (["0", "false", "no", "off"].includes(text)) return false; return fallback; }
function clampInt(value, min, max, fallback) { const number = Number.parseInt(value, 10); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function base64UrlDecode(value) { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4); const binary = atob(padded); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); return new TextDecoder().decode(bytes); }
function constantTimeEqual(a, b) { const left = clean(a); const right = clean(b); if (left.length !== right.length) return false; let diff = 0; for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; }

function isAllowedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return true;
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(clean).filter(Boolean));
  return allowed.has(origin);
}

function corsHeaders(request, env) {
  const origin = clean(request.headers.get("origin"));
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function methodNotAllowed(request, env, allow) {
  const response = json({ ok: false, error: "method_not_allowed" }, 405, request, env);
  response.headers.set("allow", allow);
  return response;
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

function internalJson(payload, status, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function doJson(payload, status) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
