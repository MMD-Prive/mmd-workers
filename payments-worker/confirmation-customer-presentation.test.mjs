import test from 'node:test';
import assert from 'node:assert/strict';
import { customerBillingBreakdown as bill, confirmationWorkLane as lane } from './confirmation-customer-presentation.js';
test('customer breakdown itemizes base and MK without copying model payout or private notes', () => {
  const b = bill({full_price_thb:15000,discount_thb:2000},13000,0,
    {client_base_amount_thb:13000,model_base_payout_thb:7000,addons:[{option:'mk',client_amount_thb:2000,model_payout_thb:2000}]},'private:pn:mk');
  assert.deepEqual(b.service_items,[{label:'PN',amount_thb:13000},{label:'MK',amount_thb:2000}]);
  assert.equal(b.total_thb,13000); assert.equal(b.discount_thb,2000);
  assert.doesNotMatch(JSON.stringify(b),/model_|7000/);
});
test('travel is displayed once whether included in the original total or separately itemized', () => {
  const p={full_price_thb:15000,discount_thb:2000};
  assert.equal(bill(p,13000,500).travel_treatment,'included');
  const added=bill(p,13500,500); assert.equal(added.travel_treatment,'added'); assert.equal(added.total_thb,13500);
  assert.equal(bill(p,13000,20000).breakdown_status,'review_required');
});
test('unknown or inconsistent historical prices are not invented from net total', () => {
  for (const p of [{},{full_price_thb:15000,discount_thb:500}]) {
    const b=bill(p,13000,0); assert.equal(b.original_price_thb,null); assert.equal(b.breakdown_status,'review_required');
  }
  assert.equal(bill({},500,500).original_price_thb,null);
});
test('wrong service item sums are omitted, never interpolated from model rates', () => {
  const b=bill({full_price_thb:13000,discount_thb:0},13000,null,{client_base_amount_thb:7000,addons:[{option:'mk',client_amount_thb:2000}]},'PN');
  assert.deepEqual(b.service_items,[]);
});
test('branding uses canonical session lane and never treats PN alone or an unknown lane as Private', () => {
  assert.equal(lane({fldzYGziqLqTQaoaK:'private_model'},'PN'),'private_model');
  assert.equal(lane({fldzYGziqLqTQaoaK:'public_model'},'private:pn'),'public_model');
  assert.equal(lane({},'private:standard:pn'),'private_model');
  assert.equal(lane({},'PN'),null); assert.equal(lane({},'public:private:PN'),null);
});
