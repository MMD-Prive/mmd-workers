import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { handleLineRightsCheck, isLineRightsCheck, renderLineRightsCheck } from "../src/kenji-line-rights-check.mjs";
import { KenjiModelIdempotency } from "../src/kenji-model-idempotency.js";
globalThis.crypto ||= webcrypto;
const UID = `U${"1".repeat(32)}`;
const sha = async s => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString("hex");
const event = (id = "event-1", text = "เช็กสิทธิ์") => ({ type: "message", timestamp: Date.now(), mode: "active", webhookEventId: id, replyToken: "mock-only", source: { type: "user", userId: UID }, message: { id, type: "text", text } });
const truth = () => ({ ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved", membership: { level: "private_premium", lifecycle: "active", expire_at: "2028-10-01", member_blocked: false }, points: { status: "verified", authority: "canonical_paid_points_source_guard_v1", active_points: 123 }, renewal: { status: "ready", package_code: "premium", amount_thb: 2500, membership_years: 2, history_status: "verified", discount_verified: true } });
async function fixture() {
  const map = new Map(); let queue = Promise.resolve();
  const storage = { get: async key => map.get(key), put: async (key,value) => map.set(key,value), delete: async key => map.delete(key), getAlarm: async () => null, setAlarm: async () => {}, transaction: fn => { const work = queue.then(() => fn(storage)); queue = work.catch(() => {}); return work; } };
  const object = new KenjiModelIdempotency({ storage });
  const env = { KENJI_LINE_RIGHTS_CHECK_MODE: "pilot", KENJI_LINE_RIGHTS_CHECK_PILOT_HASHES: await sha(UID), LINE_AUTO_REPLY_ENABLED: "true", LINE_KENJI_AI_ENABLED: "true", KENJI_MODEL_DEDUPE: { idFromName: x => x, get: () => ({ fetch: (url,init) => object.fetch(new Request(url,init)) }) } };
  const counters = { replies: [], cases: 0, truth: 0, history: 0 }; const continuity = { matrix: {} };
  const runtime = { ok: true, controls: {} };
  const services = { continuity: async () => continuity, takeover: async () => ({ ok: true, active: false }), runtime: async () => runtime,
    truth: async () => { counters.truth++; return truth(); }, matrix: async args => { counters.cases++; continuity.matrix = { handoff_required: true, handoff_reason: args.decision.handoff_reason }; return { id: "fixture-matrix" }; },
    deliver: async (env,event,text) => { counters.replies.push(text); return true; }, history: async () => { counters.history++; } };
  return { env, event: event(), runtime, services, counters, continuity };
}
for (const text of ["เช็กสิทธิ์", "เช็คสิทธิ์", "เช็คสิทธิ์สมาชิกครับ", "ต่ออายุ"]) test(`accepts ${text}`, () => assert.equal(isLineRightsCheck(event("one",text)), true));
for (const text of ["ขอเช็กสิทธิ์ของคนอื่น", "โอนแล้ว", "สลิป", "เพิ่ม points", "เช็กสิทธิ์ CARE BACK"]) test(`does not intercept ${text}`, () => assert.equal(isLineRightsCheck(event("one",text)), false));
test("off leaves established lane untouched", async () => { const f = await fixture(); f.env.KENJI_LINE_RIGHTS_CHECK_MODE = "off"; assert.equal(await handleLineRightsCheck(f), null); assert.equal(f.counters.truth,0); });
test("owner pilot uses own signed provider identity only", async () => { const f = await fixture(); f.event.source.userId = `U${"2".repeat(32)}`; assert.equal((await handleLineRightsCheck(f)).reason,"outside_owner_pilot"); assert.equal(f.counters.replies.length,0); });
test("concurrent duplicate has one reply and one truth read using actual DO", async () => { const f = await fixture(); const results = await Promise.all([handleLineRightsCheck(f),handleLineRightsCheck(f)]); assert.equal(results.filter(x => x.replied).length,1); assert.equal(f.counters.replies.length,1); assert.equal(f.counters.truth,1); assert.match(f.counters.replies[0], /123 Points/); assert.match(f.counters.replies[0], /2,500 บาท/); });
test("distinct retries create one actionable missing-evidence case", async () => { const f = await fixture(); f.services.truth = async () => ({}); await handleLineRightsCheck(f); await handleLineRightsCheck({ ...f, event: event("event-2") }); assert.equal(f.counters.cases,1); assert.match(f.continuity.matrix.handoff_reason,/canonical_identity_membership/); assert.match(f.counters.replies[0],/ส่งเรื่องให้เปอร์ตรวจแล้ว/); });
test("case write failure never claims it was queued", async () => { const f = await fixture(); f.services.truth = async () => ({}); f.services.matrix = async () => ({ skipped: true }); await handleLineRightsCheck(f); assert.match(f.counters.replies[0],/ยังส่งเรื่องเข้าคิวตรวจไม่สำเร็จ/); });
test("owner takeover before read silences lane", async () => { const f = await fixture(); f.services.takeover = async () => ({ ok: true, active: true }); await handleLineRightsCheck(f); assert.equal(f.counters.truth,0); assert.equal(f.counters.replies.length,0); });
test("owner takeover during truth lookup silences lane", async () => { const f = await fixture(); let calls = 0; f.services.takeover = async () => ({ ok: true, active: ++calls > 1 }); await handleLineRightsCheck(f); assert.equal(f.counters.replies.length,0); });
test("fresh kill after truth silences lane", async () => { const f = await fixture(); f.services.runtime = async () => ({ ok: true, controls: { line_oa_auto_reply: true } }); await handleLineRightsCheck(f); assert.equal(f.counters.replies.length,0); });
test("initial kill produces no writes or reads", async () => { const f = await fixture(); f.runtime.controls.all_kenji_mutations = true; await handleLineRightsCheck(f); assert.equal(f.counters.truth,0); assert.equal(f.counters.cases,0); });
test("failed delivery never retries ambiguous event or records outbound", async () => { const f = await fixture(); let attempts=0; f.services.deliver = async () => { attempts++; return false; }; await handleLineRightsCheck(f); await handleLineRightsCheck(f); assert.equal(attempts,1); assert.equal(f.counters.history,0); });
test("redelivery never produces customer reply", async () => { const f = await fixture(); f.event.deliveryContext = { isRedelivery: true }; await handleLineRightsCheck(f); assert.equal(f.counters.truth,0); });
test("uncertain profile amount and historical points never become spendable", () => { const t = truth(); t.points = { status:"verified", active_points:61320, historicalPoints:{ grossPoints:61320 } }; const d = renderLineRightsCheck(t); assert.doesNotMatch(d.text,/61,320/); assert.ok(d.missing.includes("canonical_paid_points")); });
for (const level of ["vip", "svip", "black_card"]) test(`preserves ${level} and blocks package downgrade`, () => { const t=truth(); t.membership.level=level; const d=renderLineRightsCheck(t); assert.match(d.text, new RegExp(level === "black_card" ? "Black Card" : level.toUpperCase())); assert.doesNotMatch(d.text,/2,500/); assert.ok(d.missing.includes("protected_tier_owner_review")); });
test("blocked member cannot receive renewal price", () => { const t=truth(); t.membership.member_blocked=true; assert.doesNotMatch(renderLineRightsCheck(t).text,/2,500/); });
test("new signup classification is honest", () => { const t=truth(); t.membership.lifecycle="expired"; t.renewal={status:"review_required",classification:"new_signup"}; assert.match(renderLineRightsCheck(t).text,/สมัครใหม่/); });

test("actual signed ingress reaches command with general stop; invalid signature cannot read or reply", async () => {
  const { createLineSignature } = await import("../src/index.js");
  const { handleKenjiSeedLineRequest } = await import("../src/kenji-seed-line-runtime.mjs");
  const f = commandFixture(await fixture()); let delivered = 0; let truthReads = 0; let intakes = 0;
  Object.assign(f.env, { LINE_CHANNEL_SECRET: "fixture-signature-secret", LINE_CHANNEL_ACCESS_TOKEN: "fixture-line-token", INTERNAL_TOKEN: "fixture-internal",
    AIRTABLE_API_KEY: "fixture-airtable", AIRTABLE_BASE_ID: "fixture-base", KENJI_LINE_CONTINUITY_ENABLED: "true",
    ADMIN_WORKER: { fetch: async () => Response.json(f.runtime) }, MEMBER_PAGES_WORKER: { fetch: async req => { truthReads++; const body=await req.json();assert.equal(body.line_user_id,UID);assert.equal(body.intent,"rights_check");return Response.json(truth()); } } });
  const legacy = { fetch: async () => { intakes++; return Response.json({ saved:[{ok:true}] }); } };
  const previous = globalThis.fetch;
  globalThis.fetch = async (url,init={}) => { if (String(url).includes("api.line.me")) { delivered++; return Response.json({}); } assert.match(String(url),/api.airtable.com/); return Response.json({records:[]}); };
  try {
    const body = JSON.stringify({events:[event("signed-event", "เช็กสิทธิ์\u200B")]});
    const req = signature => new Request("https://mmdbkk.com/webhooks/line", {method:"POST",headers:{"x-line-signature":signature},body});
    assert.equal((await handleKenjiSeedLineRequest(req("bad"),f.env,null,legacy)).status,401);
    assert.equal(intakes,0);assert.equal(truthReads,0);assert.equal(delivered,0);
    const result = await handleKenjiSeedLineRequest(req(await createLineSignature(body,f.env.LINE_CHANNEL_SECRET)),f.env,null,legacy);
    assert.equal(result.status,200);assert.equal(truthReads,1);assert.equal(delivered,1);assert.equal((await result.json()).saved[0].rights_check,true);
  } finally { globalThis.fetch=previous; }
});

test("old webhook cannot bypass dedupe expiry through redelivery recovery", async () => { const f = await fixture(); f.event.timestamp=Date.now()-86400000; assert.equal((await handleLineRightsCheck(f)).reason,"stale_or_missing_event_timestamp"); assert.equal(f.counters.truth,0); });

function commandFixture(f) {
  Object.assign(f.env, { KENJI_LINE_RIGHTS_CHECK_MODE: "command", KENJI_LINE_RIGHTS_COMMAND_ENABLED: "true", LINE_AUTO_REPLY_ENABLED: "false", LINE_KENJI_AI_ENABLED: "false", KENJI_LINE_RIGHTS_CHECK_PILOT_HASHES: "" });
  f.runtime.controls.line_oa_auto_reply = true;
  return f;
}
for (const spelling of ["เช็กสิทธิ์", "เช็คสิทธิ์", "เช็กสิทธ์", "เช็กสิทธิ์\u200B", "\uFEFFเช็คสิทธิ์\u200B", "เช็ก\u200Bสิทธ์"]) test(`authorized command replies to ${JSON.stringify(spelling)} with general replies stopped`, async () => {
  const f = commandFixture(await fixture()); f.event.message.text = spelling;
  const result = await handleLineRightsCheck(f);
  assert.equal(result.replied, true); assert.equal(f.counters.truth, 1);
  assert.match(f.counters.replies[0], /Premium/);
  assert.match(f.counters.replies[0], /คูปอง CARE BACK.*รอเปอร์ตรวจ/);
});
for (const text of ["ต่ออายุ", "สลิป", "เช็กสิทธิ์ให้คุณเอก", "เมื่อวานเช็กสิทธิ์แล้ว", "ขอดูโปร", "hello", "เช็กสิทธิ์\u200Bให้คนอื่น", "เมื่อวาน\u200Bเช็กสิทธิ์แล้ว"]) test(`command scope excludes ${text}`, async () => {
  const f = commandFixture(await fixture()); f.event.message.text = text;
  assert.equal(await handleLineRightsCheck(f), null); assert.equal(f.counters.truth, 0); assert.equal(f.counters.replies.length, 0);
});
test("command switch missing does not bypass general stop", async () => {
  const f = commandFixture(await fixture()); delete f.env.KENJI_LINE_RIGHTS_COMMAND_ENABLED;
  assert.equal(await handleLineRightsCheck(f), null); assert.equal(f.counters.truth, 0);
});
test("command retains global emergency stop before and after lookup", async () => {
  const f = commandFixture(await fixture()); f.runtime.controls.all_kenji_mutations = true;
  assert.equal((await handleLineRightsCheck(f)).reason, "runtime_line_kill"); assert.equal(f.counters.truth, 0);
  f.runtime.controls.all_kenji_mutations = false;
  f.services.runtime = async () => ({ ok: true, controls: { all_kenji_mutations: true } });
  assert.equal((await handleLineRightsCheck(f)).reason, "pre_delivery_control_or_owner_blocked"); assert.equal(f.counters.replies.length, 0);
});
test("command sends exactly once for simultaneous retry and never reads another UID", async () => {
  const f = commandFixture(await fixture());
  f.services.truth = async (env, uid) => { assert.equal(uid, UID); f.counters.truth++; return truth(); };
  f.services.deliver = async (env, e, reply) => { assert.equal(e.source.userId, UID); assert.equal(e.replyToken, "mock-only"); f.counters.replies.push(reply); return true; };
  const result = await Promise.all([handleLineRightsCheck(f), handleLineRightsCheck(f)]);
  assert.equal(result.filter(r => r.replied).length, 1); assert.equal(f.counters.truth, 1);
});
test("command does not report absent canonical membership as nonmember or invent owner expiry", async () => {
  const f = commandFixture(await fixture()); f.services.truth = async () => ({});
  await handleLineRightsCheck(f);
  assert.match(f.counters.replies[0], /สถานะสมาชิกยังตรวจยืนยันไม่ครบ/);
  assert.doesNotMatch(f.counters.replies[0], /ไม่มีสมาชิก|หมดอายุแล้ว|2571/);
});
test("only current unblocked canonical access appears in benefits", () => {
  const t = truth(); Object.assign(t.membership, { public_service_access: true, private_visibility_envelope: "premium" });
  assert.match(renderLineRightsCheck(t).text, /สิทธิ์ดู Private: Premium/);
  t.membership.member_blocked = true;
  assert.doesNotMatch(renderLineRightsCheck(t).text, /สิทธิ์ดู Private: Premium|Public Service: ใช้งานได้/);
});
test("own canonical coupon and approved total-two-year promo are rendered without activating anything", () => {
  const t = truth();
  t.coupon = { authority: "canonical_care_back_wallet_v1", status: "ready", approved_discount_percent: 5, expires_at: "2099-01-01" };
  t.promotion = { authority: "owner_approved_october_renewal_2026_v1", status: "conditional_eligible", package_code: "premium", total_years: 2, base_years: 1, promotion_years: 1, starts_from: "existing_expiry", requires_verified_payment: true, ends_before: "2099-01-01", checkout_status: "review_required" };
  const reply = renderLineRightsCheck(t).text;
  assert.match(reply, /ส่วนลดที่อนุมัติ 5%/); assert.match(reply, /รวม 2 ปี/); assert.match(reply, /นับต่อจากวันหมดอายุเดิม/);
  assert.match(reply, /ตรวจยอดและรายการชำระ.*ก่อนโอน/); assert.doesNotMatch(reply, /รวม 3 ปี|เพิ่ม 180 วัน/);
  t.coupon.status = "used"; t.promotion.package_code = "standard";
  const mismatch = renderLineRightsCheck(t).text;
  assert.match(mismatch, /คูปอง CARE BACK: ใช้แล้ว/); assert.doesNotMatch(mismatch, /ส่วนลดที่อนุมัติ 5%|รวม 2 ปี/);
});
