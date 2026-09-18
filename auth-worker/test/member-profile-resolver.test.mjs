import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import worker from "../src/index.js";

const LINE_ID = `U${"b".repeat(32)}`;
const SECRET = "test-only-member-status-resolver-secret-1234567890";
const RESOLVER_URL = "https://mmd-auth-worker.internal/__internal/member-profile/read";
const realFetch = globalThis.fetch;
const RealDate = globalThis.Date;
const FIXED_NOW = "2026-08-11T17:15:00.000Z";

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

function env(overrides = {}) {
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
    ...overrides,
  };
}

function request(body, secret = SECRET) {
  return new Request(RESOLVER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-member-resolver-secret": secret },
    body: JSON.stringify(body),
  });
}

function dateOffset(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

test("LIFF member profile resolver returns the bounded Customer 360 profile from package and ledger truth", async () => {
  useFixedClock();
  const recent = dateOffset(-10);
  const older = dateOffset(-500);
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if (table === "Members") {
      return Response.json({ records: [{ id: "rec_private", fields: {
        line_id: LINE_ID,
        member_id: "mmd-per-01",
        "Full Name (Display)": "เปอร์",
        "Contact Email": "per@example.com",
        "Membership Tier": "Premium",
        "Membership Status": "Active",
        "Points Balance": 345,
        "Risk Level": "private-do-not-return",
        "Internal Notes": ["rec_secret"],
      } }] });
    }
    if (table === "Sessions") {
      return Response.json({ records: [
        { fields: { email: "per@example.com", job_date: recent, job_type: "Dinner", "Session Status": "Completed", note: "private" } },
        { fields: { email: "per@example.com", job_date: recent, job_type: "Cancelled", "Session Status": "Cancelled" } },
        { fields: { email: "per@example.com", job_date: older, job_type: "Old", "Session Status": "Completed" } },
      ] });
    }
    if (table === "member_packages") {
      return Response.json({ records: [
        { fields: { member_email: "per@example.com", package_code: "premium", status: "active", start_date: recent, created_at: `${recent}T03:00:00.000Z`, end_date: "2027-08-31", amount: 2999 } },
        { fields: { member_email: "per@example.com", package_code: "standard", status: "expired", start_date: older, created_at: `${older}T03:00:00.000Z` } },
      ] });
    }
    if (table === "Payments") {
      return Response.json({ records: [{ fields: {
        member_email: "per@example.com",
        "Payment Status": "paid",
        "Verification Status": "verified",
        "Created At": `${recent}T03:00:00.000Z`,
        payment_ref: "private-payment-ref",
      } }] });
    }
    if (table === "MMD — Points Ledger") {
      return Response.json({ records: [
        { fields: { member_email: "per@example.com", points: 25, transaction_status: "posted", posted_at: `${recent}T02:00:00.000Z`, payment_ref: "private-ref", note: "private" } },
        { fields: { member_email: "per@example.com", points: 5000, transaction_status: "pending", posted_at: `${recent}T02:00:00.000Z` } },
        { fields: { member_email: "per@example.com", points: 99, transaction_status: "posted", posted_at: `${older}T02:00:00.000Z` } },
      ] });
    }
    throw new Error(`Unexpected Airtable table: ${table}`);
  };

  const response = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }), env());
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.member_exists, true);
  assert.equal(payload.data.member_id, "mmd-per-01");
  const profile = payload.data.profile;
  assert.equal(profile.display_name, "เปอร์");
  assert.equal(profile.tier, "Premium");
  assert.equal(profile.membership_status, "active");
  assert.equal(profile.membership_expires_at, "2027-08-31");
  assert.equal(profile.points, 25);
  assert.equal(profile.points_records_count, 1);
  assert.equal(profile.payment_status, "verified");
  assert.equal(profile.customer_360.version, "customer_360_v2");
  assert.equal(profile.customer_360.points.active_points, 25);
  assert.equal(profile.customer_360.packages.current_package.code, "premium");
  assert.equal(profile.customer_360.jobs.completed_jobs[0].service_title, "Dinner");
  assert.equal(profile.customer_360.jobs.cancelled_jobs.length, 1);
  assert.equal(profile.customer_360.history.range_days, 365);
  assert.equal(calls.length, 5);
  assert.match(calls[0].searchParams.get("filterByFormula") || "", /\{line_id\}/);
  assert.doesNotMatch(JSON.stringify(payload), /private|Risk|Internal Notes|payment_ref|per@example\.com|rec_private/i);
});

