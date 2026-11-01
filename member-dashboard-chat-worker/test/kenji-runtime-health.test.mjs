import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const internalHeaders = { authorization: 'Bearer synthetic-internal', 'x-mmd-internal-call': 'true', 'x-mmd-service-binding': 'admin-worker' };
const env = { INTERNAL_TOKEN: 'synthetic-internal', LINE_AUTO_REPLY_ENABLED: 'false', LINE_KENJI_MODEL_ENABLED: 'false', KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: 'false' };

test('runtime flags use the existing internal auth and never leak through public health', async () => {
  for (const [host,headers] of [
    ['member-dashboard-chat-worker.local', {}],
    ['www.mmdbkk.com', internalHeaders],
    ['member-dashboard-chat-worker.local', {...internalHeaders, authorization:'Bearer wrong'}],
    ['member-dashboard-chat-worker.local', {...internalHeaders, 'x-mmd-service-binding':'other-worker'}],
  ]) {
    const response = await worker.fetch(new Request(`https://${host}/health`, {headers}), env, {});
    assert.deepEqual(await response.json(), {ok:true,worker:'member-dashboard-chat-worker'});
  }
});

test('authenticated runtime health reports actual flags without any outbound call or write', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('health must not call LINE, Airtable or any external API');
  try {
    for (const settings of [env, {...env,LINE_AUTO_REPLY_ENABLED:'yes',LINE_KENJI_MODEL_ENABLED:'1',KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED:'on'}]) {
      const response = await worker.fetch(new Request('https://member-dashboard-chat-worker.local/health', {headers:internalHeaders}),settings,{});
      const body=await response.json();
      assert.equal(body.kenji_runtime.schema,'mmd.kenji_runtime_flags.v1');
      const expected=settings.LINE_AUTO_REPLY_ENABLED!=='false';
      assert.equal(body.kenji_runtime.line_auto_reply_enabled,expected);
      assert.equal(body.kenji_runtime.model_reply_enabled,expected);
      assert.equal(body.kenji_runtime.shadow_enabled,expected);
      assert.doesNotMatch(JSON.stringify(body),/synthetic-internal|INTERNAL_TOKEN/);
    }
  } finally { globalThis.fetch=original; }
});
