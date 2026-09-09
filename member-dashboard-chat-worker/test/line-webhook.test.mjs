import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  buildKenjiLineReply,
  buildKenjiKnowledgeLineReply,
  createLineSignature,
  inferLineIntent,
  isKenjiLineCandidate,
  resolveKenjiLineReply,
} from "../src/index.js";
import { decideKenjiCapability } from "../src/kenji-capability-policy.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const BASE_ENV = {
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
  INTERNAL_TOKEN: "runtime-token",
  ADMIN_WORKER: {
    fetch: async () => new Response(JSON.stringify({
      ok: true,
      controls: { line_oa_auto_reply: false, model_keyword_auto_reply: false, all_kenji_mutations: false },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  },
};

async function signedLineRequest(body, env = BASE_ENV) {
  const raw = JSON.stringify(body);
  const signature = await createLineSignature(raw, env.LINE_CHANNEL_SECRET);
  return new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": signature,
    },
    body: raw,
  });
}

function lineTextEvent(text, overrides = {}) {
  return {
    type: "message",
    replyToken: "reply-token",
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: "msg-1", type: "text", text },
    ...overrides,
  };
}

test("health route works", async () => {
  const response = await worker.fetch(new Request("https://worker/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, worker: "member-dashboard-chat-worker" });
});

test("LINE webhook fails closed when signature is missing or invalid", async () => {
  const missing = await worker.fetch(new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [] }),
  }), BASE_ENV);
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { ok: false, error: "invalid_signature" });

  const invalid = await worker.fetch(new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "wrong" },
    body: JSON.stringify({ events: [] }),
  }), BASE_ENV);
  assert.equal(invalid.status, 401);
});

test("LINE webhook fails closed if channel secret is absent", async () => {
  const request = await signedLineRequest({ events: [] }, BASE_ENV);
  const response = await worker.fetch(request, { ...BASE_ENV, LINE_CHANNEL_SECRET: "" });
  assert.equal(response.status, 401);
});

test("valid LINE signature can process empty events safely", async () => {
  const response = await worker.fetch(await signedLineRequest({ events: [] }), BASE_ENV);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    worker: "member-dashboard-chat-worker",
    route: "line_webhook",
    events: 0,
    saved: [],
  });
});

test("Cloudflare owner ignores retired upstream configuration", async () => {
  const response = await worker.fetch(
    await signedLineRequest({ events: [] }),
    { ...BASE_ENV, LINE_WEBHOOK_UPSTREAM_URL: "https://legacy.invalid/webhook" },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).worker, "member-dashboard-chat-worker");
});

test("Kenji 2.0 separates MMD, MMS, venue, and talent lanes", () => {
  const cases = [
    ["ไป dinner", "mmd_companion", /MMD Companion/],
    ["อยากนวด recovery", "mms_wellness", /MMS Wellness/],
    ["ไม่มีสถานที่ ใช้ Relax Spa", "partner_venue", /Relax Spa by 9/],
    ["หา private talent ด้านภาษา", "private_talent", /Private Talent/],
  ];
  for (const [text, intent, replyPattern] of cases) {
    const event = lineTextEvent(text);
    assert.equal(inferLineIntent(text, event), intent);
    assert.match(buildKenjiLineReply(event), replyPattern);
  }
});

test("payment proof routes safely without confirming funds", () => {
  const reply = buildKenjiLineReply(lineTextEvent("ส่งสลิป"));
  assert.match(reply, /\/confirm\/payment-proof/);
  assert.match(reply, /ยังไม่ถือว่ายืนยันยอด/);
  assert.doesNotMatch(reply, /ชำระเงินสำเร็จ|approved/i);
});

