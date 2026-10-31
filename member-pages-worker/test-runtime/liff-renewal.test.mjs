import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/runtime-index.js';

beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-31T05:00:00.000Z'));vi.stubGlobal('fetch',async()=>{throw Error('External network forbidden in Renewal fixture');});});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

async function fixture(days=-30,tier='standard') {
  const secret='renewal-runtime-test-secret-1234567890'; const token='fixture-cookie';
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('session:'+token)));
  const sessionKey='liff:session:'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const state={line_user_id:'U'+'a'.repeat(32),member_id:'fixture-member',member_exists:true,expires_at:Date.now()+600000,
    member_profile:{tier,membership_status:days<0?'active':'expired',membership_expires_at:new Date(Date.now()-days*86400000).toISOString()}};
  const values=new Map([[sessionKey,JSON.stringify(state)]]); const payments=[];
  const env={LIFF_SESSION_SECRET:secret,LIFF_RENEWAL_CARD_ENABLED:'true',LIFF_PROMOTION_PURCHASE_ENABLED:'false',
    LIFF_IDENTITY_KV:{async get(k,t){const value=values.get(k);return value==null?null:t==='json'?JSON.parse(value):value},async put(k,v){values.set(k,String(v))}},
    LIFF_GATEWAY_STORE:{async upsertSession(){},async recordDecision(){},async loadScreen(){},async resolvePackage(){},async hasHallAudienceInventory(){},async ensureRenewalPaymentSession(){return {record_id:'recFixture'}}},
    PAYMENTS_WORKER:{async fetch(request){const body=await request.json();payments.push(body);return Response.json({ok:true,payment_ref:'fixture-ref',session_id:body.session_id,customer_payment_url:'https://mmdbkk.com/pay/checkout?t=fixture',unified_payment_flow:'v1'})}}};
  const request=(path,body)=>new Request('https://mmdbkk.com/member/api/liff/renewal/'+path,{method:body?'POST':'GET',headers:{origin:'https://mmdbkk.com',cookie:'__Host-mmd_liff_session='+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return {env,request,payments,values,sessionKey,state};
}
describe('actual Worker runtime Renewal Standard/Premium activation readiness',()=>{
  for(const [tier,amount] of [['standard',1000],['premium',2500]]) {
    for(const days of [-30,0,89,90]) it(`${tier} day ${days}: canonical offer and signed checkout while Promotion flag stays off`,async()=>{
      const fx=await fixture(days,tier);
      const response=await worker.fetch(fx.request('offer'),fx.env);
      expect(response.status).toBe(200);const offer=await response.json();
      expect(offer.status).toBe('ready');expect(offer.amount_thb).toBe(amount);
      expect(offer.package_code).toBe(tier);expect(offer.pricing_policy).toBe('renewal_90_days_20261027');
      expect(offer.entitlement_granted).toBe(false);
      const purchase=await worker.fetch(fx.request('purchase',{package_code:tier}),fx.env);
      expect(purchase.status).toBe(200);const payload=await purchase.json();
      expect(payload.entitlement_granted).toBe(false);expect(payload.official_verification_required).toBe(true);
      expect(payload.redirect_to).toBe('https://mmdbkk.com/pay/checkout?t=fixture');
      expect(fx.payments).toHaveLength(1);expect(fx.payments[0].amount).toBe(amount);
      expect(fx.payments[0].session_id).toMatch(new RegExp('^liffrenew_'+tier+'_'));
      expect(fx.env.LIFF_PROMOTION_PURCHASE_ENABLED).toBe('false');
    });
    for(const days of [90+1/86400000,91]) it(`${tier} day ${days}: no payment after exact 90-day boundary`,async()=>{
      const fx=await fixture(days,tier);
      expect((await worker.fetch(fx.request('purchase',{package_code:tier}),fx.env)).status).toBe(409);
      expect(fx.payments).toHaveLength(0);
    });
    it(`${tier}: tampered price, package switch and cross-site requests cannot create payments`,async()=>{
      const fx=await fixture(-30,tier);
      expect((await worker.fetch(fx.request('purchase',{package_code:tier,amount:1}),fx.env)).status).toBe(400);
      expect((await worker.fetch(fx.request('purchase',{package_code:tier==='standard'?'premium':'standard'}),fx.env)).status).toBe(409);
      const req=fx.request('purchase',{package_code:tier});req.headers.set('origin','https://untrusted.invalid');
      expect((await worker.fetch(req,fx.env)).status).toBe(403);expect(fx.payments).toHaveLength(0);
    });
    it(`${tier}: stale LINE session and flag off are closed before payment creation`,async()=>{
      const fx=await fixture(-30,tier);fx.env.LIFF_RENEWAL_CARD_ENABLED='false';
      expect((await worker.fetch(fx.request('offer'),fx.env)).status).toBe(404);
      fx.env.LIFF_RENEWAL_CARD_ENABLED='true';fx.state.expires_at=Date.now()-1;
      fx.values.set(fx.sessionKey,JSON.stringify(fx.state));
      expect((await worker.fetch(fx.request('purchase',{package_code:tier}),fx.env)).status).toBe(401);
      expect(fx.payments).toHaveLength(0);
    });
  }
  for(const tier of ['vip','svip','blackcard']) it(`${tier}: protected tier has no ordinary Renewal payment`,async()=>{
    const fx=await fixture(-30,tier);
    expect((await worker.fetch(fx.request('purchase',{package_code:'standard'}),fx.env)).status).toBe(409);
    expect(fx.payments).toHaveLength(0);
  });
});
