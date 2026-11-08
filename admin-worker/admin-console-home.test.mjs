import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import worker from './src/admin-login-hero-worker.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { renderApprovedAdminLogin } from './src/admin-login-page.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const HOME = '/internal/admin/console';
const ROOT = '/internal/admin';
const SESSION = '/internal/admin/login/session';
const HOSTS = ['mmdbkk.com', 'www.mmdbkk.com'];
const ENV = {
  ADMIN_LOGIN_CREDENTIAL: 'home-fixture-owner-credential',
  ADMIN_SESSION_SECRET: 'home-fixture-signing-secret',
  ALLOWED_ORIGINS: 'https://mmdbkk.com,https://www.mmdbkk.com',
};

function request(path, init = {}, host = HOSTS[0]) {
  return new Request(`https://${host}${path}`, init);
}

async function cookie(role = 'owner') {
  const token = await createCredentialBoundAdminSession(request(ROOT), { id: 'home-fixture', role }, ENV);
  return `mmd_admin_gate_v1=${token}`;
}

function login({ host = HOSTS[0], json = false, next } = {}) {
  const payload = { credential: ENV.ADMIN_LOGIN_CREDENTIAL };
  if (next !== undefined) payload.next = next;
  const headers = { Origin: `https://${host}` };
  headers['Content-Type'] = json ? 'application/json' : 'application/x-www-form-urlencoded';
  if (json) headers['X-MMD-Login-Fetch'] = '1';
  const body = json ? JSON.stringify(payload) : new URLSearchParams(payload).toString();
  return worker.fetch(request(SESSION, { method: 'POST', headers, body }, host), ENV, {});
}

async function assertLoginTarget(response, { host, json, next, marker }) {
  assert.equal(response.status, json ? 200 : 303);
  assert.equal(response.headers.get('x-mmd-admin-next'), next);
  assert.equal(response.headers.get('x-mmd-admin-post-login'), marker);
  assert.equal(response.headers.get('x-mmd-admin-role'), 'owner');
  const sessionCookie = response.headers.get('set-cookie');
  assert.match(sessionCookie, /^mmd_admin_gate_v1=/);
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /SameSite=Lax/);
  assert.match(sessionCookie, /; Domain=mmdbkk\.com;/);
  if (json) {
    assert.match(response.headers.get('cache-control'), /no-store/);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.next, next);
    assert.equal(body.role, 'owner');
    assert.equal(response.headers.get('location'), null);
  } else {
    assert.equal(response.headers.get('location'), `https://${host}${next}`);
  }
}

test('ordinary owner form and JSON login open Console on both production hosts', async () => {
  for (const host of HOSTS) {
    for (const json of [false, true]) {
      const response = await login({ host, json });
      await assertLoginTarget(response, { host, json, next: HOME, marker: 'console-first' });
    }
  }
});

test('invalid login destinations fail closed to Console for form and JSON clients', async () => {
  for (const next of [
    '',
    'https://evil.example/internal/admin/console',
    '//evil.example/internal/admin/console',
    '/internal/admin/console-extra',
    '/internal/admin/console/inbox',
    '/internal/admin/console/%2e%2e/unknown',
    '/internal/admin/jobs/all?ToKeN=secret',
    '/internal/ceo/models?credential=secret',
  ]) {
    for (const json of [false, true]) {
      const response = await login({ next, json });
      await assertLoginTarget(response, { host: HOSTS[0], json, next: HOME, marker: 'console-first' });
    }
  }
});

