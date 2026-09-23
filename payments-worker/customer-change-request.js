import { authorizeConfirmationRequest } from "./confirmation-ack.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
export const CUSTOMER_CHANGE_REQUEST_PATH = "/v1/confirm/change-request";

const TYPES = new Set([
  "time_change",
  "location_change",
  "date_change",
  "reschedule",
  "cancellation",
  "remark",
]);

const SESSION_FIELDS = Object.freeze({
  client: "fld6P6if0vDZCeV0C",
  sessionStatus: "fldmwuvOaiCFdzzRa",
  clientName: "fldMvnQ0BzDfHUYjT",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  googleMapUrl: "fldoUDQ8sH93idPx0",
  jobId: "fldHw5HdDDdkHXMhG",
});

const CHANGE_FIELDS = Object.freeze({
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

const INBOX_FIELDS = Object.freeze({
  inboxId: "fld0VtsSq9aZHSbbL",
  createdBy: "fldNIS9acBenkolcg",
  source: "fldft1PjSMU18coRz",
  intent: "fldQ4Zl1kZpLbN7fo",
  memberName: "fldCL1LmqhbZdBE8J",
  adminNote: "fld9NbPo1Q3E6MfB8",
  payloadJson: "fldn7MS0D9cdyQLtF",
  status: "fldCiOnawlgMkRPju",
  linkedSession: "fldtW0d8LPVgXkcBR",
  canonicalClient: "fld9gMhvFWegM345O",
});

export function isCustomerChangeRequest(path, method) {
  const normalized = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  return normalized === CUSTOMER_CHANGE_REQUEST_PATH && (verb === "POST" || verb === "OPTIONS");
}

export async function handleCustomerChangeRequest(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") {
    return withCors(request, env, new Response(null, { status: 204 }));
  }
  if (request.method.toUpperCase() !== "POST") {
    return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));
  }

  const authorized = await authorizeConfirmationRequest(request, env);
  if (authorized.response) return authorized.response;
  if (authorized.expectedRole !== "customer") {
    return withCors(request, env, json({ ok: false, error: "customer_confirmation_required" }, 403));
  }

  try {
    const input = normalizeInput(authorized.body || {});
    validateInput(input);

    const session = authorized.session;
    const sessionFields = session?.fields || {};
    const currentValue = currentSnapshot(input.request_type, sessionFields);
    const requestedValue = requestedSnapshot(input);
    const idempotencyKey = await sha256Hex(JSON.stringify({
      session_id: authorized.claims.session_id,
      request_type: input.request_type,
      requested_value: requestedValue,
      remark: input.remark,
    }));
    const requestId = `ccr_${idempotencyKey.slice(0, 20)}`;

    const existing = await findExisting(env, idempotencyKey);
    if (existing?.id) {
      return withCors(request, env, json({
        ok: true,
        authority: "payments-worker",
        schema: "customer_change_request_v1",
        request_id: requestId,
        status: "pending_review",
        duplicate: true,
        mmd_notified: true,
        message: "MMD ได้รับคำขอนี้แล้ว · อยู่ระหว่างตรวจสอบ",
      }));
    }

    const requestedAt = new Date().toISOString();
    const changeRecord = await createChangeRequest(env, {
      requestId,
      sessionRecordId: session.id,
      sessionId: authorized.claims.session_id,
      jobId: clean(sessionFields[SESSION_FIELDS.jobId], 200),
      requestType: input.request_type,
      currentValue,
      requestedValue,
      remark: input.remark,
      requestedAt,
      idempotencyKey,
    });

    const notificationPayload = {
      request_id: requestId,
      session_id: authorized.claims.session_id,
      job_id: clean(sessionFields[SESSION_FIELDS.jobId], 200) || null,
      client_name: clean(sessionFields[SESSION_FIELDS.clientName], 240) || null,
      request_type: input.request_type,
      current_value: currentValue,
      requested_value: requestedValue,
      customer_remark: input.remark || null,
      requested_at: requestedAt,
      status: "pending_review",
    };

    const inbox = await createConsoleInbox(env, {
      requestId,
      session,
      sessionFields,
      payload: notificationPayload,
    }).catch((error) => ({ ok: false, error: clean(error?.message || error, 240) }));

    const telegram = await notifyTelegram(env, notificationPayload)
      .catch((error) => ({ ok: false, error: clean(error?.message || error, 240) }));

    const mmdNotified = inbox?.ok === true || telegram?.ok === true;
    const notificationRef = [
      inbox?.record_id ? `console:${inbox.record_id}` : "",
      telegram?.message_id ? `telegram:${telegram.message_id}` : "",
    ].filter(Boolean).join(";");

    await patchNotification(env, changeRecord.id, {
      status: mmdNotified ? "sent" : "failed",
      ref: notificationRef,
    }).catch(() => null);

    return withCors(request, env, json({
      ok: true,
      authority: "payments-worker",
      schema: "customer_change_request_v1",
      request_id: requestId,
      status: "pending_review",
      duplicate: false,
      mmd_notified: mmdNotified,
      notification: {
        console_inbox: inbox?.ok === true,
        telegram: telegram?.ok === true,
      },
      message: "MMD ได้รับคำขอแล้ว · รอตรวจสอบ",
    }));
  } catch (error) {
    return withCors(request, env, json({
      ok: false,
      authority: "payments-worker",
      error: clean(error?.message || "customer_change_request_failed", 200),
    }, Number(error?.status || 400)));
  }
}

