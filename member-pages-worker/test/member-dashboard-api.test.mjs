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

function resolver({ memberExists = true, profile = profileFixture(), status = 200 } = {}) {
  return {
    calls: [],
    async fetch(request) {
      const body = await request.json();
      this.calls.push({ path: new URL(request.url).pathname, body });
      if (status >= 400) return Response.json({ ok: false }, { status });
      if (new URL(request.url).pathname === "/__internal/member-profile/read") {
        return Response.json({ ok: true, data: { member_exists: memberExists, member_id: "MMD-TEST-01", profile } });
      }
      return Response.json({ ok: true, data: { member_exists: memberExists } });
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

describe("member dashboard Phase 1 API", () => {
  it("returns verified tier, non-zero points, history, and safe action URLs", async () => {
    const runtime = env();
    const cookie = await startSession(runtime);
    const { response, payload } = await dashboard(runtime, cookie);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.dashboard_state, "ready");
    assert.deepEqual(payload.data.member.tier, { value: "Premium", status: "verified", source: "member_profile_resolver" });
    assert.deepEqual(payload.data.member.identity_status, { value: "verified", status: "verified", source: "line_session" });
    assert.deepEqual(payload.data.member.membership_expires_at, { value: "2099-01-01", status: "verified", source: "member_profile_resolver" });
    assert.deepEqual(payload.data.payment, { value: "verified", status: "verified", source: "payment_resolver" });
    assert.deepEqual(payload.data.points, { value: 125, status: "verified", source: "points_ledger", records_count: 2 });
    assert.equal(payload.data.history.status, "verified");
    assert.equal(payload.data.payment_history.status, "verified_history");
    assert.equal(payload.data.actions.dashboard_url, "/member/dashboard?t=abc&code=c&promo=p&source=line&invite=i");
    assert.doesNotMatch(JSON.stringify(payload), /unsafe|evil|payment_ref|grants|SVIP|svip|internal_note/i);
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

  it("keeps payment history historical while exposing only the normalized current payment status", async () => {
    const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ profile: profileFixture({ history: [], points: 0, points_records_count: 0 }) }) });
    const cookie = await startSession(runtime);
    const { payload } = await dashboard(runtime, cookie);

    assert.equal(payload.data.payment_history.status, "verified_history");
    assert.equal(payload.data.payment_history.records.length, 1);
    assert.match(payload.data.payment_history.note, /historical only/);
    assert.deepEqual(payload.data.payment, { value: "verified", status: "verified", source: "payment_resolver" });
    assert.equal("payment_status" in payload.data, false);
  });

  it("fails malformed expiry and payment states closed without exposing internals", async () => {
    const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ profile: profileFixture({ membership_expires_at: "2026-02-30", payment_status: "paid" }) }) });
    const cookie = await startSession(runtime);
    const { payload } = await dashboard(runtime, cookie);
    assert.deepEqual(payload.data.member.membership_expires_at, { value: null, status: "unavailable", source: "member_profile_resolver" });
    assert.deepEqual(payload.data.payment, { value: "unavailable", status: "unavailable", source: "payment_resolver" });
    assert.doesNotMatch(JSON.stringify(payload), /paid|verification status|airtable|record[_ -]?id/i);
  });

  it("does not expose SVIP as an automatic dashboard tier", async () => {
    const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ profile: profileFixture({ tier: "SVIP" }) }) });
    const cookie = await startSession(runtime);
    const { payload } = await dashboard(runtime, cookie);

    assert.equal(payload.data.member.tier.status, "checking");
    assert.equal(payload.data.member.tier.value, null);
    assert.doesNotMatch(JSON.stringify(payload), /SVIP|svip/);
  });
});
