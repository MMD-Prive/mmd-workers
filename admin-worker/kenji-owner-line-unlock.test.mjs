import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { handleOwnerLinePage, OWNER_LINE_CLIENT, lineUnlockReady, ownerLinePanel } from './src/kenji-owner-line-unlock.js';
const installOwnerLineUnlock = runInThisContext(`(${OWNER_LINE_CLIENT})`);

const initial = () => ({ line_oa_auto_reply: { enabled: true, version: 6 },
  model_keyword_auto_reply: { enabled: true, version: 3 }, all_kenji_mutations: { enabled: false, version: 0 } });
const url = 'https://mmdbkk.com/internal/ceo/kenji-control';

test('ready requires known line/model versions and active model kill switch', () => {
  assert.equal(lineUnlockReady(initial()), true);
  for (const change of [null, {}, { ...initial(), line_oa_auto_reply: { enabled: false, version: 7 } },
    { ...initial(), model_keyword_auto_reply: { enabled: false, version: 3 } },
    { ...initial(), all_kenji_mutations: { enabled: true, version: 1 } },
    { ...initial(), line_oa_auto_reply: { enabled: true, version: 0 } }]) assert.equal(lineUnlockReady(change), false);
});

test('exact page only; non-owner has no control projection or button', async () => {
  const page = async () => new Response('original');
  for (const role of ['reviewer', 'delegate', 'admin', undefined]) {
    const r = await handleOwnerLinePage(new Request(url + '?kenji_line_unlock_state=1'), {}, { role }, page);
    assert.equal(r.status, 403);
    assert.equal(await (await handleOwnerLinePage(new Request(url), {}, { role }, page)).text(), 'original');
  }
  for (const path of ['/internal/admin/kenji', '/internal/ceo/kenji-control/extra'])
    assert.equal(await (await handleOwnerLinePage(new Request('https://mmdbkk.com' + path), {}, { role: 'owner' }, page)).text(), 'original');
});

test('owner state reads canonical scopes/versions only, no write or private fields', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(input); calls.push(init.method || 'GET');
    const scope = /\{scope\}="([^"]+)"/.exec(u.searchParams.get('filterByFormula'))?.[1];
    assert(scope && Object.hasOwn(initial(), scope));
    assert.equal(u.searchParams.get('sort[0][field]'), 'version');
    assert.equal(u.searchParams.get('sort[0][direction]'), 'desc');
    const state = initial()[scope];
    return Response.json({ records: state.version ? [{ id: 'private-record', fields: {
      scope, enabled_state: state.enabled ? 'enabled' : 'disabled', version: state.version,
      reason: 'private note', actor_id: 'private-actor' } }] : [] });
  };
  try {
    const r = await handleOwnerLinePage(new Request(url + '?kenji_line_unlock_state=1'),
      { AIRTABLE_API_KEY: 'fixture' }, { role: 'owner' }, () => { throw new Error('no origin fetch for state'); });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await r.json(), { ok: true, controls: initial() });
    assert.deepEqual(calls, ['GET', 'GET', 'GET']);
    globalThis.fetch = async () => { throw new Error('unavailable'); };
    assert.equal((await handleOwnerLinePage(new Request(url + '?kenji_line_unlock_state=1'),
      { AIRTABLE_API_KEY: 'fixture' }, { role: 'owner' }, () => null)).status, 503);
  } finally { globalThis.fetch = original; }
});

test('streamed owner panel is no-store and preserves original page; no mutation on GET', async () => {
  const original = globalThis.HTMLRewriter;
  let inserted = '';
  globalThis.HTMLRewriter = class {
    on(selector, handler) { assert.equal(selector, 'body'); handler.element({ prepend(html) { inserted = html; } }); return this; }
    transform(response) { return response; }
  };
  try {
    const r = await handleOwnerLinePage(new Request(url), {}, { role: 'owner' }, async () =>
      new Response('<html>original page</html>', { headers: { 'content-type': 'text/html', etag: 'stale' } }));
    assert.match(inserted, /Owner · LINE Safe Walk/);
    assert.match(inserted, /button type="button" disabled/);
    assert.equal(await r.text(), '<html>original page</html>');
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
    assert.equal(r.headers.get('etag'), null);
  } finally { globalThis.HTMLRewriter = original; }
});

