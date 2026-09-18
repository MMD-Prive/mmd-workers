import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKenjiLv5OperationalContext,
  buildKenjiLv5CustomerReplyStrategy,
  KENJI_LV5_SCHEMA,
} from "./kenji-lv5-operational-concierge.mjs";

test("LV5 fails closed when canonical client is unresolved", () => {
  const out = buildKenjiLv5OperationalContext({
    client: { identity_status: "candidate" },
    entitlement: { membership_level: "private", status: "active" },
    intent: { type: "booking", model_name: "Rossi", date: "2026-09-20", time: "20:00", location: "Bangkok" },
    calendar: { status: "available", available: true },
  });
  assert.equal(out.schema, KENJI_LV5_SCHEMA);
  assert.equal(out.readiness, "blocked");
  assert.ok(out.blockers.includes("canonical_client_unresolved"));
  assert.equal(out.next_actions[0].action, "resolve_identity");
});

test("blocked entitlement produces Per handoff and HYPE notification only", () => {
  const out = buildKenjiLv5OperationalContext({
    client: { canonical_client_id: "recClient1", identity_status: "resolved" },
    entitlement: { status: "suspended", member_blocked: true },
    hype: { configured: true, notification_only: true },
    intent: { type: "booking", model_name: "Rossi", date: "2026-09-20", time: "20:00", location: "Bangkok" },
    calendar: { status: "available", available: true },
  });
  assert.ok(out.blockers.includes("membership_or_access_blocked"));
  assert.ok(out.next_actions.some((item) => item.action === "handoff_per"));
  const hype = out.next_actions.find((item) => item.action === "notify_hype");
  assert.equal(hype.mode, "notification_only");
  assert.equal(hype.per_confirmation_required, false);
});

test("uncertain payment never becomes paid and routes to payment review", () => {
  const out = buildKenjiLv5OperationalContext({
    client: { canonical_client_id: "recClient1", identity_status: "resolved" },
    entitlement: { status: "active", membership_level: "private_premium" },
    payment: { status: "uncertain", proof_state: "pending" },
    hype: { configured: true },
    intent: { type: "payment_slip" },
  });
  assert.equal(out.payment.paid, false);
  assert.ok(out.blockers.includes("payment_review_required"));
  assert.equal(out.next_actions[0].action, "review_payment");
  assert.equal(out.guardrails.no_payment_inference_from_slip, true);
});

test("complete booking context prepares canonical work but protects hold mutation", () => {
  const out = buildKenjiLv5OperationalContext({
    client: { canonical_client_id: "recClient1", identity_status: "resolved", display_name: "คุณเอ็ม" },
    entitlement: { status: "active", membership_level: "private_premium", private_visibility_envelope: "premium" },
    calendar: { status: "available", available: true },
    jobs: { jobs: [] },
    payment: { status: "pending", deposit_required_thb: 8250, deposit_paid_thb: 0 },
    hype: { configured: true },
    intent: { type: "booking", model_name: "Rossi", date: "2026-09-20", time: "20:00", location: "Bangkok" },
  });
  assert.equal(out.readiness, "prepared_for_per");
  assert.ok(out.next_actions.some((item) => item.action === "prepare_booking_intent"));
  const hold = out.next_actions.find((item) => item.action === "create_calendar_hold");
  assert.equal(hold.mode, "supervised");
  assert.equal(hold.per_confirmation_required, true);
  assert.equal(hold.executable_now, false);
  assert.ok(out.next_actions.some((item) => item.action === "prepare_payment"));
});

test("calendar conflict offers alternate slot without inventing availability", () => {
  const out = buildKenjiLv5OperationalContext({
    client: { canonical_client_id: "recClient1", identity_status: "resolved" },
    entitlement: { status: "active", membership_level: "public_member" },
    calendar: {
      status: "conflict",
      conflicts: [{ id: "cal_1", start_at: "2026-09-20T20:00:00+07:00" }],
      next_available_start: "2026-09-20T22:00:00+07:00",
    },
    intent: { type: "booking", service: "companion", date: "2026-09-20", time: "20:00", location: "Bangkok" },
  });
  assert.ok(out.blockers.includes("calendar_unavailable"));
  const next = out.next_actions.find((item) => item.action === "offer_alternate_slot");
  assert.ok(next.reason.includes("2026-09-20T22:00:00+07:00"));
});

test("reply strategy hides operational internals", () => {
  const context = buildKenjiLv5OperationalContext({
    client: { canonical_client_id: "recClient1", identity_status: "resolved" },
    entitlement: { status: "active" },
    intent: { type: "booking", model_name: "Rossi" },
  });
  const strategy = buildKenjiLv5CustomerReplyStrategy(context);
  assert.equal(strategy.silent_on_internal_details, true);
  assert.ok(strategy.forbidden_customer_fields.includes("admin_note"));
  assert.equal(strategy.continue_in_chat, true);
});
