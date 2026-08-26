import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCustomer360MemberProfile } from "../src/customer-360-resolver.js";

const NOW = new Date("2026-08-27T03:00:00.000Z");
const LINE_ID = `U${"d".repeat(32)}`;
const MEMBER = {
  member_id: "MMD-360-01",
  "Full Name (Display)": "คุณเปอร์",
  "Contact Email": "per@example.test",
  "Membership Tier": "SVIP",
  "Internal Notes": "do not return",
  line_id: LINE_ID,
};

function listFrom(tables, failures = new Set()) {
  return async (key) => {
    if (failures.has(key)) throw new Error(`${key}_unavailable`);
    return (tables[key] || []).map((fields) => ({ fields }));
  };
}

async function resolve(tables, failures) {
  return buildCustomer360MemberProfile({
    memberFields: MEMBER,
    lineUserId: LINE_ID,
    listRecords: listFrom(tables, failures),
    now: NOW,
  });
}

test("Customer 360 resolves authoritative package, points, jobs, payment, requests, and MMS with a bounded one-year view", async () => {
  const profile = await resolve({
    MEMBER_PACKAGES: [{
      member_email: "per@example.test",
      package_code: "premium",
      status: "active",
      start_date: "2026-08-01",
      end_date: "2027-08-01",
      duration_days: 365,
      created_at: "2026-08-01T03:00:00.000Z",
    }],
    POINTS_LEDGER: [
      { member_email: "per@example.test", points: 200, transaction_status: "posted", posted_at: "2026-08-20T03:00:00.000Z", expires_at: "2026-09-15", idempotency_key: "service-200" },
      { member_email: "per@example.test", points: 200, transaction_status: "posted", posted_at: "2026-08-20T03:00:00.000Z", expires_at: "2026-09-15", idempotency_key: "service-200" },
      { member_email: "per@example.test", amount_thb: 2200, transaction_status: "verified", posted_at: "2026-08-19T03:00:00.000Z", source_event_id: "cash-22" },
      { member_email: "per@example.test", points: -5, transaction_status: "completed", posted_at: "2026-08-18T03:00:00.000Z", source_event_id: "adjustment-5" },
      { member_email: "per@example.test", points: 999, transaction_status: "posted", posted_at: "2025-08-20T03:00:00.000Z", source_event_id: "old-points" },
      { member_email: "per@example.test", points: 1000, transaction_status: "pending", posted_at: "2026-08-21T03:00:00.000Z", source_event_id: "pending" },
    ],
    SESSIONS: [
      { line_user_id: LINE_ID, job_number: "JOB-101", job_date: "2026-09-01", start_time: "20:00", duration_minutes: 120, model_display_name: "Kenji", job_type: "partner_present_massage_session", service_addon: "PN", "Session Status": "confirmed", payment_status: "pending", internal_note: "private", bank_account: "hidden" },
      { line_user_id: LINE_ID, job_number: "JOB-102", job_date: "2026-08-26", start_time: "19:00", job_type: "Dinner", "Session Status": "active", customer_safe_note: "MMD will confirm the next step." },
      { line_user_id: LINE_ID, job_number: "JOB-103", job_date: "2026-08-20", job_type: "Dinner", "Session Status": "completed", payment_status: "paid", verification_status: "verified" },
      { line_user_id: LINE_ID, job_number: "JOB-104", job_date: "2026-08-19", job_type: "Dinner", "Session Status": "cancelled", payment_status: "paid", verification_status: "verified" },
      { line_user_id: LINE_ID, request_number: "REQ-10", requested_model_display_name: "Kenji", job_date: "2026-08-30", preferred_time: "18:30", request_status: "requested", admin_note: "hidden" },
      { line_user_id: LINE_ID, prebooking_number: "MMS-10", therapist_display_name: "Nina", job_date: "2026-09-03", start_time: "10:30", service_family: "mms", job_type: "MMS session", "Session Status": "confirmed", private_model_ability: "hidden" },
    ],
    PAYMENTS: [{
      "Member Email": "per@example.test",
      "Payment Status": "paid",
      "Verification Status": "verified",
      "Created At": "2026-08-21T03:00:00.000Z",
      amount: 20000,
      customer_title: "Membership renewal",
      payment_ref: "private-ref",
      bank_account: "private-bank",
    }],
  });

  const view = profile.customer_360;
  assert.equal(view.member.display_name, "คุณเปอร์");
  assert.equal(view.member.tier, "Premium");
  assert.equal(view.member.membership_status, "active");
  assert.equal(view.member.membership_expires_at, "2027-08-01");
  assert.equal(view.points.status, "verified");
  assert.equal(view.points.active_points, 217);
  assert.equal(view.points.records_count, 3);
  assert.equal(view.points.expiring_points, 200);
  assert.equal(view.points.nearest_expiry, "2026-09-15");
  assert.equal(view.packages.current_package.code, "premium");
  assert.equal(view.jobs.upcoming_jobs[0].service_title, "Partner-Present Massage Session");
  assert.equal(view.jobs.upcoming_jobs.length, 1);
  assert.equal(view.jobs.active_jobs.length, 1);
  assert.equal(view.jobs.completed_jobs.length, 1);
  assert.equal(view.jobs.cancelled_jobs.length, 1);
  assert.equal(view.payments.historical_verified[0].amount, 20000);
  assert.equal(view.requests.items[0].request_number, "REQ-10");
  assert.equal(view.mms.prebookings[0].prebooking_number, "MMS-10");
  assert.equal(view.history.range_days, 365);
  assert.equal(view.history.events.some((event) => event.points_delta === 999), false);
  assert.doesNotMatch(JSON.stringify(profile), /PN|22500|7000|13000|private-ref|private-bank|bank_account|internal_note|admin_note|SVIP|line_id|per@example\.test/i);
});

