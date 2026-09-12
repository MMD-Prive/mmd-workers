import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import worker from './src/admin-login-hero-worker.js';
import paymentsWorker from '../payments-worker/index.review-wrapper.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { callPaymentsCreateLink } from './src/index.js';
import { PAYMENT_ISSUER_DIAGNOSTIC_PATH as PATH, ISSUE_EXISTING_SESSION_MODE } from './src/payment-issuer-diagnostic.js';

function setup({ upstreamSecret = 'service-test', binding } = {}) {
  const calls = [];
  const writes = [];
  const paymentsEnv = {
    AIRTABLE_BASE_ID: 'test-base', AIRTABLE_API_KEY: 'test-airtable',
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: upstreamSecret,
    AIRTABLE_HTTP: { fetch: async req => { writes.push('airtable'); throw Error('unexpected_airtable'); } },
    PAY_SESSIONS_KV: { put: async () => { writes.push('kv'); throw Error('unexpected_kv'); }, get: async () => null },
  };
  const env = {
    ADMIN_LOGIN_CREDENTIAL: 'admin-test', ADMIN_SESSION_SECRET: 'session-test',
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: 'service-test',
    CONFIRM_KEY: 'must-not-forward', INTERNAL_TOKEN: 'must-not-forward',
    PAYMENTS_BASE_URL: 'https://old-unreachable.workers.dev',
    PAYMENTS_WORKER: { fetch: async req => {
      calls.push({ url: req.url, body: await req.clone().json(), headers: Object.fromEntries(req.headers), redirect: req.redirect });
      return binding ? binding(req) : paymentsWorker.fetch(req, paymentsEnv, {});
    } },
  };
  return { env, calls, writes };
}
async function request(env, { method = 'POST', body = {}, role = 'admin', origin = 'https://mmdbkk.com', headers = {} } = {}) {
  const token = await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'), { id: 'test-owner', role }, env);
  return new Request('https://mmdbkk.com' + PATH, { method,
    headers: { Cookie: 'mmd_admin_gate_v1=' + token, Origin: origin, 'Content-Type': 'application/json', ...headers },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

function validSessionFields(overrides = {}) {
  return {
    fldLTq2kZbyRv22IA: 'sess_fixture',
    fldMvnQ0BzDfHUYjT: 'Client',
    flddVz6eoWRHrzIQr: 'Model',
    fldjK3U9bghnj7xUe: 'PN + MK',
    fldpnqoIsUMfN7y3c: '2026-09-17',
    fldBeG0FkWwa8kgnp: '2026-09-17T09:30:00.000Z',
    fldiDSz0wW9Ct9I3P: '2026-09-17T11:00:00.000Z',
    fldIiRpaxoafjTkFt: 'The Line Vipe',
    fldoUDQ8sH93idPx0: 'https://maps.example/fixture',
    fldvJowquu8RrsOMc: 27500,
    fldlTO5aNfqUmlNWm: 20000,
    fld6P6if0vDZCeV0C: ['recClientFixture'],
    fldEcDkF7CH9VixWM: 'Owner-approved existing session',
    ...overrides,
  };
}

function installAdminAirtable(env, sessionFields, { paymentRecords = [] } = {}) {
  env.AIRTABLE_BASE_ID = 'test-base';
  env.AIRTABLE_API_KEY = 'test-airtable';
  env.AIRTABLE_TABLE_SESSIONS = 'tblC98mKWbzmPuNzX';
  env.AIRTABLE_TABLE_PAYMENTS = 'tblWGGJJOx5eBvBZJ';
  env.AIRTABLE_HTTP = { fetch: async req => {
    const url = String(req.url);
    if (url.includes('tblC98mKWbzmPuNzX')) return Response.json({ records: [{ id: 'recSessionFixture', fields: sessionFields }] });
    if (url.includes('tblWGGJJOx5eBvBZJ')) return Response.json({ records: paymentRecords });
    throw new Error('unexpected_admin_airtable_table');
  } };
}

test('active admin wrapper reaches real payments validation without writes or notification', async () => {
  const h = setup();
  const original = globalThis.fetch;
  globalThis.fetch = async () => { h.writes.push('network'); throw Error('unexpected_network'); };
  try {
    const response = await worker.fetch(await request(h.env), h.env, {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.stage, 'validation_reached');
    assert.equal(body.upstream_status, 400);
    assert.equal(body.upstream_error, 'client_name_required');
    assert.equal(body.transport, 'service_binding');
    assert.equal(body.service_authenticated, true);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0].body, {});
    assert.deepEqual(Object.keys(h.calls[0].headers).sort(), ['accept', 'content-type', 'x-internal-token']);
    assert.equal(h.calls[0].headers['x-internal-token'], 'service-test');
    assert.equal(h.calls[0].redirect, 'manual');
    assert.deepEqual(h.writes, []);
    for (const field of ['session_id', 'payment_ref', 'customer_t', 'model_t', 'customer_confirmation_url']) assert.equal(body[field], undefined);
  } finally { globalThis.fetch = original; }
});

test('bare bearer and spoofed actor headers cannot bypass the browser admin gate', async () => {
  const h = setup();
  for (const headers of [{}, { Authorization: 'Bearer admin-test' },
    { 'x-mmd-admin-role': 'admin', 'x-mmd-admin-source': 'credential-bound-session' }]) {
    const response = await worker.fetch(new Request('https://mmdbkk.com' + PATH, { method: 'POST', headers, body: '{}' }), h.env, {});
    assert.equal(response.status, 401);
  }
  assert.equal(h.calls.length, 0);
});

test('partner role, cross-origin and wrong method fail before payments', async () => {
  const h = setup();
  for (const [options, status] of [[{ role: 'mms_partner' }, 403], [{ origin: 'https://attacker.example' }, 403], [{ method: 'PUT' }, 405]]) {
    const response = await worker.fetch(await request(h.env, options), h.env, {});
    assert.equal(response.status, status);
  }
  assert.equal(h.calls.length, 0);
});

test('diagnostic page requires admin auth and never probes on GET', async () => {
  const h = setup();
  const unauthenticated = await worker.fetch(new Request('https://mmdbkk.com' + PATH), h.env, {});
  assert.equal(unauthenticated.status, 401);
  const forbidden = await worker.fetch(await request(h.env, { method: 'GET', role: 'mms_partner' }), h.env, {});
  assert.equal(forbidden.status, 403);
  const response = await worker.fetch(await request(h.env, { method: 'GET' }), h.env, {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.writes, []);
});

test('deploy workflow synchronizes the diagnostic route and checks its admin gate', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-admin-worker.yml', import.meta.url), 'utf8');
  const paths = workflow.split('const paths = [')[1].split('];')[0];
  assert.ok(paths.includes(JSON.stringify(PATH)));
  assert.match(workflow, /test "\$diagnostic_code" = "401"/);
  assert.ok(workflow.includes('$origin' + PATH));
});

test('diagnostic refuses arbitrary caller payloads', async () => {
  const h = setup();
  for (const body of [{ client_name: 'Do not create' }, { url: 'https://attacker.example' }, [], null, 'bad-json']) {
    const response = await worker.fetch(await request(h.env, { body }), h.env, {});
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'diagnostic_empty_object_required');
  }
  assert.equal(h.calls.length, 0);
});

test('owner existing-session issuance builds deposit pricing server-side and never returns signed URLs', async () => {
  const minted = {
    ok: true,
    session_id: 'sess_fixture',
    payment_ref: 'pay_fixture',
    customer_confirmation_url: 'https://mmdbkk.com/sigil/confirm/job-confirmation?t=customer-secret',
    model_confirmation_url: 'https://mmdbkk.com/sigil/confirm/job-model?t=model-secret',
  };
  const h = setup({ binding: () => Response.json(minted) });
  installAdminAirtable(h.env, validSessionFields());
  const response = await worker.fetch(await request(h.env, { body: {
    mode: ISSUE_EXISTING_SESSION_MODE,
    session_id: 'sess_fixture',
    payment_type: 'deposit',
    deposit_percent: 30,
  } }), h.env, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.stage, 'issued');
  assert.equal(body.payment_ref, 'pay_fixture');
  assert.equal(body.customer_confirmation_url_present, true);
  assert.equal(body.model_confirmation_url_present, true);
  assert.equal(body.customer_confirmation_url, undefined);
  assert.equal(body.model_confirmation_url, undefined);
  assert.equal(h.calls.length, 1);
  const payload = h.calls[0].body;
  assert.equal(payload.session_id, 'sess_fixture');
  assert.equal(payload.amount_thb, 27500);
  assert.equal(payload.pay_model_thb, 20000);
  assert.equal(payload.payment_type, 'deposit');
  assert.equal(payload.payment_stage, 'deposit');
  assert.equal(payload.confirm_page, 'https://mmdbkk.com/sigil/confirm/job-confirmation');
  assert.equal(payload.model_confirm_page, 'https://mmdbkk.com/sigil/confirm/job-model');
  assert.match(payload.note, /\[SIGIL Pricing v1\]/);
  assert.match(payload.note, /"deposit_due_thb":8250/);
  assert.match(payload.note, /"balance_thb":19250/);
});

test('existing complete confirmation state is idempotent and never mints again', async () => {
  const h = setup({ binding: () => { throw new Error('must_not_mint'); } });
  installAdminAirtable(h.env, validSessionFields({
    fldojgjSQLaO0uQLX: 'pay_existing',
    fldi9ZdoiUXzSv1rI: 'https://mmdbkk.com/sigil/confirm/job-confirmation?t=existing-customer',
    fld0mFma9J9yfEaKb: 'https://mmdbkk.com/sigil/confirm/job-model?t=existing-model',
  }));
  const response = await worker.fetch(await request(h.env, { body: {
    mode: ISSUE_EXISTING_SESSION_MODE, session_id: 'sess_fixture', payment_type: 'deposit', deposit_percent: 30,
  } }), h.env, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.stage, 'existing_links');
  assert.equal(body.issued, false);
  assert.equal(h.calls.length, 0);
});

test('existing-session issuance fails closed without canonical Client or with a payment collision', async () => {
  const missingClient = setup({ binding: () => { throw new Error('must_not_mint'); } });
  installAdminAirtable(missingClient.env, validSessionFields({ fld6P6if0vDZCeV0C: [] }));
  let response = await worker.fetch(await request(missingClient.env, { body: {
    mode: ISSUE_EXISTING_SESSION_MODE, session_id: 'sess_fixture', payment_type: 'deposit', deposit_percent: 30,
  } }), missingClient.env, {});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'canonical_client_link_required');
  assert.equal(missingClient.calls.length, 0);

  const collision = setup({ binding: () => { throw new Error('must_not_mint'); } });
  installAdminAirtable(collision.env, validSessionFields(), { paymentRecords: [{ id: 'recPaymentExisting', fields: {} }] });
  response = await worker.fetch(await request(collision.env, { body: {
    mode: ISSUE_EXISTING_SESSION_MODE, session_id: 'sess_fixture', payment_type: 'deposit', deposit_percent: 30,
  } }), collision.env, {});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'existing_payment_without_session_links');
  assert.equal(collision.calls.length, 0);
});

