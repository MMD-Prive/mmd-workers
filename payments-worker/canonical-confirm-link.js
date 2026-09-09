import {
  createConfirmTokenRecord,
  getConfirmTokenTtlSeconds,
  signConfirmToken,
} from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
export const CONFIRM_LINK_PATH = "/v1/confirm/link";

const DEFAULT_TABLES = Object.freeze({
  sessions: "tblC98mKWbzmPuNzX",
  payments: "tblWGGJJOx5eBvBZJ",
});

const SESSION_FIELDS = Object.freeze({
  sessionStatus: "fldmwuvOaiCFdzzRa",
  sessionId: "fldLTq2kZbyRv22IA",
  createdAt: "flduULqxy2FIuJuaf",
  amountThb: "fldhwC79ndbnEXSZz",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobType: "fldjK3U9bghnj7xUe",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  googleMapUrl: "fldoUDQ8sH93idPx0",
  note: "fldEcDkF7CH9VixWM",
  notes: "fldwl9Gs5tYlXG5ls",
  payModelThb: "fldlTO5aNfqUmlNWm",
  customerConfirmationUrl: "fldi9ZdoiUXzSv1rI",
  modelConfirmationUrl: "fld0mFma9J9yfEaKb",
});

const PAYMENT_FIELDS = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  sessionId: "fld2wdhBvc8xrV6y5",
  amount: "fldvCSwrUW8OMAooS",
  paymentStatus: "fldEJ1hmm7KwWuI6q",
  paymentMethod: "fldsblzIn0wzan3c9",
  notes: "fldjsZIKoJPawlb2u",
  paymentIntentStatus: "fld04fr3bRJTohO6y",
  verificationStatus: "fldJ7a0Ube9F0bmRy",
  createdAt: "flduxcPpowBxEZSLu",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  paymentType: "fldydUWHhqVLMkNSC",
});

const PAYMENT_STAGES = new Set(["deposit", "final", "tips", "full", "membership"]);
const PAYMENT_TYPES = new Set(["deposit", "final", "tips", "full"]);

export function isCanonicalConfirmLinkRequest(path, method) {
  return String(method || "").toUpperCase() === "POST" && normalizePath(path) === CONFIRM_LINK_PATH;
}