test("Customer 360 distinguishes a resolved zero ledger from an unavailable ledger and keeps dependent views checking", async () => {
  const zero = await resolve({ MEMBER_PACKAGES: [], POINTS_LEDGER: [], SESSIONS: [], PAYMENTS: [] });
  assert.equal(zero.customer_360.points.status, "verified");
  assert.equal(zero.customer_360.points.active_points, 0);
  assert.equal(zero.customer_360.points.records_count, 0);

  const unavailable = await resolve({ MEMBER_PACKAGES: [], SESSIONS: [], PAYMENTS: [] }, new Set(["POINTS_LEDGER", "SESSIONS"]));
  assert.equal(unavailable.customer_360.points.status, "checking");
  assert.equal(unavailable.customer_360.points.active_points, null);
  assert.equal(unavailable.customer_360.jobs.status, "checking");
  assert.equal(unavailable.customer_360.requests.status, "checking");
  assert.equal(unavailable.customer_360.mms.status, "checking");
});

test("Customer 360 refuses ambiguous package expiry and never grants tier from legacy, SVIP, or Black Card eligibility fields", async () => {
  const ambiguous = await resolve({
    MEMBER_PACKAGES: [
      { package_code: "premium", status: "active", created_at: "2026-08-01T03:00:00.000Z", end_date: "2027-08-01" },
      { package_code: "premium", status: "active", created_at: "2026-08-01T03:00:00.000Z", end_date: "2028-08-01" },
    ],
    POINTS_LEDGER: [], SESSIONS: [], PAYMENTS: [],
  });
  assert.equal(ambiguous.customer_360.member.membership_status, "checking");
  assert.equal(ambiguous.customer_360.member.membership_expires_at, null);
  assert.equal(ambiguous.customer_360.member.tier, "Member");

  const hiddenBlackCard = await resolve({
    MEMBER_PACKAGES: [{ package_code: "blackcard", status: "active", created_at: "2026-08-02T03:00:00.000Z", end_date: "2027-08-02", customer_visible: false }],
    POINTS_LEDGER: [], SESSIONS: [], PAYMENTS: [],
  });
  assert.equal(hiddenBlackCard.customer_360.member.tier, "Member");
  assert.doesNotMatch(JSON.stringify(hiddenBlackCard), /Black Card|SVIP|eligib/i);
});

test("Partner-Present golden lifecycle remains non-granting until the independently posted ledger event", async () => {
  const base = {
    MEMBER_PACKAGES: [],
    PAYMENTS: [],
    SESSIONS: [{
      line_user_id: LINE_ID,
      job_number: "JOB-200",
      job_date: "2026-08-26",
      job_type: "partner_present_massage_session",
      service_addon: "PN",
      "Session Status": "completed",
      payment_status: "full_payment_verified",
      quoted_price: 22500,
      agreed_final_price: 20000,
      deposit_verified_amount: 7000,
      remaining_balance: 13000,
    }],
  };
  const beforeLedger = await resolve({ ...base, POINTS_LEDGER: [] });
  assert.equal(beforeLedger.customer_360.points.active_points, 0);
  assert.equal(beforeLedger.customer_360.jobs.completed_jobs[0].service_title, "Partner-Present Massage Session");
  assert.doesNotMatch(JSON.stringify(beforeLedger), /PN|22500|20000|7000|13000/i);

  const posted = await resolve({ ...base, POINTS_LEDGER: [{ points: 200, transaction_status: "posted", posted_at: "2026-08-26T03:00:00.000Z", idempotency_key: "partner-complete-200" }] });
  assert.equal(posted.customer_360.points.active_points, 200);
});
