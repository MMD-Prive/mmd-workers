export const POINTS_POLICY = "floor_100_thb_1_point";

const DEFINITIONS = [
  {
    id: "public_info_member_690_yearly",
    label: "Public Info Member",
    price_thb: 690,
    term_months: 12,
    points_awarded_floor: 6,
    visibility_lane: "public_info",
    requires_identity_gate: true,
    requires_manual_review: false,
    public_display_level: "public",
    points_reason: "companion_public_info_membership",
  },
  {
    id: "freelance_model_access_1499_yearly",
    label: "Freelance Model Access",
    price_thb: 1499,
    term_months: 12,
    points_awarded_floor: 14,
    visibility_lane: "public_model_deep_category",
    requires_identity_gate: true,
    requires_manual_review: false,
    public_display_level: "public",
    points_reason: "companion_freelance_model_access",
  },
  {
    id: "red_card_dining_14999_3y_intro",
    label: "Red Card Dining Access",
    price_thb: 14999,
    term_months: 36,
    points_awarded_floor: 149,
    visibility_lane: "red_card_dining_review",
    requires_identity_gate: true,
    requires_manual_review: true,
    public_display_level: "teaser",
    points_reason: "red_card_dining_access_intro",
  },
];

export const PUBLIC_COMPANION_MEMBERSHIP_PACKAGES = Object.freeze(Object.fromEntries(
  DEFINITIONS.map((definition) => [definition.id, Object.freeze({ ...definition })]),
));

export function floorMembershipPoints(amountThb) {
  const amount = Number(amountThb);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.floor(amount / 100);
}

export function getPublicCompanionMembershipPackage(packageId) {
  return PUBLIC_COMPANION_MEMBERSHIP_PACKAGES[String(packageId || "").trim()] || null;
}

export function verifiedMembershipPaymentMetadata({ package_id, source_route, entry_context } = {}) {
  const definition = getPublicCompanionMembershipPackage(package_id);
  if (!definition) return null;
  return {
    package_id: definition.id,
    package_label: definition.label,
    amount_thb: definition.price_thb,
    term_months: definition.term_months,
    points_policy: POINTS_POLICY,
    points_awarded: definition.points_awarded_floor,
    source_route: safeContext(source_route, "/member/membership"),
    entry_context: safeContext(entry_context, "public_companion_membership"),
    requires_manual_review: definition.requires_manual_review,
    visibility_lane: definition.visibility_lane,
  };
}

export function membershipPointsLedgerReasons(packageId) {
  const definition = getPublicCompanionMembershipPackage(packageId);
  return definition
    ? ["membership_package_payment", definition.points_reason]
    : [];
}

function safeContext(value, fallback) {
  const text = String(value || "").trim();
  return /^[a-z0-9_./-]{1,120}$/i.test(text) ? text : fallback;
}
