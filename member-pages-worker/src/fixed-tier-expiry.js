// Owner rule (2026-10-11): every identity-verified VIP and SVIP customer's
// membership runs until 31 Jul 2028 (31 ก.ค. 2571 BE), regardless of renewal
// history. It applies only when the tier is canonically verified (identity
// confirmed + a Member tier on record); display-only legacy tiers never qualify.
export const FIXED_TIER_EXPIRY_DATE = "2028-07-31";
const FIXED_TIER_EXPIRY_END_MS = Date.parse("2028-07-31T23:59:59+07:00");
const FIXED_TIERS = new Set(["vip", "svip"]);
const BLOCKING_STATUSES = new Set(["blocked", "suspended", "revoked", "pending_review"]);

export function fixedTierExpiry(membership, now = new Date()) {
  if (!membership || membership.levelVerified !== true) return null;
  if (!FIXED_TIERS.has(membership.level)) return null;
  if (BLOCKING_STATUSES.has(membership.status)) return null;
  if (now.getTime() > FIXED_TIER_EXPIRY_END_MS) return null;
  return { expiresAt: FIXED_TIER_EXPIRY_DATE, lifecycle: "active" };
}
