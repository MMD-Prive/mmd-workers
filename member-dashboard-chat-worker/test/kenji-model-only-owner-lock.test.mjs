import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker, { createLineSignature, kenjiLineModelOnlyAllowsReply } from "../src/index.js";

test("owner model-only gate allows only direct Model lookup continuations", () => {
  assert.equal(kenjiLineModelOnlyAllowsReply({ intent: "model_lookup", modelIntent: { query: "Jasper" } }), true);
  assert.equal(kenjiLineModelOnlyAllowsReply({ intent: "model_access_verification", modelIntent: {} }), true);
  assert.equal(kenjiLineModelOnlyAllowsReply({ intent: "card_campaign_lead", modelIntent: { query: "EMs11", campaign_trigger: { card_trigger: "EMs11" } } }), true);

  for (const intent of [
    "payment",
    "membership",
    "service",
    "booking",
    "availability",
    "note_only",
    "refund_request",
    "card_campaign_brief",
  ]) {
    assert.equal(kenjiLineModelOnlyAllowsReply({ intent, modelIntent: {} }), false, intent);
  }
});

test("production config keeps broad First Contact off while general replies stay off and the rights exception is enabled", async () => {
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /KENJI_LINE_MODEL_ONLY_ENABLED\s*=\s*"true"/);
  assert.match(wrangler, /LINE_FIRST_CONTACT_ENABLED\s*=\s*"false"/);
  assert.match(wrangler, /LINE_AUTO_REPLY_ENABLED\s*=\s*"false"/);
  assert.match(wrangler, /KENJI_LINE_RIGHTS_COMMAND_ENABLED\s*=\s*"true"/);
});


const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const TRANSPORT_ENV = {
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
  LINE_KENJI_MODEL_ENABLED: "false",
  LINE_KENJI_KNOWLEDGE_ENABLED: "false",
  KENJI_LINE_MODEL_ONLY_ENABLED: "true",
  INTERNAL_TOKEN: "runtime-token",
  ADMIN_WORKER: {
    fetch: async () => Response.json({
      ok: true,
      controls: {
        line_oa_auto_reply: false,
        model_keyword_auto_reply: false,
        all_kenji_mutations: false,
      },
    }),
  },
};

async function signedWebhook(event) {
  const raw = JSON.stringify({ events: [event] });
  const signature = await createLineSignature(raw, TRANSPORT_ENV.LINE_CHANNEL_SECRET);
  return new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": signature,
    },
    body: raw,
  });
}

function customerTextEvent(text, index) {
  return {
    type: "message",
    mode: "active",
    replyToken: `reply-token-${index}`,
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: `msg-owner-lock-${index}`, type: "text", text },
  };
}

test("production model-only lock suppresses ordinary LINE replies at transport", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.includes("/profile/")) return Response.json({ displayName: "Test Member" });
    if (href.includes("/message/reply")) return Response.json({ ok: true });
    return Response.json({ ok: true });
  };

  try {
    const cases = [
      "5555 กลัวติดน้ำ",
      "โออี้",
      "",
      "อยากจองคืนนี้",
      "โอนแล้ว",
      "สมาชิกมีอะไรบ้าง",
    ];

    for (const [index, text] of cases.entries()) {
      calls.length = 0;
      const response = await worker.fetch(await signedWebhook(customerTextEvent(text, index)), TRANSPORT_ENV);
      assert.equal(response.status, 200, text || "<empty>");
      const payload = await response.json();
      assert.equal(payload.saved?.[0]?.replied, false, text || "<empty>");
      assert.equal(
        calls.filter((call) => call.url.includes("/message/reply")).length,
        0,
        text || "<empty>",
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
