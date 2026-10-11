import { verifyConfirmToken } from "./index.js";
import { stablePaymentRef } from "./unified-payment-proof.js";
import {
  SESSION_FIELDS,
  clean,
  errorStatus,
  field,
  findSession,
  isAllowedOrigin,
  json,
  numberOrNull,
  parseMarkedJson,
  text,
  withCors,
} from "./confirmation-details.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const MEMBER_PAGES_REDEEM_URL = "https://member-pages-worker.internal/__internal/care-back/redeem-code";
const SERVICE_HEADER = "x-mmd-payments-secret";
const PRICING_LABEL = "SIGIL Pricing v1";
const PROMO_LABEL = "SIGIL Promo v1";
const SERVICE_DATE_WINDOW_DAYS = 90;

export const CONFIRM_APPLY_PROMO_PATH = "/v1/confirm/apply-promo";

export function isConfirmApplyPromoRequest(path, method) {
  const normalized = String(path || "/").replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
  const verb = String(method || "GET").toUpperCase();
  return normalized === CONFIRM_APPLY_PROMO_PATH && (verb === "POST" || verb === "OPTIONS");
}

// The browser only sends the signed customer confirmation token and the 6-character
// code. Everything that changes money is decided here: member-pages-worker owns the
// coupon (validity, single use, percent from Model level x job format) and this
// worker only rewrites the session price from the percent it returns.
export async function handleConfirmApplyPromo(request, env = {}, now = new Date()) {
  const verb = request.method.toUpperCase();
  if (verb === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (verb !== "POST") return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));
  if (!isAllowedOrigin(request, env)) return withCors(request, env, json({ ok: false, error: "origin_not_allowed" }, 403));

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return withCors(request, env, json({ ok: false, error: "invalid_json" }, 400));
  }
  for (const key of ["percent", "discount_percent", "approved_discount_percent", "discount_thb", "amount", "amount_thb", "net_price_thb"]) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return withCors(request, env, json({ ok: false, error: "caller_discount_authority_rejected" }, 400));
    }
  }
  const token = clean(body.t || body.token, 12000);
  const code = clean(body.code || body.promo_code, 40).toUpperCase();
  if (!token) return withCors(request, env, json({ ok: false, error: "confirmation_token_required" }, 400));
  if (!/^[A-Z0-9]{6}$/.test(code)) return withCors(request, env, json({ ok: false, error: "promo_code_invalid_format" }, 400));

  try {
    const claims = await verifyConfirmToken(env, token, { expectedRole: "customer" });
    const session = await findSession(env, claims.session_id);
    if (!session?.id) return withCors(request, env, json({ ok: false, error: "session_not_found" }, 404));
    const fields = session.fields || {};

    const sessionPaymentRef = text(fields[field(env.AT_SESSIONS__PAYMENT_REF, SESSION_FIELDS.paymentRef)], 200);
    const finalPaymentRef = await stablePaymentRef(claims.session_id, "final");
    if (sessionPaymentRef && !new Set([text(claims.payment_ref, 200), finalPaymentRef]).has(sessionPaymentRef)) {
      return withCors(request, env, json({ ok: false, error: "confirmation_session_mismatch" }, 409));
    }

    const noteField = clean(fields[SESSION_FIELDS.note], 8000) ? SESSION_FIELDS.note : SESSION_FIELDS.notes;
    const note = clean(fields[noteField], 8000);
    const pricing = parseMarkedJson(note, PRICING_LABEL);
    const full = numberOrNull(pricing?.full_price_thb);
    if (!pricing || !full || full <= 0) return fail(request, env, 409, "pricing_unavailable");

    const paymentStatus = text(fields[field(env.AT_SESSIONS__PAYMENT_STATUS, SESSION_FIELDS.paymentStatus)], 120).toLowerCase();
    if (["verified", "approved", "paid", "completed", "complete"].includes(paymentStatus)) {
      return fail(request, env, 409, "payment_already_verified");
    }

    // Deposit is priced from the full price, so a discount never changes the amount
    // the customer is about to pay. Full/balance payment intents (QR, PayPal) are
    // already issued for a fixed amount and would go stale, so they are refused.
    if (clean(claims.payment_type).toLowerCase() !== "deposit") return fail(request, env, 409, "promo_only_on_deposit_stage");

    const prior = parseMarkedJson(note, PROMO_LABEL);
    if (prior?.source === "care_back") {
      if (clean(prior.code).toUpperCase() === code) {
        return withCors(request, env, json({ ok: true, applied: true, already_applied: true, ...summary(pricing) }));
      }
      return fail(request, env, 409, "promo_already_applied");
    }
    if (clean(pricing.discount_mode).toLowerCase() !== "none" || numberOrNull(pricing.discount_thb) > 0) {
      return fail(request, env, 409, "discount_already_applied");
    }

    const jobDate = Date.parse(text(fields[SESSION_FIELDS.jobDate], 120));
    if (Number.isFinite(jobDate) && jobDate > now.getTime() + SERVICE_DATE_WINDOW_DAYS * 86400000) {
      return fail(request, env, 409, "service_date_outside_window");
    }

    const jobFormat = jobFormatFrom(fields[SESSION_FIELDS.jobType], note);
    const modelName = text(fields[SESSION_FIELDS.modelName], 240);
    if (!jobFormat) return fail(request, env, 409, "job_format_unresolved");
    if (!modelName) return fail(request, env, 409, "model_unresolved");

    const secret = clean(env.AUTH_SERVICE_PAYMENTS_TO_MEMBER_PAGES);
    if (secret.length < 32 || !env.MEMBER_PAGES_WORKER?.fetch) return fail(request, env, 503, "promo_service_not_configured");

    const upstream = await env.MEMBER_PAGES_WORKER.fetch(new Request(MEMBER_PAGES_REDEEM_URL, {
      method: "POST",
      headers: { "content-type": "application/json", [SERVICE_HEADER]: secret },
      body: JSON.stringify({
        code,
        session_id: text(claims.session_id, 200),
        selected_model_name: modelName,
        job_format: jobFormat,
      }),
    }));
    const redeemed = await upstream.json().catch(() => null);
    if (!upstream.ok || redeemed?.ok !== true) {
      const status = upstream.status === 409 ? 409 : 503;
      return fail(request, env, status, clean(redeemed?.error, 80) || "promo_service_unavailable");
    }
    const percent = Number(redeemed.approved_discount_percent);
    if (!Number.isInteger(percent) || percent < 3 || percent > 20) return fail(request, env, 502, "promo_percent_invalid");

    const next = discountedPricing(pricing, full, percent);
    const nextNote = withReplacedMarkedJson(withReplacedMarkedJson(note, PRICING_LABEL, next), PROMO_LABEL, {
      source: "care_back",
      code,
      percent,
      applied_at: now.toISOString(),
    }, true);
    const patch = { [noteField]: nextNote, [SESSION_FIELDS.amountThb]: next.net_price_thb };
    const oldDue = numberOrNull(fields[SESSION_FIELDS.customerAmountDueThb]);
    if (oldDue !== null && oldDue === numberOrNull(pricing.balance_thb)) patch[SESSION_FIELDS.customerAmountDueThb] = next.balance_thb;
    await patchSession(env, session.id, patch);

    return withCors(request, env, json({ ok: true, applied: true, already_applied: false, ...summary(next) }));
  } catch (error) {
    return withCors(request, env, json({ ok: false, error: clean(error?.message || "apply_promo_failed", 120) }, errorStatus(error)));
  }
}

