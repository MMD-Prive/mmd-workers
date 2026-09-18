import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { APPROVED_ANSWERS } from "./fixtures/kenji-sales-v2-approved.mjs";
import { SALES_CARD_IDS, SALES_ROUTES, SALES_REPLY_VERSION, SALES_REPLY_REVIEW_AT, refineKenjiSalesIntent, publishedSalesCard } from "../src/kenji-sales-reply-v2-policy.mjs";
import { SALES_REPLY_HASHES, validateSalesCard, resolveKenjiSalesReply, inspectKenjiSalesPublication } from "../src/kenji-sales-reply-v2-runtime.mjs";
import { createLineSignature } from "../src/index.js";
import { resolveKenjiSeedDecision, handleKenjiSeedLineRequest } from "../src/kenji-seed-line-runtime.mjs";
import { handleKenjiSeedLineRequestWithRedeliveryRecovery } from "../src/kenji-line-redelivery-recovery.mjs";

const NOW = Date.parse("2026-09-14T12:00:00+07:00");
const AUTHORITY = "my_mmd_entitlement_resolver_v1";
function card(key, changes = {}) {
  return { knowledge_id: SALES_CARD_IDS[key], customer_answer: APPROVED_ANSWERS[key], status: "active", response_mode: "auto_reply_allowed", workflow_stage: "published", workflow_version: 2, allowed_channels: ["LINE_OFC"], allowed_audience: ["Guest", "Standard", "Premium", "Inactive / Expired"], effective_from: "2026-09-14", payload_json: { seed_pack: { version: SALES_REPLY_VERSION }, effective_to: "2026-09-30T16:59:59.999Z" }, ...changes };
}
function event(value, changes = {}) {
  return { type: "message", mode: "active", replyToken: "synthetic-reply-token", source: { type: "user", userId: "U1234567890abcdef1234567890abcdef" }, message: { type: "text", id: "synthetic-v2-event", text: value }, ...changes };
}
function truth(state, changes = {}) {
  return { ok: true, identity_status: "resolved", authority: AUTHORITY, display_name: "ทดสอบ", membership: { level: "private_premium", label: "Premium", lifecycle: state, expire_at: "2026-12-31", member_blocked: false, ...changes } };
}
const ENV = { LINE_KENJI_KNOWLEDGE_ENABLED: "true" };
const options = (intent, extra = {}) => ({ intent, now: NOW, readCard: async (_, key) => card(key), readTruth: async () => ({ ok: false, status: "unavailable" }), ...extra });
function oneSafeCta(decision) {
  assert.ok(decision.text.length < 1600);
  assert.doesNotMatch(decision.text, /\{\{|\}\}|[?&](?:t|token|amount|client_id|payment_ref)=/i);
  const links = decision.text.match(/https?:\/\/[^\s<>]+/g) || [];
  assert.equal(links.length, 1);
  assert.ok(Object.values(SALES_ROUTES).includes(links[0]));
  assert.equal(links[0], decision.cta_route);
}

