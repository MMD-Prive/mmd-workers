const AIRTABLE_API = "https://api.airtable.com/v0";
const MARKER = "[MMD_MEMBERSHIP_ACTION_V1]";
const VERSION = "membership_action_v1";
const DEFAULT_TABLES = Object.freeze({
  sessions: "tblC98mKWbzmPuNzX",
  payments: "tblWGGJJOx5eBvBZJ",
});
const DEFAULT_FIELDS = Object.freeze({
  sessionAmountThb: "fldhwC79ndbnEXSZz",
  paymentAmount: "fldvCSwrUW8OMAooS",
  paymentNotes: "fldjsZIKoJPawlb2u",
});

export function parseSigilMembershipPaymentComponents(note, expectedCustomerTotal = null) {
  const raw = clean(note);
  const markerAt = raw.indexOf(MARKER);
  if (markerAt < 0) return null;

  const jsonStart = markerAt + MARKER.length;
  const jsonText = raw.slice(jsonStart).split("\n", 1)[0].trim();
  let action;
  try {
    action = JSON.parse(jsonText);
  } catch (_) {
    throw moneyError("sigil_membership_action_marker_invalid_json");
  }
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw moneyError("sigil_membership_action_marker_invalid");
  }

  if (clean(action.version) !== VERSION) throw moneyError("sigil_membership_action_version_invalid");
  if (clean(action.type) !== "renew") throw moneyError("sigil_membership_action_type_invalid");
  if (clean(action.source) !== "sigil_jobs") throw moneyError("sigil_membership_action_source_invalid");
  if (clean(action.state) !== "pending_official_verify") throw moneyError("sigil_membership_action_state_invalid");
  if (clean(action.materialization_policy) !== "official_verify_required") {
    throw moneyError("sigil_membership_action_materialization_policy_invalid");
  }
  if (action.entitlement_mutation_allowed !== false) {
    throw moneyError("sigil_membership_action_entitlement_boundary_invalid");
  }
  if (action.points_eligible !== false || action.service_spend_eligible !== false || action.referral_reward_eligible !== false) {
    throw moneyError("sigil_membership_action_reward_boundary_invalid");
  }

  const serviceAmountThb = positiveMoney(action.service_amount_thb, "sigil_service_amount_invalid");
  const renewalAmountThb = positiveMoney(action.renewal_amount_thb, "sigil_renewal_amount_invalid");
  const customerTotalThb = positiveMoney(action.customer_total_thb, "sigil_customer_total_invalid");
  const includeInPayment = action.include_in_payment === true;
  const expectedTotal = includeInPayment ? serviceAmountThb + renewalAmountThb : serviceAmountThb;
  if (!sameMoney(customerTotalThb, expectedTotal)) throw moneyError("sigil_membership_action_total_mismatch");

  const expected = optionalPositiveMoney(expectedCustomerTotal);
  if (expected != null && !sameMoney(customerTotalThb, expected)) {
    throw moneyError("sigil_membership_action_payment_amount_mismatch");
  }

  return Object.freeze({
    version: VERSION,
    type: "renew",
    source: "sigil_jobs",
    include_in_payment: includeInPayment,
    service_amount_thb: serviceAmountThb,
    membership_renewal_amount_thb: renewalAmountThb,
    customer_total_thb: customerTotalThb,
    points_eligible_amount_thb: serviceAmountThb,
    service_spend_amount_thb: serviceAmountThb,
    referral_reward_eligible_amount_thb: serviceAmountThb,
    membership_fee_points_eligible: false,
    membership_fee_service_spend_eligible: false,
    membership_fee_referral_reward_eligible: false,
    state: "pending_official_verify",
    materialization_policy: "official_verify_required",
  });
}

