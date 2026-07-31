export const CAMPAIGN_ID = "mmd_6th_anniversary_2026";
export const REFERENCE_DATE = "2026-08-01";
export const CAMPAIGN_START = "2026-07-31T17:00:00.000Z";
export const CAMPAIGN_END = "2026-08-31T16:59:59.999Z";

const SPECIAL_TIERS = new Set(["vip", "svip", "blackcard", "black_card"]);

export function assertCampaignActive(now) {
  const time = date(now, "claimCreatedAt").getTime();
  if (time < Date.parse(CAMPAIGN_START)) throw new PolicyError("campaign_not_started");
  if (time > Date.parse(CAMPAIGN_END)) throw new PolicyError("campaign_ended");
  return true;
}

export function classifyEligibility(input = {}) {
  const tier = token(input.membershipTier).toLowerCase();
  const history = Array.isArray(input.membershipHistory) ? input.membershipHistory : [];
  if (SPECIAL_TIERS.has(tier)) return manual("special_tier");
  if (input.conflictingHistory === true) return manual("conflicting_history");
  if (history.length === 0 && !input.membershipEndAt) {
    return result("new_member", 0, true, 66, null, "no_verified_membership_history");
  }
  if (!input.membershipEndAt) return manual("missing_membership_expiry");
  const end = calendarDate(input.membershipEndAt, "membershipEndAt");
  const reference = calendarDate(REFERENCE_DATE, "referenceDate");
  if (end.getTime() >= reference.getTime()) {
    return result("current_member", 6, false, 300, 0, "active_on_reference_date");
  }
  const days = calendarDays(end, reference);
  if (days <= 90) return result("recently_expired", 4, true, 200, days, "expired_1_90_days");
  if (days <= 365) return result("inactive_expired", 3, true, 200, days, "expired_91_365_days");
  return result("former_member", 2, true, 200, days, "expired_over_365_days");
}

export function validateApprovedMonths(eligibility, requested) {
  if (eligibility.manualReview) throw new PolicyError("manual_review_required");
  if (eligibility.status === "current_member") {
    if (requested != null && Number(requested) !== 6) throw new PolicyError("current_member_months_fixed");
    return 6;
  }
  if (eligibility.status === "new_member") return 0;
  const months = Number(requested);
  if (!Number.isInteger(months) || months < 0 || months > eligibility.maxMonths) {
    throw new PolicyError("approved_months_out_of_range");
  }
  return months;
}

export function resolveMembershipPrice(input = {}) {
  const tier = token(input.tier).toLowerCase();
  const mode = token(input.mode || "new").toLowerCase();
  const spend = money(input.verifiedSpend365);
  if (tier === "premium") {
    if (mode === "new") return price(2999, "premium_new");
    return spend >= 20000 ? price(1999, "premium_spend_20000") : price(2500, "premium_renewal");
  }
  if (tier === "standard") {
    if (mode === "new") return price(1199, "standard_new");
    if (spend >= 50000) return price(499, "standard_spend_50000");
    if (spend >= 10000) return price(799, "standard_spend_10000");
    return price(1000, "standard_renewal");
  }
  if (tier === "guest-pass" || tier === "7days") return price(1499, "guest_pass_new");
  throw new PolicyError("unsupported_membership_tier");
}

export function resolveUpgradePrice(input = {}) {
  const from = token(input.fromTier).toLowerCase();
  const verifiedStart = calendarDate(input.verifiedPackageStartAt, "verifiedPackageStartAt");
  const at = calendarDate(input.upgradeAt, "upgradeAt");
  if (at < verifiedStart) throw new PolicyError("upgrade_before_package_start");
  const days = calendarDays(verifiedStart, at);
  if (from === "guest-pass" || from === "7days") {
    if (days <= 7) return price(1500, "guest_to_premium_7_days");
    if (at <= addCalendarMonths(verifiedStart, 3)) return price(2000, "guest_to_premium_3_months");
    return price(2999, "premium_new");
  }
  if (from === "standard") {
    if (days <= 14) return price(1800, "standard_to_premium_14_days");
    if (at <= addCalendarMonths(verifiedStart, 6)) return price(2000, "standard_to_premium_6_months");
    return price(2999, "premium_new");
  }
  throw new PolicyError("unsupported_upgrade_path");
}

export function buildBenefitPlan(claim) {
  if (!claim || claim.claimStatus !== "benefit_approved") throw new PolicyError("claim_not_approved");
  if (claim.paymentRequired && claim.paymentVerified !== true) throw new PolicyError("verified_payment_required");
  if (claim.upgradeRequired && claim.upgradePaymentVerified !== true) throw new PolicyError("verified_upgrade_payment_required");
  const plan = [];
  if (Number(claim.approvedMonths) > 0) {
    plan.push(benefit(claim, "membership_extension", {
      months: Number(claim.approvedMonths),
      previousExpiry: claim.membershipEndSnapshot || null,
      effectiveAt: claim.effectiveAt,
      tier: claim.upgradeApplied ? "premium" : claim.membershipTier,
      atomicWithTierUpgrade: Boolean(claim.upgradeApplied),
    }));
  }
  plan.push(benefit(claim, "anniversary_points", {
    points: Number(claim.pointsAward),
    expiresAt: addCalendarDays(date(claim.effectiveAt, "effectiveAt"), 365).toISOString(),
  }));
  return plan;
}

export function internalConsiderations(input = {}) {
  const out = [];
  if (money(input.verifiedSpend365) >= 120000) out.push("vip_consideration");
  if (input.hasVerifiedMembershipHistory && money(input.verifiedLifetimeServiceSpend) > 50000) {
    out.push("blackcard_private_consideration");
  }
  return out;
}

export function addCalendarMonths(value, months) {
  const original = date(value, "date");
  const day = original.getUTCDate();
  const target = new Date(Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + Number(months), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target;
}

function benefit(claim, benefitType, payload) {
  return { campaignId: CAMPAIGN_ID, claimId: claim.claimId, benefitType,
    idempotencyKey: `${CAMPAIGN_ID}:${claim.identityHash}:${benefitType}`, payload };
}
function result(status, maxMonths, paymentRequired, pointsAward, daysExpired, reason) {
  return { status, maxMonths, fixedMonths: status === "current_member" ? 6 : null, paymentRequired,
    pointsAward, daysExpired, manualReview: false, reason };
}
function manual(reason) { return { status: "manual_review", maxMonths: null, fixedMonths: null, paymentRequired: null,
  pointsAward: null, daysExpired: null, manualReview: true, reason }; }
function price(amountThb, priceCode) { return { amountThb, priceCode, currency: "THB" }; }
function money(value) { const n = Number(value || 0); if (!Number.isFinite(n) || n < 0) throw new PolicyError("invalid_verified_spend"); return n; }
function token(value) { return String(value || "").trim(); }
function date(value, field) { const d = value instanceof Date ? new Date(value) : new Date(value); if (!value || Number.isNaN(d.getTime())) throw new PolicyError(`invalid_${field}`); return d; }
function calendarDate(value, field) { const d = date(value, field); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function calendarDays(a, b) { return Math.floor((b.getTime() - a.getTime()) / 86400000); }
function addCalendarDays(value, days) { const d = new Date(value); d.setUTCDate(d.getUTCDate() + days); return d; }

export class PolicyError extends Error { constructor(code) { super(code); this.code = code; } }
