const MEMBERSHIP_AMOUNTS = Object.freeze({
  499: { package_code: "standard", intent: "renewal", price_rule: "private_standard_spend_50000" },
  690: { package_code: "mmd_member", intent: "membership", price_rule: "public_member" },
  799: { package_code: "standard", intent: "renewal", price_rule: "private_standard_spend_10000" },
  999: { package_code: "premium", intent: "renewal", price_rule: "private_premium_spend_100000" },
  1000: { package_code: "standard", intent: "renewal", price_rule: "private_standard_renewal" },
  1199: { package_code: "standard", intent: "signup", price_rule: "private_standard_signup" },
  1999: { package_code: "premium", intent: "renewal", price_rule: "private_premium_spend_20000" },
  2500: { package_code: "premium", intent: "renewal", price_rule: "private_premium_renewal" },
  2999: { package_code: "premium", intent: "signup", price_rule: "private_premium_signup" },
  4990: { package_code: "elite", intent: "membership", price_rule: "public_elite" },
  11499: { package_code: "red_card", intent: "membership", price_rule: "public_red_card" },
});

const TERM_DAYS = Object.freeze({ standard: 365, premium: 730, mmd_member: 365, elite: 730, red_card: 365 });
const clean = (value) => (value == null ? "" : String(value).trim());
const moneyKey = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && Math.abs(amount - Math.round(amount)) < 0.01 ? Math.round(amount) : null;
};

export function inferMembershipPayment({ amount_thb, linked_member = false, linked_renewal = false, package_code = "", source_context = "" } = {}) {
  const amount = moneyKey(amount_thb);
  const rule = amount == null ? null : MEMBERSHIP_AMOUNTS[amount];
  if (!rule) return null;
  const explicitPackage = clean(package_code).toLowerCase();
  const packageMatches = !explicitPackage || explicitPackage === rule.package_code;
  const renewalEvidence = Boolean(linked_renewal) || (Boolean(linked_member) && rule.intent === "renewal");
  const confidence = !packageMatches ? 0.35 : linked_renewal ? 0.99 : renewalEvidence ? 0.94 : rule.intent === "renewal" ? 0.78 : 0.72;
  return {
    schema: "mmd_payment_intelligence_v1",
    inferred_stage: "membership",
    inferred_intent: rule.intent,
    inferred_package_code: rule.package_code,
    inferred_price_rule: rule.price_rule,
    inferred_term_days: TERM_DAYS[rule.package_code] || null,
    confidence,
    identity_state: linked_member ? "canonical_member_linked" : "pending_identity_match",
    pending_member_profile: !linked_member,
    history_lookup_requested: !linked_member,
    official_verification_required: true,
    may_activate_membership: false,
    source_context: clean(source_context) || null,
  };
}

export function membershipInferenceLabel(inference) {
  if (!inference) return "";
  const packages = { standard: "Private Standard", premium: "Private Premium", mmd_member: "MMD Member", elite: "Elite Membership", red_card: "Red Card" };
  const actions = { renewal: "ต่ออายุ", signup: "สมัครสมาชิก", membership: "สมาชิก" };
  return `${actions[inference.inferred_intent] || "สมาชิก"} ${packages[inference.inferred_package_code] || inference.inferred_package_code}`.trim();
}
