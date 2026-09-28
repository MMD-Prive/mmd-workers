import assert from "node:assert/strict";
import test from "node:test";

import { resolveKenjiNextAction } from "../src/kenji-line-next-action.mjs";

test("payment_center opens canonical Payment Center without implying payment truth", () => {
  const action = resolveKenjiNextAction({
    intent: "payment_center",
    decision: { text: "เปิด Payment Center ได้ครับ" },
    continuity: {},
  });
  assert.equal(action.type, "open_action_route");
  assert.equal(action.route, "https://mmdbkk.com/member/payments");
  assert.equal(action.reason, "payment_center_is_navigation_not_payment_confirmation");
  assert.doesNotMatch(action.customer_text, /ชำระสำเร็จ|ยืนยันยอด|paid/i);
});
