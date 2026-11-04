import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExpiryExtension, expiryBounds, inspectRemainingMoments,
  validateEffectiveExpiry, resolveV2ActivationExpiry, installDoubleMomentExpiryV2,
  readPrivateReminderState, DOUBLE_MOMENT_REMINDER_TIMING, DOUBLE_MOMENT_REMINDERS_ENABLED, DOUBLE_MOMENT_LINE_DELIVERY_ENABLED,
} from './double-moment-expiry-v2.mjs';

const client = 'rec01234567890123';
const claimId = 'dm2_fixture_claim';
const paymentRef = 'pay_fixture';
const issuedAt = new Date(Date.now() + 86_400_000).toISOString();
const bounds = expiryBounds(issuedAt);
const target = new Date(Date.parse(issuedAt) + 180 * 86_400_000).toISOString();
const operationId = '12345678-1234-4234-8234-123456789abc';

function clone(value) { return structuredClone(value); }
function credit(sequence, kind, status = 'available', expiry = bounds.base_expires_at, owner = client) {
  const amount = kind === 'paid' ? 10_000 : 3_500;
  const id = `${claimId}:${kind}:${sequence}`;
  return { id: `rec${String(sequence).padStart(2, '0')}${kind === 'paid' ? 'A' : 'B'}00000000000`, fields: {
    credit_id: id, Client: [owner], 'Original Amount THB': amount,
    'Available Amount THB': status === 'available' ? amount : 0,
    'Applied Amount THB': status === 'used' ? amount : 0,
    'Reserved Amount THB': 0, Status: status, 'Credit Type': kind === 'paid' ? 'paid_credit' : 'bonus_credit',
    'Bonus Sequence': sequence, 'Campaign Claim ID': claimId,
    'Credit Authority': 'double_moment_coordinator', 'Policy Version': 'v2', 'Expires At': expiry,
  } };
}
function makeFixture({ used = [], now = Date.now(), extension = null } = {}) {
  const storageMap = new Map();
  const storedCredits = [1, 2].flatMap(sequence => [credit(sequence, 'paid', used.includes(sequence) ? 'used' : 'available'), credit(sequence, 'bonus', used.includes(sequence) ? 'used' : 'available')]);
  const claim = { id: 'recclaim000000000', fields: {
    campaign_id: 'promo_double_moment_sep2026', matched_client_id: client, matched_member_id: 'member_fixture',
    claim_id: claimId, claim_status: 'applied', payment_status: 'verified', payment_reference: paymentRef, applied_at: issuedAt,
    payload_json: JSON.stringify({ policy: { policy_version: 'v2' }, issued_at: issuedAt, base_expires_at: bounds.base_expires_at, expires_at: bounds.base_expires_at }),
  } };
  const payment = { id: 'recpayment00000000', fields: { Client: [client], campaign_claim_id: claimId, campaign_code: 'promo_double_moment_sep2026', payment_ref: paymentRef, campaign_claim_id: claimId } };
  const rows = new Map(storedCredits.map(row => [row.fields.credit_id, row]));
  storageMap.set(`activation:${claimId}`, { issued_at: issuedAt, expires_at: bounds.base_expires_at, complete: true, attempted: [] });
  if (extension) storageMap.set(`expiry-extension:${claimId}`, extension);
  let storageWriteCount = 0, storageFault = null, transactionFault = null;
  const storage = {
    async get(key) { return clone(storageMap.get(key)); },
    async put(key, value) {
      storageWriteCount++;
      if (storageFault?.index === storageWriteCount && storageFault.phase === 'before') throw new Error('fixture_storage_uncertain');
      storageMap.set(key, clone(value));
      if (storageFault?.index === storageWriteCount && storageFault.phase === 'after') throw new Error('fixture_storage_uncertain');
    },
    async transaction(callback) {
      if (transactionFault === 'before') throw new Error('fixture_transaction_uncertain');
      const staged = new Map(storageMap);
      await callback({ put: async (key, value) => staged.set(key, clone(value)) });
      storageMap.clear(); for (const [k, v] of staged) storageMap.set(k, v);
      if (transactionFault === 'after') throw new Error('fixture_transaction_uncertain');
    },
  };
  const ctx = { env: {}, storage };
  let writeCount = 0, fault = null;
  const adapters = {
    table(_env, key) { return key; },
    async patchRecord(_env, table, id, patch) {
      writeCount++;
      if (fault?.index === writeCount && fault.phase === 'before') throw new Error('fixture_write_uncertain');
      const record = table === 'claims' ? claim : [...rows.values()].find(row => row.id === id);
      assert.ok(record);
      Object.assign(record.fields, clone(patch));
      if (fault?.index === writeCount && fault.phase === 'after') throw new Error('fixture_write_uncertain');
      return record;
    },
  };
  const deps = {
    campaignId: 'promo_double_moment_sep2026',
    fail(code, status = 409) { throw Object.assign(new Error(code), { status }); },
    async claimById(_env, id) { return id === claimId ? clone(claim) : null; },
    async creditById(_env, id) { return clone(rows.get(id) || null); },
    async paymentByRef(_env, id) { return id === paymentRef ? clone(payment) : null; },
    assertOwner(found, foundClaim) {
      if (found.fields.Client[0] !== foundClaim.fields.matched_client_id || found.fields.campaign_claim_id !== claimId) throw Error('owner mismatch');
    },
    adapters,
  };
  return { ctx, deps, claim, payment, rows, storageMap, getWriteCount: () => writeCount, setFault: value => { fault = value; }, setStorageFault: value => { storageFault = value; }, setTransactionFault: value => { transactionFault = value; }, setNow: value => { now = value; } };
}
function body(changes = {}) { return { claim_id: claimId, client_record_id: client, operation_id: operationId, actor_id: 'owner_fixture', reason: 'approved expiry extension', requested_expires_at: target, ...changes }; }
function remaining(fixture, { claimFields = fixture.claim.fields, credits = [...fixture.rows.values()], allocations = [], activation = fixture.storageMap.get(`activation:${claimId}`), extension = null } = {}) {
  return inspectRemainingMoments({ claimId, clientId: client, claimFields, credits, allocations, activation, extension });
}