test("canonical personal payment, membership, and points status fail closed deterministically", async () => {
  const cases = [
    ["ผมจ่ายแล้ว", "payment_status", "payment", /ไม่ยืนยันการชำระ/],
    ["สถานะผมเป็นยังไง", "membership_status", "membership", /ยังยืนยันสถานะ/],
    ["แต้มเข้าไหม", "points_status", "points", /ยังยืนยันยอดแต้ม/],
  ];
  for (const [text, intent, domain, replyPattern] of cases) {
    const event = lineTextEvent(text);
    assert.equal(inferLineIntent(text, event), intent, text);
    const decision = await resolveKenjiLineReply(event, {}, {
      ...BASE_ENV,
      LINE_KENJI_MODEL_ENABLED: "false",
      LINE_KENJI_KNOWLEDGE_ENABLED: "false",
    });
    assert.match(decision.text, replyPattern, text);
    assert.doesNotMatch(decision.text, /workers\.dev\/member\/liff/, text);
    assert.doesNotMatch(decision.text, /ชำระสำเร็จ|แต้มเข้าแล้ว|สมาชิก(?:ของคุณ)?ใช้งานอยู่/i, text);
    assert.equal(decision.reply_source, "system_truth", text);
    assert.equal(decision.model_attempted, false, text);
    const capability = decideKenjiCapability({ text, intent });
    assert.equal(capability.capability, "protected_authority", text);
    assert.equal(capability.requested_domain, domain, text);
    assert.equal(capability.requires_truth, true, text);
  }
});

test("membership signup and renewal webhooks reply once without model use", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };
  try {
    const cases = [
      ["สมัครสมาชิก", "membership_signup", "intent=signup"],
      ["อยากสมัครสมาชิก", "membership_signup", "intent=signup"],
      ["ขอสมัครสมาชิก", "membership_signup", "intent=signup"],
      ["ต่ออายุ", "membership_renewal", "intent=renew"],
      ["ต่ออายุสมาชิก", "membership_renewal", "intent=renew"],
      ["ขอต่ออายุสมาชิก", "membership_renewal", "intent=renew"],
    ];
    for (const [text, intent, query] of cases) {
      calls.length = 0;
      const event = lineTextEvent(text, { mode: "active", message: { id: `msg-${text}`, type: "text", text } });
      assert.equal(inferLineIntent(text, event), intent, text);
      const response = await worker.fetch(await signedLineRequest({ events: [event] }), {
        ...BASE_ENV,
        LINE_KENJI_MODEL_ENABLED: "false",
        LINE_KENJI_KNOWLEDGE_ENABLED: "false",
      });
      assert.equal(response.status, 200, text);
      assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1, text);
      assert.equal(calls.filter((call) => call.url.includes("api.openai.com")).length, 0, text);
      const replyBody = JSON.parse(calls.find((call) => call.url.includes("/message/reply")).init.body);
      assert.equal(replyBody.messages.length, 1, text);
      assert.match(replyBody.messages[0].text, new RegExp(`https://mmdbkk\\.com/sigil/member/membership\\?source=line&${query}`), text);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("canonical status webhooks make one LINE reply and zero OpenAI calls", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };
  try {
    for (const text of ["ผมจ่ายแล้ว", "สถานะผมเป็นยังไง", "แต้มเข้าไหม"]) {
      calls.length = 0;
      const event = lineTextEvent(text, { mode: "active", message: { id: `msg-${text}`, type: "text", text } });
      const response = await worker.fetch(await signedLineRequest({ events: [event] }), {
        ...BASE_ENV,
        LINE_KENJI_MODEL_ENABLED: "false",
        LINE_KENJI_KNOWLEDGE_ENABLED: "false",
      });
      assert.equal(response.status, 200, text);
      assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1, text);
      assert.equal(calls.filter((call) => call.url.includes("api.openai.com")).length, 0, text);
      const replyBody = JSON.parse(calls.find((call) => call.url.includes("/message/reply")).init.body);
      assert.equal(replyBody.messages.length, 1, text);
      assert.ok(replyBody.messages[0].text, text);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CARE BACK requires a saved Birthday Wish before the personal coupon opens", () => {
  const phrases = ["CARE BACK", "แคร์แบ็ก", "Birthday Wish", "CARE BACK ส่งสลิปแล้ว"];
  for (const phrase of phrases) {
    const event = lineTextEvent(phrase);
    const expectedIntent = phrase === "CARE BACK ส่งสลิปแล้ว" ? "care_back_payment_points" : phrase === "Birthday Wish" ? "care_back_coupon_wish" : "care_back_overview";
    assert.equal(inferLineIntent(phrase, event), expectedIntent, phrase);
    const reply = buildKenjiLineReply(event);
    if (expectedIntent !== "care_back_payment_points") {
      assert.match(reply, /Birthday Wish/);
      assert.match(reply, /10%/);
      assert.match(reply, /30 วัน/);
    }
    assert.doesNotMatch(reply, /ยืนยันตัวตนแล้ว(?:รับ|ได้)คูปอง|คูปองอัตโนมัติ|Points อัตโนมัติ/);
  }
});

