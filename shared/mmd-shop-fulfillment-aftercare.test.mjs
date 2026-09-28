import test from "node:test";
import assert from "node:assert/strict";

import {
  createMmdShopFulfillment,
  fulfillmentStateFromOrder,
  publicMmdShopFulfillment,
  transitionMmdShopFulfillment,
} from "./mmd-shop-fulfillment.mjs";

test("MMD Shop post-shipping lifecycle preserves return and refund states after fulfilled order", () => {
  let state = createMmdShopFulfillment({
    shipping: {
      delivery_method: "delivery",
      recipient_name: "Synthetic",
      phone: "0812345678",
      address_line1: "Synthetic address",
      district: "Synthetic District",
      province: "Bangkok",
      postal_code: "10110",
    },
  });

  for (const next of ["confirmed", "preparing", "ready", "shipped", "delivered", "completed", "return_requested", "return_received", "refund_pending"]) {
    state = transitionMmdShopFulfillment(state, { state: next });
    assert.equal(state.state, next);
  }

  state = transitionMmdShopFulfillment(state, {
    state: "refunded",
    refund_reference: "RF-SMOKE-001",
    refund_method: "PromptPay",
    refund_amount_thb: 2500,
    return_note: "Synthetic return",
  });

  assert.equal(state.state, "refunded");
  assert.equal(fulfillmentStateFromOrder("fulfilled", "refunded", "refunded"), "refunded");
  assert.equal(fulfillmentStateFromOrder("fulfilled", "paid", "return_requested"), "return_requested");

  const publicValue = publicMmdShopFulfillment(state);
  assert.equal(publicValue.state, "refunded");
  assert.equal(publicValue.refund_method, "PromptPay");
  assert.equal(publicValue.refund_amount_thb, 2500);
  assert.equal("refund_reference" in publicValue, false);
  assert.equal("return_note" in publicValue, false);
  assert.equal(publicValue.address, null);
});

test("delivery failure remains an explicit operational state", () => {
  const shipped = transitionMmdShopFulfillment(createMmdShopFulfillment(), { state: "shipped" });
  const failed = transitionMmdShopFulfillment(shipped, { state: "delivery_failed" });
  assert.equal(failed.state, "delivery_failed");
  assert.ok(failed.delivery_failed_at);
});
