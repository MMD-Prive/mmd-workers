import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import worker from "../src/index.js";

const realFetch = globalThis.fetch;
const LINE_ID = "U1234567890abcdef1234567890abcdef";

afterEach(() => {
  globalThis.fetch = realFetch;
});

class MemoryKv {
  constructor() { this.map = new Map(); }
  async get(key, type) {
    const value = this.map.get(key);
    if (value == null) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.map.set(key, String(value)); }
  async delete(key) { this.map.delete(key); }
}

class MemoryGatewayStore {
  async upsertSession() { return { record_id: "rec_liff_dashboard" }; }
  async recordDecision() {}
  async loadScreen() { return null; }
  async resolvePackage() { return null; }
  async hasHallAudienceInventory() { return false; }
}

function resolver({ memberExists = true, profile = profileFixture(), entitlementSnapshot = null, status = 200 } = {}) {
  return {
    calls: [],
    async fetch(request) {
      const body = await request.json();
      const path = new URL(request.url).pathname;
      this.calls.push({ path, body });
      if (status >= 400) return Response.json({ ok: false }, { status });
      if (path === "/__internal/member-profile/read") {
        return Response.json({
          ok: true,
          data: {
            member_exists: memberExists,
            member_id: "MMD-TEST-01",
            profile,
            ...(entitlementSnapshot ? { entitlement_snapshot: entitlementSnapshot } : {}),
          },
        });
      }
      return Response.json({ ok: true, data: { member_exists: memberExists } });
    },
  };
}

function switchingResolver(state) {
  return {
    calls: [],
    async fetch(request) {
      const body = await request.json();
      const path = new URL(request.url).pathname;
      this.calls.push({ path, body });
      if (path === "/__internal/member-profile/read") {
        return Response.json({
          ok: true,
          data: {
            member_exists: state.memberExists,
            member_id: state.memberExists ? "jjeunejj" : null,
            profile: state.profile,
            ...(state.entitlementSnapshot ? { entitlement_snapshot: state.entitlementSnapshot } : {}),
          },
        });
      }
      return Response.json({ ok: true, data: { member_exists: state.memberExists } });
    },
  };
}

function canonicalEntitlementSnapshot(capability = "svip", lifecycle = "active") {
  const active = lifecycle === "active" ? [capability] : [];
  const grace = lifecycle === "grace" ? [capability] : [];
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    source_status: "verified",
    fail_closed: true,
    member_blocked: false,
    member_id: "jjeunejj",
    access: {
      public_service_access: true,
      protected_capabilities_active: active,
      protected_capabilities_grace: grace,
      private_capabilities_active: active,
      private_capabilities_grace: grace,
    },
  };
}

function env(overrides = {}) {
  return {
    LINE_LOGIN_CHANNEL_ID: "2000000000",
    LINE_DASHBOARD_CHANNEL_ID: "2010862595",
    LIFF_SESSION_SECRET: "test-only-session-secret-not-production",
    MEMBER_STATUS_RESOLVER_SECRET: "test-only-member-status-resolver-secret-1234567890",
    LIFF_IDENTITY_KV: new MemoryKv(),
    LIFF_GATEWAY_STORE: new MemoryGatewayStore(),
    MEMBER_STATUS_RESOLVER: resolver(),
    ...overrides,
  };
}

function profileFixture(overrides = {}) {
  return {
    display_name: "คุณเปอร์",
    tier: "Premium",
    membership_status: "active",
    membership_expires_at: "2099-01-01",
    points: 125,
    points_records_count: 2,
    payment_status: "verified",
    payment_history: [{ date: "2026-08-01", title: "Membership payment", status: "verified", payment_ref: "pay_private" }],
    history: [
      { type: "service", date: "2026-08-10", title: "Dinner", status: "completed", internal_note: "private" },
      { type: "points", date: "2026-08-09", title: "Points added", status: "posted", points_delta: 25, payment_ref: "pay_private" },
    ],
    ...overrides,
  };
}

