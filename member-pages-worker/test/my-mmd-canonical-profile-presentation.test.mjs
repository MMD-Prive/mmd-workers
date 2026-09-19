import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMyMmdCanonicalEntitlementResponse,
  projectProtectedEntitlement,
  protectedConnectNowActiveThrough,
  readOrCreateProtectedActiveThroughAnchor,
  projectHistoryRecoveryState,
  readLineOfcNoteScan,
} from "../src/my-mmd-canonical-entitlement-bridge.js";

const jsonResponse = (payload) => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { "content-type": "application/json; charset=utf-8" },
});

test("LINE OFC note scan reads every page through the latest note and extracts labelled contact data", async () => {
  const calls = [];
  const scan = await readLineOfcNoteScan({
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "app12345678901234",
    AIRTABLE_HTTP: { fetch: async (request) => {
      calls.push(String(request.url));
      const url = new URL(request.url);
      if (!url.searchParams.has("offset")) {
        return jsonResponse({
          records: [{ createdTime: "2026-09-16T00:00:00.000Z", fields: { admin_note: "เบอร์: 081-234-5678", payload_json: "{}" } }],
          offset: "next-page",
        });
      }
      return jsonResponse({
        records: [{ createdTime: "2026-09-17T00:00:00.000Z", fields: { admin_note: "email: que@example.com", payload_json: "{}" } }],
      });
    } },
  }, "Ue4dfe745be2cae8cc8876f20fd275679");

  assert.equal(calls.length, 2);
  assert.equal(scan.scannedCount, 2);
  assert.equal(scan.lastNoteAt, "2026-09-17T00:00:00.000Z");
  assert.deepEqual(scan.contact, { email: "que@example.com", phone: "0812345678", lineHandle: null, telegramUsername: null });
});

test("protected entitlement projection carries only resolver-proven dates and package", () => {
  const projection = projectProtectedEntitlement({
    schema_version: "my_mmd_entitlement_resolver_v1",
    source_status: "verified",
    fail_closed: true,
    member_blocked: false,
    access: {
      public_service_access: true,
      protected_capabilities_active: ["svip"],
      protected_capabilities_grace: [],
    },
    entitlements: [{
      capability: "svip",
      lifecycle: "active",
      start_at: "2026-09-01T00:00:00.000Z",
      expire_at: "2028-09-01T00:00:00.000Z",
      package_code: "svip_2y",
    }],
  });

  assert.deepEqual(projection, {
    capability: "svip",
    label: "SVIP",
    lifecycle: "active",
    publicServiceAccess: true,
    startAt: "2026-09-01",
    expiresAt: "2028-09-01",
    packageLabel: "SVIP Membership",
  });
});

test("profile response marks a valid LIFF session as LINE-connected without inventing a LINE name", async () => {
  const request = new Request("https://mmdbkk.com/api/member/app/profile");
  const response = jsonResponse({
    match_state: "matched",
    member_display_name: "Joeka",
    line_display_name: null,
    line_connected: false,
    membership_tier: "svip",
    membership_status: "active",
    points_confirmed: null,
    active_through: null,
    member_since: null,
  });

  const patched = await applyMyMmdCanonicalEntitlementResponse(request, response, {
    profileRefreshed: true,
    lineConnected: true,
    membershipStart: "2026-09-01",
    membershipExpiresAt: "2028-09-01",
    packageLabel: null,
    historyRecoveryState: "recovery_pending",
    capability: null,
    source: "member_profile_resolver",
  });
  const payload = await patched.json();

  assert.equal(payload.line_connected, true);
  assert.equal(payload.line_display_name, null);
  assert.equal(payload.member_since, "2026-09-01");
  assert.equal(payload.active_through, "2028-09-01");
  assert.equal(payload.history_recovery_state, "recovery_pending");
});

test("protected profile projection fills trusted tier while preserving existing canonical dates", async () => {
  const request = new Request("https://mmdbkk.com/api/member/app/profile");
  const response = jsonResponse({
    match_state: "matched",
    membership_tier: "standard",
    membership_status: "active",
    member_since: "2025-01-01",
    active_through: "2027-01-01",
  });

  const patched = await applyMyMmdCanonicalEntitlementResponse(request, response, {
    lineConnected: true,
    membershipStart: "2026-09-01",
    membershipExpiresAt: "2028-09-01",
    packageLabel: "SVIP Membership",
    historyRecoveryState: null,
    capability: "svip",
    lifecycle: "active",
    publicServiceAccess: true,
    source: "my_mmd_entitlement_resolver_v1",
  });
  const payload = await patched.json();

  assert.equal(payload.membership_tier, "svip");
  assert.equal(payload.membership_status, "active");
  assert.equal(payload.member_since, "2025-01-01");
  assert.equal(payload.active_through, "2027-01-01");
  assert.equal(payload.package_label, "SVIP Membership");
});

