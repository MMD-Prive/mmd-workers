import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import worker from './src/admin-login-hero-worker.js';
import { normalizeNext } from './src/admin-login-hero-worker-core.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const PATH = '/internal/admin/console';
const ENV = {
  ADMIN_LOGIN_CREDENTIAL: 'console-fixture-login',
  ADMIN_SESSION_SECRET: 'console-fixture-signing-secret',
  ALLOWED_ORIGINS: 'https://mmdbkk.com,https://www.mmdbkk.com',
};
const request = (path = PATH, init = {}, host = 'mmdbkk.com') => new Request(`https://${host}${path}`, init);
async function cookie(role = 'admin') {
  const token = await createCredentialBoundAdminSession(request(), { id: 'fixture-owner', role }, ENV);
  return `mmd_admin_gate_v1=${token}`;
}

test('Console denies signed-out, forged actor and bearer-only requests on both hosts', async () => {
  for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
    for (const headers of [{}, { Cookie: 'mmd_admin_gate_v1=invalid' }, {
      authorization: `Bearer ${ENV.ADMIN_LOGIN_CREDENTIAL}`,
      'x-mmd-admin-actor': 'per', 'x-mmd-admin-role': 'owner', 'x-mmd-admin-source': 'credential-bound-session',
    }]) {
      const path = `${PATH}/?date=2026-11-08&q=fixture`;
      const response = await worker.fetch(request(path, { headers }, host), ENV, {});
      assert.equal(response.status, 303);
      const login = new URL(response.headers.get('location'));
      assert.equal(login.origin, `https://${host}`);
      assert.equal(login.pathname, '/internal/admin/login');
      assert.equal(login.searchParams.get('next'), `${PATH}?date=2026-11-08&q=fixture`);
      assert.equal(await response.text(), '');
    }
    const head = await worker.fetch(request(PATH, { method: 'HEAD' }, host), ENV, {});
    assert.equal(head.status, 401);
  }
});