function normalizeInput(body) {
  return {
    request_type: code(body?.request_type),
    requested_start_time: clean(body?.requested_start_time, 120),
    requested_end_time: clean(body?.requested_end_time, 120),
    requested_date: clean(body?.requested_date, 40),
    requested_location_name: clean(body?.requested_location_name, 360),
    requested_google_map_url: safeHttps(body?.requested_google_map_url),
    remark: clean(body?.remark || body?.reason, 2000),
  };
}

function validateInput(input) {
  if (!TYPES.has(input.request_type)) throw httpError(400, "invalid_request_type");

  if (input.requested_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.requested_date)) {
    throw httpError(400, "invalid_requested_date");
  }
  if (input.requested_start_time && !validTimeValue(input.requested_start_time)) {
    throw httpError(400, "invalid_requested_start_time");
  }
  if (input.requested_end_time && !validTimeValue(input.requested_end_time)) {
    throw httpError(400, "invalid_requested_end_time");
  }

  if (input.request_type === "time_change" && !input.requested_start_time && !input.requested_end_time) {
    throw httpError(400, "requested_time_required");
  }
  if (input.request_type === "location_change" && !input.requested_location_name && !input.requested_google_map_url) {
    throw httpError(400, "requested_location_required");
  }
  if (input.request_type === "date_change" && !input.requested_date) {
    throw httpError(400, "requested_date_required");
  }
  if (input.request_type === "reschedule" && !input.requested_date && !input.requested_start_time && input.remark.length < 2) {
    throw httpError(400, "reschedule_detail_required");
  }
  if (input.request_type === "cancellation" && input.remark.length < 3) {
    throw httpError(400, "cancellation_reason_required");
  }
  if (input.request_type === "remark" && input.remark.length < 2) {
    throw httpError(400, "remark_required");
  }
}

function currentSnapshot(type, fields) {
  const all = {
    job_date: clean(fields[SESSION_FIELDS.jobDate], 120) || null,
    start_time: clean(fields[SESSION_FIELDS.startTime], 120) || null,
    end_time: clean(fields[SESSION_FIELDS.endTime], 120) || null,
    location_name: clean(fields[SESSION_FIELDS.locationName], 360) || null,
    google_map_url: safeHttps(fields[SESSION_FIELDS.googleMapUrl]) || null,
    session_status: clean(fields[SESSION_FIELDS.sessionStatus], 120) || null,
  };
  if (type === "time_change") return { start_time: all.start_time, end_time: all.end_time };
  if (type === "location_change") return { location_name: all.location_name, google_map_url: all.google_map_url };
  if (type === "date_change") return { job_date: all.job_date };
  if (type === "remark") return {};
  return all;
}

