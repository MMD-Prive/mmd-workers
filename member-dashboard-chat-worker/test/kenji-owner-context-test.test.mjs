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

test('signed mixed batch only replies to owner; invalid signatures never reach intake; no action/model network', async () => {
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
  const events = [event(customer), event(), { ...event(), deliveryContext: { isRedelivery: true } }];
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
    assert.deepEqual(body.saved.map(turn => turn.replied), [false, true, false]);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].replyToken, event().replyToken);
    assert.match(replies[0].messages[0].text, /ยังไม่ยืนยันว่าตรงปก/);
    assert.equal(env.LINE_AUTO_REPLY_ENABLED, 'false');
    assert.equal(env.LINE_KENJI_MODEL_ENABLED, 'false');
    assert.equal(runtime.controls.model_keyword_auto_reply, true);
  } finally { globalThis.fetch = original; }
});