test('signed Console renders without upstream calls or background identity backfill', async () => {
  const Cookie = `mmd_admin_gate_v1=stale; ${await cookie()}`;
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  let scheduled = 0;
  globalThis.fetch = async () => { upstreamCalls++; throw new Error('Unexpected upstream read'); };
  const env = { ...ENV, LINE_OFC_BACKFILL_COORDINATOR: {
    idFromName() { scheduled++; throw new Error('Console must not start backfill'); },
  } };
  try {
    for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
      for (const path of [PATH, `${PATH}/`, `${PATH}?date=all&q=fixture`]) {
        const response = await worker.fetch(request(path, { headers: { Cookie } }, host), env, {});
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-mmd-admin-console'), 'rebuild-v1');
        assert.match(response.headers.get('cache-control'), /no-store/);
        assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
        assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
        const html = await response.text();
        assert.match(html, /data-admin-console/);
        assert.match(html, /<html[^>]*lang="th"/);
        assert.match(html, /6a0ea3f9421cae9dd223f50b_SIGIL%20only%20logo\.webp/);
        assert.doesNotMatch(html, /data-cr101-root|48,500|Kenji desk|data-task-done/);
        assert.doesNotMatch(html, /console-fixture-login|console-fixture-signing-secret/);
        assert.equal((html.match(/id="sigil-internal-silver-v1"/g) || []).length, 1);
        assert.doesNotMatch(html, /data-sigil-workspace="v3"/);
      }
      const head = await worker.fetch(request(PATH, { method: 'HEAD', headers: { Cookie } }, host), env, {});
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
    }
    assert.equal(upstreamCalls, 0);
    assert.equal(scheduled, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('MMS partner remains outside the owner Console', async () => {
  const Cookie = await cookie('mms_partner');
  for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
    const get = await worker.fetch(request(PATH, { headers: { Cookie } }, host), ENV, {});
    assert.equal(get.status, 303);
    assert.equal(new URL(get.headers.get('location')).pathname, '/internal/admin/mms');
    const head = await worker.fetch(request(PATH, { method: 'HEAD', headers: { Cookie } }, host), ENV, {});
    assert.equal(head.status, 403);
  }
});

test('Console initial jobs API read never schedules identity writes', async () => {
  const Cookie = await cookie();
  const originalFetch = globalThis.fetch;
  let scheduled = 0;
  const reads = [];
  const env = { ...ENV, AIRTABLE_BASE_ID: 'appConsoleFixture', AIRTABLE_API_KEY: 'fixture-airtable',
    LINE_OFC_BACKFILL_COORDINATOR: { idFromName() { scheduled++; throw new Error('Unexpected identity write'); } },
  };
  globalThis.fetch = async (input, init) => {
    const outbound = new Request(input, init);
    reads.push(outbound);
    assert.equal(outbound.method, 'GET');
    assert.equal(new URL(outbound.url).hostname, 'api.airtable.com');
    return Response.json({ records: [] });
  };
  try {
    const page = await worker.fetch(request(PATH, { headers: { Cookie } }), env, {});
    assert.equal(page.status, 200);
    const data = await worker.fetch(request('/v1/admin/dashboard?view=jobs&page=1&page_size=20&date=2026-11-08', { headers: { Cookie } }), env, {});
    assert.equal(data.status, 200);
    assert.deepEqual((await data.json()).jobs, []);
    assert.equal(scheduled, 0);
    assert.ok(reads.length > 0, 'jobs must come from the existing read-only data path');
  } finally { globalThis.fetch = originalFetch; }
});

test('Console has no mutation methods', async () => {
  const Cookie = await cookie();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await worker.fetch(request(PATH, { method, headers: { Cookie } }), ENV, {});
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
    assert.equal(await response.text(), '');
  }
});

test('login resumes the exact Console task for form and JSON clients', async () => {
  const next = `${PATH}?date=all&q=fixture&client_id=recAAAAAAAAAAAAAA&page=2`;
  for (const json of [false, true]) {
    const headers = { Origin: 'https://mmdbkk.com', 'Content-Type': 'application/x-www-form-urlencoded' };
    if (json) { headers['x-mmd-login-fetch'] = '1'; headers.Accept = 'application/json'; }
    const response = await worker.fetch(request('/internal/admin/login/session', {
      method: 'POST', headers, body: new URLSearchParams({ credential: ENV.ADMIN_LOGIN_CREDENTIAL, next }).toString(),
    }), ENV, {});
    assert.equal(response.headers.get('x-mmd-admin-next'), next);
    assert.equal(response.headers.get('x-mmd-admin-post-login'), 'resume-admin-console');
    assert.match(response.headers.get('set-cookie'), /^mmd_admin_gate_v1=/);
    if (json) { assert.equal(response.status, 200); assert.equal((await response.json()).next, next); }
    else { assert.equal(response.status, 303); assert.equal(response.headers.get('location'), `https://mmdbkk.com${next}`); }
  }
});

test('Console next whitelist does not accept sibling routes, external URLs or credentials', () => {
  assert.equal(normalizeNext(`${PATH}/?date=all#jobs`), `${PATH}?date=all#jobs`);
  for (const next of [`${PATH}-other`, `${PATH}/inbox`, `https://example.com${PATH}`, `${PATH}?token=secret`, `${PATH}?access_code=secret`]) {
    assert.notEqual(normalizeNext(next), next);
    assert.equal(normalizeNext(next), '/internal/admin/control-room');
  }
});

test('worker config and explicit deploy sync include both Console hosts', async () => {
  const config = await readFile(new URL('./wrangler.toml', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/deploy-admin-worker.yml', import.meta.url), 'utf8');
  for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
    assert.ok(config.includes(`pattern = "${host}${PATH}*"`));
  }
  assert.ok(workflow.includes(`"${PATH}*"`));
  assert.match(workflow, /inputs\.approved_sha == github\.sha/);
});
