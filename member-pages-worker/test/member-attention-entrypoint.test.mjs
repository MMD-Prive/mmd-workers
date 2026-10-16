import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Only the Cloudflare platform classes are shimmed. Load the real Wrangler main,
// routing and Attention handler; replace canonical downstream fetches with fixtures.
const shim = 'data:text/javascript,' + encodeURIComponent('export class DurableObject {} export class WorkerEntrypoint {}');
const loader = 'data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: ${JSON.stringify(shim)}, shortCircuit: true };
  return nextResolve(specifier, context);
}`);
test('Wrangler entrypoint dispatches Attention with real session gates and canonical readers', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { pathToFileURL } from 'node:url';
    import { resolve } from 'node:path';
    const config = readFileSync('member-pages-worker/wrangler.toml', 'utf8');
    const main = config.match(/^main\\s*=\\s*"([^"]+)"/m)[1];
    const worker = (await import(pathToFileURL(resolve('member-pages-worker', main)))).default;
    const base = (await import('./member-pages-worker/src/index.js')).default;
    const original = base.fetch;
    const calls = [];
    let deniedPath = null;
    let storedSession = { expires_at: Date.now() + 60000, line_user_id: 'U' + 'a'.repeat(32), member_exists: true, member_id: 'recFixture' };
    globalThis.fetch = async () => { throw Error('Unexpected external I/O'); };
    base.fetch = async request => {
      const path = new URL(request.url).pathname;
      calls.push(path);
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('cookie'), '__Host-mmd_liff_session=fixture');
      if (deniedPath === 'all' || deniedPath === path) return new Response(null, { status: 403 });
      if (path === '/api/member/app/membership') return Response.json({ lifecycle: 'active' });
      if (path === '/v1/member/payments') return Response.json({ ok: true, records: [
        { id: 'pay-1', official_status: 'awaiting_payment', customer_payment_url: 'https://mmdbkk.com/pay/checkout?t=signed_fixture' }
      ] });
      if (path === '/api/member/app/session/current') return new Response(null, { status: 204 });
      throw Error('Unexpected canonical path: ' + path);
    };
    const env = { LIFF_SESSION_SECRET: 'fixture-only-secret-at-least-32-characters', LIFF_IDENTITY_KV: {
      get: async (key, type) => {
        assert.match(key, /^liff:session:[a-f0-9]{64}$/); assert.equal(type, 'json');
        return storedSession;
      }
    } };
    const url = 'https://mmdbkk.com/api/member/app/attention';
    try {
      const guest = await worker.fetch(new Request(url), {}, {});
      assert.equal(guest.status, 401);
      assert.equal((await guest.json()).error, 'member_session_required');
      assert.match(guest.headers.get('cache-control'), /no-store/);
      assert.equal((await worker.fetch(new Request(url, { method: 'POST' }), {}, {})).status, 405);
      assert.equal((await worker.fetch(new Request(url + '?member_id=other'), env, {})).status, 400);
      assert.equal(calls.length, 0);
      const response = await worker.fetch(new Request(url + '/', { headers: { cookie: '__Host-mmd_liff_session=fixture' } }), env, {});
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.state, 'partial'); assert.equal(data.mutation_allowed, false);
      assert.equal(data.sources.amendments, 'not_connected');
      assert.equal(data.items[0].id, 'pay-1');
      assert.equal(data.items[0].url, 'https://mmdbkk.com/pay/checkout?t=signed_fixture');
      assert.deepEqual(calls.sort(), ['/api/member/app/membership', '/api/member/app/session/current', '/v1/member/payments']);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(response.headers.get('vary'), 'Cookie');
      for (const deniedIdentity of [{}, { expires_at: Date.now() - 60000, line_user_id: 'U' + 'a'.repeat(32) }]) {
        const missingEnv = { ...env, LIFF_IDENTITY_KV: { get: async () => deniedIdentity } };
        const before = calls.length;
        const denied = await worker.fetch(new Request(url, { headers: { cookie: '__Host-mmd_liff_session=fixture' } }), missingEnv, {});
        assert.equal(denied.status, 401);
        assert.equal((await denied.json()).items, undefined);
        assert.equal(calls.length, before);
      }
      const allowedReader = base.fetch;
      base.fetch = async request => new URL(request.url).pathname === '/v1/member/payments'
        ? new Response(null, { status: 403 }) : allowedReader(request);
      const denied = await worker.fetch(new Request(url, { headers: { cookie: '__Host-mmd_liff_session=fixture' } }), env, {});
      assert.equal(denied.status, 401);
      assert.equal((await denied.json()).items, undefined);

      const authenticated = () => new Request(url, { headers: { cookie: '__Host-mmd_liff_session=fixture' } });
      const validSession = storedSession;
      for (const invalid of [null, {}, { ...validSession, line_user_id: 'ambiguous' }, { ...validSession, expires_at: 0 }]) {
        storedSession = invalid; calls.length = 0;
        const rejected = await worker.fetch(authenticated(), env, {});
        assert.equal(rejected.status, 401); assert.equal((await rejected.json()).items, undefined);
        assert.equal(calls.length, 0); assert.match(rejected.headers.get('cache-control'), /no-store/);
      }
      storedSession = validSession;
      for (const path of ['/v1/member/payments', 'all']) {
        deniedPath = path; calls.length = 0;
        const rejected = await worker.fetch(authenticated(), env, {});
        assert.equal(rejected.status, 401); assert.equal((await rejected.json()).items, undefined);
        assert.equal(calls.length, 3); assert.match(rejected.headers.get('cache-control'), /no-store/);
      }
    } finally { base.fetch = original; }
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, [
    '--experimental-global-webcrypto', '--experimental-loader', loader, '--input-type=module', '-e', script,
  ], { cwd: new URL('../../', import.meta.url), encoding: 'utf8', stdio: 'pipe' }));
});
