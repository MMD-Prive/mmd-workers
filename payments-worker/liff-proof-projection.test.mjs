import test from 'node:test';
import assert from 'node:assert/strict';
import { syncLiffProofProjection } from './liff-proof-projection.mjs';

function harness() {
  const payment = { id: 'recPayment', fields: { 'Payment Reference': 'pay1', session_id: 'liff1', payment_stage: 'membership', 'Package Code': 'premium', Amount: 2500, 'Payment Status': 'Pending', 'Verification Status': 'pending_review' } };
  const renewal = { id: 'recRenewal', fields: { renewal_session_id: 'liff1', requested_package: 'premium', renewal_amount_thb: 2500, renewal_flow_status: 'identity_linked' } };
  const proof = { id: 'recProof', createdTime: '2026-11-22T04:00:00.000Z', fields: { proof_id: 'proof1', payment_ref: 'pay1', amount_thb: 2500, status: 'pending', payment: ['recPayment'] } };
  const writes = [];
  const h = { payment, renewal, proof, writes, ambiguous: false, failRenewal: false, truncated: false };
  h.env = { AIRTABLE_BASE_ID: 'base', AIRTABLE_API_KEY: 'fixture', AIRTABLE_TABLE_PAYMENTS: 'payments', AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS: 'renewals', AIRTABLE_TABLE_PAYMENT_PROOFS: 'proofs', AIRTABLE_HTTP: {
    async fetch(req) {
      const url = new URL(req.url), table = url.pathname.split('/')[3];
      if (req.method === 'GET') {
        assert.ok(url.searchParams.get('filterByFormula'));
        if (table === 'payments') return Response.json({ records: [payment] });
        if (table === 'renewals') return Response.json({ records: h.ambiguous ? [renewal, { ...renewal, id: 'recOther' }] : [renewal], ...(h.truncated ? { offset: 'more' } : {}) });
        throw Error('unexpected read');
      }
      assert.equal(req.method, 'PATCH');
      const { fields } = await req.json();
      if (table === 'renewals' && h.failRenewal) return Response.json({}, { status: 503 });
      writes.push({ table, fields });
      Object.assign(table === 'renewals' ? renewal.fields : proof.fields, fields);
      return Response.json({ id: table === 'renewals' ? renewal.id : proof.id, fields });
    }
  } };
  return h;
}

test('LIFF upload links evidence to the exact session; official verification alone adds verified timestamp', async () => {
  const h = harness();
  const first = await syncLiffProofProjection(h.env, h.proof);
  assert.equal(first.status, 'linked'); assert.equal(first.verified, false);
  assert.deepEqual(h.proof.fields['MMD — LIFF Renewal Sessions'], ['recRenewal']);
  assert.equal(h.renewal.fields.proof_uploaded_at, h.proof.createdTime);
  assert.equal(h.renewal.fields.verified_at, undefined);
  assert.equal(h.payment.fields['Payment Status'], 'Pending');
  // A proof marked verified cannot certify money by itself.
  h.proof.fields.status = 'verified';
  await syncLiffProofProjection(h.env, h.proof);
  assert.equal(h.renewal.fields.verified_at, undefined);
  h.payment.fields['Payment Status'] = 'Paid'; h.payment.fields['Verification Status'] = 'verified';
  assert.equal((await syncLiffProofProjection(h.env, h.proof)).verified, true);
  const verifiedAt = h.renewal.fields.verified_at;
  await syncLiffProofProjection(h.env, h.proof);
  assert.equal(h.renewal.fields.verified_at, verifiedAt);
  assert.equal(h.renewal.fields.renewal_flow_status, 'identity_linked');
  assert.ok(h.writes.every(w => ['proofs', 'renewals'].includes(w.table)));
  assert.ok(h.writes.every(w => !('Payment Proof' in w.fields) && !('renewal_flow_status' in w.fields)));
});

for (const [name, change] of [
  ['ambiguous session', h => { h.ambiguous = true; }],
  ['incomplete candidates', h => { h.truncated = true; }],
  ['wrong amount', h => { h.renewal.fields.renewal_amount_thb = 1000; }],
  ['wrong package', h => { h.renewal.fields.requested_package = 'standard'; }],
  ['cancelled session', h => { h.renewal.fields.renewal_flow_status = 'cancelled'; }],
  ['another payment', h => { h.proof.fields.payment = ['recOther']; }],
  ['another LIFF session', h => { h.proof.fields['MMD — LIFF Renewal Sessions'] = ['recOther']; }],
]) test(`projection refuses ${name} without writing`, async () => {
  const h = harness(); change(h);
  assert.equal((await syncLiffProofProjection(h.env, h.proof)).status, 'review_required');
  assert.equal(h.writes.length, 0);
});

test('partial projection failure preserves evidence and is repairable by replay', async () => {
  const h = harness(); h.failRenewal = true;
  const result = await syncLiffProofProjection(h.env, h.proof);
  assert.equal(result.status, 'review_required'); assert.equal(result.retry_on_replay, true);
  assert.deepEqual(h.proof.fields['MMD — LIFF Renewal Sessions'], ['recRenewal']);
  h.failRenewal = false;
  assert.equal((await syncLiffProofProjection(h.env, h.proof)).status, 'linked');
  assert.equal(h.renewal.fields.proof_uploaded_at, h.proof.createdTime);
});

test('ordinary service payments never mutate LIFF', async () => {
  const h = harness(); h.payment.fields.payment_stage = 'deposit';
  assert.equal((await syncLiffProofProjection(h.env, h.proof)).status, 'not_applicable');
  assert.equal(h.writes.length, 0);
});
