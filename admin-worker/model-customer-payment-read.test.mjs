import test from 'node:test';
import assert from 'node:assert/strict';
import {readModelCustomerPayment} from './src/model-customer-payment-read.js';
import {BALANCE_FIELDS as F} from '../payments-worker/verified-session-balance.js';
const env={AIRTABLE_BASE_ID:'test',AIRTABLE_API_KEY:'synthetic-only'};
const session={session_id:'s1'};
const record={id:'recS',fields:{session_id:'s1',amount_thb:9000}};
const payment=(stage,amount,verification='verified')=>({id:'rec'+stage,fields:{[F.ref]:'pay'+stage,[F.paymentSession]:'s1',[F.stage]:stage,[F.amount]:amount,[F.verification]:verification,[F.status]:'Paid'}});
async function read(rows,source=record){const old=globalThis.fetch;let calls=0;globalThis.fetch=async(req)=>{
 assert.equal(req.method,'GET');assert.match(new URL(req.url).searchParams.get('filterByFormula'),/s1/);calls++;
 return Response.json({records:rows});};try{const result=await readModelCustomerPayment(env,source,session);assert.ok(calls<=1);return result;}finally{globalThis.fetch=old;}}
test('verified deposit and settled balance are model-safe read-only projections',async()=>{
 const rows=[payment('deposit',3000)];const before=JSON.stringify(rows);
 assert.equal((await read(rows)).status,'deposit_paid');assert.equal(JSON.stringify(rows),before);
 rows.push(payment('final',6000));const result=await read(rows);assert.equal(result.status,'fully_paid');
 assert.doesNotMatch(JSON.stringify(result),/3000|6000|9000|paydeposit|payfinal|amount|bank|slip/);
});
test('pending or absent payments never become paid',async()=>{
 assert.equal((await read([])).status,'pending');assert.equal((await read([payment('deposit',3000,'pending_review')])).status,'pending');
});
for(const kind of ['wrong_session','duplicate_reference','reversed','missing_amount','conflicting_fields','wrong_total'])test(kind+' fails closed',async()=>{
 const rows=[payment('deposit',3000)];let source=record;
 if(kind==='wrong_session')rows[0].fields[F.paymentSession]='s2';
 if(kind==='duplicate_reference')rows.push({...rows[0],id:'different'});
 if(kind==='reversed')rows[0].fields[F.status]='Refunded';
 if(kind==='missing_amount')delete rows[0].fields[F.amount];
 if(kind==='conflicting_fields')rows[0].fields['Verification Status']='pending_review';
 if(kind==='wrong_total')source={...record,fields:{...record.fields,[F.total]:5000}};
 assert.equal((await read(rows,source)).status,'unavailable');
});
test('transport error preserves unknown status',async()=>{const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('offline')};try{assert.equal((await readModelCustomerPayment(env,record,session)).status,'unavailable')}finally{globalThis.fetch=old}});
