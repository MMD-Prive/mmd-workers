import assert from "node:assert/strict";
import test from "node:test";

import { buildKenjiLineReply, inferLineIntent } from "../src/index.js";

function lineTextEvent(text) {
  return {
    type: "message",
    replyToken: "reply-token",
    source: { type: "user", userId: "U1234567890abcdef1234567890abcdef" },
    message: { id: "msg-membership", type: "text", text },
  };
}

for (const [text, intent, membershipIntent] of [
  ["สมัครสมาชิก", "membership_signup", "signup"],
  ["อยากสมัครสมาชิก", "membership_signup", "signup"],
  ["ขอสมัครสมาชิก", "membership_signup", "signup"],
  ["ต่ออายุ", "membership_renewal", "renew"],
  ["ต่ออายุสมาชิก", "membership_renewal", "renew"],
  ["ขอต่ออายุสมาชิก", "membership_renewal", "renew"],
]) {
  test(`${text} routes to the canonical ${membershipIntent} action`, () => {
    const event = lineTextEvent(text);
    assert.equal(inferLineIntent(text, event), intent);
    const reply = buildKenjiLineReply(event);
    assert.match(reply, new RegExp(`https://mmdbkk\\.com/sigil/member/membership\\?source=line&intent=${membershipIntent}`));
    assert.doesNotMatch(reply, /intent=status/);
    assert.match(reply, /ข้อมูลทางการ/);
  });
}

for (const [text, intent] of [
  ["สถานะผมเป็นยังไง", "membership_status"],
  ["แต้มเข้าไหม", "points_status"],
  ["ผมจ่ายแล้ว", "payment_status"],
]) {
  test(`${text} remains a protected status route`, () => {
    assert.equal(inferLineIntent(text, lineTextEvent(text)), intent);
  });
}
