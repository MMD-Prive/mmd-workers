import test from 'node:test';
import assert from 'node:assert/strict';
import { applySpaCommand, calculateSpaShares, RelaxSpaLedger, maybeHandleRelaxSpaLedger } from '../src/relax-spa-ledger.mjs';
const owner = { id: 'per', role: 'owner' };
const partner = { id: 'mms-partner:henna', role: 'mms_partner' };
const therapist = { id: 'mmst_' + 'a'.repeat(24), name: 'Tamp', status: 'Active' };
const job = { id: 'mmsjob_' + 'b'.repeat(24), therapist_id: therapist.id, status: 'Completed', is_test: false };
const at = '2026-10-01T03:00:00.000Z';
const fresh = () => ({ referrals: [], agreements: [], services: [], events: [], requests: {} });
function fixture() {
  const state = fresh();
  const command = (c, b, a = owner, canonical = {}) => applySpaCommand(state, a, c, { request_key: crypto.randomUUID(), ...b }, canonical);
  const referral = command('referrals', { therapist_id: therapist.id, note: 'ให้ร้านพิจารณา' }, partner, { therapist }).id;
  command('referral-decision', { referral_id: referral, decision: 'accepted', evidence_ref: 'spa-acceptance-1' });
  const agreement = command('agreements', { title: 'ร้าน + Partner รุ่น 1', basis: 'net_profit', shares_bps: { therapist: 5000, spa: 3000, partner: 1000, mms: 1000 }, terms_ref: 'terms-1', approval_confirmed: true }).id;
  const service = command('services', { referral_id: referral, agreement_id: agreement, job_id: job.id, expected_amount: 100001, service_evidence: 'spa-work-order-1', costs: [{ label: 'ต้นทุนที่ตกลง', amount: 10000, evidence_ref: 'cost-1' }] }, owner, { job }).id;
  const receipt = (amount, ref, key) => command('receipts', { service_id: service, amount, received_by: 'Relax Spa by 9', evidence_ref: ref, received_at: at, verification_confirmed: true, ...(key ? { request_key: key } : {}) });
  const settle = (canonicalJob = job) => command('settlements', { service_id: service, approval_confirmed: true }, owner, { job: canonicalJob });
  return { state, command, referral, agreement, service, receipt, settle };
}
const throws = (fn, code) => assert.throws(fn, e => e.code === code);

test('partner referral through completed service, partial receipts and four exact shares', () => {
  const f = fixture();
  f.receipt(60000, 'bank-1');
  throws(() => f.settle(), 'FULL_PAYMENT_REQUIRED');
  f.receipt(40001, 'bank-2');
  f.settle();
  const service = f.state.services[0];
  assert.equal(service.settlement.basis_amount, 90001);
  assert.equal(Object.values(service.settlement.shares).reduce((a, b) => a + b), 90001);
  assert.deepEqual(service.settlement.shares, { therapist: 45001, spa: 27000, partner: 9000, mms: 9000 });
  for (const [role, amount] of Object.entries(service.settlement.shares)) {
    f.command('payouts', { service_id: f.service, role, amount, recipient: role, evidence_ref: 'payout-' + role, paid_at: at, verification_confirmed: true }, owner, { job });
  }
  assert.equal(service.payouts.length, 4);
  assert.equal(f.state.events.filter(e => e.action === 'payouts').length, 4);
});

test('idempotent receipt retry creates one credit; changed amount with reused key fails', () => {
  const f = fixture();
  f.receipt(60000, 'bank-1', 'same-request-001');
  assert.equal(f.receipt(60000, 'bank-1', 'same-request-001').duplicate, true);
  assert.equal(f.state.services[0].receipts.length, 1);
  throws(() => f.receipt(50000, 'bank-1', 'same-request-001'), 'REQUEST_KEY_REUSED');
});

test('different retry key cannot reuse payment evidence or overcredit service', () => {
  const f = fixture(); f.receipt(60000, 'bank-1');
  throws(() => f.receipt(20000, 'bank-1'), 'PAYMENT_EVIDENCE_ALREADY_USED');
  throws(() => f.receipt(50000, 'bank-2'), 'OVERPAYMENT_REQUIRES_REVIEW');
});

test('partner cannot spoof attribution, approve agreements, accept spa, receive money or payout', () => {
  const f = fixture();
  for (const command of ['referral-decision', 'agreements', 'services', 'receipts', 'settlements', 'payouts']) throws(() => f.command(command, {}, partner), 'OWNER_REQUIRED');
  const state = fresh();
  applySpaCommand(state, partner, 'referrals', { request_key: 'partner-request', therapist_id: therapist.id, partner_id: 'mms-partner:other' }, { therapist });
  assert.equal(state.referrals[0].partner_id, partner.id);
});

test('unfinished and test jobs cannot generate approved shares', () => {
  const f = fixture(); f.receipt(100001, 'bank-1');
  throws(() => f.settle({ ...job, status: 'In Service' }), 'COMPLETED_JOB_REQUIRED');
  throws(() => f.settle({ ...job, is_test: true }), 'COMPLETED_JOB_REQUIRED');
  assert.equal(f.state.services[0].settlement, null);
});

test('one canonical job can only be linked once and agreement is snapshotted', () => {
  const f = fixture();
  throws(() => f.command('services', { referral_id: f.referral, agreement_id: f.agreement, job_id: job.id }, owner, { job }), 'JOB_ALREADY_LINKED');
  f.state.agreements[0].shares_bps.partner = 9999;
  assert.equal(f.state.services[0].agreement.shares_bps.partner, 1000);
});

