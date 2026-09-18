import test from "node:test";
import assert from "node:assert/strict";
import {
  applyKenjiLv5BookingActionToDecision,
  executeKenjiLv5LineBookingAction,
  shouldCaptureKenjiLv5BookingIntent,
  shouldExecuteKenjiLv5BookingAction,
  KENJI_LV5_LINE_ACTION_INTERNALS,
} from "../src/kenji-lv5-line-action-execution.mjs";

const event = {
  type: "message",
  timestamp: Date.parse("2026-09-20T19:15:00+07:00"),
  source: { type: "user", userId: "U0123456789abcdef0123456789abcdef" },
  message: { id: "123456789012345678", type: "text", text: "จอง Rossi วันที่ 20 ก.ย. สองทุ่ม ที่สุขุมวิท" },
};
const modelGate = {
  required: true,
  status: "match",
  model: { model_code: "EMs20", working_name: "Rossi" },
  parsed: { type: "booking", model_name: "Rossi", date: "2026-09-20", time: "20:00", location: "สุขุมวิท" },
};
const decision = {
  text: "prepared",
  live_truth_verified: true,
  operational: { primary_action: "prepare_booking_intent", phase: "P3_line_operational_concierge" },
};

test("P4 LINE execution is eligible only for a verified prepared booking", () => {
  assert.equal(shouldExecuteKenjiLv5BookingAction({ event, modelGate, decision, canonicalClientId: "recClient123" }), true);
  assert.equal(shouldExecuteKenjiLv5BookingAction({ event, modelGate, decision: { ...decision, live_truth_verified: false }, canonicalClientId: "recClient123" }), false);
  assert.equal(shouldExecuteKenjiLv5BookingAction({ event, modelGate: { ...modelGate, status: "silent" }, decision, canonicalClientId: "recClient123" }), false);
});

test("P4 action ID is stable per LINE message and user", () => {
  const one = KENJI_LV5_LINE_ACTION_INTERNALS.actionId(event);
  const two = KENJI_LV5_LINE_ACTION_INTERNALS.actionId(structuredClone(event));
  assert.equal(one, two);
  assert.match(one, /^line:/);
});

test("deposit trigger is eligible for silent capture before booking fields are complete", () => {
  const depositGate = {
    required: false,
    status: "not_required",
    parsed: { type: "booking", trigger: "deposit", raw: "มัดจำ" },
  };
  assert.equal(shouldCaptureKenjiLv5BookingIntent({ event, modelGate: depositGate, canonicalClientId: "recClient123" }), true);
  const nextMessage = structuredClone(event);
  nextMessage.message.id = "another-message";
  nextMessage.timestamp += 30 * 60 * 1000;
  assert.equal(KENJI_LV5_LINE_ACTION_INTERNALS.bookingIntentActionId(event), KENJI_LV5_LINE_ACTION_INTERNALS.bookingIntentActionId(nextMessage));
});

test("deposit trigger sends capture_booking_intent with wording and pricing evidence", async () => {
  let sent;
  const depositGate = {
    required: true,
    status: "match",
    model: { working_name: "Rossi" },
    parsed: {
      type: "booking", trigger: "deposit", model_name: "Rossi", customer_name: "คุณแชมป์",
      date: "2026-09-20", time: "20:00", end_time: "22:00", location: "สุขุมวิท",
      amount_thb: 9000, deposit_amount_thb: 3000, raw: "มัดจำ Rossi เรท 9,000",
    },
  };
  const result = await executeKenjiLv5LineBookingAction({
    env: {
      INTERNAL_TOKEN: "secret",
      ADMIN_WORKER: { async fetch(request) {
        sent = await request.json();
        return Response.json({ ok: true, executed: true, status: "booking_intent_collected", booking_ref: "kenji_abc" });
      } },
    },
    event,
    modelGate: depositGate,
    decision,
    canonicalClientId: "recClient123",
  });
  assert.equal(result.executed, true);
  assert.equal(sent.action, "capture_booking_intent");
  assert.equal(sent.intent.customer_name, "คุณแชมป์");
  assert.equal(sent.intent.amount_thb, 9000);
  assert.equal(sent.intent.deposit_amount_thb, 3000);
});

test("created Job copy keeps customer/model/payment confirmations pending", () => {
  const next = applyKenjiLv5BookingActionToDecision(decision, {
    attempted: true,
    executed: true,
    status: "job_created",
    receipt: { session_id: "sess_123", payment_confirmed: false },
  });
  assert.equal(next.reply_source, "lv5_p4_job_created");
  assert.match(next.text, /สร้าง Job/);
  assert.match(next.text, /รอลูกค้าและนายแบบยืนยัน/);
  assert.match(next.text, /ยังไม่ถือว่าได้รับชำระ/);
});

test("successful P4 action tells customer draft truth without claiming confirmation or payment", () => {
  const next = applyKenjiLv5BookingActionToDecision(decision, {
    attempted: true,
    executed: true,
    status: "booking_request_created",
    receipt: { booking_ref: "kenji_abc123", final_confirmation: false, payment_confirmed: false },
  });
  assert.equal(next.reply_source, "lv5_p4_booking_request_created");
  assert.match(next.text, /Booking Request/);
  assert.match(next.text, /Draft/);
  assert.match(next.text, /ยังไม่ถือว่าคอนเฟิร์ม/);
  assert.match(next.text, /ไม่ได้สร้างยอดชำระ/);
  assert.equal(next.operational.action_executed, true);
});

test("failed P4 write fails closed and requires handoff", () => {
  const next = applyKenjiLv5BookingActionToDecision(decision, { attempted: true, executed: false, status: "write_failed" });
  assert.equal(next.reply_source, "lv5_p4_action_degraded");
  assert.equal(next.handoff_required, true);
  assert.match(next.handoff_reason, /lv5_p4:write_failed/);
  assert.doesNotMatch(next.text, /เปิด Booking Request .*ให้แล้ว/);
});
