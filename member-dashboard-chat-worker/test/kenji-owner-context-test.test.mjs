import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerContextTestAllowed, ownerContextTestRequested } from '../src/kenji-owner-context-test.mjs';
import { handleKenjiSeedLineRequestWithRedeliveryRecovery } from '../src/kenji-line-redelivery-recovery.mjs';
import { createLineSignature } from '../src/index.js';

const owner = 'U1234567890abcdef1234567890abcdef';
const customer = 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const runtime = { ok: true, controls: { line_oa_auto_reply: false, model_keyword_auto_reply: true, all_kenji_mutations: false } };
const event = (userId = owner) => ({ type: 'message', mode: 'active', replyToken: 'fixture-' + userId, source: { type: 'user', userId }, message: { type: 'text', text: 'ตัวจริง ตรงปกใช่ไหมครับ' } });
async function config() {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(owner));
  return {
    KENJI_LINE_OWNER_CONTEXT_TEST_ENABLED: 'true',
    KENJI_LINE_OWNER_CONTEXT_TEST_OWNER_SHA256: Buffer.from(hash).toString('hex'),
    KENJI_LINE_OWNER_CONTEXT_TEST_STARTS_AT: new Date(Date.now() - 1000).toISOString(),
    KENJI_LINE_OWNER_CONTEXT_TEST_EXPIRES_AT: new Date(Date.now() + 600000).toISOString(),
    LINE_AUTO_REPLY_ENABLED: 'false', LINE_FIRST_CONTACT_ENABLED: 'false',
    KENJI_LINE_CONTINUITY_ENABLED: 'true',
    LINE_KENJI_AI_ENABLED: 'true', LINE_KENJI_MODEL_ENABLED: 'false',
    KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: 'false', LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: 'true',
    INTERNAL_TOKEN: 'fixture-internal', LINE_CHANNEL_SECRET: 'fixture-secret', LINE_CHANNEL_ACCESS_TOKEN: 'fixture-token',
    ADMIN_WORKER: { async fetch() { return Response.json(runtime); } },
  };
}

test('default OFF, exact signed-source identity only, maximum 30 minute window', async () => {
  const env = await config();
  assert.equal(ownerContextTestRequested({}), false);
  assert.equal(await ownerContextTestAllowed(env, event(), runtime), true);
  for (const delta of [
    { KENJI_LINE_OWNER_CONTEXT_TEST_ENABLED: 'false' }, { KENJI_LINE_OWNER_CONTEXT_TEST_OWNER_SHA256: '' },
    { KENJI_LINE_OWNER_CONTEXT_TEST_OWNER_SHA256: '*' }, { LINE_AUTO_REPLY_ENABLED: 'true' },
    { LINE_KENJI_MODEL_ENABLED: 'true' }, { LINE_KENJI_MODEL_ENABLED: undefined },
    { KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: 'true' }, { LINE_FIRST_CONTACT_ENABLED: 'true' },
    { KENJI_LINE_CONTINUITY_ENABLED: 'false' },
    { KENJI_LINE_OWNER_CONTEXT_TEST_EXPIRES_AT: '' },
    { KENJI_LINE_OWNER_CONTEXT_TEST_EXPIRES_AT: new Date(Date.now() - 1).toISOString() },
    { KENJI_LINE_OWNER_CONTEXT_TEST_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString() },
    { KENJI_LINE_OWNER_CONTEXT_TEST_STARTS_AT: new Date(Date.now() + 10000).toISOString() },
  ]) assert.equal(await ownerContextTestAllowed({ ...env, ...delta }, event(), runtime), false);
  for (const input of [event(customer), { ...event(), mode: 'standby' }, { ...event(), mode: undefined },
    { ...event(), source: { type: 'group', userId: owner } },
    { ...event(), deliveryContext: { isRedelivery: true } }, { ...event(), replyToken: '' },
    { ...event(), type: 'follow' }, { ...event(), message: { type: 'image' } },
    { ...event(customer), message: { type: 'text', text: owner }, displayName: 'Per' },
  ]) assert.equal(await ownerContextTestAllowed(env, input, runtime), false);
});

test('runtime errors, unknown controls and all/LINE/model safety drift fail closed', async () => {
  const env = await config();
  for (const state of [{}, { ok: false }, { ok: true, controls: {} },
    ...['all_kenji_mutations', 'line_oa_auto_reply', 'model_keyword_auto_reply'].map(key => ({
      ok: true, controls: { ...runtime.controls, [key]: !runtime.controls[key] },
    })),
  ]) assert.equal(await ownerContextTestAllowed(env, event(), state), false);
});

