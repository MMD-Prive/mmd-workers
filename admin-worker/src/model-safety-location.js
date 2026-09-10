import dashboardWorker from "./dashboard-worker.js";

export const ADMIN_SAFETY_LOCATION_PATH = "/studio/api/model/location/safety-check";
export const MODEL_LOCATION_CAPABILITY_PATH = "/v1/model/location/capability";
export const MODEL_LOCATION_CURRENT_PATH = "/v1/model/location/current";

const COOKIE_NAME = "mmd_model_session_v1";
const SESSIONS_TABLE_DEFAULT = "tblC98mKWbzmPuNzX";
const ACCESS_LOG_TABLE_DEFAULT = "System — Access Log";
const MAX_JSON_CHARS = 8_000;
const POINT_TTL_SECONDS = 180;
const ACTIVE_SESSION_STATES = new Set([
  "confirmed", "accepted", "en_route", "traveling", "nearby", "arrived",
  "met_customer", "final_payment_pending", "final_payment_confirmed",
  "work_started", "work_finished",
]);
const REASON_CODES = new Set([
  "model_unreachable",
  "arrival_disputed",
  "separation_disputed",
  "session_integrity",
  "safety_incident",
  "model_requested_help",
]);
const DURATIONS = new Set([15, 30, 60]);
const OWNER_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);
const LOCATION_FIELDS = new Set(["lat", "lng", "accuracy_m", "captured_at"]);

export const modelSafetyLocationContract = Object.freeze({
  admin_path: ADMIN_SAFETY_LOCATION_PATH,
  model_capability_path: MODEL_LOCATION_CAPABILITY_PATH,
  model_current_path: `${MODEL_LOCATION_CURRENT_PATH}?mode=safety`,
  default_active: false,
  active_job_only: true,
  durations_minutes: [15, 30, 60],
  reason_codes: [...REASON_CODES],
  visibility: "internal_safety_only",
  stores_history: false,
  point_retention_seconds: POINT_TTL_SECONDS,
  os_permission_required: true,
  customer_readable: false,
});

export function isAdminSafetyLocationRequest(requestOrPath) {
  const path = typeof requestOrPath === "string"
    ? normalizePath(requestOrPath)
    : normalizePath(new URL(requestOrPath.url).pathname);
  return path === ADMIN_SAFETY_LOCATION_PATH;
}

export function isModelSafetyLocationCurrentRequest(request) {
  const url = new URL(request.url);
  return normalizePath(url.pathname) === MODEL_LOCATION_CURRENT_PATH && normalizeCode(url.searchParams.get("mode")) === "safety";
}

export async function augmentModelLocationCapability(request, env = {}, ctx, next) {
  const base = await next.fetch(request, env, ctx);
  if (request.method.toUpperCase() !== "GET" || !base.ok) return base;

  const payload = await base.clone().json().catch(() => null);
  if (!payload?.ok || !payload?.data) return base;

  const context = await resolveModelContext(request, env, ctx);
  if (!context.ok) return base;
  const control = await readSafetyControl(env, context.model_record_id);
  const active = context.active_job && validControl(control, context.session_id);
  if (!active && control) await clearSafetyPoint(env, context.model_record_id);

  return replaceJson(base, {
    ...payload,
    data: {
      ...payload.data,
      safety: safeSafetyCapability(active ? control : null, context),
    },
  });
}

