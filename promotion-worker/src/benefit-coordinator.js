const CAMPAIGN_ID = "mmd_6th_anniversary_2026";
const BENEFIT_TYPES = Object.freeze(["membership_extension", "anniversary_points_66"]);

export function buildBenefitPlan(claim) {
  requireClaim(claim);
  if (!["benefit_approved", "apply_partially_failed"].includes(claim.claimStatus)) {
    throw new Error("claim_not_approved");
  }
  const months = positiveInteger(claim.approvedMonths, "approved_months");
  const points = positiveInteger(claim.pointsBonus ?? 66, "points_bonus");
  return BENEFIT_TYPES.map((benefitType) => ({
    campaignId: claim.campaignId || CAMPAIGN_ID,
    claimId: claim.claimId,
    benefitType,
    idempotencyKey: [claim.campaignId || CAMPAIGN_ID, claim.claimId, benefitType].join(":"),
    payload: benefitType === "membership_extension"
      ? { months, previousExpireAt: claim.membershipEndSnapshot, effectiveAt: claim.effectiveAt }
      : { points },
  }));
}

export function selectRetryableBenefits(plan, existing = []) {
  const byType = new Map(existing.map((item) => [item.benefitType, item]));
  return plan.filter((item) => {
    const prior = byType.get(item.benefitType);
    return !prior || ["failed", "retry_required"].includes(prior.status);
  });
}

export function summarizeApplication(results) {
  const byType = new Map(results.map((item) => [item.benefitType, item]));
  const missing = BENEFIT_TYPES.filter((type) => !byType.has(type));
  if (missing.length) return { claimStatus: "apply_partially_failed", retryRequired: missing };
  const failed = results.filter((item) => ["failed", "retry_required"].includes(item.status));
  if (failed.length) return { claimStatus: "apply_partially_failed", retryRequired: failed.map((x) => x.benefitType) };
  const complete = BENEFIT_TYPES.every((type) => ["applied", "already_applied"].includes(byType.get(type)?.status));
  return complete
    ? { claimStatus: "benefit_applied", retryRequired: [] }
    : { claimStatus: "applying", retryRequired: [] };
}

export function buildAuditEvent({ eventType, claimId, requestId, actor, before, after, reasonCode, idempotencyKey }) {
  if (!eventType || !claimId || !requestId || !actor?.id || !actor?.sessionId) throw new Error("invalid_audit_event");
  return {
    eventType, claimId, requestId,
    actorId: actor.id,
    adminSessionId: actor.sessionId,
    beforeJson: JSON.stringify(before ?? null),
    afterJson: JSON.stringify(after ?? null),
    reasonCode: reasonCode || "",
    idempotencyKey: idempotencyKey || "",
    occurredAt: new Date().toISOString(),
  };
}

export function customerSafeResult(claim) {
  if (claim.claimStatus !== "benefit_applied") throw new Error("benefit_not_applied");
  return {
    claimReference: claim.claimId,
    claimStatus: "benefit_applied",
    monthsAdded: claim.approvedMonths,
    pointsAdded: claim.pointsBonus ?? 66,
    newMembershipEndAt: claim.newMembershipEndAt,
    completedAt: claim.appliedAt,
  };
}

function requireClaim(claim) {
  if (!claim || typeof claim !== "object" || !claim.claimId) throw new Error("invalid_claim");
}
function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error("invalid_" + name);
  return number;
}

export { BENEFIT_TYPES, CAMPAIGN_ID };