async function clientFixture(options, run) {
  const saved = Object.fromEntries(['document', 'window', 'fetch'].map(k => [k, globalThis[k]]));
  const events = {};
  const button = { disabled: true, addEventListener(_, fn) { events.click = fn; } };
  const refresh = { addEventListener(_, fn) { events.refresh = fn; } };
  const status = { textContent: '' };
  globalThis.document = { getElementById: () => ({ querySelector: s => s === 'button' ? button : s === '[data-refresh]' ? refresh : status }) };
  globalThis.window = { confirm: () => options.confirm !== false };
  const calls = []; let reads = 0; let controls = structuredClone(options.initial ?? initial());
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input, init });
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.equal(typeof init.signal?.aborted, 'boolean');
    if (init.method !== 'POST') {
      assert.equal(input, '/internal/ceo/kenji-control?kenji_line_unlock_state=1'); reads++;
      if (options.readFailure) return Response.json({ ok: false }, { status: 503 });
      if (reads === 2 && options.beforeDrift) controls.model_keyword_auto_reply.version++;
      return Response.json({ ok: true, controls });
    }
    assert.equal(input, '/v1/admin/kenji/control/runtime/kill-switch');
    if (options.postFailure) return Response.json({ ok: false, error: 'version_conflict' }, { status: 409 });
    if (options.postUnknown) throw new Error('timeout');
    controls.line_oa_auto_reply = { enabled: false, version: 7 };
    if (options.afterDrift) controls.model_keyword_auto_reply.version++;
    return Response.json({ ok: true, scope: 'line_oa_auto_reply', enabled: false, version: 7,
      ...(options.noAudit ? {} : { audit_id: 'fixture-audit' }) });
  };
  try { await installOwnerLineUnlock(lineUnlockReady); await run({ events, button, status, calls }); }
  finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } }
}

test('button sends one fixed-scope action after confirmation and verifies readback', async () => {
  await clientFixture({}, async ({ events, button, status, calls }) => {
    assert.equal(calls.length, 1); // GET only on page load
    assert.equal(button.disabled, false);
    await Promise.all([events.click(), events.click()]);
    const posts = calls.filter(c => c.init.method === 'POST');
    assert.equal(posts.length, 1);
    const payload = JSON.parse(posts[0].init.body);
    assert.deepEqual({ ...payload, reason: 'reviewed' }, { scope: 'line_oa_auto_reply', enabled: false, expected_version: 6, reason: 'reviewed' });
    assert.match(posts[0].init.headers['Idempotency-Key'], /^owner-line-unlock-[a-f0-9-]{36}$/);
    assert.equal(calls.filter(c => c.init.method !== 'POST').length, 3);
    assert.match(status.textContent, /readback สำเร็จ/);
    assert.equal(button.disabled, true);
  });
});

test('cancel, unreadable state, stale model version and cleared LINE state never POST', async () => {
  for (const options of [{ confirm: false }, { readFailure: true }, { beforeDrift: true },
    { initial: { ...initial(), line_oa_auto_reply: { enabled: false, version: 7 } } }]) {
    await clientFixture(options, async ({ events, calls }) => {
      await events.click();
      assert.equal(calls.some(c => c.init.method === 'POST'), false);
    });
  }
});

test('conflict, unknown POST, missing audit and model readback drift never claim success or retry', async () => {
  for (const options of [{ postFailure: true }, { postUnknown: true }, { noAudit: true }, { afterDrift: true }]) {
    await clientFixture(options, async ({ events, calls, button, status }) => {
      await events.click(); await events.click();
      assert.equal(calls.filter(c => c.init.method === 'POST').length, 1);
      assert.equal(button.disabled, true);
      assert.doesNotMatch(status.textContent, /readback สำเร็จ/);
      assert.match(status.textContent, /ไม่มีการ retry/);
    });
  }
});

test('integration stays behind existing credential gate and does not alter routes/config', () => {
  const source = readFileSync(new URL('./src/admin-login-hero-worker-core.js', import.meta.url), 'utf8');
  assert(source.indexOf('const strictGate = await applyCredentialBoundAdminGate') < source.indexOf('return handleOwnerLinePage('));
  assert.match(source, /path === OWNER_LINE_PAGE && method === 'GET'/);
  assert.doesNotMatch(ownerLinePanel(), /LINE_KENJI_MODEL_ENABLED\s*=/);
});
