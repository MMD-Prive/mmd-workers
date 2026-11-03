import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerRequestQuotaCoordinator } from '../src/customer-request-quota-durable-object.js';

function harness(initial) {
  let value = structuredClone(initial); let chain = Promise.resolve();
  const state = { storage: { async get() { return structuredClone(value); }, async put(_, next) { value = structuredClone(next); } }, async blockConcurrencyWhile(fn) { const next = chain.then(fn); chain = next.catch(() => {}); return next; } };
  const object = new CustomerRequestQuotaCoordinator(state);
  return { async call(body) { const response = await object.fetch(new Request('https://quota', { method: 'POST', body: JSON.stringify(body) })); return { status: response.status, body: await response.json() }; }, read: () => value };
}
const request = (n) => `req_${String(n).padStart(12, '0')}`;
const base = (action, id = request(1), extra = {}) => ({ action, month_key: '2026-11', request_id: id, fingerprint: `fp-${id}`, ...extra });

test('serializes four reservations and rejects the fifth', async () => {
  const h = harness();
  const responses = await Promise.all([...Array(5)].map((_, i) => h.call(base('reserve', request(i + 1)))));
  assert.equal(responses.filter(x => x.status === 200).length, 4); assert.equal(responses.filter(x => x.status === 429).length, 1);
});

test('same key with a conflicting payload is rejected and committed retry is idempotent', async () => {
  const h = harness(); const first = await h.call(base('reserve')); const lease = first.body.lease;
  assert.equal((await h.call(base('reserve', request(1), { fingerprint: 'different' }))).status, 409);
  assert.equal((await h.call(base('commit', request(1), { lease }))).status, 200);
  const retry = await h.call(base('reserve')); assert.equal(retry.status, 200); assert.equal(retry.body.idempotent, true); assert.equal(retry.body.status, 'committed');
});

test('pending and uncertain reservations cannot be released or claimed by a retry', async () => {
  const h = harness(); const first = await h.call(base('reserve')); const lease = first.body.lease;
  assert.equal((await h.call(base('reserve'))).status, 409);
  assert.equal((await h.call(base('uncertain', request(1), { lease }))).status, 200);
  assert.equal((await h.call(base('release', request(1), { lease }))).body.status, 'uncertain');
  assert.equal((await h.call(base('reserve'))).status, 503);
});

test('restarts preserve committed reservations and observed Airtable records seed the quota', async () => {
  const h = harness();
  for (let i = 1; i <= 3; i++) { const r = await h.call(base('reserve', request(i))); await h.call(base('commit', request(i), { lease: r.body.lease })); }
  const next = await h.call(base('reserve', request(4), { observed_request_ids: [request(1), request(2), request(3)] }));
  assert.equal(next.status, 200); assert.equal(next.body.remaining, 0);
});

test('a cold coordinator persists Airtable seed before rejecting a full quota', async () => {
  const h = harness(); const ids = [1, 2, 3, 4].map(request);
  assert.equal((await h.call(base('reserve', request(9), { observed_request_ids: ids }))).status, 429);
  const restarted = harness(h.read()); assert.equal((await restarted.call(base('reserve', request(10)))).status, 429);
});
