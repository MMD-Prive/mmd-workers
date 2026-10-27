import { currentPrivateMembershipPromotion, privateRenewalBaseYears, privateRenewalTiming, privateRenewalPriceEligible } from "../../shared/membership-promotion-policy.mjs";

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
  if (!timing?.expiry_known) return {status:"review_required",reason:"canonical_expiry_required"};
  // Owner decision 2026-10-27: active advance / expired within 90 days only.
  if (!privateRenewalPriceEligible(timing)) return {status:"review_required",reason:"renewal_expired_over_90_days_review_required"};
  const term = {membership_years:PACKAGE_POLICY[packageCode].years, membership_start_at:timing.start_at};

  const lineUserId = canonicalLineId(session?.line_user_id);
  if (!lineUserId) return { status: "review_required", reason: "renewal_line_identity_required" };

  return {status:"ready", ...renewalPriceForSpend(packageCode,0), service_spend_365_thb:null, ...term, price_rule:timing.active ? `active_advance_${packageCode}` : `expired_within_90_days_${packageCode}`, history_status:timing.active ? "not_required_for_advance" : "not_required_for_90_day_renewal", discount_verified:true,
    // Provisional bonus at quote time; payment writer re-evaluates canonical paid_at.
    promotion:currentPrivateMembershipPromotion({package_code:packageCode,paid_at:now.toISOString(),action:"renewal",existing_member:true,prior_expire_at:session.member_profile.membership_expires_at}),
    promotion_requires_verified_payment:true};
}

function canonicalLineId(value) {
  const lineId = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(lineId) ? lineId : "";
}
