import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';

globalThis.crypto ??= webcrypto;
const { build } = createRequire(new URL('../immigrate-worker/package.json', import.meta.url))('esbuild');

test('actual bundled Worker starts the serialized Console client without leaked bundler helpers', async () => {
  const built = await build({
    entryPoints: [fileURLToPath(new URL('./src/admin-login-hero-worker.js', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
    keepNames: true, minifySyntax: true, logLevel: 'silent',
  });
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)).default;
  const origin = 'https://mmdbkk.com';
  const env = { ADMIN_LOGIN_CREDENTIAL: 'fixture', ADMIN_SESSION_SECRET: 'fixture-session' };
  const token = await createCredentialBoundAdminSession(new Request(origin), { id: 'per', role: 'admin' }, env);
  const response = await worker.fetch(new Request(`${origin}/internal/admin/console?date=all`, { headers: { Cookie: `mmd_admin_gate_v1=${token}` } }), env, {});
  assert.equal(response.status, 200);
  const dom = new JSDOM(await response.text(), { url: `${origin}/internal/admin/console?date=all`, runScripts: 'outside-only' });
  try {
    const calls = [];
    dom.window.fetch = async (path, options) => {
      calls.push({ path, options });
      return Response.json({ ok: true, view: 'jobs', layer: 'core', source: 'admin-worker', generated_at: new Date().toISOString(),
        filters: { q: null, job_date: null, session_id: null, job_id: null, client_id: null },
        pagination: { page: 1, page_size: 20, total: 0, total_pages: 1, has_prev: false, has_next: false },
        counts: { all: 0, filtered: 0, today: 0, upcoming: 0, past: 0, undated: 0 }, jobs: [] });
    };
    assert.equal(Object.hasOwn(dom.window, '__name'), false);
    dom.window.eval(dom.window.document.querySelector('script[data-admin-console-client]').textContent);
    for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].path, origin).pathname, '/v1/admin/dashboard');
    assert.equal(calls[0].options.method || 'GET', 'GET');
    assert.equal(dom.window.document.querySelector('#ac-empty').hidden, false);
    assert.equal(dom.window.document.querySelector('#ac-error').hidden, true);
    assert.equal(dom.window.document.querySelector('[data-count=all]').textContent, '0');
    assert.equal(Object.hasOwn(dom.window, '__name'), false);
  } finally { dom.window.close(); }
});