export async function handleCanonicalConfirmLink(request, env) {
  if (!(await serviceAuthed(request, env))) {
    return json(request, env, { ok: false, error: "service_auth_required" }, 401);
  }

  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(request, env, { ok: false, error: "invalid_confirm_link_request" }, 400);
  }

  try {
    requireAirtable(env);

    const sessionId = text(body.session_id || makeId("sess"), 180);
    const paymentRef = text(body.payment_ref || makeId("pay"), 180);
    const clientName = requiredText(body.client_name, "client_name", 240);
    const modelName = requiredText(body.model_name, "model_name", 240);
    const jobType = requiredText(body.job_type, "job_type", 180);
    const jobDate = canonicalDate(body.job_date, "job_date");
    const startRaw = requiredText(body.start_time, "start_time", 80);
    const endRaw = requiredText(body.end_time, "end_time", 80);
    const locationName = requiredText(body.location_name, "location_name", 300);
    const googleMapUrl = text(body.google_map_url, 1000);
    const amountThb = positiveNumber(body.amount_thb ?? body.amount, "amount_thb");
    const payModelThb = optionalNonNegativeNumber(
      body.pay_model_thb ?? body.pay_model ?? body.model_pay_thb ?? body.model_pay,
      "pay_model_thb",
    );
    const paymentStage = normalizeStage(body.payment_type || body.payment_stage || "full");
    const paymentMethod = canonicalPaymentMethod(body.payment_method || "promptpay");
    const note = text(body.note || body.notes, 4000);
    const createdAt = new Date().toISOString();

    const { startAt, endAt } = canonicalJobWindow(jobDate, startRaw, endRaw);

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + getConfirmTokenTtlSeconds(env);
    const signingSecret = clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY);
    if (!signingSecret) throw httpError(503, "missing_payment_confirmation_signing_secret");

    const customerClaims = {
      kind: "customer_confirm",
      role: "customer",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentStage,
      iat: issuedAt,
      exp: expiresAt,
    };
    const modelClaims = {
      kind: "model_confirm",
      role: "model",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentStage,
      iat: issuedAt,
      exp: expiresAt,
    };

    const customerToken = await signConfirmToken(customerClaims, signingSecret);
    const modelToken = await signConfirmToken(modelClaims, signingSecret);
    const webBase = clean(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
    const customerPage = absoluteUrl(body.confirm_page || "/confirm/job-confirmation", webBase);
    const modelPage = absoluteUrl(body.model_confirm_page || "/confirm/job-model", webBase);
    const customerConfirmationUrl = `${customerPage}?t=${encodeURIComponent(customerToken)}`;
    const modelConfirmationUrl = `${modelPage}?t=${encodeURIComponent(modelToken)}`;

    const sessionFields = compact({
      [field(env.AT_SESSIONS__SESSION_ID, SESSION_FIELDS.sessionId)]: sessionId,
      [SESSION_FIELDS.sessionStatus]: "Pending",
      [field(env.AT_SESSIONS__PAYMENT_STATUS, SESSION_FIELDS.paymentStatus)]: "pending",
      [field(env.AT_SESSIONS__PAYMENT_REF, SESSION_FIELDS.paymentRef)]: paymentRef,
      [field(env.AT_SESSIONS__AMOUNT_THB, SESSION_FIELDS.amountThb)]: amountThb,
      [SESSION_FIELDS.payModelThb]: payModelThb,
      [SESSION_FIELDS.clientName]: clientName,
      [SESSION_FIELDS.modelName]: modelName,
      [SESSION_FIELDS.jobType]: jobType,
      [SESSION_FIELDS.jobDate]: jobDate,
      [SESSION_FIELDS.startTime]: startAt,
      [SESSION_FIELDS.endTime]: endAt,
      [SESSION_FIELDS.locationName]: locationName,
      [SESSION_FIELDS.googleMapUrl]: googleMapUrl || undefined,
      [SESSION_FIELDS.note]: note || undefined,
      [SESSION_FIELDS.notes]: note || undefined,
      [SESSION_FIELDS.createdAt]: createdAt,
      [SESSION_FIELDS.customerConfirmationUrl]: customerConfirmationUrl,
      [SESSION_FIELDS.modelConfirmationUrl]: modelConfirmationUrl,
    });

    // Session payment truth is `payment_status`. Do not write the legacy
    // nonexistent `Payment Status`, generic `status=pending`, or payment_type
    // fields into Sessions.
    const sessionWrite = await upsertRecord(env, {
      table: sessionsTable(env),
      lookupFieldName: "session_id",
      lookupValue: sessionId,
      fields: sessionFields,
    });

    const paymentFields = compact({
      [field(env.AT_PAYMENTS__PAYMENT_REF, PAYMENT_FIELDS.paymentRef)]: paymentRef,
      [PAYMENT_FIELDS.sessionId]: sessionId,
      [field(env.AT_PAYMENTS__AMOUNT, PAYMENT_FIELDS.amount)]: amountThb,
      [field(env.AT_PAYMENTS__PAYMENT_STATUS, PAYMENT_FIELDS.paymentStatus)]: "Pending",
      [field(env.AT_PAYMENTS__PAYMENT_METHOD, PAYMENT_FIELDS.paymentMethod)]: paymentMethod,
      [field(env.AT_PAYMENTS__NOTES, PAYMENT_FIELDS.notes)]: note || undefined,
      [field(env.AT_PAYMENTS__VERIFICATION_STATUS, PAYMENT_FIELDS.verificationStatus)]: "pending_review",
      [field(env.AT_PAYMENTS__PAYMENT_INTENT_STATUS, PAYMENT_FIELDS.paymentIntentStatus)]: "Pending Confirmation",
      [field(env.AT_PAYMENTS__CREATED_AT, PAYMENT_FIELDS.createdAt)]: createdAt,
      [PAYMENT_FIELDS.paymentStage]: paymentStage,
      [PAYMENT_FIELDS.paymentType]: PAYMENT_TYPES.has(paymentStage) ? paymentStage : undefined,
    });

    // Payment Reference is canonical. Never write the read-only compatibility
    // formula field named `payment_ref` in Payments.
    const paymentWrite = await upsertRecord(env, {
      table: paymentsTable(env),
      lookupFieldName: "Payment Reference",
      lookupValue: paymentRef,
      fields: paymentFields,
    });

    await Promise.all([
      createConfirmTokenRecord(env, customerToken, customerClaims),
      createConfirmTokenRecord(env, modelToken, modelClaims),
    ]);

    try {
      await telegramSend(env, [
        "🔗 <b>CONFIRM LINKS CREATED</b>",
        `Session: <code>${escapeHtml(sessionId)}</code>`,
        `Payment Ref: <code>${escapeHtml(paymentRef)}</code>`,
        `Client: <b>${escapeHtml(clientName)}</b>`,
        `Model: <b>${escapeHtml(modelName)}</b>`,
        `Type: <b>${escapeHtml(jobType)}</b>`,
        `Amount: <b>${Number(amountThb)} THB</b>`,
        payModelThb != null ? `Pay Model: <b>${Number(payModelThb)} THB</b>` : "",
      ].filter(Boolean).join("\n"));
    } catch (_) {}

    return json(request, env, {
      ok: true,
      authority: "payments-worker",
      schema: "canonical_confirm_link_v1",
      session_id: sessionId,
      payment_ref: paymentRef,
      customer_t: customerToken,
      model_t: modelToken,
      customer_confirmation_url: customerConfirmationUrl,
      model_confirmation_url: modelConfirmationUrl,
      payment_write: paymentWrite,
      session_write: sessionWrite,
    });
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : 500;
    return json(request, env, {
      ok: false,
      authority: "payments-worker",
      error: clean(error?.message || error || "canonical_confirm_link_failed"),
    }, status);
  }
}

