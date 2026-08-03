import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditEvent, customerSafeDashboardResult, customerSafeResult, validateTransition } from "../src/benefit-coordinator.js";

test("Approve and Apply stay separate", () => {
  assert.equal(validateTransition("matched", "benefit_approved"), true);
  assert.equal(validateTransition("matched", "benefit_applied"), false);
  assert.equal(validateTransition("benefit_approved", "applying"), true);
});

test("audit requires actor session and complete context", () => {
  assert.throws(() => buildAuditEvent({ claimId: "c" }), /audit_requestId_required/);
  const event = buildAuditEvent({ requestId:"r",actorId:"per",adminSessionId:"s",eventType:"benefit_approved",
    claimId:"c",campaignId:"mmd_6th_anniversary_2026",before:{status:"matched"},after:{status:"benefit_approved"},reason:"verified" }, new Date("2026-08-01T00:00:00Z"));
  assert.equal(event.timestamp, "2026-08-01T00:00:00.000Z");
});

test("customer readback excludes classification, considerations, and admin", () => {
  const safe = customerSafeResult({ claimId:"c",claimStatus:"benefit_applied",approvedMonths:6,pointsAward:300,
    newMembershipExpiry:"2027-06-30",appliedAt:"2026-08-01",considerations:["blackcard_private_consideration"],actorId:"per" });
  assert.deepEqual(Object.keys(safe).sort(), ["claimReference","completedAt","monthsAdded","newMembershipExpiry","pointsAdded","status"].sort());
  assert.doesNotMatch(JSON.stringify(safe), /blackcard|actor|consideration/i);
});

test("dashboard readback maps every customer-safe state without internal identifiers", () => {
  const cases = [
    [null,"not_started"],
    [{claimStatus:"matched"},"under_review"],
    [{claimStatus:"manual_review",internalReason:"private"},"under_review"],
    [{claimStatus:"payment_pending"},"payment_required"],
    [{claimStatus:"payment_pending",paymentReference:"secret"},"payment_verifying"],
    [{claimStatus:"benefit_approved",approvedMonths:6,pointsAward:300},"approved"],
    [{claimStatus:"benefit_applied",approvedMonths:6,pointsAward:300,newMembershipExpiry:"2027-02-01"},"completed"],
    [{claimStatus:"rejected",reviewedBy:"per"},"unavailable"],
    [{claimStatus:"apply_partially_failed",audits:[{ secret:true }]},"temporarily_unavailable"],
  ];
  for (const [claim,status] of cases) {
    const safe=customerSafeDashboardResult(claim,new Date("2026-08-04T00:00:00Z"));
    assert.equal(safe.status,status);
    assert.deepEqual(Object.keys(safe).sort(),["action","benefit_summary","effective_until","id","label","message","status","title","updated_at"].sort());
    assert.doesNotMatch(JSON.stringify(safe),/claim|paymentReference|reviewedBy|audit|internalReason|private|secret/i);
  }
});