test('120-day baseline stays exact; approved effective expiry is capped at original issuance plus 180 days', () => {
  const extension = { status: 'committed', base_expires_at: bounds.base_expires_at, effective_expires_at: target };
  assert.equal(validateEffectiveExpiry({ issuedAt, baseExpiry: bounds.base_expires_at, effectiveExpiry: bounds.base_expires_at }), true);
  assert.equal(validateEffectiveExpiry({ issuedAt, baseExpiry: bounds.base_expires_at, effectiveExpiry: target, extension }), true);
  const oneMsOver = new Date(Date.parse(target) + 1).toISOString();
  assert.equal(validateEffectiveExpiry({ issuedAt, baseExpiry: bounds.base_expires_at, effectiveExpiry: oneMsOver, extension: { ...extension, effective_expires_at: oneMsOver } }), false);
  assert.equal(validateEffectiveExpiry({ issuedAt, baseExpiry: bounds.base_expires_at, effectiveExpiry: new Date(Date.parse(issuedAt) + 150 * 86_400_000).toISOString() }), false);
  assert.equal(validateEffectiveExpiry({ issuedAt, baseExpiry: '2026-05-02T00:00:00.000Z', effectiveExpiry: target, extension }), false);
});

test('activation replay after extension preserves immutable 120-day baseline and effective expiry across restart', () => {
  const addDaysIso = (date, days) => new Date(Date.parse(date) + days * 86_400_000).toISOString();
  const committed = { status: 'committed', base_expires_at: bounds.base_expires_at, requested_expires_at: target, result: { effective_expires_at: target } };
  const first = resolveV2ActivationExpiry({ issuedAt, journal: { issued_at: issuedAt, expires_at: bounds.base_expires_at, complete: true }, recordedCreditExpiry: target, extension: committed, addDaysIso });
  assert.deepEqual(first, { base_expires_at: bounds.base_expires_at, effective_expires_at: target, extension: { ...committed, effective_expires_at: target } });
  const afterRestart = resolveV2ActivationExpiry({ issuedAt, journal: { issued_at: issuedAt, expires_at: first.base_expires_at, effective_expires_at: first.effective_expires_at, expiry_extension: first.extension }, recordedCreditExpiry: target, extension: committed, addDaysIso });
  assert.equal(afterRestart.base_expires_at, bounds.base_expires_at);
  assert.equal(afterRestart.effective_expires_at, target);
  assert.equal(resolveV2ActivationExpiry({ issuedAt, journal: { expires_at: bounds.base_expires_at }, recordedCreditExpiry: target, extension: null, addDaysIso }), null);
  assert.equal(resolveV2ActivationExpiry({ issuedAt, journal: { expires_at: bounds.base_expires_at }, recordedCreditExpiry: target, extension: { ...committed, status: 'pending' }, addDaysIso }), null);
  const overCap = new Date(Date.parse(target) + 1).toISOString();
  assert.equal(resolveV2ActivationExpiry({ issuedAt, journal: { expires_at: bounds.base_expires_at }, recordedCreditExpiry: overCap, extension: { ...committed, requested_expires_at: overCap, result: { effective_expires_at: overCap } }, addDaysIso }), null);
});

