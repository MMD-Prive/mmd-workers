import test from 'node:test';
import assert from 'node:assert/strict';
import { mmsJobPricing } from '../src/mms-job-pricing.mjs';
test('MMS receives 30% of course plus travel and Therapist the remainder',()=>{
  const q=mmsJobPricing(2000,300);assert.equal(q.full_amount_thb,2300);assert.equal(q.mms_share_thb,690);assert.equal(q.therapist_share_thb,1610);assert.equal(q.payment_verified,false);assert.equal(q.payout_verified,false);
});
test('explicit zero travel is valid; missing travel is never treated as zero',()=>{
  assert.equal(mmsJobPricing('2000','0').full_amount_thb,2000);
  for(const travel of [undefined,null,'',true,-1])assert.throws(()=>mmsJobPricing(2000,travel));
});
test('satang rounding preserves full amount and rejects malformed or negative amounts',()=>{
  const q=mmsJobPricing('100.01','0.01');assert.equal(q.full_amount_thb,100.02);assert.equal(q.mms_share_thb,30.01);assert.equal(q.therapist_share_thb,70.01);
  for(const value of [-1,0,'1.234','1e3','NaN',Infinity,{},true])assert.throws(()=>mmsJobPricing(value,0));
});
