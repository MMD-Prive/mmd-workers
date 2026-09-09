import assert from "node:assert/strict";
import test from "node:test";

import { handleMemberAppApi } from "../src/member-app-api.js";

const SECRET = "test-only-liff-session-secret-1234567890";
const TOKEN = "ad-day-session-token";
const LINE_ID = `U${"a".repeat(32)}`;

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

function request() {
  return new Request("https://mmdbkk.com/api/member/app/dashboard", {
    method: "GET",
    headers: {
      origin: "https://mmdbkk.com",
      cookie: `__Host-mmd_liff_session=${TOKEN}`,
      accept: "application/json",
    },
  });
}

function dashboardDelegate({ tier = null, status = null, points = null } = {}) {
  return {
    async fetch(input) {
      assert.equal(new URL(input.url).pathname, "/api/member/dashboard");
      const verifiedTier = tier
        ? { value: tier, status: "verified", source: "member_profile_resolver" }
        : { value: null, status: "checking", source: "member_profile" };
      const verifiedStatus = status
        ? { value: status, status: "verified", source: "member_profile_resolver" }
        : { value: null, status: "checking", source: "member_profile" };
      return Response.json({
        ok: true,
        data: {
          dashboard_state: tier || status ? "ready" : "checking",
          member: {
            display_name: "สมาชิก MMD",
            tier: verifiedTier,
            membership_status: verifiedStatus,
          },
          points: points === null
            ? { value: null, status: "checking", records_count: null }
            : { value: points, status: "verified", records_count: 1 },
          history: { status: "empty", events: [] },
          payment_history: { status: "empty", records: [] },
        },
      }, {
        status: 200,
        headers: { "set-cookie": "__Host-mmd_liff_session=rotated; Secure; HttpOnly; Path=/; SameSite=Strict" },
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

test("Active: canonical member gets active lifecycle, expiry, points and CARE BACK CTA", async () => {
  const env = await envForSession({
    memberExists: true,
    memberProfile: { membership_expires_at: "2027-02-28" },
  });
  const response = await handleMemberAppApi(request(), env, dashboardDelegate({ tier: "Premium", status: "active", points: 426 }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.lifecycle, "active");
  assert.equal(payload.membership.level, "premium");
  assert.equal(payload.membership.levelVerified, true);
  assert.equal(payload.membership.expiresAt, "2027-02-28");
  assert.equal(payload.points.confirmedBalance, 426);
  assert.equal(payload.nextAction.kind, "care_back_wish");
  assert.equal(payload.nextAction.url, "/promotion/6-years-care-back/wish");
  assert.equal(payload.legacyDisplay, null);
});

test("Expired: canonical member gets renew CTA", async () => {
  const env = await envForSession({
    memberExists: true,
    memberProfile: { membership_expires_at: "2026-08-20" },
  });
  const response = await handleMemberAppApi(request(), env, dashboardDelegate({ tier: "Standard", status: "expired", points: 80 }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.lifecycle, "expired");
  assert.equal(payload.nextAction.kind, "renew");
  assert.equal(payload.nextAction.url, "/sigil/member/membership?source=line&intent=renew");
});

test("New: LINE-verified non-member returns 200 lifecycle=new with immediate signup CTA", async () => {
  const env = await envForSession({ memberExists: false });
  await withAirtableRecords([], async () => {
    const response = await handleMemberAppApi(request(), env, dashboardDelegate());
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.lifecycle, "new");
    assert.equal(payload.membership.lifecycle, "new");
    assert.equal(payload.nextAction.kind, "signup");
    assert.equal(payload.nextAction.url, "/sigil/member/membership?source=line&intent=signup");
    assert.equal(payload.membership.access, "checking");
  });
});

test("Legacy-only: exact LINE match may display parsed tier/status but never grants entitlement or Points", async () => {
  const env = await envForSession({ memberExists: false });
  const legacyRecord = {
    id: "recLegacyDisplay01",
    fields: {
      line_user_id: LINE_ID,
      parsed_client_level: "premium",
      parsed_membership_status: "member",
      parse_confidence: 0.92,
    },
  };
  await withAirtableRecords([legacyRecord], async () => {
    const response = await handleMemberAppApi(request(), env, dashboardDelegate());
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.lifecycle, "checking");
    assert.equal(payload.membership.level, "premium");
    assert.equal(payload.membership.levelVerified, false);
    assert.equal(payload.membership.displayOnly, true);
    assert.equal(payload.membership.displaySource, "line_ofc_legacy_display_only");
    assert.equal(payload.membership.legacyStatus, "member");
    assert.equal(payload.nextAction.kind, "checking");
    assert.equal(payload.legacyDisplay.grantsEntitlement, false);
    assert.equal(payload.legacyDisplay.grantsPoints, false);
    assert.equal(payload.points.confirmedBalance, null);
  });
});
