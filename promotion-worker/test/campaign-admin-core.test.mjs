import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAdminDecision, requireAdminContext, adminDecisionPatch, assertAdminApplyAllowed } from "../src/campaign-admin-core.js";

const body = { actor:{id:"per",sessionId:"admin-session-1"},requestId:"request-1",reason:"verified by Per" };

test("maps Control Room decisions to claim states",()=>{
  assert.equal(normalizeAdminDecision("approve").status,"benefit_approved");
  assert.equal(normalizeAdminDecision("reject").status,"rejected");
  assert.equal(normalizeAdminDecision("manual_review").status,"manual_review");
  assert.throws(()=>normalizeAdminDecision("apply"),/invalid_admin_decision/);
});

test("requires approver, session, request and reason before mutation",()=>{
  assert.deepEqual(requireAdminContext(body),body);
  for(const missing of ["actor","requestId","reason"]){const value=structuredClone(body);delete value[missing];assert.throws(()=>requireAdminContext(value));}
  assert.throws(()=>requireAdminContext({...body,actor:{id:"per"}}),/actor_session_required/);
});

test("decision patch records reviewer and approval timestamp",()=>{
  const now=new Date("2026-08-02T12:00:00.000Z");
  assert.deepEqual(adminDecisionPatch("manual_review",body,now),{reviewedBy:"per",reviewedAt:now.toISOString()});
  assert.deepEqual(adminDecisionPatch("benefit_approved",body,now),{reviewedBy:"per",reviewedAt:now.toISOString(),approvedBy:"per",approvedAt:now.toISOString()});
});

test("apply is fail-closed until approved and permits explicit retry",()=>{
  for(const claimStatus of ["created","matched","payment_pending","manual_review","rejected"])
    assert.throws(()=>assertAdminApplyAllowed({claimStatus}),/claim_not_approved_for_apply/);
  assert.doesNotThrow(()=>assertAdminApplyAllowed({claimStatus:"benefit_approved"}));
  assert.doesNotThrow(()=>assertAdminApplyAllowed({claimStatus:"apply_partially_failed"}));
});
