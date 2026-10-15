import test from 'node:test';
import assert from 'node:assert/strict';
import { correctPaymentEvidence } from './src/payment-evidence-correction.js';
import { handlePaymentReviewRequest } from './src/payment-review-runtime.js';
const owner = { id: 'synthetic-owner', role: 'owner' };
const input = () => ({ proof_id: 'synthetic_proof', idempotency_key: 'synthetic-key-001', payment_ref: 'BANK-TEST-123', amount_thb: 1234.56, admin_reason: 'Checked the original synthetic slip', evidence_checked: true, expected: { payment_ref: '', amount_thb: null } });
function harness() {
 let proof = { id: 'recSynthetic', fields: { proof_id: 'synthetic_proof', status: 'pending', note: JSON.stringify({ schema: 'mmd_admin_slip_upload_v1', r2_key: 'line-ofc/payment-proofs/test/original.png', extraction: { original: true } }) } };
 const calls = [];
 return { calls, get proof() { return proof; }, deps: {
  load: async () => proof, parseNote: v => JSON.parse(v || '{}'), reviewable: p => p.fields.status === 'pending',
  audit: async e => { calls.push(['audit', e]); },
  patch: async (id, fields) => { calls.push(['patch', fields]); proof = { ...proof, fields: { ...proof.fields, ...fields } }; },
 } };
}
test('fills missing evidence with durable before/after audit and preserves original image, OCR and pending state', async () => {
 const h = harness(), x = input(); const result = await correctPaymentEvidence(x, owner, h.deps);
 assert.equal(result.money_truth_changed, false); assert.equal(result.approval_required, true);
 assert.deepEqual(h.calls.map(x => x[0]), ['audit', 'patch']);
 assert.deepEqual(Object.keys(h.calls[1][1]).sort(), ['amount_thb', 'note', 'payment_ref']);
 assert.equal(h.proof.fields.status, 'pending');
 const note = JSON.parse(h.proof.fields.note); assert.equal(note.extraction.original, true); assert.match(note.r2_key, /original.png/);
 assert.equal(note.evidence_corrections[0].actor, owner.id);
 assert.equal((await correctPaymentEvidence(x, owner, h.deps)).duplicate, true); assert.equal(h.calls.length, 2);
 await assert.rejects(correctPaymentEvidence({ ...x, amount_thb: 9 }, owner, h.deps), /key_conflict/);
});
test('preflight blocks wrong roles, stale evidence, no confirmation and invalid amounts before writes', async () => {
 for (const [body, actor] of [[input(), {id:'partner',role:'partner'}], [{...input(), evidence_checked:false}, owner], [{...input(), amount_thb:1.234},owner], [{...input(), expected:{payment_ref:'other',amount_thb:null}},owner]]) {
  const h=harness(); await assert.rejects(correctPaymentEvidence(body,actor,h.deps)); assert.equal(h.calls.length,0);
 }
});
test('existing values, reviewed proofs and audit failures cannot be overridden', async () => {
 let h=harness(); h.proof.fields.amount_thb=100;
 await assert.rejects(correctPaymentEvidence({...input(),expected:{payment_ref:'',amount_thb:100}},owner,h.deps),/locked/); assert.equal(h.calls.length,0);
 h=harness(); h.proof.fields.status='approved'; await assert.rejects(correctPaymentEvidence(input(),owner,h.deps),/not_reviewable/);
 h=harness(); h.deps.audit=async()=>{throw Error('audit unavailable')}; await assert.rejects(correctPaymentEvidence(input(),owner,h.deps),/audit unavailable/); assert.equal(h.calls.length,0);
});
test('real review handler uses only Proof and Access Log writes, never payment services', async () => {
 const h=harness(), writes=[];
 const env={AIRTABLE_BASE_ID:'appSynthetic',AIRTABLE_API_KEY:'synthetic',PAYMENTS_WORKER:{fetch(){throw Error('no settlement allowed')}},AIRTABLE_HTTP:{fetch:async req=>{
  const u=new URL(req.url);
  if(req.method==='PATCH'){const body=await req.json();writes.push(['PATCH',body]);await h.deps.patch('recSynthetic',body.fields);return Response.json(h.proof)}
  if(req.method==='POST'){writes.push(['AUDIT',await req.json()]);return Response.json({records:[{id:'recAudit'}]})}
  return Response.json({records:[h.proof]});
 }}};
 const request=()=>new Request('https://mmdbkk.com/v1/admin/payments/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'correct_evidence',...input()})});
 assert.equal((await handlePaymentReviewRequest(request(),env,null)).status,401);
 const response=await handlePaymentReviewRequest(request(),env,owner); assert.equal(response.status,200); assert.equal((await response.json()).money_truth_changed,false); assert.deepEqual(writes.map(x=>x[0]),['AUDIT','PATCH']);
});