function sessionsTable(env) {
  return clean(env.AIRTABLE_TABLE_SESSIONS || "") || DEFAULT_TABLES.sessions;
}

function paymentsTable(env) {
  return clean(env.AIRTABLE_TABLE_PAYMENTS || "") || DEFAULT_TABLES.payments;
}

async function upsertRecord(env, { table, lookupFieldName, lookupValue, fields }) {
  const existing = await findOne(env, table, lookupFieldName, lookupValue);
  if (existing?.id) {
    const updated = await airtableRequest(
      env,
      `${encodeURIComponent(table)}/${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: false }),
      },
    );
    return { ok: true, mode: "update", record_id: updated?.id || existing.id };
  }

  const created = await airtableRequest(env, encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  const record = created?.records?.[0];
  if (!record?.id) throw httpError(502, "airtable_create_malformed");
  return { ok: true, mode: "create", record_id: record.id };
}

async function findOne(env, table, fieldName, value) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{${fieldName}}='${formulaValue(value)}'`);
  const payload = await airtableRequest(env, url.toString(), { method: "GET" }, true);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, `airtable_${safeCode(fieldName)}_ambiguous`);
  return records[0] || null;
}

async function airtableRequest(env, pathOrUrl, init = {}, absolute = false) {
  requireAirtable(env);
  const url = absolute
    ? pathOrUrl
    : `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${pathOrUrl}`;
  const request = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const response = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(request)
    : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = text(payload?.error?.message || payload?.error?.type || `HTTP ${response.status}`, 300);
    throw httpError(response.status || 502, `airtable_${response.status}:${detail}`);
  }
  return payload;
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_BASE_ID) || !clean(env.AIRTABLE_API_KEY)) {
    throw httpError(503, "airtable_not_ready");
  }
}

