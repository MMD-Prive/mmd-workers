import { currentPrivateMembershipPromotion, privateRenewalTiming, privateRenewalPriceEligible } from "../../shared/membership-promotion-policy.mjs";
import { getCareBackStore } from "./care-back-claim-store.js";
import { readCareBackPhase1Recovery } from "./care-back-phase1-recovery.js";

export function projectKenjiRenewalPromotion(membership = {}, now = new Date()) {
  const authority = now.getTime() >= Date.parse("2026-11-01T00:00:00+07:00")
    ? "owner_approved_november_returning_2026_v1" : "owner_approved_october_renewal_2026_v1";
  const packageCode = { private_standard: "standard", private_premium: "premium" }[membership.level];
  if (membership.member_blocked || !["active", "expiring_soon", "grace", "expired"].includes(membership.lifecycle) || !packageCode) {
    return { authority, status: "not_applicable" };
  }
  const timing = privateRenewalTiming(membership.expire_at, now);
  if (!timing?.expiry_known) return { authority, status: "review_required", reason: "canonical_expiry_required" };
  // Candidate payment time is only a preview. Payment truth re-evaluates the
  // actual paid_at; this projection neither awards nor extends membership.
  const offer = currentPrivateMembershipPromotion({ package_code: packageCode, paid_at: now.toISOString(), action: "renewal", existing_member: true, prior_expire_at: membership.expire_at });
  // The paid-time policy preserves historical October terms and selects the
  // six-calendar-month November benefit. It does not authorize a renewal price.
  if (!offer) return { authority, status: "not_applicable", reason: timing.expired_one_year_or_more ? "expired_one_calendar_year_or_more" : "outside_approved_campaign_window" };
  const promotionYears = Number(offer?.bonus_years || 0), promotionDays = Number(offer?.bonus_days || 0);
  const promotionMonths = Number(offer.bonus_months || 0);
  const benefit = { authority, package_code: packageCode, promotion_years: promotionYears, promotion_months: promotionMonths, promotion_days: promotionDays, bonus_months: promotionMonths, ends_before: offer.ends_before, requires_verified_payment: true };
  // Returning members outside the existing 90-day price window still receive
  // the policy benefit, but require a separately verified signup/rejoin quote.
  // Do not manufacture its purchased term or a discounted renewal offer here.
  if (promotionMonths === 6 && !privateRenewalPriceEligible(timing)) {
    return { ...benefit, status: "review_required", reason: "renewal_expired_over_90_days_review_required" };
  }
  return { ...benefit, status: "conditional_eligible", total_years: 1 + promotionYears, base_years: 1, starts_from: timing.active ? "existing_expiry" : "verified_renewal_time", checkout_status: "review_required", reason: "payment_term_policy_alignment_required" };
}

function couponProjection(wallet = {}) {
  const allowed = ["ready", "used", "expired", "revoked", "invalid", "wish_required", "verification_required", "unavailable"];
  const status = allowed.includes(wallet.status || wallet.customer_state) ? wallet.status || wallet.customer_state : "unavailable";
  const percent = Number(wallet.approved_discount_percent);
  const expiresAt = String(wallet.expires_at || "");
  // Never advertise an active coupon without a definite future expiry.
  const definiteExpiry = expiresAt && Number.isFinite(Date.parse(expiresAt));
  const validCode = /^[A-HJ-NP-Z2-9]{6}$/.test(String(wallet.code || ""));
  const state = status === "ready" && (!validCode || !definiteExpiry || Date.parse(expiresAt) <= Date.now()) ? "unavailable" : status;
  return { authority: "canonical_care_back_wallet_v1", status: state, approved_discount_percent: state === "ready" && percent > 0 && percent <= 10 ? percent : null, expires_at: definiteExpiry ? expiresAt : "", single_use: true };
}

export async function readKenjiCareBackCoupon(env, lineUserId, memberId) {
  const unavailable = { authority: "canonical_care_back_wallet_v1", status: "unavailable" };
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId) || !memberId) return unavailable;
  try {
    // Existing recovery reader verifies unique issued authorization + linked
    // promo. Do not call the app read-repair, claim or approval routes.
    const recovery = await readCareBackPhase1Recovery(env, lineUserId);
    if (recovery) return recovery.line_user_id === lineUserId ? couponProjection(recovery) : unavailable;
    const secret = String(env.LIFF_SESSION_SECRET || "");
    const store = getCareBackStore(env);
    if (secret.length < 32 || typeof store?.readCouponWallet !== "function") return unavailable;
    // Same server-only identity convention as LIFF; no session is manufactured.
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`identity:${lineUserId}`));
    const identityHash = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
    return couponProjection(await store.readCouponWallet({ identityHash, memberId }));
  } catch { return unavailable; }
}