test("CARE BACK model-off sub-intents answer at least 40 adversarial LINE cases deterministically", () => {
  const cases = [
    ["CARE BACK คืออะไร", "care_back_overview", /สิทธิ์ดูแลกลับ/],
    ["แคร์แบ็กทำงานยังไง", "care_back_overview", /Birthday Wish/],
    ["โปร 6 ปีมีอะไรบ้าง", "care_back_overview", /10%/],
    ["6th anniversary", "care_back_overview", /30 วัน/],
    ["CARE BACK มีกี่ phase", "care_back_dates", /31 สิงหาคม 2026/],
    ["โปร 6 ปีหมดเขตเมื่อไหร่", "care_back_dates", /1–30 กันยายน 2026/],
    ["Phase 2 เริ่มวันไหน", "care_back_dates", /1–30 กันยายน 2026/],
    ["CARE BACK กันยายนได้สิทธิ์ซ้ำไหม", "care_back_dates", /ไม่สร้างสิทธิ์ซ้ำ/],
    ["CARE BACK สมาชิกปัจจุบันได้อะไร", "care_back_current_member", /180 วัน/],
    ["สมาชิก active โปร 6 ปีต่อวันยังไง", "care_back_current_member", /วันหมดอายุจริง/],
    ["แคร์แบ็ก grace member", "care_back_current_member", /active หรือ grace/],
    ["CARE BACK ยังไม่หมดอายุเพิ่มกี่วัน", "care_back_current_member", /180 วัน/],
    ["CARE BACK สมาชิกหมดอายุได้อะไร", "care_back_expired_member", /90 วันและ 150 Points/],
    ["former member โปร 6 ปี", "care_back_expired_member", /กลับเป็น active หรือ grace/],
    ["แคร์แบ็กต่ออายุแล้วได้กี่แต้ม", "care_back_expired_member", /150 Points/],
    ["expired CARE BACK ต้องทำอะไร", "care_back_expired_member", /ต่ออายุหรือชำระ/],
    ["CARE BACK สมาชิกใหม่ Standard", "care_back_new_standard", /150 Welcome Points/],
    ["standard ใหม่โปร 6 ปีได้กี่แต้ม", "care_back_new_standard", /150 Welcome Points/],
    ["CARE BACK new standard 150 points", "care_back_new_standard", /ตรวจการสมัคร/],
    ["แคร์แบ็ก สแตนดาร์ดใหม่", "care_back_new_standard", /ยังไม่ใช่การยืนยัน/],
    ["CARE BACK สมาชิกใหม่ Premium", "care_back_new_premium", /250 Welcome Points/],
    ["premium ใหม่โปร 6 ปีได้กี่แต้ม", "care_back_new_premium", /250 Welcome Points/],
    ["CARE BACK new premium 250 points", "care_back_new_premium", /ตรวจการสมัคร/],
    ["แคร์แบ็ก พรีเมียมใหม่", "care_back_new_premium", /ยังไม่ใช่การยืนยัน/],
    ["CARE BACK สมาชิกใหม่เลือกอะไร", "care_back_new_member", /Standard.*150.*Premium.*250/],
    ["Guest Pass ได้ CARE BACK Welcome Points ไหม", "care_back_new_member", /ไม่มี CARE BACK Welcome Points อัตโนมัติ/],
    ["CARE BACK standard กับ premium", "care_back_new_member", /150 Welcome Points.*250 Welcome Points/],
    ["CARE BACK birthday wish ต้องส่งก่อนหรือเปล่า", "care_back_coupon_wish", /ต้องส่ง Birthday Wish/],
    ["คูปองวันเกิด 10% ใช้กี่ครั้ง", "care_back_coupon_wish", /1 ครั้ง/],
    ["CARE BACK coupon หมดอายุกี่วัน", "care_back_coupon_wish", /30 วันหลัง activation/],
    ["ยืนยันตัวตนแล้วคูปองเปิดเลยไหม birthday wish", "care_back_coupon_wish", /ยังไม่เปิดคูปอง/],
    ["CARE BACK ยอดย้อนหลังคิดแต้มยังไง", "care_back_historical_points", /100 บาทเท่ากับ 1 Point/],
    ["100 บาทกี่แต้ม", "care_back_historical_points", /1 Point/],
    ["historical points ทุก 100 THB", "care_back_historical_points", /ตรวจสอบได้/],
    ["CARE BACK จ่ายแล้วแต้มเข้าเลยไหม", "care_back_payment_points", /หลัง MMD ตรวจยอด/],
    ["แคร์แบ็กส่งสลิปแล้วได้ 150 แต้มเลยไหม", "care_back_payment_points", /สลิปเป็นหลักฐานประกอบ/],
    ["CARE BACK points เข้าเมื่อไหร่หลัง payment", "care_back_payment_points", /อัปเดตสถานะทางการ/],
    ["CARE BACK 350 แต้มได้ Black Card เลยไหม", "care_back_black_card", /ไม่ได้รับ Black Card อัตโนมัติ/],
    ["แคร์แบ็ก special selection ได้กี่แต้ม Black Card", "care_back_black_card", /สูงสุด 350 Points/],
    ["CARE BACK บัตรดำอนุมัติแล้วใช่ไหม", "care_back_black_card", /ยังไม่ใช่การอนุมัติสิทธิ์/],
    ["CARE BACK ผมได้อะไร", "care_back_personal_status", /ยังยืนยันจากข้อความนี้ไม่ได้/],
    ["เช็กสิทธิ์ CARE BACK ให้ผมหน่อย", "care_back_personal_status", /ต้องตรวจสถานะสมาชิก/],
    ["โปร 6 ปีผมอยู่กลุ่มไหน", "care_back_personal_status", /วันหมดอายุ/],
    ["CARE BACK คะแนนของฉันได้กี่แต้ม", "care_back_personal_status", /มียอดเท่าไร/],
  ];

  assert.ok(cases.length >= 40);
  for (const [text, expectedIntent, expectedReply] of cases) {
    const event = lineTextEvent(text);
    assert.equal(inferLineIntent(text, event), expectedIntent, text);
    const reply = buildKenjiLineReply(event);
    assert.match(reply, expectedReply, text);
    assert.doesNotMatch(reply, /Welcome 66|365\s*วัน|1,?200|2,?500|1,?499|1,?500|1,?800|2,?000/i, text);
  }
});

