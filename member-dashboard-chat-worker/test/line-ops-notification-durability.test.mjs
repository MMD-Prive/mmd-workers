import assert from "node:assert/strict";
import test from "node:test";

import {
  OPS_NOTIFICATION_STATUS,
  dispatchOpsNotification,
  drainOpsNotificationOutbox,
  opsOutboxKey,
} from "../src/line-ops-notification-outbox.mjs";

function memoryR2() {
  const store = new Map();
  let sequence = 0;
  return {
    async put(key, value, options = {}) {
      const current = store.get(key);
      const condition = options.onlyIf || null;
      if (condition?.etagDoesNotMatch === "*" && current) return null;
      if (condition?.etagMatches && current?.etag !== condition.etagMatches) return null;
      const etag = `etag-${++sequence}`;
      store.set(key, { value, options, etag });
      return { key, etag };
    },
    async get(key) {
      const found = store.get(key);
      if (!found) return null;
      return {
        etag: found.etag,
        async text() { return typeof found.value === "string" ? found.value : new TextDecoder().decode(found.value); },
      };
    },
    async delete(key) { store.delete(key); },
    async list({ prefix = "", limit = 1000 } = {}) {
      return { objects: [...store.keys()].filter((key) => key.startsWith(prefix)).slice(0, limit).map((key) => ({ key })), truncated: false };
    },
    store,
  };
}

const DESTINATION = { chat_id: "-1003546439681", message_thread_id: 22, flow: "payment_proof" };
function envFor(bucket) { return { LINE_SLIP_EVIDENCE: bucket }; }

async function readRecord(bucket, id) {
  const object = await bucket.get(opsOutboxKey(id));
  return object ? JSON.parse(await object.text()) : null;
}

test("first durable send is recorded delivered", async () => {
  const bucket = memoryR2();
  let sends = 0;
  const result = await dispatchOpsNotification(envFor(bucket), {
    eventKey: "proof-1", purpose: "service_payment_review", destination: DESTINATION, message: "bounded",
  }, { transport: async () => { sends += 1; return { ok: true }; }, now: 1000 });
  assert.equal(result.delivered, true);
  assert.equal(result.status, OPS_NOTIFICATION_STATUS.DELIVERED);
  assert.equal(sends, 1);
  const record = await readRecord(bucket, result.id);
  assert.equal(record.attempts, 1);
  assert.equal(record.destination.owner, "telegram-worker");
});

test("transient failure persists retryable and drain retries rendered message only", async () => {
  const bucket = memoryR2();
  let sends = 0;
  const transport = async () => ({ ok: ++sends > 1, retryable: true, error: "telegram_503" });
  const first = await dispatchOpsNotification(envFor(bucket), {
    eventKey: "proof-2", purpose: "service_payment_review", destination: DESTINATION, message: "bounded",
  }, { transport, now: 1000 });
  assert.equal(first.status, OPS_NOTIFICATION_STATUS.RETRYABLE);
  const drained = await drainOpsNotificationOutbox(envFor(bucket), { transport, now: 5_000_000 });
  assert.equal(drained.retried, 1);
  assert.equal(drained.delivered, 1);
  assert.equal(sends, 2);
  const quiet = await drainOpsNotificationOutbox(envFor(bucket), { transport, now: 6_000_000 });
  assert.equal(quiet.retried, 0);
  assert.equal(sends, 2);
});

test("sequential duplicate semantic event is suppressed", async () => {
  const bucket = memoryR2();
  let sends = 0;
  const input = { eventKey: "proof-3", purpose: "membership_settlement_materialized", destination: DESTINATION, message: "bounded" };
  const transport = async () => { sends += 1; return { ok: true }; };
  const first = await dispatchOpsNotification(envFor(bucket), input, { transport, now: 1000 });
  const replay = await dispatchOpsNotification(envFor(bucket), input, { transport, now: 2000 });
  assert.equal(first.id, replay.id);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.delivered, true);
  assert.equal(sends, 1);
});

test("concurrent duplicate observers acquire one R2 CAS delivery lease", async () => {
  const bucket = memoryR2();
  let sends = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const transport = async () => { sends += 1; await gate; return { ok: true }; };
  const input = { eventKey: "proof-concurrent", purpose: "service_payment_review", destination: DESTINATION, message: "bounded" };
  const first = dispatchOpsNotification(envFor(bucket), input, { transport, now: 1000 });
  const second = dispatchOpsNotification(envFor(bucket), input, { transport, now: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  const results = await Promise.all([first, second]);
  assert.equal(sends, 1);
  assert.equal(results.some((result) => result.delivered === true), true);
  assert.equal(results.some((result) => result.duplicate === true || result.reason === "delivery_in_flight"), true);
});

test("concurrent drain workers also acquire one CAS lease", async () => {
  const bucket = memoryR2();
  let initial = 0;
  const fail = async () => { initial += 1; return { ok: false, retryable: true, error: "telegram_503" }; };
  await dispatchOpsNotification(envFor(bucket), {
    eventKey: "proof-drain-race", purpose: "service_payment_review", destination: DESTINATION, message: "bounded",
  }, { transport: fail, now: 1000 });
  assert.equal(initial, 1);

  let sends = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const success = async () => { sends += 1; await gate; return { ok: true }; };
  const a = drainOpsNotificationOutbox(envFor(bucket), { transport: success, now: 5_000_000 });
  const b = drainOpsNotificationOutbox(envFor(bucket), { transport: success, now: 5_000_000 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  await Promise.all([a, b]);
  assert.equal(sends, 1);
});

test("notification retry never calls payments-worker or Airtable", async () => {
  const bucket = memoryR2();
  const env = {
    ...envFor(bucket),
    PAYMENTS_WORKER: { async fetch() { throw new Error("must_not_run_settlement"); } },
    AIRTABLE_BASE_ID: "must-not-be-used",
  };
  let sends = 0;
  const transport = async () => ({ ok: ++sends > 1, retryable: true, error: "telegram_500" });
  await dispatchOpsNotification(env, {
    eventKey: "proof-no-settlement", purpose: "membership_settlement_materialized", destination: DESTINATION, message: "already rendered",
  }, { transport, now: 1000 });
  const result = await drainOpsNotificationOutbox(env, { transport, now: 5_000_000 });
  assert.equal(result.delivered, 1);
});

test("delivery metadata is bounded and never becomes payment authority", async () => {
  const bucket = memoryR2();
  const result = await dispatchOpsNotification(envFor(bucket), {
    eventKey: "proof-meta", purpose: "service_payment_review", destination: DESTINATION, message: "Amount: 7,500 THB",
  }, { transport: async () => ({ ok: true }), now: 1000 });
  const stored = bucket.store.get(opsOutboxKey(result.id));
  assert.deepEqual(Object.keys(stored.options.customMetadata).sort(), ["attempts", "purpose", "schema", "status"]);
  assert.equal(JSON.stringify(stored.options.customMetadata).includes("7,500"), false);
  const record = await readRecord(bucket, result.id);
  assert.equal(record.authority_note, "notification_only_money_truth_remains_payments_worker");
});
