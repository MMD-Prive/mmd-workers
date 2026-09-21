import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePaymentReviewRequest } from './src/payment-review-runtime.js';
import { dispatchPaymentNotification } from '../shared/payment-notification-outbox.mjs';
import { memoryR2 } from '../shared/test/payment-memory-r2.mjs';

const context={session_id:'sess-1',payment_ref:'pay-1',payment_stage:'deposit'};
function fixture() {
 const tables={Payments:[{id:'recPay',fields:{'Payment Reference':'pay-1','Payment Status':'Paid',session_id:'sess-1',payment_stage:'deposit',Client:['recClient']}}],Sessions:[{id:'recSession',fields:{session_id:'sess-1',fldmwuvOaiCFdzzRa:'Confirmed',fld6P6if0vDZCeV0C:['recClient'],fldJSS5GNN7quJwa8:'2026-09-21T09:00:00Z',fldi9ZdoiUXzSv1rI:'https://www.mmdbkk.com/sigil/confirm/job-confirmation?t=secret-customer',fld0mFma9J9yfEaKb:'https://www.mmdbkk.com/sigil/confirm/job-model?t=secret-model'}}]};
 const reads=[];
 const env={AIRTABLE_BASE_ID:'app-test',AIRTABLE_API_KEY:'test',AIRTABLE_TABLE_PAYMENTS:'Payments',AIRTABLE_TABLE_SESSIONS:'Sessions',LINE_SLIP_EVIDENCE:memoryR2(),PAYMENTS_WORKER:{fetch(){assert.fail('delivery follow-through must not settle money')}},AIRTABLE_HTTP:{async fetch(request){assert.equal(request.method,'GET','no Airtable writes');const url=new URL(request.url);reads.push(url);const table=decodeURIComponent(url.pathname).split('/')[3];return Response.json({records:tables[table]||[]});}}};
 return {env,tables,reads,async seed(options={}){return dispatchPaymentNotification({bucket:env.LINE_SLIP_EVIDENCE,lane:'approved-job-links',eventKey:'sess-1:deposit',payload:options.payload||context,now:options.now||Date.now(),deliver:async()=>({ok:options.done!==false,result:{dispatched:true,customer_line_sent:true,model_line_sent:false,manual_delivery_required:true,private_url:'secret-ignored'}})});},async request(retry=false,overrides={},actor={id:'per',role:'admin'}){return handlePaymentReviewRequest(new Request('https://www.mmdbkk.com/v1/admin/payments/'+(retry?'review':'review-queue?'+new URLSearchParams({view:'confirmation',...context,...overrides})),retry?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'retry_confirmation',...context,...overrides})}:{}),env,actor);}};
}

test('reload projects durable delivery separately from acknowledgements without secrets or writes',async()=>{
 const h=fixture();await h.seed();const before=[...h.env.LINE_SLIP_EVIDENCE.objects];const r=await h.request();assert.equal(r.status,200);const d=await r.json();assert.equal(d.money_truth_changed,false);assert.equal(d.confirmation.dispatched,true);assert.equal(d.confirmation.manual_delivery_required,true);assert.equal(d.confirmation.customer_acknowledged_at,'2026-09-21T09:00:00.000Z');assert.equal(d.confirmation.model_acknowledged_at,null);assert.equal(d.confirmation.retry_available,false);assert.doesNotMatch(JSON.stringify(d),/secret|recClient|payload|private_url/);assert.deepEqual([...h.env.LINE_SLIP_EVIDENCE.objects],before);assert.equal(h.reads[1].searchParams.get('returnFieldsByFieldId'),'true');
});

test('missing journal remains unknown and cannot enqueue from a paid-looking row',async()=>{
 const h=fixture();assert.equal((await (await h.request()).json()).confirmation.delivery_status,'not_recorded');assert.equal((await h.request(true)).status,409);assert.equal(h.env.LINE_SLIP_EVIDENCE.objects.size,0);
});

test('unauthenticated reads and non-admin retries do no work',async()=>{
 const h=fixture();assert.equal((await h.request(false,{},null)).status,401);assert.equal((await h.request(true,{}, {id:'partner',role:'mms_partner'})).status,403);assert.equal(h.reads.length,0);
});

test('unpaid, refunded, mismatched, ambiguous and cancelled records block retries',async()=>{
 for(const mutate of [h=>h.tables.Payments[0].fields['Payment Status']='Pending',h=>h.tables.Payments[0].fields['Payment Status']='Refunded',h=>h.tables.Payments[0].fields.session_id='other',h=>h.tables.Payments[0].fields.payment_stage='full',h=>h.tables.Payments.push(h.tables.Payments[0]),h=>h.tables.Sessions.push(h.tables.Sessions[0]),h=>h.tables.Sessions[0].fields.fldmwuvOaiCFdzzRa='Cancelled',h=>h.tables.Payments[0].fields.Client=['other']]){const h=fixture();await h.seed({done:false});mutate(h);const before=[...h.env.LINE_SLIP_EVIDENCE.objects];assert.equal((await h.request(true)).status,409);assert.deepEqual([...h.env.LINE_SLIP_EVIDENCE.objects],before);}
 const h=fixture();assert.equal((await h.request(true,{payment_stage:'final'})).status,400);
});

test('journal subject mismatch fails closed on both read and retry',async()=>{
 const h=fixture();await h.seed({payload:{...context,payment_ref:'other'}});assert.equal((await h.request()).status,409);assert.equal((await h.request(true)).status,409);
});

test('delivery-only retry respects terminal receipt, backoff and expiry',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('no notification should be sent');
 try{for(const options of [{},{done:false},{done:false,now:Date.now()-24*3600000}]){const h=fixture();await h.seed(options);const r=await h.request(true);assert.equal(r.status,200);assert.equal((await r.json()).money_truth_changed,false);}}finally{globalThis.fetch=original;}
});

test('due delivery retry survives page restart and leaves money untouched',async()=>{
 const h=fixture();await h.seed({done:false,now:Date.now()-120000});h.env.TELEGRAM_INTERNAL_SEND_URL='https://telegram.example/internal/send';h.env.INTERNAL_TOKEN='test';const original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;return Response.json({ok:true})};try{const r=await h.request(true);assert.equal(r.status,200);const d=await r.json();assert.equal(d.money_truth_changed,false);assert.equal(d.confirmation.dispatched,true);assert.equal(d.confirmation.delivery_status,'delivered');assert.equal(d.confirmation.model_acknowledged_at,null);assert.equal(sends,1);await h.request(true);assert.equal(sends,1,'terminal replay cannot resend');}finally{globalThis.fetch=original;}
});