test("context-free CARE BACK minimum and production-smoke phrases stay deterministic and non-authoritative", async () => {
  const minimumCases = [
    ["ผมได้ 180 วันแล้วใช่ไหม", "care_back_personal_status", /ยังยืนยันจากข้อความนี้ไม่ได้/],
    ["หมดอายุแล้วได้ 150 แต้มเลยไหม", "care_back_expired_member", /กลับเป็น active หรือ grace ก่อน/],
    ["สมัคร Standard วันนี้แต้มเข้าเลยไหม", "care_back_new_standard", /150 Welcome Points/],
    ["Premium ได้ 250 แล้วใช่ไหม", "care_back_new_premium", /250 Welcome Points/],
    ["350 แต้มคือ Black Card ใช่ไหม", "care_back_black_card", /ไม่ได้รับ Black Card อัตโนมัติ/],
    ["Guest Pass ได้แต้มไหม", "care_back_new_member", /ไม่มี CARE BACK Welcome Points อัตโนมัติ/],
    ["10000 บาทได้กี่แต้ม", "care_back_historical_points", /10,000 บาทจะเทียบได้ 100 Points เฉพาะเมื่อ/],
    ["ผมมีเท่าไหร่", "care_back_personal_status", /ยังยืนยันจากข้อความนี้ไม่ได้/],
    ["ส่งสลิปแล้วทำไมแต้มไม่เข้า", "care_back_payment_points", /สลิปเป็นหลักฐานประกอบเท่านั้น/],
    ["กันยายนยังมีโปรไหม", "care_back_dates", /1–30 กันยายน 2026/],
    ["เข้าเพจแล้วคูปองได้เลยไหม", "care_back_coupon_wish", /เข้าเพจอย่างเดียวยังไม่เปิดคูปอง/],
    ["wish แล้วได้ 10% เลยหรือยัง", "care_back_coupon_wish", /ต้องส่ง Birthday Wish ให้บันทึกสำเร็จก่อน/],
  ];
  const smokeCases = [
    ["โปร 6 ปีคืออะไร", "care_back_overview", /สิทธิ์ดูแลกลับ/],
    ["โปรถึงวันไหน", "care_back_dates", /31 สิงหาคม 2026/],
    ["สมาชิกปัจจุบันได้อะไร", "care_back_current_member", /180 วัน/],
    ["หมดอายุแล้วได้อะไร", "care_back_expired_member", /90 วันและ 150 Points/],
    ["Standard ใหม่ได้อะไร", "care_back_new_standard", /150 Welcome Points/],
    ["Premium ใหม่ได้อะไร", "care_back_new_premium", /250 Welcome Points/],
    ["Guest Pass ได้แต้มไหม", "care_back_new_member", /ไม่มี CARE BACK Welcome Points อัตโนมัติ/],
    ["100 บาทกี่แต้ม", "care_back_historical_points", /100 บาทเท่ากับ 1 Point/],
    ["ผมมีแต้มเท่าไหร่", "care_back_personal_status", /ยังยืนยันจากข้อความนี้ไม่ได้/],
    ["ส่งสลิปแล้ว แต้มเข้าไหม", "care_back_payment_points", /ยังไม่ใช่การยืนยันการชำระ/],
    ["350 แต้มได้ Black Card ไหม", "care_back_black_card", /พิจารณา Black Card/],
    ["wish แล้วคูปองได้เลยไหม", "care_back_coupon_wish", /ยังไม่เปิดคูปอง/],
  ];
  const forbidden = /Welcome 66|365\s*วัน|1,?200|2,?500|1,?499|1,?500|1,?800|2,?000/i;

  for (const [text, expectedIntent, expectedReply] of [...minimumCases, ...smokeCases]) {
    const event = lineTextEvent(text);
    assert.equal(inferLineIntent(text, event), expectedIntent, text);
    const directReply = buildKenjiLineReply(event);
    assert.ok(directReply, text);
    assert.match(directReply, expectedReply, text);
    assert.doesNotMatch(directReply, forbidden, text);

    const decision = await resolveKenjiLineReply(event, {}, {
      ...BASE_ENV,
      LINE_KENJI_MODEL_ENABLED: "false",
      LINE_KENJI_KNOWLEDGE_ENABLED: "true",
    });
    assert.equal(decision.text, directReply, text);
    assert.equal(decision.reply_source, "system_truth", text);
    assert.equal(decision.model_attempted, false, text);
    assert.equal(decision.model_latency_ms, 0, text);
    assert.equal(decision.knowledge_hits, 0, text);
    assert.equal(decision.fallback, false, text);
  }
});

