import { currentPrivateMembershipPromotion, privateRenewalTiming } from "../../shared/membership-promotion-policy.mjs";

const PACKAGE_POLICY = Object.freeze({
  standard: Object.freeze({
    label: "Standard",
    years: 1,
    base_amount_thb: 1000,
    thresholds: Object.freeze([
      Object.freeze({ spend_thb: 50000, amount_thb: 499, price_rule: "private_standard_spend_50000" }),
      Object.freeze({ spend_thb: 10000, amount_thb: 799, price_rule: "private_standard_spend_10000" }),
    ]),
    base_price_rule: "private_standard_renewal",
  }),
  premium: Object.freeze({
    label: "Premium",
    years: 2,
    base_amount_thb: 2500,
    thresholds: Object.freeze([
      Object.freeze({ spend_thb: 100000, amount_thb: 999, price_rule: "private_premium_spend_100000" }),
      Object.freeze({ spend_thb: 20000, amount_thb: 1999, price_rule: "private_premium_spend_20000" }),
    ]),
    base_price_rule: "private_premium_renewal",
  }),
});

export function canonicalRenewalPackageFromTier(value) {
  const tier = String(value || "").trim().toLowerCase();
  if (tier === "standard") return "standard";
  if (tier === "premium") return "premium";
  return "";
}

export function renewalPriceForSpend(packageCode, spendThb) {
  const code = String(packageCode || "").trim().toLowerCase();
  const policy = PACKAGE_POLICY[code];
  if (!policy) return null;
  const spend = Number(spendThb);
  const verifiedSpend = Number.isFinite(spend) && spend > 0 ? Math.round((spend + Number.EPSILON) * 100) / 100 : 0;
  const discount = policy.thresholds.find((item) => verifiedSpend >= item.spend_thb);
  return {
    package_code: code,
    package_label: policy.label,
    amount_thb: discount?.amount_thb ?? policy.base_amount_thb,
    service_spend_365_thb: verifiedSpend,
    price_rule: discount?.price_rule ?? policy.base_price_rule,
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
  // Quote only the approved fixed-price audience. Active prices require a
  // separately authoritative current package quote, not legacy spend estimates.
  if (!timing.expired_less_than_one_year) return {status:"review_required",reason:"active_renewal_price_policy_required"};
  const term = {membership_years:PACKAGE_POLICY[packageCode].years, membership_start_at:timing.start_at};

  const lineUserId = canonicalLineId(session?.line_user_id);
  if (!lineUserId) return { status: "review_required", reason: "renewal_line_identity_required" };

  return {status:"ready", ...renewalPriceForSpend(packageCode,0), ...term, price_rule:`expired_less_than_one_year_${packageCode}`, history_status:"verified", discount_verified:true,
    // Provisional bonus at quote time; payment writer re-evaluates canonical paid_at.
    promotion:currentPrivateMembershipPromotion({package_code:packageCode,paid_at:now.toISOString(),action:"renewal",existing_member:true,prior_expire_at:session.member_profile.membership_expires_at}),
    promotion_requires_verified_payment:true};
}

function canonicalLineId(value) {
  const lineId = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(lineId) ? lineId : "";
}
