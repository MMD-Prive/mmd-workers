// Exercise the actual production candidate in a child process with fixture
// credentials only. The child makes no network calls or production mutations.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export function testConsoleHomeCandidate(code) {
  assert.ok(typeof code === 'string' || code instanceof Uint8Array, 'candidate module required');
  const bytes = Buffer.from(code);
  assert.ok(bytes.byteLength > 0, 'candidate module required');
  assert.ok(Buffer.from(bytes.toString('utf8')).equals(bytes), 'candidate must be UTF-8');
  const directory = mkdtempSync(join(tmpdir(), 'console-home-candidate-test-'));
  const artifact = join(directory, 'candidate.mjs');
  const harness = join(directory, 'candidate.test.mjs');
  writeFileSync(artifact, bytes, { mode: 0o600 });
  writeFileSync(harness, [
    "import assert from 'node:assert/strict';",
    "import { webcrypto } from 'node:crypto';",
    "import test from 'node:test';",
    `import { JSDOM } from ${JSON.stringify(pathToFileURL(require.resolve('jsdom')).href)};`,
    `import { createCredentialBoundAdminSession } from ${JSON.stringify(new URL('../admin-worker/src/credential-bound-admin-session.js', import.meta.url).href)};`,
    'globalThis.crypto ??= webcrypto;',
    // Install the network guard before loading the artifact so even module
    // initialization cannot accidentally use the production network.
    'let networkCalls = 0;',
    "globalThis.fetch = async () => { networkCalls++; throw new Error('Unexpected network request in candidate test'); };",
    "const worker = (await import('./candidate.mjs')).default;",
    `(${candidateContracts.toString()})({ assert, test, JSDOM, worker, createCredentialBoundAdminSession, networkCalls: () => networkCalls });`,
    '',
  ].join('\n'), { mode: 0o600 });
  const env = { PATH: process.env.PATH || '', TMPDIR: directory, NODE_NO_WARNINGS: '1' };
  execFileSync(process.execPath, ['--check', artifact], { env, cwd: directory, stdio: 'pipe', timeout: 30000 });
  const output = execFileSync(process.execPath, ['--test', harness], {
    env, cwd: directory, stdio: 'pipe', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  }).toString('utf8');
  return { directory, artifact, output };
}