test("LIFF payment status requires authoritative verification and otherwise fails closed", async () => {
  useFixedClock();
  const cases = [
    [{ "Payment Status": "paid", "Verification Status": "verified" }, "verified"],
    [{ "Payment Status": "success", "Verification Status": "verified" }, "unavailable"],
    [{ "Payment Status": "verified", "Verification Status": "verified" }, "unavailable"],
    [{ "Payment Status": "full_payment" }, "unavailable"],
    [{ "Payment Status": "paid" }, "unavailable"],
    [{ "Payment Status": "paid", "Verification Status": "pending" }, "unavailable"],
    [{ "Payment Status": "pending", "Verification Status": "pending" }, "pending_review"],
    [{ "Payment Status": "paid", "Verification Status": "rejected" }, "unavailable"],
    [{ "Payment Status": "failed", "Verification Status": "pending" }, "unavailable"],
    [{ "Payment Status": "refunded", "Verification Status": "pending" }, "unavailable"],
    [{ "Payment Status": "refunded", "Verification Status": "verified" }, "unavailable"],
    [{ "Payment Status": { malformed: true }, "Verification Status": [] }, "unavailable"],
    [{}, "unavailable"],
  ];

  for (const [paymentFields, expected] of cases) {
    globalThis.fetch = async (input) => {
      const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
      if (table === "Members") return Response.json({ records: [{ id: "rec_member", fields: { line_id: LINE_ID, "Contact Email": "per@example.com" } }] });
      if (table === "Sessions" || table === "member_packages" || table === "MMD — Points Ledger") return Response.json({ records: [] });
      if (table === "Payments") return Response.json({ records: [{ fields: { member_email: "per@example.com", ...paymentFields } }] });
      throw new Error(`Unexpected Airtable table: ${table}`);
    };
    const response = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }), env());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.profile.payment_status, expected, JSON.stringify(paymentFields));
  }
});

test("LIFF points come from posted ledger records, not member summary balance", async () => {
  useFixedClock();
  globalThis.fetch = async (input) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "Members") return Response.json({ records: [{ id: "rec_member", fields: {
      line_id: LINE_ID,
      "Contact Email": "per@example.com",
      "Points Balance": 9999,
    } }] });
    if (table === "Sessions" || table === "member_packages" || table === "Payments") return Response.json({ records: [] });
    if (table === "MMD — Points Ledger") return Response.json({ records: [
      { fields: { member_email: "per@example.com", points: 10, transaction_status: "posted", posted_at: "2026-08-10T02:00:00.000Z" } },
      { fields: { member_email: "per@example.com", points: 20, transaction_status: "pending", posted_at: "2026-08-10T02:00:00.000Z" } },
    ] });
    throw new Error(`Unexpected Airtable table: ${table}`);
  };

  const response = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }), env());
  const profile = (await response.json()).data.profile;

  assert.equal(profile.points, 10);
  assert.equal(profile.points_records_count, 1);
});

test("LIFF points return genuine zero after the points ledger resolves empty", async () => {
  useFixedClock();
  globalThis.fetch = async (input) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "Members") return Response.json({ records: [{ id: "rec_member", fields: {
      line_id: LINE_ID,
      "Contact Email": "per@example.com",
      "Points Balance": 9999,
    } }] });
    if (table === "Sessions" || table === "member_packages" || table === "Payments" || table === "MMD — Points Ledger") {
      return Response.json({ records: [] });
    }
    throw new Error(`Unexpected Airtable table: ${table}`);
  };

  const response = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }), env());
  const profile = (await response.json()).data.profile;

  assert.equal(profile.points, 0);
  assert.equal(profile.points_records_count, 0);
});

test("LIFF profile omits unproven expiry and fails payment lookup closed", async () => {
  globalThis.fetch = async (input) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "Members") return Response.json({ records: [{ id: "rec_member", fields: { line_id: LINE_ID, "Contact Email": "per@example.com", "Membership Expiry": "2099-01-01" } }] });
    if (table === "Sessions" || table === "MMD — Points Ledger") return Response.json({ records: [] });
    if (table === "member_packages") return Response.json({ records: [{ fields: { member_email: "per@example.com", status: "active", end_date: "not-a-date" } }] });
    if (table === "Payments") throw new Error("payment source unavailable");
    throw new Error(`Unexpected Airtable table: ${table}`);
  };
  const response = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }), env());
  const profile = (await response.json()).data.profile;
  assert.equal(profile.payment_status, "unavailable");
  assert.equal(profile.membership_expires_at, null);
});

