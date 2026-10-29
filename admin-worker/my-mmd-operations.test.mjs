import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleMyMmdOperations, projectOperations, isMyMmdOperationsRequest, MY_MMD_OPERATIONS_DASHBOARD_URL } from './src/my-mmd-operations-queue.js';
const url = 'https://mmdbkk.com/v1/admin/my-mmd/operations';
test('owner gate blocks anonymous and ordinary admins before any source read', async () => {
  let calls = 0;
  for (const actor of [null, { id: 'someone', role: 'admin' }]) {
    const response = await handleMyMmdOperations(new Request(url), {}, { readActor: async () => actor, readers: { dashboard: async () => { calls++; } } });
    assert.equal(response.status, 403);
  }
  assert.equal(calls, 0);
});
test('each count describes exactly its displayed rows and unavailable sources are never zero', () => {
  const data = projectOperations({ dashboard: { debug: { payment_source: 'ok' }, money: [{ title: 'review', href: '/internal/admin/payments' }] }, completeness: { ok: true, rows: [{ record_id: 'rec1', reasons: ['identity'], category: 'identity_review' }, { record_id: 'rec2', reasons: [] }] }, drafts: [{ id: 'draft', fieldData: { name: '<script>' } }], watch: { source_coverage: [{ source: 'hype', state: 'connected' }], actions: [{ action_key: 'hype_coupon_manual_review_overdue', count: 5, title: 'review', href: '/internal/admin/control-room' }] } });
  assert.equal(data.state, 'partial');
  for (const group of data.groups) if (group.state === 'resolved') assert.equal(group.count, group.items.length);
  assert.equal(data.groups.find(group => group.id === 'renewals').count, null);
  assert.equal(data.groups.find(group => group.id === 'coupons').items[0].affected_count, 5);
});
test('all source failures return explicit partial coverage without misleading empty success', async () => {
  const fail = async () => { throw Error('unavailable'); };
  const response = await handleMyMmdOperations(new Request(url), {}, { readActor: async () => ({ role: 'owner' }), readers: { dashboard: fail, completeness: fail, drafts: fail } });
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  const data = await response.json(); assert.ok(data.groups.every(group => group.count === null && group.state === 'unavailable'));
});
test('completeness and operations dispatch in fetch; scheduled never references request', async () => {
  const source = await readFile(new URL('./src/admin-login-hero-worker.js', import.meta.url), 'utf8');
  const start = source.indexOf('async scheduled('), end = source.indexOf('async fetch(', start);
  assert.doesNotMatch(source.slice(start, end), /\brequest\b/);
  assert.match(source.slice(end), /isMemberCompletenessRequest\(request\)/);
  assert.match(source.slice(end), /isMyMmdOperationsRequest\(request\)/);
});
test('the routed dashboard view selects only member operations and preserves ordinary Dashboard and MMS requests', () => {
  for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
    assert.equal(isMyMmdOperationsRequest(new Request('https://' + host + MY_MMD_OPERATIONS_DASHBOARD_URL)), true);
    for (const path of ['/v1/admin/dashboard', '/v1/admin/dashboard?view=other', '/internal/admin/mms', '/v1/admin/mms?view=my-mmd-operations']) {
      assert.equal(isMyMmdOperationsRequest(new Request('https://' + host + path)), false, path);
    }
  }
  assert.equal(isMyMmdOperationsRequest(new Request(url)), true);
});
test('dashboard operations alias keeps owner-only, GET-only and selector-free reads', async () => {
  const alias = 'https://www.mmdbkk.com' + MY_MMD_OPERATIONS_DASHBOARD_URL;
  let calls = 0;
  const readers = Object.fromEntries(['dashboard', 'completeness', 'drafts'].map(key => [key, async () => { calls++; return null; }]));
  for (const actor of [null, { role: 'admin' }, { role: 'mms_partner' }]) {
    const response = await handleMyMmdOperations(new Request(alias), {}, { readActor: async () => actor, readers });
    assert.equal(response.status, 403);
  }
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const response = await handleMyMmdOperations(new Request(alias, { method }), {}, { readActor: async () => ({ role: 'owner' }), readers });
    assert.equal(response.status, 405);
  }
  for (const extra of ['&member_id=rec1', '&view=my-mmd-operations']) {
    const response = await handleMyMmdOperations(new Request(alias + extra), {}, { readActor: async () => ({ role: 'owner' }), readers });
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
  const response = await handleMyMmdOperations(new Request(alias), {}, { readActor: async () => ({ role: 'owner' }), readers });
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const data = await response.json();
  assert.equal(data.mutation_allowed, false);
  assert.equal(data.schema, 'mmd_member_operations_v1');
});
