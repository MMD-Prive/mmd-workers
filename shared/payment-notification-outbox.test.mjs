import test from "node:test";
import assert from "node:assert/strict";
import { dispatchPaymentNotification, drainPaymentNotifications } from "./payment-notification-outbox.mjs";
import { withPaymentEvidenceLock } from "./canonical-payment-evidence.mjs";
import { memoryR2 } from "./test/payment-memory-r2.mjs";

test("outage survives a new invocation and retains each acknowledged recipient", async () => {
  const bucket = memoryR2();
  const calls = { customer: 0, model: 0 };
  let healthy = false;
  const deliver = async (record, checkpoint) => {
    assert.ok([...bucket.objects.keys()].some((key) => key.includes("/records/")), "enqueue precedes transport");
    if (!record.state.customer) {
      calls.customer++;
      await checkpoint({ customer: true });
    }
    calls.model++;
    return { ok: healthy };
  };
  const first = await dispatchPaymentNotification({ bucket, lane: "test", eventKey: "approved-1", payload: {}, deliver, now: 1000 });
  assert.equal(first.queued, true);
  assert.deepEqual(calls, { customer: 1, model: 1 });
  healthy = true;
  await drainPaymentNotifications({ bucket, lane: "test", deliver, now: 62000 });
  assert.deepEqual(calls, { customer: 1, model: 2 });
  const duplicate = await dispatchPaymentNotification({ bucket, lane: "test", eventKey: "approved-1", payload: {}, deliver, now: 70000 });
  assert.equal(duplicate.delivered, true);
  assert.deepEqual(calls, { customer: 1, model: 2 });
});

test("simultaneous dispatches take one conditional lease", async () => {
  const bucket = memoryR2();
  let sends = 0;
  const deliver = async () => { sends++; return { ok: true }; };
  await Promise.all(Array.from({ length: 6 }, () => dispatchPaymentNotification({ bucket, lane: "race", eventKey: "same", payload: {}, deliver })));
  assert.equal(sends, 1);
});

test("sweep pagination reaches failed deliveries behind old receipts", async () => {
  const bucket = memoryR2();
  let healthy = false;
  let retrySends = 0;
  const deliver = async (record) => {
    if (record.payload.retry) retrySends++;
    return { ok: record.payload.retry ? healthy : true };
  };
  for (let n = 0; n < 7; n++) await dispatchPaymentNotification({ bucket, lane: "paged", eventKey: String(n), payload: { retry: n === 6 }, deliver, now: 1000 });
  healthy = true;
  for (let n = 0; n < 4; n++) await drainPaymentNotifications({ bucket, lane: "paged", deliver, now: 62000, limit: 2 });
  assert.equal(retrySends, 2);
});

test("expired retries stop before LINE's retry-key window ends", async () => {
  const bucket = memoryR2();
  let sends = 0;
  const deliver = async () => { sends++; return { ok: false }; };
  await dispatchPaymentNotification({ bucket, lane: "expiry", eventKey: "same", payload: {}, deliver, now: 1000 });
  const result = await drainPaymentNotifications({ bucket, lane: "expiry", deliver, now: 24 * 3600000 });
  assert.equal(sends, 1);
  assert.equal(result.manual_review, 1);
});

test("missing durable storage never reports a queued retry", async () => {
  const result = await dispatchPaymentNotification({ lane: "missing", eventKey: "one", payload: {}, deliver: async () => ({ ok: false }) });
  assert.equal(result.durable, false);
  assert.equal(result.queued, false);
  assert.equal(result.status, "manual_review");
});

test("web and LINE cannot acquire the same evidence lease concurrently", async () => {
  const bucket = memoryR2();
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const first = withPaymentEvidenceLock(bucket, "pay_shared", async () => { entered(); await held; return "created"; });
  await started;
  await assert.rejects(withPaymentEvidenceLock(bucket, "pay_shared", () => assert.fail("second writer")), /intake_in_progress/);
  release();
  assert.equal(await first, "created");
  assert.equal(await withPaymentEvidenceLock(bucket, "pay_shared", async () => "existing"), "existing");
});
