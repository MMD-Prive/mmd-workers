import test from "node:test";
import assert from "node:assert/strict";
import {
  extractOperationalDate,
  extractOperationalLocation,
  extractOperationalModelName,
  extractOperationalTime,
  isKenjiLv5LineOperationalCandidate,
  parseKenjiLv5LineIntent,
  renderKenjiLv5LineReply,
} from "../src/kenji-lv5-line-operational.mjs";
import { renderKenjiLv5ModelGateReply } from "../src/kenji-lv5-line-model-gate.mjs";
import { KENJI_LV5_HYPE_INTERNALS } from "../src/kenji-lv5-hype-alert.mjs";
import { KENJI_LV5_LINE_REQUEST_INTERNALS } from "../src/kenji-lv5-line-operational-request.mjs";

const NOW = new Date("2026-09-16T12:00:00+07:00");
const USER_ID = "U0123456789abcdef0123456789abcdef";

function event(message) {
  return {
    type: "message",
    mode: "active",
    replyToken: "reply-token",
    source: { type: "user", userId: USER_ID },
    deliveryContext: { isRedelivery: false },
    message: { id: "m1", type: "text", text: message },
  };
}

test("P3 parses model, Thai date, two-thum time and location from a natural booking message", () => {
  const raw = "จอง Rossi วันที่ 20 ก.ย. สองทุ่ม ที่สุขุมวิท";
  assert.equal(extractOperationalModelName(raw), "Rossi");
  assert.equal(extractOperationalDate(raw, NOW), "2026-09-20");
  assert.equal(extractOperationalTime(raw), "20:00");
  assert.equal(extractOperationalLocation(raw, "Rossi"), "สุขุมวิท");
  assert.deepEqual(parseKenjiLv5LineIntent(event(raw), "mmd_companion", NOW), {
    type: "booking",
    model_name: "Rossi",
    customer_name: "",
    date: "2026-09-20",
    time: "20:00",
    end_time: "",
    duration_hours: 0,
    location: "สุขุมวิท",
    amount_thb: 0,
    deposit_amount_thb: 0,
    raw,
  });
});

test("deposit wording starts booking capture and extracts the complete Create Job input", () => {
  const raw = "มัดจำ งานนายแบบ Rossi ลูกค้า คุณแชมป์ วันที่ 20 ก.ย. 20:00-22:00 ที่สุขุมวิท เรท 9,000 บาท มัดจำ 3,000";
  assert.deepEqual(parseKenjiLv5LineIntent(event(raw), "payment_status", NOW), {
    type: "booking",
    trigger: "deposit",
    model_name: "Rossi",
    customer_name: "คุณแชมป์",
    date: "2026-09-20",
    time: "20:00",
    end_time: "22:00",
    duration_hours: 0,
    location: "สุขุมวิท",
    amount_thb: 9000,
    deposit_amount_thb: 3000,
    raw,
  });
});

test("P3 supports relative Bangkok dates and non-office-hour Thai time", () => {
  assert.equal(extractOperationalDate("พรุ่งนี้", NOW), "2026-09-17");
  assert.equal(extractOperationalTime("นัดตีห้า"), "05:00");
  assert.equal(extractOperationalTime("บ่ายสอง"), "14:00");
});

test("strong booking request is operational even when legacy intent is mmd_companion", () => {
  assert.equal(isKenjiLv5LineOperationalCandidate(event("จอง Rossi พรุ่งนี้ 20:00 ที่สุขุมวิท"), "mmd_companion"), true);
  assert.equal(isKenjiLv5LineOperationalCandidate(event("อยากรู้ว่ามีบริการอะไรบ้าง"), "service_guidance"), false);
});

test("P3 asks only for missing booking inputs and preserves known inputs", () => {
  const reply = renderKenjiLv5LineReply({
    ok: true,
    client_360: { canonical_client_id: "recClient", display_name: "คุณเอ็ม" },
    fan_in: { identity_resolution: "canonical" },
    entitlement_live: { member_blocked: false },
    missing: ["location"],
    next_actions: [{ action: "request_missing_input" }],
  }, { type: "booking", model_name: "Rossi", date: "2026-09-20", time: "20:00" });
  assert.match(reply, /โซนหรือสถานที่/);
  assert.doesNotMatch(reply, /ชื่อนายแบบหรือบริการ.*วันที่.*เวลา/);
  assert.match(reply, /ไม่ต้องเริ่มใหม่/);
});

test("P3 never calls a conflict a confirmed booking", () => {
  const reply = renderKenjiLv5LineReply({
    ok: true,
    client_360: { canonical_client_id: "recClient" },
    fan_in: { identity_resolution: "canonical" },
    entitlement_live: { member_blocked: false },
    calendar_live: {
      status: "unavailable",
      conflicts: [{ end_at: "2026-09-20T21:00:00+07:00" }],
    },
    next_actions: [{ action: "offer_alternate_slot" }],
    missing: [],
  }, { type: "booking" });
  assert.match(reply, /ชนกับคิว/);
  assert.doesNotMatch(reply, /ยืนยันการจอง|คอนเฟิร์มแล้ว/);
});

