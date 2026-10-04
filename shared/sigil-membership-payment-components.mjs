const MARKER = "[MMD_MEMBERSHIP_ACTION_V1]";
const VERSION = "membership_action_v1";

// Pure canonical component validation, shared by admin preflight and payment issuer.
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
function clean(value) { return String(value ?? "").trim(); }
function moneyError(message, status = 409) { const error = new Error(message); error.status = status; return error; }
