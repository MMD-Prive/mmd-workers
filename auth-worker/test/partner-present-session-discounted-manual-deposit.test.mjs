import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import worker, { testInternals } from "../src/index.js";

const LINE_ID = `U${"c".repeat(32)}`;
const SECRET = "test-only-member-status-resolver-secret-1234567890";
const RESOLVER_URL = "https://mmd-auth-worker.internal/__internal/member-profile/read";
const realFetch = globalThis.fetch;
const RealDate = globalThis.Date;
const FIXED_NOW = "2026-08-27T03:00:00.000Z";
const RECENT_DATE = "2026-08-26";

afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.Date = RealDate;
});

function useFixedClock() {
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [FIXED_NOW]));
    }

    static now() {
      return RealDate.parse(FIXED_NOW);
    }
  };
}

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
    AIRTABLE_TABLE_PAYMENTS: "Payments",
    AIRTABLE_TABLE_POINTS_LEDGER: "MMD — Points Ledger",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_id",
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
  };
}

function request() {
  return new Request(RESOLVER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-member-resolver-secret": SECRET },
    body: JSON.stringify({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }),
  });
}

function partnerPresentSession(overrides = {}) {
  return {
    line_id: LINE_ID,
    email: "test_partner_member_001@example.test",
    job_date: RECENT_DATE,
    job_type: "partner_present_massage_session",
    service_addon: "PN",
    "Session Status": "confirmed",
    payment_status: "pending_verification",
    quoted_price: 22500,
    agreed_final_price: 20000,
    deposit_requested: 7000,
    deposit_verified_amount: 0,
    remaining_balance: 13000,
    deposit_percentage_text: "มัดจำ 30% = 7,000",
    internal_note: "redacted synthetic fixture",
    bank_account: "must-not-return",
    slip_url: "https://private.example/slip.png",
    payment_ref: "pay_private",
    ...overrides,
  };
}

function postedPoints(overrides = {}) {
  return {
    member_email: "test_partner_member_001@example.test",
    points: 200,
    transaction_status: "posted",
    posted_at: `${RECENT_DATE}T02:00:00.000Z`,
    idempotency_key: "session:test_partner_present_001:completed",
    source_event_id: "session:test_partner_present_001",
    ...overrides,
  };
}

function installAirtableMock({ sessions = [], points = [], payments = [] } = {}) {
  globalThis.fetch = async (input) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "Members") {
      return Response.json({ records: [{ id: "rec_shadow_member", fields: {
        line_id: LINE_ID,
        member_id: "test_partner_member_001",
        "Full Name (Display)": "Test Partner Member",
        "Contact Email": "test_partner_member_001@example.test",
        "Membership Tier": "Premium",
        "Membership Status": "Active",
      } }] });
    }
    if (table === "Sessions") return Response.json({ records: sessions.map((fields) => ({ fields })) });
    if (table === "member_packages") return Response.json({ records: [] });
    if (table === "Payments") return Response.json({ records: payments.map((fields) => ({ fields })) });
    if (table === "MMD — Points Ledger") return Response.json({ records: points.map((fields) => ({ fields })) });
    throw new Error(`Unexpected Airtable table: ${table}`);
  };
}

async function readProfile({ sessions = [], points = [], payments = [] } = {}) {
  useFixedClock();
  installAirtableMock({ sessions, points, payments });
  const response = await worker.fetch(request(), env());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  return payload.data.profile;
}