test('owner login resumes allowed tools and scoped tasks instead of replacing them with home', async () => {
  const tasks = [
    [HOME, 'console-first'],
    [`${HOME}?date=all&client_id=recAAAAAAAAAAAAAA&q=fixture&page=2#jobs`, 'resume-admin-console'],
    [`${HOME}#jobs`, 'resume-admin-console'],
    ['/internal/admin/control-room?tab=tools#map', 'resume-admin-task'],
    ['/internal/admin/dashboard', 'resume-admin-task'],
    ['/internal/admin/jobs/all?session_id=sess_fixture&page=2#job', 'resume-admin-task'],
    ['/internal/admin/jobs/create-job?client_id=recAAAAAAAAAAAAAA', 'resume-admin-task'],
    ['/internal/admin/customer-data?client_id=recAAAAAAAAAAAAAA', 'resume-admin-task'],
    ['/internal/admin/payments?proof_id=proof_fixture', 'resume-admin-task'],
    ['/internal/ceo/models?view=readiness#supply', 'resume-admin-task'],
    ['/internal/admin/refunds?inbox_id=refund_fixture&action=upload', 'resume-refund-ops'],
  ];
  for (const host of HOSTS) {
    for (const json of [false, true]) {
      for (const [next, marker] of tasks) {
        const response = await login({ host, json, next });
        await assertLoginTarget(response, { host, json, next, marker });
      }
    }
  }
});

test('login page and browser recovery fallbacks use Console while preserving the partner lane', async () => {
  for (const host of HOSTS) {
    const response = await worker.fetch(request('/internal/admin/login', {}, host), ENV, {});
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /name="next" value="\/internal\/admin\/console"/);
    assert.match(html, /body\.set\('next',document\.getElementById\('adminNext'\)\.value\|\|'\/internal\/admin\/console'\)/);
    assert.match(html, /location\.assign\(payload\.next\|\|'\/internal\/admin\/console'\)/);
    assert.match(html, /location\.assign\(payload\.next\|\|'\/internal\/admin\/mms'\)/);
  }
  const direct = await renderApprovedAdminLogin(request('/internal/admin/login')).text();
  assert.match(direct, /name="next" value="\/internal\/admin\/console"/);
  const partner = await renderApprovedAdminLogin(request('/internal/admin/login'), { next: '/internal/admin/mms' }).text();
  assert.match(partner, /data-initial-lane="partner"/);
  assert.match(partner, /name="next" value="\/internal\/admin\/mms"/);
});

