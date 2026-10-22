import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMmsAdvisory } from '../src/mms-advisory.js';
import worker from '../src/index.js';

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
  globalThis.fetch = async (input, options) => {
    const path = new URL(typeof input === 'string' ? input : input.url).pathname;
    calls.push(path); assert.equal(options.method, 'GET');
    if (path === '/v1/admin/auth/me') return Response.json({ ok: true });
    assert.equal(path, '/v1/admin/mms/ai-ops');
    assert.equal(options.headers.get('cookie'), 'synthetic-session');
    return Response.json(data);
  };
  try {
    const response = await worker.fetch(new Request('https://www.mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fmms', { headers: { cookie: 'synthetic-session' } }), {}, {});
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(calls, ['/v1/admin/auth/me', '/v1/admin/mms/ai-ops']);
    assert.equal(body.next_actions[0].href, '/internal/admin/mms#applications');
    assert.equal(body.sources[0].route, '/v1/admin/mms/ai-ops');
    assert.match(body.brief.join(' '), /ตอบอัตโนมัติ ปิด/);
  } finally { globalThis.fetch = original; }
});