async function serviceAuthed(request, env) {
  const direct = clean(request.headers.get("X-Internal-Token"));
  const bearer = clean(request.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  const candidate = direct || bearer;
  const expected = [
    clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS),
    clean(env.AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS),
  ].filter(Boolean);
  if (!candidate || !expected.length) return false;
  for (const secret of expected) {
    if (await constantTimeEqual(candidate, secret)) return true;
  }
  return false;
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(clean(left))),
    crypto.subtle.digest("SHA-256", encoder.encode(clean(right))),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i += 1) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

function canonicalJobWindow(jobDate, startRaw, endRaw) {
  const startClock = parseClock(startRaw);
  const endClock = parseClock(endRaw);
  const startAt = canonicalDateTime(jobDate, startRaw, 0);
  let endDayOffset = 0;
  if (startClock && endClock && endClock.totalMinutes <= startClock.totalMinutes) endDayOffset = 1;
  const endAt = canonicalDateTime(jobDate, endRaw, endDayOffset);
  if (Date.parse(endAt) <= Date.parse(startAt)) throw httpError(400, "end_time_must_be_after_start_time");
  return { startAt, endAt };
}

function canonicalDateTime(jobDate, value, dayOffset) {
  const raw = clean(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    if (!Number.isFinite(Date.parse(raw))) throw httpError(400, "invalid_job_datetime");
    return raw;
  }
  const clock = parseClock(raw);
  if (!clock) throw httpError(400, "invalid_job_time");
  const date = dayOffset ? addDays(jobDate, dayOffset) : jobDate;
  return `${date}T${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}:${String(clock.second).padStart(2, "0")}+07:00`;
}

function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(clean(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return { hour, minute, second, totalMinutes: hour * 60 + minute };
}

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function canonicalDate(value, name) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw httpError(400, `${name}_invalid`);
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw httpError(400, `${name}_invalid`);
  }
  return raw;
}

function normalizeStage(value) {
  const stage = clean(value).toLowerCase();
  if (!PAYMENT_STAGES.has(stage)) throw httpError(400, "invalid_payment_stage");
  return stage;
}

function canonicalPaymentMethod(value) {
  const raw = clean(value).toLowerCase();
  if (raw.includes("prompt")) return "PromptPay";
  if (raw.includes("bank")) return "Bank Transfer";
  if (raw.includes("credit")) return "Credit Card";
  if (raw.includes("cash")) return "Cash";
  return "Other";
}

function positiveNumber(value, name) {
  const number = numeric(value);
  if (number == null || number <= 0) throw httpError(400, `${name}_must_be_positive_number`);
  return number;
}

function optionalNonNegativeNumber(value, name) {
  if (value == null || clean(value) === "") return undefined;
  const number = numeric(value);
  if (number == null || number < 0) throw httpError(400, `${name}_must_be_non_negative_number`);
  return number;
}

function numeric(value) {
  const raw = clean(value).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function requiredText(value, name, max) {
  const result = text(value, max);
  if (!result) throw httpError(400, `${name}_required`);
  return result;
}

function makeId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

function absoluteUrl(value, base) {
  const raw = clean(value);
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

async function telegramSend(env, message) {
  const token = clean(env.TELEGRAM_BOT_TOKEN);
  if (!token) return;
  const chatId = clean(env.TELEGRAM_CHAT_ID || "-1003546439681");
  const thread = clean(env.TG_THREAD_CONFIRM || "61");
  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (thread) payload.message_thread_id = Number(thread);
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function field(configured, fallback) {
  return clean(configured) || fallback;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function safeCode(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function text(value, max = 240) {
  return clean(value).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function json(request, env, data, status = 200) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-MMD-Payment-Authority": "payments-worker",
  });
  const origin = clean(request.headers.get("Origin"));
  const allow = clean(env.ALLOWED_ORIGINS)
    .replace(/^"|"$/g, "")
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  if (origin && allow.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(data), { status, headers });
}
