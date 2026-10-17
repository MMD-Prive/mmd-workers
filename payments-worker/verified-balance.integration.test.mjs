import assert from 'node:assert/strict';
import test from 'node:test';
import { signConfirmToken, createConfirmTokenRecord } from './index.js';
import { handleConfirmationDetails } from './confirmation-details.js';
import { handlePaymentInstructions } from './payment-instructions-v1.js';
import { stablePaymentRef } from './unified-payment-proof.js';
import { BALANCE_FIELDS as F } from './verified-session-balance.js';

const SID='sess_synthetic_verified_balance';
const DEPOSIT='pay_synthetic_verified_deposit';
const ORIGIN='https://mmdbkk.com';
const PF='tblWGGJJOx5eBvBZJ',SF='tblC98mKWbzmPuNzX',PROOFS='tblfJfM4Sqag9zrLi',CONFIG='tblTPC2yV1P3CwbgU';
function payment(id,ref,amount,stage,verified=false){return{id,fields:{[F.ref]:ref,[F.paymentSession]:SID,[F.amount]:amount,[F.stage]:stage,[F.verification]:verified?'verified':'pending_review',[F.status]:verified?'Paid':'Pending',[F.intent]:verified?'Confirmed':'Pending Confirmation'}};}
async function harness({final='absent',proof=false,depositProof=false}={}){
  const finalRef=await stablePaymentRef(SID,'final');
  const session={id:'recSyntheticSession',fields:{[F.sessionId]:SID,[F.total]:20000,[F.sessionStatus]:'Confirmed',[F.customerDue]:20000,fldojgjSQLaO0uQLX:DEPOSIT,fldTY5lE6m0kQf72n:'partial',flddVz6eoWRHrzIQr:'Synthetic Model',fldjK3U9bghnj7xUe:'private:pn',fldlTO5aNfqUmlNWm:12000,fldwl9Gs5tYlXG5ls:'[SIGIL Pricing v1] {"net_price_thb":20000,"deposit_due_thb":6000,"deposit_received_thb":0,"balance_thb":20000}'}};
  const rows=[payment('recVerified',DEPOSIT,6000,'deposit',true),payment('recOriginal','pay_synthetic_original',6000,'deposit')];
  if(final!=='absent')rows.push(payment('recFinal',finalRef,14000,'final',final==='verified'));
  const proofRows=[...(proof?[{id:'recFinalProof',fields:{payment_ref:finalRef,status:'submitted'}}]:[]),...(depositProof?[{id:'recDepositProof',fields:{payment_ref:DEPOSIT,status:'verified'}}]:[])];
  const calls=[],kv=new Map();
  const env={PAYMENT_CONFIRMATION_SIGNING_SECRET:'synthetic-balance-signing-key-only',PAY_SESSIONS_KV:{get:async k=>kv.get(k)||null,put:async(k,v)=>{kv.set(k,v)}},PAY_TOKEN_TTL_SECONDS:'3600',ALLOWED_ORIGINS:ORIGIN,AIRTABLE_BASE_ID:'app_fixture',AIRTABLE_API_KEY:'synthetic-fixture',AIRTABLE_TABLE_SESSIONS:SF,AIRTABLE_TABLE_PAYMENTS:PF,AIRTABLE_TABLE_PAYMENT_INSTRUCTIONS:CONFIG,AIRTABLE_TABLE_PAYMENT_PROOFS:PROOFS,
    AIRTABLE_HTTP:{async fetch(input,init){
      const req=input instanceof Request?input:new Request(input,init),url=new URL(req.url);calls.push({url,method:req.method});
      assert.equal(req.method,'GET','viewing a QR must not create or modify a Payment');
      assert.equal(url.hostname,'api.airtable.com','all requests are intercepted locally');
      const table=decodeURIComponent(url.pathname.split('/')[3]),formula=url.searchParams.get('filterByFormula')||'';
      if(table===SF)return Response.json({records:[session]});
      if(table===PF){
        if(env.failLedger&&url.searchParams.has('pageSize'))return new Response('',{status:503});
        const ref=formula.match(/\{Payment Reference\}='([^']+)'/)?.[1];
        return Response.json({records:ref?rows.filter(p=>p.fields[F.ref]===ref):rows});
      }
      if(table===PROOFS){
        if(env.failProof)return new Response('',{status:503});
        const ref=formula.match(/\{payment_ref\}='([^']+)'/)?.[1];return Response.json({records:proofRows.filter(p=>p.fields.payment_ref===ref)});
      }
      if(table===CONFIG)return Response.json({records:[{id:'recSyntheticInstructions',fields:{'Instruction ID':'mmd_job_v1',Status:'active',Version:1,Methods:['promptpay','bank_transfer','paypal_card'],'PromptPay Ref':'0899999999','QR Strategy':'dynamic_amount','Bank Provider':'fixture','Bank Name TH':'ธนาคารทดสอบ','Account Name TH':'บัญชีทดสอบ','Account Number':'0000000000','PayPal URL':'https://www.paypal.com/example','Effective From':'2026-01-01T00:00:00.000Z'}}]});
      throw new Error('unexpected fixture request');
    }}
  };
  const iat=Math.floor(Date.now()/1000);
  async function token(role='customer',extra={}){const c={kind:role==='customer'?'customer_confirm':'model_confirm',role,session_id:SID,payment_ref:DEPOSIT,payment_type:'deposit',iat,exp:iat+3600,...extra};const t=await signConfirmToken(c,env.PAYMENT_CONFIRMATION_SIGNING_SECRET);await createConfirmTokenRecord(env,t,c);return t;}
  const t=await token();
  const post=(path,extra={},role='customer',bearer=t)=>new Request('https://sigil.mmdbkk.com'+path,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({t:bearer,expected_role:role,...extra})});
  const details=(extra={})=>handleConfirmationDetails(post('/v1/confirm/details',extra),env);
  const instructions=(extra={},bearer=t)=>handlePaymentInstructions(post('/v1/confirm/payment-instructions',extra,'customer',bearer),env,req=>handleConfirmationDetails(req,env));
  return {env,session,rows,calls,finalRef,t,token,post,details,instructions};
}

