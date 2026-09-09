import { verifyConfirmToken } from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
export const CONFIRM_DETAILS_PATH = "/v1/confirm/details";

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  sessionStatus: "fldmwuvOaiCFdzzRa",
  createdAt: "flduULqxy2FIuJuaf",
  amountThb: "fldhwC79ndbnEXSZz",
  customerAmountDueThb: "fldvJowquu8RrsOMc",
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
});

const PAYMENT_FIELDS = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  amountThb: "fldvCSwrUW8OMAooS",
  paymentStatus: "fldEJ1hmm7KwWuI6q",
  paymentMethod: "fldsblzIn0wzan3c9",
  paymentType: "fld1YPQ8j1CLxYeZ7",
  intentStatus: "fld04fr3bRJTohO6y",
  verificationStatus: "fldJ7a0Ube9F0bmRy",
  promptPayUrl: "fld8DEjbUmrzMWcNg",
  sessionId: "fld2wdhBvc8xrV6y5",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
});

export function isConfirmationDetailsRequest(path, method) {
  const normalized = String(path || "/").replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
  const verb = String(method || "GET").toUpperCase();
  return normalized === CONFIRM_DETAILS_PATH && (verb === "POST" || verb === "OPTIONS");
}

export async function handleConfirmationDetails(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") {
    return withCors(request, env, new Response(null, { status: 204 }));
  }
  if (request.method.toUpperCase() !== "POST") {
    return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));
  }
  if (!isAllowedOrigin(request, env)) {
    return withCors(request, env, json({ ok: false, error: "origin_not_allowed" }, 403));
  }

  const body = await request.json().catch(() => null);
  const token = clean(body?.t || body?.token, 12000);
  const expectedRole = clean(body?.expected_role || body?.role, 40).toLowerCase();
  if (!token) return withCors(request, env, json({ ok: false, error: "confirmation_token_required" }, 400));
  if (!["customer", "model"].includes(expectedRole)) {
    return withCors(request, env, json({ ok: false, error: "expected_role_required" }, 400));
  }

  try {
    const claims = await verifyConfirmToken(env, token, { expectedRole });
    const session = await findSession(env, claims.session_id);
    if (!session?.id) return withCors(request, env, json({ ok: false, error: "session_not_found" }, 404));

    const fields = session.fields || {};
    const sessionPaymentRef = text(fields[field(env.AT_SESSIONS__PAYMENT_REF, SESSION_FIELDS.paymentRef)], 200);
    if (sessionPaymentRef && sessionPaymentRef !== text(claims.payment_ref, 200)) {
      return withCors(request, env, json({ ok: false, error: "confirmation_session_mismatch" }, 409));
    }

    const note = clean(fields[SESSION_FIELDS.note] || fields[SESSION_FIELDS.notes], 8000);
    const pricing = parseMarkedJson(note, "SIGIL Pricing v1");
    const vip = parseMarkedJson(note, "SIGIL VIP Detail v1");
    const common = {
      ok: true,
      authority: "payments-worker",
      schema: "confirmation_details_v1",
      role: expectedRole,
      session_id: text(claims.session_id, 200),
      payment_ref: text(claims.payment_ref, 200),
      payment_type: text(claims.payment_type, 80),
      session_status: text(fields[SESSION_FIELDS.sessionStatus], 120),
      payment_status: text(fields[field(env.AT_SESSIONS__PAYMENT_STATUS, SESSION_FIELDS.paymentStatus)], 120),
      client_name: text(fields[SESSION_FIELDS.clientName], 240),
      model_name: text(fields[SESSION_FIELDS.modelName], 240),
      job_type: text(fields[SESSION_FIELDS.jobType], 240),
      job_date: text(fields[SESSION_FIELDS.jobDate], 120),
      start_time: text(fields[SESSION_FIELDS.startTime], 120),
      end_time: text(fields[SESSION_FIELDS.endTime], 120),
      location_name: text(fields[SESSION_FIELDS.locationName], 360),
      google_map_url: safeUrl(fields[SESSION_FIELDS.googleMapUrl]),
      vip_detail: text(vip?.vip_detail, 240) || null,
      created_at: text(fields[SESSION_FIELDS.createdAt], 120),
    };

    if (expectedRole === "customer") {
      const net = numberOrNull(fields[field(env.AT_SESSIONS__AMOUNT_THB, SESSION_FIELDS.amountThb)]);
      const safePricing = customerPricing(pricing, net);
      let paymentRecord = null;
      try {
        paymentRecord = await findPayment(env, claims.payment_ref, claims.session_id);
      } catch {}
      const customerAmountDue = numberOrNull(fields[SESSION_FIELDS.customerAmountDueThb]);
      return withCors(request, env, json({
        ...common,
        amount_thb: net,
        pricing: safePricing,
        payment: customerPaymentDisplay({
          paymentRecord,
          pricing: safePricing,
          customerAmountDue,
          claimedPaymentType: claims.payment_type,
          sessionPaymentStatus: common.payment_status,
          paymentRef: claims.payment_ref,
        }),
      }));
    }

    const modelPayout = numberOrNull(fields[SESSION_FIELDS.payModelThb]);
    return withCors(request, env, json({
      ...common,
      model_payout_thb: modelPayout,
      amount_thb: modelPayout,
      amount_scope: "model_payout",
    }));
  } catch (error) {
    return withCors(request, env, json({
      ok: false,
      error: clean(error?.message || "confirmation_details_failed", 200),
    }, errorStatus(error)));
  }
}

