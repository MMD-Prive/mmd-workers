import test from "node:test";
import assert from "node:assert/strict";

import { LINE_GROUP_INGRESS_INTERNALS as internals } from "../src/line-group-ingress-front-gate.js";

const {
  hasMembershipPaymentContext,
  hasPaymentContext,
  hasPaymentFollowupContext,
} = internals;

test("recognises colloquial Thai renewal wording", () => {
  assert.equal(hasPaymentContext("งั้นต่อให้หน่อยได้ไหมครับ"), true);
  assert.equal(hasMembershipPaymentContext("งั้นต่อให้หน่อยได้ไหมครับ"), true);
  assert.equal(hasPaymentContext("ขอสมัครสมาชิกครับ"), true);
});

test("numeric follow-up can promote a waiting slip candidate", () => {
  assert.equal(hasPaymentFollowupContext("233-2-98800-1"), true);
  assert.equal(hasPaymentFollowupContext("1999"), true);
});

test('unlinked slip and Client-only identity are retained pending without verified-money or activation claims',async()=>{
  const original=globalThis.fetch;const writes=[];
  globalThis.fetch=async(url,init={})=>{if(init.method==='POST'){const body=JSON.parse(init.body);writes.push(body.fields);return Response.json({id:'recProofFixture',fields:body.fields});}return Response.json({records:[]});};
  try{for(const links of [{},{client:'recClientFixture'}]){const result=await internals.createPendingProof({AIRTABLE_BASE_ID:'fixture-base',AIRTABLE_API_KEY:'fixture-only'}, {proofId:'fixture-unlinked',paymentContextText:'ต่ออายุสมาชิก',sourceType:'user',analysis:{extraction:{amount_thb:1999,payer_name:'Fixture',paid_at:'2026-10-02T01:00:00Z'},links,payment_intelligence:{inferred_package_code:'premium',inferred_stage:'membership'},ops_route:{topic:'membership',should_alert:false}}});assert.equal(result.note.payment_truth,'unverified');assert.equal(result.note.official_verification_required,true);assert.equal(result.note.may_mark_paid,false);assert.equal(result.note.may_extend_membership,false);assert.equal(result.note.identity_binding_review_required,true);assert.equal(result.mayExtendMembership,false);}
    assert.equal(writes.length,2);for(const fields of writes){assert.equal(fields.status,'pending');assert.equal(fields.amount_thb,1999);assert.equal(fields.payer_name,'Fixture');assert.equal(fields.paid_at,'2026-10-02');assert.equal(fields.member,undefined);}
  }finally{globalThis.fetch=original;}
});
test('fully matched membership and Client-only exact payment both remain evidence-only pending',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async(url,init={})=>init.method==='POST'?Response.json({id:'recFixture',fields:JSON.parse(init.body).fields}):Response.json({records:[]});
  try{for(const [links,payment] of [[{member:'recMemberFixture'},null],[{client:'recClientFixture'},{status:'exact',payment_ref:'fixture-pay'}]]){const value=await internals.createPendingProof({AIRTABLE_BASE_ID:'fixture-base',AIRTABLE_API_KEY:'fixture-only',LINE_SLIP_EVIDENCE:{put:async()=>({}),get:async()=>null,delete:async()=>{}}},{proofId:'fixture-matched',paymentContextText:'ต่ออายุสมาชิก',analysis:{links,canonical_payment:payment,extraction:{amount_thb:1999},payment_intelligence:{inferred_package_code:'premium',inferred_stage:'membership'},ops_route:{topic:'membership',should_alert:false}}});assert.equal(value.note.payment_truth,'unverified');assert.equal(value.note.official_verification_required,true);assert.equal(value.note.may_mark_paid,false);assert.equal(value.note.may_extend_membership,false);assert.equal(value.mayExtendMembership,false);assert.equal(value.note.may_award_points,false);}}
  finally{globalThis.fetch=original;}
});

test('settlement gate never calls payments-worker and keeps the proof pending',async()=>{
  let calls=0;
  const result=await internals.settleTrackedMembership({PAYMENTS_WORKER:{async fetch(){calls+=1;throw new Error('must_not_call');}}},{},{deduped:false,mayExtendMembership:true},'Ufixture');
  assert.equal(calls,0);
  assert.deepEqual(result,{status:'pending',authority:'payments-worker',reason:'manual_official_verification_required'});
});
