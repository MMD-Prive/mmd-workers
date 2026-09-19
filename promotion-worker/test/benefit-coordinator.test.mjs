import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBenefitPlan,
  selectRetryableBenefits,
  summarizeApplication,
  buildAuditEvent,
  customerSafeResult,
} from "../src/benefit-coordinator.js";

const claim = {
  campaignId: "mmd_6th_anniversary_2026",
  claimId: "MMD6-2026-ABC123",
  claimStatus: "benefit_approved",
  approvedMonths: 4,
  pointsBonus: 66,
  membershipEndSnapshot: "2026-11-30T00:00:00.000Z",
  effectiveAt: "2026-12-01T00:00:00.000Z",
};

test("builds two independent deterministic benefit applications", () => {
  const plan = buildBenefitPlan(claim);
  assert.deepEqual(plan.map((x) => x.benefitType), ["membership_extension", "anniversary_points_66"]);
  assert.equal(plan[0].idempotencyKey, "mmd_6th_anniversary_2026:MMD6-2026-ABC123:membership_extension");
  assert.equal(plan[1].payload.points, 66);
});

test("retry selects only a missing or failed component", () => {
  const plan = buildBenefitPlan({ ...claim, claimStatus: "apply_partially_failed" });
  const retry = selectRetryableBenefits(plan, [
    { benefitType: "membership_extension", status: "applied" },
    { benefitType: "anniversary_points_66", status: "retry_required" },
  ]);
  assert.deepEqual(retry.map((x) => x.benefitType), ["anniversary_points_66"]);
});

test("partial failure never reports benefit applied", () => {
  const result = summarizeApplication([
    { benefitType: "membership_extension", status: "applied" },
    { benefitType: "anniversary_points_66", status: "failed" },
  ]);
  assert.equal(result.claimStatus, "apply_partially_failed");
  assert.deepEqual(result.retryRequired, ["anniversary_points_66"]);
});

test("duplicate success is treated as complete", () => {
  const result = summarizeApplication([
    { benefitType: "membership_extension", status: "already_applied" },
    { benefitType: "anniversary_points_66", status: "applied" },
  ]);
  assert.equal(result.claimStatus, "benefit_applied");
});

test("audit requires a verified actor and admin session", () => {
  assert.throws(() => buildAuditEvent({ eventType: "benefit_approved", claimId: claim.claimId, requestId: "req-1" }));
  const event = buildAuditEvent({
    eventType: "benefit_approved",
    claimId: claim.claimId,
    requestId: "req-1",
    actor: { id: "admin-1", sessionId: "session-1" },
    before: { status: "matched" },
    after: { status: "benefit_approved" },
  });
  assert.equal(event.adminSessionId, "session-1");
});

test("dashboard result excludes internal classification and reviewer data", () => {
  const result = customerSafeResult({
    ...claim,
    claimStatus: "benefit_applied",
    newMembershipEndAt: "2027-03-31T00:00:00.000Z",
    appliedAt: "2026-08-05T09:00:00.000Z",
    classificationGroup: "active_member",
    reviewedBy: "admin-1",
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "claimReference", "claimStatus", "completedAt", "monthsAdded", "newMembershipEndAt", "pointsAdded",
  ].sort());
});
