import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMmsAdvisory } from '../src/mms-advisory.js';
import worker from '../src/customer-360-live-entry.js';

const data = { ok: true, schema: 'mms_ai_ops_read_v1', sources: { snapshot: { available: true, complete: false }, workspace: { available: true, complete: true } },
  actions: [{ key: 'applications', count: 2, label: 'ใบสมัคร', partial: true, href: '/internal/admin/mms#applications' }], henna: { configured: true, auto_reply_enabled: false }, kenji: { line_auto_reply_enabled: false, mutations_kill_switch_active: true } };

test('MMS advisory carries partial counts, real actions and disabled automation truth', () => {
  const result = buildMmsAdvisory({ ok: true, data });
  assert.match(result.next_actions[0].label, /2 \(ที่อ่านได้\)/);
  assert.equal(result.next_actions[0].href, '/internal/admin/mms#applications');
  assert.equal(result.anomalies[0].code, 'mms_snapshot_incomplete');
  assert.match(result.brief.join(' '), /ตอบอัตโนมัติ ปิด/);
  assert.match(result.brief.join(' '), /ตัวหยุดการแก้ข้อมูล ทำงาน/);
});

test('unknown and empty partial source never claims an empty queue', () => {
  const failed = buildMmsAdvisory({ ok: false, data });
  assert.equal(failed.next_actions.length, 0);
  assert.equal(failed.verified.length, 0);
  const partial = buildMmsAdvisory({ ok: true, data: { ...data, actions: [] } });
  assert.match(partial.brief[0], /จึงยังสรุปว่าคิวว่างไม่ได้/);
});

test('advisory rejects external and unrelated action destinations', () => {
  const result = buildMmsAdvisory({ ok: true, data: { ...data, actions: [
    ...data.actions, { key: 'unsafe', label: 'no', count: 1, href: 'https://example.com/private' }, { key: 'unrelated', label: 'no', count: 1, href: '/internal/admin/payments' },
  ] } });
  assert.equal(result.next_actions.length, 1);
});

test('actual AI context reads only MMS projection after auth and returns actionable MMS intel', async () => {
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async () => { throw new Error('MMS must not use same-zone global fetch'); };
  const service = { fetch: async (input) => {
    const path = new URL(input.url).pathname;
    calls.push(path); assert.equal(input.method, 'GET');
    assert.equal(input.headers.get('cookie'), 'synthetic-session');
    if (path === '/v1/admin/auth/me') return Response.json({ ok: true, authenticated: true, worker: 'admin-worker' });
    assert.equal(path, '/v1/admin/mms/ai-ops');
    return Response.json(data);
  } };
  try {
    const response = await worker.fetch(new Request('https://www.mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fmms', { headers: { cookie: 'synthetic-session' } }), { MMS_ADMIN: service }, {});
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['/v1/admin/auth/me', '/v1/admin/auth/me', '/v1/admin/mms/ai-ops']);
    assert.equal(body.next_actions[0].href, '/internal/admin/mms#applications');
    assert.equal(body.sources[0].route, '/v1/admin/mms/ai-ops');
    assert.match(body.brief.join(' '), /ตอบอัตโนมัติ ปิด/);
  } finally { globalThis.fetch = original; }
});

test('missing MMS binding fails closed and never falls back to the public origin', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail('unexpected public origin call'); };
  try {
    const result = await worker.fetch(new Request('https://mmdbkk.com/v1/admin/ai-ops/context?path=/internal/admin/mms'), {}, {});
    assert.equal(result.status, 503);
    assert.equal((await result.json()).error, 'mms_admin_service_unavailable');
  } finally { globalThis.fetch = original; }
});

test('MMS service rejects missing, malformed and expired auth before reading any data', async () => {
  for (const auth of [Response.json({ ok: false }, { status: 401 }), Response.json({ ok: true }), new Response('<html>origin</html>')]) {
    const calls = [];
    const result = await worker.fetch(new Request('https://mmdbkk.com/v1/admin/ai-ops/context?path=/internal/admin/mms'), { MMS_ADMIN: { fetch: async request => { calls.push(new URL(request.url).pathname); return auth; } } }, {});
    assert.equal(result.status, 401);
    assert.deepEqual(calls, ['/v1/admin/auth/me']);
  }
});

test('MMS service never forwards a session from a non-production host', async () => {
  const result = await worker.fetch(new Request('https://example.com/v1/admin/ai-ops/context?path=/internal/admin/mms', { headers: { cookie: 'synthetic-session' } }), { MMS_ADMIN: { fetch: async () => { assert.fail('unexpected binding call'); } } }, {});
  assert.equal(result.status, 401);
});

test('other AI contexts retain their existing transport and do not use the MMS binding', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: false }, { status: 401 });
  try {
    const result = await worker.fetch(new Request('https://mmdbkk.com/v1/admin/ai-ops/context?path=/internal/admin/payments'), { MMS_ADMIN: { fetch: async () => { assert.fail('out-of-scope MMS service call'); } } }, {});
    assert.equal(result.status, 401);
  } finally { globalThis.fetch = original; }
});