test('a service credential mismatch is diagnosed independently from admin auth', async () => {
  const h = setup({ upstreamSecret: 'different-service-secret' });
  const response = await worker.fetch(await request(h.env), h.env, {});
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.stage, 'service_auth');
  assert.equal(body.upstream_status, 401);
  assert.equal(body.upstream_error, 'service_auth_required');
  assert.deepEqual(h.writes, []);
});

test('missing dedicated credential never falls back to admin or legacy secrets', async () => {
  const h = setup();
  delete h.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS;
  const response = await worker.fetch(await request(h.env), h.env, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).stage, 'configuration');
  assert.equal(h.calls.length, 0);
});

test('binding failures and rejected requests never trigger a second payment attempt', async () => {
  const original = globalThis.fetch;
  let httpCalls = 0;
  globalThis.fetch = async () => { httpCalls++; throw Error('unexpected_fallback'); };
  try {
    const h = setup({ binding: () => { throw Error('network_secret_must_not_leak'); } });
    const response = await worker.fetch(await request(h.env), h.env, {});
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /network_secret_must_not_leak/);
    assert.equal(h.calls.length, 1);
    const rejected = setup({ binding: () => Response.json({ ok: false, error: 'service_auth_required' }, { status: 401 }) });
    await assert.rejects(callPaymentsCreateLink(rejected.env, { client_name: 'fixture' }), /service_auth_required/);
    assert.equal(rejected.calls.length, 1);
    assert.equal(httpCalls, 0);
  } finally { globalThis.fetch = original; }
});