export async function handleModelSafetyLocationCurrent(request, env = {}, ctx) {
  if (!isModelSafetyLocationCurrentRequest(request)) return json({ ok: false, error: "not_found" }, 404);
  const method = request.method.toUpperCase();
  if (!["GET", "POST", "DELETE"].includes(method)) return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "GET, POST, DELETE" });

  const context = await resolveModelContext(request, env, ctx);
  if (!context.ok) return json({ ok: false, error: context.error }, context.status);

  if (method === "DELETE") {
    await clearSafetyPoint(env, context.model_record_id);
    return json({ ok: true, data: { sharing: false, cleared: true, visibility: "internal_safety_only" } });
  }

  const control = await readSafetyControl(env, context.model_record_id);
  const active = context.active_job && validControl(control, context.session_id);
  if (!active) {
    await clearSafetyPoint(env, context.model_record_id);
    if (method === "POST") return json({ ok: false, error: context.active_job ? "safety_location_check_not_active" : "active_job_required" }, 409);
    return json({ ok: true, data: safeModelPointMetadata(null, null, context) });
  }

  if (method === "GET") {
    const point = await readSafetyPoint(env, context.model_record_id);
    const validPoint = validSafetyPoint(point, control, context.session_id) ? point : null;
    if (point && !validPoint) await clearSafetyPoint(env, context.model_record_id);
    return json({ ok: true, data: safeModelPointMetadata(validPoint, control, context) });
  }

  const body = await readJson(request);
  const normalized = normalizeSafetyLocationPoint(body);
  if (!normalized.ok) return json({ ok: false, error: normalized.error, ...(normalized.fields ? { fields: normalized.fields } : {}) }, 400);

  const now = Date.now();
  const controlExpiry = Date.parse(control.expires_at || "");
  const expiresMs = Math.min(now + POINT_TTL_SECONDS * 1000, Number.isFinite(controlExpiry) ? controlExpiry : now + POINT_TTL_SECONDS * 1000);
  if (expiresMs <= now) return json({ ok: false, error: "safety_location_check_expired" }, 409);

  const point = {
    version: 1,
    source: "mmd_safety_location_check",
    visibility: "internal_safety_only",
    check_id: control.check_id,
    model_record_id: context.model_record_id,
    session_id: context.session_id,
    ...normalized.point,
    received_at: new Date(now).toISOString(),
    expires_at: new Date(expiresMs).toISOString(),
  };
  await writeDoCurrent(env, safetyPointKey(context.model_record_id), point);
  return json({ ok: true, data: safeModelPointMetadata(point, control, context) }, 201);
}

