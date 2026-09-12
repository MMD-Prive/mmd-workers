import test from "node:test";
import assert from "node:assert/strict";
import { TG_THREADS, formatTelegramMessage, telegramTopics } from "../lib/telegram.js";

test("topic registry keeps every MMD operations topic explicit", () => {
  assert.deepEqual(
    telegramTopics({}).map(({ key, thread_id }) => [key, thread_id]),
    [
      ["membership", 20],
      ["payment", 21],
      ["alerts", 9],
      ["points", 17],
      ["system_log", 22],
      ["public_model", 155],
      ["booking", 1399],
    ],
  );
});

test("operational flow aliases route through the central registry", () => {
  const threads = TG_THREADS({});
  assert.equal(threads.alert, 9);
  assert.equal(threads.recovery, 9);
  assert.equal(threads.system_log, 22);
  assert.equal(threads.public_model_application, 155);
  assert.equal(threads.booking_draft, 1399);
});

test("payment proof and verified alerts use the canonical HYPE payment topic", () => {
  const threads = TG_THREADS({ TG_THREAD_PAYMENT: "21", TG_THREAD_CONFIRM: "99" });
  assert.equal(threads.payment_proof, 21);
  assert.equal(threads.payment_verified, 21);
});

test("payment alert formatter keeps proof and verified states distinct", () => {
  const proof = formatTelegramMessage({
    flow: "payment_proof",
    proof_id: "proof_123",
    amount_thb: 690,
    currency: "THB",
    ref: "ABCD…WXYZ",
    status: "pending",
    ts: "2026-09-04T03:00:00.000Z",
  });
  const verified = formatTelegramMessage({
    flow: "payment_verified",
    amount_thb: 690,
    currency: "THB",
    ref: "ABCD…WXYZ",
    status: "verified",
    ts: "2026-09-04T03:05:00.000Z",
  });

  assert.match(proof, /PAYMENT PROOF RECEIVED/);
  assert.match(proof, /Status:<\/b> pending/);
  assert.match(verified, /PAYMENT VERIFIED/);
  assert.match(verified, /Status:<\/b> verified/);
});