test('invalid signatures stay 401 and mixed batches do not enable owner-test replies', async () => {
  const env = await config();
  const original = globalThis.fetch;
  const replies = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.line.me/v2/bot/message/reply');
    replies.push(JSON.parse(init.body));
    return Response.json({});
  };
  let intakes = 0;
  const legacy = { async fetch(request, passedEnv) {
    assert.equal(passedEnv.LINE_AUTO_REPLY_ENABLED, 'false');
    intakes++;
    return Response.json({ saved: (await request.json()).events.map(() => ({})) });
  } };
  const events = [event(customer), event(), { ...event(customer), deliveryContext: { isRedelivery: true } }];
  const raw = JSON.stringify({ events });
  const request = signature => new Request('https://fixture.invalid/webhooks/line', {
    method: 'POST', headers: { 'x-line-signature': signature }, body: raw,
  });
  try {
    const invalid = await handleKenjiSeedLineRequestWithRedeliveryRecovery(request('forged'), env, null, legacy);
    assert.equal(invalid.status, 401);
    assert.equal(intakes, 0);
    const response = await handleKenjiSeedLineRequestWithRedeliveryRecovery(request(await createLineSignature(raw, env.LINE_CHANNEL_SECRET)), env, null, legacy);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.saved.map(turn => turn.replied), [false, false, false]);
    assert.equal(replies.length, 0);
    assert.equal(env.LINE_AUTO_REPLY_ENABLED, 'false');
    assert.equal(env.LINE_KENJI_MODEL_ENABLED, 'false');
    assert.equal(runtime.controls.model_keyword_auto_reply, true);
  } finally { globalThis.fetch = original; }
});

test('non-owner redelivery and mixed requests retain recovery orchestration without duplicate intake', async () => {
  const env = await config();
  let runtimeChecks = 0;
  env.ADMIN_WORKER = { async fetch() { runtimeChecks++; return Response.json(runtime); } };
  let intakes = 0;
  const legacy = { async fetch(request) {
    intakes++;
    return Response.json({ saved: (await request.json()).events.map(() => ({})) });
  } };
  const redelivery = { ...event(customer), deliveryContext: { isRedelivery: true } };
  const sign = async events => {
    const raw = JSON.stringify({ events });
    return new Request('https://fixture.invalid/webhooks/line', {
      method: 'POST', headers: { 'x-line-signature': await createLineSignature(raw, env.LINE_CHANNEL_SECRET) }, body: raw,
    });
  };

  const single = await handleKenjiSeedLineRequestWithRedeliveryRecovery(await sign([redelivery]), env, null, legacy);
  assert.equal(single.status, 200);
  assert.equal(single.headers.get('x-mmd-kenji-redelivery'), 'recovered');
  assert.equal(intakes, 1);
  assert.equal(runtimeChecks, 2, 'wrapper checks fresh runtime; Seed handler independently checks runtime');

  const mixed = await handleKenjiSeedLineRequestWithRedeliveryRecovery(
    await sign([redelivery, { ...event(), mode: 'standby' }]), env, null, legacy,
  );
  assert.equal(mixed.status, 200);
  assert.equal(mixed.headers.get('x-mmd-kenji-redelivery'), 'recovered');
  assert.equal(intakes, 2, 'one intake for the mixed request, not a bypass plus wrapper intake');
  assert.equal(runtimeChecks, 3, 'multi-event batch skips owner-only runtime precheck and uses Seed runtime check');
});

test('owner opt-in fails closed on runtime or window failure and uses regular wrapper path', async (t) => {
  const env = await config();
  let runtimeChecks = 0;
  env.ADMIN_WORKER = { async fetch() { runtimeChecks++; throw new Error('runtime status unavailable'); } };
  let intakes = 0;
  const legacy = { async fetch(request) {
    intakes++;
    return Response.json({ saved: (await request.json()).events.map(() => ({})) });
  } };
  const raw = JSON.stringify({ events: [event()] });
  const request = new Request('https://fixture.invalid/webhooks/line', {
    method: 'POST', headers: { 'x-line-signature': await createLineSignature(raw, env.LINE_CHANNEL_SECRET) }, body: raw,
  });
  const response = await handleKenjiSeedLineRequestWithRedeliveryRecovery(request, env, null, legacy);
  assert.equal(response.status, 200);
  assert.equal(intakes, 1);
  assert.ok(runtimeChecks >= 2, 'failed wrapper check is closed; regular orchestration and Seed also check runtime');
  assert.equal(env.LINE_AUTO_REPLY_ENABLED, 'false');
  assert.equal(env.LINE_KENJI_MODEL_ENABLED, 'false');

  const expiredEnv = await config();
  expiredEnv.KENJI_LINE_OWNER_CONTEXT_TEST_EXPIRES_AT = new Date(Date.now() - 1).toISOString();
  let expiredIntakes = 0;
  expiredEnv.ADMIN_WORKER = { async fetch() { return Response.json(runtime); } };
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error('unexpected network call in expired owner test'); };
  const expiredRaw = JSON.stringify({ events: [event()] });
  const expiredRequest = new Request('https://fixture.invalid/webhooks/line', {
    method: 'POST', headers: { 'x-line-signature': await createLineSignature(expiredRaw, expiredEnv.LINE_CHANNEL_SECRET) }, body: expiredRaw,
  });
  const expiredResponse = await handleKenjiSeedLineRequestWithRedeliveryRecovery(expiredRequest, expiredEnv, null, {
    async fetch(request, passedEnv) {
      expiredIntakes++;
      assert.equal(passedEnv.KENJI_LINE_OWNER_CONTEXT_TEST_ENABLED, 'false');
      return Response.json({ saved: (await request.json()).events.map(() => ({})) });
    },
  });
  assert.equal(expiredResponse.status, 200);
  assert.equal(expiredIntakes, 1);
});

