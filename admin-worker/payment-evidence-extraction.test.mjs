import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePaymentReviewRequest } from './src/payment-review-runtime.js';
const owner={id:'synthetic-owner',role:'owner'}, bytes=new Uint8Array([1,2,3,4]);
async function fixture(){
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const note={schema:'mmd_admin_slip_upload_v1',r2_key:'line-ofc/payment-proofs/2026/10/upload_test/original.png',mime_type:'image/png',evidence_sha256:hash};
 const proof={id:'recSynthetic',fields:{proof_id:'upload_test',status:'pending',note:JSON.stringify(note)}};
 const calls=[],env={AIRTABLE_BASE_ID:'appSynthetic',AIRTABLE_API_KEY:'synthetic',AIRTABLE_HTTP:{async fetch(req){calls.push(req.method);assert.equal(req.method,'GET','OCR retry must not write evidence or audit as human review');return Response.json({records:[proof]})}},LINE_SLIP_EVIDENCE:{async get(){return {body:bytes,size:bytes.length,httpMetadata:{contentType:'image/png'}}}},SLIP_EXTRACTOR:{async fetch(req){calls.push(new URL(req.url).pathname);return Response.json({result:req.url.endsWith('/qr')?{}:{amount_thb:6000,paid_at:'2026-10-12T09:25:00+07:00',confidence_score:.9}})}},PAYMENTS_WORKER:{fetch(){throw Error('must not approve')} }};
 return {env,calls,note,proof};
}
const req=()=>new Request('https://www.mmdbkk.com/v1/admin/payments/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'extract_evidence',proof_id:'upload_test'})});
test('authenticated OCR retry verifies original private bytes and returns a draft without writes',async()=>{
 const f=await fixture(),before=JSON.stringify(f.proof),r=await handlePaymentReviewRequest(req(),f.env,owner),d=await r.json();
 assert.equal(r.status,200,JSON.stringify(d));assert.equal(d.action,'extract_evidence');assert.equal(d.proof_id,'upload_test');assert.equal(d.result.amount_thb,6000);assert.equal(d.result.paid_at,'2026-10-12T02:25:00Z');assert.equal(d.money_truth_changed,false);assert.equal(d.evidence_changed,false);assert.equal(JSON.stringify(f.proof),before);assert.deepEqual(f.calls,['GET','/v1/extract/qr','/v1/extract/ocr']);
});
test('unauthenticated and partner callers cannot retry extraction',async()=>{
 for(const actor of [null,{id:'partner',role:'partner'}]){const f=await fixture(),r=await handlePaymentReviewRequest(req(),f.env,actor);assert.ok([401,403].includes(r.status));assert.equal(f.calls.length,0)}
});
test('invalid evidence integrity and reviewed proofs fail before OCR',async()=>{
 for(const kind of ['hash','key','status','historical','missing']){
  const f=await fixture();if(kind==='hash')f.note.evidence_sha256='0'.repeat(64);if(kind==='key')f.note.r2_key='../private';if(kind==='status')f.proof.fields.status='approved';if(kind==='historical')f.note.schema='mmd_historical_slip_backfill_v1';if(kind==='missing')f.env.LINE_SLIP_EVIDENCE.get=async()=>null;f.proof.fields.note=JSON.stringify(f.note);
  const r=await handlePaymentReviewRequest(req(),f.env,owner);assert.ok(r.status>=400,kind);assert.deepEqual(f.calls,['GET']);
 }
});
