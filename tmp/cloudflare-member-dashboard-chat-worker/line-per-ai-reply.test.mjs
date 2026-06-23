import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import worker from "./index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(__dir, "index.js"), "utf-8");
const match = bundle.match(/var LINE_PER_AI_REPLY_COPY = `([\s\S]*?)`;/);
assert.ok(match, "LINE_PER_AI_REPLY_COPY not found in bundle");
const REPLY_COPY = match[1];
const STALE_SIGIL_TRUST_INME_URL = `https://sigil.mmdbkk.com/${["trust", "inme"].join("/")}`;

test("LINE_PER_AI_REPLY_COPY contains canonical renewal URL", () => {
  assert.ok(
    REPLY_COPY.includes("https://mmdbkk.com/sigil/pay/renewal"),
    `Expected canonical URL in reply copy. Got:\n${REPLY_COPY}`
  );
});

test("LINE_PER_AI_REPLY_COPY does not contain stale sigil.mmdbkk.com/trust/inme URL", () => {
  assert.ok(
    !REPLY_COPY.includes(STALE_SIGIL_TRUST_INME_URL),
    "Reply copy must not contain stale sigil.mmdbkk.com/trust/inme"
  );
});

test("LINE_PER_AI_REPLY_COPY does not contain bare /trust/inme as final CTA", () => {
  assert.ok(
    !REPLY_COPY.includes("https://sigil.mmdbkk.com"),
    "Reply copy must not reference sigil.mmdbkk.com host"
  );
});

const ENV = {
  LINE_CHANNEL_ACCESS_TOKEN: "test-line-token",
  AIRTABLE_API_KEY: "test-airtable-token",
  AIRTABLE_BASE_ID: "appTestBase",
};

function textEvent(text, id = "manual") {
  return {
    type: "message",
    webhookEventId: `event-${id}`,
    replyToken: `reply-${id}`,
    source: { userId: "Utest" },
    message: { id: `msg-${id}`, type: "text", text },
  };
}

function postbackEvent(postback, id = "postback") {
  return {
    type: "postback",
    webhookEventId: `event-${id}`,
    replyToken: `reply-${id}`,
    source: { userId: "Utest" },
    postback,
  };
}

async function withFetchStub(run) {
  const originalFetch = globalThis.fetch;
  const lineReplies = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (String(url).includes("api.line.me/v2/bot/message/reply")) {
      lineReplies.push(JSON.parse(String(init.body || "{}")));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("api.airtable.com")) {
      if ((init.method || "GET") === "GET") {
        return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ id: "recLinePerAi" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    return await run({ lineReplies });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function postLineEvent(event) {
  return worker.fetch(
    new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [event] }),
    }),
    ENV,
    {},
  );
}

test("GET /webhooks/line?debug=1 returns canonical LINE webhook health", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/webhooks/line?debug=1"), ENV, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "member-dashboard-chat-worker");
  assert.equal(body.route, "/webhooks/line");
  assert.equal(body.line_ofc_webhook, "canonical_cloudflare_worker");
});

for (const [label, event] of [
  ["manual Hi Per", textEvent("Hi Per", "hi-per")],
  ["manual hi per", textEvent("hi per", "hi-per-lower")],
  ["manual hiper", textEvent("hiper", "hiper")],
  ["manual hello per", textEvent("hello per", "hello-per")],
  ["manual Thai spaced", textEvent("สวัสดี เปอร์", "thai-spaced")],
  ["manual Thai compact", textEvent("สวัสดีเปอร์", "thai-compact")],
  ["Rich Menu postback displayText", postbackEvent({ displayText: "Hi Per", data: "action=rich_menu" }, "postback-display")],
  ["Rich Menu postback encoded data", postbackEvent({ data: "trigger=Hi%20Per" }, "postback-data")],
  ["Rich Menu postback intent data", postbackEvent({ data: "intent=talk_to_per_ai" }, "postback-intent")],
]) {
  test(`${label} routes to Per AI reply`, async () => {
    await withFetchStub(async ({ lineReplies }) => {
      const response = await postLineEvent(event);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.results[0].intent, "talk_to_per_ai");
      assert.equal(body.results[0].replied, true);
      assert.equal(lineReplies.length, 1);
      assert.equal(lineReplies[0].replyToken, event.replyToken);
      assert.match(lineReplies[0].messages[0].text, /เปอร์เองครับ/);
    });
  });
}

test("plain Thai greeting remains non-Per-AI text", async () => {
  await withFetchStub(async ({ lineReplies }) => {
    const response = await postLineEvent(textEvent("สวัสดีครับ", "plain-greeting"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.results[0].ignored, true);
    assert.equal(body.results[0].reason, "not_payment_proof_candidate");
    assert.equal(lineReplies.length, 0);
  });
});
