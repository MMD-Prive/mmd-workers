import { currentPrivateMembershipPromotion, privateRenewalBaseYears, privateRenewalTiming } from "../../shared/membership-promotion-policy.mjs";

const PACKAGE_POLICY = Object.freeze({
  standard: Object.freeze({
    label: "Standard",
    years: privateRenewalBaseYears("standard"),
    base_amount_thb: 1000,
    base_price_rule: "private_standard_renewal",
  }),
  premium: Object.freeze({
    label: "Premium",
    years: privateRenewalBaseYears("premium"),
    base_amount_thb: 2500,
    base_price_rule: "private_premium_renewal",
  }),
});

export function canonicalRenewalPackageFromTier(value) {
  const tier = String(value || "").trim().toLowerCase();
  if (tier === "standard") return "standard";
  if (tier === "premium") return "premium";
  return "";
}

// Compatibility helper for the existing fixed-price renewal policy, not an
// eligibility check. Retired spend-band prices must never be offered again.
// The new 365-day threshold policy and below-threshold pricing need their own
// verified-history integration; this cleanup does not approve either fallback.
export function renewalPriceForSpend(packageCode, spendThb) {
  const code = String(packageCode || "").trim().toLowerCase();
  const policy = PACKAGE_POLICY[code];
  if (!policy) return null;
  const spend = Number(spendThb);
  const verifiedSpend = Number.isFinite(spend) && spend > 0 ? Math.round((spend + Number.EPSILON) * 100) / 100 : 0;
  return {
    package_code: code,
    package_label: policy.label,
    amount_thb: policy.base_amount_thb,
    service_spend_365_thb: verifiedSpend,
    price_rule: policy.base_price_rule,
    membership_years: policy.years,
  };
}

export async function resolveCanonicalRenewalOffer(env = {}, session = {}, now = new Date()) {
  if (String(session?.liff_intent || "").trim().toLowerCase() !== "renew" || session?.member_exists !== true) {
    return { status: "not_applicable", reason: "renewal_member_session_required" };
  }

  const packageCode = canonicalRenewalPackageFromTier(session?.member_profile?.tier);
  if (!packageCode) return { status: "review_required", reason: "renewal_current_package_not_supported" };
  const timing = privateRenewalTiming(session?.member_profile?.membership_expires_at, now);
  if (timing?.expired_one_year_or_more) return {status:"review_required", classification:timing.expired_over_one_year ? "new_signup" : "review_required", reason:"renewal_expired_one_year_or_more_policy_review_required"};
  if (!timing?.expiry_known) return {status:"review_required",reason:"canonical_expiry_required"};
  // Owner-approved fixed-price audiences (2026-10-12): expired less than one
  // year (includes the 14-day grace) and not-yet-expired advance renewals both
  // pay the base price (Standard 1,000 / Premium 2,500); spend discounts never
  // apply. Advance renewals extend from the future expiry (timing.start_at).
  if (!timing.active && !timing.expired_less_than_one_year) return {status:"review_required",reason:"renewal_price_policy_review_required"};
  const term = {membership_years:PACKAGE_POLICY[packageCode].years, membership_start_at:timing.start_at};

  const lineUserId = canonicalLineId(session?.line_user_id);
  if (!lineUserId) return { status: "review_required", reason: "renewal_line_identity_required" };

  return {status:"ready", ...renewalPriceForSpend(packageCode,0), ...term, price_rule:timing.active ? `active_advance_${packageCode}` : `expired_less_than_one_year_${packageCode}`, history_status:"verified", discount_verified:true,
    // Provisional bonus at quote time; payment writer re-evaluates canonical paid_at.
    promotion:currentPrivateMembershipPromotion({package_code:packageCode,paid_at:now.toISOString(),action:"renewal",existing_member:true,prior_expire_at:session.member_profile.membership_expires_at}),
    promotion_requires_verified_payment:true};
}

function canonicalLineId(value) {
  const lineId = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(lineId) ? lineId : "";
}
