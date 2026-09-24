const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE = "Sessions";
const DEFAULT_JOBS_TABLE = "Jobs";
const SESSION_PATH = "/api/member/app/session/";
const TERMINAL = new Set(["completed", "cancelled", "canceled"]);
const ETA_EVENT = "eta_update";
const ETA_MAX_MINUTES = 240;
const MAX_EVENTS_JSON_LENGTH = 64_000;
const DISPLAYABLE = new Set([
  "pending_confirmation", "confirmed", "preparing", "en_route", "nearby",
  "arrived", "met_customer", "in_progress", "completed", "cancelled",
]);

export function isMemberAppSessionPath(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const path = normalizePath(url.pathname);
  return path === `${SESSION_PATH}current`
    || path === `${SESSION_PATH}context`
    || path === `${SESSION_PATH}ack`;
}

export async function handleMemberAppSessionApi(request, env = {}, readSession) {
  const path = normalizePath(new URL(request.url).pathname);
  const allowed = path === `${SESSION_PATH}ack` ? "POST" : "GET";
  if (request.method !== allowed) return jsonError(405, "METHOD_NOT_ALLOWED", `${allowed} required.`, { allow: allowed });

  const identity = await readSession(request, env);
  if (!identity?.lineUserId) return jsonError(401, "MEMBER_SESSION_REQUIRED", "Open MY MMD through LINE and sign in again.");

  if (path === `${SESSION_PATH}current`) {
    const record = await findCurrentOwnedSession(env, identity);
    return record ? json(await projectSession(record, env)) : new Response(null, { status: 204, headers: noStoreHeaders() });
  }

  if (path === `${SESSION_PATH}context`) {
    const token = clean(new URL(request.url).searchParams.get("t"), 4096);
    if (!token) return json({ valid: false, session: null });
    const context = await verifyCustomerToken(request, env, token);
    const sessionId = contextSessionId(context);
    if (!sessionId) return json({ valid: false, session: null });
    const record = await findOwnedSessionById(env, identity, sessionId);
    return record ? json({ valid: true, session: await projectSession(record, env) }) : json({ valid: false, session: null });
  }

  const body = await request.json().catch(() => null);
  const requestedId = clean(body?.session_id, 160);
  const token = clean(body?.t, 4096);
  if (!requestedId) return jsonError(400, "SESSION_ID_REQUIRED", "session_id is required.");

  if (token) {
    const context = await verifyCustomerToken(request, env, token);
    if (contextSessionId(context) !== requestedId) return jsonError(403, "SESSION_TOKEN_MISMATCH", "Session credential does not match this session.");
  }

  const record = await findOwnedSessionById(env, identity, requestedId);
  if (!record) return jsonError(404, "SESSION_NOT_FOUND", "Session is unavailable.");
  const projected = await projectSession(record, env);
  if (!projected.acknowledgement.customerAckAllowed) {
    return jsonError(409, "CUSTOMER_ACK_NOT_ALLOWED", "Customer acknowledgement is not available.");
  }

  await patchSession(env, record.id, { customer_ack_at: new Date().toISOString() });
  const refreshed = await findOwnedSessionById(env, identity, requestedId);
  if (!refreshed) return jsonError(502, "SESSION_REFRESH_FAILED", "Session could not be refreshed.");
  return json(await projectSession(refreshed, env));
}

async function findCurrentOwnedSession(env, identity) {
  const records = await listOwnedSessions(env, identity);
  const today = new Date().toISOString().slice(0, 10);
  const candidates = records.filter((record) => {
    const lifecycle = lifecycleOf(record.fields);
    const date = dateOnly(record.fields?.job_date || record.fields?.["Session Date"]);
    return !TERMINAL.has(lifecycle) && (!date || date >= today);
  });
  candidates.sort((a, b) => {
    const ad = dateOnly(a.fields?.job_date || a.fields?.["Session Date"]) || "9999-12-31";
    const bd = dateOnly(b.fields?.job_date || b.fields?.["Session Date"]) || "9999-12-31";
    return ad.localeCompare(bd) || String(a.createdTime || "").localeCompare(String(b.createdTime || ""));
  });
  return candidates[0] || null;
}

