import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");

function block(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing block start: ${start}`);
  assert.notEqual(to, -1, `missing block end: ${end}`);
  return source.slice(from, to);
}

test("payments worker stores current-job model payout only on Sessions.pay_model_thb", () => {
  const sessionWriter = block("async function createSessionIfMissing", "/* -------------------------------------------------- */\n/* telegram */");
  assert.match(sessionWriter, /pay_model_thb:\s*payload\.pay_model_thb/);
  assert.doesNotMatch(sessionWriter, /[\"']Pay Model[\"']\s*:/);
  assert.doesNotMatch(sessionWriter, /model_payout_amount_thb\s*:/);
});

test("Payments intent does not duplicate model payout truth", () => {
  const paymentWriter = block("async function createOrUpdatePaymentIntent", "async function updateSessionFromPayment");
  assert.doesNotMatch(paymentWriter, /pay_model_thb\s*:/);
  assert.doesNotMatch(paymentWriter, /[\"']Pay Model[\"']\s*:/);
  assert.doesNotMatch(paymentWriter, /model_payout_amount_thb\s*:/);
});

test("confirm-link keeps payout as internal input but does not forward it to payment intent", () => {
  const confirmLink = block("async function handleConfirmLink", "async function handleConfirmVerify");
  assert.match(confirmLink, /const pay_model_thb\s*=/);
  assert.match(confirmLink, /createSessionIfMissing\(env,\s*\{[\s\S]*?pay_model_thb,/);

  const paymentCallStart = confirmLink.indexOf("const payment_write = await createOrUpdatePaymentIntent");
  assert.notEqual(paymentCallStart, -1);
  const paymentCallEnd = confirmLink.indexOf("});", paymentCallStart);
  const paymentCall = confirmLink.slice(paymentCallStart, paymentCallEnd + 3);
  assert.doesNotMatch(paymentCall, /pay_model_thb/);
});
