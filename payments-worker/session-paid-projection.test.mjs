import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SessionPaidProjectionState, requestSessionPaidProjection } from './session-paid-projection.js';
import { BALANCE_FIELDS as F } from './verified-session-balance.js';
const sid = 'sess_projection_fixture';
const session = () => ({ id: 'recSession', fields: { [F.sessionId]: sid, [F.total]: 13000, job_type: 'pn', Client: ['recClient'], [F.sessionStatus]: 'Pending' } });
const payment = (id = 'deposit', amount = 4000, verified = true, stage = 'deposit') => ({ id: `rec-${id}`, fields: { [F.ref]: `pay_${id}`, [F.paymentSession]: sid, [F.amount]: amount, [F.stage]: stage, [F.verification]: verified ? 'verified' : 'pending_review', [F.status]: verified ? 'Paid' : 'Pending', Client: ['recClient'] } });
function state() {
  const data = new Map(); let alarm = null, tail = Promise.resolve();
  return { data, get alarmAt() { return alarm; }, storage: {
    async get(key) { return structuredClone(data.get(key)); }, async put(key, value) { data.set(key, structuredClone(value)); },
    async delete(key) { data.delete(key); }, async setAlarm(value) { alarm = value; }, async deleteAlarm() { alarm = null; },
  }, blockConcurrencyWhile(fn) { const next = tail.then(fn); tail = next.catch(() => {}); return next; } };
}
function harness() {
  const s = session(), payments = [payment()], calls = [], patches = [], st = state();
  let ledgerReads = 0, patchFailure = 0;
  const h = { s, payments, calls, patches, st, afterRead: null, afterPatch: null,
    failPatch(mode = 1) { patchFailure = mode; }, get ledgerReads() { return ledgerReads; } };
  const env = { AIRTABLE_BASE_ID: 'fixture', AIRTABLE_API_KEY: 'fixture-only', AIRTABLE_TABLE_SESSIONS: 'sessions', AIRTABLE_TABLE_PAYMENTS: 'payments',
    AIRTABLE_HTTP: { async fetch(request) {
      const url = new URL(request.url), table = url.pathname.split('/')[3]; calls.push({ method: request.method, table, url: request.url });
      assert.equal(url.hostname, 'api.airtable.com');
      assert.ok(['sessions', 'payments'].includes(table), 'proofs, bank, Telegram and points are never queried');
      if (request.method === 'PATCH') {
        assert.equal(table, 'sessions', 'no Payment/proof/verification writes');
        assert.equal(url.pathname.split('/')[4], s.id);
        assert.ok(st.alarmAt, 'recovery alarm persisted before any remote write'); assert.ok(st.data.has('pending'));
        const body = await request.json(); assert.deepEqual(Object.keys(body.fields), [F.paidSum]); assert.equal(body.typecast, false);
        patches.push(body.fields);
        if (patchFailure === 1) { patchFailure = 0; return Response.json({ error: 'temporary' }, { status: 503 }); }
        Object.assign(s.fields, body.fields);
        if (h.afterPatch) h.afterPatch();
        if (patchFailure === 2) { patchFailure = 0; throw Error('response lost after committed PATCH'); }
        return Response.json(s);
      }
      assert.equal(request.method, 'GET'); assert.ok(url.searchParams.get('filterByFormula'));
      if (table === 'sessions') return Response.json({ records: h.ambiguous ? [s, { ...s, id: 'other' }] : [s] });
      ledgerReads++;
      const records = structuredClone(payments);
      const offset = h.truncated ? 'same-offset' : undefined;
      if (h.afterRead) h.afterRead(ledgerReads);
      return Response.json({ records, ...(offset ? { offset } : {}) });
    } } };
  h.env = env; h.coordinator = new SessionPaidProjectionState(st, env);
  h.trigger = async (ref = 'pay_deposit', sessionId = sid) => {
    const response = await h.coordinator.fetch(new Request('https://private/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, payment_ref: ref }) }));
    return { response, body: await response.json() };
  };
  return h;
}
test('Ice T equivalent: one verified 4000 Payment updates only the cache, leaving 9000 due', async () => {
  const h = harness(), before = structuredClone(h.payments); const r = await h.trigger();
  assert.equal(r.body.status, 'updated'); assert.equal(r.body.paid_received_sum, 4000); assert.equal(r.body.remaining_amount_thb, 9000);
  assert.equal(r.body.payment_truth_changed, false); assert.deepEqual(h.payments, before);
  assert.deepEqual(h.patches, [{ [F.paidSum]: 4000 }]); assert.equal(h.st.alarmAt, null); assert.equal(h.st.data.has('pending'), false);
});
test('replay assigns an absolute total and does not issue another PATCH', async () => {
  const h = harness(); await h.trigger(); const next = await h.trigger();
  assert.equal(next.body.status, 'unchanged'); assert.equal(h.patches.length, 1); assert.equal(h.s.fields[F.paidSum], 4000);
});
test('deposit plus final are combined; pending, tips and membership never inflate the job total', async () => {
  const h = harness(); h.payments.push(payment('final', 9000, true, 'final'), payment('pending', 6000, false), payment('tip', 500, true, 'tips'), payment('member', 690, true, 'membership'));
  const r = await h.trigger('pay_final'); assert.equal(r.body.paid_received_sum, 13000); assert.equal(r.body.remaining_amount_thb, 0); assert.equal(r.body.verified_payment_count, 2);
});
test('duplicate copies of the same returned Payment row count once; distinct duplicate references fail closed', async () => {
  const h = harness(); h.payments.push(structuredClone(h.payments[0])); assert.equal((await h.trigger()).body.paid_received_sum, 4000);
  const bad = harness(); const extra = payment('second'); extra.fields[F.ref] = 'pay_deposit'; bad.payments.push(extra);
  assert.equal((await bad.trigger()).body.status, 'needs_review'); assert.equal(bad.patches.length, 0);
});
test('duplicate bank transaction across different Payment references blocks all writes', async () => {
  const h = harness(); h.payments.push(payment('other')); for (const p of h.payments) { p.fields[F.provider] = 'kbank'; p.fields[F.transaction] = 'same-transfer'; }
  const r = await h.trigger(); assert.equal(r.body.reason, 'balance_duplicate_verified_transaction'); assert.equal(h.patches.length, 0);
});
for (const [label, change] of [
  ['MMS job type', h => h.s.fields.job_type = 'MMS'],
  ['massage session type', h => h.s.fields.session_type_raw = 'massage'],
  ['MMS lane conflicts with PN', h => h.s.fields.model_work_lane = 'mms'],
  ['membership session', h => h.s.fields.session_type_raw = 'membership'],
  ['unknown lane', h => delete h.s.fields.job_type],
]) test(`${label} keeps its existing behavior and has no new Airtable writes`, async () => {
  const h = harness(); change(h); const r = await h.trigger(); assert.equal(r.body.status, 'skipped'); assert.equal(h.patches.length, 0); assert.equal(h.ledgerReads, 0);
});
for (const [label, change] of [
  ['refund', h => h.payments[0].fields[F.status] = 'refunded'],
  ['revoked anchor', h => h.payments[0].fields[F.verification] = 'pending_review'],
  ['other client', h => h.payments[0].fields.Client = ['other']],
  ['multiple session clients', h => h.s.fields.Client.push('other')],
  ['cancelled session', h => h.s.fields[F.sessionStatus] = 'Cancelled'],
  ['other session in ledger', h => h.payments[0].fields[F.paymentSession] = 'sess_other'],
  ['MMS Payment lane', h => h.payments[0].fields.model_work_lane = 'mms'],
  ['ambiguous session lookup', h => h.ambiguous = true],
]) test(`${label} fails closed without approval or a cache write`, async () => {
  const h = harness(); change(h); assert.equal((await h.trigger()).body.status, 'needs_review'); assert.equal(h.patches.length, 0);
});
test('legacy Payment with no Client link still uses its exact canonical session link', async () => {
  const h = harness(); delete h.payments[0].fields.Client; assert.equal((await h.trigger()).body.status, 'updated');
});
test('truncated/repeating pagination cannot overwrite the current cache', async () => {
  const h = harness(); h.s.fields[F.paidSum] = 4000; h.truncated = true;
  assert.equal((await h.trigger()).body.status, 'retry_scheduled'); assert.equal(h.patches.length, 0); assert.equal(h.s.fields[F.paidSum], 4000);
});
test('ledger change between snapshots stops the write and retries from fresh truth', async () => {
  const h = harness(); h.afterRead = n => { if (n === 1) h.payments.push(payment('second', 2000)); };
  assert.equal((await h.trigger()).body.status, 'retry_scheduled'); assert.equal(h.patches.length, 0);
  await h.coordinator.alarm(); assert.equal(h.s.fields[F.paidSum], 6000); assert.equal(h.st.alarmAt, null);
});
test('newly verified final during an in-flight cache write is detected and corrected by alarm', async () => {
  const h = harness(); h.afterPatch = () => { h.afterPatch = null; h.payments.push(payment('final', 9000, true, 'final')); };
  assert.equal((await h.trigger()).body.status, 'retry_scheduled');
  await h.coordinator.alarm(); assert.deepEqual(h.patches, [{ [F.paidSum]: 4000 }, { [F.paidSum]: 13000 }]); assert.equal(h.s.fields[F.paidSum], 13000);
});
test('transient write failure and a lost response after commit recover without incrementing money', async () => {
  for (const mode of [1, 2]) {
    const h = harness(); const before = structuredClone(h.payments); h.failPatch(mode);
    assert.equal((await h.trigger()).body.status, 'retry_scheduled'); assert.ok(h.st.alarmAt);
    await h.coordinator.alarm(); assert.equal(h.s.fields[F.paidSum], 4000); assert.deepEqual(h.payments, before); assert.equal(h.st.alarmAt, null);
    if (mode === 2) assert.equal(h.patches.length, 1, 'committed ambiguous PATCH is not repeated unnecessarily');
  }
});
test('concurrent notifications serialize per job and always use a fresh total', async () => {
  const h = harness(); const pending = h.trigger(); h.payments.push(payment('second', 2000));
  const next = h.trigger('pay_second'); const results = await Promise.all([pending, next]);
  assert.ok(results.every(r => ['updated', 'unchanged'].includes(r.body.status))); assert.equal(h.s.fields[F.paidSum], 6000); assert.equal(h.patches.length, 1);
});
test('coordinator cannot be reused for a different canonical session', async () => {
  const h = harness(); await h.trigger(); const r = await h.trigger('pay_other', 'sess_other'); assert.equal(r.response.status, 409); assert.equal(h.patches.length, 1);
});
test('transport refuses non-service stages, passes no amount, and reports missing/failed binding', async () => {
  for (const stage of ['membership', 'mms', 'tips', 'shop']) assert.equal((await requestSessionPaidProjection({}, { session_id: sid, stage })).status, 'skipped');
  assert.equal((await requestSessionPaidProjection({}, { session_id: sid, stage: 'deposit' })).status, 'not_configured');
  const names = [];
  const env = { SESSION_PAID_PROJECTION_COORDINATOR: { idFromName(name) { names.push(name); return name; }, get() { return { async fetch(url, init) { const body = JSON.parse(init.body); assert.deepEqual(Object.keys(body).sort(), ['payment_ref', 'session_id']); return Response.json({ status: 'unchanged' }); } }; } } };
  assert.equal((await requestSessionPaidProjection(env, { session_id: sid, stage: 'deposit', payment_ref: 'pay_deposit', amount: 999999 })).status, 'unchanged'); assert.deepEqual(names, [`session:${sid}`]);
  env.SESSION_PAID_PROJECTION_COORDINATOR.get = () => ({ fetch() { throw Error('unavailable'); } });
  assert.equal((await requestSessionPaidProjection(env, { session_id: sid, stage: 'deposit' })).status, 'retry_required');
});
test('source integration is after official payment persistence, outside slip intake, and never changes approval or points code', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const notify = source.slice(source.indexOf('async function handleNotify('), source.indexOf('async function handleConfirmLink('));
  assert.ok(notify.indexOf('createOrUpdatePaymentIntent(') < notify.indexOf('requestSessionPaidProjection('));
  assert.ok(notify.indexOf('if (!isInternalAuthed(') < notify.indexOf('requestSessionPaidProjection('));
  const flow = readFileSync(new URL('./final-payment-flow.js', import.meta.url), 'utf8'); assert.match(flow, /requestSessionPaidProjection/);
  const merged = readFileSync(new URL('./wrangler.merged.toml', import.meta.url), 'utf8'); assert.match(merged, /name = "SESSION_PAID_PROJECTION_COORDINATOR"\nclass_name = "SessionPaidProjectionCoordinator"/);
});

test('repeated unavailable ledger reads stop after bounded retries without overwriting the cache', async () => {
  const h = harness(); h.truncated = true; h.s.fields[F.paidSum] = 4000;
  assert.equal((await h.trigger()).body.status, 'retry_scheduled');
  for (let n = 0; n < 5; n++) await h.coordinator.alarm();
  assert.equal(h.st.data.get('last_result').status, 'needs_review');
  assert.equal(h.st.data.get('last_result').retry_exhausted, true);
  assert.equal(h.st.alarmAt, null); assert.equal(h.patches.length, 0); assert.equal(h.s.fields[F.paidSum], 4000);
});

test('an already authorized notify stays successful when the derived cache needs a retry; denied notify never reaches the projector', async () => {
  const { default: worker } = await import('./index.js');
  const oldFetch = globalThis.fetch; let projections = 0; const legacyWrites = [];
  const pay = { id: 'recLegacyPayment', fields: { 'Payment Reference': 'pay_legacy', 'Payment Status': 'Pending', 'Verification Status': 'pending_review' } };
  const s = { id: 'recLegacySession', fields: { session_id: sid, amount_thb: 13000, payment_status: 'pending' } };
  globalThis.fetch = async (url, init = {}) => {
    const req = url instanceof Request ? url : new Request(url, init); const u = new URL(req.url); assert.equal(u.hostname, 'api.airtable.com');
    const table = u.pathname.split('/')[3];
    if (req.method === 'GET') return Response.json({ records: [table === 'payments' ? pay : s] });
    assert.equal(req.method, 'PATCH'); const body = await req.json(); legacyWrites.push({ table, fields: body.fields });
    const row = table === 'payments' ? pay : s; Object.assign(row.fields, body.fields); return Response.json(row);
  };
  const env = { INTERNAL_TOKEN: 'fixture-internal', AIRTABLE_BASE_ID: 'fixture', AIRTABLE_API_KEY: 'fixture-only', AIRTABLE_TABLE_PAYMENTS: 'payments', AIRTABLE_TABLE_SESSIONS: 'sessions',
    SESSION_PAID_PROJECTION_COORDINATOR: { idFromName(x) { return x; }, get() { return { async fetch() { projections++; return Response.json({ status: 'retry_scheduled', payment_truth_changed: false }); } }; } } };
  const req = token => new Request('https://fixture/v1/payments/notify', { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': token }, body: JSON.stringify({ payment_ref: 'pay_legacy', session_id: sid, stage: 'deposit', amount_thb: 4000 }) });
  try {
    const denied = await worker.fetch(req('wrong'), env); assert.equal(denied.status, 401); assert.equal(projections, 0); assert.equal(legacyWrites.length, 0);
    const response = await worker.fetch(req('fixture-internal'), env), body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.ok, true); assert.equal(body.payment_write.ok, true);
    assert.equal(body.paid_received_projection.status, 'retry_scheduled'); assert.equal(projections, 1);
    assert.equal(legacyWrites.filter(x => x.table === 'payments').length, 1, 'only the pre-existing authorized write runs');
  } finally { globalThis.fetch = oldFetch; }
});

test('durable pending work survives coordinator reconstruction and uses current ledger truth', async () => {
  const h = harness(); h.failPatch(); await h.trigger();
  h.payments.push(payment('later', 1000));
  const restarted = new SessionPaidProjectionState(h.st, h.env);
  await restarted.alarm(); assert.equal(h.s.fields[F.paidSum], 5000); assert.equal(h.st.alarmAt, null);
});