test('remaining moments use valid paid and bonus pairs plus allocation evidence', () => {
  const f = makeFixture();
  assert.equal(remaining(f).remaining_count, 2);
  const used = [credit(1, 'paid', 'used'), credit(1, 'bonus', 'used'), credit(2, 'paid'), credit(2, 'bonus')];
  const oneLeft = remaining(f, { credits: used, allocations: [{ sequence: 1, complete: true, paid_credit_thb: 10_000, bonus_credit_thb: 3_500 }] });
  assert.equal(oneLeft.status, 'eligible'); assert.equal(oneLeft.remaining_count, 1);
  assert.equal(remaining(f, { credits: used }).status, 'review');
  assert.equal(remaining(f, { credits: used, allocations: [
    { sequence: 1, complete: true, paid_credit_thb: 10_000, bonus_credit_thb: 3_500 },
    { sequence: 1, complete: true, paid_credit_thb: 10_000, bonus_credit_thb: 3_500 },
  ] }).status, 'review');
  const partial = [credit(1, 'paid', 'used'), credit(1, 'bonus'), credit(2, 'paid'), credit(2, 'bonus')];
  assert.equal(remaining(f, { credits: partial }).status, 'review');
  const reserved = [credit(1, 'paid'), { ...credit(1, 'bonus'), fields: { ...credit(1, 'bonus').fields, 'Reserved Amount THB': 100 } }, credit(2, 'paid'), credit(2, 'bonus')];
  assert.equal(remaining(f, { credits: reserved }).status, 'review');
  assert.equal(remaining(f, { credits: [...used, used[0]] }).status, 'review');
  assert.equal(remaining(f, { credits: used.slice(0, 3) }).status, 'review');
  const wrongOwner = [...f.rows.values()]; wrongOwner[0] = credit(1, 'paid', 'available', bounds.base_expires_at, 'rec99999999999999');
  assert.equal(remaining(f, { credits: wrongOwner }).status, 'review');
  assert.equal(remaining(f, { activation: { ...f.storageMap.get(`activation:${claimId}`), complete: false } }).status, 'review');
  assert.equal(remaining(f, { claimFields: { ...f.claim.fields, claim_status: 'revoked' } }).status, 'inactive');
});

test('fully used moments are not reminder eligible and timing remains unset', () => {
  const f = makeFixture({ used: [1, 2] });
  const allocations = [1, 2].map(sequence => ({ sequence, complete: true, paid_credit_thb: 10_000, bonus_credit_thb: 3_500 }));
  const state = remaining(f, { allocations });
  assert.equal(state.status, 'used'); assert.equal(state.remaining_count, 0);
  assert.equal(DOUBLE_MOMENT_REMINDER_TIMING, null);
  assert.equal(DOUBLE_MOMENT_REMINDERS_ENABLED, false);
  assert.equal(DOUBLE_MOMENT_LINE_DELIVERY_ENABLED, false);
});

test('committed Durable Object extension operation validates reminder state after restart', () => {
  const f = makeFixture();
  const extension = { status: 'committed', base_expires_at: bounds.base_expires_at, requested_expires_at: target, result: { effective_expires_at: target } };
  for (const row of f.rows.values()) row.fields['Expires At'] = target;
  const activation = { ...f.storageMap.get(`activation:${claimId}`), effective_expires_at: target, expiry_extension: { ...extension, effective_expires_at: target } };
  const claimFields = { ...f.claim.fields, payload_json: JSON.stringify({ policy: { policy_version: 'v2' }, issued_at: issuedAt, base_expires_at: bounds.base_expires_at, effective_expires_at: target, expires_at: target }) };
  const state = remaining(f, { activation, extension, claimFields });
  assert.equal(state.status, 'eligible');
  assert.equal(state.expires_at, target);
});

