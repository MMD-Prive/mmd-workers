import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import worker, { buildKenjiLineReply, buildKenjiKnowledgeLineReply, createLineSignature, inferLineIntent, resolveKenjiLineReply } from "../src/index.js";
import { decideKenjiCapability } from "../src/kenji-capability-policy.js";
import { PRIVATE_MEMBERSHIP_LINKS, inferPrivateMembershipNavigation, resolvePrivateMembershipFollowup } from "../src/kenji-private-membership-navigation.mjs";

const UID = "U1234567890abcdef1234567890abcdef";
const event = text => ({
  type: "message", mode: "active", replyToken: "fixture-reply",
  source: { type: "user", userId: UID },
  message: { type: "text", id: "fixture-private", text },
});
const continuity = (overrides = {}) => ({
  available: true, decision: "continuation", effective_intent: "membership_interest",
  matrix: { last_customer_intent: "membership_interest", matrix_status: "active", state_expires_at: new Date(Date.now() + 60_000).toISOString() },
  ...overrides,
});

test("natural package questions and Greeting aliases lead to Private", () => {
  for (const text of ["package", " PACKAGE ครับ ", "แพ็กเกจ", "ขอดูแพ็กเกจสมาชิก", "สมาชิกมีอะไรบ้าง", "แพ็กเกจสมาชิกราคาเท่าไหร่", "Standard กับ Premium ต่างกันยังไง"]) {
    assert.equal(inferLineIntent(text, event(text)), "private_membership_options", text);
    assert.equal(decideKenjiCapability({ text, intent: inferLineIntent(text) }).capability, "deterministic_truth");
    const answer = buildKenjiLineReply(event(text));
    assert.match(answer, /Standard 1 ปี \/ Premium 2 ปี/);
    assert.ok(answer.includes(PRIVATE_MEMBERSHIP_LINKS.signup));
    assert.ok(answer.length < 350);
    assert.doesNotMatch(answer, /Public|HITO|Kenji|งบ|บาท|คูปอง/i);
  }
});

test("signup and selected tiers have a short CTA without issuing payment or rights", () => {
  for (const text of ["regis", "REGISTER ครับ", "สมัครครับ", "อยากสมัครสมาชิก", "สมัคร Private Membership", "สมัคร Standard", "สมัคร Premium", "Premium", "เลือก Standard"]) {
    const answer = buildKenjiLineReply(event(text));
    assert.ok(answer.includes(PRIVATE_MEMBERSHIP_LINKS.signup), text);
    assert.ok(answer.length < 350);
    assert.doesNotMatch(answer, /Public|HITO|เปิดสิทธิ์แล้ว|สมัครสำเร็จ|โอนเข้า|เลขบัญชี|payment_ref|\/checkout|\/sigil\/pay/i);
  }
  for (const text of ["ต่ออายุ", "อยากต่ออายุครับ", "ต่ออายุ Premium ยังไง", "สมาชิกหมดอายุแล้ว อยากต่ออายุ"]) {
    assert.equal(inferLineIntent(text), "membership_renewal", text);
    const answer = buildKenjiLineReply(event(text));
    assert.ok(answer.includes(PRIVATE_MEMBERSHIP_LINKS.renew));
    assert.match(answer, /ตรวจราคา ระยะเวลา และวันหมดอายุก่อนชำระ/);
    assert.doesNotMatch(answer, /ต่ออายุสำเร็จ|แถม|โบนัส|บาท/);
  }
});

test("fresh conversation replies route new and returning members without asking again", async () => {
  for (const [text, link] of [["ใหม่", PRIVATE_MEMBERSHIP_LINKS.signup], ["ยังไม่เคยเป็นสมาชิกครับ", PRIVATE_MEMBERSHIP_LINKS.signup], ["เคยเป็นสมาชิก", PRIVATE_MEMBERSHIP_LINKS.renew]]) {
    const options = { continuity: continuity() };
    const answer = await resolveKenjiLineReply(event(text), {}, {}, options);
    assert.equal(answer.reply_source, "private_membership_navigation", text);
    assert.ok(answer.text.includes(link));
    assert.doesNotMatch(answer.text, /เคยเป็นสมาชิก MMD มาก่อนหรือยัง/);
    assert.ok(buildKenjiLineReply(event(text), {}, options).includes(link));
  }
});

test("bare followups cannot reuse missing, stale or handed-off conversation state", () => {
  const stale = continuity();
  stale.matrix.state_expires_at = "2020-01-01T00:00:00Z";
  const missingExpiry = continuity();
  delete missingExpiry.matrix.state_expires_at;
  for (const context of [{}, stale, missingExpiry, continuity({ decision: "stale_refresh" }), continuity({ handoff_required: true }), continuity({ matrix: { ...continuity().matrix, human_takeover: true } })]) {
    assert.equal(resolvePrivateMembershipFollowup("ใหม่", "note_only", context), "note_only");
  }
  assert.equal(inferPrivateMembershipNavigation("ใหม่"), "");
  assert.equal(inferPrivateMembershipNavigation("เคย"), "");
});