test('original signed deposit link displays final balance 14,000 before any final row/model arrival',async()=>{
  const h=await harness(),before=JSON.stringify([h.session,h.rows]);
  const r=await h.details(),d=await r.json();assert.equal(r.status,200,JSON.stringify(d));
  assert.equal(d.payment_ref,h.finalRef);assert.equal(d.payment_type,'final');assert.equal(d.payment.stage,'final');assert.equal(d.payment.amount_due_thb,14000);assert.equal(d.payment.verified,false);assert.equal(d.payment.proof_received,false);
  assert.equal(d.pricing.deposit_received_thb,6000);assert.equal(d.pricing.balance_thb,14000);assert.equal(d.balance_summary.verified_paid_thb,6000);
  assert.equal(d.payment.qr_url,null,'do not reuse a deposit QR');assert.equal(JSON.stringify(d).includes('model_payout'),false);assert.equal(JSON.stringify([h.session,h.rows]),before);
});
test('real Payment Instructions handler emits amount-embedded QR for 14,000, never 20,000 or 6,000',async()=>{
  const h=await harness(),r=await h.instructions({amount_due_thb:1,payment_ref:'pay_attacker',payment_type:'full'}),d=await r.json();assert.equal(r.status,200,JSON.stringify(d));
  assert.equal(d.available,true);assert.equal(d.stage,'final');assert.equal(d.amount_due_thb,14000);assert.equal(d.payment_ref,h.finalRef);
  assert.equal(new URL(d.instructions.promptpay.qr_url).pathname,'/0899999999/14000.00.png');assert.equal(d.instructions.promptpay.amount_entry,'embedded');assert.equal(d.instructions.bank_transfer.account_number,'0000000000');
  assert.equal(d.instructions.promptpay.qr_url.includes(h.t),false);assert.equal(h.rows.length,2);assert.ok(h.calls.every(c=>c.method==='GET'));
});
test('parallel read retries use one stable final reference and never create duplicate receipt rows',async()=>{
  const h=await harness();const results=await Promise.all(Array.from({length:12},()=>h.instructions().then(r=>r.json())));assert.ok(results.every(r=>r.payment_ref===h.finalRef&&r.amount_due_thb===14000));assert.equal(h.rows.length,2);assert.ok(h.calls.every(c=>c.method==='GET'));
});
test('verified deposit proof is not mistaken for pending final-payment evidence',async()=>{
  const h=await harness({depositProof:true}),d=await(await h.instructions()).json();assert.equal(d.available,true);assert.equal(d.stage,'final');
});
test('actual final proof hides destinations until official verification',async()=>{
  const h=await harness({proof:true}),d=await(await h.instructions()).json();assert.equal(d.available,false);assert.equal(d.reason,'proof_received_waiting_verification');assert.equal(d.instructions,undefined);
});
test('already verified final receipt prevents another QR or bank transfer',async()=>{
  const h=await harness({final:'verified'}),d=await(await h.instructions()).json();assert.equal(d.available,false);assert.equal(d.reason,'payment_verified');assert.equal(d.amount_due_thb,0);assert.equal(d.instructions,undefined);
});
test('Session paid display flag cannot mark a new final balance verified',async()=>{
  const h=await harness();h.session.fields.fldTY5lE6m0kQf72n='paid';const d=await(await h.instructions()).json();assert.equal(d.available,true);assert.equal(d.amount_due_thb,14000);
});
test('unverified original deposit still follows the deposit lane, no premature final collection',async()=>{
  const h=await harness();h.rows[0].fields[F.verification]='pending_review';h.rows[0].fields[F.status]='Pending';h.rows[0].fields[F.intent]='Pending Confirmation';
  const d=await(await h.instructions()).json();assert.equal(d.stage,'deposit');assert.equal(d.amount_due_thb,6000);assert.equal(d.payment_ref,DEPOSIT);
});
test('ledger outage cannot fall back to stale full-price collection',async()=>{
  const h=await harness();h.env.failLedger=true;const r=await h.instructions(),d=await r.json();assert.equal(r.status,503);assert.equal(d.ok,false);assert.equal(d.instructions,undefined);
});
test('proof lookup outage cannot reopen payment destinations',async()=>{
  const h=await harness();h.env.failProof=true;const r=await h.instructions(),d=await r.json();assert.equal(r.status,503);assert.equal(d.instructions,undefined);
});
test('expired and cross-role tokens cannot reach bank/QR configuration',async()=>{
  const h=await harness(),model=await h.token('model'),expired=await h.token('customer',{iat:1,exp:2});h.calls.length=0;
  for(const token of[model,expired]){const r=await h.instructions({},token);assert.ok(r.status>=400);assert.equal((await r.json()).instructions,undefined);}assert.equal(h.calls.length,0);
});
test('Model confirmation keeps customer balances and payment references private',async()=>{
  const h=await harness(),t=await h.token('model');const r=await handleConfirmationDetails(h.post('/v1/confirm/details',{},'model',t),h.env),d=await r.json();assert.equal(r.status,200);assert.equal(d.balance_summary,undefined);assert.equal(d.payment,undefined);assert.equal(d.payment_ref,undefined);assert.equal(d.model_payout_thb,12000);
});
