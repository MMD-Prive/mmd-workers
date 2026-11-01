import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('./model-console-v3-i18n.js', import.meta.url), 'utf8');
const loadCode = source.slice(source.indexOf('async function load()'), source.indexOf('async function act('));

async function run(status, payload) {
  const views = [], errors = [], requests = [];
  const context = {
    busy: false, ses: { session_id: 'old-job' }, err: '',
    R: { dataset: { currentEndpoint: '/v1/model/session/current' } },
    AbortController, setTimeout, clearTimeout,
    lock(value) { context.busy = value; },
    view(value) { views.push(value); }, chip() {}, d: () => ({}),
    modeCopy() { errors.push(context.err); },
    render() { views.push(context.ses === null ? 'empty' : 'work'); },
    j: response => response.json(),
    async fetch(url, options) {
      requests.push({ url, options });
      return { status, ok: status >= 200 && status < 300, json: async () => payload };
    },
  };
  await vm.runInNewContext(loadCode + ';load()', context);
  assert.equal(context.busy, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, undefined);
  assert.equal(requests[0].options.credentials, 'include');
  return { context, views, errors };
}

test('only the exact no-job 404 clears stale job and renders empty', async () => {
  const result = await run(404, { ok: false, error: 'session_not_found' });
  assert.equal(result.context.ses, null);
  assert.deepEqual(result.views, ['loading', 'empty']);
  assert.deepEqual(result.errors, []);
});

for (const status of [401, 403]) {
  test(`${status} remains an authentication error even with no-job payload`, async () => {
    const result = await run(status, { error: 'session_not_found' });
    assert.deepEqual(result.views, ['loading', 'error']);
    assert.deepEqual(result.errors, ['auth']);
  });
}

for (const [status, payload] of [
  [503, { error: 'session_not_found' }],
  [503, { error: 'session_lookup_unavailable' }],
  [404, { error: 'route_not_found' }],
  [404, {}],
  [200, { ok: false, error: 'session_not_found' }],
]) {
  test(`${status}/${payload.error || 'missing error'} remains a load error`, async () => {
    const result = await run(status, payload);
    assert.deepEqual(result.views, ['loading', 'error']);
    assert.deepEqual(result.errors, ['load']);
  });
}

test('successful null session remains empty and a real job remains visible', async () => {
  assert.deepEqual((await run(200, { ok: true, session: null })).views, ['loading', 'empty']);
  assert.deepEqual((await run(200, { ok: true, session: { session_id: 'fixture-job' } })).views, ['loading', 'work']);
});