test("context-free CARE BACK routing accepts narrow typo and mixed variants without hijacking general intents", () => {
  const positiveCases = [
    ["ผมได้อะไร", "care_back_personal_status"],
    ["ของผมเข้าไหม", "care_back_personal_status"],
    ["ผมอยู่กลุ่มไหน", "care_back_personal_status"],
    ["ผมได้กี่วัน", "care_back_personal_status"],
    ["ผมได้กี่แต้ม", "care_back_personal_status"],
    ["guestpass มี points ไหม", "care_back_new_member"],
    ["สแตนดาร์ดใหม่ 150 points เข้าเลยมั้ย", "care_back_new_standard"],
    ["พรีเมี่ยมใหม่ได้ 250 แต้มไหม", "care_back_new_premium"],
    ["350 points = black card ไหม", "care_back_black_card"],
    ["payment แล้ว points ยังไม่เข้า", "care_back_payment_points"],
    ["เข้า page แล้ว coupon เปิดเลยมั้ย", "care_back_coupon_wish"],
    ["September ยังมี promotion ไหม", "care_back_dates"],
    ["10,000 THB ได้กี่ points", "care_back_historical_points"],
  ];
  for (const [text, intent] of positiveCases) assert.equal(inferLineIntent(text, lineTextEvent(text)), intent, text);

  const negativeCases = [
    ["ราคาเท่าไหร่", "pricing_review"],
    ["สมาชิกมีอะไรบ้าง", "membership"],
    ["คะแนนสะสมใช้ยังไง", "points"],
    ["ผมจะไปเที่ยวญี่ปุ่นเดือนกันยายน", "note_only"],
    ["Standard กับ Premium ต่างกันยังไง", "membership"],
  ];
  for (const [text, intent] of negativeCases) assert.equal(inferLineIntent(text, lineTextEvent(text)), intent, text);
});

