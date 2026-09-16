import { awardBasePointsPhase1 } from "./points-phase1.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const RECOVERY_PRICES = Object.freeze({ standard: new Set([499, 799, 1000]), premium: new Set([999, 1999, 2500]) });

export function isEmailLessLineRenewalMoneyTruth(body = {}) {
  const stage = clean(body.payment_stage || body.stage || body.payment_type).toLowerCase();
  const memberEmail = clean(body.member_email || body.email).toLowerCase();
  const notes = clean(body.notes);
  return stage === "membership" && !memberEmail && /(?:^|;\s*)recovered_member_id=[^;\s]+/i.test(notes);
}

export async function commitEmailLessLineRenewalMoneyTruth(env = {}, body = {}) {
  try {
    if (!isEmailLessLineRenewalMoneyTruth(body)) {
      return json({ ok: false, error: "not_email_less_line_renewal_recovery", authority: "payments-worker" }, 400);
    }

    requireAirtable(env);
    const paymentRef = text(body.payment_ref || body.transaction_ref, 180);
    const amountThb = positiveAmount(body.amount_thb ?? body.amount);
    const packageCode = canonicalPackage(body.package_code || body.package);
    const memberId = recoveredMemberId(body.notes);

    if (!paymentRef) throw httpError(400, "payment_ref_required");
    if (amountThb == null) throw httpError(400, "amount_thb_required");
    if (!packageCode) throw httpError(400, "package_code_required_for_membership_payment");
    if (!memberId) throw httpError(409, "recovered_member_id_required");

    const expectedPrices = RECOVERY_PRICES[packageCode];
    if (!expectedPrices || !expectedPrices.has(amountThb)) {
      throw httpError(409, "recovery_package_amount_mismatch");
    }

    const existing = await findPaymentByCanonicalReference(env, paymentRef);
    if (existing?.id) {
      const existingAmount = positiveAmount(existing.fields?.Amount ?? existing.fields?.amount_thb ?? existing.fields?.amount);
      if (existingAmount != null && Math.abs(existingAmount - amountThb) > 0.009) {
        throw httpError(409, "canonical_payment_amount_mismatch");
      }
    }

    const fields = canonicalPaymentFields(env, {
      payment_ref: paymentRef,
      amount_thb: amountThb,
      package_code: packageCode,
      payment_method: body.payment_method,
      paid_at: body.paid_at,
      notes: body.notes,
    });

    const payment = existing?.id
      ? await airtableUpdate(env, paymentsTable(env), existing.id, fields)
      : await airtableCreate(env, paymentsTable(env), fields);

    let pointsLedger = { ok: true, awarded: false, skipped: true, reason: "points_not_attempted" };
    try {
      pointsLedger = await awardBasePointsPhase1(env, {
        payment_ref: paymentRef,
        stage: "membership",
        amount_thb: amountThb,
        member_id: memberId,
        member_email: "",
      });
    } catch (error) {
      pointsLedger = {
        ok: false,
        awarded: false,
        error: clean(error?.message || error || "points_phase1_failed"),
      };
    }

    return json({
      ok: true,
      authority: "payments-worker",
      payment_ref: paymentRef,
      payment_stage: "membership",
      duplicate: Boolean(existing?.id),
      idempotent: Boolean(existing?.id),
      payment_write: {
        ok: true,
        mode: existing?.id ? "update" : "create",
        record_id: payment?.id || existing?.id || null,
        canonical_reference_field: "Payment Reference",
      },
      points_ledger: pointsLedger,
    });
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "canonical_payment_write_failed"),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

function canonicalPaymentFields(env, input) {
  const fields = {};
  put(fields, env.AT_PAYMENTS__PAYMENT_REF || "Payment Reference", input.payment_ref);
  put(fields, env.AT_PAYMENTS__PAYMENT_DATE || "Payment Date", paymentDate(input.paid_at));
  put(fields, env.AT_PAYMENTS__AMOUNT || "Amount", input.amount_thb);
  put(fields, env.AT_PAYMENTS__PAYMENT_STATUS || "Payment Status", "Paid");
  put(fields, env.AT_PAYMENTS__PAYMENT_METHOD || "Payment Method", canonicalPaymentMethod(input.payment_method));
  put(fields, env.AT_PAYMENTS__NOTES || "Notes", reviewedNote(input.notes, input.payment_ref));
  put(fields, env.AT_PAYMENTS__VERIFICATION_STATUS || "Verification Status", "verified");
  put(fields, env.AT_PAYMENTS__PAYMENT_INTENT_STATUS || "Payment Intent Status (AI)", "Confirmed");
  put(fields, env.AT_PAYMENTS__PACKAGE_CODE || "Package Code", input.package_code);
  put(fields, env.AT_PAYMENTS__CREATED_AT || "Created At", new Date().toISOString());
  return fields;
}

async function findPaymentByCanonicalReference(env, paymentRef) {
  const formula = `{Payment Reference}='${formulaValue(paymentRef)}'`;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(paymentsTable(env))}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", formula);
  const payload = await airtableRequest(env, url.toString(), { method: "GET" });
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, "canonical_payment_reference_ambiguous");
  return records[0] || null;
}

async function airtableCreate(env, table, fields) {
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`;
  const payload = await airtableRequest(env, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  const record = payload?.records?.[0];
  if (!record?.id) throw httpError(502, "airtable_payment_create_malformed");
  return record;
}

async function airtableUpdate(env, table, recordId, fields) {
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  const payload = await airtableRequest(env, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  });
  if (!payload?.id) throw httpError(502, "airtable_payment_update_malformed");
  return payload;
}

async function airtableRequest(env, url, init = {}) {
  const request = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
      ...(init.headers || {}),
    },
  });
  const response = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(request)
    : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = clean(payload?.error?.message || payload?.error?.type || `airtable_${response.status}`);
    throw httpError(response.status || 502, `airtable_${response.status}:${detail}`);
  }
  return payload;
}

function paymentsTable(env) {
  return clean(env.AIRTABLE_TABLE_PAYMENTS || env.AIRTABLE_TABLE_PAYMENTS_ID || "tblWGGJJOx5eBvBZJ");
}

function recoveredMemberId(notes) {
  const match = clean(notes).match(/(?:^|;\s*)recovered_member_id=([^;\s]+)/i);
  return text(match?.[1], 120);
}

function reviewedNote(notes, paymentRef) {
  const base = text(notes, 1200);
  const marker = `official_reviewed_recovery=true; payment_ref=${paymentRef}`;
  return base ? `${base}; ${marker}` : marker;
}

function paymentDate(value) {
  const raw = clean(value);
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1];
  if (direct) return direct;
  return new Date().toISOString().slice(0, 10);
}

function canonicalPaymentMethod(value) {
  const raw = clean(value).toLowerCase();
  if (raw.includes("prompt")) return "PromptPay";
  if (raw.includes("bank")) return "Bank Transfer";
  if (raw.includes("credit")) return "Credit Card";
  if (raw.includes("cash")) return "Cash";
  return "Other";
}

function canonicalPackage(value) {
  const raw = clean(value).toLowerCase();
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "";
}

function positiveAmount(value) {
  if (value == null || clean(value) === "") return null;
  const normalized = clean(value).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function put(fields, key, value) {
  const field = clean(key);
  if (!field || value === undefined || value === null || value === "") return;
  fields[field] = value;
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID) || !paymentsTable(env)) {
    throw httpError(503, "airtable_not_ready");
  }
}

function text(value, max = 240) {
  return clean(value).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}
function clean(value) { return String(value ?? "").trim(); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-MMD-Payment-Authority": "payments-worker",
    },
  });
}