test("P3 prepared booking copy states that final confirmation has not happened", () => {
  const reply = renderKenjiLv5LineReply({
    ok: true,
    live_truth_complete: true,
    client_360: { canonical_client_id: "recClient" },
    fan_in: { identity_resolution: "canonical" },
    entitlement_live: { member_blocked: false },
    calendar_live: { status: "available", conflicts: [] },
    next_actions: [{ action: "prepare_booking_intent" }],
    missing: [],
  }, { type: "booking", model_name: "Rossi", date: "2026-09-20", time: "20:00", location: "สุขุมวิท" });
  assert.match(reply, /ยังไม่ถือว่าคอนเฟิร์ม/);
  assert.match(reply, /Rossi/);
});

test("model access silent state does not reveal private model existence or schedule", () => {
  const reply = renderKenjiLv5ModelGateReply({ required: true, status: "silent" });
  assert.match(reply, /ยังยืนยันสิทธิ์กับนายแบบที่ขอ/);
  assert.doesNotMatch(reply, /ว่าง|ไม่ว่าง|มีนายแบบ|ไม่มีนายแบบ/);
});

test("matched Model with Sales Control off stops booking progression without exposing a price", () => {
  const reply = renderKenjiLv5ModelGateReply({
    required: true,
    status: "match",
    model: {
      model_code: "EMs21",
      working_name: "J Dye",
      sales: {
        sellable: false,
        visibility: "off",
        customer_rate_thb: null,
        price_visible: false,
        reason_code: "sales_visibility_off",
      },
    },
  });
  assert.match(reply, /เงื่อนไขการขาย/);
  assert.match(reply, /ยังไม่เสนอราคา/);
  assert.doesNotMatch(reply, /\d[\d,]*\s*(?:บาท|THB)/i);
});

test("matched Model with an allowed Sales Control offer continues the existing booking lane", () => {
  const reply = renderKenjiLv5ModelGateReply({
    required: true,
    status: "match",
    model: { sales: { sellable: true, price_visible: true, customer_rate_thb: 25000 } },
  });
  assert.equal(reply, "");
});

test("verified model code maps to canonical Calendar name while an unverified alias still blocks", () => {
  const same = KENJI_LV5_LINE_REQUEST_INTERNALS.needsCanonicalCalendarMapping({
    required: true,
    status: "match",
    parsed: { model_name: "Rossi" },
    model: { working_name: "Rossi", model_code: "EMs20" },
  });
  const code = KENJI_LV5_LINE_REQUEST_INTERNALS.needsCanonicalCalendarMapping({
    required: true,
    status: "match",
    parsed: { model_name: "EMs20" },
    model: { working_name: "Rossi", model_code: "EMs20" },
  });
  const alias = KENJI_LV5_LINE_REQUEST_INTERNALS.needsCanonicalCalendarMapping({
    required: true,
    status: "match",
    parsed: { model_name: "Ross" },
    model: { working_name: "Rossi", model_code: "EMs20" },
  });
  const mapped = KENJI_LV5_LINE_REQUEST_INTERNALS.canonicalizeVerifiedModelIntent(
    { type: "booking", model_name: "EMs20", date: "2026-09-20" },
    { status: "match", model: { working_name: "Rossi", model_code: "EMs20" } },
  );
  assert.equal(same, false);
  assert.equal(code, false);
  assert.equal(alias, true);
  assert.equal(mapped.model_name, "Rossi");
  assert.equal(mapped.requested_model_ref, "EMs20");
});

test("LINE auto-reply pause suppresses customer delivery without disabling booking mutation flow", () => {
  assert.equal(KENJI_LV5_LINE_REQUEST_INTERNALS.isLineReplyAllowed({ LINE_AUTO_REPLY_ENABLED: "true" }, { line_oa_auto_reply: true }), false);
  assert.equal(KENJI_LV5_LINE_REQUEST_INTERNALS.isLineReplyAllowed({ LINE_AUTO_REPLY_ENABLED: "true" }, { line_oa_auto_reply: false }), true);
});

test("HYPE exception routing keeps payment, membership and identity in canonical threads", () => {
  const env = {
    TELEGRAM_PAYMENT_THREAD_ID: "22",
    TELEGRAM_MEMBERSHIP_THREAD_ID: "20",
    TELEGRAM_ALERTS_THREAD_ID: "9",
  };
  const payment = KENJI_LV5_HYPE_INTERNALS.routeForDecision(env, { handoff_reason: "payment_review_required", operational: { primary_action: "review_payment" } });
  const membership = KENJI_LV5_HYPE_INTERNALS.routeForDecision(env, { handoff_reason: "model_access:renewal", operational: { model_access_status: "renewal" } });
  const identity = KENJI_LV5_HYPE_INTERNALS.routeForDecision(env, { handoff_reason: "canonical_client_unresolved", operational: { primary_action: "resolve_identity" } });
  const silent = KENJI_LV5_HYPE_INTERNALS.routeForDecision(env, { handoff_reason: "model_access:silent", operational: { model_access_status: "silent" } });
  assert.equal(payment.thread_id, 22);
  assert.equal(payment.event, "payment_match_uncertain");
  assert.equal(membership.thread_id, 20);
  assert.equal(membership.event, "membership_review_required");
  assert.equal(identity.thread_id, 9);
  assert.equal(identity.event, "identity_client_verification_failed");
  assert.equal(silent, null);
});
