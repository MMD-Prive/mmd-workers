import assert from "node:assert/strict";
import test from "node:test";

import { resolveKenjiNextAction } from "../src/kenji-line-next-action.mjs";

const LIFF = "https://miniapp.line.me/2010862595-yT4DCEMc/";

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

test("membership and Points actions stay inside the dedicated LIFF", () => {
  const cases = [
    ["membership_status", `${LIFF}?intent=status&view=overview`],
    ["membership", `${LIFF}?intent=signup&view=signup`],
    ["membership_signup", `${LIFF}?intent=signup&view=signup`],
    ["private_membership_signup", `${LIFF}?intent=signup&view=signup`],
    ["membership_renewal", `${LIFF}?intent=renew&view=package`],
    ["points_status", `${LIFF}?intent=status&view=points`],
  ];
  for (const [intent, expected] of cases) {
    const action = resolveKenjiNextAction({ intent, decision: { text: "ไปต่อได้ครับ" }, continuity: {} });
    assert.equal(action.type, "open_action_route", intent);
    assert.equal(action.route, expected, intent);
    assert.doesNotMatch(action.customer_text, /workers\.dev|careback/i, intent);
  }
});
