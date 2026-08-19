import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("./kenji-member-concierge.js", import.meta.url), "utf8");

function loadConcierge(overrides = {}) {
  const context = {
    console,
    URL,
    URLSearchParams,
    Response,
    location: { origin: "https://www.mmdbkk.com", search: "" },
    ...overrides
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.MMDKenjiMemberConcierge;
}

const concierge = loadConcierge();

test("empty input introduces the reviewed routing map", () => {
  assert.equal(concierge.classifyIntent("  ").intent, "empty");
  assert.match(concierge.buildKenjiReply(""), /MMD Companion/);
  assert.match(concierge.buildKenjiReply(""), /MMS Wellness/);
});

test("Kenji 2.0 separates MMD, MMS, partner venue, and private talent", () => {
  const cases = [
    ["ไป dinner", "mmd_companion", /MMD Companion/],
    ["อยากนวด recovery", "mms_wellness", /MMS Wellness/],
    ["ไม่มีสถานที่ ใช้ Relax Spa", "partner_venue", /Relax Spa by 9/],
    ["หา private talent ด้านภาษา", "private_talent", /Private Talent/],
  ];
  for (const [text, intent, replyPattern] of cases) {
    assert.equal(concierge.classifyIntent(text).intent, intent);
    assert.match(concierge.buildKenjiReply(text), replyPattern);
  }
});

test("payment and slip intent includes official verification safety copy", () => {
  const reply = concierge.buildKenjiReply("ส่งสลิปแล้ว");
  assert.equal(concierge.classifyIntent("ส่งสลิปแล้ว").intent, "payment_slip");
  assert.match(reply, /\/confirm\/payment-proof/);
  assert.match(reply, /ยังไม่ถือว่ายืนยันยอด/);
});

test("CARE BACK intent wins over payment terms and keeps the Wish gate", () => {
  const reply = concierge.buildKenjiReply("CARE BACK ส่งสลิปแล้ว");
  assert.equal(concierge.classifyIntent("CARE BACK ส่งสลิปแล้ว").intent, "care_back");
  assert.match(reply, /Birthday Wish/);
  assert.match(reply, /10%/);
  assert.match(reply, /30 วัน/);
  assert.doesNotMatch(reply, /คูปองอัตโนมัติ|Points อัตโนมัติ/);
});

test("points intent shows points summary", () => {
  const reply = concierge.buildKenjiReply("แต้ม", { points_balance: 875 });
  assert.equal(concierge.classifyIntent("แต้ม", { points_balance: 875 }).intent, "points");
  assert.match(reply, /875 points/);
});

test("VIP intent summarizes eligibility without automatic guarantee", () => {
  const reply = concierge.buildKenjiReply("VIP", { tier: "Premium" });
  assert.equal(concierge.classifyIntent("VIP").intent, "vip");
  assert.match(reply, /VIP eligibility signals/);
  assert.match(reply, /no automatic guarantee/);
});

test("SVIP intent is Boss Per manual-only and never points-based", () => {
  const reply = concierge.buildKenjiReply("SVIP please", { points_balance: 9999 });
  assert.equal(concierge.classifyIntent("SVIP please", { points_balance: 9999 }).intent, "svip");
  assert.match(reply, /SVIP is Boss Per manual-only/);
  assert.match(reply, /never points-based/);
});

test("Black Card intent is private review and not automatic approval", () => {
  const reply = concierge.buildKenjiReply("Black Card", { points_balance: 9999 });
  assert.equal(concierge.classifyIntent("Black Card", { points_balance: 9999 }).intent, "black_card");
  assert.match(reply, /Black Card is private review/);
  assert.match(reply, /not automatic approval/);
});

test("membership renewal intent wins over high points fallback", () => {
  const result = concierge.classifyIntent("ต่ออายุสมาชิก มีแต้มเยอะ", { points_balance: 5000 });
  assert.equal(result.intent, "membership_renewal");
  assert.match(concierge.buildKenjiReply("renewal", { membership_status: "active" }), /สถานะสมาชิกหรือการต่ออายุ/);
});

test("high points fallback applies only when there is no stronger intent", () => {
  const result = concierge.classifyIntent("what should I do next", { points_balance: 2400 });
  const reply = concierge.buildKenjiReply("what should I do next", { points_balance: 2400 });
  assert.equal(result.intent, "high_points_fallback");
  assert.match(reply, /points look strong/);
  assert.match(reply, /without making automatic VIP, SVIP, or Black Card decisions/);
});

test("sanitized member summary exposes only safe member fields", () => {
  const summary = concierge.sanitizeMemberSummary({
    display_name: "Ken",
    membership_status: "active",
    tier: "VIP",
    points_balance: 1200,
    secret: "do-not-ship",
    api_key: "do-not-ship",
    private_note: "do-not-ship"
  });
  assert.deepEqual(Object.keys(summary), [
    "demo_only",
    "display_name",
    "membership_status",
    "tier",
    "points_balance",
    "points_updated_at",
    "renewal_status",
    "last_verified_at"
  ]);
  assert.equal(summary.display_name, "Ken");
  assert.equal(summary.points_balance, 1200);
});

test("member summary fetch uses t query param only", async () => {
  const calls = [];
  const api = loadConcierge({
    location: { origin: "https://www.mmdbkk.com", search: "?t=abc123&debug=1" },
    fetch: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ member: { membership_status: "active", points_balance: 1500 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const summary = await api.loadSanitizedMemberSummary();
  assert.equal(summary.membership_status, "active");
  assert.equal(summary.points_balance, 1500);
  assert.equal(new URL(calls[0]).searchParams.get("t"), "abc123");
  assert.deepEqual(Array.from(new URL(calls[0]).searchParams.keys()), ["t"]);
});

test("missing backend uses clearly isolated demo-only fallback", async () => {
  const api = loadConcierge({
    location: { origin: "https://www.mmdbkk.com", search: "" }
  });
  const summary = await api.loadSanitizedMemberSummary();
  assert.equal(summary.demo_only, true);
  assert.equal(summary.membership_status, "demo_preview");
});