test('private reminder lookup derives canonical client from LINE identity and ignores caller recipient overrides', async () => {
  const ctx = { env: {} };
  const deps = { fail(code, status = 409) { throw Object.assign(new Error(code), { status }); }, async clientForLine(_env, line) { assert.equal(line, 'U0123456789abcdef0123456789abcdef'); return client; } };
  const result = await readPrivateReminderState(ctx, { line_user_id: 'U0123456789abcdef0123456789abcdef', member_id: 'member-fixture', client_record_id: client }, deps);
  assert.deepEqual(result, { status: 'timing_unset', reminders: [] });
  await assert.rejects(readPrivateReminderState(ctx, { line_user_id: 'U0123456789abcdef0123456789abcdef', member_id: 'member-fixture', client_record_id: 'rec99999999999999' }, deps), /reminder_identity_mismatch/);
  await assert.rejects(readPrivateReminderState(ctx, { line_user_id: 'not-a-line-id', member_id: 'member-fixture', client_record_id: client }, deps), /reminder_identity_invalid/);
});

test('installed coordinator blocks activation and redemption during pending extension and never sends reminders', async () => {
  class Coordinator {
    constructor() { this.storage = { values: new Map(), async get(key) { return this.values.get(key); }, async put(key, value) { this.values.set(key, value); } }; this.calls = []; }
    async activate() { this.calls.push('activate'); return 'activated'; }
    async redeem() { this.calls.push('redeem'); return 'redeemed'; }
  }
  const fail = (code, status = 409) => { throw Object.assign(new Error(code), { status }); };
  installDoubleMomentExpiryV2({ Coordinator, fail, json: value => value, dependencies: { async clientForLine() { return client; } } });
  const coordinator = new Coordinator();
  await coordinator.storage.put('expiry-extension:' + claimId, { status: 'pending' });
  await assert.rejects(coordinator.activate({ claim_id: claimId }), /expiry_extension_in_progress/);
  await assert.rejects(coordinator.redeem({ claim_id: claimId }), /expiry_extension_in_progress/);
  assert.deepEqual(coordinator.calls, []);
  await coordinator.storage.put('expiry-extension:' + claimId, { status: 'committed' });
  assert.equal(await coordinator.activate({ claim_id: claimId }), 'activated');
  assert.equal(await coordinator.redeem({ claim_id: claimId }), 'redeemed');
  assert.deepEqual(await coordinator.reminderState({ line_user_id: 'U0123456789abcdef0123456789abcdef', member_id: 'member-fixture', client_record_id: client }), { ok: true, status: 'timing_unset', reminders: [] });
  await assert.rejects(coordinator.dispatchReminder(), /reminder_delivery_disabled/);
});

test('extension is owner-bound, idempotent, preserves original issuance and never shortens', async () => {
  const f = makeFixture();
  const result = await applyExpiryExtension(f.ctx, body(), f.deps);
  assert.equal(result.base_expires_at, bounds.base_expires_at);
  assert.equal(result.effective_expires_at, target);
  assert.equal(f.storageMap.get(`activation:${claimId}`).issued_at, issuedAt);
  assert.equal(f.storageMap.get(`activation:${claimId}`).expires_at, bounds.base_expires_at);
  assert.equal(f.storageMap.get(`activation:${claimId}`).effective_expires_at, target);
  assert.equal(f.claim.fields.payload_json.includes('"status":"committed"'), true);
  assert.ok([...f.rows.values()].every(row => row.fields['Expires At'] === target));
  const writes = f.getWriteCount();
  assert.equal((await applyExpiryExtension(f.ctx, body(), f.deps)).idempotent, true);
  assert.equal(f.getWriteCount(), writes);
  await assert.rejects(applyExpiryExtension(f.ctx, body({ operation_id: '22345678-1234-4234-8234-123456789abc', requested_expires_at: bounds.base_expires_at }), f.deps), /extension_already_committed/);
  const other = makeFixture();
  await assert.rejects(applyExpiryExtension(other.ctx, body({ client_record_id: 'rec99999999999999' }), other.deps), /claim_owner_mismatch/);
  assert.equal(other.getWriteCount(), 0);
  const over = makeFixture();
  await assert.rejects(applyExpiryExtension(over.ctx, body({ requested_expires_at: new Date(Date.parse(target) + 1).toISOString() }), over.deps), /expiry_extension_cap_exceeded/);
  assert.equal(over.getWriteCount(), 0);
  const shorter = makeFixture();
  await assert.rejects(applyExpiryExtension(shorter.ctx, body({ requested_expires_at: new Date(Date.parse(bounds.base_expires_at) - 1).toISOString() }), shorter.deps), /expiry_extension_cannot_shorten/);
  assert.equal(shorter.getWriteCount(), 0);
});