function customerPricing(raw, netFallback) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const full = numberOrNull(source.full_price_thb);
  const discount = numberOrNull(source.discount_thb);
  const net = numberOrNull(source.net_price_thb) ?? netFallback;
  const basis = numberOrNull(source.deposit_basis_thb) ?? full;
  return {
    full_price_thb: full,
    discount_mode: text(source.discount_mode, 40) || "none",
    discount_percent: numberOrNull(source.discount_percent),
    discount_thb: discount,
    net_price_thb: net,
    deposit_basis_thb: basis,
    deposit_percent: numberOrNull(source.deposit_percent),
    deposit_due_thb: numberOrNull(source.deposit_due_thb),
    deposit_received_thb: numberOrNull(source.deposit_received_thb),
    balance_thb: numberOrNull(source.balance_thb),
  };
}

function customerPaymentDisplay({ paymentRecord, pricing, customerAmountDue, claimedPaymentType, sessionPaymentStatus, paymentRef }) {
  const fields = paymentRecord?.fields || {};
  const storedStage = normalizePaymentStage(fields[PAYMENT_FIELDS.paymentStage] || fields[PAYMENT_FIELDS.paymentType]);
  const stage = storedStage || normalizePaymentStage(claimedPaymentType);
  const amountDue = paymentAmountDue(stage, pricing, customerAmountDue);
  const method = text(fields[PAYMENT_FIELDS.paymentMethod], 80).toLowerCase() || (safeUrl(fields[PAYMENT_FIELDS.promptPayUrl]) ? "promptpay" : null);
  const promptPayUrl = safeUrl(fields[PAYMENT_FIELDS.promptPayUrl]) || null;
  const verified = isVerifiedPayment(
    fields[PAYMENT_FIELDS.verificationStatus],
    fields[PAYMENT_FIELDS.paymentStatus],
    sessionPaymentStatus,
  );
  const proofReceived = isProofReceived(fields[PAYMENT_FIELDS.intentStatus], fields[PAYMENT_FIELDS.verificationStatus]);

  return {
    schema: "customer_payment_display_v1",
    stage: stage || null,
    method: method || null,
    amount_due_thb: amountDue,
    qr_url: promptPayUrl,
    proof_upload_supported: Boolean(text(paymentRef, 200)),
    proof_received: proofReceived,
    verified,
  };
}

function paymentAmountDue(stage, pricing, customerAmountDue) {
  if (stage === "deposit") return numberOrNull(pricing?.deposit_due_thb) ?? customerAmountDue;
  if (stage === "balance" || stage === "final") return numberOrNull(pricing?.balance_thb) ?? customerAmountDue;
  if (stage === "full") return numberOrNull(pricing?.net_price_thb) ?? customerAmountDue;
  return customerAmountDue;
}

