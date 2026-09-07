import assert from "node:assert/strict";
import test from "node:test";

import { handleMemberAppApi } from "../src/member-app-api.js";

const SECRET = "test-only-liff-session-secret-1234567890";
const TOKEN = "legacy-multirow-session-token";
const LINE_ID = `U${"b".repeat(32)}`;

async function keyedDigest(value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function envForSession({ memberExists, memberProfile = null }) {
  const hash = await keyedDigest(`session:${TOKEN}`);
  const key = `liff:session:${hash}`;
  const store = new Map([[key, {
    line_user_id: LINE_ID,
    member_exists: memberExists,
    member_id: memberExists ? "mem_test" : null,
    member_profile: memberProfile,
    expires_at: Date.now() + 60_000,
  }]]);
  return {
    LIFF_SESSION_SECRET: SECRET,
    LIFF_IDENTITY_KV: {
      async get(name, type) {
        const value = store.get(name) || null;
        if (type === "json") return value;
        return value ? JSON.stringify(value) : null;
      },
    },
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app-test-base",
  };
}

function request(path = "/api/member/app/dashboard") {
  return new Request(`https://mmdbkk.com${path}`, {
    method: "GET",
    headers: {
      origin: "https://mmdbkk.com",
      cookie: `__Host-mmd_liff_session=${TOKEN}`,
      accept: "application/json",
    },
  });
}

function dashboardDelegate({
  tier = null,
  status = null,
  points = null,
  historyEvents = [],
  paymentRecords = [],
} = {}) {
  return {
    async fetch(input) {
      assert.equal(new URL(input.url).pathname, "/api/member/dashboard");
      return Response.json({
        ok: true,
        data: {
          dashboard_state: tier || status ? "ready" : "checking",
          member: {
            display_name: "สมาชิก MMD",
            tier: tier
              ? { value: tier, status: "verified", source: "member_profile_resolver" }
              : { value: null, status: "checking", source: "member_profile" },
            membership_status: status
              ? { value: status, status: "verified", source: "member_profile_resolver" }
              : { value: null, status: "checking", source: "member_profile" },
          },
          points: points === null
            ? { value: null, status: "checking", records_count: null }
            : { value: points, status: "verified", records_count: historyEvents.filter((item) => item.type === "points").length },
          history: { status: historyEvents.length ? "verified" : "empty", events: historyEvents },
          payment_history: { status: paymentRecords.length ? "verified_history" : "empty", records: paymentRecords },
        },
      });
    },
  };
}

async function withAirtableRecords(records, fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.match(url.pathname, /app-test-base/);
    assert.match(url.searchParams.get("filterByFormula") || "", /line_user_id/);
    return Response.json({ records });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function withAirtablePages(pages, fn) {
  const realFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.match(url.pathname, /app-test-base/);
    assert.match(url.searchParams.get("filterByFormula") || "", /line_user_id/);
    if (call > 0) assert.equal(url.searchParams.get("offset"), pages[call - 1].offset);
    const page = pages[call] || { records: [] };
    call += 1;
    return Response.json(page);
  };
  try {
    const result = await fn();
    return { result, calls: call };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("multi-row legacy lookup follows pagination and lets operator Rename beat guest webhook rows", async () => {
  const env = await envForSession({ memberExists: false });
  const guestRow = {
    id: "recGuestWebhook01",
    createdTime: "2026-06-01T07:40:02.000Z",
    fields: {
      line_user_id: LINE_ID,
      parsed_client_level: "guest",
      parsed_membership_status: "none",
    },
  };
  const renamedRow = {
    id: "recRenameSvip001",
    createdTime: "2026-09-03T17:36:52.000Z",
    fields: {
      line_user_id: LINE_ID,
      line_renamed_name: "เจ - SVIP - (Jjeune)",
      parsed_client_level: "review_required",
      parsed_membership_status: "review_required",
    },
  };

  const { result: response, calls } = await withAirtablePages([
    { records: [guestRow], offset: "page-2" },
    { records: [renamedRow] },
  ], () => handleMemberAppApi(request(), env, dashboardDelegate()));
  const payload = await response.json();

  assert.equal(calls, 2);
  assert.equal(payload.lifecycle, "checking");
  assert.equal(payload.membership.level, "svip");
  assert.equal(payload.membership.levelVerified, false);
  assert.equal(payload.membership.displayOnly, true);
  assert.equal(payload.membership.legacyStatus, "member");
  assert.equal(payload.legacyDisplay.level, "svip");
  assert.equal(payload.legacyDisplay.grantsEntitlement, false);
});

test("canonical SVIP stays active while empty history and zero points remain recovery-pending", async () => {
  const env = await envForSession({ memberExists: true });
  const legacyService = {
    id: "recHistoricalService1",
    createdTime: "2026-09-03T17:36:52.000Z",
    fields: {
      line_user_id: LINE_ID,
      line_renamed_name: "เจ - SVIP",
      historical_events_json: JSON.stringify([
        { type: "service_confirmation", amount_displayed: 5000, date: "2026-05-08" },
      ]),
    },
  };
  const upstream = dashboardDelegate({ tier: "SVIP", status: "active", points: 0 });

  await withAirtableRecords([legacyService], async () => {
    const dashboardResponse = await handleMemberAppApi(request(), env, upstream);
    const dashboard = await dashboardResponse.json();
    assert.equal(dashboard.membership.level, "svip");
    assert.equal(dashboard.membership.levelVerified, true);
    assert.equal(dashboard.membership.lifecycle, "active");
    assert.equal(dashboard.points.confirmedBalance, null);
    assert.equal(dashboard.pointsRecoveryPending, true);
    assert.equal(dashboard.legacyDisplay, null);

    const pointsResponse = await handleMemberAppApi(request("/api/member/app/points"), env, upstream);
    const points = await pointsResponse.json();
    assert.equal(points.state, "checking");
    assert.equal(points.summary.confirmedBalance, null);
    assert.deepEqual(points.ledger, []);

    const historyResponse = await handleMemberAppApi(request("/api/member/app/history"), env, upstream);
    const history = await historyResponse.json();
    assert.equal(history.state, "checking");
    assert.deepEqual(history.items, []);
  });
});

test("materialized canonical history stops the recovery-pending guard", async () => {
  const env = await envForSession({ memberExists: true });
  const upstream = dashboardDelegate({
    tier: "SVIP",
    status: "active",
    points: 0,
    historyEvents: [
      { type: "service", date: "2026-05-08", title: "Travel Lunch", status: "completed" },
    ],
  });

  const pointsResponse = await handleMemberAppApi(request("/api/member/app/points"), env, upstream);
  const points = await pointsResponse.json();
  assert.equal(points.state, undefined);
  assert.equal(points.summary.confirmedBalance, 0);

  const historyResponse = await handleMemberAppApi(request("/api/member/app/history"), env, upstream);
  const history = await historyResponse.json();
  assert.equal(Array.isArray(history), true);
  assert.equal(history.length, 1);
  assert.equal(history[0].kind, "booking");
});
