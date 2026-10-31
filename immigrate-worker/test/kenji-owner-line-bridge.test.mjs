import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import admin from '../../admin-worker/src/admin-login-hero-worker.js';
import { createCredentialBoundAdminSession } from '../../admin-worker/src/credential-bound-admin-session.js';

globalThis.crypto ??= webcrypto;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = await mkdtemp(join(tmpdir(), 'kenji-owner-bridge-'));
await build({ entryPoints: { ingress: join(root, 'src/customer-360-live-ingress-wrapper.ts'), bridge: join(root, 'src/kenji-owner-line-bridge.ts') },
  outdir: tmp, outExtension: { '.js': '.mjs' }, bundle: true, keepNames: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022' });
const ingress = (await import(pathToFileURL(join(tmp, 'ingress.mjs')))).default;
const { bridgeKenjiOwnerPage } = await import(pathToFileURL(join(tmp, 'bridge.mjs')));
test.after(() => rm(tmp, { recursive: true, force: true }));
const path = '/internal/ceo/kenji-control';
const controls = { line_oa_auto_reply: { enabled: true, version: 6 }, model_keyword_auto_reply: { enabled: true, version: 3 }, all_kenji_mutations: { enabled: false, version: 0 } };

test('bridge is exact public-host GET/HEAD only, preserves cookie/query, strips spoofed auth and roles', async () => {
  for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
    const requests = [];
    const response = await bridgeKenjiOwnerPage(new Request(`https://${host}${path}/?kenji_line_unlock_state=1`, {
      headers: { Cookie: 'fixture-cookie', Authorization: 'Bearer do-not-forward', 'x-confirm-key': 'do-not-forward',
        'x-mmd-admin-role': 'owner', 'x-mmd-admin-actor': 'spoof', 'x-mmd-public-host': 'evil.example',
        'x-mmd-internal-call': 'true', 'cloudflare-workers-version-overrides': 'spoof' },
    }), { ADMIN_WORKER: { fetch: async request => { requests.push(request); return Response.json({ ok: true, controls }); } } });
    assert.equal(response.status, 200); assert.equal(requests.length, 1);
    const forwarded = requests[0];
    assert.equal(forwarded.url, `https://${host}${path}?kenji_line_unlock_state=1`);
    assert.equal(forwarded.headers.get('cookie'), 'fixture-cookie');
    assert.deepEqual([...forwarded.headers.keys()], ['cookie']);
    assert.equal(forwarded.redirect, 'manual'); assert.equal(forwarded.method, 'GET');
    assert.equal(response.headers.get('x-mmd-ceo-route-owner'), 'immigrate-worker');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  for (const url of [`https://other.example${path}`, `https://immigrate-worker.example.workers.dev${path}`])
    assert.equal((await bridgeKenjiOwnerPage(new Request(url), {})).status, 403);
  for (const method of ['POST', 'PUT', 'DELETE'])
    assert.equal((await bridgeKenjiOwnerPage(new Request('https://mmdbkk.com' + path, { method }), {})).status, 405);
  assert.equal((await bridgeKenjiOwnerPage(new Request('https://mmdbkk.com' + path + '/extra'), {})).status, 405);
});

test('binding missing/failure stops closed; no public URL fallback and no retry', async () => {
  const request = new Request('https://mmdbkk.com' + path);
  const missing = await bridgeKenjiOwnerPage(request, { ADMIN_WORKER_BASE_URL: 'https://must-not-fetch.example' });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error, 'admin_worker_binding_unavailable');
  let calls = 0;
  const failed = await bridgeKenjiOwnerPage(request, { ADMIN_WORKER: { fetch: async () => { calls++; throw new Error('fixture'); } } });
  assert.equal(failed.status, 503); assert.equal(calls, 1);
});

test('old HTML backend or incomplete state cannot authorize a panel or trigger fallback', async () => {
  for (const response of [new Response('<html>old page</html>'), Response.json({ ok: true }),
    Response.json({ ok: true, controls: { ...controls, model_keyword_auto_reply: { version: 3 } } })]) {
    const result = await bridgeKenjiOwnerPage(new Request('https://mmdbkk.com' + path), {
      ADMIN_WORKER: { fetch: async () => response },
    }, async () => { throw new Error('must not fetch presentation without Owner proof'); });
    assert.equal(result.status, 503);
  }
});

test('downstream auth rejection and manual redirects are preserved, HEAD has no body', async () => {
  for (const status of [401, 403, 503]) {
    const r = await bridgeKenjiOwnerPage(new Request('https://mmdbkk.com' + path + '?kenji_line_unlock_state=1'), {
      ADMIN_WORKER: { fetch: async () => Response.json({ ok: false, error: 'fixture' }, { status }) },
    }); assert.equal(r.status, status);
  }
  const redirect = await bridgeKenjiOwnerPage(new Request('https://mmdbkk.com' + path), {
    ADMIN_WORKER: { fetch: async () => new Response(null, { status: 303, headers: { location: '/internal/admin/login' } }) },
  }); assert.equal(redirect.status, 303); assert.equal(redirect.headers.get('location'), '/internal/admin/login');
  const head = await bridgeKenjiOwnerPage(new Request('https://mmdbkk.com' + path, { method: 'HEAD' }), {
    ADMIN_WORKER: { fetch: async () => Response.json({ ok: true, controls }) },
  }, async () => new Response(null, { headers: { 'content-type': 'text/html' } })); assert.equal(await head.text(), '');
});

test('active ingress runs old gate first: anonymous and POST never reach Owner panel', async () => {
  let calls = 0;
  const env = { ADMIN_WORKER: { fetch: async request => {
    calls++; assert.equal(new URL(request.url).pathname, '/v1/admin/auth/me');
    return Response.json({ ok: false }, { status: 401 });
  } } };
  const anon = await ingress.fetch(new Request('https://mmdbkk.com' + path + '?kenji_line_unlock_state=1'), env);
  assert.equal(anon.status, 302); assert.match(anon.headers.get('location'), /\/internal\/admin\/login/);
  assert.equal(calls, 1);
  const rejected = await ingress.fetch(new Request('https://mmdbkk.com' + path, { method: 'POST' }), env);
  assert.equal(rejected.status, 405); assert.equal(calls, 1);
});

test('actual ingress → Admin signed-session → canonical state and Owner panel, read-only', async () => {
  const savedFetch = globalThis.fetch, savedRewriter = globalThis.HTMLRewriter;
  const adminEnv = { ADMIN_LOGIN_CREDENTIAL: 'fixture-owner', ADMIN_SESSION_SECRET: 'fixture-session', AIRTABLE_API_KEY: 'fixture-airtable' };
  const token = await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'), { id: 'fixture', role: 'owner' }, adminEnv);
  const adminToken = await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'), { id: 'fixture', role: 'admin' }, adminEnv);
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(init.method || 'GET', 'GET');
    if (url.hostname === 'api.airtable.com') {
      const filter = url.searchParams.get('filterByFormula');
      return Response.json({ records: [{ fields: { enabled_state: filter.includes('all_kenji_mutations') ? 'disabled' : 'enabled', version: filter.includes('line_oa') ? 6 : 3 } }] });
    }
    assert(['mmd-os.lovable.app', 'mmdprive.webflow.io', 'www.mmdbkk.com'].includes(url.hostname), 'unexpected external destination');
    return new Response('<html><head></head><body>Owner page</body></html>', { headers: { 'content-type': 'text/html' } });
  };
  globalThis.HTMLRewriter = class {
    on(_, handler) { this.handler = handler; return this; }
    transform(response) {
      const handler = this.handler;
      return new Response(new ReadableStream({ async start(controller) {
        let html = await response.text();
        handler.element({ prepend(fragment) { html = html.replace('<body>', '<body>' + fragment); } });
        controller.enqueue(new TextEncoder().encode(html)); controller.close();
      } }), response);
    }
  };
  const env = { ADMIN_WORKER: { fetch: async request => { calls.push(new URL(request.url).pathname); return admin.fetch(request, adminEnv, {}); } } };
  try {
    const headers = { Cookie: 'mmd_admin_gate_v1=' + token };
    const state = await ingress.fetch(new Request('https://mmdbkk.com' + path + '?kenji_line_unlock_state=1', { headers }), env);
    assert.equal(state.status, 200);
    const data = await state.json();
    assert.equal(data.controls.line_oa_auto_reply.version, 6);
    assert.equal(data.controls.model_keyword_auto_reply.enabled, true);
    assert.deepEqual(calls, ['/v1/admin/auth/me', path]);
    const page = await ingress.fetch(new Request('https://mmdbkk.com' + path, { headers }), env);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /id="kenji-owner-line-unlock"/);
    const script = html.slice(html.indexOf('id="kenji-owner-line-unlock"')).match(/<script>([\s\S]*?)<\/script>/)[1];
    const button = { disabled: true, addEventListener() {} };
    const globalButton = { disabled: true, addEventListener() {} };
    const refresh = { addEventListener() {} };
    const output = {};
    await runInNewContext(script, { document: { getElementById: () => ({ querySelector: s => s === 'button' ? button : s === '[data-refresh]' ? refresh : s === '[data-global-unlock]' ? globalButton : s === '[data-owner-confirm]' ? { checked: false } : output }) },
      fetch: async () => Response.json({ ok: true, controls }), AbortSignal });
    assert.equal(button.disabled, false, 'compiled panel must boot without Worker-only helper references');
    assert.equal(globalButton.disabled, true, 'already clear global pause cannot be unlocked again');
    const denied = await ingress.fetch(new Request('https://mmdbkk.com' + path + '?kenji_line_unlock_state=1', { headers: { Cookie: 'mmd_admin_gate_v1=' + adminToken } }), env);
    assert.equal(denied.status, 403); assert.equal((await denied.json()).error, 'owner_required');
    const adminPage = await ingress.fetch(new Request('https://mmdbkk.com' + path, { headers: { Cookie: 'mmd_admin_gate_v1=' + adminToken } }), env);
    assert.equal(adminPage.status, 200); assert.doesNotMatch(await adminPage.text(), /id="kenji-owner-line-unlock"/);
  } finally { globalThis.fetch = savedFetch; globalThis.HTMLRewriter = savedRewriter; }
});

test('other CEO paths still use existing Webflow handler; route config untouched', async () => {
  const wrapper = await readFile(join(root, 'src/canonical-admin-login-wrapper.ts'), 'utf8');
  assert(wrapper.indexOf('const gate = await requireInternalAdminGate') < wrapper.indexOf('await bridgeKenjiOwnerPage'));
  assert.match(wrapper, /path === KENJI_OWNER_PAGE[\s\S]*await bridgeKenjiOwnerPage[\s\S]*await serveCeoRoute/);
});