export async function handleAdminSafetyLocationRequest(request, env = {}, actor = null) {
  if (!isAdminSafetyLocationRequest(request)) return json({ ok: false, error: "not_found" }, 404);
  const role = normalizeCode(actor?.role);
  const actorId = clean(actor?.id, 160);
  if (!actorId || !OWNER_ROLES.has(role)) return json({ ok: false, error: "owner_admin_required" }, actorId ? 403 : 401);

  const method = request.method.toUpperCase();
  if (!["GET", "POST", "DELETE"].includes(method)) return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "GET, POST, DELETE" });

  const url = new URL(request.url);
  const body = method === "POST" || method === "DELETE" ? await readJson(request) : null;
  const sessionId = clean(body?.session_id || url.searchParams.get("session_id"), 200);
  if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);

  const session = await resolveAdminSession(env, sessionId);
  if (!session.ok) return json({ ok: false, error: session.error }, session.status);

  if (method === "GET") {
    const control = await readSafetyControl(env, session.model_record_id);
    const active = session.active && validControl(control, sessionId);
    if (!active && control) await clearSafetyPoint(env, session.model_record_id);
    const candidate = active ? await readSafetyPoint(env, session.model_record_id) : null;
    const point = active && validSafetyPoint(candidate, control, sessionId) ? candidate : null;
    if (candidate && !point) await clearSafetyPoint(env, session.model_record_id);
    if (point) {
      try {
        await writeAudit(env, {
          action: "model_safety_location_read",
          actor: actorId,
          session_id: sessionId,
          model_record_id: session.model_record_id,
          reason_code: control.reason_code,
          check_id: control.check_id,
          session_state: session.state,
          started_at: control.started_at,
          expires_at: control.expires_at,
        });
      } catch {
        return json({ ok: false, error: "safety_location_read_audit_required" }, 503);
      }
    }
    return json({ ok: true, data: adminSnapshot(session, active ? control : null, point) });
  }

  if (method === "DELETE" || normalizeCode(body?.action) === "stop") {
    const control = await readSafetyControl(env, session.model_record_id);
    const suppliedCheckId = clean(body?.check_id, 200);
    if (suppliedCheckId && control?.check_id && suppliedCheckId !== control.check_id) return json({ ok: false, error: "safety_check_id_mismatch" }, 409);
    await Promise.all([
      clearDoCurrent(env, safetyControlKey(session.model_record_id)),
      clearSafetyPoint(env, session.model_record_id),
    ]);
    let audit = null;
    try {
      audit = await writeAudit(env, {
        action: "model_safety_location_check_stopped",
        actor: actorId,
        session_id: sessionId,
        model_record_id: session.model_record_id,
        reason_code: normalizeCode(body?.reason_code) || "manual_stop",
        check_id: control?.check_id || suppliedCheckId || null,
        session_state: session.state,
        expires_at: control?.expires_at || null,
      });
    } catch {
      return json({ ok: false, error: "safety_location_stopped_audit_failed", stopped: true }, 503);
    }
    return json({ ok: true, stopped: true, audit_event_id: audit.event_id, data: adminSnapshot(session, null, null) });
  }

  if (!session.active) return json({ ok: false, error: "active_job_required" }, 409);
  const reasonCode = normalizeCode(body?.reason_code);
  if (!REASON_CODES.has(reasonCode)) return json({ ok: false, error: "safety_reason_code_invalid", allowed_reason_codes: [...REASON_CODES] }, 400);
  const durationMinutes = Number(body?.duration_minutes ?? 15);
  if (!DURATIONS.has(durationMinutes)) return json({ ok: false, error: "safety_duration_invalid", allowed_minutes: [...DURATIONS] }, 400);
  const note = clean(body?.note, 600);

  const existing = await readSafetyControl(env, session.model_record_id);
  if (validControl(existing, sessionId)) return json({ ok: false, error: "safety_location_check_already_active", check_id: existing.check_id, expires_at: existing.expires_at }, 409);

  const now = Date.now();
  const control = {
    version: 1,
    source: "mmd_safety_location_check",
    visibility: "internal_safety_only",
    status: "active",
    check_id: `slc_${crypto.randomUUID()}`,
    model_record_id: session.model_record_id,
    session_id: sessionId,
    reason_code: reasonCode,
    requested_by: actorId,
    started_at: new Date(now).toISOString(),
    expires_at: new Date(now + durationMinutes * 60_000).toISOString(),
    duration_minutes: durationMinutes,
  };

  await clearSafetyPoint(env, session.model_record_id);
  await writeDoCurrent(env, safetyControlKey(session.model_record_id), control);
  let audit;
  try {
    audit = await writeAudit(env, {
      action: "model_safety_location_check_started",
      actor: actorId,
      session_id: sessionId,
      model_record_id: session.model_record_id,
      reason_code: reasonCode,
      note,
      check_id: control.check_id,
      session_state: session.state,
      duration_minutes: durationMinutes,
      started_at: control.started_at,
      expires_at: control.expires_at,
    });
  } catch {
    await Promise.all([
      clearDoCurrent(env, safetyControlKey(session.model_record_id)),
      clearSafetyPoint(env, session.model_record_id),
    ]);
    return json({ ok: false, error: "safety_location_audit_required" }, 503);
  }

  return json({ ok: true, audit_event_id: audit.event_id, data: adminSnapshot(session, control, null) }, 201);
}

function safeSafetyCapability(control, context) {
  return {
    supported: true,
    active: Boolean(control),
    capture_required: Boolean(control && context.active_job && context.session_id && control.session_id === context.session_id),
    check_id: control?.check_id || null,
    expires_at: control?.expires_at || null,
    visibility: "internal_safety_only",
    reason_exposed_to_model: false,
    stores_history: false,
    os_permission_required: true,
    point_retention_seconds: POINT_TTL_SECONDS,
  };
}

