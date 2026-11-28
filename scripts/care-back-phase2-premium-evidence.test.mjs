import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { previewCanonicalPremium90 as preview } from './care-back-phase2-premium-evidence.mjs';
const row = (id, fields) => ({ id, fields });
const asOf = '2026-12-01T04:10:00Z';
const memberId = 'member_1';
function fixture(paidAt='2026-10-29T10:00:00+07:00', confirmed='2026-10-29T12:00:00+07:00') {
  return { complete:true,
    members:[row('recM1',{ member_id:memberId, line_id:'U_test', 'Membership Tier':'Premium' })],
    payments:[row('recP1',{payment_ref:'pay_1',session_id:'renew_1',payment_stage:'membership',package_code:'premium','Payment Status':'Paid','Verification Status':'Verified','Payment Date':paidAt})],
    renewals:[row('recR1',{renewal_session_id:'renew_1',line_user_id:'U_test',liff_intent:'renew',requested_package:'premium',renewal_flow_status:'materialized',verified_at:'2026-12-01T00:00:00Z'})],
    proofs:[row('recS1',{ payment_ref:'pay_1',status:'verified',verified_at:'2026-12-01', member:['recM1'],'MMD — LIFF Renewal Sessions':['recR1'] })],
    entitlements:[row('recE1',{entitlement_id:'paid_term_1',member_id:memberId,member:['recM1'],package_code:'premium',access_status:'active',start_at:'2026-10-28T20:00:00+07:00',expire_at:'2029-06-30T20:00:00+07:00'})],
    audits:[row('recA1',{Action:'payment_review_decision',Target:'payment_proof',Result:'success',Reason:'approve','Event ID':'mmdpr_1','Source Ref':'payment-review:fixture','Created At (ISO)':confirmed,
      'Before JSON':JSON.stringify({proof_record_id:'recS1',payment_ref:'pay_1',payment_stage:'membership',renewal_session_id:'renew_1'}),
      'After JSON':JSON.stringify({authority:'payments-worker',session_id:'renew_1',payment_ref:'pay_1',payment_stage:'membership',money_truth_changed:true})})] };
}
const run = (s, grantState='absent') => preview(s, {memberId,asOf,grantState});
test('binds distinct historical or fresh verified renewals to the same bonus key and exact 90-day expiry', () => {
  const old=run(fixture());
  const fresh=run(fixture('2026-11-28T10:00:00+07:00','2026-11-28T12:00:00+07:00'));
  assert.equal(old.status,'preview');
  assert.deepEqual(fresh,old);
  assert.equal(old.after,'2029-09-28T13:00:00.000Z');
});
test('original on-time audit wins over late mutable session/proof timestamps or a later retry', () => {
  const s=fixture('2026-11-30T16:59:00.000Z','2026-11-30T16:59:59.999Z');
  const retry=structuredClone(s.audits[0]); retry.id='recA2'; retry.fields['Created At (ISO)']='2026-11-30T17:02:00Z';
  s.audits.push(retry);
  assert.equal(run(s).status,'preview');
  s.audits.shift();
  assert.equal(run(s).status,'review');
});
test('cutoff, date-only values, premature evidence and unverifiable kind fail closed', () => {
  for(const [paid,confirmed] of [
    ['2026-11-30T16:59:00.000Z','2026-11-30T17:00:00Z'],
    ['2026-11-30T16:59:00.000Z','2026-11-30'],
    ['2026-11-30','2026-11-30T16:59:59Z'],
    ['2026-11-30T16:59:00.000Z','2026-11-30T16:58:59Z'],
    ['2026-09-30T16:59:00.000Z','2026-09-30T17:01:00Z']
  ]) assert.equal(run(fixture(paid,confirmed)).status,'review');
  const s=fixture(); s.renewals[0].fields.liff_intent='signup'; assert.equal(run(s).status,'skip');
  const t=fixture(); t.payments[0].fields.package_code='standard'; assert.equal(run(t).status,'skip');
});
test('ambiguous payment/member/expiry and incorrect audit or proof link do not produce a plan', () => {
  const mutators=[
    s=>s.payments.push({...s.payments[0],id:'recP2'}),
    s=>s.members.push(row('recM2',{member_id:'member_2',line_id:'U_test'})),
    s=>s.proofs[0].fields.member=['recM2'],
    s=>s.audits[0].fields['Before JSON']=JSON.stringify({payment_ref:'pay_2'}),
    s=>s.entitlements.push(row('recE2',{...s.entitlements[0].fields,entitlement_id:'other_term'})),
    s=>s.complete=false
  ];
  for(const mutate of mutators) { const s=fixture();mutate(s);assert.equal(run(s).status,'review'); }
});
test('a missing or pending durable grant state is review, and proven applied is not planned again', () => {
  for(const state of ['unknown','pending']) assert.equal(run(fixture(),state).status,'review');
  assert.equal(run(fixture(),'applied').reason,'already_applied');
  const s=fixture(); s.members[0].fields['Membership Status']='blocked'; assert.equal(run(s).reason,'membership_not_adjustable');
});
test('CLI emits only aggregate review and never a candidate or identifier', async () => {
  const dir=await mkdtemp(join(tmpdir(),'careback-readonly-'));
  try {
    const p=join(dir,'fixture.json');
    await writeFile(p,JSON.stringify(fixture()),{mode:0o600});
    const script=fileURLToPath(new URL('./care-back-phase2-premium-evidence.mjs',import.meta.url));
    const output=execFileSync(process.execPath,[script,p,asOf],{encoding:'utf8'});
    assert.deepEqual(JSON.parse(output),{ mode:'offline_read_only_unknown_grant_state', counts:{ grant_state_not_proven:1 } });
    assert.doesNotMatch(output,/recM1|pay_1|U_test|member_1/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('real date-only schema requires matching proof day and precise on-time audit', () => {
  const s=fixture('2026-11-30','2026-11-30T16:59:59.999Z');
  s.proofs[0].fields.paid_at='2026-11-30';
  s.payments[0].fields['Payment Status']={ name:'Paid' };
  s.audits[0].fields.Result={ name:'success' };
  assert.equal(run(s).status,'preview');
  s.audits[0].fields['Created At (ISO)']='2026-11-30T17:00:00Z';
  assert.equal(run(s).status,'review');
  s.audits[0].fields['Created At (ISO)']='2026-11-30T16:59:59.999Z';
  s.proofs[0].fields.paid_at='2026-11-29';
  assert.equal(run(s).status,'review');
});

test('advance renewal targets the proven paid terminal term before, at and after handoff', () => {
  const s=fixture();
  const old=s.entitlements[0].fields;
  const join='2027-06-30T20:00:00+07:00';
  old.expire_at=join;
  s.renewals[0].fields['Member Entitlement']=['recE2'];
  s.entitlements.push(row('recE2',{...old,entitlement_id:'advance_term_2',start_at:join,expire_at:'2029-06-30T20:00:00+07:00',payment_ref:'pay_1'}));
  for (const now of [asOf,join,'2027-06-30T20:00:01+07:00']) {
    const p=preview(s,{memberId,asOf:now,grantState:'absent'});
    assert.equal(p.entitlementId,'advance_term_2');
    assert.equal(p.after,'2029-09-28T13:00:00.000Z');
  }
  const broken=structuredClone(s);
  broken.renewals[0].fields['Member Entitlement']=['recE1'];
  assert.equal(run(broken).reason,'paid_successor_not_proven');
  broken.renewals[0].fields['Member Entitlement']=['recE2'];
  broken.entitlements[1].fields.start_at='2027-06-30T20:00:01+07:00';
  assert.equal(run(broken).reason,'paid_term_chain_not_contiguous');
});

test('an independently verified December successor changes the target but does not earn a second grant', () => {
  const s=fixture();
  const join='2029-06-30T20:00:00+07:00';
  const later=fixture('2026-12-02T10:00:00+07:00','2026-12-02T12:00:00+07:00');
  const spec=[
    ['payments','recP1','recP2'],['renewals','recR1','recR2'],
    ['proofs','recS1','recS2'],['audits','recA1','recA2']
  ];
  for(const [table,from,to] of spec){
    const json=JSON.stringify(later[table][0]).replaceAll(from,to)
      .replaceAll('renew_1','renew_2').replaceAll('pay_1','pay_2')
      .replaceAll('recR1','recR2').replaceAll('recS1','recS2');
    s[table].push(JSON.parse(json));
  }
  s.renewals[1].fields['Member Entitlement']=['recE2'];
  s.entitlements.push(row('recE2',{...s.entitlements[0].fields,entitlement_id:'dec_term_2',
    start_at:join,expire_at:'2031-06-30T20:00:00+07:00',payment_ref:'pay_2'}));
  const options={memberId,asOf:'2026-12-03T00:00:00Z',grantState:'absent'};
  const p=preview(s,options);
  assert.equal(p.entitlementId,'dec_term_2');
  assert.equal(p.qualifiedPayments,1);
  assert.equal(p.after,'2031-09-28T13:00:00.000Z');
  assert.equal(preview(s,{...options,grantState:'applied'}).reason,'already_applied');
  const unsupported=structuredClone(s);unsupported.audits.pop();
  assert.equal(preview(unsupported,options).reason,'paid_successor_not_proven');
  const decemberOnly=structuredClone(s);
  for(const [table] of spec) decemberOnly[table].shift();
  assert.equal(preview(decemberOnly,options).reason,'no_qualifying_premium_renewal');
});
