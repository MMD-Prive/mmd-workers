import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import worker from "../src/index.js";

const SECRET = "line-secret";
const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";

function sign(body) {
  return createHmac("sha256", SECRET).update(body).digest("base64");
}

function lineWebhookRequest(body, headers = {}) {
  const rawBody = JSON.stringify(body);
  return new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": sign(rawBody),
      ...headers,
    },
    body: rawBody,
  });
}

test("LINE webhook route rejects missing signature instead of 404", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [] }),
  }), { LINE_CHANNEL_SECRET: SECRET });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "line_signature_missing" });
});

test("LINE webhook route accepts valid empty LINE verify payload", async () => {
  const response = await worker.fetch(lineWebhookRequest({ events: [] }), { LINE_CHANNEL_SECRET: SECRET });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, events: 0, processed: [] });
});

test("LINE webhook route logs valid text event to Airtable without auto reply", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: "recLineInbox" }), { status: 200 });
  };

  try {
    const response = await worker.fetch(lineWebhookRequest({
      events: [{
        type: "message",
        replyToken: "reply-token",
        source: { type: "user", userId: LINE_USER_ID },
        message: { id: "msg-1", type: "text", text: "สวัสดีครับ" },
      }],
    }), {
      LINE_CHANNEL_SECRET: SECRET,
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "appBase",
      AIRTABLE_SYNC_TABLE: "MMD — Console Inbox",
      LINE_AUTO_REPLY_ENABLED: "false",
    });

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.events, 1);
    assert.equal(result.processed[0].intent, "greeting");
    assert.equal(result.processed[0].airtable_ok, true);
    assert.equal(result.processed[0].reply_ok, false);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.airtable\.com\/v0\/appBase\//);
    const payload = JSON.parse(calls[0].init.body);
    assert.equal(payload.fields.source, "line");
    assert.equal(payload.fields.intent, "greeting");
    assert.equal(payload.fields.line_user_id, LINE_USER_ID);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE webhook route returns method_not_allowed for GET", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/webhooks/line"), { LINE_CHANNEL_SECRET: SECRET });

  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { ok: false, error: "method_not_allowed" });
});
