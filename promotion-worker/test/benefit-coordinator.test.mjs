import test from "node:test";
import assert from "node:assert/strict";
import { buildAuditEvent, customerSafeResult, validateTransition } from "../src/benefit-coordinator.js";

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
