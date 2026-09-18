import assert from "node:assert/strict";
import { test } from "node:test";

import { serializeCustomer360Profile } from "../src/customer-360-serializer.js";

test("Customer 360 serializer allowlists only customer-safe fields and blocks raw identity, payment, storage, and internal content", () => {
  const profile = serializeCustomer360Profile({
    display_name: "ignored legacy display",
    member_id: "recAirtablePrivate",
    customer_360: {
      member: {
        display_name: "คุณเปอร์",
        member_id: "MMD-360-01",
        tier: "Black Card",
        black_card_customer_visible: false,
        membership_status: "active",
        membership_start: "2026-08-01",
        membership_expires_at: "2027-08-01",
        line_user_id: `U${"a".repeat(32)}`,
        internal_notes: "do not return",
      },
      points: {
        status: "verified",
        active_points: 200,
        records_count: 2,
        history: [{ date: "2026-08-20", title: "Points added", points_delta: 200, status: "posted", expires_at: "2026-09-15", payment_ref: "pay_private" }],
        expiring_points: 200,
        nearest_expiry: "2026-09-15",
        payload_json: "private",
      },
      packages: {
        status: "verified",
        current_package: { code: "blackcard", customer_safe_name: "Black Card Membership", tier: "Black Card", status: "active", start_date: "2026-08-01", end_date: "2027-08-01", entitlement_payload_json: "private" },
        package_history: [],
        actions: [{ id: "renew", state: "available", endpoint: "/internal" }],
      },
      jobs: {
        status: "verified",
        upcoming_jobs: [{ job_number: "JOB-10", date: "2026-09-01", start_time: "20:00", model_display_name: "Kenji", service_title: "PN private service", status: "upcoming", location_customer_safe: "MMD Lounge", customer_safe_note: "internal note", session_id: "ses_private", bank_account: "hidden" }],
        active_jobs: [], completed_jobs: [], cancelled_jobs: [],
      },
      payments: { status: "verified", historical_verified: [{ date: "2026-08-20", title: "Membership renewal", amount: 20000, status: "verified", payment_ref: "pay_private", slip_url: "https://private.example/slip" }] },
      history: { status: "verified", from: "2025-08-27", to: "2026-08-27", range_days: 365, events: [{ type: "points", date: "2026-08-20", title: "Points added", points_delta: 200, status: "posted", internal_note: "hidden" }] },
      requests: { status: "verified", items: [{ request_number: "REQ-10", requested_model_display_name: "Kenji", preferred_date: "2026-08-30", preferred_time: "18:00", status: "requested", safe_next_action: "wait_for_review", resolver_payload: "hidden" }] },
      care: { status: "verified", privileges: [{ campaign_id: "private" }] },
      mms: { status: "verified", prebookings: [{ prebooking_number: "MMS-10", therapist_display_name: "Nina", service: "MMS", date: "2026-09-03", time: "10:30", zone: "A", status: "confirmed", r2_key: "private" }] },
    },
  });

  assert.equal(profile.tier, "Member");
  assert.equal(profile.customer_360.member.tier, "Member");
  assert.equal(profile.customer_360.packages.current_package.tier, "Member");
  assert.equal(profile.customer_360.jobs.upcoming_jobs[0].service_title, "MMD Service");
  assert.equal(profile.customer_360.jobs.upcoming_jobs[0].customer_safe_note, undefined);
  assert.deepEqual(profile.customer_360.care, { status: "checking", privileges: [] });
  assert.equal(profile.customer_360.points.rate_policy.thb_per_point, 100);
  const serialized = JSON.stringify(profile);
  assert.doesNotMatch(serialized, /recAirtablePrivate|line_user_id|Uaaaaaaaa|payment_ref|slip_url|bank_account|session_id|payload|entitlement|internal|private|r2_key|PN|Black Card|SVIP/i);
});

test("Customer 360 serializer shows Black Card only with explicit resolver visibility and keeps unresolved points null", () => {
  const profile = serializeCustomer360Profile({
    customer_360: {
      member: { display_name: "คุณเปอร์", member_id: "MMD-360-02", tier: "Black Card", black_card_customer_visible: true, membership_status: "active", membership_expires_at: "2027-08-01" },
      points: { status: "checking", active_points: 0, records_count: 0 },
      packages: { status: "checking" },
      jobs: { status: "checking" },
      payments: { status: "unavailable" },
      history: { status: "checking" },
      requests: { status: "checking" },
      mms: { status: "not_available" },
    },
  });

  assert.equal(profile.tier, "Black Card");
  assert.equal(profile.customer_360.member.tier, "Black Card");
  assert.equal(profile.points, null);
  assert.equal(profile.points_records_count, null);
  assert.deepEqual(profile.customer_360.points.history, []);
});

test("legacy resolver compatibility remains bounded and does not surface SVIP as a customer tier", () => {
  const profile = serializeCustomer360Profile({
    display_name: "คุณเปอร์",
    tier: "SVIP",
    membership_status: "active",
    membership_expires_at: "2026-02-30",
    points: 12,
    payment_status: "verified",
    payment_history: [{ date: "2026-08-20", title: "Membership payment", status: "verified", provider_transaction_id: "private" }],
    history: [{ type: "points", date: "2026-08-20", title: "Points added", points_delta: 12, status: "posted", raw_line_note: "private" }],
  });

  assert.equal(profile.tier, "");
  assert.equal("membership_expires_at" in profile, false);
  assert.equal(profile.points, null);
  assert.equal(profile.points_records_count, null);
  assert.equal(profile.payment_history.length, 1);
  assert.doesNotMatch(JSON.stringify(profile), /SVIP|provider_transaction_id|raw_line_note|private/i);
});
