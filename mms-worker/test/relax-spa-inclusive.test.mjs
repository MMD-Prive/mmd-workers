import test from 'node:test';
import assert from 'node:assert/strict';
import { inclusivePlan, agreementV2, agreementV3 } from '../src/relax-spa-agreement.mjs';
import { applySpaCommand, RelaxSpaLedger, maybeHandleRelaxSpaLedger } from '../src/relax-spa-ledger.mjs';
const owner = { id: 'per', role: 'owner' }, partner = { id: 'mms-partner:qaa', role: 'mms_partner' };
const therapist = { id: 'mmst_' + 'a'.repeat(24), name: 'Synthetic Therapist', status: 'Active' };
const job = { id: 'mmsjob_' + 'b'.repeat(24), therapist_id: therapist.id, status: 'Completed', duration_minutes: 90, therapist_amount: 60001, travel_amount: 0, is_test: false };
const at = '2026-10-01T00:00:00.000Z';
const agreement = (extra = {}) => ({ schema_version: 2, status: 'confirmed', title: 'Synthetic agreement', therapist_id: therapist.id, spa_id: 'relax-spa-by-9', duration_minutes: 90, therapist_amount: 60001, customer_amount: 100002,
  travel: { estimate_amount: 0, method: 'Synthetic walk roundtrip from home', assessed_at: at, evidence_ref: 'synthetic-home-roundtrip' },
  basis: 'remaining_revenue', shares_bps: { spa: 5000, partner: 0, mms: 5000 }, referrer_id: null, adjustments: [], terms_ref: 'synthetic-signed-terms', approval_confirmed: true, ...extra });
const throws = (fn, code) => assert.throws(fn, e => e.code === code);
function fixture(extra = {}, book = true) {
  const state = { referrals: [], agreements: [], services: [], events: [], requests: {} };
  const cmd = (c, b, actor = owner, canonical = { therapist, job: {...job,customer_amount:100002,venue_id:'relax-spa-by-9',travel_included_confirmed:true} }) => applySpaCommand(state, actor, c, { request_key: crypto.randomUUID(), ...b }, canonical);
  const referral = cmd('referrals', { therapist_id: therapist.id }, partner).id;
  cmd('referral-decision', { referral_id: referral, decision: 'accepted', evidence_ref: 'synthetic-accept' });
  const legacy = agreement(extra), split=inclusivePlan(legacy);
  const v3={...legacy,schema_version:3,room:{type:'Synthetic room',amount:split.shares.spa,fixed_units:1,covered_minutes:90,unit_description:'Agreed booking',includes:'Room only',rate_evidence_ref:'synthetic-room-terms'},partner_amount:split.shares.partner,mms_mode:'fixed_fee',mms_amount:split.shares.mms,payees:{therapist:'Synthetic therapist',spa:'Synthetic spa',partner:'Synthetic partner',mms:'Synthetic mms'}};
  // Carry adjustments once: split above is used only for unadjusted base components.
  const base=inclusivePlan({...legacy,adjustments:[]});v3.room.amount=base.shares.spa;v3.partner_amount=base.shares.partner;v3.mms_amount=base.shares.mms;
  const aid = cmd('agreements', v3).id;
  const sid = cmd('drafts', { referral_id: referral }).id;
  const service = state.services[0];
  if (book) { cmd('quotes', { service_id: sid, agreement_id: aid, approval_confirmed: true }); cmd('services', { service_id: sid, job_id: job.id, duration_minutes: 90, service_evidence: 'synthetic-work-order' }); }
  const receipt = (amount, evidence = 'synthetic-receipt', key = crypto.randomUUID()) => cmd('receipts', { service_id: sid, amount, evidence_ref: evidence, received_by: 'Synthetic spa', received_at: at, verification_confirmed: true, request_key: key });
  const settle = (j = job) => cmd('settlements', { service_id: sid, approval_confirmed: true }, owner, { job: {...j, customer_amount:j.customer_amount ?? 100002,venue_id:'relax-spa-by-9',travel_included_confirmed:true} });
  return { state, cmd, referral, aid, sid, service, receipt, settle };
}

test('inclusive therapist fixed amount varies per therapist and duration; no travel added twice', () => {
  const first = agreementV2(agreement(), owner, new Date().toISOString());
  const second = agreementV2(agreement({ therapist_id: 'mmst_' + 'c'.repeat(24), duration_minutes: 120, therapist_amount: 70000, travel: { ...agreement().travel, estimate_amount: 12500 } }), owner, new Date().toISOString());
  assert.equal(first.preview.shares.therapist, 60001);
  assert.equal(second.preview.shares.therapist, 70000);
  assert.equal(second.preview.total_allocated, second.customer_amount);
  assert.equal(second.travel.confirmed_by, owner.id);
  assert.equal(second.travel.origin_scope, 'therapist_home_roundtrip');
});

