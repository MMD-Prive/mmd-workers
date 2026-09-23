import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,apiModule,MODEL,PARTNER,SESSION,OTHER} from './helpers/partner-fixture.mjs';
const {SESSION_FIELDS:S,PAYMENT_FIELDS:P,PARTNER_COMMISSIONS:C,MODEL_REFERRALS:R}=apiModule;
async function setup(t,system='bridge'){
  const f=await fixture();t.after(async()=>{await Promise.allSettled(f.tasks);f.restore();});
  const snapshot={contract:'partner_commission_v1',session_id:'session_fixture',partner_record_id:PARTNER,model_record_id:MODEL,referral_record_id:f.db.Referrals[0].id,system,agreement_version:1,commission_percent:7,source_rate_thb:6000,partner_share_percent:40,basis_rule:'full_payment_only',payment_ref:'payment-fixture',payment_amount_thb:10000,approved_by:'fixture-owner',approved_at:'2026-09-01T00:00:00Z',costs_total_thb:3000,costs_approved_by:'fixture-owner',costs_approved_at:'2026-09-25T00:00:00Z'};
  Object.assign(f.db.Sessions[0].fields,{[S.commissionSnapshotJson]:JSON.stringify(snapshot),[S.commissionSnapshotLocked]:true,[S.referralSnapshotId]:snapshot.referral_record_id,[S.paymentStatus]:'paid',[S.completionReview]:'clear'});
  f.db.Payments.push({id:'recTTTTTTTTTTTTTT',fields:{[P.sessionId]:'session_fixture',[P.paymentRef]:'payment-fixture',[P.verification]:'verified',[P.stage]:'full',[P.amount]:10000}});
  return {...f,snapshot,materialize:()=>f.call('/v1/partner/admin/ledger/materialize',{owner:true,body:{session_record_id:SESSION}})};
}
test('settlement uses frozen agreement, stays idempotent, and saves a durable payout reference',async t=>{
  const f=await setup(t);f.db.Referrals[0].fields[R.commissionRate]=0.1;
  const created=await f.materialize();assert.equal(created.status,201);const row=await created.json();assert.equal(row.commission_amount_thb,700);
  assert.equal((await(await f.materialize()).json()).idempotent,true);assert.equal(f.db.Commissions.length,1);
  assert.equal(f.db.Commissions[0].fields[C.rateSnapshot],0.07);
  const action=body=>f.call('/v1/partner/admin/ledger/action',{owner:true,body:{commission_record_id:row.commission_record_id,...body}});
  assert.equal((await action({action:'approve'})).status,200);
  f.db.Sessions[0].fields[S.payoutHoldReason]='manual_hold';
  assert.equal((await action({action:'mark_paid',payout_reference:'fixture-transfer'})).status,409);
  f.db.Sessions[0].fields[S.payoutHoldReason]='';
  assert.equal((await action({action:'mark_paid',payout_reference:'fixture-transfer'})).status,200);
  assert.equal(f.db.Commissions[0].fields[C.payoutReference],'fixture-transfer');
});
test('legacy missing snapshot, foreign-model override and foreign or deposit-only payment cannot create earnings',async t=>{
  const f=await setup(t);
  f.db.Sessions[0].fields[S.commissionSnapshotLocked]=false;assert.equal((await f.materialize()).status,409);
  f.db.Sessions[0].fields[S.commissionSnapshotLocked]=true;
  assert.equal((await f.call('/v1/partner/admin/ledger/materialize',{owner:true,body:{session_record_id:SESSION,model_record_id:OTHER}})).status,409);
  f.db.Payments[0].fields[P.sessionId]='foreign-session';assert.equal((await f.materialize()).status,409);
  f.db.Payments[0].fields[P.sessionId]='session_fixture';f.db.Payments[0].fields[P.stage]='deposit';assert.equal((await f.materialize()).status,409);
  assert.equal(f.db.Commissions.length,0);
});
test('Profit Share requires approved costs and calculates from net receipts',async t=>{
  const f=await setup(t,'profit_share');const locked={...f.snapshot};delete locked.costs_approved_by;
  f.db.Sessions[0].fields[S.commissionSnapshotJson]=JSON.stringify(locked);assert.equal((await f.materialize()).status,409);
  f.db.Sessions[0].fields[S.commissionSnapshotJson]=JSON.stringify(f.snapshot);
  const r=await(await f.materialize()).json();assert.equal(r.basis_amount_thb,7000);assert.equal(r.commission_amount_thb,2800);
});
test('public callers cannot spoof the internal owner service binding',async t=>{
  const f=await setup(t);
  const r=await f.call('/v1/partner/admin/ledger',{headers:{'x-mmd-service-binding':'admin-worker','x-mmd-owner-id':'forged','x-mmd-owner-role':'owner'}});
  assert.equal(r.status,401);
});
