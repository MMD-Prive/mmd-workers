import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKenjiLineIngressSnapshot,
  handleKenjiLineWithIngressTrace,
} from "../src/kenji-line-ingress-trace.mjs";

async function withFetch(mock, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("LINE ingress snapshot hashes identifiers and excludes raw customer payload", async () => {
  const rawDestination = "U-destination-raw-secret";
  const rawUserId = "Uraw-user-id-do-not-store";
  const rawReplyToken = "reply-token-do-not-store";
  const rawWebhookEventId = "01RAW-WEBHOOK-EVENT-ID";
  const rawMessage = "ขอเช็กสถานะสมาชิกหน่อยครับ secret-body";
  const rawSignature = "raw-line-signature-value";
  const raw = JSON.stringify({
    destination: rawDestination,
    events: [{
      type: "message",
      mode: "active",
      replyToken: rawReplyToken,
      webhookEventId: rawWebhookEventId,
      deliveryContext: { isRedelivery: false },
      source: { type: "user", userId: rawUserId },
      message: { id: "msg-privacy", type: "text", text: rawMessage },
    }],
  });
  const request = new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": rawSignature },
    body: raw,
  });

  const snapshot = await buildKenjiLineIngressSnapshot(request, raw, "2026-09-07T15:45:00.000Z");
  const serialized = JSON.stringify(snapshot);
  assert.equal(snapshot.event_count, 1);
  assert.equal(snapshot.event_type, "message");
  assert.equal(snapshot.event_mode, "active");
  assert.equal(snapshot.source_type, "user");
  assert.equal(snapshot.message_type, "text");
  assert.equal(snapshot.signature_present, true);
  assert.equal(snapshot.destination_hash.length, 24);
  assert.equal(snapshot.webhook_event_id_hash.length, 24);
  for (const forbidden of [rawDestination, rawUserId, rawReplyToken, rawWebhookEventId, rawMessage, rawSignature]) {
    assert.equal(serialized.includes(forbidden), false, `ingress snapshot leaked ${forbidden}`);
  }
});

test("LINE ingress trace persists before handler without mutating signed request", async () => {
  const env = {
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_TABLE_LINE_WEBHOOK_INGRESS_TRACE_ID: "tblPpkRvqCoTKVlzj",
    KENJI_LINE_INGRESS_TRACE_ENABLED: "true",
  };
  const rawDestination = "Udestination-private";
  const rawUserId = "Ucustomer-private";
  const rawReplyToken = "reply-private";
  const rawWebhookEventId = "webhook-private";
  const rawMessage = "ข้อความลูกค้าที่ห้ามเข้า trace";
  const rawSignature = "signed-header-must-remain-identical";
  const raw = JSON.stringify({
    destination: rawDestination,
    events: [{
      type: "message",
      mode: "standby",
      replyToken: rawReplyToken,
      webhookEventId: rawWebhookEventId,
      deliveryContext: { isRedelivery: false },
      source: { type: "user", userId: rawUserId },
      message: { id: "msg-ingress-test", type: "text", text: rawMessage },
    }],
  });
  const request = new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": rawSignature },
    body: raw,
  });
  const waitUntil = [];
  const writes = { create: null, complete: null };
  let handlerBody = "";
  let handlerSignature = "";

  const response = await withFetch(async (url, init = {}) => {
    const target = String(url);
    assert.match(target, /tblPpkRvqCoTKVlzj/);
    if (init.method === "POST") {
      writes.create = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "rec-ingress-trace" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (init.method === "PATCH") {
      writes.complete = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "rec-ingress-trace" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${target}`);
  }, () => handleKenjiLineWithIngressTrace({
    request,
    env,
    ctx: { waitUntil: (promise) => waitUntil.push(promise) },
    handler: async (originalRequest) => {
      handlerSignature = originalRequest.headers.get("x-line-signature") || "";
      handlerBody = await originalRequest.text();
      return new Response("handler-ok", {
        status: 202,
        headers: {
          "x-mmd-worker": "member-dashboard-chat-worker",
          "x-mmd-kenji-runtime": "seed-pack-v1",
          "x-mmd-kenji-intent-refined": "membership_status",
        },
      });
    },
  }));

  await Promise.allSettled(waitUntil);
  assert.equal(response.status, 202);
  assert.equal(await response.text(), "handler-ok");
  assert.equal(handlerBody, raw);
  assert.equal(handlerSignature, rawSignature);
  assert.equal(writes.create?.fields?.event_mode, "standby");
  assert.equal(writes.create?.fields?.trace_status, "ingress_captured");
  assert.equal(writes.complete?.fields?.handler_status, 202);
  assert.equal(writes.complete?.fields?.handler_runtime, "seed-pack-v1");
  assert.equal(writes.complete?.fields?.intent_refined, "membership_status");
  assert.equal(writes.complete?.fields?.runtime_entered, true);
  assert.equal(writes.complete?.fields?.trace_status, "completed");

  const persisted = JSON.stringify([writes.create, writes.complete]);
  for (const forbidden of [rawDestination, rawUserId, rawReplyToken, rawWebhookEventId, rawMessage, rawSignature]) {
    assert.equal(persisted.includes(forbidden), false, `persisted ingress trace leaked ${forbidden}`);
  }
});

test("LINE ingress trace persistence failure never blocks canonical handler", async () => {
  const env = {
    AIRTABLE_API_KEY: "airtable-token",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    KENJI_LINE_INGRESS_TRACE_ENABLED: "true",
  };
  const request = new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "present" },
    body: JSON.stringify({ events: [] }),
  });
  const pending = [];
  let handlerCalls = 0;

  const response = await withFetch(async () => {
    throw new Error("airtable unavailable");
  }, () => handleKenjiLineWithIngressTrace({
    request,
    env,
    ctx: { waitUntil: (promise) => pending.push(promise) },
    handler: async () => {
      handlerCalls += 1;
      return new Response("still-ok", { status: 200 });
    },
  }));

  await Promise.allSettled(pending);
  assert.equal(handlerCalls, 1);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "still-ok");
});