function safeModelPointMetadata(point, control, context) {
  return {
    sharing: Boolean(point),
    safety_check_active: Boolean(control && context.active_job),
    session_id: context.session_id || null,
    check_id: control?.check_id || null,
    last_update_at: point?.received_at || null,
    captured_at: point?.captured_at || null,
    expires_at: point?.expires_at || control?.expires_at || null,
    accuracy_m: point?.accuracy_m ?? null,
    coordinates_exposed_to_model: false,
    visibility: "internal_safety_only",
    stores_history: false,
  };
}

function adminSnapshot(session, control, point) {
  return {
    session_id: session.session_id,
    model_record_id: session.model_record_id,
    session_state: session.state || null,
    active_job: session.active,
    safety_check: control ? {
      active: true,
      check_id: control.check_id,
      reason_code: control.reason_code,
      requested_by: control.requested_by,
      started_at: control.started_at,
      expires_at: control.expires_at,
      duration_minutes: control.duration_minutes,
    } : { active: false },
    location: point ? {
      lat: point.lat,
      lng: point.lng,
      accuracy_m: point.accuracy_m,
      captured_at: point.captured_at,
      received_at: point.received_at,
      expires_at: point.expires_at,
      visibility: "internal_safety_only",
    } : null,
    stores_history: false,
  };
}

async function resolveModelContext(request, env, ctx) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return auth;
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  const currentUrl = new URL("/v1/model/session/current", request.url);
  currentUrl.searchParams.set("t", token);
  const currentRequest = new Request(currentUrl.toString(), { method: "GET", headers: request.headers });
  const response = await dashboardWorker.fetch(currentRequest, env, ctx);
  const payload = await response.clone().json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status || 503, error: clean(payload?.error, 200) || "session_lookup_failed" };
  const session = payload?.session && typeof payload.session === "object" ? payload.session : null;
  const sessionId = clean(session?.session_id, 200);
  const sessionState = clean(session?.state || session?.status, 120).toLowerCase();
  const activeJob = Boolean(sessionId) && (!sessionState || ACTIVE_SESSION_STATES.has(sessionState));
  return {
    ok: true,
    status: 200,
    model_record_id: clean(auth.payload.model_record_id, 100),
    session_id: sessionId,
    session_state: sessionState,
    active_job: activeJob,
  };
}

async function resolveAdminSession(env, sessionId) {
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || SESSIONS_TABLE_DEFAULT, 120);
  const sessionIdField = clean(env.AT_SESSIONS__SESSION_ID || "session_id", 120);
  const assignedField = clean(env.AT_SESSIONS__MODEL_RECORD_ID || "Assigned Model", 120);
  const formula = `{${sessionIdField}}="${escapeFormula(sessionId)}"`;
  const listed = await airtableList(env, table, formula, 2);
  if (!listed.ok) return { ok: false, status: 503, error: "session_lookup_unavailable" };
  if (listed.records.length > 1) return { ok: false, status: 409, error: "session_id_ambiguous" };
  const record = listed.records[0];
  if (!record) return { ok: false, status: 404, error: "session_not_found" };
  const modelRecordId = linkedRecordId(record.fields?.[assignedField]);
  if (!modelRecordId) return { ok: false, status: 409, error: "session_model_not_linked" };
  const state = firstText(record.fields || {}, unique([env.AT_SESSIONS__STATE, env.AT_SESSIONS__STATUS, "session_state", "status"].map((v) => clean(v, 120)).filter(Boolean))).toLowerCase();
  return { ok: true, status: 200, session_id: sessionId, model_record_id: modelRecordId, state, active: !state || ACTIVE_SESSION_STATES.has(state) };
}

