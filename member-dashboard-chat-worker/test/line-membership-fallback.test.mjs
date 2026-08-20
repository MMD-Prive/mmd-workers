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

test("local membership fallback routes to canonical MY MMD membership page", () => {
  const event = lineTextEvent("ต่ออายุสมาชิก");
  assert.equal(inferLineIntent("ต่ออายุสมาชิก", event), "membership");

  const reply = buildKenjiLineReply(event);
  assert.match(reply, /https:\/\/mmdbkk\.com\/sigil\/member\/membership/);
  assert.doesNotMatch(reply, /https:\/\/mmdbkk\.com\/member\/membership(?:[/?\s]|$)/);
  assert.match(reply, /MMD ตรวจสอบข้อมูลทางการ/);
});
