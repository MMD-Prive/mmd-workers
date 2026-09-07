import assert from "node:assert/strict";
import test from "node:test";

import { createLineSignature } from "../src/index.js";
import { buildKenjiSeedRuntimeEnv } from "../src/mms-line-front-gate.js";

function cloudflareStyleEnv(values = {}) {
  let runtimeEnv;
  runtimeEnv = new Proxy({ ...values }, {
    get(target, property, receiver) {
      // Model a runtime binding container that only resolves bindings when the
      // original env object is the receiver. Object.create(env) therefore
      // loses bindings even though direct env access works.
      if (receiver !== runtimeEnv) return undefined;
      return Reflect.get(target, property, target);
    },
    has(target, property) {
      return Reflect.has(target, property);
    },
  });
  return runtimeEnv;
}

test("Kenji runtime env preserves Cloudflare-style secret and service bindings", async () => {
  const adminWorker = { fetch: async () => new Response(JSON.stringify({ ok: true, controls: {} }), { status: 200 }) };
  const env = cloudflareStyleEnv({
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    INTERNAL_TOKEN: "internal-token",
    ADMIN_WORKER: adminWorker,
  });

  const prototypeWrapper = Object.create(env);
  assert.equal(prototypeWrapper.LINE_CHANNEL_SECRET, undefined, "regression fixture must reproduce prototype binding loss");

  const runtimeEnv = buildKenjiSeedRuntimeEnv(env);
  assert.equal(runtimeEnv.LINE_CHANNEL_SECRET, "line-secret");
  assert.equal(runtimeEnv.LINE_CHANNEL_ACCESS_TOKEN, "line-token");
  assert.equal(runtimeEnv.AIRTABLE_API_KEY, "airtable-token");
  assert.equal(runtimeEnv.AIRTABLE_BASE_ID, "appsV1ILPRfIjkaYg");
  assert.equal(runtimeEnv.INTERNAL_TOKEN, "internal-token");
  assert.notEqual(runtimeEnv.ADMIN_WORKER, adminWorker, "runtime-status proxy should override only ADMIN_WORKER");

  const signature = await createLineSignature('{"events":[]}', runtimeEnv.LINE_CHANNEL_SECRET);
  assert.ok(signature.length > 20, "signature verifier must still see the production LINE secret");
});

test("Kenji runtime env uses a local status sentinel without hiding unrelated bindings", () => {
  const env = cloudflareStyleEnv({
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    ADMIN_WORKER: { fetch: async () => new Response("{}") },
  });

  const runtimeEnv = buildKenjiSeedRuntimeEnv(env);
  assert.equal(runtimeEnv.INTERNAL_TOKEN, "service-binding-runtime-status");
  assert.equal(runtimeEnv.LINE_CHANNEL_SECRET, "line-secret");
  assert.equal(runtimeEnv.LINE_CHANNEL_ACCESS_TOKEN, "line-token");
  assert.equal(runtimeEnv.AIRTABLE_API_KEY, "airtable-token");
});
