import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePaymentIssuerDiagnostic as handle, PAYMENT_ISSUER_DIAGNOSTIC_PATH as PATH } from './src/payment-issuer-diagnostic.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { handleKbankSandbox } from '../payments-worker/kbank-sandbox.mjs';

const mode = 'kbank_sandbox_oauth';
function setup(fetch) {
  const calls = [];
  const env = { ADMIN_LOGIN_CREDENTIAL: 'test-login', ADMIN_SESSION_SECRET: 'test-session',
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: 'test-service',
    PAYMENTS_WORKER: { fetch: async req => { calls.push(req); return fetch(req); } } };
  return { env, calls };
}
async function request(env, { role = 'owner', origin = 'https://mmdbkk.com', method = 'POST', body = { mode }, auth = true } = {}) {
  const cookie = await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'), { id: 'fixture', role }, env);
  return new Request('https://mmdbkk.com' + PATH, { method,
    headers: { ...(auth ? { Cookie: 'mmd_admin_gate_v1=' + cookie } : {}), Origin: origin, 'Content-Type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
}

test('unauthenticated, wrong role, cross-origin, extra fields and wrong method never reach payments', async () => {
  const h = setup(() => { throw Error('unexpected'); });
  for (const [options, status] of [[{ auth: false }, 401], [{ role: 'mms_partner' }, 403],
    [{ origin: 'https://attacker.example' }, 403], [{ method: 'PUT' }, 405],
    [{ body: { mode, url: 'https://attacker.example', amount: 1 } }, 400]]) {
    assert.equal((await handle(await request(h.env, options), h.env)).status, status);
  }
  const page = await handle(await request(h.env, { method: 'GET' }), h.env);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /kbank-probe/);
  assert.equal(h.calls.length, 0);
});

test('authorized smoke uses existing service binding and exposes only safe success fields', async () => {
  const bankEnv = { AUTH_SERVICE_ADMIN_TO_PAYMENTS: 'test-service', KBANK_SANDBOX_ENABLED: 'true',
    KBANK_SANDBOX_CONSUMER_ID: 'test-id', KBANK_SANDBOX_CONSUMER_SECRET: 'test-secret',
    KBANK_SANDBOX_COORDINATOR: { idFromName: name => name, get: () => ({ fetch: async () => Response.json({
      environment: 'sandbox', ok: true, oauth: 'connected', expires_in: 1799, transfers_enabled: false,
      access_token: 'must-not-leak', error_description: 'must-not-leak',
    }) }) } };
  const h = setup(req => handleKbankSandbox(req, bankEnv));
  const response = await handle(await request(h.env), h.env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { environment: 'sandbox', transfers_enabled: false, ok: true, oauth: 'connected', expires_in: 1799 });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, 'https://sigil.mmdbkk.com/v1/internal/payments/kbank/sandbox/smoke');
  assert.equal(h.calls[0].headers.get('x-internal-token'), 'test-service');
  assert.equal(h.calls[0].redirect, 'error');
  assert.equal(await h.calls[0].text(), '');
});

test('disabled sandbox and service mismatch fail closed through the real payment handler', async () => {
  for (const [secret, expected, status] of [['test-service', 'sandbox_disabled', 503], ['different', 'service_auth_required', 502]]) {
    const h = setup(req => handleKbankSandbox(req, { AUTH_SERVICE_ADMIN_TO_PAYMENTS: secret }));
    const response = await handle(await request(h.env), h.env);
    assert.equal(response.status, status);
    assert.equal((await response.json()).error, expected);
    assert.equal(h.calls.length, 1);
  }
});

test('cooldown remains a non-success and raw upstream payloads never escape', async () => {
  const h = setup(() => Response.json({ environment: 'sandbox', ok: false, error: 'oauth_smoke_cooldown',
    retry_after_seconds: 1750, last_success: true, access_token: 'must-not-leak' }, { status: 429 }));
  const response = await handle(await request(h.env), h.env);
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { environment: 'sandbox', transfers_enabled: false, ok: false,
    error: 'oauth_smoke_cooldown', retry_after_seconds: 1750, last_success: true });
  for (const status of [200, 302, 502]) {
    const bad = setup(() => Response.json({ ok: true, access_token: 'must-not-leak', error: 'must-not-leak' }, { status }));
    const result = await handle(await request(bad.env), bad.env);
    assert.equal(result.status, 502);
    assert.doesNotMatch(await result.text(), /must-not-leak/);
    assert.equal(bad.calls.length, 1);
  }
});

test('missing config and transport exceptions never retry or use public fallback', async () => {
  const original = globalThis.fetch;
  let publicCalls = 0;
  globalThis.fetch = async () => { publicCalls++; throw Error('unexpected'); };
  try {
    for (const missing of ['AUTH_SERVICE_ADMIN_TO_PAYMENTS', 'PAYMENTS_WORKER']) {
      const h = setup(() => { throw Error('must-not-leak'); });
      delete h.env[missing];
      const response = await handle(await request(h.env), h.env);
      assert.equal(response.status, 503);
      assert.equal(h.calls.length, 0);
    }
    const h = setup(() => { throw Error('must-not-leak'); });
    const result = await handle(await request(h.env), h.env);
    assert.equal(result.status, 503);
    assert.doesNotMatch(await result.text(), /must-not-leak/);
    assert.equal(h.calls.length, 1);
    assert.equal(publicCalls, 0);
  } finally { globalThis.fetch = original; }
});
