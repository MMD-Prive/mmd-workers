import test from 'node:test';
import assert from 'node:assert/strict';
import { signConfirmToken, createConfirmTokenRecord } from './index.js';
import { maybeHandleShopConfirmationDetails, enrichShopConfirmVerify, notifyShopPayment, preflightReviewedShopPayment } from './shop-payment-v1.js';
import { paymentSnapshot, paymentProofTelegramRoute } from './unified-payment-proof.js';

function environment(){const rows=new Map();return{AIRTABLE_BASE_ID:'appTest',AIRTABLE_API_KEY:'fixture-token',PAYMENT_CONFIRMATION_SIGNING_SECRET:'fixture-signing-secret',PAY_TOKEN_TTL_SECONDS:'3600',PAY_SESSIONS_KV:{put:async(k,v)=>{rows.set(k,v)},get:async k=>rows.get(k)||null}}}
for(const[brand,prefix,name]of[['shop','HIMAI','Himai Shop'],['mmd-shop','MMD','MMD Shop']])test(brand+' signed payment details and verify claims preserve brand without treating proof as paid',async()=>{
 const env=environment(),orderId=prefix+'-PHASE1',now=Math.floor(Date.now()/1000),claims={kind:'customer_confirm',role:'customer',session_id:orderId,payment_ref:'shop_test',payment_type:'shop',iat:now,exp:now+3600};
 const t=await signConfirmToken(claims,env.PAYMENT_CONFIRMATION_SIGNING_SECRET);await createConfirmTokenRecord(env,t,claims);
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{const url=new URL(String(input)),table=url.pathname.split('/')[3];
  if(table==='tblr8lbi2wMuRM1N4')return Response.json({records:[{id:'recOOOOOOOOOOOOOO',fields:{flde515MCoEq08YzU:orderId,fld97aHqq3IbPam84:name,fldWG0u77XQ5W0wpT:'shop_brand='+brand,fldYIwMzRJdKdznkY:800,fldnCO3H5CpJoYmWD:'draft',fldUpDeLdO6D9OUcd:'pending'}}]});
  if(table==='tblWGGJJOx5eBvBZJ')return Response.json({records:[{id:'recPPPPPPPPPPPPPP',fields:{fldEJ1hmm7KwWuI6q:'Pending',fldJ7a0Ube9F0bmRy:'pending_review',fld04fr3bRJTohO6y:'Pending Confirmation'}}]});
  if(table==='tbl37Iprxz4OLL65P')return Response.json({records:[]});throw Error('unexpected_request');
 };
 try{
  const request=new Request('https://payments.internal/v1/confirm/details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({t,shop_brand:brand==='shop'?'mmd-shop':'shop'})});
  const result=await(await maybeHandleShopConfirmationDetails(request,env)).json();assert.equal(result.ok,true);assert.equal(result.model_name,name);assert.equal(result.shop_brand,brand);assert.equal(result.payment.verified,false);assert.equal(result.payment.proof_received,false);
  const enriched=await(await enrichShopConfirmVerify(request,Response.json({ok:true,claims}),env)).json();assert.equal(enriched.claims.shop_name,name);assert.equal(enriched.claims.model_name,name);assert.equal(enriched.claims.shop_order.shop_brand,brand);
 }finally{globalThis.fetch=original}
});
for(const[brand,id,flow]of[['shop','HIMAI-TEST','himai_payments'],['mmd-shop','MMD-TEST','mmd_shop_payments']])test(brand+' official verification notification uses persisted order brand',async()=>{
 let observed;const env={AUTH_SERVICE_PAYMENTS_TO_TELEGRAM:'fixture-secret',TELEGRAM_WORKER:{fetch:async req=>{observed=await req.json();return Response.json({ok:true,telegram:{ok:true}})}}};
 const result=await notifyShopPayment(env,{order:{order_id:id,shop_brand:brand},orderId:id,paymentRef:'test',amount:800});assert.equal(result.ok,true);assert.equal(observed.flow,flow);assert.match(observed.text,brand==='shop'?/HIMAI SHOP/:/MMD SHOP/);
});
test('payment proof routing ignores forged form brand and session fields',()=>{
 const form=new FormData();form.set('shop_brand','mmd-shop');form.set('session_id','MMD-FORGED');form.set('payment_stage','shop');
 const snapshot=paymentSnapshot({fields:{'Session ID':'HIMAI-TRUSTED',Notes:'payment_stage=shop; shop_brand=shop',Amount:800}},form);
 const route=paymentProofTelegramRoute({},snapshot,'public_pay');assert.equal(snapshot.session_id,'HIMAI-TRUSTED');assert.equal(route.thread_id,158);assert.equal(route.alerts_thread_id,159);assert.equal(route.shop_name,'Himai Shop');
});
test('ordinary membership/payment proof routing is unaffected by browser shop hints',()=>{
 const form=new FormData();form.set('shop_brand','shop');const snapshot=paymentSnapshot({fields:{payment_stage:'deposit',session_id:'SESSION-1',amount:1000}},form);assert.equal(snapshot.canonical_shop_brand,null);assert.equal(paymentProofTelegramRoute({},snapshot,'public_pay').thread_id,22);
});
test('conflicting brand evidence fails preflight before payment claim/mutation',async()=>{
 const original=globalThis.fetch;let claims=0;
 globalThis.fetch=async()=>Response.json({records:[{id:'recOOOOOOOOOOOOOO',fields:{flde515MCoEq08YzU:'HIMAI-1',fld97aHqq3IbPam84:'MMD Shop'}}]});
 try{const env={...environment(),MMD_SHOP_WORKER:{fetch:async()=>{claims++;throw Error('must_not_call')}}};const req=new Request('https://payments.internal/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:'HIMAI-1',payment_stage:'shop'})});const r=await preflightReviewedShopPayment(req,env);assert.equal(r.status,409);assert.equal((await r.json()).payment_committed,false);assert.equal(claims,0)}finally{globalThis.fetch=original}
});
test('notification failure remains visible and does not claim delivery success',async()=>{
 const r=await notifyShopPayment({AUTH_SERVICE_PAYMENTS_TO_TELEGRAM:'fixture',TELEGRAM_WORKER:{fetch:async()=>Response.json({ok:false},{status:502})}},{order:{order_id:'HIMAI-1'},orderId:'HIMAI-1',amount:1});assert.equal(r.ok,false);assert.equal(r.flow,'himai_payments');
});