test("canonical existing Private members keep their old account; blocked accounts verify first", async () => {
  for (const [identity, lifecycle, expectedLink] of [
    ["resolved", "active", PRIVATE_MEMBERSHIP_LINKS.renew],
    ["resolved", "expired", PRIVATE_MEMBERSHIP_LINKS.renew],
    ["resolved", "blocked", PRIVATE_MEMBERSHIP_LINKS.status],
    ["ambiguous", "active", PRIVATE_MEMBERSHIP_LINKS.status],
  ]) {
    const env = { MEMBER_PAGES_WORKER: { fetch: async request => {
      assert.equal(new URL(request.url).pathname, "/__internal/kenji/member-truth");
      const input = await request.json();
      assert.equal(input.line_user_id, UID);
      return Response.json({ ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: identity,
        membership: { level: "private_premium", lifecycle, member_blocked: lifecycle === "blocked" } });
    } } };
    const reply = await resolveKenjiLineReply(event("regis"), {}, env);
    assert.ok(reply.text.includes(expectedLink), `${identity}/${lifecycle}: ${reply.text}`);
    assert.doesNotMatch(reply.text, /active|Premium.*อยู่|ได้สิทธิ์แล้ว|วันหมดอายุใหม่คือ/);
  }
});

test("generic and explicit Private navigation cannot be overwritten by old Public knowledge or an LLM", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected external call"); };
  try {
    const env = { LINE_KENJI_KNOWLEDGE_ENABLED: "true", LINE_KENJI_MODEL_ENABLED: "true" };
    for (const text of ["สมัครสมาชิก", "package", "Premium", "ต่ออายุ", "MMD Membership"]) {
      const decision = await resolveKenjiLineReply(event(text), {}, env);
      assert.equal(decision.reply_source, "private_membership_navigation");
      assert.equal(decision.model_attempted, false);
      assert.equal(decision.handoff_required, false);
      assert.doesNotMatch(decision.text, /Public|HITO/i);
      assert.match(await buildKenjiKnowledgeLineReply(event(text), {}, env), /world=private/);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("protected requests, custom prices, unrelated applications and explicit Public remain outside navigation", async () => {
  for (const text of ["ต่ออายุแล้ว ใช้ได้หรือยัง", "สมัคร Premium โอนแล้ว", "ขอคืนเงินค่าสมาชิก", "แต้มสมาชิกเข้าไหม", "ต่ออายุมีโบนัสไหม", "สมัคร Standard CARE BACK ได้อะไร", "ขอราคาสมาชิกเฉพาะผม", "สมัครเป็นนายแบบ", "ต่ออายุพาสปอร์ต", "สมัคร Public Membership", "สมัคร Elite"]) {
    assert.equal(inferPrivateMembershipNavigation(text), "", text);
    const decision = await resolveKenjiLineReply(event(text));
    assert.notEqual(decision.reply_source, "private_membership_navigation", text);
  }
  const custom = await resolveKenjiLineReply(event("ขอราคาสมาชิกเฉพาะผม"));
  assert.equal(custom.handoff_required, true);
  assert.equal(custom.handoff_reason, "membership_pricing:per_review");
  assert.match(buildKenjiLineReply(event("สมัคร Public Membership")), /Public Membership/);
});

test("signed webhook uses one mocked LINE reply and respects the existing off, standby and kill gates", async () => {
  const originalFetch = globalThis.fetch;
  const replies = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.line.me/v2/bot/message/reply");
    replies.push(JSON.parse(init.body));
    return Response.json({});
  };
  try {
    for (const [enabled, mode, kill, count] of [["true", "active", false, 1], ["false", "active", false, 0], ["true", "standby", false, 0], ["true", "active", true, 0]]) {
      const env = { INTERNAL_TOKEN: "fixture-internal", LINE_CHANNEL_SECRET: "fixture-secret", LINE_CHANNEL_ACCESS_TOKEN: "fixture-token", LINE_KENJI_AI_ENABLED: "true", LINE_AUTO_REPLY_ENABLED: enabled,
        ADMIN_WORKER: { fetch: async () => Response.json({ ok: true, controls: { line_oa_auto_reply: kill, model_keyword_auto_reply: false, all_kenji_mutations: false } }) } };
      const body = JSON.stringify({ events: [{ ...event("regis"), mode }] });
      const request = new Request("https://worker/webhooks/line", { method: "POST", body,
        headers: { "content-type": "application/json", "x-line-signature": await createLineSignature(body, env.LINE_CHANNEL_SECRET) } });
      const before = replies.length;
      const response = await worker.fetch(request, env);
      assert.equal(response.status, 200);
      assert.equal(replies.length - before, count);
      if (count) assert.ok(replies.at(-1).messages[0].text.includes(PRIVATE_MEMBERSHIP_LINKS.signup));
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("production reply and model switches remain off; links select Private without payment tokens", () => {
  const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  for (const name of ["LINE_AUTO_REPLY_ENABLED", "LINE_KENJI_MODEL_ENABLED", "KENJI_LINE_PRIVATE_INTEREST_ENABLED", "KENJI_LINE_MEMBERSHIP_MENU_ENABLED"]) {
    assert.match(config, new RegExp(`^${name}\\s*=\\s*"false"$`, "m"));
  }
  for (const intent of ["signup", "renew"]) {
    const url = new URL(PRIVATE_MEMBERSHIP_LINKS[intent]);
    assert.equal(url.origin, "https://miniapp.line.me");
    assert.equal(url.searchParams.get("world"), "private");
    assert.equal(url.searchParams.get("intent"), intent);
    assert.equal(url.searchParams.has("t"), false);
    assert.equal(url.searchParams.has("payment_ref"), false);
  }
});
