import { currentPrivateMembershipPromotion, privateRenewalTiming } from "../../shared/membership-promotion-policy.mjs";
import { getCareBackStore } from "./care-back-claim-store.js";
import { readCareBackPhase1Recovery } from "./care-back-phase1-recovery.js";

export function projectKenjiRenewalPromotion(membership = {}, now = new Date()) {
  const authority = "owner_approved_october_renewal_2026_v1";
  const packageCode = { private_standard: "standard", private_premium: "premium" }[membership.level];
  if (membership.member_blocked || !["active", "expiring_soon", "grace", "expired"].includes(membership.lifecycle) || !packageCode) {
    return { authority, status: "not_applicable" };
  }
  const timing = privateRenewalTiming(membership.expire_at, now);
  if (!timing?.expiry_known) return { authority, status: "review_required", reason: "canonical_expiry_required" };
  if (timing.expired_one_year_or_more) return { authority, status: "not_applicable", reason: "expired_one_calendar_year_or_more" };
  // Candidate payment time is only a preview. Payment truth re-evaluates the
  // actual paid_at; this projection neither awards nor extends membership.
  const offer = currentPrivateMembershipPromotion({ package_code: packageCode, paid_at: now.toISOString(), action: "renewal", existing_member: true, prior_expire_at: membership.expire_at });
  // Current owner canon (docs/private-member-login-renewal-readiness-20261002.md
  // and the Oct 4 parent-forwarded owner notes) is total 2 years, not tier bonus
  // stacking. The payment policy still differs: keep checkout under review.
  return offer ? { authority, status: "conditional_eligible", package_code: packageCode, total_years: 2, base_years: 1, promotion_years: 1, starts_from: timing.active ? "existing_expiry" : "verified_renewal_time", ends_before: offer.ends_before, requires_verified_payment: true, checkout_status: "review_required", reason: "payment_term_policy_alignment_required" }
    : { authority, status: "not_applicable", reason: "outside_approved_campaign_window" };
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