test('issuer uses the binding for ordinary payloads without changing its response contract', async () => {
  const minted = { session_id: 'fixture-session', payment_ref: 'fixture-payment', customer_confirmation_url: 'https://fixture.example/customer' };
  const h = setup({ binding: () => Response.json(minted) });
  const payload = { client_name: 'fixture', amount_thb: 2500 };
  assert.deepEqual(await callPaymentsCreateLink(h.env, payload), minted);
  assert.deepEqual(h.calls[0].body, payload);
});

test('absent binding uses canonical HTTPS fallback once and blocks redirects', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response('', { status: 302, headers: { Location: 'https://attacker.example' } }); };
  try {
    await assert.rejects(callPaymentsCreateLink({ AUTH_SERVICE_ADMIN_TO_PAYMENTS: 'service-test' }, {}), /payments_worker_http_302/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://sigil.mmdbkk.com/v1/confirm/link');
    assert.equal(calls[0].init.redirect, 'manual');
  } finally { globalThis.fetch = original; }
});

test('diagnostic rejects unexpected success and redacts raw upstream responses', async () => {
  for (const status of [200, 400, 522]) {
    const h = setup({ binding: () => Response.json({ ok: true, error: 'secret-value', session_id: 'must-not-leak', token: 'must-not-leak' }, { status }) });
    const response = await worker.fetch(await request(h.env), h.env, {});
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.doesNotMatch(text, /secret-value|must-not-leak/);
  }
});

