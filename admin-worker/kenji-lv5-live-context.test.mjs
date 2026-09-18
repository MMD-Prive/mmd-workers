import test from "node:test";
import assert from "node:assert/strict";
import { buildKenjiLv5LiveFanInProjection } from "./src/kenji-lv5-live-context.js";

function entitlement(overrides = {}) {
  return {
    status: "verified",
    snapshot: {
      schema_version: "my_mmd_entitlement_resolver_v1",
      fail_closed: true,
      member_blocked: false,
      capability_state: {
        active: ["private_premium"],
        grace: [],
        inactive: [],
        recognized: ["private_premium"],
      },
      entitlements: [{ capability: "private_premium", lifecycle: "active", expire_at: "2028-09-16T00:00:00.000Z" }],
      access: {
        public_service_access: true,
        private_visibility_envelope: "premium",
        new_model_reveals_allowed: true,
      },
      ...overrides,
    },
  };
}

function base(overrides = {}) {
  return {
    identityResolution: {
      status: "resolved",
      client: {
        canonical_client_id: "recClient1",
        display_name: "คุณเอ็ม",
        per_rename: "คุณเอ็ม",
        line_user_id: "U0123456789abcdef0123456789abcdef",
      },
    },
    client360: {
      status: "live",
      data: {
        ok: true,
        relationship: { relationship_state: "active_member", summary: "known customer" },
      },
    },
    entitlement: entitlement(),
    calendar: {
      ok: true,
      date: "2026-09-20",
      items: [],
    },
    credit: { status: "verified", balance_thb: 1500, pending_count: 0 },
    hype: { status: "notification_ready", configured: true, notification_only: true, access_observation: "not_requested", thread_id: "21" },
    intent: {
      type: "booking",
      model_name: "Rossi",
      date: "2026-09-20",
      time: "20:00",
      location: "สุขุมวิท",
    },
    ...overrides,
  };
}

test("P2 live fan-in marks complete verified context ready and preserves canonical authorities", () => {
  const result = buildKenjiLv5LiveFanInProjection(base());
  assert.equal(result.schema, "mmd.kenji_live_context_fanin.v1");
  assert.equal(result.phase, "P2_live_context_fanin");
  assert.equal(result.live_truth_complete, true);
  assert.equal(result.client_360.canonical_client_id, "recClient1");
  assert.equal(result.entitlement_live.canonical_membership_level, "private_premium");
  assert.equal(result.payment_live.credit_balance_thb, 1500);
  assert.equal(result.hype_live.notification_only, true);
  assert.ok(result.next_actions.some((item) => item.action === "prepare_booking_intent"));
  assert.equal(result.authority.money, "payments-worker");
  assert.equal(result.authority.final_owner, "Per");
});

test("P2 detects live model calendar conflict and offers an alternate slot instead of inventing availability", () => {
  const result = buildKenjiLv5LiveFanInProjection(base({
    calendar: {
      ok: true,
      date: "2026-09-20",
      items: [{
        session_id: "SES-1",
        start_at: "2026-09-20T19:00:00+07:00",
        end_at: "2026-09-20T21:00:00+07:00",
        internal_hold: true,
        client: { record_id: "recOther" },
        model: { name: "Rossi", record_id: "recModelRossi" },
        job: { job_id: "JOB-OTHER", status: "confirmed" },
        deposit: { status: "official_verified", verified: true, amount_thb: 5000 },
      }],
    },
  }));
  assert.equal(result.calendar_live.status, "unavailable");
  assert.equal(result.calendar_live.conflicts.length, 1);
  assert.equal(result.calendar_live.conflicts[0].type, "internal_hold");
  assert.ok(result.next_actions.some((item) => item.action === "offer_alternate_slot"));
  assert.ok(!result.next_actions.some((item) => item.action === "create_calendar_hold"));
});

test("deposit booking preserves rate/end-time requirements and checks the full requested interval", () => {
  const result = buildKenjiLv5LiveFanInProjection(base({
    intent: {
      type: "booking", trigger: "deposit", model_name: "Rossi", date: "2026-09-20",
      time: "20:00", end_time: "22:00", location: "สุขุมวิท", amount_thb: 9000,
    },
    calendar: {
      ok: true,
      date: "2026-09-20",
      items: [{
        session_id: "SES-LATE",
        start_at: "2026-09-20T21:30:00+07:00",
        end_at: "2026-09-20T23:00:00+07:00",
        client: { record_id: "recOther" },
        model: { name: "Rossi" },
      }],
    },
  }));
  assert.deepEqual(result.missing, []);
  assert.equal(result.calendar_live.status, "unavailable");
  assert.equal(result.intent.trigger, "deposit");
  assert.equal(result.intent.amount_thb, 9000);
});

test("P2 fails closed when entitlement truth is unavailable", () => {
  const result = buildKenjiLv5LiveFanInProjection(base({
    entitlement: { status: "unavailable", snapshot: null },
  }));
  assert.equal(result.live_truth_complete, false);
  assert.equal(result.readiness, "blocked");
  assert.ok(result.fan_in.blockers.includes("entitlement_truth_unavailable"));
  assert.equal(result.entitlement_live.member_blocked, true);
  assert.ok(!result.next_actions.some((item) => item.action === "create_calendar_hold"));
});

test("P2 keeps payment proof uncertainty out of paid-state and surfaces review", () => {
  const result = buildKenjiLv5LiveFanInProjection(base({
    calendar: {
      ok: true,
      date: "2026-09-20",
      items: [{
        session_id: "SES-CLIENT",
        start_at: "2026-09-20T20:00:00+07:00",
        end_at: "2026-09-20T22:00:00+07:00",
        client: { record_id: "recClient1" },
        model: { name: "Rossi" },
        job: { job_id: "JOB-CLIENT", status: "awaiting_deposit" },
        deposit: { status: "pending_review", payment_ref: "PAY-1", amount_thb: 5000 },
      }],
    },
  }));
  assert.equal(result.payment_live.paid, false);
  assert.equal(result.payment_live.review_required, true);
  assert.ok(result.next_actions.some((item) => item.action === "review_payment"));
  assert.ok(result.next_actions.some((item) => item.action === "notify_hype"));
});
