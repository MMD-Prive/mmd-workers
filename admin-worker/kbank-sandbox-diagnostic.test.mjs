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
  assert.equal(h.calls[0].redirect, 'manual');
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
    error: 'oauth_smoke_cooldown', upstream_status: 429, retry_after_seconds: 1750, last_success: true });
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

test('readiness authenticates and checks booleans without bank or coordinator IO', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('bank must never be called'); };
  try {
    for (const enabled of ['false', 'true']) {
      const bankEnv = { AUTH_SERVICE_ADMIN_TO_PAYMENTS: 'test-service', KBANK_SANDBOX_ENABLED: enabled,
        KBANK_SANDBOX_CONSUMER_ID: 'hidden-id', KBANK_SANDBOX_CONSUMER_SECRET: 'hidden-secret',
        KBANK_SANDBOX_COORDINATOR: { get() { throw Error('must not call coordinator'); } } };
      const h = setup(req => handleKbankSandbox(req, bankEnv));
      const response = await handle(await request(h.env, { body: { mode: 'kbank_sandbox_status' } }), h.env);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.ready, enabled === 'true');
      assert.equal(data.bank_called, false);
      assert.deepEqual(data.checks, { enabled: enabled === 'true', consumer_id_present: true, consumer_secret_present: true, coordinator_present: true });
      assert.doesNotMatch(JSON.stringify(data), /hidden-id|hidden-secret/);
      assert.equal(h.calls.length, 1);
      for (const options of [{auth:false}, {role:'mms_partner'}, {origin:'https://attacker.example'}, {body:{mode:'kbank_sandbox_status',url:'https://attacker.example'}}]) {
        assert.ok((await handle(await request(h.env, {body:{mode:'kbank_sandbox_status'},...options}),h.env)).status >= 400);
      }
      assert.equal(h.calls.length, 1);
      const noAuth = await handleKbankSandbox(new Request('https://internal/v1/internal/payments/kbank/sandbox/status', {method:'POST'}), bankEnv);
      assert.equal(noAuth.status,401);
    }
  } finally { globalThis.fetch = original; }
});

test('missing settings remain not ready and HTML failures expose status only', async () => {
  const h = setup(req => handleKbankSandbox(req, {AUTH_SERVICE_ADMIN_TO_PAYMENTS:'test-service'}));
  const data = await (await handle(await request(h.env,{body:{mode:'kbank_sandbox_status'}}),h.env)).json();
  assert.equal(data.ready,false);
  assert.deepEqual(data.checks,{enabled:false,consumer_id_present:false,consumer_secret_present:false,coordinator_present:false});
  const broken = setup(() => new Response('<html>secret-detail</html>',{status:502}));
  const response=await handle(await request(broken.env),broken.env);
  assert.deepEqual(await response.json(),{environment:'sandbox',transfers_enabled:false,ok:false,error:'sandbox_non_json_response',upstream_status:502});
});

test('rendered browser script compiles and readiness enables smoke only when ready', async () => {
  const { Script, createContext } = await import('node:vm');
  const h=setup(() => {throw Error('GET must not probe');});
  const html=await (await handle(await request(h.env,{method:'GET'}),h.env)).text();
  assert.match(html, /id="kbank-probe" type="button" disabled/);
  const source=html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  const script=new Script(source);
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,{disabled:id==='kbank-probe',dataset:{},textContent:'',addEventListener(event,fn){this[event]=fn;}});return elements.get(id);};
  let calls=0, ready=false;
  const ctx=createContext({document:{getElementById:get},fetch:async()=>{calls++;return {ok:true,status:200,json:async()=>({ok:true,ready,checks:{enabled:ready,consumer_id_present:true,consumer_secret_present:true,coordinator_present:true}})};}});
  script.runInContext(ctx);
  assert.equal(calls,0);
  await get('kbank-status').click.call(get('kbank-status'));
  assert.equal(get('kbank-probe').disabled,true);
  ready=true;
  await get('kbank-status').click.call(get('kbank-status'));
  assert.equal(get('kbank-probe').disabled,false);
  get('kbank-probe').dataset.attempted='true';
  await get('kbank-status').click.call(get('kbank-status'));
  assert.equal(get('kbank-probe').disabled,true);
});


test('Workers-compatible Request rejects unsupported redirect modes before service IO', async () => {
  const NativeRequest = globalThis.Request;
  globalThis.Request = class extends NativeRequest {
    constructor(input, init) {
      if (init?.redirect && !['follow', 'manual'].includes(init.redirect)) throw new TypeError('Invalid redirect value');
      super(input, init);
    }
  };
  try {
    const h = setup(() => Response.json({environment:'sandbox', ok:false, error:'sandbox_disabled'}, {status:503}));
    const result = await handle(await request(h.env), h.env);
    assert.equal((await result.json()).error, 'sandbox_disabled');
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].redirect, 'manual');
  } finally { globalThis.Request = NativeRequest; }
});


test('bank HTTP status survives the admin proxy while bank body and secrets stay redacted', async () => {
  for (const status of [200, 302, 400, 401, 403, 429, 500]) {
    const h=setup(() => Response.json({ environment:'sandbox',ok:false,error:'kbank_oauth_failed',upstream_status:status,
      access_token:'must-not-leak',error_description:'must-not-leak' },{status:502}));
    const response=await handle(await request(h.env),h.env);
    assert.equal(response.status,502);
    assert.deepEqual(await response.json(),{environment:'sandbox',transfers_enabled:false,ok:false,error:'kbank_oauth_failed',upstream_status:502,bank_http_status:status});
  }
  for (const status of ['secret', '401', 999, -1, 200.5, null]) {
    const h=setup(() => Response.json({environment:'sandbox',ok:false,error:'kbank_oauth_failed',upstream_status:status},{status:502}));
    const response=await handle(await request(h.env),h.env);
    assert.equal((await response.json()).bank_http_status,undefined);
  }
});
