import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePaymentReviewRequest} from './src/payment-review-runtime.js';
import {handleReviewedProof} from '../payments-worker/reviewed-proof.js';
import {internalEvidenceReference,transferTimestamp} from './src/slip-transfer-evidence.js';
function harness({time='2026-10-15T02:18:00+07:00', linkedPayment=false}={}) {
 let proof={id:'recSYNTHETIC0001',fields:{proof_id:'synthetic_no_bank_ref',amount_thb:4500,status:'pending',paid_at:'2026-10-15',note:JSON.stringify({schema:'mmd_admin_slip_upload_v1',r2_key:'line-ofc/payment-proofs/test/original.png',extraction:{paid_at:time,amount_thb:4500},evidence_sha256:'synthetic-hash'}),...(linkedPayment?{payment:['recPayment']}:{})}};
 const audits=[], mutations=[], settlements=[];
 const session={id:'recSession',fields:{session_id:'sess_synthetic',Client:['recAAAAAAAAAAAAAA'],amount_thb:9000}};
 const env={AIRTABLE_BASE_ID:'appSynthetic',AIRTABLE_API_KEY:'synthetic',AUTH_SERVICE_ADMIN_TO_PAYMENTS:'synthetic-service-token',INTERNAL_TOKEN:'synthetic-internal-token',AIRTABLE_TABLE_SESSIONS:'Sessions',AIRTABLE_TABLE_PAYMENTS:'Payments',AIRTABLE_TABLE_PAYMENT_PROOFS:'Proofs',AIRTABLE_TABLE_ACCESS_LOG:'Audit'};
 env.AIRTABLE_HTTP={fetch:async request=>{
  const u=new URL(request.url),path=decodeURIComponent(u.pathname),formula=u.searchParams.get('filterByFormula')||'';
  if(request.method==='PATCH'){assert.match(path,/\/Proofs\//);const body=await request.json();mutations.push(body.fields);proof={...proof,fields:{...proof.fields,...body.fields}};return Response.json(proof)}
  if(request.method==='POST'){assert.match(path,/\/Audit$/);const body=await request.json();const row={id:'recAudit'+audits.length,fields:body.records[0].fields};audits.push(row);return Response.json({records:[row]})}
  if(path.endsWith('/Proofs'))return Response.json({records:[proof]});
  if(path.endsWith('/Sessions'))return Response.json({records:[session]});
  if(path.endsWith('/Payments/recPayment'))return Response.json({id:'recPayment',fields:{'Payment Reference':'pay_intent_synthetic',session_id:'sess_synthetic',payment_stage:'full',Amount:4500}});
  if(path.endsWith('/Payments'))return Response.json({records:[]});
  if(path.endsWith('/Audit'))return Response.json({records:audits.filter(row=>row.fields.Action==='payment_review_decision'&&formula.includes(row.fields['Source Ref']))});
  throw Error('unexpected synthetic request '+path);
 }};
 env.PAYMENTS_WORKER={fetch:request=>handleReviewedProof(request,env,null,async body=>{settlements.push(body);return Response.json({ok:true,payment_ref:body.payment_ref})})};
 return {env,audits,mutations,settlements,get proof(){return proof}};
}
const owner={id:'synthetic-owner',role:'owner'};
function request(extra={}){return new Request('https://mmdbkk.com/v1/admin/payments/review',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':'synthetic-review-001'},body:JSON.stringify({proof_id:'synthetic_no_bank_ref',decision:'approve',admin_reason:'Checked original slip amount and transfer time',payment_stage:'full',session_id:'sess_synthetic',...extra})})}
test('manual owner review reaches the unchanged Payments authority with amount/time and no bank reference or QR',async()=>{
 const h=harness();const response=await handlePaymentReviewRequest(request(),h.env,owner);const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.ok,true);
 assert.equal(h.settlements.length,1);assert.equal(h.settlements[0].payment_ref,await internalEvidenceReference('synthetic_no_bank_ref'));
 assert.equal(h.proof.fields.status,'verified');
 const note=JSON.parse(h.proof.fields.note);assert.equal(note.manual_evidence_review.bank_reference,null);assert.equal(note.manual_evidence_review.paid_at,'2026-10-14T19:18:00Z');
 assert.equal(h.audits[0].fields.Action,'payment_evidence_correction');
 const repeated=await handlePaymentReviewRequest(request(),h.env,owner);assert.equal(repeated.status,200);assert.equal(h.settlements.length,1,'same review key never settles twice');
});
test('a linked canonical payment keeps its system reference without asking for a bank reference',async()=>{
 const h=harness({linkedPayment:true});const r=await handlePaymentReviewRequest(request(),h.env,owner);const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(h.settlements[0].payment_ref,'pay_intent_synthetic');assert.equal(JSON.parse(h.proof.fields.note).manual_evidence_review.reference_kind,'canonical_payment_id');
});
test('missing full time or explicit payment context blocks before any proof or payment mutation',async()=>{
 for(const [options,body]of [[{time:'2026-10-15'},{}],[{}, {payment_stage:'',session_id:''}]]){
  const h=harness(options);const r=await handlePaymentReviewRequest(request(body),h.env,owner);assert.equal(r.status,409);assert.equal(h.settlements.length,0);assert.equal(h.mutations.length,0);assert.equal(h.audits.length,0);
 }
});
test('transfer time accepts precise ISO input and rejects impossible calendar dates',()=>{
 assert.equal(transferTimestamp('2026-10-15T02:18:00.000+07:00'),'2026-10-14T19:18:00Z');assert.equal(transferTimestamp('2026-02-30T02:18:00+07:00'),null);assert.equal(transferTimestamp('2026-10-15'),null);
});