test('zero travel can confirm, unknown travel only saves draft; legacy rates are never new defaults', () => {
  const f = fixture({}, false);
  const draft = f.cmd('agreements', { schema_version: 3, status: 'draft', title: 'Unknown roundtrip' }).id;
  assert.equal(f.state.agreements.at(-1).travel, null);
  throws(() => f.cmd('quotes', { service_id: f.sid, agreement_id: draft, approval_confirmed: true }), 'CONFIRMED_AGREEMENT_REQUIRED');
  throws(() => agreementV3({...f.state.agreements[0],travel:{...agreement().travel,estimate_amount:null},approval_confirmed:true},owner,new Date().toISOString()), 'TRAVEL_ASSESSMENT_REQUIRED');
  throws(() => f.cmd('agreements', { title: 'Old unsupported terms', basis: 'net_profit' }), 'ROOM_AGREEMENT_REQUIRED');
  assert.equal(f.service.status, 'draft');
});

test('remaining allocation uses largest remainder with deterministic satang tie and conservation', () => {
  const p = inclusivePlan(agreement());
  assert.deepEqual(p.shares, { therapist: 60001, spa: 20001, partner: 0, mms: 20000 });
  assert.equal(p.total_allocated + p.costs, p.received);
  for (let n = 0; n < 100; n++) {
    const a = agreement({ customer_amount: 100000 + n, therapist_amount: 45678 + n, shares_bps: { spa: 3333, partner: 3333, mms: 3334 }, referrer_id: partner.id });
    const r = inclusivePlan(a);
    assert.equal(Object.values(r.shares).reduce((s, v) => s + v, 0), a.customer_amount);
  }
});

test('gross basis requires exact allocation with fixed therapist amount; rejects silent remainder', () => {
  const a = agreement({ customer_amount: 100000, therapist_amount: 60000, basis: 'received_revenue', shares_bps: { spa: 2500, partner: 0, mms: 1500 } });
  assert.deepEqual(inclusivePlan(a).shares, { therapist: 60000, spa: 25000, partner: 0, mms: 15000 });
  throws(() => inclusivePlan({ ...a, therapist_amount: 60001 }), 'ALLOCATION_MUST_BALANCE');
});

test('negative, fractional satang, unknown burden/base and excessive allocations fail closed', () => {
  throws(() => inclusivePlan(agreement({ therapist_amount: 200000 })), 'ALLOCATION_EXCEEDS_REVENUE');
  throws(() => inclusivePlan(agreement({ therapist_amount: -1 })), 'AMOUNT_INVALID');
  throws(() => inclusivePlan(agreement({ customer_amount: 100.1 })), 'AMOUNT_INVALID');
  throws(() => inclusivePlan(agreement({ adjustments: [{ kind: 'fee', amount: 2, evidence_ref: 'synthetic' }] })), 'ADJUSTMENT_BASIS_REQUIRED');
  throws(() => inclusivePlan(agreement({ adjustments: [{ kind: 'tax', amount: 90000, bearer: 'mms', basis: 'fixed_satang', evidence_ref: 'synthetic' }] })), 'NEGATIVE_PARTY_SHARE');
});

test('explicit burdens conserve receipt minus refund, fee and tax; never deduct travel as a cost', () => {
  const adjustments = [
    { kind: 'discount', amount: 2000, bearer: 'spa', basis: 'fixed_satang', evidence_ref: 'synthetic-discount' },
    { kind: 'fee', amount: 300, bearer: 'mms', basis: 'fixed_satang', evidence_ref: 'synthetic-fee' },
    { kind: 'tax', amount: 500, bearer: 'mms', basis: 'fixed_satang', evidence_ref: 'synthetic-tax' },
    { kind: 'refund', amount: 1000, bearer: 'spa', basis: 'fixed_satang', evidence_ref: 'synthetic-refund-terms' },
  ];
  const f = fixture({ adjustments }); f.receipt(98002);
  throws(() => f.settle(), 'FULL_PAYMENT_REQUIRED');
  f.cmd('refunds', { service_id: f.sid, amount: 1000, evidence_ref: 'synthetic-refund-txn', refunded_at: at, reason: 'Synthetic refund', verification_confirmed: true });
  f.settle();
  assert.equal(f.service.settlement.received, 97002);
  assert.equal(f.service.settlement.costs, 800);
  assert.equal(f.service.settlement.total_allocated, 96202);
  assert.equal(f.service.settlement.shares.therapist, 60001);
  throws(() => f.cmd('refunds', { service_id: f.sid }), 'REFUND_RECONCILIATION_REQUIRED');
});