test('configuration adds only exact diagnostic routes and the canonical binding', async () => {
  const config = await readFile(new URL('./wrangler.toml', import.meta.url), 'utf8');
  assert.match(config, /binding = "PAYMENTS_WORKER"\s+service = "payments-worker"/);
  assert.match(config, /PAYMENTS_BASE_URL = "https:\/\/sigil\.mmdbkk\.com"/);
  for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) assert.ok(config.includes(`pattern = "${host}${PATH}"`));
  assert.ok(!config.includes(PATH + '*'));
});

test('legacy workers.dev fallback is replaced and unsafe configuration never sends credentials', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ ok: true }); };
  try {
    await callPaymentsCreateLink({ AUTH_SERVICE_ADMIN_TO_PAYMENTS: 'service-test', PAYMENTS_BASE_URL: 'https://payments-worker.malemodel-bkk.workers.dev' }, {});
    assert.equal(calls[0].url, 'https://sigil.mmdbkk.com/v1/confirm/link');
    for (const base of ['not-a-url', 'http://sigil.mmdbkk.com', 'https://user:pass@sigil.mmdbkk.com', 'https://sigil.mmdbkk.com?token=bad']) {
      await assert.rejects(callPaymentsCreateLink({ AUTH_SERVICE_ADMIN_TO_PAYMENTS: 'service-test', PAYMENTS_BASE_URL: base }, {}), /invalid_PAYMENTS_BASE_URL/);
    }
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = original; }
});
