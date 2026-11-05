import assert from "node:assert/strict";
import test from "node:test";
import { customerSelectedMethod } from "./src/payment-review-runtime.js";

const web = (extra) => ({ note: `schema=mmd_web_payment_proof_v1; payment_lane=mmd_web; evidence_only=true; official_verification_required=true${extra}` });

test("reviewer context carries only an allowlisted customer-selected method", () => {
  assert.equal(customerSelectedMethod(web("; customer_selected_method=bank_transfer; r2_key=web-payment-proofs/2026/11/x/original.png")), "bank_transfer");
  assert.equal(customerSelectedMethod(web("; customer_selected_method=paypal_card")), "paypal_card");
  assert.equal(customerSelectedMethod(web("; customer_selected_method=promptpay")), "promptpay");
});

test("missing, unknown or free-text methods yield nothing", () => {
  assert.equal(customerSelectedMethod(web("")), "");
  assert.equal(customerSelectedMethod(web("; customer_selected_method=bitcoin")), "");
  assert.equal(customerSelectedMethod({ note: "customer_selected_method=bank_transfer" }), "");
  assert.equal(customerSelectedMethod({ note: "free text from the customer: customer_selected_method=promptpay" }), "");
  assert.equal(customerSelectedMethod({}), "");
  assert.equal(customerSelectedMethod(null), "");
});
