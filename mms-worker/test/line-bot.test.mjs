import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  classifyHennaIntent,
  handleMmsLineWebhook,
  hennaReply,
  lineBotStatus,
} from "../src/line-bot.mjs";

const ENV = {
  LINE_CHANNEL_SECRET: "mms-line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "mms-line-token",
  MMS_LINE_CHANNEL_ID: "2011386859",
  LINE_AUTO_REPLY_ENABLED: "false",
};

test("HENNA exposes fail-closed configuration status", () => {
  assert.deepEqual(lineBotStatus(ENV), {
    configured: true,
    channel_id: "2011386859",
    auto_reply_enabled: false,
    persona: "HENNA",
  });
});

test("HENNA separates stable replies from manual-only decisions", () => {
  assert.equal(classifyHennaIntent("อยากจองนวดพรุ่งนี้"), "booking");
  assert.equal(classifyHennaIntent("มีบริการอะไรบ้าง"), "services");
  assert.equal(classifyHennaIntent("อยากสมัครเป็น therapist"), "apply");
  assert.equal(classifyHennaIntent("ราคาเท่าไหร่"), "manual_price");
  assert.equal(classifyHennaIntent("วันนี้ใครว่าง"), "manual_availability");
  assert.equal(classifyHennaIntent("ขอคุยกับพี่เปอร์"), "manual_handoff");
  assert.equal(classifyHennaIntent("คำถามที่ไม่มีข้อมูลยืนยัน"), "manual_unknown");
  assert.match(hennaReply("booking"), /พี่เฮนน่า/);
  assert.equal(hennaReply("manual_price"), "");
});

test("LINE webhook rejects an invalid signature", async () => {
  const request = new Request("https://worker/mms/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "wrong" },
    body: JSON.stringify({ events: [] }),
  });
  const result = await handleMmsLineWebhook(request, ENV);
  assert.equal(result.status, 401);
  assert.equal((await result.json()).error, "invalid_signature");
});

test("auto reply remains silent while the production gate is disabled", async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    return Response.json({ ok: true });
  };
  try {
    const body = JSON.stringify({ events: [{
      type: "message",
      replyToken: "reply-token",
      source: { type: "user", userId: "U-private" },
      message: { id: "msg-1", type: "text", text: "อยากจองบริการ" },
    }] });
    const request = signedRequest(body);
    const result = await handleMmsLineWebhook(request, ENV);
    const payload = await result.json();
    assert.equal(result.status, 200);
    assert.equal(payload.results[0].action, "no_reply");
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enabled HENNA replies only to stable intents", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return Response.json({}, { status: 200 });
  };
  try {
    const body = JSON.stringify({ events: [{
      type: "message",
      replyToken: "reply-token",
      source: { type: "user", userId: "U-private" },
      message: { id: "msg-2", type: "text", text: "มีบริการอะไรบ้าง" },
    }] });
    const result = await handleMmsLineWebhook(signedRequest(body), { ...ENV, LINE_AUTO_REPLY_ENABLED: "true" });
    assert.equal(result.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.line\.me\/v2\/bot\/message\/reply/);
    assert.equal(JSON.stringify(calls[0].body).includes("U-private"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function signedRequest(body) {
  const signature = crypto.createHmac("sha256", ENV.LINE_CHANNEL_SECRET).update(body).digest("base64");
  return new Request("https://worker/mms/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body,
  });
}
