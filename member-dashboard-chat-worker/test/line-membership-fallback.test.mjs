import assert from "node:assert/strict";
import test from "node:test";

import { buildKenjiLineReply, inferLineIntent } from "../src/index.js";
import { decideKenjiCapability } from "../src/kenji-capability-policy.js";

function lineTextEvent(text) {
  return {
    type: "message",
    replyToken: "reply-token",
    source: { type: "user", userId: "U1234567890abcdef1234567890abcdef" },
    message: { id: "msg-membership", type: "text", text },
  };
}

test("membership signup and renewal use separate deterministic actions", () => {
  for (const text of ["สมัครสมาชิก", "อยากสมัครสมาชิก", "ขอสมัครสมาชิก"]) {
    const event = lineTextEvent(text);
    assert.equal(inferLineIntent(text, event), "membership_signup");
    assert.deepEqual(decideKenjiCapability({ intent: "membership_signup", text }), {
      capability: "deterministic_truth",
      requested_domain: "none",
      requires_truth: false,
    });
    assert.match(buildKenjiLineReply(event), /https:\/\/mmdbkk\.com\/sigil\/member\/membership\?source=line&intent=signup/);
  }
  for (const text of ["ต่ออายุ", "ต่ออายุสมาชิก", "ขอต่ออายุสมาชิก"]) {
    const event = lineTextEvent(text);
    assert.equal(inferLineIntent(text, event), "membership_renewal");
    assert.deepEqual(decideKenjiCapability({ intent: "membership_renewal", text }), {
      capability: "deterministic_truth",
      requested_domain: "none",
      requires_truth: false,
    });
    const reply = buildKenjiLineReply(event);
    assert.match(reply, /https:\/\/mmdbkk\.com\/sigil\/member\/membership\?source=line&intent=renew/);
    assert.doesNotMatch(reply, /ต่ออายุ(?:สมาชิก)?(?:สำเร็จ|เรียบร้อย)|ยืนยัน(?:การ)?ชำระ|สมาชิก.*active/i);
  }
});

test("personal status routes remain protected and contain no raw Worker URL", () => {
  const cases = [
    ["สถานะผมเป็นยังไง", "membership_status"],
    ["ผมจ่ายแล้ว", "payment_status"],
    ["แต้มเข้าไหม", "points_status"],
  ];
  for (const [text, intent] of cases) {
    const event = lineTextEvent(text);
    assert.equal(inferLineIntent(text, event), intent);
    const reply = buildKenjiLineReply(event);
    assert.doesNotMatch(reply, /workers\.dev\/member\/liff/);
    assert.doesNotMatch(reply, /ชำระสำเร็จ|สมาชิก(?:เป็น|อยู่ในสถานะ) active|แต้มเข้าแล้ว/i);
  }
});
