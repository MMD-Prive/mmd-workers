import test from 'node:test';
import assert from 'node:assert/strict';
import { simulatePricingChain, formPayload } from './fixtures/pricing-confirmation-chain.mjs';
import { validateJobServicePricing, validateJobCustomerDiscount, validateJobModelRate } from '../src/job-service-pricing.js';

for(const discountType of ['percent','amount']) for(const adjustment of [500,-500]) {
 test(`Create Job → stored issuer → checkout/details: ${discountType}, model ${adjustment}`,async()=>{
  const result=await simulatePricingChain({discountType,adjustment});
  const {input,customer,model,instructions,created}=result;
  assert.equal(input.service_pricing.discount.type,discountType);
  assert.equal(customer.pricing.full_price_thb,10000);
  assert.equal(customer.pricing.discount_mode,discountType);
  assert.equal(customer.pricing.discount_thb,2000);
  assert.equal(customer.pricing.discount_reason,'Demo November offer');
  assert.equal(customer.pricing.net_price_thb,8000);
  assert.equal(customer.payment.amount_due_thb,3000);
  assert.equal(instructions.amount_due_thb,3000);
  assert.equal(instructions.pricing.discount_mode,discountType);
  assert.equal(model.model_payout_thb,6000+adjustment-1000);
  const line=model.model_payout_breakdown[0];
  assert.equal(line.standard_amount_thb,6000);assert.equal(line.job_adjustment_thb,adjustment);
  assert.equal(line.discount_share_thb,1000);assert.equal(line.amount_thb,model.model_payout_thb);
  assert.equal(line.adjustment_reason,'Demo agreed rate adjustment');
  for(const key of ['pricing','billing','payment','amount_thb'])assert.equal(key in model,false,key);
  assert.equal(created.records.get('tblWGGJJOx5eBvBZJ')[0].fields.fldvCSwrUW8OMAooS,3000);
 });
}
test('percentage model adjustment keeps its input and explicit THB result',async()=>{
 const {model}=await simulatePricingChain({adjustmentType:'percent',adjustment:10});
 const line=model.model_payout_breakdown[0];
 assert.equal(line.adjustment_type,'percent');assert.equal(line.adjustment_value,10);
 assert.equal(line.job_adjustment_thb,600);assert.equal(model.model_payout_thb,5600);
});
test('500-baht percentage rounding survives without being reclassified as an amount',async()=>{
 const {customer}=await simulatePricingChain({gross:10500,percent:25});
 assert.equal(customer.pricing.discount_percent,25);assert.equal(customer.pricing.discount_thb,2500);
 assert.equal(customer.pricing.discount_basis_thb,10500);
 assert.equal(customer.pricing.discount_rounding,'floor_to_500_baht');
});
test('Public customer discounts and model rate metadata also survive storage',async()=>{
 const {customer,model,instructions}=await simulatePricingChain({visibility:'public',kind:'discount'});
 assert.equal(customer.payment.amount_due_thb,2000);assert.equal(instructions.amount_due_thb,2000);assert.equal(customer.pricing.deposit_basis_thb,10000);
 assert.equal(customer.pricing.discount_percent,20);assert.equal(customer.pricing.discount_reason,'Demo November offer');
 assert.equal(model.model_payout_breakdown[0].standard_amount_thb,6000);
 assert.equal(model.model_payout_thb,6500);
});
test('tampered adjustments and missing new-form discount reasons are rejected',async()=>{
 const body=await formPayload();body.service_pricing.model_base_job_adjustment_thb=999;
 assert.throws(()=>validateJobServicePricing(body),{code:'service_pricing_invalid'});
 body.customer_discount.reason='';assert.throws(()=>validateJobCustomerDiscount(body),{code:'customer_discount_invalid'});
 const publicBody=await formPayload({visibility:'public',kind:'discount'});
 publicBody.model_rate.adjustment_value=20;
 assert.throws(()=>validateJobModelRate(publicBody),{code:'model_rate_invalid'});
});
for (const kind of ['coupon','special_price']) test(kind+' retains its reason without charging the model a promotion share',async()=>{
 const {customer,model}=await simulatePricingChain({kind,discountType:'amount'});
 assert.equal(customer.pricing.discount_kind,kind);
 assert.equal(customer.pricing.discount_reason,'Demo November offer');
 assert.equal(model.model_payout_thb,6500);
 assert.equal(model.model_payout_breakdown[0].discount_share_thb,undefined);
});