function normalizePaymentStage(value) {
  const raw = text(value, 80).toLowerCase().replace(/[\s_-]+/g, "");
  if (["deposit", "มัดจำ"].includes(raw)) return "deposit";
  if (["balance", "remaining", "remainder", "คงเหลือ"].includes(raw)) return "balance";
  if (["final", "finalpayment"].includes(raw)) return "final";
  if (["full", "fullpayment", "payinfull"].includes(raw)) return "full";
  return "";
}

function isVerifiedPayment(...values) {
  const accepted = new Set(["verified", "approved", "paid", "completed", "complete"]);
  return values.some((value) => accepted.has(text(value, 80).toLowerCase()));
}

function isProofReceived(...values) {
  const accepted = new Set(["evidence_received", "proof_received", "submitted", "pending_review", "reviewing"]);
  return values.some((value) => accepted.has(text(value, 80).toLowerCase().replace(/[\s-]+/g, "_")));
}

function parseMarkedJson(note, label) {
  const source = String(note || "");
  const marker = `[${String(label)}]`;
  let searchEnd = source.length;

  while (searchEnd > 0) {
    const markerIndex = source.lastIndexOf(marker, searchEnd - 1);
    if (markerIndex < 0) return null;

    let start = markerIndex + marker.length;
    while (start < source.length && /\s/.test(source[start])) start += 1;
    if (source[start] !== "{") {
      searchEnd = markerIndex;
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let parsed = null;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") {
        depth += 1;
        continue;
      }
      if (char === "}") {
        depth -= 1;
        if (depth !== 0) continue;
        try {
          const candidate = JSON.parse(source.slice(start, i + 1));
          if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) parsed = candidate;
        } catch {}
        break;
      }
    }
    if (parsed) return parsed;
    searchEnd = markerIndex;
  }
  return null;
}

async function findSession(env, sessionId) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !tableId || !apiKey) throw httpError(503, "airtable_not_ready");

  const formula = `{session_id}='${formulaValue(sessionId)}'`;
  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: formula,
    returnFieldsByFieldId: "true",
  });
  const req = new Request(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}?${query.toString()}`, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : 500, "airtable_request_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1) throw httpError(409, "session_id_ambiguous");
  return records[0] || null;
}

async function findPayment(env, paymentRef, sessionId) {
  const ref = text(paymentRef, 200);
  const sid = text(sessionId, 200);
  if (!ref || !sid) return null;

  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !tableId || !apiKey) return null;

  const formula = `AND({Payment Reference}='${formulaValue(ref)}',{session_id}='${formulaValue(sid)}')`;
  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: formula,
    returnFieldsByFieldId: "true",
  });
  const req = new Request(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}?${query.toString()}`, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : 500, "airtable_payment_request_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1) return null;
  const record = records[0] || null;
  if (!record?.fields) return null;
  const recordRef = text(record.fields[PAYMENT_FIELDS.paymentRef], 200);
  const recordSessionId = text(record.fields[PAYMENT_FIELDS.sessionId], 200);
  if (recordRef !== ref || recordSessionId !== sid) return null;
  return record;
}

function allowedOrigins(env = {}) {
  return clean(env.ALLOWED_ORIGINS || "", 5000)
    .replace(/^[\"']|[\"']$/g, "")
    .split(",")
    .map((value) => value.trim().replace(/^[\"']|[\"']$/g, ""))
    .filter(Boolean);
}

function corsHeaders(request, env = {}) {
  const origin = clean(request.headers.get("origin"), 500);
  const headers = new Headers({
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  });
  if (origin && allowedOrigins(env).includes(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function withCors(request, env, response) {
  const headers = new Headers(response.headers);
  corsHeaders(request, env).forEach((value, key) => headers.set(key, value));
  headers.set("cache-control", "no-store, private");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isAllowedOrigin(request, env = {}) {
  const origin = clean(request.headers.get("origin"), 500);
  return Boolean(origin && allowedOrigins(env).includes(origin));
}

function errorStatus(error) {
  if (Number.isInteger(error?.status)) return error.status;
  const code = clean(error?.message, 200);
  if (code === "confirmation_token_expired") return 410;
  if (code.startsWith("airtable_")) return 503;
  return 401;
}

function field(configured, fallback) {
  return clean(configured, 100) || fallback;
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeUrl(value) {
  const raw = text(value, 1200);
  return /^https:\/\//i.test(raw) ? raw : "";
}

function text(value, max = 5000) {
  return clean(value, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max);
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