test('quote scope locks therapist, spa, duration and referrer; referrer never automatically paid', () => {
  const f = fixture({}, false);
  assert.equal(f.state.agreements[0].partner_amount, 0);
  f.state.agreements[0].therapist_id = 'mmst_' + 'c'.repeat(24);
  throws(() => f.cmd('quotes', { service_id: f.sid, agreement_id: f.aid, approval_confirmed: true }), 'AGREEMENT_SCOPE_MISMATCH');
  f.state.agreements[0].therapist_id = therapist.id;
  f.cmd('quotes', { service_id: f.sid, agreement_id: f.aid, approval_confirmed: true });
  throws(() => f.cmd('services', { service_id: f.sid, job_id: job.id, duration_minutes: 120, service_evidence: 'synthetic' }), 'DURATION_AGREEMENT_MISMATCH');
  throws(() => f.cmd('services', { service_id: f.sid, job_id: job.id, duration_minutes: 90, service_evidence: 'synthetic' }, owner, { job: { ...job, duration_minutes: 120 } }), 'DURATION_AGREEMENT_MISMATCH');
  throws(() => f.cmd('services', { service_id: f.sid, job_id: job.id, duration_minutes: 90, service_evidence: 'synthetic', costs: [{ amount: 20000 }] }), 'INCLUSIVE_TRAVEL_NO_EXTRA_COSTS');
  throws(() => inclusivePlan(agreement({ shares_bps: { spa: 5000, partner: 1000, mms: 4000 } })), 'REFERRER_EXPLICIT_REQUIRED');
  const other = fixture({ shares_bps: { spa: 5000, partner: 1000, mms: 4000 }, referrer_id: 'mms-partner:other' }, false);
  throws(() => other.cmd('quotes', { service_id: other.sid, agreement_id: other.aid, approval_confirmed: true }), 'REFERRER_SCOPE_MISMATCH');
});

test('partial receipts, incomplete services and canonical duration changes cannot approve money', () => {
  const f = fixture(); f.receipt(60000);
  throws(() => f.settle(), 'FULL_PAYMENT_REQUIRED');
  f.receipt(40002, 'synthetic-receipt-2');
  throws(() => f.settle({ ...job, status: 'In Service' }), 'COMPLETED_JOB_REQUIRED');
  throws(() => f.settle({ ...job, duration_minutes: 120 }), 'DURATION_AGREEMENT_MISMATCH');
  throws(() => f.settle({ ...job, is_test: true }), 'COMPLETED_JOB_REQUIRED');
  f.settle(); assert.equal(f.service.settlement.received, 100002);
});

test('changed rates after quote cannot change this job; approved and paid snapshots remain frozen', () => {
  const f = fixture();
  const quoted = structuredClone(f.service.agreement);
  f.state.agreements[0].therapist_amount = 80000;
  assert.deepEqual(f.service.agreement, quoted);
  throws(() => f.cmd('quotes', { service_id: f.sid, agreement_id: f.aid, approval_confirmed: true }), 'QUOTE_LOCKED');
  f.receipt(100002); f.settle();
  assert.equal(f.service.settlement.shares.therapist, 60001);
  throws(() => f.cmd('close', { service_id: f.sid, approval_confirmed: true }), 'PAYOUTS_INCOMPLETE');
  for (const [role, amount] of Object.entries(f.service.settlement.shares)) if (amount) f.cmd('payouts', { service_id: f.sid, role, amount, recipient: f.service.agreement.payees[role], evidence_ref: 'synthetic-out-'+role, paid_at: at, verification_confirmed: true });
  const close = { service_id: f.sid, approval_confirmed: true, request_key: 'close-retry-key' };
  f.cmd('close', close); assert.equal(f.cmd('close', close).duplicate, true);
  assert.equal(f.service.status, 'closed');
  throws(() => f.receipt(1, 'synthetic-extra'), 'SERVICE_CLOSED');
  assert.equal(f.state.events.filter(e => e.action === 'close').length, 1);
});

