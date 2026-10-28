// Owner rules confirmed 2026-10-27. Applies only to a verified canonical tier.
export const FIXED_TIER_EXPIRY_DATE = "2027-08-31";
const VIP_END = Date.parse("2027-08-31T23:59:59.999+07:00");
const BLOCKING_STATUSES = new Set(["blocked", "suspended", "revoked", "pending_review"]);
export function fixedTierExpiry(membership, now = new Date()) {
  if (!membership || membership.levelVerified !== true || BLOCKING_STATUSES.has(membership.status)) return null;
  if (membership.level === "svip") return { expiresAt: null, lifecycle: "active" };
  if (membership.level !== "vip") return null;
  return { expiresAt: FIXED_TIER_EXPIRY_DATE, lifecycle: now.getTime() > VIP_END ? "expired" : "active" };
}
