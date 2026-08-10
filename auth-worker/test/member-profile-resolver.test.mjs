import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import worker from "../src/index.js";

const LINE_ID = `U${"b".repeat(32)}`;
const SECRET = "test-only-member-status-resolver-secret-1234567890";
const RESOLVER_URL = "https://mmd-auth-worker.internal/__internal/member-profile/read";
const realFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = realFetch; });

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
    AIRTABLE_TABLE_POINTS_LEDGER: "MMD — Points Ledger",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_id",
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
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

test("LIFF member profile resolver returns only points, tier, and one-year customer-safe history", async () => {
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
        { fields: { member_email: "per@example.com", package_code: "premium", status: "active", start_date: recent, amount: 2999 } },
        { fields: { member_email: "per@example.com", package_code: "standard", status: "expired", start_date: older } },
      ] });
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
  assert.deepEqual(payload.data.profile, {
    display_name: "เปอร์",
    tier: "Premium",
    membership_status: "active",
    points: 345,
    history_window: { from: dateOffset(-365), to: dateOffset(0), timezone: "Asia/Bangkok" },
    history: [
      { type: "service", date: recent, title: "Dinner", status: "completed" },
      { type: "membership", date: recent, title: "Premium Membership", status: "active" },
      { type: "points", date: recent, title: "Points added", points_delta: 25, status: "posted" },
    ],
  });
  assert.equal(calls.length, 4);
  assert.match(calls[0].searchParams.get("filterByFormula") || "", /\{line_id\}/);
  assert.doesNotMatch(JSON.stringify(payload), /private|Risk|Internal Notes|payment_ref|amount|per@example\.com|rec_private/i);
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
