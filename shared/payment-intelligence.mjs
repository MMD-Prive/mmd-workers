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
  4999: { package_code: "elite", intent: "membership", price_rule: "public_elite" },
  11499: { package_code: "red_card", intent: "membership", price_rule: "public_red_card" },
});

const TERM_DAYS = Object.freeze({ standard: 365, premium: 730, mmd_member: 365, elite: 730, red_card: 365 });

export const PUBLIC_MEMBERSHIP_CATALOG = Object.freeze({
  mmd_member: Object.freeze({
    package_code: "mmd_member",
    label: "MMD Member",
    amount_thb: 690,
    duration_days: 365,
    entitlement_level: "public_member",
  }),
  elite: Object.freeze({
    package_code: "elite",
    label: "Elite",
    amount_thb: 4999,
    duration_days: 730,
    entitlement_level: "elite",
  }),
  red_card: Object.freeze({
    package_code: "red_card",
    label: "Red Card",
    amount_thb: 11499,
    duration_days: 365,
    entitlement_level: "red_card",
  }),
});
const MEMBERSHIP_STAGES = new Set(["membership", "member", "renewal", "member_renewal", "membership_fee", "signup"]);
const SERVICE_STAGES = new Set(["deposit", "final", "balance", "tips", "tip", "full", "service", "booking"]);
const MEMBERSHIP_PACKAGES = new Set(["standard", "premium", "mmd_member", "elite", "red_card"]);
const MEMBERSHIP_SOURCE_RE = /(?:^|[_\s-])(pay_membership|member_payments|membership|member_renewal|renewal)(?:$|[_\s-])/i;
const MEMBERSHIP_CONTEXT_RE = /(?:ค่าสมาชิก|ต่ออายุ(?:สมาชิก)?|สมัคร(?:สมาชิก)?|membership|member\s*(?:fee|renewal)|renewal|renew\b|mmd\s*member|elite\s*membership|red\s*card|private\s*(?:standard|premium))/i;
const SERVICE_CONTEXT_RE = /(?:มัดจำ|ยอดคงเหลือ|ค่าบริการ|ค่างาน|deposit|balance|service\s*fee|booking\s*payment|final\s*payment|tips?)/i;
const clean = (value) => (value == null ? "" : String(value).trim());
const token = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const moneyKey = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && Math.abs(amount - Math.round(amount)) < 0.01 ? Math.round(amount) : null;
};

function canonicalMembershipPackage(value) {
  const raw = token(value);
  if (!raw) return "";
  if (["mmd_member", "member_690", "public_member", "membership"].includes(raw)) return "mmd_member";
  if (["elite", "elite_membership"].includes(raw)) return "elite";
  if (["red_card", "redcard"].includes(raw)) return "red_card";
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "";
}

export function getPublicMembershipPackage(value) {
  const packageCode = canonicalMembershipPackage(value);
  const item = PUBLIC_MEMBERSHIP_CATALOG[packageCode];
  return item ? { ...item } : null;
}

export function paymentPresentationLane({ package_code = "", payment_stage = "" } = {}) {
  const packageCode = token(package_code);
  const stage = token(payment_stage);
  if (packageCode === "tmib_act_001" || stage === "tmib_story") return "public";
  if (PUBLIC_MEMBERSHIP_CATALOG[canonicalMembershipPackage(packageCode)] && MEMBERSHIP_STAGES.has(stage || "membership")) return "public";
  return "sigil";
}

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

export function classifyPaymentOpsRoute({
  payment_stage = "",
  amount_thb = null,
  linked_member = false,
  linked_renewal = false,
  package_code = "",
  source_context = "",
  source_page = "",
  context_text = "",
} = {}) {
  const stage = token(payment_stage);
  const canonicalPackage = canonicalMembershipPackage(package_code);
  const source = [clean(source_context), clean(source_page)].filter(Boolean).join(" ");
  const context = clean(context_text);
  const serviceStage = SERVICE_STAGES.has(stage);
  const membershipStage = MEMBERSHIP_STAGES.has(stage);
  const membershipPackage = MEMBERSHIP_PACKAGES.has(canonicalPackage);
  const membershipSource = MEMBERSHIP_SOURCE_RE.test(source);
  const membershipText = MEMBERSHIP_CONTEXT_RE.test(context);
  const serviceText = SERVICE_CONTEXT_RE.test(context);
  const explicitMembership = membershipStage || membershipPackage || membershipSource || membershipText;
  const explicitService = serviceStage || serviceText;
  const inference = inferMembershipPayment({
    amount_thb,
    linked_member,
    linked_renewal,
    package_code: canonicalPackage || package_code,
    source_context: source || source_context,
  });

  const base = {
    schema: "mmd_payment_ops_route_v1",
    official_verification_required: true,
    may_activate_membership: false,
    inferred_membership: Boolean(inference),
    inference,
  };

  if (explicitService && explicitMembership) {
    return {
      ...base,
      topic: "payment",
      flow: "payment_proof",
      classification: "conflict",
      confidence: 1,
      reason: "conflicting_payment_context",
      should_alert: true,
    };
  }

  if (explicitService) {
    return {
      ...base,
      topic: "payment",
      flow: "payment_proof",
      classification: "service_payment",
      confidence: 1,
      reason: "explicit_service_context",
      should_alert: false,
    };
  }

  if (explicitMembership) {
    if (inference && canonicalPackage && inference.inferred_package_code !== canonicalPackage) {
      return {
        ...base,
        topic: "payment",
        flow: "payment_proof",
        classification: "conflict",
        confidence: 1,
        reason: "membership_amount_package_mismatch",
        should_alert: true,
      };
    }
    return {
      ...base,
      topic: "membership",
      flow: "membership",
      classification: "membership_payment",
      confidence: membershipStage || membershipPackage || membershipSource ? 1 : 0.96,
      reason: inference ? "explicit_membership_context_with_amount_match" : "explicit_membership_context",
      should_alert: false,
    };
  }

  if (inference) {
    return {
      ...base,
      topic: "payment",
      flow: "payment_proof",
      classification: "unresolved_payment",
      confidence: Math.min(Number(inference.confidence || 0), 0.78),
      reason: "amount_matches_membership_but_context_unconfirmed",
      should_alert: false,
    };
  }

  return {
    ...base,
    topic: "payment",
    flow: "payment_proof",
    classification: "unresolved_payment",
    confidence: explicitService ? 1 : 0.5,
    reason: "membership_context_not_confirmed",
    should_alert: false,
  };
}

export function membershipInferenceLabel(inference) {
  if (!inference) return "";
  const packages = { standard: "Private Standard", premium: "Private Premium", mmd_member: "MMD Member", elite: "Elite Membership", red_card: "Red Card" };
  const actions = { renewal: "ต่ออายุ", signup: "สมัครสมาชิก", membership: "สมาชิก" };
  return `${actions[inference.inferred_intent] || "สมาชิก"} ${packages[inference.inferred_package_code] || inference.inferred_package_code}`.trim();
}
