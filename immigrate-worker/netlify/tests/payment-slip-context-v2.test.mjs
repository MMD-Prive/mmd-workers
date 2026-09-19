import test from "node:test";
import assert from "node:assert/strict";
import { looksLikePaymentSlipContext } from "../functions/line-payment-slip-intake.mjs";

function imageEvent(overrides = {}) {
  return {
    type: "message",
    message: { type: "image", id: "line-image-1", ...(overrides.message || {}) },
    context: overrides.context || {},
  };
}

test("broader customer payment phrases classify a following image as payment evidence", () => {
  assert.equal(looksLikePaymentSlipContext(imageEvent(), ["โอนเรียบร้อยแล้วครับ"]), true);
  assert.equal(looksLikePaymentSlipContext(imageEvent(), ["ยอด 690 บาทครับ"]), true);
  assert.equal(looksLikePaymentSlipContext(imageEvent(), ["ชำระเงินแล้ว"]), true);
});

test("newest explicit profile-image intent wins over stale payment context", () => {
  assert.equal(
    looksLikePaymentSlipContext(imageEvent(), ["ขอดูรูป profile EMs19", "โอนเรียบร้อยแล้วครับ"]),
    false,
  );
});

test("an unrelated image without payment context is not silently treated as a slip", () => {
  assert.equal(looksLikePaymentSlipContext(imageEvent(), []), false);
  assert.equal(looksLikePaymentSlipContext(imageEvent({ context: { text: "ขอดูรูปนายแบบ" } }), []), false);
});

test("direct payment context on the image event is accepted", () => {
  assert.equal(looksLikePaymentSlipContext(imageEvent({ context: { text: "payment proof" } }), []), true);
});
