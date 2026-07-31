export function validateTransition(from, to) {
  const transitions = {
    created: ["identity_verified", "manual_review", "rejected"],
    identity_verified: ["matched", "manual_review", "rejected"],
    matched: ["payment_pending", "benefit_approved", "manual_review", "rejected"],
    payment_pending: ["benefit_approved", "manual_review", "rejected"],
    manual_review: ["payment_pending", "benefit_approved", "rejected"],
    benefit_approved: ["applying", "rejected"],
    applying: ["benefit_applied", "apply_partially_failed"],
    apply_partially_failed: ["applying", "rejected"],
    benefit_applied: [], rejected: [],
  };
  return Boolean(transitions[from]?.includes(to));
}

export function buildAuditEvent(input = {}, now = new Date()) {
  const required = ["requestId", "actorId", "adminSessionId", "eventType", "claimId", "campaignId"];
  for (const key of required) if (!String(input[key] || "").trim()) throw new Error(`audit_${key}_required`);
  return { requestId: input.requestId, actorId: input.actorId, adminSessionId: input.adminSessionId,
    eventType: input.eventType, claimId: input.claimId, campaignId: input.campaignId,
    before: input.before ?? null, after: input.after ?? null, reason: String(input.reason || ""),
    idempotencyKey: String(input.idempotencyKey || ""), timestamp: now.toISOString() };
}

export function customerSafeResult(claim) {
  const base = { claimReference: claim.claimId, status: customerStatus(claim.claimStatus), completedAt: claim.appliedAt || null };
  if (claim.claimStatus !== "benefit_applied") return base;
  return { ...base, monthsAdded: Number(claim.approvedMonths || 0), pointsAdded: Number(claim.pointsAward || 0),
    newMembershipExpiry: claim.newMembershipExpiry || null };
}

function customerStatus(status) {
  return ({ created: "checking", identity_verified: "checking", matched: "additional_review",
    payment_pending: "payment_required", manual_review: "additional_review", benefit_approved: "approved_awaiting_processing",
    applying: "approved_awaiting_processing", apply_partially_failed: "support_required", benefit_applied: "completed",
    rejected: "support_required" })[status] || "checking";
}
