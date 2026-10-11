import assert from "node:assert/strict";
import test from "node:test";

import { buildKenjiLineReply, inferLineIntent } from "../src/index.js";

const event = (text) => ({
  type: "message",
  mode: "active",
  replyToken: "reply-token",
  source: { type: "user", userId: "U00000000000000000000000000000001" },
  message: { id: "msg-membership-keyword-1", type: "text", text },
});

test("MMD Membership keyword replies with signup, private signup and renewal links", () => {
  for (const text of ["MMD Membership", "mmd membership", "Membership", "MMD  Membership"]) {
    assert.equal(inferLineIntent(text, event(text)), "membership_menu");
    const reply = String(buildKenjiLineReply(event(text)));
    assert.match(reply, /pay\/membership\?source=line/);
    assert.match(reply, /sigil\/member\/membership\?source=line&intent=signup/);
    assert.match(reply, /sigil\/member\/membership\?source=line&intent=renew/);
  }
});

test("exact signup and renewal keywords keep their dedicated replies", () => {
  assert.equal(inferLineIntent("สมัครสมาชิก", event("สมัครสมาชิก")), "membership_signup");
  assert.equal(inferLineIntent("ต่ออายุสมาชิก", event("ต่ออายุสมาชิก")), "membership_renewal");
});

test("general membership questions keep the existing broad reply", () => {
  const text = "Standard กับ Premium ต่างกันยังไง";
  assert.notEqual(inferLineIntent(text, event(text)), "membership_menu");
});
