import assert from "node:assert/strict";
import test from "node:test";

import { enqueueLineSlipCandidates } from "../src/front-gate-slip-queue-shell.js";

function requestFor(events) {
  return new Request("https://mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
  });
}

test("LINE slip Queue producer is disabled unless explicitly enabled", async () => {
  const sent = [];
  const result = await enqueueLineSlipCandidates(requestFor([]), {
    LINE_SLIP_QUEUE_ENABLED: "false",
    LINE_SLIP_INTAKE_QUEUE: { send: async (value) => sent.push(value) },
  });
  assert.equal(result.enabled, false);
  assert.equal(sent.length, 0);
});

test("LINE slip Queue producer emits only minimal image-event identifiers", async () => {
  const sent = [];
  const events = [
    {
      type: "message",
      replyToken: "must-not-leave-webhook",
      source: { type: "user", userId: "U-private-user-id" },
      webhookEventId: "evt-image-1",
      message: { id: "msg-image-1", type: "image", contentProvider: { type: "line" } },
    },
    {
      type: "message",
      replyToken: "text-reply-token",
      source: { type: "user", userId: "U-private-user-id" },
      webhookEventId: "evt-text-1",
      message: { id: "msg-text-1", type: "text", text: "ส่งสลิปแล้ว" },
    },
  ];

  const result = await enqueueLineSlipCandidates(
    requestFor(events),
    {
      LINE_SLIP_QUEUE_ENABLED: "true",
      LINE_SLIP_INTAKE_QUEUE: { send: async (value) => sent.push(value) },
    },
    { now: new Date("2026-09-04T12:00:00.000Z") },
  );

  assert.deepEqual(result, { ok: true, enabled: true, candidates: 1, enqueued: 1 });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    schema: "line_slip_intake_queue_v1",
    line_event_id: "msg-image-1",
    message_id: "msg-image-1",
    webhook_event_id: "evt-image-1",
    enqueued_at: "2026-09-04T12:00:00.000Z",
  });
  const serialized = JSON.stringify(sent[0]);
  assert.doesNotMatch(serialized, /U-private-user-id/);
  assert.doesNotMatch(serialized, /replyToken|reply-token|ส่งสลิป/);
});

test("LINE slip Queue producer fails closed when binding is missing", async () => {
  const result = await enqueueLineSlipCandidates(requestFor([]), {
    LINE_SLIP_QUEUE_ENABLED: "true",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "queue_binding_missing");
});