test('duplicate clicks, normalized transaction references, duplicate job and refund writes are rejected', () => {
  const f = fixture({ adjustments: [{ kind: 'refund', amount: 1000, bearer: 'spa', basis: 'fixed_satang', evidence_ref: 'synthetic-terms' }] });
  f.receipt(100002, 'Synthetic-Bank-1', 'receipt-retry-key');
  assert.equal(f.receipt(100002, 'Synthetic-Bank-1', 'receipt-retry-key').duplicate, true);
  throws(() => f.receipt(1, 'synthetic-bank-1'), 'PAYMENT_EVIDENCE_ALREADY_USED');
  const refund = { service_id: f.sid, amount: 500, evidence_ref: 'synthetic-refund', refunded_at: at, reason: 'Synthetic', verification_confirmed: true, request_key: 'refund-retry-key' };
  f.cmd('refunds', refund); assert.equal(f.cmd('refunds', refund).duplicate, true);
  throws(() => f.cmd('refunds', { ...refund, request_key: 'different-refund-key' }), 'REFUND_EVIDENCE_ALREADY_USED');
  throws(() => f.cmd('refunds', { ...refund, amount: 1000, evidence_ref: 'other-refund', request_key: 'over-refund-key' }), 'REFUND_EXCEEDS_APPROVED_AMOUNT');
  const draft = f.cmd('drafts', { referral_id: f.referral }).id;
  f.cmd('quotes', { service_id: draft, agreement_id: f.aid, approval_confirmed: true });
  throws(() => f.cmd('services', { service_id: draft, job_id: job.id, duration_minutes: 90 }), 'JOB_ALREADY_LINKED');
});

test('snapshot hides another partner and all agreement/travel and private payout evidence', async () => {
  const f = fixture({ shares_bps: { spa: 4000, partner: 1000, mms: 5000 }, referrer_id: partner.id });
  f.receipt(100002); f.settle();
  const snapshot = async actor => {
    const ledger = new RelaxSpaLedger({ storage: { get: async () => structuredClone(f.state) } });
    return (await ledger.fetch(new Request('https://spa-ledger.internal', { method: 'POST', body: JSON.stringify({ actor, command: 'snapshot' }) }))).json();
  };
  const own = (await snapshot(partner)).data;
  assert.equal(own.services[0].payment_status, 'paid');
  assert.deepEqual(own.agreements, []);
  assert.equal(JSON.stringify(own).includes('home_roundtrip'), false);
  const other = (await snapshot({ ...partner, id: 'mms-partner:other' })).data;
  assert.equal(other.services.length, 0); assert.equal(other.referrals.length, 0);
  for (const cmd of ['drafts','quotes','services','refunds','close','agreements','payouts']) throws(() => f.cmd(cmd, {}, partner), 'OWNER_REQUIRED');
});