function candidateContracts({ assert, test, JSDOM, worker, createCredentialBoundAdminSession, networkCalls }) {
  const HOME = '/internal/admin/console';
  const ROOT = '/internal/admin';
  const LOGIN = '/internal/admin/login';
  const SESSION = '/internal/admin/login/session';
  const ENV = {
    ADMIN_LOGIN_CREDENTIAL: 'console-home-fixture-login',
    ADMIN_SESSION_SECRET: 'console-home-fixture-signing-secret',
  };
  const settle = async () => {
    for (let index = 0; index < 8; index++) await new Promise(resolve => setImmediate(resolve));
  };
  async function cookie(role) {
    const token = await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'), { id: 'fixture-owner', role }, ENV);
    return `mmd_admin_gate_v1=${token}`;
  }
  async function login(origin, next, json) {
    const values = { action: 'owner_login', credential: ENV.ADMIN_LOGIN_CREDENTIAL };
    if (next !== undefined) values.next = next;
    const headers = { Origin: origin, 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded' };
    if (json) { headers['X-MMD-Login-Fetch'] = '1'; headers.Accept = 'application/json'; }
    return worker.fetch(new Request(origin + SESSION, {
      method: 'POST', headers, body: json ? JSON.stringify(values) : new URLSearchParams(values).toString(),
    }), ENV, {});
  }

  test('actual Console-home artifact preserves login tasks, gates the homepage, and starts the browser client', async () => {
    for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CF_API_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN',
      'ADMIN_LOGIN_CREDENTIAL', 'ADMIN_SESSION_SECRET', 'NODE_OPTIONS', 'NODE_PATH']) {
      assert.equal(process.env[key], undefined, `candidate subprocess must not inherit ${key}`);
    }
    const ownerCookie = await cookie('owner');
    const adminCookie = await cookie('admin');
    const partnerCookie = await cookie('mms_partner');
    let backgroundCalls = 0;
    const guardedEnv = { ...ENV, LINE_OFC_BACKFILL_COORDINATOR: {
      idFromName() { backgroundCalls++; throw new Error('Homepage must not schedule identity writes'); },
    } };
    const guardedContext = { waitUntil() { backgroundCalls++; throw new Error('Homepage must not enqueue background work'); } };

    for (const origin of ['https://mmdbkk.com', 'https://www.mmdbkk.com']) {
      const allowedTasks = [
        ['/internal/admin/jobs/all?job_id=recAAAAAAAAAAAAAA&session_id=fixture-session#details', 'resume-admin-task'],
        ['/internal/admin/payments?scope=all', 'resume-admin-task'],
        ['/internal/admin/control-room?tab=line-inbox', 'resume-admin-task'],
        ['/internal/admin/refunds?scope=pending', 'resume-refund-ops'],
        [HOME + '?date=all&q=fixture&page=2', 'resume-admin-console'],
      ];
      const blockedTasks = [
        'https://untrusted.example/internal/admin/jobs/all',
        '//untrusted.example/internal/admin/console',
        HOME + '/inbox',
        HOME + '-other',
        '/internal/admin/jobs/all?token=secret',
        HOME + '?credential=secret',
        '/internal/admin/control-room/%2e%2e/unknown',
      ];
      for (const json of [false, true]) {
        for (const [next, expected, marker] of [
          [undefined, HOME, 'console-first'], ['', HOME, 'console-first'],
          ...allowedTasks.map(([next, marker]) => [next, next, marker]),
          ...blockedTasks.map(next => [next, HOME, 'console-first']),
        ]) {
          const response = await login(origin, next, json);
          const context = `${origin} ${json ? 'JSON' : 'form'} next=${String(next)}`;
          assert.equal(response.status, json ? 200 : 303, context);
          assert.equal(response.headers.get('x-mmd-admin-next'), expected, context);
          assert.equal(response.headers.get('x-mmd-admin-post-login'), marker, context);
          assert.match(response.headers.get('set-cookie'), /^mmd_admin_gate_v1=.+; Path=\//, context);
          if (json) {
            const payload = await response.json();
            assert.equal(payload.ok, true, context);
            assert.equal(payload.next, expected, context);
          } else {
            assert.equal(response.headers.get('location'), origin + expected, context);
            assert.equal(await response.text(), '', context);
          }
        }
      }

      for (const path of [ROOT, ROOT + '/']) {
        for (const headers of [{}, { Cookie: 'mmd_admin_gate_v1=invalid' }, {
          Authorization: `Bearer ${ENV.ADMIN_LOGIN_CREDENTIAL}`,
          'x-mmd-admin-actor': 'fixture-owner', 'x-mmd-admin-role': 'owner',
          'x-mmd-admin-source': 'credential-bound-session',
        }]) {
          const response = await worker.fetch(new Request(origin + path, { headers }), guardedEnv, guardedContext);
          assert.equal(response.status, 303, `${origin}${path} rejects forged or missing sessions`);
          const target = new URL(response.headers.get('location'));
          assert.equal(target.origin, origin);
          assert.equal(target.pathname, LOGIN);
          assert.equal(target.searchParams.get('next'), ROOT);
          const head = await worker.fetch(new Request(origin + path, { method: 'HEAD', headers }), guardedEnv, guardedContext);
          assert.equal(head.status, 401);
        }
        for (const Cookie of [ownerCookie, adminCookie]) {
          for (const method of ['GET', 'HEAD']) {
            const response = await worker.fetch(new Request(origin + path, { method, headers: { Cookie } }), guardedEnv, guardedContext);
            assert.equal(response.status, 303);
            assert.equal(response.headers.get('location'), origin + HOME);
            assert.equal(response.headers.get('x-mmd-admin-entry'), 'console');
            assert.match(response.headers.get('cache-control'), /no-store/);
            assert.equal(await response.text(), '');
          }
        }
        for (const method of ['GET', 'HEAD']) {
          const response = await worker.fetch(new Request(origin + path, { method, headers: { Cookie: partnerCookie } }), guardedEnv, guardedContext);
          assert.equal(response.status, method === 'GET' ? 303 : 403);
          if (method === 'GET') assert.equal(response.headers.get('location'), origin + '/internal/admin/mms');
        }
      }
      assert.equal(backgroundCalls, 0, 'root GET/HEAD must return before background scheduling');

      let diagnosticCalls = 0;
      const diagnosticEnv = { ...ENV, MEMBER_PAGES_RESOLVER_DIAGNOSTIC: {
        async runMemberResolverDiagnostic() { diagnosticCalls++; return 'healthy_zero_match'; },
      } };
      const diagnostic = await worker.fetch(new Request(origin + ROOT, {
        method: 'POST', headers: { Cookie: ownerCookie, Origin: origin },
      }), diagnosticEnv, {});
      assert.equal(diagnostic.status, 200, 'root POST must keep its existing diagnostic handler');
      assert.equal(await diagnostic.text(), 'healthy_zero_match');
      assert.equal(diagnosticCalls, 1);
      for (const { suffix = '', headers = { Cookie: ownerCookie, Origin: origin }, body } of [
        { headers: { Origin: origin } },
        { headers: { Cookie: ownerCookie } },
        { headers: { Cookie: ownerCookie, Origin: 'https://untrusted.example' } },
        { suffix: '?unexpected=1' }, { body: 'unexpected' },
      ]) {
        const response = await worker.fetch(new Request(origin + ROOT + suffix, { method: 'POST', headers, body }), diagnosticEnv, {});
        assert.equal(response.status, 404, 'diagnostic rejection must stay indistinguishable');
        assert.equal(response.headers.get('location'), null);
        assert.equal(await response.text(), '');
      }
      assert.equal(diagnosticCalls, 1, 'rejected diagnostics must not call the service');

      const loginPage = await worker.fetch(new Request(origin + LOGIN), ENV, {});
      assert.equal(loginPage.status, 200);
      const loginDom = new JSDOM(await loginPage.text(), { url: origin + LOGIN, runScripts: 'outside-only' });
      try {
        const document = loginDom.window.document;
        assert.equal(document.querySelector('#adminNext').value, HOME, 'login form default');
        const calls = [];
        loginDom.window.fetch = async (url, options) => {
          calls.push({ url, options });
          return Response.json({ ok: false, error: 'fixture-rejection' }, { status: 401 });
        };
        const script = [...document.querySelectorAll('script')].find(node => node.textContent.includes("getElementById('ownerLoginForm')"));
        assert.ok(script, 'owner login browser handler must exist');
        loginDom.window.eval(script.textContent);
        document.querySelector('#adminNext').value = '';
        document.querySelector('#adminCredential').value = ENV.ADMIN_LOGIN_CREDENTIAL;
        document.querySelector('#ownerLoginForm').dispatchEvent(new loginDom.window.Event('submit', { bubbles: true, cancelable: true }));
        await settle();
        assert.equal(calls.length, 1);
        assert.equal(new URL(calls[0].url, origin).pathname, SESSION);
        assert.equal(new URLSearchParams(calls[0].options.body).get('next'), HOME, 'browser handler fallback');
        assert.equal(calls[0].options.method, 'POST');
      } finally { loginDom.window.close(); }

      const response = await worker.fetch(new Request(origin + HOME + '?date=all', {
        headers: { Cookie: ownerCookie },
      }), guardedEnv, guardedContext);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-mmd-admin-console'), 'rebuild-v1');
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
      const html = await response.text();
      assert.doesNotMatch(html, /console-home-fixture-login|console-home-fixture-signing-secret/);
      const dom = new JSDOM(html, { url: origin + HOME + '?date=all', runScripts: 'outside-only' });
      try {
        const document = dom.window.document;
        for (const selector of ['.ac-brand', '.ac-mobile-brand', '.ac-breadcrumb a']) {
          assert.equal(document.querySelector(selector)?.getAttribute('href'), HOME, selector);
        }
        assert.equal(document.querySelector('.ac-room-link')?.getAttribute('href'), '/internal/admin/control-room');
        assert.equal(document.querySelector('[data-count=all]').textContent.trim(), '—', 'counts remain unknown before the API resolves');
        const calls = [];
        dom.window.fetch = async (path, options) => {
          calls.push({ path, options });
          return Response.json({
            ok: true, view: 'jobs', layer: 'core', source: 'admin-worker', generated_at: new Date().toISOString(),
            filters: { q: null, job_date: null, session_id: null, job_id: null, client_id: null },
            pagination: { page: 1, page_size: 20, total: 0, total_pages: 1, has_prev: false, has_next: false },
            counts: { all: 0, filtered: 0, today: 0, upcoming: 0, past: 0, undated: 0 }, jobs: [],
          });
        };
        assert.equal(Object.hasOwn(dom.window, '__name'), false);
        const client = document.querySelector('script[data-admin-console-client]');
        assert.ok(client);
        dom.window.eval(client.textContent);
        await settle();
        assert.equal(calls.length, 1);
        const dataUrl = new URL(calls[0].path, origin);
        assert.equal(dataUrl.origin, origin);
        assert.equal(dataUrl.pathname, '/v1/admin/dashboard');
        assert.equal(dataUrl.searchParams.get('view'), 'jobs');
        assert.equal(calls[0].options.method || 'GET', 'GET');
        assert.equal(calls[0].options.credentials, 'include');
        assert.equal(calls[0].options.cache, 'no-store');
        assert.equal(document.querySelector('#ac-empty').hidden, false);
        assert.equal(document.querySelector('#ac-error').hidden, true);
        assert.equal(document.querySelector('[data-count=all]').textContent, '0');
        assert.equal(Object.hasOwn(dom.window, '__name'), false);
      } finally { dom.window.close(); }
    }
    assert.equal(backgroundCalls, 0);
    assert.equal(networkCalls(), 0);
  });
}