test('recovered owner redelivery and mixed owner batches keep owner-test OFF downstream', async (t) => {
  const env = await config();
  let runtimeChecks = 0;
  env.ADMIN_WORKER = { async fetch() { runtimeChecks++; return Response.json(runtime); } };
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let outboundCalls = 0;
  globalThis.fetch = async () => { outboundCalls++; throw new Error('unexpected network call in ineligible owner test'); };
  let intakes = 0;
  const legacy = { async fetch(request, passedEnv) {
    intakes++;
    assert.equal(passedEnv.KENJI_LINE_OWNER_CONTEXT_TEST_ENABLED, 'false');
    return Response.json({ saved: (await request.json()).events.map(() => ({})) });
  } };
  const sign = async events => {
    const raw = JSON.stringify({ events });
    return new Request('https://fixture.invalid/webhooks/line', {
      method: 'POST', headers: { 'x-line-signature': await createLineSignature(raw, env.LINE_CHANNEL_SECRET) }, body: raw,
    });
  };

  const ownerRedelivery = { ...event(), deliveryContext: { isRedelivery: true } };
  const recovered = await handleKenjiSeedLineRequestWithRedeliveryRecovery(
    await sign([ownerRedelivery]), env, null, legacy,
  );
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get('x-mmd-kenji-redelivery'), 'recovered');
  assert.equal(intakes, 1);
  assert.equal(runtimeChecks, 2);
  assert.equal(env.KENJI_LINE_OWNER_CONTEXT_TEST_ENABLED, 'true', 'original environment is unchanged');

  const mixed = await handleKenjiSeedLineRequestWithRedeliveryRecovery(
    await sign([event(), { ...event(customer), deliveryContext: { isRedelivery: true } }]), env, null, legacy,
  );
  assert.equal(mixed.status, 200);
  assert.equal(mixed.headers.get('x-mmd-kenji-redelivery'), 'recovered');
  assert.equal(intakes, 2);
  assert.equal(runtimeChecks, 3);

  const ordinaryCustomer = await handleKenjiSeedLineRequestWithRedeliveryRecovery(
    await sign([event(customer)]), env, null, legacy,
  );
  assert.equal(ordinaryCustomer.status, 200);
  assert.equal(intakes, 3);
  assert.ok(runtimeChecks >= 5, 'normal non-owner request checks runtime before reaching Seed');
  assert.equal(outboundCalls, 0, 'ineligible requests do not attempt LINE or other outbound calls');
});

test('eligible singleton owner event retains isolated Seed-only path', async (t) => {
  const env = await config();
  let runtimeChecks = 0;
  env.ADMIN_WORKER = { async fetch() { runtimeChecks++; return Response.json(runtime); } };
  const replies = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://api.line.me/v2/bot/message/reply');
    replies.push(JSON.parse(init.body));
    return Response.json({});
  });
  let intakes = 0;
  const legacy = { async fetch(request, passedEnv) {
    intakes++;
    assert.equal(passedEnv.KENJI_LINE_OWNER_CONTEXT_TEST_ENABLED, 'true');
    return Response.json({ saved: (await request.json()).events.map(() => ({})) });
  } };
  const raw = JSON.stringify({ events: [event()] });
  const request = new Request('https://fixture.invalid/webhooks/line', {
    method: 'POST', headers: { 'x-line-signature': await createLineSignature(raw, env.LINE_CHANNEL_SECRET) }, body: raw,
  });
  const response = await handleKenjiSeedLineRequestWithRedeliveryRecovery(request, env, null, legacy);
  assert.equal(response.status, 200);
  assert.equal(intakes, 1);
  assert.equal(runtimeChecks, 2);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].replyToken, event().replyToken);
});
