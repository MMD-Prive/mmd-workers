import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRenewalEligibility, withLiffRenewalEligibility, RENEWAL_PRICE_POLICY } from '../src/liff-renewal-eligibility.js';
const now = new Date('2026-10-27T10:00:00Z');
const session = (tier = 'standard', age = -1) => ({ memberExists:true, memberId:'TEST-MEMBER', lineUserId:'U'+'a'.repeat(32),
  memberProfile:{tier,membership_status:age < 0 ? 'active' : 'expired',membership_expires_at:new Date(now.getTime()-age*86400000).toISOString()} });
const env = {LIFF_RENEWAL_CARD_ENABLED:'true'};
const req = (path='offer', init) => new Request('https://mmdbkk.com/member/api/liff/renewal/'+path,init);
for (const [tier,price] of [['standard',1000],['premium',2500]]) {
  for (const age of [-30,0,89,90]) test(`${tier} day ${age}: original price without spend evidence`,()=>{
    for (const history of [null,{serviceSpend365Thb:0},{state:'checking'}]) {
      const result=evaluateRenewalEligibility(session(tier,age),history,tier,now);
      assert.equal(result.state,'eligible'); assert.equal(result.amount_thb,price);
      assert.equal(result.pricing_policy,RENEWAL_PRICE_POLICY);
      assert.equal(result.history_status,age<0?'not_required_for_advance':'not_required_for_90_day_renewal');
    }
  });
  test(`${tier}: one millisecond past 90 days requires review regardless of spend`,()=>{
    const member=session(tier,90); member.memberProfile.membership_expires_at=new Date(Date.parse(member.memberProfile.membership_expires_at)-1).toISOString();
    const result=evaluateRenewalEligibility(member,{state:'resolved',serviceSpend365Thb:1000000},tier,now);
    assert.equal(result.reason,'renewal_expired_over_90_days_review_required'); assert.equal(result.amount_thb,undefined);
  });
}
test('unknown expiry, package switch, blocked and protected tiers cannot bypass review',()=>{
  const unknown=session(); delete unknown.memberProfile.membership_expires_at;
  assert.equal(evaluateRenewalEligibility(unknown,null,'',now).reason,'canonical_expiry_required');
  assert.equal(evaluateRenewalEligibility(session(),null,'premium',now).reason,'package_change_review');
  for (const status of ['blocked','suspended','revoked','pending_review','under_review']) {
    const member=session(); member.memberProfile.membership_status=status;
    assert.equal(evaluateRenewalEligibility(member,null,'',now).reason,'membership_review');
  }
  assert.equal(evaluateRenewalEligibility(session('vip'),null,'',now).state,'defer');
});
test('guard passes one verified identity without reading service history',async()=>{
  const member=session(); member.memberProfile.membership_expires_at=new Date(Date.now()+86400000).toISOString();
  let calls=0;
  const response=await withLiffRenewalEligibility(req(),env,async identity=>{
    calls++; assert.equal(identity,member);
    return Response.json({ok:true,status:'ready',package_code:'standard',amount_thb:1000,payment_available:true,entitlement_granted:false});
  },{readSession:async()=>member,readSpend:async()=>assert.fail('no spend requirement')});
  assert.equal(calls,1); assert.equal((await response.json()).history_status,'not_required_for_advance');
});
test('guard fails closed on read failures and read-only grace sessions',async()=>{
  for (const readSession of [async()=>{throw Error('offline')},async()=>({...session(),readGraceOnly:true})]) {
    const result=await withLiffRenewalEligibility(req(),env,()=>assert.fail('cannot delegate'),{readSession});
    assert.equal(result.status,401);
  }
});
test('duplicate-slash purchase cannot bypass the over-90-day guard',async()=>{
  const result=await withLiffRenewalEligibility(req('purchase//',{method:'POST',body:JSON.stringify({package_code:'standard'})}),env,
    ()=>assert.fail('no payment'),{readSession:async()=>session('standard',1000)});
  assert.equal(result.status,409); assert.equal((await result.json()).payment_available,false);
});
test('disabled flag and unrelated requests are unchanged without reads',async()=>{
  const response=new Response('unchanged');
  assert.equal(await withLiffRenewalEligibility(req(),{},()=>response,{readSession:()=>assert.fail()}),response);
});
test('invalid request and changed package retain validation',async()=>{
  const deps={readSession:async()=>session()};
  assert.equal((await withLiffRenewalEligibility(req('offer?package_code=standard&package_code=premium'),env,()=>assert.fail(),deps)).status,400);
  const result=await withLiffRenewalEligibility(req('purchase',{method:'POST',body:JSON.stringify({package_code:'premium'})}),env,()=>assert.fail(),deps);
  assert.equal(result.status,409);
});