export function discountedPricing(pricing, full, percent) {
  const discount = Math.round(full * percent / 100);
  const net = full - discount;
  const full_payment = clean(pricing.payment_type).toLowerCase() === "full";
  const received = full_payment ? net : Math.max(0, numberOrNull(pricing.deposit_received_thb) || 0);
  // Create Job prices the balance as "net minus the deposit" even before the deposit
  // arrives (full 25,000 / deposit 7,500 -> balance 17,500 with deposit_received 0),
  // so the deposit counts as soon as it is due. The deposit itself never changes.
  const depositCovered = Math.max(received, numberOrNull(pricing.deposit_due_thb) || 0);
  return {
    ...pricing,
    discount_mode: "percent",
    discount_percent: percent,
    discount_thb: discount,
    net_price_thb: net,
    deposit_received_thb: received,
    balance_thb: full_payment ? 0 : Math.max(0, net - depositCovered),
  };
}

export function jobFormatFrom(jobType, note) {
  const tokens = (value) => new Set(String(value || "").toLowerCase().split(/[^a-z]+/).filter(Boolean));
  const fromType = tokens(jobType);
  const hasVip = fromType.has("vip");
  const hasPn = fromType.has("pn");
  if (hasVip !== hasPn) return hasVip ? "VIP" : "PN";
  if (hasVip && hasPn) return "";
  const work = /work\s+(pn|vip)\b/i.exec(String(note || ""));
  return work ? work[1].toUpperCase() : "";
}

// Replace the JSON object that follows the LAST "[label]" marker, keeping its
// position so every reader (some read the first marker, some the last) sees the
// same value. When the marker does not exist it is appended only if `append`.
export function withReplacedMarkedJson(note, label, value, append = false) {
  const source = String(note || "");
  const marker = `[${label}]`;
  const encoded = JSON.stringify(value);
  const markerIndex = source.lastIndexOf(marker);
  if (markerIndex < 0) return append ? `${source}${source && !source.endsWith("\n") ? "\n" : ""}${marker} ${encoded}` : source;
  let start = markerIndex + marker.length;
  while (start < source.length && /\s/.test(source[start])) start += 1;
  if (source[start] !== "{") return append ? `${source}\n${marker} ${encoded}` : source;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return `${source.slice(0, markerIndex + marker.length)} ${encoded}${source.slice(i + 1)}`;
    }
  }
  return source;
}

function summary(pricing) {
  return {
    pricing: {
      full_price_thb: numberOrNull(pricing.full_price_thb),
      discount_mode: text(pricing.discount_mode, 40) || "none",
      discount_percent: numberOrNull(pricing.discount_percent),
      discount_thb: numberOrNull(pricing.discount_thb),
      net_price_thb: numberOrNull(pricing.net_price_thb),
      deposit_due_thb: numberOrNull(pricing.deposit_due_thb),
      deposit_received_thb: numberOrNull(pricing.deposit_received_thb),
      balance_thb: numberOrNull(pricing.balance_thb),
    },
  };
}

function fail(request, env, status, error) {
  return withCors(request, env, json({ ok: false, error }, status));
}

async function patchSession(env, recordId, fields) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !apiKey) throw Object.assign(new Error("airtable_not_ready"), { status: 503 });
  const req = new Request(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  if (!response.ok) throw Object.assign(new Error("promo_session_update_failed_retry"), { status: 503 });
}
