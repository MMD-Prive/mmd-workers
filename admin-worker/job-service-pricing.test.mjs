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
  assert.ok(note.includes('\nPartner terms retained'));
  assert.equal(note.split(SERVICE_PRICING_MARKER).length, 2);
  assert.deepEqual(JSON.parse(note.split(SERVICE_PRICING_MARKER+' ')[1].split('\n')[0]), p);
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

function combinedRenewal() {
  const b = body();
  const action = { version: 'membership_action_v1', type: 'renew', source: 'sigil_jobs',
    state: 'pending_official_verify', materialization_policy: 'official_verify_required',
    entitlement_mutation_allowed: false, points_eligible: false, service_spend_eligible: false,
    referral_reward_eligible: false, include_in_payment: true, service_amount_thb: 13000,
    renewal_amount_thb: 3000, customer_total_thb: 16000 };
  b.amount_thb = b.payment.amount_thb = 16000;
  b.note = '[MMD_MEMBERSHIP_ACTION_V1] ' + JSON.stringify(action);
  return b;
}
test('validates split base/addons against service subtotal, not combined renewal payment total', () => {
  const b = combinedRenewal();
  assert.equal(validateJobServicePricing(b).client_total_amount_thb, 13000);
  assert.equal(b.amount_thb, 16000);
  assert.equal(b.service_pricing.model_total_payout_thb, 6200);
});
test('rejects unexplained, mismatched or entitlement-changing renewal components before writes', () => {
  for (const mutate of [
    b => { b.note = ''; },
    b => { b.service_amount_thb = 16000; },
    b => { b.payment.amount_thb = 13000; },
    b => { b.note = b.note.replace('"service_amount_thb":13000', '"service_amount_thb":10000'); },
    b => { b.note = b.note.replace('"renewal_amount_thb":3000', '"renewal_amount_thb":2000'); },
    b => { b.note = b.note.replace('"entitlement_mutation_allowed":false', '"entitlement_mutation_allowed":true'); },
    b => { b.note = b.note.replace('"materialization_policy":"official_verify_required"', '"materialization_policy":"skip_verify"'); },
  ]) {
    const b = combinedRenewal(); mutate(b);
    assert.throws(() => validateJobServicePricing(b), { code: 'service_pricing_invalid', status: 400 });
  }
});
test('complete snapshot survives issuer normalization, held prefix and 4000-character truncation', () => {
  const b = combinedRenewal(); const p = validateJobServicePricing(b);
  const note = withJobServicePricingNote('  '+SERVICE_PRICING_MARKER+' {"fake":true}\r\n'
    + '\t'+SERVICE_PRICING_MARKER+' {"another_fake":true}\n' + b.note + '\n' + 'ไทย'.repeat(2000), p);
  assert.ok(note.length <= 3800);
  assert.equal(note.split(SERVICE_PRICING_MARKER).length, 2);
  assert.equal(note.includes('fake'), false);
  const held = '[MMD_JOB_HOLD_V1] '+JSON.stringify({ status: 'pending_client_link', confirmation_hold: true,
    dispatch_hold: true, entitlement_release_hold: true });
  const stored = (held+'\n'+note+'\n[SIGIL Pricing v1] {}').slice(0, 4000);
  assert.deepEqual(JSON.parse(stored.split(SERVICE_PRICING_MARKER+' ')[1].split('\n')[0]), p);
  assert.ok(stored.includes(b.note));
  assert.equal(withJobServicePricingNote(note, p), note);
});
test('oversized machine envelope is rejected during validation before create or grant writes', () => {
  const b = combinedRenewal(); b.note = b.note.replace('"source":"sigil_jobs"', '"source":"sigil_jobs","irrelevant":"'+'x'.repeat(4000)+'"');
  assert.throws(() => validateJobServicePricing(b), { code: 'service_pricing_note_too_large', status: 400 });
});

test('separately paid renewal keeps the aggregate equal to the service quote', () => {
  const b = combinedRenewal(); b.amount_thb = b.payment.amount_thb = 13000;
  b.note = b.note.replace('"include_in_payment":true', '"include_in_payment":false').replace('"customer_total_thb":16000', '"customer_total_thb":13000');
  assert.equal(validateJobServicePricing(b).client_total_amount_thb, 13000);
});
test('valid currency cents do not fail due to floating-point addition of renewal money', () => {
  const b = combinedRenewal();
  b.amount_thb = b.payment.amount_thb = 0.1 + 0.2;
  b.service_amount_thb = b.original_amount_thb = b.payment.service_amount_thb = 0.1;
  b.pay_model_thb = b.model_payout_thb = b.payment.model_payout_thb = 0.1;
  b.work.service_options = [];
  Object.assign(b.service_pricing, { client_base_amount_thb: 0.1, model_base_payout_thb: 0.1,
    addons: [], client_total_amount_thb: 0.1, model_total_payout_thb: 0.1 });
  b.note = b.note.replace('"service_amount_thb":13000', '"service_amount_thb":0.1')
    .replace('"renewal_amount_thb":3000', '"renewal_amount_thb":0.2').replace('"customer_total_thb":16000', '"customer_total_thb":0.3');
  assert.equal(validateJobServicePricing(b).client_total_amount_thb, 0.1);
});

test('legacy string notes and structured operation notes retain the same renewal component contract', () => {
  for (const structured of [false, true]) {
    const b = combinedRenewal(); b.notes = structured ? { operation_note: b.note } : b.note; delete b.note;
    assert.equal(validateJobServicePricing(b).client_total_amount_thb, 13000);
  }
});