test('canonical duration is read from exact job fields before linking; public hosts fail closed', async () => {
  const original = globalThis.fetch;
  const fields = { 'Job ID': job.id, 'Accepted Therapist ID': therapist.id, 'Job Status': 'Completed', 'Duration Minutes': 90, 'Therapist Payout THB': '600.01', 'Internal Payload JSON': '{}' };
  globalThis.fetch = async () => Response.json({ records: [{ fields }] });
  try {
    let captured;
    const env = { AIRTABLE_BASE_ID: 'app'+'a'.repeat(14), AIRTABLE_JOBS_TABLE_ID: 'tbl'+'a'.repeat(14), AIRTABLE_API_TOKEN: 'synthetic-test-only', RELAX_SPA_LEDGER: { idFromName: n => n, get: () => ({ fetch: async r => { captured = await r.json(); return Response.json({ ok: true }); } }) } };
    const req = () => new Request('https://mms.internal/internal/mms/admin/relax-spa/services', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mms-spa-actor': 'per', 'x-mms-spa-role': 'owner' }, body: JSON.stringify({ job_id: job.id }) });
    assert.equal((await maybeHandleRelaxSpaLedger(req(), env)).status, 200);
    assert.equal(captured.canonical.job.duration_minutes, 90);
    fields['Duration Minutes'] = '90';
    await maybeHandleRelaxSpaLedger(req(), env); assert.equal(captured.canonical.job.duration_minutes, null);
  } finally { globalThis.fetch = original; }
});

test('legacy generic travel and conflicting canonical payout cannot override agreed inclusive money', () => {
  const f = fixture({}, false);
  f.cmd('quotes', { service_id: f.sid, agreement_id: f.aid, approval_confirmed: true });
  const body = { service_id: f.sid, job_id: job.id, duration_minutes: 90, service_evidence: 'synthetic' };
  throws(() => f.cmd('services', body, owner, { job: { ...job, travel_amount: 20000,customer_amount:100002,venue_id:'relax-spa-by-9',travel_included_confirmed:true } }), 'CANONICAL_TRAVEL_ALREADY_ADDED');
  throws(() => f.cmd('services', body, owner, { job: { ...job, therapist_amount: 70000,customer_amount:100002,venue_id:'relax-spa-by-9',travel_included_confirmed:true } }), 'CANONICAL_PAYOUT_MISMATCH');
  throws(() => f.cmd('services', body, owner, { job: { ...job, customer_amount: 99999,venue_id:'relax-spa-by-9',travel_included_confirmed:true } }), 'CANONICAL_PRICE_MISMATCH');
  f.cmd('services', body);
  f.receipt(100002);
  throws(() => f.settle({ ...job, therapist_amount: 70000 }), 'CANONICAL_PAYOUT_MISMATCH');
  f.settle();
});

test('agreement preview is owner-only and does not write ledger storage', async () => {
  let writes = 0;
  const env = { RELAX_SPA_LEDGER: { idFromName: n => n, get: () => ({ fetch: async () => { writes++; throw Error('must not persist'); } }) } };
  const request = role => new Request('https://mms.internal/internal/mms/admin/relax-spa/agreement-preview', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mms-spa-actor': 'per', 'x-mms-spa-role': role }, body: JSON.stringify({...agreement(),schema_version:3,room:{type:'Synthetic',amount:20001,fixed_units:1,covered_minutes:90,unit_description:'booking',includes:'room only',rate_evidence_ref:'synthetic'},partner_amount:0,mms_mode:'residual',payees:{therapist:'Synthetic therapist',spa:'Synthetic spa',mms:'Synthetic mms'}}) });
  const r = await maybeHandleRelaxSpaLedger(request('owner'), env);
  assert.equal(r.status, 200); const p = await r.json();
  assert.equal(p.data.agreement.status, 'preview'); assert.equal(p.data.preview.shares.therapist, 60001);
  assert.equal((await maybeHandleRelaxSpaLedger(request('mms_partner'), env)).status, 403);
  assert.equal(writes, 0);
});

test('fee and tax payments require inspected exact evidence before closure, never silent net profit', () => {
  const f = fixture({ adjustments: [{ kind: 'fee', amount: 1000, bearer: 'spa', basis: 'fixed_satang', evidence_ref: 'synthetic-fee-terms' }] });
  f.receipt(100002); f.settle();
  for (const [role, amount] of Object.entries(f.service.settlement.shares)) if (amount) f.cmd('payouts', { service_id: f.sid, role, amount, recipient: f.service.agreement.payees[role], evidence_ref: 'synthetic-out-'+role, paid_at: at, verification_confirmed: true });
  throws(() => f.cmd('close', { service_id: f.sid, approval_confirmed: true }), 'EXPENSES_INCOMPLETE');
  const expense = { service_id: f.sid, adjustment_index: 0, amount: 1000, recipient: 'Synthetic fee collector', evidence_ref: 'synthetic-expense', paid_at: at, verification_confirmed: true, request_key: 'expense-retry-key' };
  throws(() => f.cmd('expenses', { ...expense, amount: 1 }), 'EXPENSE_AMOUNT_MISMATCH');
  f.cmd('expenses', expense); assert.equal(f.cmd('expenses', expense).duplicate, true);
  throws(() => f.cmd('expenses', { ...expense, request_key: 'another-expense-key' }), 'EXPENSE_ALREADY_RECORDED');
  f.cmd('close', { service_id: f.sid, approval_confirmed: true });
  assert.equal(f.service.status, 'closed');
  assert.equal([...f.service.payouts, ...f.service.expenses].reduce((s,p) => s+p.amount, 0), f.service.settlement.received);
});

test('formula or allocation snapshot drift blocks approval without rewriting old amounts', () => {
  const f = fixture(); f.receipt(100002);
  f.service.agreement.formula_version = 'unknown-future-formula';
  throws(() => f.settle(), 'FORMULA_VERSION_UNSUPPORTED');
  f.service.agreement.formula_version = 'room-fixed-v3';
  f.service.quote_preview.shares.therapist++;
  throws(() => f.settle(), 'QUOTE_SNAPSHOT_MISMATCH');
  assert.equal(f.service.settlement, null);
});
