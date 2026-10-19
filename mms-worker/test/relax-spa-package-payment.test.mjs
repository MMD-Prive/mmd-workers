import test from 'node:test';
import assert from 'node:assert/strict';
import { MMS_SPA_PAYMENT_POLICY, assertMmsPackagePaymentInput } from '../../shared/mms-spa-payment-policy.mjs';
import { agreementV3, agreementV2, inclusivePlan } from '../src/relax-spa-agreement.mjs';
import { applySpaCommand, RelaxSpaLedger } from '../src/relax-spa-ledger.mjs';
import { renderRelaxSpaPage } from '../../admin-worker/src/relax-spa-page.js';

const actor = { id: 'synthetic-owner', role: 'owner' };
const now = '2026-10-16T00:00:00Z';
const terms = {
  schema_version: 3, status: 'confirmed', title: 'Synthetic package',
  therapist_id: 'mmst_' + 'a'.repeat(24), duration_minutes: 90,
  therapist_amount: 80000, customer_amount: 200000, partner_amount: 0,
  mms_mode: 'residual', adjustments: [], terms_ref: 'synthetic-terms', approval_confirmed: true,
  room: { type: 'room/course', amount: 99900, fixed_units: 1, covered_minutes: 90,
    unit_description: 'per booking', includes: 'room/course excluding Therapist', rate_evidence_ref: 'synthetic-room-rate' },
  travel: { estimate_amount: 10000, method: 'synthetic agreed roundtrip', assessed_at: now, evidence_ref: 'synthetic-travel' },
  payees: { therapist: 'Synthetic Therapist', spa: 'Synthetic shop', mms: 'Synthetic MMS' },
};
const rejects = (fn, code) => assert.throws(fn, e => e.code === code);

test('package pays agreed room/course once and MMS retains residual after inclusive Therapist pay', () => {
  const a = agreementV3(terms, actor, now);
  assert.deepEqual(a.payment_policy, MMS_SPA_PAYMENT_POLICY);
  assert.deepEqual(a.preview.shares, { therapist: 80000, spa: 99900, partner: 0, mms: 20100 });
  assert.equal(a.preview.expected_amount, 200000);
  assert.equal(a.payment_policy.extras_mms_share_bps, 0);
});

test('independent shop extras and duplicate shop collection cannot enter agreements or payment commands', () => {
  const invalid = [
    [{ charge_scope: 'shop_extras' }, 'SHOP_EXTRAS_OUTSIDE_MMS'],
    [{ extras_amount: 10000 }, 'SHOP_EXTRAS_OUTSIDE_MMS'],
    [{ add_ons: [{ amount: 10000 }] }, 'SHOP_EXTRAS_OUTSIDE_MMS'],
    [{ extras_mms_share_bps: 2000 }, 'SHOP_EXTRAS_OUTSIDE_MMS'],
    [{ collection_party: 'shop' }, 'MMS_PACKAGE_COLLECTOR_REQUIRED'],
    [{ payment_policy: { ...MMS_SPA_PAYMENT_POLICY, extras_mms_share_bps: 1000 } }, 'PAYMENT_POLICY_MISMATCH'],
  ];
  for (const [input, code] of invalid) {
    rejects(() => agreementV3({ ...terms, ...input }, actor, now), code);
    for (const command of ['receipts', 'settlements']) {
      const state = { requests: {}, events: [], services: [] }, before = JSON.stringify(state);
      rejects(() => applySpaCommand(state, actor, command, { request_key: 'synthetic-request', ...input }), code);
      assert.equal(JSON.stringify(state), before);
    }
  }
  assertMmsPackagePaymentInput({ charge_scope: 'mms_package', collection_party: 'mms' });
});

test('historical inclusive agreement and quote are unchanged by new package policy', () => {
  const historical = agreementV2({ ...terms, schema_version: 2, basis: 'remaining_revenue', shares_bps: { spa: 5000, partner: 0, mms: 5000 } }, actor, now);
  const before = JSON.stringify(historical), preview = inclusivePlan(historical);
  agreementV3(terms, actor, now);
  assert.equal(JSON.stringify(historical), before);
  assert.deepEqual(inclusivePlan(historical), preview);
  assert.equal(historical.payment_policy, undefined);
});

test('Owner and Partner see the same package and extras collection terms', () => {
  for (const partner of [false, true]) {
    const html = renderRelaxSpaPage({ partner });
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new Function(match[1]);
    assert.ok(html.includes('ลูกค้า MMS ชำระแพ็กเกจกับ MMS ครั้งเดียว'));
    assert.ok(html.includes('ไม่เรียกเก็บรายการที่รวมในแพ็กเกจจากลูกค้าซ้ำ'));
    assert.ok(html.includes('ไม่รวมในยอดรับเงินหรือการจัดสรรของ MMS และไม่คิดส่วนแบ่ง MMS'));
  }
});

test('Partner snapshot exposes policy without leaking agreements or other Partner data', async () => {
  const state = { referrals: [], agreements: [terms], services: [], events: [], requests: {} };
  const ledger = new RelaxSpaLedger({ storage: { get: async () => state } });
  const response = await ledger.fetch(new Request('https://spa-ledger.internal', { method: 'POST', body: JSON.stringify({ command: 'snapshot', actor: { id: 'mms-partner:synthetic', role: 'mms_partner' }, body: {} }) }));
  const data = (await response.json()).data;
  assert.deepEqual(data.payment_policy, MMS_SPA_PAYMENT_POLICY);
  assert.deepEqual(data.agreements, []);
  assert.deepEqual(data.services, []);
});