function requestedSnapshot(input) {
  const out = {};
  if (input.requested_date) out.job_date = input.requested_date;
  if (input.requested_start_time) out.start_time = input.requested_start_time;
  if (input.requested_end_time) out.end_time = input.requested_end_time;
  if (input.requested_location_name) out.location_name = input.requested_location_name;
  if (input.requested_google_map_url) out.google_map_url = input.requested_google_map_url;
  return out;
}

async function createChangeRequest(env, input) {
  const fields = {};
  fields[CHANGE_FIELDS.requestId] = input.requestId;
  fields[CHANGE_FIELDS.session] = [input.sessionRecordId];
  fields[CHANGE_FIELDS.sessionId] = input.sessionId;
  if (input.jobId) fields[CHANGE_FIELDS.jobId] = input.jobId;
  fields[CHANGE_FIELDS.requestType] = input.requestType;
  fields[CHANGE_FIELDS.status] = "pending_review";
  fields[CHANGE_FIELDS.currentValueJson] = JSON.stringify(input.currentValue);
  fields[CHANGE_FIELDS.requestedValueJson] = JSON.stringify(input.requestedValue);
  if (input.remark) fields[CHANGE_FIELDS.customerRemark] = input.remark;
  fields[CHANGE_FIELDS.requestedBy] = "customer";
  fields[CHANGE_FIELDS.source] = "customer_confirmation";
  fields[CHANGE_FIELDS.requestedAt] = input.requestedAt;
  fields[CHANGE_FIELDS.idempotencyKey] = input.idempotencyKey;
  fields[CHANGE_FIELDS.notificationStatus] = "pending";

  const data = await airtableRequest(env, `${encodeURIComponent(changeTable(env))}?typecast=true`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const record = data?.records?.[0];
  if (!record?.id) throw httpError(503, "change_request_write_failed");
  return record;
}

async function findExisting(env, idempotencyKey) {
  const formula = `{idempotency_key}='${formulaValue(idempotencyKey)}'`;
  const query = new URLSearchParams({ maxRecords: "1", filterByFormula: formula });
  const data = await airtableRequest(env, `${encodeURIComponent(changeTable(env))}?${query.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}

async function createConsoleInbox(env, { requestId, session, sessionFields, payload }) {
  const fields = {};
  fields[INBOX_FIELDS.inboxId] = `customer_change_${requestId}`;
  fields[INBOX_FIELDS.createdBy] = "customer_confirmation";
  fields[INBOX_FIELDS.source] = "web";
  fields[INBOX_FIELDS.intent] = "note_only";
  const clientName = clean(sessionFields[SESSION_FIELDS.clientName], 240);
  if (clientName) fields[INBOX_FIELDS.memberName] = clientName;
  fields[INBOX_FIELDS.adminNote] = adminNote(payload);
  fields[INBOX_FIELDS.payloadJson] = JSON.stringify(payload);
  fields[INBOX_FIELDS.status] = "new";
  fields[INBOX_FIELDS.linkedSession] = [session.id];

  const linkedClient = Array.isArray(sessionFields[SESSION_FIELDS.client])
    ? sessionFields[SESSION_FIELDS.client].filter((value) => /^rec[A-Za-z0-9]{14}$/.test(String(value || ""))).slice(0, 1)
    : [];
  if (linkedClient.length) fields[INBOX_FIELDS.canonicalClient] = linkedClient;

  const data = await airtableRequest(env, `${encodeURIComponent(inboxTable(env))}?typecast=true`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  return { ok: Boolean(data?.records?.[0]?.id), record_id: data?.records?.[0]?.id || null };
}

function adminNote(payload) {
  const labels = {
    time_change: "ขอเปลี่ยนเวลา",
    location_change: "ขอเปลี่ยนสถานที่",
    date_change: "ขอเปลี่ยนวัน",
    reschedule: "ขอเลื่อนงาน",
    cancellation: "ขอยกเลิกงาน",
    remark: "แจ้งเพิ่มเติม",
  };
  return [
    `Customer Change Request · ${labels[payload.request_type] || payload.request_type}`,
    `Session: ${payload.session_id}`,
    payload.job_id ? `Job: ${payload.job_id}` : "",
    payload.client_name ? `Client: ${payload.client_name}` : "",
    `Current: ${JSON.stringify(payload.current_value)}`,
    `Requested: ${JSON.stringify(payload.requested_value)}`,
    payload.customer_remark ? `Remark: ${payload.customer_remark}` : "",
    "Status: pending_review · canonical Session unchanged",
  ].filter(Boolean).join("\n");
}

async function notifyTelegram(env, payload) {
  const service = env.TELEGRAM_WORKER;
  const token = clean(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM, 5000);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, reason: "telegram_router_binding_missing" };
  if (!token) return { ok: false, skipped: true, reason: "telegram_router_auth_missing" };

  const labels = {
    time_change: "TIME CHANGE",
    location_change: "LOCATION CHANGE",
    date_change: "DATE CHANGE",
    reschedule: "RESCHEDULE",
    cancellation: "CANCELLATION REQUEST",
    remark: "CUSTOMER REMARK",
  };
  const message = [
    "<b>📝 CUSTOMER CHANGE REQUEST</b>",
    `Type: <b>${escapeHtml(labels[payload.request_type] || payload.request_type)}</b>`,
    `Session: <code>${escapeHtml(payload.session_id)}</code>`,
    payload.job_id ? `Job: <code>${escapeHtml(payload.job_id)}</code>` : "",
    payload.client_name ? `Client: <b>${escapeHtml(payload.client_name)}</b>` : "",
    `Current: <code>${escapeHtml(JSON.stringify(payload.current_value))}</code>`,
    `Requested: <code>${escapeHtml(JSON.stringify(payload.requested_value))}</code>`,
    payload.customer_remark ? `Remark: ${escapeHtml(payload.customer_remark)}` : "",
    "<b>Status: pending review · Session truth unchanged</b>",
  ].filter(Boolean).join("\n");

  const response = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      flow: "confirm",
      chat_id: clean(env.TELEGRAM_CHAT_ID || "-1003546439681", 120),
      message_thread_id: Number(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || 22) || 22,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      text: message,
    }),
  }));
  const data = await response.json().catch(() => ({}));
  const telegram = data?.telegram || {};
  return {
    ok: response.ok && data?.ok === true && telegram?.ok === true,
    status: response.status,
    message_id: telegram?.result?.message_id || telegram?.message_id || null,
  };
}

async function patchNotification(env, recordId, { status, ref }) {
  const fields = { [CHANGE_FIELDS.notificationStatus]: status };
  if (ref) fields[CHANGE_FIELDS.notificationRef] = ref;
  return airtableRequest(env, `${encodeURIComponent(changeTable(env))}/${encodeURIComponent(recordId)}?typecast=true`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

async function airtableRequest(env, path, init = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !apiKey) throw httpError(503, "airtable_not_ready");

  const request = new Request(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : 500, "airtable_change_request_failed");
  return data;
}

function changeTable(env) {
  return clean(env.AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS || "tblhQGfJc4GgiteZr", 120);
}

function inboxTable(env) {
  return clean(env.AIRTABLE_TABLE_CONSOLE_INBOX || "tblFHmfpB2TTrzO2e", 120);
}

function validTimeValue(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) || /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function safeHttps(value) {
  const raw = clean(value, 1200);
  return /^https:\/\//i.test(raw) ? raw : "";
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function code(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value) {
  return clean(value, 3000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function allowedOrigins(env = {}) {
  return clean(env.ALLOWED_ORIGINS || "", 5000)
    .replace(/^[\"']|[\"']$/g, "")
    .split(",")
    .map((value) => value.trim().replace(/^[\"']|[\"']$/g, ""))
    .filter(Boolean);
}

function withCors(request, env, response) {
  const origin = clean(request.headers.get("origin"), 500);
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  headers.set("cache-control", "no-store, private");
  if (origin && allowedOrigins(env).includes(origin)) headers.set("access-control-allow-origin", origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
