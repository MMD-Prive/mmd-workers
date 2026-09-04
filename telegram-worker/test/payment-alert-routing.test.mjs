import test from "node:test";
import assert from "node:assert/strict";
import { TG_THREADS, formatTelegramMessage } from "../lib/telegram.js";

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