function mockLineVerify() {
  globalThis.fetch = async () => Response.json({
    sub: LINE_ID,
    aud: "2000000000",
    exp: Math.floor(Date.now() / 1000) + 600,
  });
}

async function startSession(runtime) {
  mockLineVerify();
  const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/start?t=abc", {
    method: "POST",
    headers: { origin: "https://mmdbkk.com", "content-type": "application/json" },
    body: JSON.stringify({ id_token: "valid-token", intent: "status", liff_intent: "status" }),
  }), runtime);
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  assert.match(cookie, /^__Host-mmd_liff_session=/);
  return cookie;
}

async function dashboard(runtime, cookie, query = "t=abc&code=c&promo=p&source=line&invite=i&unsafe=https://evil.example") {
  const response = await worker.fetch(new Request(`https://mmdbkk.com/api/member/dashboard?${query}`, {
    headers: { origin: "https://mmdbkk.com", cookie, accept: "application/json" },
  }), runtime);
  const payload = await response.json();
  return { response, payload };
}

async function memberAppMembership(runtime, cookie) {
  const response = await worker.fetch(new Request("https://mmdbkk.com/api/member/app/membership", {
    headers: { origin: "https://mmdbkk.com", cookie, accept: "application/json" },
  }), runtime);
  const payload = await response.json();
  return { response, payload };
}

