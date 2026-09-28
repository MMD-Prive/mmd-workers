import test from "node:test";
import assert from "node:assert/strict";

import { isAllowedFulfillmentTransition } from "./src/mmd-shop-orders-admin.js";

test("MMD Shop delivery can move to delivered or delivery_failed but not directly complete", () => {
  assert.equal(isAllowedFulfillmentTransition("shipped", "delivered", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("shipped", "delivery_failed", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("shipped", "completed", "delivery", "paid"), false);
});

test("MMD Shop return and refund lifecycle is bounded", () => {
  assert.equal(isAllowedFulfillmentTransition("delivered", "completed", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("delivered", "return_requested", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("completed", "return_requested", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("return_requested", "return_received", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("return_received", "refund_pending", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("refund_pending", "refunded", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("return_requested", "refunded", "delivery", "paid"), false);
  assert.equal(isAllowedFulfillmentTransition("refund_pending", "refunded", "delivery", "pending"), false);
});

test("delivery_failed supports redispatch or refund queue only after verified payment", () => {
  assert.equal(isAllowedFulfillmentTransition("delivery_failed", "ready", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("delivery_failed", "refund_pending", "delivery", "paid"), true);
  assert.equal(isAllowedFulfillmentTransition("delivery_failed", "ready", "delivery", "pending"), false);
});
