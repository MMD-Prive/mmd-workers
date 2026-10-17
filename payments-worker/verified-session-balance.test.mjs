import assert from 'node:assert/strict';
import test from 'node:test';
import { BALANCE_FIELDS as F, calculateVerifiedSessionBalance as sum, readVerifiedSessionBalance as read, customerBalanceProjection as project, shouldResolveCustomerBalance as should } from './verified-session-balance.js';
const SID = 'sess_synthetic_balance_2487';
const FINAL = 'pay_synthetic_final';
const session = (amount = 20000) => ({ id: 'recSession', fields: { [F.sessionId]: SID, [F.total]: amount, [F.sessionStatus]: 'Confirmed', [F.customerDue]: 20000, notes: '[SIGIL Pricing v1] {"deposit_received_thb":0,"balance_thb":20000}' } });
const payment = (id='recDeposit',amount=6000,stage='deposit',verification='verified',status='Paid') => ({ id, fields: { [F.paymentSession]:SID,[F.ref]:id==='recFinal'?FINAL:'pay_'+id,[F.amount]:amount,[F.stage]:stage,[F.verification]:verification,[F.status]:status,[F.intent]:verification==='verified'?'Confirmed':'Pending Confirmation' } });
const pending = () => payment('recOriginal',6000,'deposit','pending_review','Pending');
const balance = rows => sum(session(),rows);

