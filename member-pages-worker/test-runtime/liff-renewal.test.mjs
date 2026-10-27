import { describe, it, expect } from 'vitest';
import worker from '../src/runtime-index.js';

async function fixture(days=-30) {
  const secret='renewal-runtime-test-secret-1234567890'; const token='fixture-cookie';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('session:'+token)));
  const sessionKey='liff:session:'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const state={line_user_id:'U'+'a'.repeat(32),member_id:'fixture-member',member_exists:true,expires_at:Date.now()+600000,
    member_profile:{tier:'standard',membership_status:days<0?'active':'expired',membership_expires_at:new Date(Date.now()-days*86400000).toISOString()}};
  const values=new Map([[sessionKey,JSON.stringify(state)]]); const payments=[];
  const env={LIFF_SESSION_SECRET:secret,LIFF_RENEWAL_CARD_ENABLED:'true',LIFF_PROMOTION_PURCHASE_ENABLED:'false',
    LIFF_IDENTITY_KV:{async get(k,t){const value=values.get(k);return value==null?null:t==='json'?JSON.parse(value):value},async put(k,v){values.set(k,String(v))}},
    LIFF_GATEWAY_STORE:{async upsertSession(){},async recordDecision(){},async loadScreen(){},async resolvePackage(){},async hasHallAudienceInventory(){},async ensureRenewalPaymentSession(){return {record_id:'recFixture'}}},
    PAYMENTS_WORKER:{async fetch(request){const body=await request.json();payments.push(body);return Response.json({ok:true,payment_ref:'fixture-ref',session_id:body.session_id,customer_payment_url:'https://mmdbkk.com/pay/checkout?t=fixture',unified_payment_flow:'v1'})}}};
  const request=(path,body)=>new Request('https://mmdbkk.com/member/api/liff/renewal/'+path,{method:body?'POST':'GET',headers:{origin:'https://mmdbkk.com',cookie:'__Host-mmd_liff_session='+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return {env,request,payments};
}
describe('actual Worker runtime renewal guard → handler → payment binding',()=>{
  for(const days of [-30,0,89]) it(`day ${days} quotes and purchases with no service-history request`,async()=>{
    const fx=await fixture(days);
    const offer=await(await worker.fetch(fx.request('offer'),fx.env)).json();
    expect(offer.status).toBe('ready');expect(offer.amount_thb).toBe(1000);expect(offer.pricing_policy).toBe('renewal_90_days_20261027');
    const purchase=await worker.fetch(fx.request('purchase',{package_code:'standard'}),fx.env);
    expect(purchase.status).toBe(200); const payload=await purchase.json(); expect(payload.entitlement_granted).toBe(false);
    expect(payload.redirect_to).toBe('https://mmdbkk.com/pay/checkout?t=fixture');expect(fx.payments).toHaveLength(1);
  });
  it('over 90 days cannot create a payment through the runtime',async()=>{
    const fx=await fixture(91);const response=await worker.fetch(fx.request('purchase',{package_code:'standard'}),fx.env);
    expect(response.status).toBe(409);expect(fx.payments).toHaveLength(0);
  });
});