for (const phase of ['before', 'after']) for (let index = 1; index <= 6; index++) test(`extension resumes safely after Airtable write ${index} ${phase} failure`, async () => {
  const f = makeFixture(); f.setFault({ index, phase });
  await assert.rejects(applyExpiryExtension(f.ctx, body(), f.deps), /fixture_write_uncertain/);
  assert.equal(f.storageMap.get(`expiry-extension:${claimId}`).status, 'pending');
  f.setFault(null);
  // Recreate the coordinator context over the same durable store to model restart.
  const restarted = { env: {}, storage: f.ctx.storage };
  const result = await applyExpiryExtension(restarted, body(), f.deps);
  assert.equal(result.effective_expires_at, target);
  assert.equal(f.storageMap.get(`expiry-extension:${claimId}`).status, 'committed');
  assert.ok([...f.rows.values()].every(row => row.fields['Expires At'] === target));
});

for (const phase of ['before', 'after']) for (let index = 1; index <= 5; index++) test(`extension resumes after durable journal write ${index} ${phase} failure`, async () => {
  const f = makeFixture(); f.setStorageFault({ index, phase });
  await assert.rejects(applyExpiryExtension(f.ctx, body(), f.deps), /fixture_storage_uncertain/);
  f.setStorageFault(null);
  const result = await applyExpiryExtension({ ...f.ctx, storage: f.ctx.storage }, body(), f.deps);
  assert.equal(result.effective_expires_at, target);
  assert.ok([...f.rows.values()].every(row => row.fields['Expires At'] === target));
});

for (const phase of ['before', 'after']) test(`extension resumes after atomic journal transaction ${phase} failure`, async () => {
  const f = makeFixture(); f.setTransactionFault(phase);
  await assert.rejects(applyExpiryExtension(f.ctx, body(), f.deps), /fixture_transaction_uncertain/);
  f.setTransactionFault(null);
  const result = await applyExpiryExtension({ ...f.ctx, storage: f.ctx.storage }, body(), f.deps);
  assert.equal(result.effective_expires_at, target);
  assert.equal(f.storageMap.get(`expiry-extension:${claimId}`).status, 'committed');
});

test('extension after a completed first redemption preserves its allocation and remaining pair', async () => {
  const f = makeFixture({ used: [1] });
  const allocations = [{ sequence: 1, job_id: 'completed-job-1', complete: true, paid_credit_thb: 10_000, bonus_credit_thb: 3_500 }];
  f.storageMap.set(`redemption:${claimId}`, allocations);
  const result = await applyExpiryExtension(f.ctx, body(), f.deps);
  assert.equal(result.effective_expires_at, target);
  const state = remaining(f, { allocations, extension: f.storageMap.get(`expiry-extension:${claimId}`), activation: f.storageMap.get(`activation:${claimId}`), claimFields: f.claim.fields });
  assert.equal(state.status, 'eligible');
  assert.equal(state.remaining_count, 1);
});

test('same operation ID with a changed payload fails closed', async () => {
  const f = makeFixture(); f.setFault({ index: 2, phase: 'after' });
  await assert.rejects(applyExpiryExtension(f.ctx, body(), f.deps));
  f.setFault(null);
  await assert.rejects(applyExpiryExtension(f.ctx, body({ reason: 'changed reason' }), f.deps), /extension_operation_payload_conflict/);
});
