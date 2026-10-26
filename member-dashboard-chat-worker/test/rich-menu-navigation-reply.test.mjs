import test from "node:test";
import assert from "node:assert/strict";
import { getMmdRichMenuActionMap, getMmdRichMenuDestinationMap } from "../src/mmd-rich-menu-scheduled-runtime.mjs";
import { richMenuNavigation, resolveRichMenuNavigation } from "../src/rich-menu-navigation-reply.mjs";

const event = data => ({ type: "postback", postback: { data } });
const active = { live_truth: true, identity_state: "matched", membership_state: "active", level: "private", private_visibility_envelope: "premium" };

test("Private Kenji opens the web directly; other navigation taps keep bounded replies", async () => {
  const destinations = getMmdRichMenuDestinationMap(), actions = getMmdRichMenuActionMap();
  let count = 0, direct = 0;
  for (const [menu, items] of Object.entries(destinations)) {
    assert.equal(actions[menu].length, 6);
    for (const [index, destination] of items.entries()) {
      if (destination.type !== "uri") continue;
      count++;
      if (actions[menu][index].type === "uri") {
        assert.equal(menu, "private");
        assert.equal(index, 0);
        assert.equal(actions[menu][index].uri, destination.uri);
        assert.equal(new URL(destination.uri).hostname, "www.mmdbkk.com");
        direct++;
        continue;
      }
      const reply = await resolveRichMenuNavigation(event(actions[menu][index].data), { getContext: async () => active });
      assert.equal(reply.cta_route, destination.uri);
      assert.ok(reply.text.endsWith(destination.uri));
      assert.equal(new URL(reply.cta_route).hostname, (menu === "guest" && index === 0) || index === 3 && menu !== "guest" || menu === "private" && index === 4 ? "miniapp.line.me" : "mmdbkk.com");
      assert.doesNotMatch(reply.text, /Kenji|เคนจิ|ยืนยันการจอง|ชำระเงินสำเร็จ/);
    }
  }
  assert.equal(count, 14);
  assert.equal(direct, 1);
});

test("spoofed Private menu never grants a private destination without fresh identity and entitlement", async () => {
  const input = event(getMmdRichMenuActionMap().private[1].data);
  const fallback = getMmdRichMenuDestinationMap().public[4].uri;
  for (const context of [null, {}, { ...active, live_truth: false }, { ...active, identity_state: "ambiguous" }, { ...active, membership_state: "expired" }, { ...active, membership_state: "blocked" }, { ...active, level: "public" }, { ...active, private_visibility_envelope: "none" }]) {
    const reply = await resolveRichMenuNavigation(input, { getContext: async () => context });
    assert.equal(reply.cta_route, fallback);
    assert.equal(reply.guard_blocked, true);
  }
  assert.equal((await resolveRichMenuNavigation(input, { getContext: async () => { throw Error("offline"); } })).cta_route, fallback);
});

test("Talk to Per opens a short Per-voice conversation rather than entering generic greeting inference", async () => {
  const reply = await resolveRichMenuNavigation(event(getMmdRichMenuActionMap().public[0].data));
  assert.match(reply.text, /พี่เปอร์ดูแลงาน/);
  assert.equal(reply.cta_route, "");
  assert.equal(reply.cta_type, "continue_in_chat");
  assert.doesNotMatch(reply.text, /Kenji|เคนจิ|https:/);
});

test("postback cannot supply a redirect, duplicate keys, or an unknown button", () => {
  for (const data of ["mmd_action=rich_menu&menu=guest&button=1&uri=https://evil.example", "mmd_action=rich_menu&menu=guest&button=1&button=2", "mmd_action=rich_menu&menu=private&button=6", "mmd_action=rich_menu&menu=unknown&button=1", "mmd_action=rich_menu&menu=guest&button=99"])
    assert.equal(richMenuNavigation(event(data)), null);
  assert.equal(richMenuNavigation({ type: "message", message: { text: "mmd_action=rich_menu&menu=guest&button=1" } }), null);
});


test("SUPPORT keeps bounded LINE help while Private Kenji opens the web", async () => {
  const actions = getMmdRichMenuActionMap();
  assert.equal(actions.private[0].type, "uri");
  assert.equal(richMenuNavigation(event(actions.private[0].data)), null);
  for (const [menu, button] of [["guest", 5], ["public", 5], ["private", 5]]) {
    const reply = await resolveRichMenuNavigation(event(actions[menu][button].data), {
      getContext: async () => { throw Error("help should not request private truth"); },
    });
    assert.equal(reply.cta_route, "");
    assert.doesNotMatch(reply.text, /https:/);
    assert.match(reply.text, menu === "private" ? /เช็กสิทธิ์/ : /checkpts/);
  }
});
