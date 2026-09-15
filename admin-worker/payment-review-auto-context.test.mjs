import test from "node:test";
import assert from "node:assert/strict";
import { inferPaymentContextFromConversation } from "./src/payment-review-auto-context.js";

test("infers Premium renewal from LINE context", () => {
  const x = inferPaymentContextFromConversation({
    texts: ["โอนแล้วครับ", "ขอต่อ Premium ครับ"],
    matrix: { last_customer_intent: "membership_renewal" },
    amount_thb: 1999,
  });
  assert.equal(x.payment_stage, "membership");
  assert.equal(x.package_code, "premium");
  assert.equal(x.renewal_like, true);
});

test("infers service deposit from recent LINE wording", () => {
  const x = inferPaymentContextFromConversation({
    texts: ["โอนมัดจำแล้วครับ", "จอง EMs22 วันที่ 17"],
    matrix: { last_customer_intent: "payment_slip" },
    amount_thb: 8250,
  });
  assert.equal(x.payment_stage, "deposit");
  assert.equal(x.package_code, "");
});

test("newest final-payment wording beats older booking context", () => {
  const x = inferPaymentContextFromConversation({
    texts: ["โอนส่วนที่เหลือแล้ว", "ก่อนหน้านี้จองงานไว้ครับ"],
    matrix: { last_customer_intent: "payment_slip" },
    amount_thb: 19250,
  });
  assert.equal(x.payment_stage, "final");
});
