const DECISIONS = Object.freeze({ approve: "benefit_approved", reject: "rejected", manual_review: "manual_review" });

export function normalizeAdminDecision(action) {
  const value = String(action || "").trim().toLowerCase();
  const status = DECISIONS[value];
  if (!status) throw new AdminGateError("invalid_admin_decision");
  return { action: value, status };
}

export function requireAdminContext(body = {}) {
  const actorId = required(body.actor?.id, "actor_id_required");
  const sessionId = required(body.actor?.sessionId, "actor_session_required");
  const requestId = required(body.requestId, "request_id_required");
  const reason = required(body.reason, "admin_reason_required");
  return { actor: { id: actorId, sessionId }, requestId, reason };
}

export function adminDecisionPatch(status, context, now = new Date()) {
  const timestamp = now.toISOString();
  const patch = { reviewedBy: context.actor.id, reviewedAt: timestamp };
  if (status === "benefit_approved") Object.assign(patch, { approvedBy: context.actor.id, approvedAt: timestamp });
  return patch;
}

export function assertAdminApplyAllowed(claim) {
  if (!["benefit_approved", "apply_partially_failed"].includes(String(claim?.claimStatus || ""))) {
    throw new AdminGateError("claim_not_approved_for_apply");
  }
}

function required(value, code) {
  const text = String(value || "").trim();
  if (!text || text.length > 500) throw new AdminGateError(code);
  return text;
}

export class AdminGateError extends Error { constructor(code) { super(code); this.code = code; } }