test('admin home gates owner, partner and forged requests before any upstream or background work', async () => {
  const ownerCookie = await cookie();
  const adminCookie = await cookie('admin');
  const partnerCookie = await cookie('mms_partner');
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  let backgroundCalls = 0;
  let waitUntilCalls = 0;
  const env = {
    ...ENV,
    LINE_OFC_BACKFILL_COORDINATOR: {
      idFromName() { backgroundCalls++; throw new Error('Home must not start identity backfill'); },
    },
  };
  const ctx = { waitUntil() { waitUntilCalls++; } };
  globalThis.fetch = async () => { upstreamCalls++; throw new Error('Home must not fetch upstream'); };
  try {
    for (const host of HOSTS) {
      for (const path of [ROOT, `${ROOT}/`]) {
        for (const method of ['GET', 'HEAD']) {
          for (const Cookie of [ownerCookie, adminCookie, `mmd_admin_gate_v1=stale; ${ownerCookie}`]) {
            const response = await worker.fetch(request(path, { method, headers: { Cookie } }, host), env, ctx);
            assert.equal(response.status, 303);
            assert.equal(response.headers.get('location'), `https://${host}${HOME}`);
            assert.equal(response.headers.get('x-mmd-admin-entry'), 'console');
            assert.match(response.headers.get('cache-control'), /no-store/);
            assert.equal(await response.text(), '');
          }
          for (const headers of [{}, { Cookie: 'mmd_admin_gate_v1=forged' }, {
            authorization: `Bearer ${ENV.ADMIN_LOGIN_CREDENTIAL}`,
            'x-mmd-admin-actor': 'per',
            'x-mmd-admin-role': 'owner',
            'x-mmd-admin-source': 'credential-bound-session',
          }]) {
            const response = await worker.fetch(request(path, { method, headers }, host), env, ctx);
            assert.equal(response.status, method === 'GET' ? 303 : 401);
            if (method === 'GET') {
              const target = new URL(response.headers.get('location'));
              assert.equal(target.origin, `https://${host}`);
              assert.equal(target.pathname, '/internal/admin/login');
              assert.equal(target.searchParams.get('next'), ROOT);
              assert.equal(response.headers.get('x-mmd-admin-gate'), 'credential-required');
            } else {
              assert.equal((await response.json()).error, 'unauthorized');
              assert.equal(response.headers.get('location'), null);
            }
          }
          const partner = await worker.fetch(request(path, { method, headers: { Cookie: partnerCookie } }, host), env, ctx);
          assert.equal(partner.status, method === 'GET' ? 303 : 403);
          if (method === 'GET') {
            assert.equal(partner.headers.get('location'), `https://${host}/internal/admin/mms`);
          } else {
            assert.equal((await partner.json()).error, 'mms_partner_scope_forbidden');
            assert.equal(partner.headers.get('location'), null);
          }
        }
      }
    }
    assert.equal(upstreamCalls, 0);
    assert.equal(backgroundCalls, 0);
    assert.equal(waitUntilCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST admin root still reaches the existing diagnostic trigger and keeps its request gates', async () => {
  const Cookie = await cookie();
  let diagnosticCalls = 0;
  let backfillCalls = 0;
  const env = {
    ...ENV,
    MEMBER_PAGES_RESOLVER_DIAGNOSTIC: {
      async runMemberResolverDiagnostic() { diagnosticCalls++; return 'healthy_zero_match'; },
    },
    LINE_OFC_BACKFILL_COORDINATOR: {
      idFromName() { backfillCalls++; throw new Error('Diagnostic must not start identity backfill'); },
    },
  };
  for (const host of HOSTS) {
    const Origin = `https://${host}`;
    const accepted = await worker.fetch(request(ROOT, { method: 'POST', headers: { Cookie, Origin } }, host), env, {});
    assert.equal(accepted.status, 200);
    assert.equal(await accepted.text(), 'healthy_zero_match');
    assert.equal(accepted.headers.get('location'), null);
    const callsAfterAccepted = diagnosticCalls;
    for (const [path, headers, body] of [
      [ROOT, { Origin }, undefined],
      [ROOT, { Cookie: 'mmd_admin_gate_v1=forged', Origin, 'x-mmd-admin-role': 'owner' }, undefined],
      [ROOT, { Cookie, Origin: 'https://evil.example' }, undefined],
      [ROOT, { Cookie, Origin }, 'unexpected-body'],
      [`${ROOT}?unexpected=1`, { Cookie, Origin }, undefined],
    ]) {
      const denied = await worker.fetch(request(path, { method: 'POST', headers, body }, host), env, {});
      assert.equal(denied.status, 404);
      assert.equal(await denied.text(), '');
      assert.equal(denied.headers.get('location'), null);
    }
    assert.equal(diagnosticCalls, callsAfterAccepted);
  }
  assert.equal(diagnosticCalls, HOSTS.length);
  assert.equal(backfillCalls, 0);
});

test('Console brands and workspace breadcrumb lead home while Control Room remains an explicit tool', async () => {
  const Cookie = await cookie();
  const response = await worker.fetch(request(HOME, { headers: { Cookie } }), ENV, {});
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const className of ['ac-brand', 'ac-mobile-brand']) {
    assert.match(html, new RegExp(`<a class="${className}" href="/internal/admin/console" aria-label="SĪGIL System · Console"`));
  }
  const breadcrumb = html.match(/<nav class="ac-breadcrumb"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(breadcrumb, 'workspace breadcrumb must remain available');
  assert.match(breadcrumb, /href="\/internal\/admin\/console"/);
  assert.match(html, /<a class="ac-room-link" href="\/internal\/admin\/control-room"/);
  const mobileTools = html.match(/<details class="ac-mobile-tools"[\s\S]*?<\/details>/)?.[0];
  assert.ok(mobileTools, 'mobile tools must remain available');
  assert.match(mobileTools, /<a class="ac-nav-link" href="\/internal\/admin\/control-room"/);
});