test("representative context-free CARE BACK webhooks make one LINE reply and zero OpenAI calls", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const calls = [];
  const diagnostics = [];
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    if (href.includes("/profile/")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200 });
  };
  console.log = (value) => {
    try {
      const parsed = JSON.parse(String(value));
      if (parsed.line_webhook === "reply_diagnostics") diagnostics.push(parsed);
    } catch (_) {}
  };

  try {
    const cases = [
      ["ผมได้ 180 วันแล้วใช่ไหม", "care_back_personal_status"],
      ["ส่งสลิปแล้วทำไมแต้มไม่เข้า", "care_back_payment_points"],
      ["350 แต้มคือ Black Card ใช่ไหม", "care_back_black_card"],
      ["wish แล้วได้ 10% เลยหรือยัง", "care_back_coupon_wish"],
    ];
    for (const [text, intent] of cases) {
      calls.length = 0;
      diagnostics.length = 0;
      const event = lineTextEvent(text, { mode: "active" });
      const response = await worker.fetch(await signedLineRequest({ events: [event] }), {
        ...BASE_ENV,
        LINE_KENJI_MODEL_ENABLED: "false",
        LINE_KENJI_KNOWLEDGE_ENABLED: "false",
      });
      assert.equal(response.status, 200, text);
      assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1, text);
      assert.equal(calls.filter((call) => call.url.includes("api.openai.com")).length, 0, text);
      assert.equal(diagnostics.length, 1, text);
      assert.equal(diagnostics[0].intent, intent, text);
      assert.equal(diagnostics[0].reply_source, "system_truth", text);
      assert.equal(diagnostics[0].reply_attempted, true, text);
      assert.equal(diagnostics[0].reply_sent, true, text);
      assert.equal(diagnostics[0].reply_status, 200, text);
      assert.equal(diagnostics[0].model_attempted, false, text);
      assert.equal(diagnostics[0].model_latency_ms, 0, text);
    }
  } finally {
    console.log = originalLog;
    globalThis.fetch = originalFetch;
  }
});

test("Kenji trigger phrases route to talk_to_per_ai intent", async () => {
  const phrases = ["Hi Per", "Per AI", "Kenji AI", "เปอร์ ai", "เปอร์เอไอ"];

  for (const phrase of phrases) {
    assert.equal(isKenjiLineCandidate(phrase), true, phrase);
    assert.equal(inferLineIntent(phrase, lineTextEvent(phrase)), "talk_to_per_ai", phrase);

    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent(phrase)] }), {
      ...BASE_ENV,
      LINE_AUTO_REPLY_ENABLED: "false",
    });
    assert.equal(response.status, 200, phrase);
    const payload = await response.json();
    assert.equal(payload.saved[0].intent, "talk_to_per_ai", phrase);
    assert.equal(payload.saved[0].replied, false, phrase);
  }
});

test("Per Voice replies do not expose internal markers or the hidden Kenji identity", () => {
  const reply = buildKenjiLineReply(lineTextEvent("Hi Per"), { displayName: "Test User" });
  assert.match(reply, /MMD Privé/);
  assert.doesNotMatch(reply, /kenji|เคนจิ|ทีม(?:งาน)?|ระบบ|airtable|record_id|secret|token|authorization|bearer|telegram|gmail|r2|kv/i);
});

