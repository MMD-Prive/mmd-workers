import test from "node:test";
import assert from "node:assert/strict";

import { KenjiModelIdempotency } from "../src/kenji-model-idempotency.js";
import {
  aggregateKenjiLineTurn,
  prepareKenjiLineWebhookBatch,
} from "../src/kenji-line-turn-aggregation.mjs";

const USER_A = "U1234567890abcdef1234567890abcdef";
const USER_B = "Uabcdef1234567890abcdef1234567890";

function event(id, text, userId = USER_A) {
  return {
    type: "message",
    mode: "active",
    replyToken: `reply-${id}`,
    source: { type: "user", userId },
    message: { id, type: "text", text },
    timestamp: Date.now(),
  };
}

function storage() {
  const values = new Map();
  let alarm = null;
  const api = {
    async get(key) { return values.get(key); },
    async put(key, value) { values.set(key, value); },
    async delete(keyOrKeys) {
      for (const key of Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]) values.delete(key);
    },
    async list({ prefix } = {}) {
      return new Map([...values].filter(([key]) => !prefix || key.startsWith(prefix)));
    },
    async getAlarm() { return alarm; },
    async setAlarm(value) { alarm = value; },
    async transaction(callback) {
      return callback({ get: api.get, put: api.put, delete: api.delete });
    },
  };
  return api;
}

function namespace() {
  const objects = new Map();
  return {
    idFromName(name) { return name; },
    get(id) {
      if (!objects.has(id)) objects.set(id, new KenjiModelIdempotency({ storage: storage() }));
      return { fetch: (input, init) => objects.get(id).fetch(input instanceof Request ? input : new Request(String(input), init)) };
    },
  };
}

test("same-user text events in one LINE webhook become one reasoning turn", () => {
  const prepared = prepareKenjiLineWebhookBatch([
    event("msg-1", "คืนนี้"),
    event("msg-2", "อยากได้คนเดิม"),
  ]);
  assert.equal(prepared.length, 2);
  assert.equal(prepared[0].suppressed, true);
  assert.equal(prepared[1].suppressed, false);
  assert.equal(prepared[1].aggregate_count, 2);
  assert.equal(prepared[1].turn_event.message.text, "คืนนี้\nอยากได้คนเดิม");
  assert.equal(prepared[1].turn_event.message.id, "msg-2");
  assert.equal(prepared[1].turn_event.replyToken, "reply-msg-2");
});

test("different LINE users never share an aggregated turn", () => {
  const prepared = prepareKenjiLineWebhookBatch([
    event("msg-a", "A", USER_A),
    event("msg-b", "B", USER_B),
  ]);
  assert.equal(prepared[0].suppressed, false);
  assert.equal(prepared[1].suppressed, false);
  assert.equal(prepared[0].turn_event.message.text, "A");
  assert.equal(prepared[1].turn_event.message.text, "B");
});

test("turn buffer makes only the latest event answer and joins the bounded burst", async () => {
  const object = new KenjiModelIdempotency({ storage: storage() });
  const call = async (body) => {
    const response = await object.fetch(new Request("https://kenji-model-dedupe.internal/line-turn-buffer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    return response.json();
  };

  assert.equal((await call({ action: "put", event_id: "msg-1", text: "คืนนี้", received_at: 1000, window_ms: 2200, max_messages: 4 })).stored, true);
  assert.equal((await call({ action: "put", event_id: "msg-1", text: "คืนนี้", received_at: 1000, window_ms: 2200, max_messages: 4 })).duplicate, true);
  assert.equal((await call({ action: "put", event_id: "msg-2", text: "คนเดิมครับ", received_at: 1100, window_ms: 2200, max_messages: 4 })).stored, true);

  const originalNow = Date.now;
  Date.now = () => 1200;
  try {
    const first = await call({ action: "claim", event_id: "msg-1", window_ms: 2200, max_messages: 4 });
    assert.equal(first.should_reply, false);
    assert.equal(first.superseded, true);

    const second = await call({ action: "claim", event_id: "msg-2", window_ms: 2200, max_messages: 4 });
    assert.equal(second.should_reply, true);
    assert.equal(second.aggregate_text, "คืนนี้\nคนเดิมครับ");
    assert.equal(second.count, 2);
  } finally {
    Date.now = originalNow;
  }
});

test("aggregation module fails open when its Durable Object binding is unavailable", async () => {
  const result = await aggregateKenjiLineTurn({
    env: { KENJI_LINE_MESSAGE_AGGREGATION_ENABLED: "true" },
    event: event("msg-open", "ทักครับ"),
  });
  assert.equal(result.should_reply, true);
  assert.equal(result.source, "binding_unavailable");
  assert.equal(result.event.message.text, "ทักครับ");
});

test("aggregation module stores and claims through the per-user Durable Object", async () => {
  const result = await aggregateKenjiLineTurn({
    env: {
      KENJI_LINE_MESSAGE_AGGREGATION_ENABLED: "true",
      KENJI_LINE_MESSAGE_AGGREGATION_WAIT_MS: "0",
      KENJI_LINE_MESSAGE_AGGREGATION_WINDOW_MS: "2200",
      KENJI_LINE_MESSAGE_AGGREGATION_MAX_MESSAGES: "4",
      KENJI_MODEL_DEDUPE: namespace(),
    },
    event: event("msg-one", "ข้อความเดียว"),
  });
  assert.equal(result.should_reply, true);
  assert.equal(result.event.message.text, "ข้อความเดียว");
  assert.equal(result.count, 1);
});