export function normalizeSafetyLocationPoint(input, nowMs = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "invalid_json" };
  const unsupported = Object.keys(input).filter((key) => !LOCATION_FIELDS.has(key));
  if (unsupported.length) return { ok: false, error: "unsupported_fields", fields: unsupported };
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: "latitude_invalid" };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, error: "longitude_invalid" };
  let accuracyM = null;
  if (input.accuracy_m != null && input.accuracy_m !== "") {
    accuracyM = Number(input.accuracy_m);
    if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 5000) return { ok: false, error: "accuracy_invalid" };
    accuracyM = Math.round(accuracyM * 10) / 10;
  }
  let capturedAtMs = nowMs;
  if (input.captured_at != null && input.captured_at !== "") {
    capturedAtMs = Date.parse(String(input.captured_at));
    if (!Number.isFinite(capturedAtMs)) return { ok: false, error: "captured_at_invalid" };
    if (capturedAtMs < nowMs - 5 * 60_000 || capturedAtMs > nowMs + 60_000) return { ok: false, error: "captured_at_out_of_range" };
  }
  return { ok: true, point: { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, accuracy_m: accuracyM, captured_at: new Date(capturedAtMs).toISOString() } };
}

async function requireModelSession(request, env) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return { ok: false, status: 401, error: "model_session_required" };
  const verified = await verifySessionToken(token, env);
  if (!verified.ok) return verified;
  if (verified.payload?.kind !== "model_session" || verified.payload?.role !== "model" || !clean(verified.payload?.model_record_id, 100)) return { ok: false, status: 403, error: "model_session_invalid" };
  return verified;
}

async function verifySessionToken(token, env) {
  const value = clean(token, 12000);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { ok: false, status: 401, error: "model_session_invalid" };
  const encoded = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  const secret = clean(env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN, 5000);
  if (!secret) return { ok: false, status: 503, error: "signing_not_ready" };
  const expected = await hmacHex(encoded, secret);
  if (!constantTimeEqual(supplied, expected)) return { ok: false, status: 401, error: "model_session_invalid" };
  let payload;
  try { payload = JSON.parse(base64UrlDecode(encoded)); } catch { return { ok: false, status: 401, error: "model_session_invalid" }; }
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return { ok: false, status: 401, error: "model_session_expired" };
  return { ok: true, status: 200, payload };
}

function validControl(control, sessionId) {
  if (!control || control.status !== "active" || control.visibility !== "internal_safety_only") return false;
  if (!sessionId || clean(control.session_id, 200) !== clean(sessionId, 200)) return false;
  const expires = Date.parse(control.expires_at || "");
  return Number.isFinite(expires) && expires > Date.now();
}

function validSafetyPoint(point, control, sessionId) {
  if (!point || !control) return false;
  if (point.visibility !== "internal_safety_only" || point.source !== "mmd_safety_location_check") return false;
  if (point.check_id !== control.check_id || point.session_id !== sessionId) return false;
  const expires = Date.parse(point.expires_at || "");
  return Number.isFinite(expires) && expires > Date.now();
}

async function readSafetyControl(env, modelRecordId) { return readDoCurrent(env, safetyControlKey(modelRecordId)); }
async function readSafetyPoint(env, modelRecordId) { return readDoCurrent(env, safetyPointKey(modelRecordId)); }
async function clearSafetyPoint(env, modelRecordId) { return clearDoCurrent(env, safetyPointKey(modelRecordId)); }
function safetyControlKey(modelRecordId) { return `safety-control:model:${modelRecordId}`; }
function safetyPointKey(modelRecordId) { return `safety-point:model:${modelRecordId}`; }

function coordinatorStub(env, key) {
  if (!env.MODEL_LOCATION_COORDINATOR?.idFromName || !env.MODEL_LOCATION_COORDINATOR?.get) throw new Error("model_location_storage_not_ready");
  return env.MODEL_LOCATION_COORDINATOR.get(env.MODEL_LOCATION_COORDINATOR.idFromName(key));
}