test("LIFF payment status does not skip an unknown latest record to expose stale verified state", async () => {
  globalThis.fetch = async (input) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "Members") return Response.json({ records: [{ id: "rec_member", fields: { line_id: LINE_ID, "Contact Email": "per@example.com" } }] });
    if (table === "Sessions" || table === "member_packages" || table === "MMD — Points Ledger") return Response.json({ records: [] });
    if (table === "Payments") return Response.json({ records: [
      { fields: { member_email: "per@example.com", "Payment Status": "mystery", "Verification Status": "mystery" } },
      { fields: { member_email: "per@example.com", "Payment Status": "paid", "Verification Status": "verified" } },
    ] });
    throw new Error(`Unexpected Airtable table: ${table}`);
  };
  const response = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }), env());
  assert.equal((await response.json()).data.profile.payment_status, "unavailable");
});

test("LIFF payment status keeps newest pending authoritative over an older verified record", async () => {
  globalThis.fetch = async (input) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "Members") return Response.json({ records: [{ id: "rec_member", fields: { line_id: LINE_ID, "Contact Email": "per@example.com" } }] });
    if (table === "Sessions" || table === "member_packages" || table === "MMD — Points Ledger") return Response.json({ records: [] });
    if (table === "Payments") return Response.json({ records: [
      { fields: { member_email: "per@example.com", "Payment Status": "pending", "Verification Status": "pending" } },
      { fields: { member_email: "per@example.com", "Payment Status": "paid", "Verification Status": "verified" } },
    ] });
    throw new Error(`Unexpected Airtable table: ${table}`);
  };
  const response = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }), env());
  assert.equal((await response.json()).data.profile.payment_status, "pending_review");
});

test("LIFF expiry uses the unique newest package and never derives a tier from Members", async () => {
  useFixedClock();
  const packageCases = [
    {
      name: "newest active package wins",
      memberStatus: "Active",
      records: [
        { fields: { status: "active", created_at: "2026-08-10T10:00:00.000Z", end_date: "2027-01-31" } },
        { fields: { status: "active", created_at: "2026-07-10T10:00:00.000Z", end_date: "2028-01-31" } },
      ],
      expected: "2027-01-31",
    },
    {
      name: "grace member and grace package",
      memberStatus: "Grace",
      records: [{ fields: { status: "grace", end_date: "2026-09-30" } }],
      expected: "2026-09-30",
    },
    {
      name: "expired member conflicts with future active package",
      memberStatus: "Expired",
      records: [{ fields: { status: "active", end_date: "2027-01-31" } }],
      expected: "2027-01-31",
    },
    {
      name: "unknown member status",
      memberStatus: "mystery",
      records: [{ fields: { status: "active", end_date: "2027-01-31" } }],
      expected: "2027-01-31",
    },
    { name: "no package", memberStatus: "Active", records: [], expected: "" },
    {
      name: "newest blank blocks older later date",
      memberStatus: "Active",
      records: [
        { fields: { status: "active", created_at: "2026-08-10T10:00:00.000Z", end_date: "" } },
        { fields: { status: "active", created_at: "2026-07-10T10:00:00.000Z", end_date: "2028-01-31" } },
      ],
      expected: "",
    },
    {
      name: "newest expired blocks older active",
      memberStatus: "Active",
      records: [
        { fields: { status: "expired", created_at: "2026-08-10T10:00:00.000Z", end_date: "2026-08-09" } },
        { fields: { status: "active", created_at: "2026-07-10T10:00:00.000Z", end_date: "2028-01-31" } },
      ],
      expected: "",
    },
    {
      name: "tied current records are ambiguous",
      memberStatus: "Active",
      records: [
        { fields: { status: "active", created_at: "2026-08-10T10:00:00.000Z", end_date: "2027-01-31" } },
        { fields: { status: "active", created_at: "2026-08-10T10:00:00.000Z", end_date: "2027-02-28" } },
      ],
      expected: "",
    },
    { name: "invalid Gregorian date", memberStatus: "Active", records: [{ fields: { status: "active", end_date: "2026-02-30" } }], expected: "" },
    { name: "timestamp is not a calendar date", memberStatus: "Active", records: [{ fields: { status: "active", end_date: "2027-01-31T00:00:00Z" } }], expected: "" },
    { name: "lifetime has no derived expiry", memberStatus: "Active", records: [{ fields: { status: "active", package_code: "lifetime", end_date: "" } }], expected: "" },
  ];

  for (const scenario of packageCases) {
    globalThis.fetch = async (input) => {
      const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
      if (table === "Members") return Response.json({ records: [{ id: "rec_member", fields: {
        line_id: LINE_ID,
        "Contact Email": "per@example.com",
        "Membership Status": scenario.memberStatus,
        "Membership Tier": "Premium",
      } }] });
      if (table === "member_packages") return Response.json({ records: scenario.records });
      if (table === "Sessions" || table === "MMD — Points Ledger" || table === "Payments") return Response.json({ records: [] });
      throw new Error(`Unexpected Airtable table: ${table}`);
    };
    const response = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }), env());
    const profile = (await response.json()).data.profile;
    assert.equal(profile.membership_expires_at || "", scenario.expected, scenario.name);
    assert.equal(profile.tier, "Member", `${scenario.name}: legacy Members tier does not grant a package tier`);
  }
});