export async function reconcileSigilConfirmLinkMoneyTruth(request, response, env = {}) {
  if (!response || response.status < 200 || response.status >= 300) return response;
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;

  const note = clean(body.note || body.notes);
  if (!note.includes(MARKER)) return response;

  let components;
  try {
    components = parseSigilMembershipPaymentComponents(note, body.amount_thb ?? body.amount);
  } catch (error) {
    return json({ ok: false, authority: "payments-worker", error: clean(error?.message || error) }, Number(error?.status || 409));
  }
  if (!components) return response;

  const payload = await response.clone().json().catch(() => null);
  const sessionId = clean(payload?.session_id || payload?.sessionId);
  if (!sessionId) {
    return json({ ok: false, authority: "payments-worker", error: "sigil_membership_action_session_id_missing" }, 502);
  }

  try {
    await patchSessionServiceAmount(env, sessionId, components.service_amount_thb);
  } catch (error) {
    return json({
      ok: false,
      authority: "payments-worker",
      error: clean(error?.message || error || "sigil_session_service_amount_reconcile_failed"),
    }, Number(error?.status || 502));
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("x-mmd-payment-components", VERSION);
  return new Response(JSON.stringify({
    ...payload,
    pricing_breakdown: components,
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function resolveSigilCombinedPaymentComponents(env = {}, paymentRef = "", expectedCustomerTotal = null) {
  const ref = clean(paymentRef);
  if (!ref) return null;
  requireAirtable(env);

  const payment = await findOne(env, paymentsTable(env), "Payment Reference", ref);
  if (!payment) return null;
  const fields = payment.fields || {};
  const notes = first(fields, [
    "Notes",
    "notes",
    field(env.AT_PAYMENTS__NOTES, DEFAULT_FIELDS.paymentNotes),
  ]);
  if (!clean(notes).includes(MARKER)) return null;

  const paymentAmount = positiveMoney(first(fields, [
    "Amount",
    "amount_thb",
    "amount",
    field(env.AT_PAYMENTS__AMOUNT, DEFAULT_FIELDS.paymentAmount),
  ]), "canonical_payment_amount_invalid");
  const expected = optionalPositiveMoney(expectedCustomerTotal);
  if (expected != null && !sameMoney(paymentAmount, expected)) throw moneyError("canonical_payment_amount_mismatch");

  const components = parseSigilMembershipPaymentComponents(notes, paymentAmount);
  if (!components?.include_in_payment) return null;
  return components;
}

export async function enforceSigilSessionServiceAmount(env = {}, sessionId = "", components = null) {
  if (!components || !clean(sessionId)) return;
  await patchSessionServiceAmount(env, sessionId, components.service_amount_thb);
}

async function patchSessionServiceAmount(env, sessionId, serviceAmountThb) {
  requireAirtable(env);
  const session = await findOne(env, sessionsTable(env), "session_id", sessionId);
  if (!session?.id) throw moneyError("canonical_session_not_found", 409);
  const amountField = field(env.AT_SESSIONS__AMOUNT_THB, DEFAULT_FIELDS.sessionAmountThb);
  await airtableRequest(env, `${encodeURIComponent(sessionsTable(env))}/${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { [amountField]: serviceAmountThb }, typecast: false }),
  });
}

async function findOne(env, table, fieldName, value) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{${fieldName}}='${formulaValue(value)}'`);
  const payload = await airtableRequest(env, url.toString(), { method: "GET" }, true);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length > 1) throw moneyError(`airtable_${safeCode(fieldName)}_ambiguous`, 409);
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
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = clean(payload?.error?.message || payload?.error?.type || `HTTP ${response.status}`);
    throw moneyError(`airtable_${response.status}:${detail}`, response.status || 502);
  }
  return payload;
}

function sessionsTable(env) {
  return clean(env.AIRTABLE_TABLE_SESSIONS) || DEFAULT_TABLES.sessions;
}
function paymentsTable(env) {
  return clean(env.AIRTABLE_TABLE_PAYMENTS) || DEFAULT_TABLES.payments;
}
function requireAirtable(env) {
  if (!clean(env.AIRTABLE_BASE_ID) || !clean(env.AIRTABLE_API_KEY)) throw moneyError("airtable_not_ready", 503);
}
function field(value, fallback) { return clean(value) || fallback; }
function first(fields, keys) {
  for (const key of keys) {
    if (key && fields[key] !== undefined && fields[key] !== null && fields[key] !== "") return fields[key];
  }
  return undefined;
}
function positiveMoney(value, code) {
  const amount = optionalPositiveMoney(value);
  if (amount == null) throw moneyError(code);
  return amount;
}
function optionalPositiveMoney(value) {
  if (value == null || clean(value) === "") return null;
  const amount = Number(clean(value).replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
function sameMoney(a, b) { return Math.abs(Number(a) - Number(b)) <= 0.009; }
function formulaValue(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function safeCode(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 100); }
function clean(value) { return String(value ?? "").trim(); }
function moneyError(message, status = 409) { const error = new Error(message); error.status = status; return error; }
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