describe("member dashboard Phase 1 API", () => {
  it("returns verified tier, non-zero points, history, and safe action URLs", async () => {
    const runtime = env();
    const cookie = await startSession(runtime);
    const { response, payload } = await dashboard(runtime, cookie);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.dashboard_state, "ready");
    assert.deepEqual(payload.data.member.tier, { value: "Premium", status: "verified", source: "member_profile_resolver" });
    assert.deepEqual(payload.data.points, { value: 125, status: "verified", source: "points_ledger", records_count: 2 });
    assert.equal(payload.data.history.status, "verified");
    assert.equal(payload.data.payment_history.status, "verified_history");
    assert.equal(payload.data.actions.dashboard_url, "/member/dashboard?t=abc&code=c&promo=p&source=line&invite=i");
    assert.doesNotMatch(JSON.stringify(payload), /unsafe|evil|payment_status|payment_ref|grants|SVIP|svip|internal_note/i);
  });

  it("returns genuine zero points only when the ledger count is resolved", async () => {
    const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ profile: profileFixture({ points: 0, points_records_count: 0, history: [], payment_history: [] }) }) });
    const cookie = await startSession(runtime);
    const { payload } = await dashboard(runtime, cookie);

    assert.equal(payload.data.points.status, "verified");
    assert.equal(payload.data.points.value, 0);
    assert.equal(payload.data.points.records_count, 0);
    assert.equal(payload.data.history.status, "empty");
  });

  it("keeps points checking when resolver payload does not prove ledger resolution", async () => {
    const profile = profileFixture({ points: 0 });
    delete profile.points_records_count;
    const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ profile }) });
    const cookie = await startSession(runtime);
    const { payload } = await dashboard(runtime, cookie);

    assert.equal(payload.data.dashboard_state, "partial");
    assert.equal(payload.data.points.value, null);
    assert.equal(payload.data.points.status, "checking");
  });

  it("returns neutral checking for unresolved member sessions", async () => {
    const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ memberExists: false }) });
    const cookie = await startSession(runtime);
    const { response, payload } = await dashboard(runtime, cookie);

    assert.equal(response.status, 200);
    assert.equal(payload.data.dashboard_state, "checking");
    assert.equal(payload.data.points.value, null);
    assert.match(JSON.stringify(payload.data.messages), /กำลังตรวจสอบข้อมูล/);
  });

  it("fails neutral when the LIFF session cannot be authenticated", async () => {
    const { response, payload } = await dashboard(env(), "");

    assert.equal(response.status, 401);
    assert.equal(payload.state, "checking");
    assert.equal(payload.message, "กำลังตรวจสอบข้อมูล");
  });

  it("keeps payment history historical and never returns current payment status", async () => {
    const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ profile: profileFixture({ history: [], points: 0, points_records_count: 0 }) }) });
    const cookie = await startSession(runtime);
    const { payload } = await dashboard(runtime, cookie);

    assert.equal(payload.data.payment_history.status, "verified_history");
    assert.equal(payload.data.payment_history.records.length, 1);
    assert.match(payload.data.payment_history.note, /historical only/);
    assert.equal("payment_status" in payload.data, false);
  });

  it("does not expose SVIP as an automatic dashboard tier", async () => {
    const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ profile: profileFixture({ tier: "SVIP" }) }) });
    const cookie = await startSession(runtime);
    const { payload } = await dashboard(runtime, cookie);

    assert.equal(payload.data.member.tier.status, "checking");
    assert.equal(payload.data.member.tier.value, null);
    assert.doesNotMatch(JSON.stringify(payload), /SVIP|svip/);
  });

  it("heals a stale guest session from the verified canonical SVIP entitlement", async () => {
    const state = {
      memberExists: false,
      profile: profileFixture({ display_name: "เจ", tier: "Member", membership_status: "checking", points: null, points_records_count: 0, history: [], payment_history: [] }),
      entitlementSnapshot: null,
    };
    const memberResolver = switchingResolver(state);
    const runtime = env({ MEMBER_STATUS_RESOLVER: memberResolver });
    const cookie = await startSession(runtime);

    state.memberExists = true;
    state.entitlementSnapshot = canonicalEntitlementSnapshot("svip", "active");

    const { response, payload } = await dashboard(runtime, cookie);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-member-display-authority"), "my_mmd_entitlement_resolver_v1");
    assert.deepEqual(payload.data.member.tier, { value: "SVIP", status: "verified", source: "my_mmd_entitlement_resolver_v1" });
    assert.deepEqual(payload.data.member.membership_status, { value: "active", status: "verified", source: "my_mmd_entitlement_resolver_v1" });
    assert.doesNotMatch(JSON.stringify(payload.data.messages), /member_new|member_checking|สมัครสมาชิก/);
  });

  it("does not offer signup when canonical SVIP resolves after a stale guest session", async () => {
    const state = {
      memberExists: false,
      profile: profileFixture({ display_name: "เจ", tier: "Member", membership_status: "checking", points: null, points_records_count: 0, history: [], payment_history: [] }),
      entitlementSnapshot: null,
    };
    const runtime = env({ MEMBER_STATUS_RESOLVER: switchingResolver(state) });
    const cookie = await startSession(runtime);

    state.memberExists = true;
    state.entitlementSnapshot = canonicalEntitlementSnapshot("svip", "active");

    const { response, payload } = await memberAppMembership(runtime, cookie);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-member-display-authority"), "my_mmd_entitlement_resolver_v1");
    assert.equal(payload.level, "svip");
    assert.equal(payload.levelVerified, true);
    assert.equal(payload.status, "active");
    assert.equal(payload.lifecycle, "active");
    assert.equal(payload.lifecycle, "active");
    assert.notEqual(payload.nextAction?.kind, "signup");
    assert.notEqual(payload.nextAction?.kind, "signup");
  });

  it("preserves canonical SVIP grace instead of overstating it as active", async () => {
    const state = {
      memberExists: false,
      profile: profileFixture({ display_name: "เจ", tier: "Member", membership_status: "checking", points: null, points_records_count: 0, history: [], payment_history: [] }),
      entitlementSnapshot: null,
    };
    const runtime = env({ MEMBER_STATUS_RESOLVER: switchingResolver(state) });
    const cookie = await startSession(runtime);

    state.memberExists = true;
    state.entitlementSnapshot = canonicalEntitlementSnapshot("svip", "grace");

    const dashboardResult = await dashboard(runtime, cookie);
    assert.deepEqual(dashboardResult.payload.data.member.tier, { value: "SVIP", status: "verified", source: "my_mmd_entitlement_resolver_v1" });
    assert.deepEqual(dashboardResult.payload.data.member.membership_status, { value: "grace", status: "verified", source: "my_mmd_entitlement_resolver_v1" });

    const membershipResult = await memberAppMembership(runtime, dashboardResult.response.headers.get("set-cookie").split(";")[0]);
    assert.equal(membershipResult.payload.level, "svip");
    assert.equal(membershipResult.payload.status, "grace");
    assert.equal(membershipResult.payload.lifecycle, "grace");
    assert.equal(membershipResult.payload.lifecycle, "grace");
    assert.notEqual(membershipResult.payload.nextAction?.kind, "signup");
  });
});