async function readDoCurrent(env, key) {
  const response = await coordinatorStub(env, key).fetch("https://model-location.internal/read", { method: "GET" });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.data || null;
}
async function writeDoCurrent(env, key, data) {
  const response = await coordinatorStub(env, key).fetch("https://model-location.internal/write", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error("model_location_storage_write_failed");
}
async function clearDoCurrent(env, key) {
  try {
    const response = await coordinatorStub(env, key).fetch("https://model-location.internal/clear", { method: "POST" });
    return response.ok;
  } catch { return false; }
}

async function writeAudit(env, input) {
  const eventId = `mmdsl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const fields = compact({
    "Identity Ref": `model:${clean(input.model_record_id, 100)}`,
    Action: clean(input.action, 120),
    Target: "model_location_safety",
    Result: "success",
    "Event ID": eventId,
    "Created At (ISO)": new Date().toISOString(),
    "Source Ref": `session:${clean(input.session_id, 200)}`,
    Reason: clean(input.reason_code, 120),
    "Before JSON": boundedJson({ session_state: clean(input.session_state, 120), note: clean(input.note, 600) || null }),
    "After JSON": boundedJson({ check_id: clean(input.check_id, 200) || null, duration_minutes: input.duration_minutes ?? null, started_at: clean(input.started_at, 120) || null, expires_at: clean(input.expires_at, 120) || null, visibility: "internal_safety_only", stores_history: false }),
    Actor: clean(input.actor, 160),
  });
  const table = clean(env.AIRTABLE_TABLE_ACCESS_LOG || ACCESS_LOG_TABLE_DEFAULT, 160);
  const response = await airtableFetch(env, new Request(airtableUrl(env, table).toString(), {
    method: "POST",
    headers: { authorization: `Bearer ${clean(env.AIRTABLE_API_KEY, 5000)}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.records?.[0]?.id) throw new Error("safety_location_audit_write_failed");
  return { event_id: eventId, record_id: data.records[0].id };
}

async function airtableList(env, table, formula, pageSize = 2) {
  if (!clean(env.AIRTABLE_API_KEY, 5000) || !clean(env.AIRTABLE_BASE_ID, 100)) return { ok: false, records: [] };
  const url = airtableUrl(env, table);
  url.searchParams.set("pageSize", String(pageSize));
  if (formula) url.searchParams.set("filterByFormula", formula);
  const response = await airtableFetch(env, new Request(url.toString(), { headers: { authorization: `Bearer ${clean(env.AIRTABLE_API_KEY, 5000)}` } }));
  const data = await response.json().catch(() => ({}));
  return response.ok && Array.isArray(data.records) ? { ok: true, records: data.records } : { ok: false, records: [] };
}
function airtableUrl(env, table) { return new URL(`https://api.airtable.com/v0/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID, 100))}/${encodeURIComponent(table)}`); }
async function airtableFetch(env, request) { return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request); }

function linkedRecordId(value) {
  const list = Array.isArray(value) ? value : [value];
  for (const item of list) {
    const match = clean(item, 300).match(/rec[A-Za-z0-9]+/);
    if (match) return match[0];
  }
  return "";
}
function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    const value = part.slice(i + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return "";
}
function firstText(fields, names) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) return clean(value[0], 200);
    if (value != null && clean(value, 200)) return clean(value, 200);
  }
  return "";
}
function unique(values) { return [...new Set(values)]; }
function escapeFormula(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function normalizeCode(value) { return clean(value, 120).toLowerCase().replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, ""); }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== "")); }
function boundedJson(value) { const text = JSON.stringify(value ?? {}); return text.length <= 8000 ? text : text.slice(0, 7997) + "..."; }
function clean(value, max = 5000) { return String(value ?? "").trim().slice(0, max); }
function normalizePath(pathname) { const path = String(pathname || "/").replace(/\/{2,}/g, "/"); return path.length > 1 ? path.replace(/\/+$/g, "") : path; }
async function readJson(request) { let text; try { text = await request.text(); } catch { return null; } if (!text || text.length > MAX_JSON_CHARS) return null; try { const value = JSON.parse(text); return value && typeof value === "object" && !Array.isArray(value) ? value : null; } catch { return null; } }

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function base64UrlDecode(value) { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4); const binary = atob(padded); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }
function constantTimeEqual(a, b) { const left = clean(a); const right = clean(b); if (left.length !== right.length) return false; let diff = 0; for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; }

function replaceJson(response, payload) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}
function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-content-type-options": "nosniff", ...extraHeaders } });
}
