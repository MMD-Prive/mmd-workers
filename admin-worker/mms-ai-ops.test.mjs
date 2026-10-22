import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { readMmsAiOps } from './src/mms-ai-ops-read.js';
import { handleMmsAdminRequest } from './src/mms-admin-runtime.js';
import { wireMmsAiOpsUi } from './src/mms-ai-ops-ui.js';

const snapshot = { ok: true, complete: true, applications: [
  { application_id: 'a1', status: 'Submitted', phone: 'PRIVATE_PHONE' },
  { application_id: 'a1', status: 'Submitted' },
  { application_id: 'a2', status: 'Approved' },
], prebookings: [
  { prebooking_id: 'p1', status: 'Pending Coordination', notes: 'PRIVATE_NOTES' },
  { prebooking_id: 'p2', status: 'Matching' },
  { prebooking_id: 'p3', status: 'Cancelled' },
] };
const workspace = { ok: true, complete: true, therapists: [
  { therapist_id: 't1', status: 'Active', can_open: true, availability_status: 'Available', matching_enabled: true },
  { therapist_id: 't2', status: 'Active', can_open: false, availability_status: 'Available', matching_enabled: true },
  { therapist_id: 't3', status: 'Suspended', can_open: false },
  { therapist_id: 't4', status: 'Active', can_open: true, availability_status: 'Offline', matching_enabled: true },
  { therapist_id: 't5', status: 'Active', can_open: true, availability_status: 'Available', matching_enabled: false },
], jobs: [{ job_id: 'j1', is_test: false }, { job_id: 'j2', is_test: true }, { job_id: 'j3' }] };
const health = { ok: true, worker: 'mms-worker', bindings: { telegram: true, line: { persona: 'HENNA', configured: true, auto_reply_enabled: false, channel_id: 'PRIVATE_CHANNEL' } } };
const options = {
  readControls: async () => ({ line_oa_auto_reply: { version: 2, enabled: false }, model_keyword_auto_reply: { version: 3, enabled: true }, all_kenji_mutations: { version: 3, enabled: true } }),
  readRouter: async (_, opts) => { assert.equal(opts.probe, false); return { available: true, lanes: [{ key: 'mms_ops', status: 'configured', destination_configured: true, service_auth_configured: true, topic: 'PRIVATE_DESTINATION' }, { key: 'other_tenant', status: 'configured' }] }; },
};
function envFor(data = {}, calls = []) {
  return { ADMIN_BEARER: 'synthetic-mms-ops', MMS_WORKER: { fetch: async request => {
    assert.equal(request.method, 'GET');
    const path = new URL(request.url).pathname;
    calls.push(path);
    const routes = { '/internal/mms/admin/snapshot': snapshot, '/internal/mms/admin/workspace': workspace, '/health': health, ...data };
    return Response.json(routes[path] || { ok: false });
  } } };
}
const request = (method = 'GET', auth = true, path = '/v1/admin/mms/ai-ops') => new Request('https://www.mmdbkk.com' + path, { method, headers: auth ? { authorization: 'Bearer synthetic-mms-ops' } : {} });

test('MMS AI summary reads canonical sources, deduplicates and keeps readiness conditions', async () => {
  const calls = [];
  const data = await readMmsAiOps(envFor({}, calls), options);
  assert.deepEqual(calls.sort(), ['/health', '/internal/mms/admin/snapshot', '/internal/mms/admin/workspace']);
  assert.deepEqual(data.queue, { applications: 1, prebookings: 1, needs_coordination: 1, therapist_access: 1, available_therapists: 1, production_jobs: 1 });
  assert.equal(data.actions[0].key, 'needs_coordination');
  assert.equal(data.henna.auto_reply_enabled, false);
  assert.equal(data.henna.delivery_verified, false);
  assert.equal(data.kenji.model_reply_kill_switch_active, true);
  assert.equal(data.kenji.mutations_kill_switch_active, true);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE_|other_tenant|"t1"|"p1"/);
});

test('partial or malformed queues cannot become an empty complete queue', async () => {
  const partial = await readMmsAiOps(envFor({ '/internal/mms/admin/snapshot': { ...snapshot, complete: false } }), options);
  assert.equal(partial.sources.snapshot.complete, false);
  assert.equal(partial.actions.find(x => x.key === 'applications').partial, true);
  const malformed = await readMmsAiOps(envFor({ '/internal/mms/admin/snapshot': { ok: true, complete: true }, '/internal/mms/admin/workspace': { ok: false } }), options);
  assert.equal(malformed.queue.applications, null);
  assert.equal(malformed.queue.available_therapists, null);
  assert.equal(malformed.sources.snapshot.complete, false);
  assert.deepEqual(malformed.actions, []);
});

test('missing controls, lanes and HENNA booleans are unknown, never enabled or ready', async () => {
  const data = await readMmsAiOps(envFor({ '/health': { ok: true, worker: 'mms-worker', bindings: { line: { persona: 'HENNA' } } } }), {
    readControls: async () => ({ line_oa_auto_reply: { version: 0, enabled: false } }), readRouter: async () => ({ available: false }),
  });
  assert.equal(data.sources.kenji_controls.available, false);
  assert.equal(data.kenji.line_auto_reply_enabled, null);
  assert.equal(data.henna.configured, null);
  assert.equal(data.henna.handoff_binding_configured, null);
  assert.ok(data.henna.lanes.every(lane => lane.status === 'unknown'));
});

test('source timeouts settle to unknown without blocking the other sources', async () => {
  const data = await readMmsAiOps(envFor(), { ...options, timeoutMs: 10, readControls: () => new Promise(() => {}), readRouter: async () => { throw Error('private failure'); } });
  assert.equal(data.sources.snapshot.available, true);
  assert.equal(data.sources.kenji_controls.available, false);
  assert.equal(data.sources.telegram.available, false);
  assert.doesNotMatch(JSON.stringify(data), /private failure/);
});

test('new API rejects unauthenticated reads and every mutation before any service call', async () => {
  const calls = [], env = envFor({}, calls);
  assert.equal((await handleMmsAdminRequest(request('GET', false), env)).status, 401);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']) {
    const response = await handleMmsAdminRequest(request(method), env);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  }
  assert.deepEqual(calls, []);
});

test('authenticated API uses binding and is never cached; absent other services stay unknown', async () => {
  const response = await handleMmsAdminRequest(request(), envFor());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.queue.applications, 1);
  assert.equal(data.kenji.line_auto_reply_enabled, null);
  assert.equal(data.sources.telegram.available, false);
});

test('production route emits one connected panel with syntax-valid scripts and canonical handoffs', async () => {
  const response = await handleMmsAdminRequest(request('GET', true, '/internal/admin/mms'), envFor());
  const page = await response.text();
  assert.match(response.headers.get('content-security-policy'), /font-src 'self' https:\/\/cdn\.prod\.website-files\.com;/);
  assert.equal((page.match(/data-mms-ai-ops-v1 aria-labelledby/g) || []).length, 1);
  assert.equal(wireMmsAiOpsUi(page), page);
  assert.match(page, /fetch\('\/v1\/admin\/mms\/ai-ops'/);
  assert.match(page, /href="\/internal\/ceo\/kenji-control"/);
  assert.match(page, /href="\/internal\/admin\/telegram-brief"/);
  for (const script of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Script(script[1]));
});
