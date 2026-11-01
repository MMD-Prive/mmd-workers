import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from './src/index.js';
import { modelDocsVerificationResponse } from './src/model-docs-verification-entry.js';
import { MODEL_DOCS_VERIFICATION_HTML as page } from './src/model-docs-verification-page.js';

const url = 'https://mmdbkk.com/sigil/model/dashboard?flow=docs_verify';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const scripts = [...page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
const verified = { ok: true, model: { id: 'recFixtureModel1', readiness: { line_identity_verified: true } } };

test('captured e06 page, graphics and verification scripts remain byte-identical', () => {
  assert.equal(Buffer.byteLength(page), 104891);
  assert.equal(sha(page), '2968a12731a8548ec6ef456f9e8e54ada5fffa3a052b49ed878946ae6f5060f2');
  assert.equal(scripts.length, 3);
  assert.equal(sha(scripts[0][2]), '787bedec2360722a97f1da3b21a5a89543c521ac549ebba3ec7dd07d1982e224');
  assert.equal(sha(scripts[2][2]), '24e1ee2a373cba6e2415892524372f65710bbc35250a1e3fc687c119db3b0797');
  assert.match(page, /alt="SĪGIL System"/);
  assert.doesNotMatch(page, /alt="MMD Privé"/);
  assert.match(page, /font-family:'Noto Sans Thai'/);
  assert.match(page, /data-language-switch/);
  assert.match(scripts[1][1], /src="https:\/\/static.line-scdn.net\/liff\/edge\/2\/sdk.js"/);
});

test('real source entrypoint restores docs_verify with private headers and a fresh nonce', async () => {
  const seen = [];
  for (let i = 0; i < 2; i++) {
    const response = await worker.fetch(new Request(url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-mmd-docs-verification'), 'v1');
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(response.headers.get('set-cookie'), null);
    const csp = response.headers.get('content-security-policy');
    const nonce = csp.match(/'nonce-([a-f0-9]{32})'/)?.[1];
    assert.ok(nonce);
    assert.match(csp, /font-src data:/);
    assert.match(csp, /frame-ancestors 'none'/);
    const html = await response.text();
    assert.equal(html, page.replaceAll('__NONCE__', nonce));
    assert.doesNotMatch(html, /__NONCE__/);
    for (const match of html.matchAll(/<script([^>]*)>/g)) assert.ok(match[1].includes(`nonce="${nonce}"`));
    seen.push(nonce);
  }
  assert.notEqual(seen[0], seen[1]);
  const head = await worker.fetch(new Request(url, { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('x-mmd-docs-verification'), 'v1');
  assert.equal(await head.text(), '');
});

test('www redirect retains document host/language and rejects writes before redirecting', async () => {
  const requestUrl = 'https://www.mmdbkk.com/sigil/model/dashboard?flow=docs_verify&docs_host=www&lang=en';
  const response = await worker.fetch(new Request(requestUrl));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), requestUrl.replace('www.mmdbkk.com', 'mmdbkk.com'));
  for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const blocked = await worker.fetch(new Request(url.replace('mmdbkk.com', host), { method }));
      assert.equal(blocked.status, 405);
      assert.equal(blocked.headers.get('allow'), 'GET, HEAD');
      assert.equal(blocked.headers.get('location'), null);
      assert.equal(blocked.headers.get('set-cookie'), null);
    }
  }
});

test('wrapper does not capture ordinary home, Console, LV15 pages, Partner or Model APIs', async () => {
  for (const path of [
    '/sigil/model/dashboard', '/sigil/model/dashboard?flow=verify',
    '/sigil/model/dashboard?flow=apply', '/sigil/model/dashboard?session_id=sess_fixture123',
    '/sigil/model/console?flow=docs_verify', '/sigil/model/dashboard/jobs?flow=docs_verify',
    '/sigil/model/dashboard/partner-login?flow=docs_verify', '/v1/model/profile?flow=docs_verify',
    '/sigil/model/dashboard/?flow=docs_verify',
  ]) assert.equal(modelDocsVerificationResponse(new Request('https://mmdbkk.com' + path)), null, path);
  assert.equal(modelDocsVerificationResponse(new Request(url.replace('mmdbkk.com', 'unrelated.example'))), null);

  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async input => {
    requests.push(input);
    return new Response('<main>fixture Webflow home</main>', { headers: { 'content-type': 'text/html' } });
  };
  try {
    const home = await worker.fetch(new Request('https://mmdbkk.com/sigil/model/dashboard'));
    assert.equal(home.headers.get('x-mmd-ui-source'), 'webflow-dashboard-proxy');
    assert.equal(await home.text(), '<main>fixture Webflow home</main>');
    assert.equal(requests.length, 1);
    const jobs = await worker.fetch(new Request('https://mmdbkk.com/sigil/model/dashboard/jobs', {
      headers: { cookie: 'mmd_model_session_v1=fixture-only' },
    }));
    assert.equal(jobs.status, 200);
    assert.match(await jobs.text(), /lv15/);
    assert.equal(requests.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

// Run only the unchanged verification client against in-memory identity replies.
// Fake timers keep its existing LIFF timeout promise from holding the test process open.
async function runClient({ replies, params = 'docs_host=www&lang=en', loggedIn = true, initError = false } = {}) {
  const nodes = {
    'verify-login-status': { textContent: '' },
    'verify-login-retry': { hidden: true, addEventListener() {} },
  };
  const calls = [], redirects = [], logins = [];
  let timer = 0;
  const liff = {
    init: async () => { if (initError) throw new Error('fixture SDK failure'); },
    isLoggedIn: () => loggedIn,
    getIDToken: () => 'fixture-id-token',
    login: options => logins.push(options),
  };
  const context = vm.createContext({
    document: { getElementById: id => nodes[id] },
    window: { liff, mmdDocsLanguage: { get: () => 'en' } }, liff,
    location: { search: '?' + params, origin: 'https://mmdbkk.com', replace: value => redirects.push(value), reload() {} },
    URL, URLSearchParams, AbortController,
    setTimeout: () => ++timer, clearTimeout() {},
    fetch: async (path, options) => {
      calls.push({ path, options });
      const reply = replies[calls.length - 1];
      assert.ok(reply, 'unexpected fixture request');
      assert.equal(path, reply.path);
      return new Response(JSON.stringify(reply.data), { status: reply.status, headers: { 'content-type': 'application/json' } });
    },
  });
  await vm.runInContext(scripts[2][2], context, { timeout: 1000 });
  return { calls, redirects: redirects.map(value => new URL(value)), logins, retryVisible: !nodes['verify-login-retry'].hidden };
}

const profile = (status, data) => ({ path: '/v1/model/profile', status, data });
const exchange = (status, data) => ({ path: '/v1/model/liff/exchange', status, data });

test('existing verified identity returns to the selected document host without a second exchange', async () => {
  const result = await runClient({ replies: [profile(200, verified)] });
  assert.equal(result.calls.length, 1);
  assert.equal(result.logins.length, 0);
  assert.equal(result.redirects[0].origin, 'https://www.mmdbkk.com');
  assert.equal(result.redirects[0].pathname, '/docs/guide');
  assert.equal(result.redirects[0].searchParams.get('verify_result'), 'complete');
  assert.equal(result.redirects[0].searchParams.get('model_verify'), 'return');
  assert.equal(result.redirects[0].searchParams.get('lang'), 'en');
  assert.equal(result.calls[0].options.credentials, 'include');
  assert.equal(result.calls[0].options.cache, 'no-store');
});

test('expired identity keeps docs_verify, document host and language in the LINE callback', async () => {
  const result = await runClient({ loggedIn: false, replies: [profile(401, { ok: false })] });
  assert.equal(result.redirects.length, 0);
  assert.equal(result.logins.length, 1);
  const callback = new URL(result.logins[0].redirectUri);
  assert.equal(callback.origin, 'https://mmdbkk.com');
  assert.equal(callback.pathname, '/sigil/model/dashboard');
  assert.equal(callback.searchParams.get('flow'), 'docs_verify');
  assert.equal(callback.searchParams.get('docs_host'), 'www');
  assert.equal(callback.searchParams.get('lang'), 'en');
});

test('successful exchange rechecks canonical profile before returning complete', async () => {
  const result = await runClient({ params: 'docs_host=apex', replies: [
    profile(401, { ok: false }), exchange(200, { ok: true }), profile(200, verified),
  ] });
  assert.deepEqual(result.calls.map(call => call.path), ['/v1/model/profile', '/v1/model/liff/exchange', '/v1/model/profile']);
  const options = result.calls[1].options;
  assert.equal(options.method, 'POST');
  assert.deepEqual(JSON.parse(options.body), { idToken: 'fixture-id-token', environment: 'published' });
  assert.equal(result.redirects[0].origin, 'https://mmdbkk.com');
  assert.equal(result.redirects[0].searchParams.get('verify_result'), 'complete');
  assert.equal(result.redirects[0].searchParams.has('idToken'), false);
});

test('unverified, review, failed exchange, cancellation and SDK failure retain the live outcomes', async () => {
  const cases = [
    { result: 'review', replies: [profile(202, { state: 'identity_review_required' })] },
    { result: 'error', replies: [profile(200, { ok: true, model: { id: 'recFixtureModel1', readiness: { line_identity_verified: false } } })] },
    { result: 'error', replies: [profile(200, { ok: true, model: { id: 'ambiguous', readiness: { line_identity_verified: true } } })] },
    { result: 'review', replies: [profile(401, {}), exchange(202, { state: 'identity_review_required' })] },
    { result: 'error', replies: [profile(401, {}), exchange(500, { ok: false })] },
    { result: 'error', replies: [profile(401, {}), exchange(200, { ok: true }), profile(200, { ok: true, model: null })] },
    { result: 'cancelled', params: 'error=fixture_cancelled', replies: [profile(401, {})] },
  ];
  for (const item of cases) {
    const result = await runClient(item);
    assert.equal(result.redirects[0]?.searchParams.get('verify_result'), item.result);
    assert.ok(result.calls.every(call => ['/v1/model/profile', '/v1/model/liff/exchange'].includes(call.path)));
  }
  const failedSdk = await runClient({ initError: true, replies: [profile(401, {})] });
  assert.equal(failedSdk.redirects.length, 0);
  assert.equal(failedSdk.retryVisible, true);
  assert.equal(failedSdk.calls.length, 1);
});

test('the regression is covered by both scoped workflows while deployment remains owner-approved', () => {
  for (const name of ['deploy-model-dashboard-presentation.yml', 'my-model-lv15-ci.yml']) {
    const workflow = fs.readFileSync(new URL('../.github/workflows/' + name, import.meta.url), 'utf8');
    assert.ok(workflow.includes('node --test') && workflow.includes('model-docs-verification.test.mjs'));
    assert.ok(workflow.includes('node --check') && workflow.includes('src/model-docs-verification-entry.js'));
    assert.ok(workflow.includes('src/model-docs-verification-page.js'));
  }
});
