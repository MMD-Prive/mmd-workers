import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { handleLineRightsCheck } from "../src/kenji-line-rights-check.mjs";
import { KenjiModelIdempotency } from "../src/kenji-model-idempotency.js";
import { isMembershipMenuCommand, renderMembershipMenu } from "../src/kenji-membership-menu.mjs";
globalThis.crypto ||= webcrypto;

const UID = `U${"3".repeat(32)}`;
const event = (text, extra = {}) => ({ type: "message", timestamp: Date.now(), mode: "active", webhookEventId: `evt-${Math.random()}`, replyToken: "mock-only", source: { type: "user", userId: UID }, message: { id: "m1", type: "text", text }, ...extra });

async function fixture(text = "MMD Membership") {
  const map = new Map(); let queue = Promise.resolve();
  const storage = { get: async k => map.get(k), put: async (k, v) => map.set(k, v), delete: async k => map.delete(k), getAlarm: async () => null, setAlarm: async () => {},
    transaction: fn => { const work = queue.then(() => fn(storage)); queue = work.catch(() => {}); return work; } };
  const object = new KenjiModelIdempotency({ storage });
  const env = { KENJI_LINE_RIGHTS_CHECK_MODE: "command", KENJI_LINE_RIGHTS_COMMAND_ENABLED: "true", KENJI_LINE_MEMBERSHIP_MENU_ENABLED: "true", LINE_AUTO_REPLY_ENABLED: "false", LINE_KENJI_AI_ENABLED: "true",
    KENJI_MODEL_DEDUPE: { idFromName: x => x, get: () => ({ fetch: (url, init) => object.fetch(new Request(url, init)) }) } };
  const counters = { replies: [], truth: 0, cases: 0, history: 0 };
  const services = { continuity: async () => ({ matrix: {} }), takeover: async () => ({ ok: true, active: false }), runtime: async () => ({ ok: true, controls: {} }),
    truth: async () => { counters.truth++; return {}; }, matrix: async () => { counters.cases++; return { id: "x" }; },
    deliver: async (_e, _ev, t) => { counters.replies.push(t); return true; }, history: async () => { counters.history++; } };
  return { env, event: event(text), runtime: { ok: true, controls: { line_oa_auto_reply: true } }, services, counters };
}

for (const phrase of ["MMD Membership", "mmd membership", "MMD  Membership", "MMDMembership", "MMD Membership ครับ", "MMD Membership​", "﻿MMD Membership ค่ะ"])
  test(`menu accepts ${JSON.stringify(phrase)}`, () => assert.equal(isMembershipMenuCommand(event(phrase)), true));

for (const phrase of ["Membership", "สมาชิก", "สนใจ", "ไม่เอา MMD Membership", "MMD Membership ราคาเท่าไหร่", "ขอ MMD Membership ให้เพื่อน", "ขอดู", "สนใจ MMD Membership"])
  test(`menu excludes ${JSON.stringify(phrase)}`, () => assert.equal(isMembershipMenuCommand(event(phrase)), false));

test("menu rejects groups and non-text events", () => {
  assert.equal(isMembershipMenuCommand(event("MMD Membership", { source: { type: "group", userId: UID } })), false);
  assert.equal(isMembershipMenuCommand(event("MMD Membership", { message: { type: "sticker" } })), false);
});

test("menu copy has the signup/status LIFF links and the working web renewal link and says nothing about the sender's own membership", () => {
  const { text } = renderMembershipMenu();
  assert.match(text, /miniapp\.line\.me\/2010862595-yT4DCEMc\/\?intent=signup&view=signup/);
  assert.match(text, /mmdbkk\.com\/sigil\/member\/membership\?source=line&intent=renew/);
  assert.match(text, /\?intent=status&view=profile/);
  assert.doesNotMatch(text, /liff\.state|\/member\/liff/);
  assert.doesNotMatch(text, /บัญชีนี้|เช็กสิทธิ์|วันหมดอายุ|แต้ม|Welcome|1,199|2,999/);
});

test("switch off (default) stays silent", async () => {
  const f = await fixture(); f.env.KENJI_LINE_MEMBERSHIP_MENU_ENABLED = "false";
  assert.equal(await handleLineRightsCheck(f), null); assert.equal(f.counters.replies.length, 0);
});

test("needs command mode: pilot mode never serves the menu", async () => {
  const f = await fixture(); f.env.KENJI_LINE_RIGHTS_CHECK_MODE = "off";
  assert.equal(await handleLineRightsCheck(f), null); assert.equal(f.counters.replies.length, 0);
});

test("enabled: one static reply, no entitlement read, no case, history recorded", async () => {
  const f = await fixture();
  const r = await handleLineRightsCheck(f);
  assert.equal(r.replied, true, JSON.stringify(r)); assert.equal(f.counters.truth, 0); assert.equal(f.counters.cases, 0); assert.equal(f.counters.history, 1);
  assert.match(f.counters.replies[0], /intent=renew/);
});

test("concurrent duplicate delivery replies once", async () => {
  const f = await fixture();
  const rows = await Promise.all([handleLineRightsCheck(f), handleLineRightsCheck(f)]);
  assert.equal(rows.filter(r => r.replied).length, 1); assert.equal(f.counters.replies.length, 1);
});

test("owner takeover, kill switch and redelivery silence the menu", async () => {
  let f = await fixture(); f.services.takeover = async () => ({ ok: true, active: true });
  await handleLineRightsCheck(f); assert.equal(f.counters.replies.length, 0);
  f = await fixture(); f.runtime = { ok: true, controls: { all_kenji_mutations: true } }; f.services.runtime = async () => f.runtime;
  await handleLineRightsCheck(f); assert.equal(f.counters.replies.length, 0);
  f = await fixture(); f.event.deliveryContext = { isRedelivery: true };
  await handleLineRightsCheck(f); assert.equal(f.counters.replies.length, 0);
});

test("existing rights command still works when menu switch is on", async () => {
  const f = await fixture("เช็กสิทธิ์"); f.services.truth = async () => { f.counters.truth++; return {}; };
  await handleLineRightsCheck(f); assert.equal(f.counters.truth, 1);
});