test("partner-present massage transaction preserves manual deposit and lifecycle points gates", () => {
  const confirmed = testInternals.normalizeMemberServiceTransaction(partnerPresentSession());
  assert.equal(confirmed.work_type, "partner_present_massage_session");
  assert.equal(confirmed.customer_title, "Partner-Present Massage Session");
  assert.equal(confirmed.service_addon, "PN");
  assert.equal(confirmed.quoted_price, 22500);
  assert.equal(confirmed.agreed_final_price, 20000);
  assert.equal(confirmed.deposit_requested, 7000);
  assert.equal(confirmed.deposit_verified_amount, 0);
  assert.equal(confirmed.remaining_balance, 13000);
  assert.equal(confirmed.eligible_service_spend, 0);
  assert.equal(confirmed.points, 0);
  assert.deepEqual(confirmed.warnings, ["manual_deposit_amount", "deposit_percentage_mismatch"]);

  const depositVerified = testInternals.normalizeMemberServiceTransaction(partnerPresentSession({
    payment_status: "deposit_verified",
    deposit_verified_amount: 7000,
  }));
  assert.equal(depositVerified.deposit_verified_amount, 7000);
  assert.equal(depositVerified.remaining_balance, 13000);
  assert.equal(depositVerified.eligible_service_spend, 0);
  assert.equal(depositVerified.points, 0);

  const genericVerified = testInternals.normalizeMemberServiceTransaction(partnerPresentSession({
    "Session Status": "completed",
    payment_status: "",
    verification_status: "verified",
    deposit_verified_amount: 7000,
    paid_total: "",
  }));
  assert.equal(genericVerified.payment_status, "review_required");
  assert.equal(genericVerified.deposit_verified_amount, 7000);
  assert.equal(genericVerified.eligible_service_spend, 0);
  assert.equal(genericVerified.points, 0);

  const completed = testInternals.normalizeMemberServiceTransaction(partnerPresentSession({
    "Session Status": "completed",
    payment_status: "full_payment_verified",
    deposit_verified_amount: 7000,
    paid_total: 20000,
  }));
  assert.equal(completed.eligible_service_spend, 20000);
  assert.equal(completed.points, 200);
  assert.notEqual(completed.eligible_service_spend, 27000);
  assert.notEqual(completed.eligible_service_spend, 29500);
  assert.notEqual(completed.eligible_service_spend, 42500);
  assert.notEqual(completed.eligible_service_spend, 59500);

  const cancelled = testInternals.normalizeMemberServiceTransaction(partnerPresentSession({
    "Session Status": "cancelled",
    payment_status: "deposit_verified",
    deposit_verified_amount: 7000,
  }));
  assert.equal(cancelled.eligible_service_spend, 0);
  assert.equal(cancelled.points, 0);
});

test("confirmed partner-present session before slip verification creates no dashboard points", async () => {
  const profile = await readProfile({ sessions: [partnerPresentSession()] });

  assert.equal(profile.points, 0);
  assert.equal(profile.points_records_count, 0);
  assert.deepEqual(profile.history, []);
  assert.doesNotMatch(JSON.stringify(profile), /22500|20000|7000|13000|bank|slip|payment_ref|private/i);
});

test("deposit verified partner-present session still creates no dashboard points", async () => {
  const profile = await readProfile({
    sessions: [partnerPresentSession({ payment_status: "deposit_verified", deposit_verified_amount: 7000 })],
  });

  assert.equal(profile.points, 0);
  assert.equal(profile.points_records_count, 0);
  assert.deepEqual(profile.history, []);
  assert.doesNotMatch(JSON.stringify(profile), /22500|20000|7000|13000|bank|slip|payment_ref|private/i);
});

test("completed full-payment partner-present session returns customer-safe event and 200 points once", async () => {
  const profile = await readProfile({
    sessions: [partnerPresentSession({
      "Session Status": "completed",
      payment_status: "full_payment_verified",
      deposit_verified_amount: 7000,
      paid_total: 20000,
    })],
    points: [postedPoints(), postedPoints()],
  });

  assert.equal(profile.points, 200);
  assert.equal(profile.points_records_count, 1);
  assert.deepEqual(profile.history, [
    { type: "service", date: RECENT_DATE, title: "Partner-Present Massage Session", status: "completed" },
    { type: "points", date: RECENT_DATE, title: "Points added", points_delta: 200, status: "posted" },
  ]);
  const serialized = JSON.stringify(profile);
  assert.doesNotMatch(serialized, /PN|22500|20000|7000|13000|bank|slip|payment_ref|private|SIGIL|SVIP|Black Card|test_partner_member_001@example\.test/i);
});

test("cancelled partner-present session creates zero eligible customer points", async () => {
  const profile = await readProfile({
    sessions: [partnerPresentSession({
      "Session Status": "cancelled",
      payment_status: "deposit_verified",
      deposit_verified_amount: 7000,
    })],
  });

  assert.equal(profile.points, 0);
  assert.equal(profile.points_records_count, 0);
  assert.deepEqual(profile.history, []);
  assert.doesNotMatch(JSON.stringify(profile), /22500|20000|7000|13000|bank|slip|payment_ref|private/i);
});