async function findOwnedSessionById(env, identity, sessionId) {
  const records = await airtableList(env, {
    filterByFormula: `{session_id}=${formulaString(sessionId)}`,
    maxRecords: 2,
  });
  if (records.length !== 1) return null;
  return owns(records[0], identity) ? records[0] : null;
}

async function listOwnedSessions(env, identity) {
  const clauses = [`{line_user_id}=${formulaString(identity.lineUserId)}`];
  if (identity.memberId) clauses.push(`{member_id}=${formulaString(identity.memberId)}`);
  const records = await airtableList(env, {
    filterByFormula: clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`,
    maxRecords: 100,
  });
  return records.filter((record) => owns(record, identity));
}

function owns(record, identity) {
  const fields = record?.fields || {};
  const line = clean(fields.line_user_id, 160);
  const member = clean(linkValue(fields.member_id), 160);
  if (line && line !== identity.lineUserId) return false;
  if (member && identity.memberId && member !== identity.memberId) return false;
  return line === identity.lineUserId || Boolean(member && identity.memberId && member === identity.memberId);
}

async function projectSession(record, env) {
  const fields = record?.fields || {};
  const sessionId = clean(fields.session_id, 160) || null;
  const lifecycle = lifecycleOf(fields);
  const customerAckAt = isoOrNull(fields.customer_ack_at);
  const modelAckAt = isoOrNull(fields.model_ack_at);
  const modelName = clean(fields.model_name || fields["Assigned Model"], 120) || null;
  const start = clock(fields.start_time || fields["Start Time"]);
  const end = clock(fields.end_time || fields["End Time"]);
  const eventEta = await resolveCustomerEtaEvent(env, sessionId);
  const legacyEtaLabel = clean(fields.customer_eta_label, 120) || null;
  return {
    sessionId,
    lifecycle,
    jobDate: dateOnly(fields.job_date || fields["Session Date"]) || null,
    jobTimeLabel: start && end ? `${start} – ${end}` : start || end || null,
    locationDisplay: clean(fields.location_name || fields["Location Name"], 240) || null,
    model: { displayName: modelName, displayAllowed: Boolean(modelName) },
    acknowledgement: {
      customerAckAt,
      modelAcknowledged: Boolean(modelAckAt),
      modelAckAt,
      customerAckAllowed: !customerAckAt && ["pending_confirmation", "confirmed"].includes(lifecycle),
    },
    // ETA events are the live source of truth. The old Session label remains
    // only as a backwards-compatible fallback before an ETA event exists.
    etaLabel: eventEta.hasEvent ? eventEta.label : legacyEtaLabel,
    nextMessage: clean(fields.customer_next_message, 500) || null,
  };
}

async function resolveCustomerEtaEvent(env, sessionId) {
  if (!sessionId) return { hasEvent: false, label: null };
  try {
    // This read happens only after canonical customer ownership of the Session
    // has been established. Raw Job/event data is never returned to MY MMD.
    const records = await airtableList(env, {
      table: String(env.AIRTABLE_TABLE_JOBS || DEFAULT_JOBS_TABLE),
      filterByFormula: `{session_id}=${formulaString(sessionId)}`,
      maxRecords: 2,
    });
    if (records.length !== 1) return { hasEvent: false, label: null };
    return customerEtaFromEvents(records[0]?.fields?.events_json);
  } catch {
    // Do not make the customer Session unavailable because the derived Jobs
    // read is temporarily unavailable. The legacy label remains the fallback.
    return { hasEvent: false, label: null };
  }
}

export function customerEtaFromEvents(value, now = Date.now()) {
  const events = parseEvents(value);
  const nowMs = Number(now);
  const currentMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  let latest = null;

  for (const entry of events) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const event = clean(entry.event, 80).toLowerCase().replace(/[\s-]+/g, "_");
    const etaMinutes = validEtaMinutes(entry.eta_minutes);
    const updatedAt = Date.parse(clean(entry.ts, 80));
    if (event !== ETA_EVENT || !etaMinutes || !Number.isFinite(updatedAt)) continue;
    if (!latest || updatedAt >= latest.updatedAt) latest = { etaMinutes, updatedAt };
  }

  if (!latest) return { hasEvent: false, label: null };
  const remainingMs = (latest.updatedAt + latest.etaMinutes * 60_000) - currentMs;
  if (remainingMs <= 0) return { hasEvent: true, label: null };
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return { hasEvent: true, label: `ถึงโดยประมาณในอีก ${remainingMinutes} นาที` };
}

function parseEvents(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  const serialized = value.trim();
  if (!serialized || serialized.length > MAX_EVENTS_JSON_LENGTH) return [];
  try {
    const parsed = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validEtaMinutes(value) {
  const number = (typeof value === "number" || typeof value === "string") ? Number(value) : 0;
  return Number.isInteger(number) && number >= 1 && number <= ETA_MAX_MINUTES ? number : 0;
}

function lifecycleOf(fields = {}) {
  const raw = clean(fields.session_state || fields["Session Status"], 80)
    .toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    pending: "pending_confirmation", pending_confirm: "pending_confirmation",
    ready: "confirmed", confirm: "confirmed", confirmed: "confirmed",
    prep: "preparing", on_the_way: "en_route", enroute: "en_route",
    meeting: "met_customer", started: "in_progress", complete: "completed",
    done: "completed", canceled: "cancelled",
  };
  const value = aliases[raw] || raw;
  return DISPLAYABLE.has(value) ? value : "checking";
}

async function verifyCustomerToken(request, env, token) {
  if (!env.PAYMENTS_WORKER?.fetch) return null;
  const target = new URL("/v1/confirm/context", request.url);
  const response = await env.PAYMENTS_WORKER.fetch(new Request(target, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ t: token, expected_role: "customer" }),
  }));
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function contextSessionId(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const data = root.data && typeof root.data === "object" ? root.data : root;
  const session = data.session && typeof data.session === "object" ? data.session : data;
  return clean(session.session_id || session.sessionId, 160);
}

async function airtableList(env, { filterByFormula, maxRecords, table: selectedTable = "" }) {
  requireAirtable(env);
  const table = String(selectedTable || env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE);
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", filterByFormula);
  url.searchParams.set("maxRecords", String(maxRecords));
  const response = await airtableFetch(env, new Request(url, { headers: airtableHeaders(env) }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw new Error(`airtable_${response.status || "malformed"}`);
  return payload.records;
}

async function patchSession(env, recordId, fields) {
  requireAirtable(env);
  const table = String(env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE);
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  const response = await airtableFetch(env, new Request(url, {
    method: "PATCH",
    headers: { ...airtableHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  }));
  if (!response.ok) throw new Error(`airtable_patch_${response.status}`);
}

function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}
function airtableHeaders(env) {
  return { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" };
}
function requireAirtable(env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("airtable_not_configured");
}
function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function clean(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function linkValue(value) {
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || "") : "";
  return value;
}
function dateOnly(value) {
  const text = clean(value, 80);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}
function clock(value) {
  const text = clean(value, 80);
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
}
function isoOrNull(value) {
  const parsed = Date.parse(clean(value, 80));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function noStoreHeaders(extra = {}) {
  return { "cache-control": "no-store", "x-mmd-member-app-api": "v1", ...extra };
}
function json(value, status = 200) {
  return Response.json(value, { status, headers: noStoreHeaders() });
}
function jsonError(status, code, message, headers = {}) {
  return Response.json({ ok: false, error: { code, message } }, { status, headers: noStoreHeaders(headers) });
}