test("membership response receives profile-proven package/dates without widening tier or access", async () => {
  const request = new Request("https://mmdbkk.com/api/member/app/membership");
  const response = jsonResponse({
    level: "standard",
    levelVerified: true,
    status: "active",
    packageLabel: null,
    renewalDueAt: null,
    renewalState: "unknown",
    access: "checking",
    expiresAt: null,
  });

  const patched = await applyMyMmdCanonicalEntitlementResponse(request, response, {
    profileRefreshed: true,
    lineConnected: true,
    membershipStart: "2026-08-01",
    membershipExpiresAt: "2027-08-01",
    packageLabel: "Standard Membership",
    historyRecoveryState: null,
    capability: null,
    source: "member_profile_resolver",
  });
  const payload = await patched.json();

  assert.equal(payload.level, "standard");
  assert.equal(payload.status, "active");
  assert.equal(payload.access, "checking");
  assert.equal(payload.packageLabel, "Standard Membership");
  assert.equal(payload.memberSince, "2026-08-01");
  assert.equal(payload.expiresAt, "2027-08-01");
  assert.equal(payload.renewalDueAt, "2027-08-01");
});

test("missing historical fields stay missing and are marked recovery pending rather than fabricated", async () => {
  const request = new Request("https://mmdbkk.com/api/member/app/membership");
  const response = jsonResponse({
    level: "svip",
    levelVerified: true,
    status: "active",
    packageLabel: null,
    renewalDueAt: null,
    renewalState: "unknown",
    access: "granted",
    expiresAt: null,
  });

  const patched = await applyMyMmdCanonicalEntitlementResponse(request, response, {
    profileRefreshed: true,
    lineConnected: true,
    membershipStart: null,
    membershipExpiresAt: null,
    packageLabel: null,
    historyRecoveryState: "recovery_pending",
    capability: null,
    source: "member_profile_resolver",
  });
  const payload = await patched.json();

  assert.equal(payload.memberSince, undefined);
  assert.equal(payload.expiresAt, null);
  assert.equal(payload.packageLabel, null);
  assert.equal(payload.historyRecoveryState, "recovery_pending");
});


test("protected active member without canonical expiry gets connect-now +2y active-through", () => {
  const projection = {
    capability: "svip",
    label: "SVIP",
    lifecycle: "active",
    publicServiceAccess: true,
    startAt: null,
    expiresAt: null,
    packageLabel: "SVIP Membership",
  };
  assert.equal(
    protectedConnectNowActiveThrough(projection, "2026-09-19"),
    "2028-09-19",
  );
});

test("connect-now active-through policy never applies to grace or non-protected capability", () => {
  assert.equal(protectedConnectNowActiveThrough({ capability: "svip", lifecycle: "grace" }, "2026-09-19"), null);
  assert.equal(protectedConnectNowActiveThrough({ capability: "premium", lifecycle: "active" }, "2026-09-19"), null);
});


test("protected active-through anchor is durable and does not slide on later requests", async () => {
  const memory = new Map();
  const store = {
    async get(key, format) {
      assert.equal(format, "json");
      const raw = memory.get(key);
      return raw ? JSON.parse(raw) : null;
    },
    async put(key, value) {
      memory.set(key, value);
    },
  };
  const env = {
    LIFF_IDENTITY_KV: store,
    LIFF_SESSION_SECRET: "s".repeat(64),
  };
  const projection = {
    capability: "svip",
    label: "SVIP",
    lifecycle: "active",
    publicServiceAccess: true,
    startAt: null,
    expiresAt: null,
    packageLabel: "SVIP Membership",
  };
  const lineId = `U${"a".repeat(32)}`;

  const first = await readOrCreateProtectedActiveThroughAnchor(
    env,
    lineId,
    projection,
    new Date("2026-09-19T10:00:00.000Z"),
  );
  const later = await readOrCreateProtectedActiveThroughAnchor(
    env,
    lineId,
    projection,
    new Date("2027-03-01T10:00:00.000Z"),
  );

  assert.equal(first, "2028-09-19");
  assert.equal(later, "2028-09-19");
  assert.equal(memory.size, 1);
  const stored = JSON.parse([...memory.values()][0]);
  assert.equal(stored.contains_raw_line_id, false);
  assert.equal(stored.policy, "protected_connect_now_plus_2y_v1");
  assert.doesNotMatch(JSON.stringify(stored), new RegExp(lineId));
});


test("history recovery projection only treats checking/in_progress as loading", () => {
  assert.deepEqual(projectHistoryRecoveryState({ state: "checking" }), {
    historyRecoveryState: "recovery_pending",
    historyRecoveryStatus: "checking",
    historyReviewRequired: false,
  });
  assert.deepEqual(projectHistoryRecoveryState({ state: "in_progress" }), {
    historyRecoveryState: "recovery_pending",
    historyRecoveryStatus: "in_progress",
    historyReviewRequired: false,
  });
});

test("reconciled recovery is terminal even when legacy metadata still says pending", () => {
  assert.deepEqual(
    projectHistoryRecoveryState(
      { state: "reconciled" },
      { history_recovery_state: "pending" },
      { history_recovery_state: "pending" },
    ),
    {
      historyRecoveryState: null,
      historyRecoveryStatus: "reconciled",
      historyReviewRequired: false,
    },
  );
});

test("review_required is terminal reconstruction with bounded review, not loading", () => {
  assert.deepEqual(projectHistoryRecoveryState({ state: "review_required", pending_review_count: 2 }), {
    historyRecoveryState: null,
    historyRecoveryStatus: "review_required",
    historyReviewRequired: true,
  });
});

test("missing membership dates alone never create recovery_pending without a recovery signal", () => {
  assert.deepEqual(projectHistoryRecoveryState(null, {}, {}), {
    historyRecoveryState: null,
    historyRecoveryStatus: null,
    historyReviewRequired: false,
  });
});
