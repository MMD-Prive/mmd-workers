import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const {
  observeHennaCustomerWatch,
  HENNA_CUSTOMER_WATCH_INTERNALS,
} = await import("../src/mms-line-henna-customer-watch.mjs");

const {
  detectHennaCustomerLane,
  classifyHennaCustomerSignal,
  version,
} = HENNA_CUSTOMER_WATCH_INTERNALS;

async function signedRequest(events, secret = "mms-watch-secret") {
  const body = JSON.stringify({ events });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("base64");
  return new Request("https://mmdbkk.com/webhooks/line/mms", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body,
  });
}

function envWithTelegram(messages = []) {
  return {
    MMS_LINE_CHANNEL_SECRET: "mms-watch-secret",
    AUTH_SERVICE_LINE_TO_TELEGRAM: "line-to-telegram-test",
    TELEGRAM_WORKER: {
      async fetch(request) {
        assert.equal(request.headers.get("authorization"), "Bearer line-to-telegram-test");
        const body = await request.json();
        messages.push(body);
        return Response.json({ ok: true, telegram: { ok: true } });
      },
    },
  };
}

test("MMS front gate schedules HENNA customer watch observer from the canonical ingress", async () => {
  const source = await readFile(new URL("../src/mms-line-front-gate-runtime.js", import.meta.url), "utf8");
  assert.match(source, /observeHennaCustomerWatch/);
  assert.match(source, /observeHennaCustomerWatch\(request\.clone\(\), env\)/);
  assert.match(source, /ctx\?\.waitUntil/);
});

test("HENNA customer watch version is owner phase-1 lock", () => {
  assert.equal(version, "henna-customer-watch-mms-wms-v1-20261001");
});

test("WMS lane is explicit-only and defaults to MMS without explicit women signal", () => {
  assert.equal(detectHennaCustomerLane("อยากจองนวดพรุ่งนี้"), "mms");
  assert.equal(detectHennaCustomerLane("อยากจอง Women Massage พรุ่งนี้"), "wms");
  assert.equal(detectHennaCustomerLane("ลูกค้าผู้หญิงอยากนวด"), "wms");
  assert.equal(detectHennaCustomerLane("ชื่อ May อยากจองนวด"), "mms");
});

test("customer watch recognizes actionable customer signals but ignores greeting-only noise", () => {
  assert.equal(classifyHennaCustomerSignal("อยากจองนวดพรุ่งนี้"), "booking_interest");
  assert.equal(classifyHennaCustomerSignal("คืนนี้ใครว่าง ราคาเท่าไหร่"), "live_truth_request");
  assert.equal(classifyHennaCustomerSignal("งานมีปัญหา therapist ไม่มา"), "service_recovery");
  assert.equal(classifyHennaCustomerSignal("อยากคุยกับพี่เปอร์"), "human_handoff");
  assert.equal(classifyHennaCustomerSignal("สวัสดีครับ"), "");
});

test("explicit WMS booking sends privacy-safe Telegram customer watch without raw text or LINE id", async () => {
  const messages = [];
  const rawText = "ลูกค้าผู้หญิงอยากจอง Women Massage พรุ่งนี้";
  const rawUserId = "U1234567890abcdef1234567890abcdef";
  const request = await signedRequest([{
    type: "message",
    replyToken: "reply-token",
    webhookEventId: "webhook-evt-1",
    deliveryContext: { isRedelivery: false },
    source: { type: "user", userId: rawUserId },
    message: { type: "text", id: "message-001", text: rawText },
  }]);

  const result = await observeHennaCustomerWatch(request, envWithTelegram(messages));
  assert.equal(result.ok, true);
  assert.equal(result.notified, 1);
  assert.equal(result.lanes.wms, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].flow, "henna_customer_watch");
  assert.match(messages[0].text, /CUSTOMER WATCH · WMS/);
  assert.match(messages[0].text, /Signal: booking_interest/);
  assert.match(messages[0].text, /business_truth_mutated=false/);
  assert.equal(messages[0].text.includes(rawText), false);
  assert.equal(messages[0].text.includes(rawUserId), false);
});

test("generic MMS booking remains MMS and redelivery is not notified twice", async () => {
  const messages = [];
  const events = [{
    type: "message",
    replyToken: "reply-token-2",
    webhookEventId: "webhook-evt-2",
    deliveryContext: { isRedelivery: false },
    source: { type: "user", userId: "Uabcdefabcdefabcdefabcdefabcdefab" },
    message: { type: "text", id: "message-002", text: "อยากจองนวดพรุ่งนี้" },
  }, {
    type: "message",
    replyToken: "reply-token-3",
    webhookEventId: "webhook-evt-3",
    deliveryContext: { isRedelivery: true },
    source: { type: "user", userId: "Uabcdefabcdefabcdefabcdefabcdefab" },
    message: { type: "text", id: "message-003", text: "อยากจองนวดพรุ่งนี้" },
  }];

  const result = await observeHennaCustomerWatch(await signedRequest(events), envWithTelegram(messages));
  assert.equal(result.notified, 1);
  assert.equal(result.lanes.mms, 1);
  assert.equal(result.skipped, 1);
  assert.match(messages[0].text, /CUSTOMER WATCH · MMS/);
});
