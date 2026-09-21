const AIRTABLE_API = "https://api.airtable.com/v0";
export const CONFIRM_ACK_PATH = "/v1/confirm/ack";
export const CONFIRM_CONTEXT_PATH = "/v1/confirm/context";
export const CONFIRM_CHANGE_REQUEST_PATH = "/v1/confirm/change-request";

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function allowedOrigins(env = {}) {
  return clean(env.ALLOWED_ORIGINS || "", 5000)
    .replace(/^['\"]|['\"]$/g, "")
    .split(",")
    .map((value) => value.trim().replace(/^['\"]|['\"]$/g, ""))
    .filter(Boolean);
}

function corsHeaders(request, env = {}) {
  const origin = clean(request.headers.get("origin"), 500);
  const allowed = allowedOrigins(env);
  const headers = {
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (origin && allowed.includes(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function withCors(request, env, response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isAllowedOrigin(request, env = {}) {
  const origin = clean(request.headers.get("origin"), 500);
  return Boolean(origin && allowedOrigins(env).includes(origin));
}

function base64UrlDecode(input) {
  const value = clean(input).replace(/-/g, "+").replace(/_/g, "/");
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(digest);
}

function confirmationSecret(env = {}) {
  return clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5000);
}

async function verifyToken(env, token, expectedRole) {
  const raw = clean(token, 12000);
  const [payloadPart, suppliedSignature, extra] = raw.split(".");
  if (!payloadPart || !suppliedSignature || extra !== undefined) throw new Error("invalid_confirmation_token");

  const secret = confirmationSecret(env);
  if (!secret) {
    const error = new Error("confirmation_signing_not_ready");
    error.status = 503;
    throw error;
  }

  const expectedSignature = await hmacSha256Hex(payloadPart, secret);
  if (expectedSignature.length !== suppliedSignature.length) throw new Error("invalid_confirmation_token_signature");
  let mismatch = 0;
  for (let i = 0; i < expectedSignature.length; i += 1) {
    mismatch |= expectedSignature.charCodeAt(i) ^ suppliedSignature.charCodeAt(i);
  }
  if (mismatch !== 0) throw new Error("invalid_confirmation_token_signature");

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch {
    throw new Error("invalid_confirmation_token");
  }

  const role = clean(payload?.role, 40);
  const kind = clean(payload?.kind, 80);
  const validKind =
    (role === "customer" && kind === "customer_confirm") ||
    (role === "model" && kind === "model_confirm");
  if (!validKind || !["customer", "model"].includes(role)) throw new Error("invalid_confirmation_token_purpose");
  if (!expectedRole || expectedRole !== role) throw new Error("confirmation_role_mismatch");
  if (!clean(payload?.session_id, 200) || !clean(payload?.payment_ref, 200)) throw new Error("invalid_confirmation_token_subject");

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(payload?.iat) || !Number.isInteger(payload?.exp) || payload.exp <= payload.iat) {
    throw new Error("invalid_confirmation_token_lifetime");
  }
  if (payload.iat > now + 60) throw new Error("confirmation_token_not_yet_valid");
  if (payload.exp <= now) {
    const error = new Error("confirmation_token_expired");
    error.status = 410;
    throw error;
  }

  if (!env.PAY_SESSIONS_KV) {
    const error = new Error("confirmation_token_store_not_ready");
    error.status = 503;
    throw error;
  }
  const tokenHash = await sha256Hex(raw);
  const storedRaw = await env.PAY_SESSIONS_KV.get(`sig:${tokenHash.slice(0, 24)}`);
  if (!storedRaw) throw new Error("confirmation_token_not_active");

  let stored;
  try {
    stored = JSON.parse(storedRaw);
  } catch {
    throw new Error("confirmation_token_record_invalid");
  }
  for (const field of ["kind", "role", "session_id", "payment_ref", "payment_type", "iat", "exp"]) {
    if (stored?.[field] !== payload?.[field]) throw new Error("confirmation_token_record_mismatch");
  }
  return payload;
}

function airtableConfig(env = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !tableId || !apiKey) {
    const error = new Error("airtable_not_ready");
    error.status = 503;
    throw error;
  }
  return { baseId, tableId, apiKey };
}

function sessionFields(env = {}) {
  return {
    paymentRef: clean(env.AT_SESSIONS__PAYMENT_REF || "fldojgjSQLaO0uQLX", 100),
    customerAck: clean(env.AT_SESSIONS__CUSTOMER_ACK_AT || "fldJSS5GNN7quJwa8", 100),
    modelAck: clean(env.AT_SESSIONS__MODEL_ACK_AT || "fldFgkHXivIAThfDz", 100),
    sessionStatus: clean(
      env.AT_SESSIONS__SESSION_STATUS || env.AIRTABLE_SESSIONS_STATUS_FIELD || "fldmwuvOaiCFdzzRa",
      100,
    ),
    modelSessionState: clean(env.AT_SESSIONS__MODEL_SESSION_STATE || "fld57fhdWqIcOy4Jp", 100),
    modelSessionStateUpdatedAt: clean(env.AT_SESSIONS__MODEL_SESSION_STATE_UPDATED_AT || "fldFJI1Leni6wvzR4", 100),
    clientName: clean(env.AT_SESSIONS__CLIENT_NAME || "fldMvnQ0BzDfHUYjT", 100),
    modelName: clean(env.AT_SESSIONS__MODEL_NAME || "flddVz6eoWRHrzIQr", 100),
    jobType: clean(env.AT_SESSIONS__JOB_TYPE || "fldjK3U9bghnj7xUe", 100),
    jobDate: clean(env.AT_SESSIONS__JOB_DATE || "fldpnqoIsUMfN7y3c", 100),
    startTime: clean(env.AT_SESSIONS__START_TIME || "fldBeG0FkWwa8kgnp", 100),
    endTime: clean(env.AT_SESSIONS__END_TIME || "fldiDSz0wW9Ct9I3P", 100),
    locationName: clean(env.AT_SESSIONS__LOCATION_NAME || "fldIiRpaxoafjTkFt", 100),
    googleMapUrl: clean(env.AT_SESSIONS__GOOGLE_MAP_URL || "fldoUDQ8sH93idPx0", 100),
    jobId: clean(env.AT_SESSIONS__JOB_ID || "fldHw5HdDDdkHXMhG", 100),
  };
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function airtableRequest(env, path, init = {}) {
  const { baseId, apiKey } = airtableConfig(env);
  const response = await fetch(`${AIRTABLE_API}/${baseId}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("airtable_request_failed");
    error.status = response.status >= 500 ? 503 : 500;
    throw error;
  }
  return data;
}

async function findSession(env, sessionId) {
  const { tableId } = airtableConfig(env);
  const formula = `{session_id}='${formulaValue(sessionId)}'`;
  const query = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: formula,
    returnFieldsByFieldId: "true",
  });
  const data = await airtableRequest(env, `${encodeURIComponent(tableId)}?${query.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}


const CUSTOMER_CHANGE_FIELDS = Object.freeze({
  requestId: "fldWMwebmHhyVQLzW",
  session: "fldbL2Ya44l6xEYe1",
  sessionId: "fldMD3Fhu0ibDmjk0",
  jobId: "flduFVxjPx6abaXQK",
  requestType: "fldxg0WIVCmxtdRCF",
  status: "fldcBkBS70bWBgI8A",
  currentValueJson: "fld9W8UEOXpsfJT5P",
  requestedValueJson: "fld8DqBrOmY6lQzGA",
  customerRemark: "fldjwQWRjxXqrFiAU",
  requestedBy: "fldVpKi8iu4AfAKfw",
  source: "fldFX2iXytQyVKRvf",
  requestedAt: "fldU2e6BO3fVdGyFF",
  idempotencyKey: "fldWiC7YFE0jYYBUN",
  notificationStatus: "fldY1Ix9xI3ccNJhX",
  notificationRef: "fldPLodDJTWfDlgET",
});

const CUSTOMER_CHANGE_TYPES = new Set([
  "time_change",
  "location_change",
  "date_change",
  "reschedule",
  "cancellation",
  "remark",
]);

function changeRequestTable(env = {}) {
  return clean(env.AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS || "tblhQGfJc4GgiteZr", 120);
}

function parsedJson(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeChangeRequestType(value) {
  const result = clean(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  return CUSTOMER_CHANGE_TYPES.has(result) ? result : "";
}

function safeHttpsUrl(value) {
  const raw = clean(value, 1000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function requestedChangeValue(type, raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  if (["time_change", "reschedule"].includes(type)) {
    const start = clean(source.start_time, 80);
    const end = clean(source.end_time, 80);
    if (start) out.start_time = start;
    if (end) out.end_time = end;
  }
  if (["date_change", "reschedule"].includes(type)) {
    const date = clean(source.job_date, 80);
    if (date) out.job_date = date;
  }
  if (["location_change", "reschedule"].includes(type)) {
    const location = clean(source.location_name, 360);
    const area = clean(source.area, 240);
    const map = safeHttpsUrl(source.google_map_url);
    const note = clean(source.note, 800);
    if (location) out.location_name = location;
    if (area) out.area = area;
    if (map) out.google_map_url = map;
    if (note) out.note = note;
    if (source.pending === true) out.pending = true;
  }
  return out;
}

function currentChangeValue(env, session, type) {
  const fields = sessionFields(env);
  const source = session?.fields || {};
  const common = {
    job_date: clean(source[fields.jobDate], 120) || null,
    start_time: clean(source[fields.startTime], 120) || null,
    end_time: clean(source[fields.endTime], 120) || null,
    location_name: clean(source[fields.locationName], 360) || null,
    google_map_url: clean(source[fields.googleMapUrl], 1000) || null,
  };
  if (type === "time_change") return { start_time: common.start_time, end_time: common.end_time };
  if (type === "location_change") return { location_name: common.location_name, google_map_url: common.google_map_url };
  if (type === "date_change") return { job_date: common.job_date };
  if (type === "reschedule" || type === "cancellation") return common;
  return {};
}

function makeChangeRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `ccr_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${suffix}`;
}

async function findChangeRequestByIdempotency(env, sessionId, idempotencyKey) {
  const table = changeRequestTable(env);
  const formula = `AND({session_id}='${formulaValue(sessionId)}',{idempotency_key}='${formulaValue(idempotencyKey)}')`;
  const query = new URLSearchParams({ maxRecords: "1", filterByFormula: formula, returnFieldsByFieldId: "true" });
  const data = await airtableRequest(env, `${encodeURIComponent(table)}?${query.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}

export async function listPendingCustomerChangeRequests(env, sessionId) {
  const table = changeRequestTable(env);
  const formula = `AND({session_id}='${formulaValue(sessionId)}',{status}='pending_review')`;
  const query = new URLSearchParams({
    maxRecords: "20",
    pageSize: "20",
    filterByFormula: formula,
    returnFieldsByFieldId: "true",
  });
  const data = await airtableRequest(env, `${encodeURIComponent(table)}?${query.toString()}`, { method: "GET" });
  return (Array.isArray(data?.records) ? data.records : []).map((record) => {
    const fields = record?.fields || {};
    return {
      record_id: record.id,
      request_id: clean(fields[CUSTOMER_CHANGE_FIELDS.requestId], 120),
      request_type: clean(fields[CUSTOMER_CHANGE_FIELDS.requestType], 80),
      status: clean(fields[CUSTOMER_CHANGE_FIELDS.status], 80) || "pending_review",
      requested_at: clean(fields[CUSTOMER_CHANGE_FIELDS.requestedAt], 120) || null,
      customer_remark: clean(fields[CUSTOMER_CHANGE_FIELDS.customerRemark], 1000) || null,
      requested_value: parsedJson(fields[CUSTOMER_CHANGE_FIELDS.requestedValueJson]),
    };
  });
}

async function createCustomerChangeRequest(env, authorized, body, idempotencyKey) {
  const type = normalizeChangeRequestType(body?.request_type);
  if (!type) {
    const error = new Error("customer_change_request_type_invalid");
    error.status = 400;
    throw error;
  }
  const requestedValue = requestedChangeValue(type, body?.requested_value);
  const remark = clean(body?.customer_remark || body?.remark, 1200);
  if (type === "time_change" && !requestedValue.start_time && !requestedValue.end_time) throw Object.assign(new Error("time_change_value_required"), { status: 400 });
  if (type === "location_change" && !requestedValue.location_name && !requestedValue.area && !requestedValue.google_map_url && requestedValue.pending !== true) throw Object.assign(new Error("location_change_value_required"), { status: 400 });
  if (type === "date_change" && !requestedValue.job_date) throw Object.assign(new Error("date_change_value_required"), { status: 400 });
  if (type === "reschedule" && !requestedValue.job_date && !requestedValue.start_time && !requestedValue.end_time && !remark) throw Object.assign(new Error("reschedule_value_required"), { status: 400 });
  if (type === "cancellation" && remark.length < 2) throw Object.assign(new Error("cancellation_reason_required"), { status: 400 });
  if (type === "remark" && remark.length < 2) throw Object.assign(new Error("remark_required"), { status: 400 });

  const sessionId = clean(authorized.claims.session_id, 200);
  const existing = await findChangeRequestByIdempotency(env, sessionId, idempotencyKey);
  if (existing?.id) {
    const fields = existing.fields || {};
    return {
      record_id: existing.id,
      request_id: clean(fields[CUSTOMER_CHANGE_FIELDS.requestId], 120),
      request_type: clean(fields[CUSTOMER_CHANGE_FIELDS.requestType], 80),
      status: clean(fields[CUSTOMER_CHANGE_FIELDS.status], 80),
      idempotent: true,
    };
  }

  const fields = sessionFields(env);
  const sessionSource = authorized.session?.fields || {};
  const requestId = makeChangeRequestId();
  const requestedAt = new Date().toISOString();
  const currentValue = currentChangeValue(env, authorized.session, type);
  const table = changeRequestTable(env);
  const payload = {
    records: [{
      fields: {
        [CUSTOMER_CHANGE_FIELDS.requestId]: requestId,
        [CUSTOMER_CHANGE_FIELDS.session]: [authorized.session.id],
        [CUSTOMER_CHANGE_FIELDS.sessionId]: sessionId,
        [CUSTOMER_CHANGE_FIELDS.jobId]: clean(sessionSource[fields.jobId], 200),
        [CUSTOMER_CHANGE_FIELDS.requestType]: type,
        [CUSTOMER_CHANGE_FIELDS.status]: "pending_review",
        [CUSTOMER_CHANGE_FIELDS.currentValueJson]: JSON.stringify(currentValue),
        [CUSTOMER_CHANGE_FIELDS.requestedValueJson]: JSON.stringify(requestedValue),
        [CUSTOMER_CHANGE_FIELDS.customerRemark]: remark,
        [CUSTOMER_CHANGE_FIELDS.requestedBy]: "customer",
        [CUSTOMER_CHANGE_FIELDS.source]: "customer_confirmation",
        [CUSTOMER_CHANGE_FIELDS.requestedAt]: requestedAt,
        [CUSTOMER_CHANGE_FIELDS.idempotencyKey]: idempotencyKey,
        [CUSTOMER_CHANGE_FIELDS.notificationStatus]: "pending",
      },
    }],
    typecast: true,
  };
  const data = await airtableRequest(env, encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const record = data?.records?.[0];
  if (!record?.id) throw Object.assign(new Error("customer_change_request_write_failed"), { status: 503 });
  return { record_id: record.id, request_id: requestId, request_type: type, status: "pending_review", idempotent: false, current_value: currentValue, requested_value: requestedValue, customer_remark: remark };
}

function htmlEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function notifyCustomerChangeRequest(env, authorized, change) {
  const service = env.TELEGRAM_WORKER;
  const token = clean(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM, 5000);
  if (!service || typeof service.fetch !== "function" || !token) return { ok: false, reason: "telegram_not_ready" };
  const fields = sessionFields(env);
  const source = authorized.session?.fields || {};
  const lines = [
    "<b>CUSTOMER CHANGE REQUEST</b>",
    `<b>Session:</b> <code>${htmlEscape(authorized.claims.session_id)}</code>`,
    `<b>Client:</b> ${htmlEscape(clean(source[fields.clientName], 120) || "MMD Client")}`,
    `<b>Model:</b> ${htmlEscape(clean(source[fields.modelName], 120) || "Model")}`,
    `<b>Type:</b> ${htmlEscape(change.request_type)}`,
    `<b>Request:</b> <code>${htmlEscape(change.request_id)}</code>`,
    change.customer_remark ? `<b>Remark:</b> ${htmlEscape(change.customer_remark)}` : "",
    "<b>Action:</b> Review before mutating canonical Session.",
  ].filter(Boolean);
  const response = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      flow: "alerts",
      text: lines.join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) return { ok: false, reason: clean(data?.error || `telegram_http_${response.status}`, 160) };
  return { ok: true, ref: clean(data?.result?.message_id || data?.message_id, 120) };
}

async function patchChangeNotification(env, recordId, status, ref = "") {
  const table = changeRequestTable(env);
  await airtableRequest(env, `${encodeURIComponent(table)}/${encodeURIComponent(recordId)}?returnFieldsByFieldId=true`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [CUSTOMER_CHANGE_FIELDS.notificationStatus]: status,
        [CUSTOMER_CHANGE_FIELDS.notificationRef]: clean(ref, 120),
      },
      typecast: true,
    }),
  });
}

function assertSessionMatchesClaims(env, session, claims) {
  const fields = sessionFields(env);
  const sessionPaymentRef = clean(session?.fields?.[fields.paymentRef], 200);
  if (sessionPaymentRef && sessionPaymentRef !== clean(claims.payment_ref, 200)) {
    const error = new Error("confirmation_session_mismatch");
    error.status = 409;
    throw error;
  }
}

function safeConfirmationContext(env, session, role) {
  const fields = sessionFields(env);
  const source = session?.fields || {};
  return {
    job_type: clean(source[fields.jobType], 120) || null,
    job_date: clean(source[fields.jobDate], 120) || null,
    start_time: clean(source[fields.startTime], 120) || null,
    end_time: clean(source[fields.endTime], 120) || null,
    location_name: clean(source[fields.locationName], 300) || null,
    google_map_url: clean(source[fields.googleMapUrl], 1000) || null,
    counterpart_name:
      role === "customer"
        ? clean(source[fields.modelName], 120) || null
        : clean(source[fields.clientName], 120) || null,
    acknowledged_at:
      clean(source[role === "customer" ? fields.customerAck : fields.modelAck], 200) || null,
  };
}

function shouldPromoteCustomerStatus(value) {
  const normalized = clean(value, 80).toLowerCase();
  return !normalized || normalized === "pending";
}

async function patchAcknowledgement(env, session, role) {
  const { tableId } = airtableConfig(env);
  const fields = sessionFields(env);
  const fieldId = role === "customer" ? fields.customerAck : fields.modelAck;
  const existing = clean(session?.fields?.[fieldId], 200);
  const promoteCustomerStatus =
    role === "customer" && shouldPromoteCustomerStatus(session?.fields?.[fields.sessionStatus]);
  const currentModelSessionState = clean(session?.fields?.[fields.modelSessionState], 80).toLowerCase();
  const seedModelSessionState = role === "model" && !currentModelSessionState;

  if (existing && !promoteCustomerStatus && !seedModelSessionState) {
    return {
      acknowledged_at: existing,
      idempotent: true,
      session_status_promoted: false,
      model_session_state_seeded: false,
    };
  }

  const acknowledgedAt = existing || new Date().toISOString();
  const patchFields = {};
  if (!existing) patchFields[fieldId] = acknowledgedAt;
  if (promoteCustomerStatus) patchFields[fields.sessionStatus] = "Confirmed";
  if (seedModelSessionState) {
    patchFields[fields.modelSessionState] = "confirmed";
    patchFields[fields.modelSessionStateUpdatedAt] = acknowledgedAt;
  }

  await airtableRequest(env, `${encodeURIComponent(tableId)}/${encodeURIComponent(session.id)}?returnFieldsByFieldId=true`, {
    method: "PATCH",
    body: JSON.stringify({ fields: patchFields }),
  });
  return {
    acknowledged_at: acknowledgedAt,
    idempotent: Boolean(existing),
    session_status_promoted: promoteCustomerStatus,
    model_session_state_seeded: seedModelSessionState,
  };
}

function errorStatus(error) {
  if (Number.isInteger(error?.status)) return error.status;
  const code = clean(error?.message, 200);
  if (code === "confirmation_token_expired") return 410;
  if (code.startsWith("airtable_")) return 503;
  return 401;
}

export async function authorizeConfirmationRequest(request, env) {
  if (!isAllowedOrigin(request, env)) return { response: withCors(request, env, json({ ok: false, error: "origin_not_allowed" }, 403)) };
  const body = await request.json().catch(() => null);
  const token = clean(body?.t || body?.token, 12000);
  const expectedRole = clean(body?.expected_role || body?.role, 40).toLowerCase();
  if (!token) return { response: withCors(request, env, json({ ok: false, error: "confirmation_token_required" }, 400)) };
  if (!["customer", "model"].includes(expectedRole)) {
    return { response: withCors(request, env, json({ ok: false, error: "expected_role_required" }, 400)) };
  }
  try {
    const claims = await verifyToken(env, token, expectedRole);
    const session = await findSession(env, claims.session_id);
    if (!session?.id) return { response: withCors(request, env, json({ ok: false, error: "session_not_found" }, 404)) };
    assertSessionMatchesClaims(env, session, claims);
    return { claims, session, expectedRole, body };
  } catch (error) {
    return {
      response: withCors(request, env, json({ ok: false, error: clean(error?.message || "confirmation_authorization_failed", 200) }, errorStatus(error))),
    };
  }
}

export async function handleConfirmationContext(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (request.method.toUpperCase() !== "POST") return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));

  const authorized = await authorizeConfirmationRequest(request, env);
  if (authorized.response) return authorized.response;

  return withCors(request, env, json({
    ok: true,
    role: authorized.expectedRole,
    session_id: authorized.claims.session_id,
    confirmation: safeConfirmationContext(env, authorized.session, authorized.expectedRole),
  }));
}

export async function handleCustomerChangeRequest(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (request.method.toUpperCase() !== "POST") return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));

  const body = await request.clone().json().catch(() => null);
  const authorized = await parseAuthorizedConfirmationRequest(request, env);
  if (authorized.response) return authorized.response;
  if (authorized.expectedRole !== "customer") return withCors(request, env, json({ ok: false, error: "customer_role_required" }, 403));

  const idempotencyKey = clean(request.headers.get("Idempotency-Key") || body?.idempotency_key, 180);
  if (idempotencyKey.length < 8) return withCors(request, env, json({ ok: false, error: "idempotency_key_required" }, 400));

  try {
    const change = await createCustomerChangeRequest(env, authorized, body || {}, idempotencyKey);
    if (change.idempotent) {
      return withCors(request, env, json({ ok: true, ...change, notification_status: "existing", canonical_session_mutated: false }));
    }
    const notice = await notifyCustomerChangeRequest(env, authorized, change).catch((error) => ({ ok: false, reason: clean(error?.message || error, 160) }));
    await patchChangeNotification(env, change.record_id, notice.ok ? "sent" : "failed", notice.ref || notice.reason || "").catch(() => {});
    return withCors(request, env, json({
      ok: true,
      ...change,
      notification_status: notice.ok ? "sent" : "failed",
      canonical_session_mutated: false,
      requires_mmd_review: true,
    }, 201));
  } catch (error) {
    return withCors(request, env, json({ ok: false, error: clean(error?.message || "customer_change_request_failed", 200) }, errorStatus(error)));
  }
}

export async function handleConfirmationAck(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (request.method.toUpperCase() !== "POST") return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));

  const authorized = await authorizeConfirmationRequest(request, env);
  if (authorized.response) return authorized.response;

  try {
    if (authorized.expectedRole === "customer") {
      const pending = await listPendingCustomerChangeRequests(env, authorized.claims.session_id);
      if (pending.length) {
        return withCors(request, env, json({
          ok: false,
          error: "customer_change_request_pending",
          pending_change_requests: pending,
          canonical_session_mutated: false,
        }, 409));
      }
    }
    const ack = await patchAcknowledgement(env, authorized.session, authorized.expectedRole);
    return withCors(request, env, json({
      ok: true,
      role: authorized.expectedRole,
      session_id: authorized.claims.session_id,
      acknowledged_at: ack.acknowledged_at,
      idempotent: ack.idempotent,
      session_status_promoted: ack.session_status_promoted,
      model_session_state_seeded: ack.model_session_state_seeded,
    }));
  } catch (error) {
    return withCors(request, env, json({ ok: false, error: clean(error?.message || "confirmation_ack_failed", 200) }, errorStatus(error)));
  }
}