it("refreshes an existing Premium session after status, tier and points change", async () => {
  const state = { memberExists: true, profile: profileFixture(), entitlementSnapshot: null };
  const runtime = env({ MEMBER_STATUS_RESOLVER: switchingResolver(state) });
  const cookie = await startSession(runtime);
  state.profile = profileFixture({ tier: "Standard", membership_status: "expired", points: 47, membership_expires_at: "2026-08-31" });
  const first = await dashboard(runtime, cookie);
  assert.equal(first.payload.data.member.tier.value, "Standard");
  assert.equal(first.payload.data.member.membership_status.value, "expired");
  assert.equal(first.payload.data.points.value, 47);
  const response = await worker.fetch(new Request("https://mmdbkk.com/api/member/app/profile", {
    headers: { origin: "https://mmdbkk.com", cookie: first.response.headers.get("set-cookie").split(";")[0] },
  }), runtime);
  const profile = await response.json();
  assert.equal(profile.match_state, "matched");
  assert.equal(profile.membership_tier, "standard");
  assert.equal(profile.membership_status, "expired");
  assert.equal(profile.points_confirmed, 47);
  assert.equal(profile.active_through, null); // legacy expiry is not proven for an expired package
  assert.equal(profile.actual_access, "restricted");
});

it("fails closed when a fresh resolver read fails instead of showing a cached balance", async () => {
  const runtime = env();
  const cookie = await startSession(runtime);
  runtime.MEMBER_STATUS_RESOLVER = resolver({ status: 503 });
  const result = await dashboard(runtime, cookie);
  assert.equal(result.response.status, 503);
  assert.equal(result.payload.error.code, "MEMBER_PROFILE_REFRESH_UNAVAILABLE");
  assert.equal(result.payload.data, undefined);
});

it("does not coerce a null points value to a verified zero", async () => {
  const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ profile: profileFixture({ points: null, points_records_count: 0 }) }) });
  const result = await dashboard(runtime, await startSession(runtime));
  assert.equal(result.payload.data.points.status, "checking");
  assert.equal(result.payload.data.points.value, null);
});

it("canonical blocking outranks an active protected capability", async () => {
  const snapshot = { ...canonicalEntitlementSnapshot("vip"), member_blocked: true };
  const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ entitlementSnapshot: snapshot }) });
  const result = await dashboard(runtime, await startSession(runtime));
  assert.equal(result.payload.data.member.membership_status.value, "blocked");
});

it("canonical expiry outranks an active trusted protected capability", async () => {
  const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({
    profile: profileFixture({ membership_status: "expired", display_name: "VIP Member" }),
    entitlementSnapshot: canonicalEntitlementSnapshot("vip"),
  }) });
  const result = await dashboard(runtime, await startSession(runtime));
  assert.equal(result.payload.data.member.membership_status.value, "expired");
  assert.notEqual(result.payload.data.member.tier.value, "VIP");
});