test("pending renewal payment never changes membership status or expiry", async () => {
  globalThis.fetch = async (input) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "Members") return Response.json({ records: [{ id: "rec_member", fields: {
      line_id: LINE_ID,
      "Contact Email": "per@example.com",
      "Membership Status": "Expired",
      "Membership Tier": "Standard",
    } }] });
    if (table === "member_packages") return Response.json({ records: [{ fields: { status: "expired", end_date: "2026-01-01" } }] });
    if (table === "Payments") return Response.json({ records: [{ fields: { "Payment Status": "pending", "Verification Status": "pending" } }] });
    if (table === "Sessions" || table === "MMD — Points Ledger") return Response.json({ records: [] });
    throw new Error(`Unexpected Airtable table: ${table}`);
  };
  const response = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }), env());
  const profile = (await response.json()).data.profile;
  assert.equal(profile.membership_status, "expired");
  assert.equal(profile.tier, "Member");
  assert.equal(profile.payment_status, "pending_review");
  assert.equal(profile.membership_expires_at, null);
});

test("LIFF member profile resolver rejects public calls and browser-selected history scope", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("must not call Airtable"); };

  const publicResponse = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }, ""), env());
  const widened = await worker.fetch(request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read", history_days: 3650 }), env());

  assert.equal(publicResponse.status, 404);
  assert.equal(widened.status, 400);
  assert.equal(called, false);
});

test("LIFF member profile returns partial-safe Customer 360 when ancillary reads hit the shared deadline", async () => {
  let abortedReads = 0;
  globalThis.fetch = async (input, init = {}) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "Members") {
      return Response.json({ records: [{ id: "rec_member", fields: {
        line_id: LINE_ID,
        member_id: "mmd-stage-timeout",
        "Full Name (Display)": "Deadline Test",
        "Contact Email": "deadline@example.invalid",
      } }] });
    }
    return new Promise((_resolve, reject) => {
      const fail = () => {
        abortedReads += 1;
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (init.signal?.aborted) return fail();
      init.signal?.addEventListener("abort", fail, { once: true });
    });
  };

  const startedAt = Date.now();
  const response = await worker.fetch(
    request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }),
    env({ MEMBER_STATUS_AIRTABLE_TIMEOUT_MS: "50" }),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.member_exists, true);
  assert.equal(payload.data.member_id, "mmd-stage-timeout");
  assert.equal(payload.data.profile.customer_360.packages.status, "checking");
  assert.equal(payload.data.profile.customer_360.points.status, "checking");
  assert.equal(payload.data.profile.customer_360.jobs.status, "checking");
  assert.ok(abortedReads >= 3);
  assert.ok(Date.now() - startedAt < 500);
});

test("LIFF member profile fails closed when the authoritative Members lookup exceeds the shared deadline", async () => {
  let aborted = false;
  globalThis.fetch = async (_input, init = {}) => new Promise((_resolve, reject) => {
    const fail = () => {
      aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (init.signal?.aborted) return fail();
    init.signal?.addEventListener("abort", fail, { once: true });
  });

  const response = await worker.fetch(
    request({ line_user_id: LINE_ID, purpose: "liff_member_profile_read" }),
    env({ MEMBER_STATUS_AIRTABLE_TIMEOUT_MS: "50" }),
  );
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error.code, "MEMBER_PROFILE_RESOLVER_UNAVAILABLE");
  assert.equal(aborted, true);
});