test('a job assigned to another therapist cannot be linked or settled', () => {
  const f = fixture(); f.receipt(100001, 'bank-1');
  throws(() => f.settle({ ...job, therapist_id: 'mmst_' + 'c'.repeat(24) }), 'COMPLETED_JOB_REQUIRED');
  assert.equal(f.state.services[0].settlement, null);
});

test('approved settlement is immutable; duplicate payout and wrong amount are rejected', () => {
  const f = fixture(); f.receipt(100001, 'bank-1'); f.settle();
  throws(() => f.receipt(1, 'bank-2'), 'SETTLEMENT_LOCKED');
  const payout = { service_id: f.service, role: 'partner', amount: 9000, recipient: 'Henna', evidence_ref: 'out-1', paid_at: at, verification_confirmed: true };
  throws(() => f.command('payouts', payout, owner, { job: { ...job, therapist_id: 'mmst_' + 'd'.repeat(24) } }), 'COMPLETED_JOB_REQUIRED');
  throws(() => f.command('payouts', { ...payout, amount: 1 }, owner, { job }), 'PAYOUT_AMOUNT_MISMATCH');
  f.command('payouts', { ...payout, request_key: 'pay-request-001' }, owner, { job });
  assert.equal(f.command('payouts', { ...payout, request_key: 'pay-request-001' }, owner, { job }).duplicate, true);
  throws(() => f.command('payouts', payout, owner, { job }), 'PAYOUT_ALREADY_RECORDED');
});

test('revenue and profit agreements use different explicitly approved bases', () => {
  const service = { receipts: [{ amount: 101 }], costs: [{ amount: 21 }] };
  const agreement = { basis: 'received_revenue', shares_bps: { therapist: 2500, spa: 2500, partner: 2500, mms: 2500 } };
  assert.equal(calculateSpaShares(service, agreement).basis_amount, 101);
  assert.equal(calculateSpaShares(service, { ...agreement, basis: 'net_profit' }).basis_amount, 80);
  throws(() => calculateSpaShares({ ...service, costs: [{ amount: 102 }] }, { ...agreement, basis: 'net_profit' }), 'NEGATIVE_PROFIT_REQUIRES_REVIEW');
});

test('unapproved, malformed and fractional-satang financial input fail closed', () => {
  const f = fixture();
  throws(() => f.receipt(0.5, 'bank-1'), 'AMOUNT_INVALID');
  throws(() => f.command('receipts', { service_id: f.service, amount: 100, evidence_ref: 'bank-1' }), 'PAYMENT_VERIFICATION_REQUIRED');
  throws(() => f.command('agreements', { title: 'x', basis: 'net_profit', shares_bps: { therapist: 7000, spa: 3000, partner: 1000, mms: 0 }, terms_ref: 'terms-2', approval_confirmed: true }), 'SHARES_MUST_TOTAL_100');
});

class MemoryStorage {
  constructor(state) { this.state = structuredClone(state); }
  async get() { return structuredClone(this.state); }
  async transaction(fn) { let next = structuredClone(this.state); const out = await fn({ get: async () => structuredClone(next), put: async (_, state) => { next = structuredClone(state); } }); this.state = next; return out; }
}
async function doRequest(ledger, actor, command, body = {}) {
  return ledger.fetch(new Request('https://spa-ledger.internal', { method: 'POST', body: JSON.stringify({ actor, command, body }) }));
}
test('durable snapshot scopes a partner to their referrals and hides receipts and other payouts', async () => {
  const f = fixture(); f.receipt(100001, 'bank-1'); f.settle();
  f.state.referrals.push({ id: 'other', partner_id: 'mms-partner:other', therapist_name: 'Private' });
  const ledger = new RelaxSpaLedger({ storage: new MemoryStorage(f.state) });
  const res = await doRequest(ledger, partner, 'snapshot'); const body = await res.json();
  assert.equal(body.data.referrals.length, 1); assert.equal(body.data.services.length, 1);
  assert.equal(body.data.services[0].partner_share, 9000);
  assert.equal('receipts' in body.data.services[0], false); assert.equal('payouts' in body.data.services[0], false);
  assert.equal(JSON.stringify(body).includes('bank-1'), false);
});

test('failed transaction does not persist partially mutated spa acceptance', async () => {
  const f = fixture(); f.state.referrals[0].status = 'referred';
  const storage = new MemoryStorage(f.state), ledger = new RelaxSpaLedger({ storage });
  const r = await doRequest(ledger, owner, 'referral-decision', { request_key: 'decision-key-001', referral_id: f.referral, decision: 'accepted', evidence_ref: '' });
  assert.equal(r.status, 400); assert.equal(storage.state.referrals[0].status, 'referred');
});

test('public hosts, missing binding and forged-role attempts never reach ledger', async () => {
  const publicRequest = new Request('https://mms-worker.malemodel-bkk.workers.dev/internal/mms/admin/relax-spa/snapshot', { headers: { 'x-mms-spa-actor': 'per', 'x-mms-spa-role': 'owner' } });
  assert.equal((await maybeHandleRelaxSpaLedger(publicRequest, {})).status, 404);
  const internal = new Request('https://mms.internal/internal/mms/admin/relax-spa/snapshot', { headers: { 'x-mms-spa-actor': 'per', 'x-mms-spa-role': 'owner' } });
  assert.equal((await maybeHandleRelaxSpaLedger(internal, {})).status, 503);
  assert.equal((await maybeHandleRelaxSpaLedger(new Request(internal.url, { headers: { 'x-mms-spa-actor': 'per', 'x-mms-spa-role': 'admin' } }), {})).status, 403);
});
