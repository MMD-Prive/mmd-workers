import assert from "node:assert/strict";
import test from "node:test";

import { createLineSignature } from "../src/index.js";
import { buildKenjiSeedRuntimeEnv } from "../src/mms-line-front-gate.js";
import { handleKenjiSeedLineRequestWithRedeliveryRecovery } from "../src/kenji-line-redelivery-recovery.mjs";

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

async function withFetch(mock, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function redeliveryEnv() {
  return {
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID: "tblsLd1uVOtG2kHoU",
    AIRTABLE_TABLE_AI_MESSAGE_EVENTS_ID: "tbljCYfYqfm8gBTPq",
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    LINE_AUTO_REPLY_ENABLED: "true",
    LINE_KENJI_AI_ENABLED: "true",
    LINE_KENJI_KNOWLEDGE_ENABLED: "true",
    KENJI_LINE_CONTINUITY_ENABLED: "false",
    INTERNAL_TOKEN: "internal-token",
    ADMIN_WORKER: {
      fetch: async () => new Response(JSON.stringify({
        ok: true,
        controls: {
          line_oa_auto_reply: false,
          model_keyword_auto_reply: false,
          all_kenji_mutations: false,
        },
      }), { status: 200, headers: { "content-type": "application/json" } }),
    },
  };
}

function redeliveryEvent(id = "msg-redelivery") {
  return {
    type: "message",
    mode: "active",
    replyToken: `reply-${id}`,
    webhookEventId: `webhook-${id}`,
    deliveryContext: { isRedelivery: true },
    source: { type: "user", userId: "U1234567890abcdef1234567890abcdef" },
    message: { id, type: "text", text: "สมัครสมาชิก" },
  };
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

test("unseen LINE redelivery is recovered and can reply once", async () => {
  const env = redeliveryEnv();
  const lineEvent = redeliveryEvent("msg-redelivery-unseen");
  const raw = JSON.stringify({ events: [lineEvent] });
  const signature = await createLineSignature(raw, env.LINE_CHANNEL_SECRET);
  const calls = { line: 0, telemetryPost: 0, aiReads: 0, knowledgeReads: 0 };
  const legacyWorker = { fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) };

  const response = await withFetch(async (url, init = {}) => {
    const target = String(url);
    if (target.includes("tbljCYfYqfm8gBTPq")) {
      if (init.method === "POST") {
        calls.telemetryPost += 1;
        return new Response(JSON.stringify({ id: "rec-redelivery-telemetry" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      calls.aiReads += 1;
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.includes("tblsLd1uVOtG2kHoU")) {
      calls.knowledgeReads += 1;
      return new Response(JSON.stringify({ records: [{ id: "rec-card", fields: {
        knowledge_id: "kenji_seed_v1_membership_01",
        customer_answer: "เริ่มจาก My MMD > Membership ได้ครับ",
        allowed_channels: ["LINE_OFC"],
        status: "active",
        response_mode: "auto_reply_allowed",
        risk_level: "low",
        source_path: "/member/membership",
      } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.includes("api.line.me/v2/bot/message/reply")) {
      calls.line += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.replyToken, "reply-msg-redelivery-unseen");
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected fetch ${target}`);
  }, () => handleKenjiSeedLineRequestWithRedeliveryRecovery(
    new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signature },
      body: raw,
    }),
    env,
    null,
    legacyWorker,
  ));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-kenji-redelivery"), "recovered");
  assert.equal(body.saved[0].replied, true);
  assert.equal(calls.line, 1);
  assert.equal(calls.telemetryPost, 1);
  assert.ok(calls.aiReads >= 2, "recovery and telemetry dedupe should both inspect AI Message Events");
  assert.equal(calls.knowledgeReads, 1);
});

test("completed LINE redelivery remains deduped and never replies twice", async () => {
  const env = redeliveryEnv();
  const lineEvent = redeliveryEvent("msg-redelivery-complete");
  const raw = JSON.stringify({ events: [lineEvent] });
  const signature = await createLineSignature(raw, env.LINE_CHANNEL_SECRET);
  let lineCalls = 0;
  let telemetryPosts = 0;
  const existing = {
    id: "rec-existing",
    fields: {
      final_status: "sent",
      handoff_required: false,
      payload_json: JSON.stringify({ line_delivery_attempted: true, line_delivery_succeeded: true }),
    },
  };

  const response = await withFetch(async (url, init = {}) => {
    const target = String(url);
    if (target.includes("tbljCYfYqfm8gBTPq")) {
      if (init.method === "POST") telemetryPosts += 1;
      return new Response(JSON.stringify({ records: [existing] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.includes("api.line.me/v2/bot/message/reply")) {
      lineCalls += 1;
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected fetch ${target}`);
  }, () => handleKenjiSeedLineRequestWithRedeliveryRecovery(
    new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signature },
      body: raw,
    }),
    env,
    null,
    { fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) },
  ));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.saved[0].replied, false);
  assert.equal(body.saved[0].reply_source, "silent");
  assert.equal(lineCalls, 0);
  assert.equal(telemetryPosts, 0);
});

test("natural membership status LINE request is refined into protected membership_status intent", async () => {
  const env = redeliveryEnv();
  const lineEvent = {
    ...redeliveryEvent("msg-membership-status-natural"),
    deliveryContext: { isRedelivery: false },
    message: {
      id: "msg-membership-status-natural",
      type: "text",
      text: "ขอเช็กสถานะสมาชิกหน่อยครับ",
    },
  };
  const raw = JSON.stringify({ events: [lineEvent] });
  const signature = await createLineSignature(raw, env.LINE_CHANNEL_SECRET);
  let lineCalls = 0;
  let telemetryPayload = null;
  let sentReply = "";

  const response = await withFetch(async (url, init = {}) => {
    const target = String(url);
    if (target.includes("tbljCYfYqfm8gBTPq")) {
      if (init.method === "POST") {
        telemetryPayload = JSON.parse(init.body);
        return new Response(JSON.stringify({ id: "rec-membership-status" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.includes("tblsLd1uVOtG2kHoU")) {
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.includes("api.line.me/v2/bot/message/reply")) {
      lineCalls += 1;
      const body = JSON.parse(init.body);
      sentReply = body?.messages?.[0]?.text || "";
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected fetch ${target}`);
  }, () => handleKenjiSeedLineRequestWithRedeliveryRecovery(
    new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signature },
      body: raw,
    }),
    env,
    null,
    { fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) },
  ));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-kenji-intent-refined"), "membership_status");
  assert.equal(body.saved[0].intent, "membership_status");
  assert.equal(body.saved[0].handoff_required, true);
  assert.notEqual(body.saved[0].reply_source, "seed_knowledge");
  assert.equal(body.saved[0].replied, true);
  assert.equal(lineCalls, 1);
  assert.match(sentReply, /สถานะ|My MMD/i);
  const telemetry = JSON.parse(telemetryPayload?.fields?.payload_json || "{}");
  assert.equal(telemetry.exact_intent, "membership_status");
});