test('20,000 minus verified 6,000 is 14,000 despite blank/stale Session snapshots and pending original intent',()=>{
  const s=session(),d=payment(),rows=[d,pending()];const before=JSON.stringify([s,rows]);
  const b=sum(s,rows),p=project(b,d,FINAL);
  assert.equal(b.verified_paid_thb,6000);assert.equal(b.remaining_amount_thb,14000);
  assert.equal(p.amount_due_thb,14000);assert.equal(p.payment_ref,FINAL);assert.equal(p.payment_type,'final');assert.equal(p.verified,false);
  assert.equal(p.paymentRecord.id,undefined,'a read projection is not a new durable Payment');
  assert.equal(JSON.stringify([s,rows]),before,'no write/reset to original money records');
});
test('repeated reads always derive the same final reference without creating another deposit',()=>{
  const d=payment(),b=balance([d,pending()]);for(let i=0;i<20;i++)assert.equal(project(b,d,FINAL).payment_ref,FINAL);assert.equal(b.records.length,2);
});
test('planned deposit and pending_review by themselves are not money received',()=>{
  const d=pending(),b=balance([d]);assert.equal(should(d),false);assert.equal(b.verified_paid_thb,0);assert.throws(()=>project(b,d,FINAL),/verified_deposit_required/);
});
test('Paid display label with no official verification is excluded',()=>{
  const d=payment('paid_only',6000,'deposit','pending_review','Paid');assert.equal(balance([d]).verified_paid_thb,0);assert.equal(should(d),false);
});
for(const [received,expected] of [[2000,18000],[7000,13000],[20000,0],[21000,0]])test('actual verified deposit '+received+' controls balance '+expected,()=>{
  const d=payment('recDeposit',received),b=balance([d]),p=project(b,d,FINAL);assert.equal(b.remaining_amount_thb,expected);assert.equal(p.amount_due_thb,expected);if(!expected)assert.equal(p.verified,true);
});
test('separate verified deposits add once each and a repeated page row does not add again',()=>{
  const a=payment('a',3000),b=payment('b',3000);assert.equal(balance([a,b,a]).remaining_amount_thb,14000);
});
test('tips, membership and extension receipts are not subtracted from base service price',()=>{
  const rows=[payment(),payment('tip',9000,'tips'),payment('member',5000,'membership'),payment('extend',8000,'extension')];assert.equal(balance(rows).remaining_amount_thb,14000);
});
test('verified full settlement returns zero and never reopens final payment',()=>{
  const d=payment(),f=payment('recFinal',14000,'final');const b=balance([d,f]),p=project(b,f,FINAL);assert.equal(b.verified_paid_thb,20000);assert.equal(p.amount_due_thb,0);assert.equal(p.verified,true);
});
test('existing unpaid final intent is reused when amount matches the verified remainder',()=>{
  const d=payment(),f=payment('recFinal',14000,'final','pending_review','Pending');const p=project(balance([d,f]),f,FINAL);assert.equal(p.paymentRecord,f);assert.equal(p.amount_due_thb,14000);assert.equal(p.verified,false);
});
test('stale final amount cannot return a QR for the full price',()=>{
  const d=payment(),f=payment('recFinal',20000,'final','pending_review','Pending');assert.throws(()=>project(balance([d,f]),f,FINAL),/final_payment_amount_mismatch/);
});
test('a final proof row without Amount may use freshly verified balance, not zero or planned deposit',()=>{
  const d=payment(),f=payment('recFinal',undefined,'final','pending_review','Pending');delete f.fields[F.amount];const p=project(balance([d,f]),f,FINAL);assert.equal(p.amount_due_thb,14000);
});
test('refund/reversal fails closed instead of silently charging the original full price',()=>{
  const d=payment();d.fields[F.status]='Refunded';assert.throws(()=>balance([d]),/balance_refund_review_required/);
});
test('cancelled Session cannot expose remaining collection details',()=>{
  const s=session();s.fields[F.sessionStatus]='Cancelled';assert.throws(()=>sum(s,[payment()]),/balance_session_not_payable/);
});
test('different records claiming the same verified payment ref require review, never double deduction',()=>{
  const a=payment(),b=payment('duplicate');b.fields[F.ref]=a.fields[F.ref];assert.throws(()=>balance([a,b]),/balance_duplicate_verified_reference/);
});
test('different refs claiming the same verified bank transaction require review',()=>{
  const a=payment(),b=payment('duplicate');for(const p of[a,b]){p.fields[F.transaction]='synthetic-transfer';p.fields[F.provider]='promptpay';}assert.throws(()=>balance([a,b]),/balance_duplicate_verified_transaction/);
});
test('cross-Session rows are not counted or disclosed',()=>{
  const d=payment();d.fields[F.paymentSession]='sess_other';assert.throws(()=>balance([d]),/balance_payment_session_mismatch/);
});
test('unknown verified payment stage requires review rather than assuming service money',()=>{
  assert.throws(()=>balance([payment('ambiguous',6000,'unknown')]),/balance_stage_review_required/);
});
test('unknown or non-cent-exact amounts cannot produce a payable balance',()=>{
  for(const n of [null,'',NaN,-1,Infinity,100.001])assert.throws(()=>sum(session(n),[payment()]),/balance_amount/);
  assert.throws(()=>balance([payment('bad',6000.001)]),/balance_amount_invalid/);
});
test('currency arithmetic is in integer satang',()=>{
  assert.equal(sum(session(20000.15),[payment('recDeposit',6000.10)]).remaining_amount_thb,14000.05);
});
test('a ledger read which differs from the previously validated anchor does not guess',()=>{
  const d=payment(),old=structuredClone(d);d.fields[F.amount]=7000;assert.throws(()=>project(balance([d]),old,FINAL),/balance_ledger_changed/);
});
test('paginated ledger is fully consumed and no write methods are used',async()=>{
  const calls=[];const env={AIRTABLE_BASE_ID:'app_fixture',AIRTABLE_API_KEY:'fixture-not-a-secret',AIRTABLE_HTTP:{async fetch(req){calls.push(req);assert.equal(req.method,'GET');const next=new URL(req.url).searchParams.get('offset');return Response.json(next?{records:[payment('b',3000)]}:{records:[payment('a',3000)],offset:'page-two'});}}};
  const b=await read(env,session());assert.equal(b.remaining_amount_thb,14000);assert.equal(calls.length,2);assert.match(decodeURIComponent(calls[0].url),/session_id/);
});
test('unavailable second page never uses a partial sum to charge too much',async()=>{
  const env={AIRTABLE_BASE_ID:'app_fixture',AIRTABLE_API_KEY:'fixture',AIRTABLE_HTTP:{async fetch(req){return new URL(req.url).searchParams.has('offset')?new Response('',{status:503}):Response.json({records:[payment('a',3000)],offset:'two'});}}};await assert.rejects(read(env,session()),/balance_ledger_unavailable/);
});
test('repeating pagination cursor is an error, not a complete ledger',async()=>{
  const env={AIRTABLE_BASE_ID:'app_fixture',AIRTABLE_API_KEY:'fixture',AIRTABLE_HTTP:{async fetch(){return Response.json({records:[payment()],offset:'same'});}}};await assert.rejects(read(env,session()),/balance_ledger_pagination_invalid/);
});