for (const key of Object.keys(SALES_CARD_IDS)) {
  test(`approved ${key} has an exact reviewed digest and one safe CTA`, async () => {
    assert.equal(createHash("sha256").update(APPROVED_ANSWERS[key]).digest("hex"), SALES_REPLY_HASHES[key]);
    assert.equal(await validateSalesCard(card(key), key, NOW), true);
    assert.equal((APPROVED_ANSWERS[key].match(/https?:\/\//g) || []).length, 1);
  });
}
for (const [label, change] of [
  ["draft", { workflow_stage: "draft" }], ["pending", { status: "pending_review" }],
  ["owner review", { response_mode: "owner_approval_required" }], ["wrong channel", { allowed_channels: ["Webflow"] }],
  ["missing audience", { allowed_audience: [] }], ["wrong card", { knowledge_id: SALES_CARD_IDS.coupon }],
  ["tampered text", { customer_answer: APPROVED_ANSWERS.care_back + " changed" }],
  ["malformed payload", { payload_json: "{" }], ["future effective", { effective_from: "2026-09-20" }],
  ["bad expiry", { payload_json: { seed_pack: { version: SALES_REPLY_VERSION }, effective_to: "invalid" } }],
  ["superseded", { payload_json: { seed_pack: { version: SALES_REPLY_VERSION }, superseded: true } }],
  ["internal", { payload_json: { seed_pack: { version: SALES_REPLY_VERSION }, internal_only: true } }],
]) {
  test(`reject ${label} card`, async () => assert.equal(await validateSalesCard(card("care_back", change), "care_back", NOW), false));
}
test("undated navigation metadata is still bounded by the version cutoff", () => {
  const item = card("payment", { payload_json: { seed_pack: { version: SALES_REPLY_VERSION } } });
  assert.equal(publishedSalesCard(item, SALES_CARD_IDS.payment, NOW), true);
  assert.equal(publishedSalesCard(item, SALES_CARD_IDS.payment, SALES_REPLY_REVIEW_AT), false);
});
for (const [message, prior, expected] of [
  ["CARE BACK", "care_back_overview", "care_back_overview"],
  ["careback", "note_only", "care_back_overview"], ["แคร์แบ็ก", "note_only", "care_back_overview"],
  ["Kenji CARE BACK", "talk_to_per_ai", "care_back_overview"],
  ["CARE BACK สมาชิกยังไม่หมดอายุ", "care_back_expired_member", "care_back_current_member"],
  ["CARE BACK ต่ออายุ", "care_back_expired_member", "care_back_expired_member"],
  ["CARE BACK คูปอง", "care_back_overview", "care_back_coupon_wish"],
  ["CARE BACK ของผม", "care_back_overview", "care_back_personal_status"],
  ["DOUBLE MOMENT จ่าย 20000 ได้อะไร", "payment_slip", "double_moment"],
  ["DOUBLE MOMENT ส่งสลิปแล้ว", "payment_slip", "care_back_payment_points"],
  ["เดือนนี้มีโปรโมชั่นอะไร", "pricing_review", "promotion_overview"],
  ["CARE BACK ข้อมูลลูกค้าคนอื่น", "privacy_request", "privacy_request"],
  ["CARE BACK คุยกับคน", "human_handoff", "human_handoff"],
  ["CARE BACK มีปัญหาโอนเงิน", "payment_dispute", "payment_dispute"],
  ["CARE BACK token", "internal_access", "internal_access"],
]) {
  test(`intent ${message}`, () => assert.equal(refineKenjiSalesIntent(message, prior), expected));
}
test("general CARE BACK answers without requiring a personal lookup", async () => {
  const result = await resolveKenjiSalesReply(event("CARE BACK"), ENV, options("care_back_overview", { readTruth: async () => { throw new Error("Public explanation must not read personal truth"); } }));
  assert.equal(result.text, APPROVED_ANSWERS.care_back);
  assert.match(result.text, /180 วัน/);
  assert.match(result.text, /ปกติ 2 ปี/);
  assert.equal(result.live_truth_used, false);
  oneSafeCta(result);
});
test("current member is not pitched a new signup or unsolicited renewal", async () => {
  const result = await resolveKenjiSalesReply(event("สมัครสมาชิก"), ENV, options("membership_signup", { readTruth: async () => truth("active") }));
  assert.equal(result.cta_route, SALES_ROUTES.status);
  assert.match(result.text, /ไม่ต้องสมัครใหม่/);
  assert.match(result.text, /ทดสอบ/);
  assert.equal(result.live_truth_used, true);
  oneSafeCta(result);
});
for (const state of ["expiring_soon", "expired", "grace"]) {
  test(`${state} directs to account renewal options, never unsigned checkout`, async () => {
    const result = await resolveKenjiSalesReply(event("CARE BACK สมาชิกเดิม"), ENV, options("care_back_current_member", { readTruth: async () => truth(state) }));
    assert.equal(result.cta_route, SALES_ROUTES.renewal);
    assert.doesNotMatch(result.text, /ชำระสำเร็จ|ได้รับสิทธิ์แล้ว|เปิดคูปองแล้ว/);
    oneSafeCta(result);
  });
}
test("explicit renewal by an active member may inspect renewal options", async () => {
  const result = await resolveKenjiSalesReply(event("ต่ออายุ"), ENV, options("membership_renewal", { readTruth: async () => truth("active") }));
  assert.equal(result.cta_route, SALES_ROUTES.renewal);
  oneSafeCta(result);
});
for (const state of ["blocked", "suspended", "revoked", "pending"]) {
  test(`${state} account cannot receive a sales CTA`, async () => {
    const result = await resolveKenjiSalesReply(event("สมัครสมาชิก"), ENV, options("membership_signup", { readTruth: async () => truth(state) }));
    assert.equal(result.handoff_required, true);
    assert.equal(result.cta_route, SALES_ROUTES.status);
    oneSafeCta(result);
  });
}
test("blocked flag wins even when lifecycle says active", async () => {
  const result = await resolveKenjiSalesReply(event("ต่ออายุ"), ENV, options("membership_renewal", { readTruth: async () => truth("active", { member_blocked: true }) }));
  assert.equal(result.handoff_required, true);
  assert.equal(result.cta_route, SALES_ROUTES.status);
});
test("unresolved identity is not announced as a new or expired customer", async () => {
  const result = await resolveKenjiSalesReply(event("CARE BACK ของผม"), ENV, options("care_back_personal_status"));
  assert.equal(result.live_truth_used, false);
  assert.doesNotMatch(result.text, /ตอนนี้สมาชิก.*หมดอายุแล้ว|พี่เป็นลูกค้าใหม่|เพิ่มอายุให้แล้ว/);
  oneSafeCta(result);
});
test("pending proof cue avoids a duplicate payment without claiming receipt", async () => {
  const result = await resolveKenjiSalesReply(event("ต่ออายุ"), ENV, options("membership_renewal", { continuity: { conversation_stage: "awaiting_payment_verification" } }));
  assert.equal(result.cta_route, SALES_ROUTES.payment);
  assert.match(result.text, /ถ้าพี่ส่งหลักฐาน/);
  assert.doesNotMatch(result.text, /ได้รับเงินแล้ว|พบหลักฐาน/);
  oneSafeCta(result);
});
test("human takeover remains silent", async () => {
  const result = await resolveKenjiSalesReply(event("CARE BACK"), ENV, options("care_back_overview", { continuity: { handoff_required: true } }));
  assert.equal(result.text, "");
  assert.equal(result.handoff_required, true);
});
test("missing and expired campaign cards never revive legacy benefits", async () => {
  for (const extra of [{ readCard: async () => null }, { now: SALES_REPLY_REVIEW_AT }]) {
    const result = await resolveKenjiSalesReply(event("CARE BACK"), ENV, options("care_back_overview", extra));
    assert.equal(result.knowledge_hits, 0);
    assert.doesNotMatch(result.text, /90 วัน|150|250|350|คูปองส่วนตัว 10%/);
    oneSafeCta(result);
  }
});

// Integration tests mock every external fetch; no real LINE message is sent.
async function mockedRuntime(run, { killed = false } = {}) {
  const fetchBefore = globalThis.fetch;
  const nowBefore = Date.now;
  const calls = { line: [], writes: [], truth: 0 };
  const env = { ...ENV, AIRTABLE_API_KEY: "synthetic-token", AIRTABLE_BASE_ID: "synthetic-base", LINE_CHANNEL_SECRET: "synthetic-secret", LINE_CHANNEL_ACCESS_TOKEN: "synthetic-line-token", LINE_AUTO_REPLY_ENABLED: "true", LINE_KENJI_AI_ENABLED: "true", INTERNAL_TOKEN: "synthetic-internal", KENJI_LINE_CONTINUITY_ENABLED: "false", ADMIN_WORKER: { fetch: async () => Response.json({ ok: true, controls: { all_kenji_mutations: false, line_oa_auto_reply: killed, model_keyword_auto_reply: false } }) } };
  Date.now = () => NOW;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.line.me") { calls.line.push(JSON.parse(init.body)); return Response.json({}); }
    assert.equal(url.hostname, "api.airtable.com", "No other network is allowed in synthetic tests");
    if ((init.method || "GET") !== "GET") { calls.writes.push(init); return Response.json({ id: "recSynthetic00000" }); }
    const formula = url.searchParams.get("filterByFormula") || "";
    const key = Object.keys(SALES_CARD_IDS).find((name) => formula.includes(SALES_CARD_IDS[name]));
    return Response.json({ records: key ? [{ id: "recSynthetic00000", fields: card(key) }] : [] });
  };
  try { return await run(env, calls); }
  finally { globalThis.fetch = fetchBefore; Date.now = nowBefore; }
}
async function signedRequest(env, item, good = true) {
  const body = JSON.stringify({ events: [item] });
  return new Request("https://www.mmdbkk.com/webhooks/line", { method: "POST", headers: { "content-type": "application/json", "x-line-signature": good ? await createLineSignature(body, env.LINE_CHANNEL_SECRET) : "invalid" }, body });
}
test("primary seed decision selects the actual V2 CARE BACK record", async () => mockedRuntime(async (env) => {
  const result = await resolveKenjiSeedDecision(event("CARE BACK"), env);
  assert.equal(result.reply_pack_version, SALES_REPLY_VERSION);
  assert.deepEqual(result.selected_knowledge_ids, [SALES_CARD_IDS.care_back]);
  assert.equal(result.text, APPROVED_ANSWERS.care_back);
}));
test("valid LINE signature reaches one reviewed reply and its single CTA", async () => mockedRuntime(async (env, calls) => {
  const result = await handleKenjiSeedLineRequest(await signedRequest(env, event("CARE BACK")), env);
  const payload = await result.json();
  assert.equal(result.status, 200);
  assert.equal(payload.saved[0].reply_pack_version, SALES_REPLY_VERSION);
  assert.equal(calls.line.length, 1);
  assert.equal(calls.line[0].messages[0].text, APPROVED_ANSWERS.care_back);
}));
test("invalid signature cannot fetch published cards or send LINE", async () => mockedRuntime(async (env, calls) => {
  const result = await handleKenjiSeedLineRequest(await signedRequest(env, event("CARE BACK"), false), env);
  assert.equal(result.status, 401);
  assert.equal(calls.line.length, 0);
  assert.equal(calls.writes.length, 0);
}));
test("runtime kill switch remains authoritative", async () => mockedRuntime(async (env, calls) => {
  const result = await handleKenjiSeedLineRequest(await signedRequest(env, event("CARE BACK")), env);
  assert.equal(result.status, 200);
  assert.equal(calls.line.length, 0);
}, { killed: true }));
for (const [label, changes] of [["standby", { mode: "standby" }], ["redelivery", { deliveryContext: { isRedelivery: true } }]]) {
  test(`${label} cannot send through the seed transport`, async () => mockedRuntime(async (env, calls) => {
    const result = await handleKenjiSeedLineRequest(await signedRequest(env, event("CARE BACK", changes)), env);
    assert.equal(result.status, 200);
    assert.equal(calls.line.length, 0);
  }));
}
test("redelivery wrapper preserves a named CARE BACK expiry question", async () => mockedRuntime(async (env, calls) => {
  const pending = [];
  const result = await handleKenjiSeedLineRequestWithRedeliveryRecovery(await signedRequest(env, event("CARE BACK สมาชิกหมดอายุ")), env, { waitUntil: (work) => pending.push(work) });
  const payload = await result.json();
  await Promise.all(pending);
  assert.equal(payload.saved[0].intent, "care_back_expired_member");
  assert.equal(payload.saved[0].reply_pack_version, SALES_REPLY_VERSION);
  assert.equal(calls.line.length, 1);
}));
test("read-only publication smoke checks eight records without LINE or telemetry", async () => mockedRuntime(async (env, calls) => {
  const direct = await inspectKenjiSalesPublication(env, NOW);
  assert.equal(direct.ok, true);
  assert.equal(direct.cards.length, 8);
  const response = await handleKenjiSeedLineRequest(new Request("https://www.mmdbkk.com/webhooks/line?kenji_sales_v2_smoke=1"), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).version, SALES_REPLY_VERSION);
  assert.equal(calls.line.length, 0);
  assert.equal(calls.writes.length, 0);
}));
