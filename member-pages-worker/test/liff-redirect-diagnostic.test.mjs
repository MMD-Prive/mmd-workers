import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { handleLiffClientDiagnostic } from '../src/liff-client-runtime-diagnostic.js';

const endpoint = 'https://mmdbkk.com/member/api/liff/client-diag';
async function client(enabled, redirectUri, failFetch = false) {
  const script = await (await handleLiffClientDiagnostic(new Request(`${endpoint}.js`))).text();
  const requests = [];
  const calls = [];
  const liff = { login(...args) { calls.push(args); return 'unchanged'; } };
  vm.runInNewContext(script, {
    URL, window: { location: { href: `https://mmdbkk.com/member/liff${enabled ? '?mmd_redirect_diag=1' : ''}` }, liff },
    fetch: (url, options) => { requests.push({ url, ...options }); return failFetch ? Promise.reject(new Error('offline')) : Promise.resolve(); },
    addEventListener() {}, setTimeout() {}, setInterval() {}, clearInterval() {},
  });
  const options = { redirectUri };
  assert.equal(liff.login(options), 'unchanged');
  assert.equal(calls[0][0], options);
  return requests;
}

test('opt-in probe sends only host/path, omits credentials/referrer and leaves login unchanged', async () => {
  for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
    const requests = await client(true, `https://${host}/member/liff?state=FAKE_STATE&t=FAKE_TOKEN&code=FAKE_CODE#access_token=FAKE_FRAGMENT`);
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].body), { hostname: host, pathname: '/member/liff' });
    assert.equal(requests[0].credentials, 'omit');
    assert.equal(requests[0].referrerPolicy, 'no-referrer');
    assert.doesNotMatch(JSON.stringify(requests), /FAKE_|cookie|state|access_token/);
  }
});

test('default mode sends no redirect probe; unsafe URLs are not collected', async () => {
  const requests = await client(false, 'https://mmdbkk.com/member/liff');
  assert.ok(requests.every(r => r.headers['content-type'] !== 'application/json'));
  for (const value of [undefined, 'bad', 'https://other.example/member/liff', 'https://mmdbkk.com/private/person', 'https://user:pass@mmdbkk.com/member/liff', 'http://mmdbkk.com/member/liff']) {
    assert.equal((await client(true, value)).length, 0);
  }
});

test('failed diagnostic transport does not block login', async () => {
  await client(true, 'https://mmdbkk.com/member/liff', true);
});

async function receive(body, origin = 'https://mmdbkk.com', failStorage = false) {
  const writes = [];
  const request = new Request(endpoint, { method: 'POST', headers: { origin, 'content-type': 'application/json', cookie: 'mmd_liff_boundary=LIFFGET-ABCDEF123456; secret=FAKE_COOKIE' }, body: JSON.stringify(body) });
  const response = await handleLiffClientDiagnostic(request, { LIFF_IDENTITY_KV: { put: async (...args) => { if (failStorage) throw new Error('unavailable'); writes.push(args); } } });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return writes;
}

test('receiver stores only allowed host/path with one-hour TTL, never cookie-derived identity', async () => {
  const payload = { hostname: 'mmdbkk.com', pathname: '/member/liff' };
  const writes = await receive(payload);
  assert.equal(writes.length, 1);
  assert.match(writes[0][0], /^liff_redirect_probe:/);
  assert.deepEqual(JSON.parse(writes[0][1]), payload);
  assert.equal(writes[0][2].expirationTtl, 3600);
  assert.doesNotMatch(JSON.stringify(writes), /FAKE_COOKIE|ABCDEF123456|boundary|token|state|cookie/);
  assert.equal((await receive(payload, 'https://other.example')).length, 0);
  assert.equal((await receive(payload, 'https://mmdbkk.com', true)).length, 0);
});

test('receiver rejects arbitrary paths, hosts and extra sensitive fields rather than storing them', async () => {
  for (const payload of [
    null, { hostname: 'other.example', pathname: '/member/liff' },
    { hostname: 'mmdbkk.com', pathname: '/member/liff?state=FAKE' },
    { hostname: 'mmdbkk.com', pathname: '/member/liff/person' },
    ...['token', 'state', 'cookie', 'redirect_uri'].map(key => ({ hostname: 'mmdbkk.com', pathname: '/member/liff', [key]: 'FAKE' })),
  ]) assert.equal((await receive(payload)).length, 0);
});
