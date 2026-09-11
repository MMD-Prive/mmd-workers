import assert from "node:assert/strict";
import test from "node:test";

import { buildKenjiLineReply, inferLineIntent } from "../src/index.js";

function textEvent(text) {
  return {
    type: "message",
    message: { type: "text", text },
  };
}

test("payment slip fallback uses canonical payment navigation and never legacy proof CTA", () => {
  const event = textEvent("ส่งสลิปตรงไหน");
  assert.equal(inferLineIntent(event.message.text, event), "payment_slip");

  const reply = buildKenjiLineReply(event);
  assert.match(reply, /https:\/\/mmdbkk\.com\/member\/payments/);
  assert.equal(reply.includes("/confirm/payment-proof"), false);
  assert.match(reply, /ไม่ต้องส่งซ้ำ/);
});
