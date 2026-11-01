import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentSessionProofs } from './src/payment-session-proofs.js';
const session = {id:'recSession',fields:{session_id:'sess_old','MMD — Payment Proofs':['recProof']}};
const proof = {id:'recProof',fields:{proof_id:'proof_old',session:['recSession'],payment_ref:'pay_old'}};
function fixture(overrides={}) {
 const calls=[];
 return {calls, options:{sessionsTable:'sessions',paymentsTable:'payments',proofsTable:'proofs',page:async(table,params)=>{
  calls.push({table,params});assert.equal(params.maxRecords,undefined);
  if(table==='sessions')return {records:overrides.sessions??[session]};
  if(table==='payments')return {records:[{id:'recPayment',fields:{'Payment Reference':'pay_old',session_id:'sess_old'}}]};
  return {records:overrides.proofs??[proof]};
 }}};
}
test('finds old job proof through exact reciprocal and payment references, without recent queue',async()=>{
 const f=fixture(); assert.deepEqual(await paymentSessionProofs('sess_old',f.options),[proof]);
 assert.ok(f.calls.find(c=>c.params.filterByFormula.includes("{session_id}='sess_old'")));
 assert.ok(f.calls.find(c=>c.params.filterByFormula.includes("RECORD_ID()='recProof'")));
 assert.ok(f.calls.find(c=>c.params.filterByFormula.includes("{payment_ref}='pay_old'")));
});
test('missing, ambiguous, broken links and conflicting jobs fail rather than report empty',async()=>{
 for(const overrides of [{sessions:[]},{sessions:[session,session]},{proofs:[]},{proofs:[{...proof,fields:{...proof.fields,session:['other']}}]},{proofs:[{...proof,fields:{...proof.fields,payment:['other']}}]}]) {
  await assert.rejects(paymentSessionProofs('sess_old',fixture(overrides).options));
 }
 await assert.rejects(paymentSessionProofs("bad'formula",fixture().options));
});
test('continues targeted pagination beyond 100 records and fails on repeated cursors',async()=>{
 const f=fixture();const original=f.options.page;let pages=0;
 f.options.page=async(table,params)=>{if(table!=='proofs')return original(table,params);pages++;return params.offset?{records:[proof]}:{records:[],offset:'next'};};
 assert.deepEqual(await paymentSessionProofs('sess_old',f.options),[proof]);assert.equal(pages,4);
 f.options.page=async(table,params)=>table==='proofs'?{records:[],offset:'loop'}:original(table,params);
 await assert.rejects(paymentSessionProofs('sess_old',f.options),/pagination_invalid/);
});

test('authenticated queue endpoint uses session lookup and keeps proof focus inside that job',async()=>{
 const {handlePaymentReviewRequest}=await import('./src/payment-review-runtime.js');
 const calls=[];
 const env={AIRTABLE_BASE_ID:'app_test',AIRTABLE_API_KEY:'test',AIRTABLE_TABLE_SESSIONS:'sessions',AIRTABLE_TABLE_PAYMENTS_ID:'payments',AIRTABLE_TABLE_PAYMENT_PROOFS_ID:'proofs',AIRTABLE_HTTP:{async fetch(request){
  calls.push(request);assert.equal(request.method,'GET');const table=new URL(request.url).pathname.split('/').at(-1);
  if(table==='sessions')return Response.json({records:[session]});
  if(table==='payments')return Response.json({records:[{id:'recPay',fields:{'Payment Reference':'pay_old',session_id:'sess_old'}}]});
  if(table==='proofs')return Response.json({records:[{...proof,fields:{...proof.fields,status:'pending',amount_thb:100}}]});
  return Response.json({records:[]});
 }}};
 const url='https://mmdbkk.com/v1/admin/payments/review-queue?session_id=sess_old';
 assert.equal((await handlePaymentReviewRequest(new Request(url),env)).status,401);assert.equal(calls.length,0);
 const response=await handlePaymentReviewRequest(new Request(url),env,{id:'owner_test',role:'owner'});
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.scope,'session');assert.equal(result.session_id,'sess_old');assert.equal(result.items.length,1);assert.equal(result.items[0].session_id,'sess_old');
 const focused=await(await handlePaymentReviewRequest(new Request(url+'&proof_id=other_proof'),env,{id:'owner_test',role:'owner'})).json();assert.equal(focused.items.length,0);
});
