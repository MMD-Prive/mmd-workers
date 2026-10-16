import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Load the real configured runtime and real handler; replace external owners/I/O only.
async function runtime(identity, denied = false) {
  const calls = [];
  const source = await readFile(new URL('../src/runtime-index.js', import.meta.url), 'utf8');
  const context = vm.createContext({ Request, Response, URL, Headers, Date, Map, Set, console });
  const stub = values => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const readSession = async () => identity;
  const base = { fetch: async req => {
    const path = new URL(req.url).pathname; calls.push(path);
    if (denied === true || denied === path) return new Response(null, { status: 403 });
    if (path.endsWith('/membership')) return Response.json({ lifecycle: 'active' });
    if (path === '/v1/member/payments') return Response.json({ ok: true, records: [] });
    return new Response(null, { status: 204 });
  } };
  const handler = new vm.SourceTextModule(await readFile(new URL('../src/member-attention.js', import.meta.url), 'utf8'), { context });
  await handler.link(spec => spec === './index.js' ? stub({ default: base }) : stub({ readMemberAppSession: readSession }));
  const module = new vm.SourceTextModule(source, { context });
  await module.link(spec => {
    if (spec === './member-attention.js') return handler;
    if (spec === './index.js') return stub({ default: base });
    if (spec === './member-app-api.js') return stub({ readMemberAppSession: readSession });
    const match = [...source.matchAll(/(?:import|export)\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)].find(m => m[2] === spec);
    const names = match ? match[1].split(',').map(x => x.trim()).filter(Boolean) : [];
    return stub(Object.fromEntries(names.map(name => [name, () => false])));
  });
  await module.evaluate();
  return { worker: module.namespace.default, calls };
}
for (const [name, identity, denied, status] of [
  ['verified session reaches real handler', { lineUserId: 'fixture-A' }, false, 200],
  ['missing identity stops before source reads', null, false, 401],
  ['ambiguous session without canonical identity stops before source reads', {}, false, 401],
  ['one upstream denial discards all partial customer context', { lineUserId: 'fixture-A' }, '/v1/member/payments', 401],
  ['owner denial cannot return partial context', { lineUserId: 'fixture-A' }, true, 401],
]) test(name, async () => {
  const { worker, calls } = await runtime(identity, denied);
  const response = await worker.fetch(new Request('https://mmdbkk.com/api/member/app/attention'), {}, {});
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const body = await response.json();
  if (status === 200) { assert.equal(body.mutation_allowed, false); assert.equal(calls.length, 3); }
  else { assert.equal(body.items, undefined); if (!identity?.lineUserId) assert.equal(calls.length, 0); }
});

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
    globalThis.fetch = async () => { throw Error('Unexpected external I/O'); };
    base.fetch = async request => {
      const path = new URL(request.url).pathname;
      calls.push(path);
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('cookie'), '__Host-mmd_liff_session=fixture');
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
        return { expires_at: Date.now() + 60000, line_user_id: 'U' + 'a'.repeat(32), member_exists: true, member_id: 'recFixture' };
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
    } finally { base.fetch = original; }
  `;
  assert.doesNotThrow(() => execFileSync(process.execPath, [
    '--experimental-global-webcrypto', '--experimental-loader', loader, '--input-type=module', '-e', script,
  ], { cwd: new URL('../../', import.meta.url), encoding: 'utf8', stdio: 'pipe' }));
});
