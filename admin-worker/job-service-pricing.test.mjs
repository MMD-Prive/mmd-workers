import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateJobServicePricing, withJobServicePricingNote, SERVICE_PRICING_MARKER } from './src/job-service-pricing.js';
import { handleCanonicalLinkedJobCreate } from './src/create-session-canonical-link-runtime.js';
import worker from './src/index.js';
const body = () => ({
  amount_thb: 13000, service_amount_thb: 13000, original_amount_thb: 13000,
  pay_model_thb: 6200, model_payout_thb: 6200,
  private_access: { settlement_mode: 'direct' }, work: { job_visibility: 'private', service_options: ['mk', 'burn', 'live'] },
  payment: { amount_thb: 13000, service_amount_thb: 13000, model_payout_thb: 6200 },
  service_pricing: { version: 1, currency: 'THB', settlement_mode: 'direct',
    client_base_amount_thb: 10000, model_base_payout_thb: 5000,
    addons: [{ option: 'mk', client_amount_thb: 1000, model_payout_thb: 500 },
      { option: 'burn', client_amount_thb: 2000, model_payout_thb: 700 },
      { option: 'live', client_amount_thb: 0, model_payout_thb: 0 }],
    client_total_amount_thb: 13000, model_total_payout_thb: 6200 },
});
test('validates separate explicit quotes and accepts old payloads unchanged', () => {
  assert.deepEqual(validateJobServicePricing(body()), body().service_pricing);
  assert.equal(validateJobServicePricing({ amount_thb: 1000 }), null);
});
test('rejects missing, negative, nonfinite, duplicate, unknown, mismatched and deselected option rates', () => {
  const mutations = [
    b => { b.service_pricing.addons[0].client_amount_thb = null; },
    b => { b.service_pricing.addons[0].model_payout_thb = -1; },
    b => { b.service_pricing.client_base_amount_thb = Infinity; },
    b => { b.service_pricing.addons[0].client_amount_thb = 0.001; },
    b => { b.service_pricing.addons[1].option = 'mk'; },
    b => { b.service_pricing.addons[1].option = 'unknown'; },
    b => { b.work.service_options = ['mk']; },
    b => { b.payment.amount_thb = 10000; },
    b => { b.pay_model_thb = 5000; },
    b => { b.private_access.settlement_mode = 'platform'; },
  ];
  for (const mutate of mutations) { const b = body(); mutate(b);
    assert.throws(() => validateJobServicePricing(b), { code: 'service_pricing_invalid', status: 400 }); }
});
test('preserves platform settlement rather than generating direct payout', () => {
  const b = body(); b.private_access.settlement_mode = b.service_pricing.settlement_mode = 'platform';
  delete b.pay_model_thb; delete b.model_payout_thb; delete b.payment.model_payout_thb;
  assert.equal(validateJobServicePricing(b).model_total_payout_thb, 6200);
});
test('bounded internal note includes full breakdown, retains partner notes and replaces spoofed markers', () => {
  const p = validateJobServicePricing(body());
  const note = withJobServicePricingNote('Partner terms retained\n'+SERVICE_PRICING_MARKER+' spoof', p);
  assert.ok(note.startsWith('Partner terms retained\n'));
  assert.equal(note.split(SERVICE_PRICING_MARKER).length, 2);
  assert.deepEqual(JSON.parse(note.split(SERVICE_PRICING_MARKER+' ')[1]), p);
  assert.equal(withJobServicePricingNote(note, p), note);
});
test('canonical wrapper rejects invalid prices before downstream or Airtable writes', async () => {
  const b = body(); b.amount_thb = 1;
  let called = false;
  const response = await handleCanonicalLinkedJobCreate(new Request('https://admin.test/v1/admin/job/create', {
    method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' },
  }), {}, {}, { fetch() { called = true; throw new Error('must not run'); } });
  assert.equal(response.status, 400); assert.equal(called, false);
});
test('authenticated core rejects invalid prices before entitlement lookup, grant reservation or payment mint', async () => {
  const b = body(); b.work.job_visibility = 'private'; b.amount_thb = 1;
  const originalFetch = globalThis.fetch; let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('must not run'); };
  try {
    const response = await worker.fetch(new Request('https://admin.test/v1/admin/job/create', {
      method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin' },
    }), { ADMIN_BEARER: 'test-admin' }, {});
    assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'service_pricing_invalid');
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});