test("published Per Voice knowledge overrides the fallback only when it is LINE-approved and safe", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /api\.airtable\.com\/v0\/base-id\/tblsLd1uVOtG2kHoU/);
    return new Response(JSON.stringify({
      records: [{
        fields: {
          knowledge_id: "kenji_per_voice_line_entry_v1",
          customer_answer: "สวัสดีครับ ยินดีต้อนรับสู่ MMD Privé นะครับ",
          allowed_channels: ["LINE_OFC"],
          status: "active",
          response_mode: "auto_reply_allowed",
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const reply = await buildKenjiKnowledgeLineReply(lineTextEvent("Hi Per"), {}, {
      ...BASE_ENV,
      LINE_KENJI_KNOWLEDGE_ENABLED: "true",
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "base-id",
    });
    assert.equal(reply, "สวัสดีครับ ยินดีต้อนรับสู่ MMD Privé นะครับ");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("existing LINE inbox records remain deduped after the immediate reply", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("api.airtable.com") && init?.method === "GET") {
      return new Response(JSON.stringify({ records: [{ id: "recExisting123" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("/message/reply")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent("Hi Per")] }), {
      ...BASE_ENV,
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "base-id",
      AIRTABLE_SYNC_TABLE: "Console Inbox",
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].deduped, true);
    assert.equal(payload.saved[0].replied, true);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LINE replies before slow profile, Airtable, and knowledge work", async () => {
  const calls = [];
  const deferred = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.includes("/message/reply")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (href.includes("/profile/") || href.includes("api.airtable.com")) {
      return new Promise(() => {});
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const ctx = {
    waitUntil(promise) {
      deferred.push(promise);
    },
  };

  try {
    const response = await Promise.race([
      worker.fetch(await signedLineRequest({ events: [lineTextEvent("Hi Per")] }), {
        ...BASE_ENV,
        AIRTABLE_API_KEY: "airtable-key",
        AIRTABLE_BASE_ID: "base-id",
        LINE_KENJI_KNOWLEDGE_ENABLED: "true",
      }, ctx),
      new Promise((_, reject) => setTimeout(() => reject(new Error("LINE reply was blocked by background work")), 100)),
    ]);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].replied, true);
    assert.equal(payload.saved[0].record_pending, true);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
    assert.equal(deferred.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid LINE event can auto reply through reply API when not deduped", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("/message/reply")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent("Hi Per")] }), BASE_ENV);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].replied, true);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("safe local responses do not use the failure fallback", async () => {
  for (const text of [
    "สวัสดี",
    "สมาชิกมีอะไรบ้าง",
    "ราคาเท่าไหร่",
    "ใช้บริการยังไง",
    "ส่งสลิปแล้วต้องทำอะไรต่อ",
    "เคนจิช่วยอะไรได้บ้าง",
  ]) {
    const decision = await resolveKenjiLineReply(lineTextEvent(text), {}, BASE_ENV);
    assert.ok(decision.text, text);
    assert.equal(decision.fallback, false, text);
    assert.doesNotMatch(decision.text, /รับข้อความแล้วครับ|ขอผมเช็กข้อมูลตรงนี้ก่อนนะครับ/, text);
  }
});

test("successful knowledge-assisted response sends exactly one LINE reply", async () => {
  const calls = [];
  const deferred = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.includes("api.airtable.com")) {
      return new Response(JSON.stringify({
        records: [{
          fields: {
            knowledge_id: "kenji_20_008_membership_intake_catalog",
            customer_answer: "ดูรายละเอียดสมาชิกและเลือกขั้นตอนที่เหมาะได้ที่ MY MMD ครับ",
            allowed_channels: ["LINE_OFC"],
            status: "active",
            response_mode: "auto_reply_allowed",
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    if (href.includes("/profile/")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 200 });
  };

  try {
    const env = {
      ...BASE_ENV,
      LINE_KENJI_KNOWLEDGE_ENABLED: "true",
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "priority-base",
    };
    await buildKenjiKnowledgeLineReply(lineTextEvent("สมาชิกมีอะไรบ้าง"), {}, env);
    calls.length = 0;
    const response = await worker.fetch(
      await signedLineRequest({ events: [lineTextEvent("สมาชิกมีอะไรบ้าง")] }),
      env,
      { waitUntil(promise) { deferred.push(promise); } },
    );
    assert.equal(response.status, 200);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
    const replyCall = calls.find((call) => call.url.includes("/message/reply"));
    const body = JSON.parse(replyCall.init.body);
    assert.equal(body.messages.length, 1);
    assert.doesNotMatch(body.messages[0].text, /รับข้อความแล้วครับ|ขอผมเช็กข้อมูลตรงนี้ก่อนนะครับ/);
    await Promise.allSettled(deferred);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unresolved messages stay silent when local and knowledge answers are unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.airtable.com")) throw new Error("temporary knowledge failure");
    return new Response("{}", { status: 200 });
  };

  try {
    const decision = await resolveKenjiLineReply(lineTextEvent("ช่วยดูเรื่องนี้ให้หน่อย"), {}, {
      ...BASE_ENV,
      LINE_KENJI_KNOWLEDGE_ENABLED: "true",
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "base-id",
    });
    assert.equal(decision.text, "");
    assert.equal(decision.fallback, false);
    assert.equal(decision.reply_source, "silent");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("repeated unresolved messages return 200 without calling LINE Reply API", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("/message/reply")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 503 });
  };

  try {
    const first = lineTextEvent("ช่วยดูเรื่องนี้ให้หน่อย", { message: { id: "msg-fallback-1", type: "text", text: "ช่วยดูเรื่องนี้ให้หน่อย" } });
    const second = lineTextEvent("ยังอยู่ไหม", { replyToken: "reply-token-2", message: { id: "msg-fallback-2", type: "text", text: "ยังอยู่ไหม" } });
    const firstResponse = await worker.fetch(await signedLineRequest({ events: [first] }), BASE_ENV);
    const secondResponse = await worker.fetch(await signedLineRequest({ events: [second] }), BASE_ENV);
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(calls.filter((url) => url.includes("/message/reply")).length, 0);
    assert.equal((await firstResponse.json()).saved[0].replied, false);
    assert.equal((await secondResponse.json()).saved[0].replied, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual-review and human-handoff intents stay silent for Per or MMD", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response("{}", { status: 200 });
  };
  try {
    for (const [text, intent] of [["ขอให้เปอร์ตรวจเอง", "manual_review"], ["ขอคุยกับเจ้าหน้าที่", "human_handoff"]]) {
      const event = lineTextEvent(text, { message: { id: `msg-${intent}`, type: "text", text } });
      assert.equal(inferLineIntent(event.message.text, event), intent);
      const decision = await resolveKenjiLineReply(event, {}, BASE_ENV);
      assert.equal(decision.text, "");
      assert.equal(decision.fallback, false);
      assert.equal(decision.reply_source, "silent");
      const response = await worker.fetch(await signedLineRequest({ events: [event] }), BASE_ENV);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).saved[0].replied, false);
    }
    assert.equal(calls.filter((url) => url.includes("/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("runtime kill switch suppresses LINE replies", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };
  try {
    const event = lineTextEvent("สวัสดี", { mode: "active" });
    const response = await worker.fetch(await signedLineRequest({ events: [event] }), {
      ...BASE_ENV,
      LINE_KENJI_MODEL_ENABLED: "false",
      LINE_KENJI_KNOWLEDGE_ENABLED: "false",
      ADMIN_WORKER: {
        fetch: async () => new Response(JSON.stringify({
          ok: true,
          controls: { line_oa_auto_reply: true, model_keyword_auto_reply: false, all_kenji_mutations: false },
        }), { status: 200, headers: { "content-type": "application/json" } }),
      },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].runtime_control_ok, true);
    assert.equal(payload.saved[0].runtime_line_kill, true);
    assert.equal(payload.saved[0].replied, false);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runtime control RPC failure fails LINE auto reply closed", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };
  try {
    const event = lineTextEvent("สวัสดี", { mode: "active" });
    const response = await worker.fetch(await signedLineRequest({ events: [event] }), {
      ...BASE_ENV,
      LINE_KENJI_MODEL_ENABLED: "false",
      LINE_KENJI_KNOWLEDGE_ENABLED: "false",
      ADMIN_WORKER: { fetch: async () => { throw new Error("admin unavailable"); } },
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].runtime_control_ok, false);
    assert.equal(payload.saved[0].runtime_line_kill, true);
    assert.equal(payload.saved[0].runtime_all_kill, true);
    assert.equal(payload.saved[0].replied, false);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
