import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { afterEach, describe, it } from "node:test";

import worker, { createHallRouteToken, verifyHallRouteToken } from "../src/liff-identity-foundation.js";

const realFetch = globalThis.fetch;
const realLog = console.log;
const realError = console.error;

afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
  console.error = realError;
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
  constructor() {
    this.records = [];
    this.decisions = [];
    this.inventory = new Set();
    this.packages = new Map();
    this.screens = new Map();
  }

  async upsertSession(session, recordId = "") {
    const record = { ...session };
    const index = this.records.findIndex((item) => item.record_id === recordId);
    if (index >= 0) {
      this.records[index] = { ...record, record_id: recordId };
      return { record_id: recordId };
    }
    const nextId = `rec_liff_${this.records.length + 1}`;
    this.records.push({ ...record, record_id: nextId });
    return { record_id: nextId };
  }

  async recordDecision(decision) { this.decisions.push({ ...decision }); }
  async loadScreen(key) { return this.screens.get(key) || null; }
  async resolvePackage(code) { return this.packages.get(code) || null; }
  async hasHallAudienceInventory(audience) { return this.inventory.has(audience); }
}

class MemoryBirthdayWishStore {
  constructor() {
    this.wishes = [];
    this.calls = [];
  }

  async getBirthdayWishByClaim({ claimId }) {
    this.calls.push({ method: "getByClaim", claimId });
    return this.wishes.find((wish) => wish.claim_id === claimId) || null;
  }

  async getBirthdayWishByIdempotencyKey({ idempotencyKey }) {
    this.calls.push({ method: "getByIdempotency", idempotencyKey });
    return this.wishes.find((wish) => wish.idempotency_key === idempotencyKey) || null;
  }

  async createBirthdayWish(input) {
    this.calls.push({ method: "create", input: { ...input } });
    const wish = {
      record_id: `rec${"B".repeat(14)}`,
      claim_record_id: input.claimRecordId,
      claim_id: input.claimId,
      idempotency_key: input.idempotencyKey,
      verified_customer_ref_hash: input.verifiedCustomerRefHash,
      wish_id: "wish_1234567890abcdef1234567890abcdef",
      campaign_id: "care_back",
      wish_text: input.wishText,
      wish_option: input.wishOption,
      wish_status: "submitted",
      submitted_at: input.now,
      completed_at: "",
      public_display_text: "",
      language: input.language,
      display_version: "care_back_v1",
    };
    this.wishes.push(wish);
    return wish;
  }

  async completeBirthdayWish({ recordId, publicDisplayText, completedAt }) {
    this.calls.push({ method: "complete", recordId });
    const wish = this.wishes.find((item) => item.record_id === recordId);
    if (!wish) throw new Error("missing_wish");
    wish.wish_status = "completed";
    wish.completed_at = completedAt;
    wish.public_display_text = publicDisplayText;
    return wish;
  }

  async createOrLoadBirthdayWish(input) {
    const existing = await this.getBirthdayWishByClaim({ claimId: input.claimId });
    if (existing) return existing.wish_status === "submitted"
      ? this.completeBirthdayWish({ recordId: existing.record_id, publicDisplayText: input.publicDisplayText, completedAt: input.now })
      : existing;
    const replay = await this.getBirthdayWishByIdempotencyKey({ idempotencyKey: input.idempotencyKey });
    if (replay) return replay;
    const created = await this.createBirthdayWish(input);
    return this.completeBirthdayWish({ recordId: created.record_id, publicDisplayText: input.publicDisplayText, completedAt: input.now });
  }
}

function resolver(payload = { member_exists: false }, status = 200) {
  const calls = [];
  return {
    calls,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      const requestBody = await request.json();
      calls.push({
        ...requestBody,
        _path: path,
        _resolver_secret: request.headers.get("x-mmd-member-resolver-secret"),
      });
      if (path === "/__internal/member-profile/read") {
        const profilePayload = payload.profile || {
          display_name: "สมาชิก MMD",
          tier: "Standard",
          membership_status: "active",
          points: 120,
          history_window: { from: "2025-08-10", to: "2026-08-10", timezone: "Asia/Bangkok" },
          history: [],
        };
        return new Response(JSON.stringify({ ok: status < 400, data: {
          member_exists: payload.member_exists === true,
          member_id: payload.mmd_member_id || "MMD-TEST",
          profile: profilePayload,
        } }), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: status < 400, data: payload }), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

function paymentsWorker(status = 200, payload = { ok: true }) {
  const calls = [];
  return {
    calls,
    fetch: async (request) => {
      calls.push({ url: request.url, body: await request.json() });
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  };
}

function env(overrides = {}) {
  const birthdayStore = overrides.BIRTHDAY_WISH_STORE || new MemoryBirthdayWishStore();
  const runtime = {
    LINE_LOGIN_CHANNEL_ID: "2000000000",
    LINE_DASHBOARD_CHANNEL_ID: "2010862595",
    LIFF_SESSION_SECRET: "test-only-session-secret-not-production",
    MEMBER_STATUS_RESOLVER_SECRET: "test-only-member-status-resolver-secret-1234567890",
    LIFF_IDENTITY_KV: new MemoryKv(),
    MEMBER_STATUS_RESOLVER: resolver(),
    LIFF_GATEWAY_STORE: new MemoryGatewayStore(),
    BIRTHDAY_WISH_STORE: birthdayStore,
    CARE_BACK_WISH_COORDINATOR: {
      async createOrLoad(input) { return birthdayStore.createOrLoadBirthdayWish(input); },
    },
    ...overrides,
  };
  return runtime;
}

function lineVerify({ sub = "U123", aud = "2000000000", exp = Math.floor(Date.now() / 1000) + 600, status = 200, malformed = false } = {}) {
  globalThis.fetch = async (_url, init) => {
    const params = new URLSearchParams(init.body);
    assert.ok(["2000000000", "2010862595"].includes(params.get("client_id")));
    assert.ok(params.get("id_token"));
    if (malformed) return new Response("{not-json", { status, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ sub, aud, exp }), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

async function request(path, { method = "POST", body, cookie, origin = "https://mmdbkk.com", contentType = "application/json" } = {}, runtime = env()) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (body !== undefined && contentType) headers["content-type"] = contentType;
  if (cookie) headers.cookie = cookie;
  const response = await worker.fetch(new Request(`https://mmdbkk.com${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), runtime);
  const payload = await response.json();
  return { response, payload, runtime };
}

async function start(runtime = env(), body = { id_token: "valid-token" }, path = "/member/api/liff/start") {
  lineVerify();
  return request(path, { body }, runtime);
}

function setCookies(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

function findCookie(response, name) {
  return setCookies(response).find((cookie) => cookie.startsWith(`${name}=`)) || "";
}

function cookiePair(cookie) {
  return cookie.split(";")[0];
}

function assertHostCookie(cookie, name, maxAge) {
  assert.ok(cookie.startsWith(`${name}=`));
  assert.match(cookie, /; HttpOnly/i);
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /; SameSite=Strict/i);
  assert.match(cookie, /; Path=\//i);
  assert.match(cookie, new RegExp(`; Max-Age=${maxAge}\\b`, "i"));
  assert.doesNotMatch(cookie, /;\s*Domain=/i);
}

function assertNoSensitive(rendered) {
  assert.doesNotMatch(rendered, /valid-token|private-id-token|Uprivate-line-sub|private-signed-t|test-only-member-status-resolver-secret-1234567890/i);
  assert.doesNotMatch(rendered, /session_token|hall_token|__Host-mmd_liff_session=[A-Za-z0-9]|__Host-mmd_liff_handoff=[A-Za-z0-9]/i);
  assert.doesNotMatch(rendered, /svip|blackcard|5000|9999|premium|888/i);
}

async function keyedDigestForTest(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("Phase 1 LIFF identity foundation security correction", () => {
  it("verifies CARE BACK and Dashboard tokens only against the fixed server-owned audiences", async () => {
    const clients = [];
    const runtime = env({
      LINE_LOGIN_CHANNEL_ID: "2010298002",
      LINE_DASHBOARD_CHANNEL_ID: "2010862595",
    });
    globalThis.fetch = async (_url, init) => {
      const params = new URLSearchParams(init.body);
      const token = params.get("id_token");
      const clientId = params.get("client_id");
      clients.push({ token, clientId });
      const expected = token === "care-back-token" ? "2010298002"
        : token === "dashboard-token" ? "2010862595"
          : "";
      if (!expected || clientId !== expected) {
        return Response.json({ error: "invalid_token" }, { status: 400 });
      }
      return Response.json({
        sub: "U00000000000000000000000000000001",
        aud: expected,
        exp: Math.floor(Date.now() / 1000) + 600,
      });
    };

    assert.equal((await request("/member/api/liff/start", { body: { id_token: "care-back-token" } }, runtime)).response.status, 200);
    assert.deepEqual(clients.splice(0), [{ token: "care-back-token", clientId: "2010298002" }]);

    assert.equal((await request("/member/api/liff/start", { body: { id_token: "dashboard-token" } }, runtime)).response.status, 200);
    assert.deepEqual(clients.splice(0), [
      { token: "dashboard-token", clientId: "2010298002" },
      { token: "dashboard-token", clientId: "2010862595" },
    ]);

    const unknown = await request("/member/api/liff/start", { body: { id_token: "unknown-token" } }, runtime);
    assert.equal(unknown.response.status, 401);
    assert.equal(unknown.payload.error.code, "LINE_ID_TOKEN_INVALID");
    assert.deepEqual(clients.splice(0), [
      { token: "unknown-token", clientId: "2010298002" },
      { token: "unknown-token", clientId: "2010862595" },
    ]);
  });

  it("rejects cross-channel verification results and attacker-selected audiences", async () => {
    const runtime = env({
      LINE_LOGIN_CHANNEL_ID: "2010298002",
      LINE_DASHBOARD_CHANNEL_ID: "2010862595",
    });
    globalThis.fetch = async (_url, init) => {
      const clientId = new URLSearchParams(init.body).get("client_id");
      const otherAudience = clientId === "2010298002" ? "2010862595" : "2010298002";
      return Response.json({
        sub: "U00000000000000000000000000000001",
        aud: otherAudience,
        exp: Math.floor(Date.now() / 1000) + 600,
      });
    };

    const crossChannel = await request("/member/api/liff/start", { body: { id_token: "cross-channel-token" } }, runtime);
    assert.equal(crossChannel.response.status, 401);
    assert.equal(crossChannel.payload.error.code, "LINE_ID_TOKEN_INVALID");

    for (const key of ["audience", "channel_id", "client_id", "liff_id"]) {
      const selected = await request("/member/api/liff/start", {
        body: { id_token: "dashboard-token", [key]: "2010862595" },
      }, runtime);
      assert.equal(selected.response.status, 400, key);
      assert.equal(selected.payload.error.code, "BROWSER_IDENTITY_REJECTED", key);
    }
  });

  it("can verify a bounded staging token through a service binding without external LINE fetch", async () => {
    const calls = [];
    const runtime = env({
      LINE_LOGIN_CHANNEL_ID: "care-back-staging-channel",
      LINE_ID_TOKEN_VERIFIER: {
        async fetch(request) {
          const form = await request.formData();
          calls.push({
            path: new URL(request.url).pathname,
            idToken: form.get("id_token"),
            clientId: form.get("client_id"),
          });
          return Response.json({
            sub: "U00000000000000000000000000000001",
            aud: "care-back-staging-channel",
            exp: Math.floor(Date.now() / 1000) + 600,
          });
        },
      },
    });
    globalThis.fetch = async () => { throw new Error("external fetch must not run"); };

    const result = await request("/member/api/liff/start", {
      body: { id_token: "care-back-staging-current", liff_intent: "promo", campaign: "care_back" },
    }, runtime);

    assert.equal(result.response.status, 200);
    assert.deepEqual(calls, [{
      path: "/oauth2/v2.1/verify",
      idToken: "care-back-staging-current",
      clientId: "care-back-staging-channel",
    }]);
    assert.deepEqual(result.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
  });

  it("valid LINE token succeeds, sets secure session cookie, and returns no raw token", async () => {
    const { response, payload } = await start();
    const cookie = findCookie(response, "__Host-mmd_liff_session");
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.identity_state, "pending_identity");
    assert.equal(payload.data.member_resolved, false);
    assert.equal(payload.data.pending_identity, true);
    assert.equal("liff_session_id" in payload.data, false);
    assert.equal(payload.data.next_screen_key, "start_intent");
    assert.deepEqual(payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
    assertHostCookie(cookie, "__Host-mmd_liff_session", 900);
    assertNoSensitive(JSON.stringify(payload));
  });

  it("returns the bounded member profile and holds the CARE BACK coupon for a Birthday Wish from the verified session", async () => {
    const careCalls = [];
    const memberResolver = resolver({
      member_exists: true,
      mmd_member_id: "MMD-PER-01",
      profile: {
        display_name: "เปอร์",
        tier: "Premium",
        membership_status: "active",
        membership_expires_at: "2027-08-31",
        payment_status: "verified",
        points: 345,
        history_window: { from: "2025-08-10", to: "2026-08-10", timezone: "Asia/Bangkok" },
        history: [{ type: "points", date: "2026-08-01", title: "Points added", status: "posted", points_delta: 25, private_note: "hidden" }],
      },
    });
    const runtime = env({
      MEMBER_STATUS_RESOLVER: memberResolver,
      CARE_BACK_STORE: {
        async openOrResume(input) {
          careCalls.push(input);
          return {
            claim_record_id: `rec${"A".repeat(14)}`,
            claim_reference: "CB6-2026-ABCDEF12345678",
            claim_status: "identity_verified",
            review_status: "pending",
            personal_code: "",
            code_status: "draft",
            expires_at: null,
            discount_percent: 0,
            coupon_state: "wish_required",
            coupon_message: "ส่งคำอวยพรวันเกิดถึง MMD สำเร็จก่อน จึงจะเปิดคูปองส่วนตัวได้",
            membership_benefit: { type: "membership_extension", days: 180, state: "pending_application" },
            resumed: false,
          };
        },
      },
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "status" });
    const startCookie = cookiePair(findCookie(started.response, "__Host-mmd_liff_session"));

    const profile = await request("/member/api/liff/profile", { method: "GET", cookie: startCookie }, runtime);
    const profileCookie = cookiePair(findCookie(profile.response, "__Host-mmd_liff_session"));
    assert.equal(profile.response.status, 200);
    assert.deepEqual(profile.payload.data, {
      display_name: "เปอร์",
      tier: "Premium",
      membership_status: "active",
      membership_expires_at: "2027-08-31",
      payment_status: "verified",
      points: null,
      points_records_count: null,
      payment_history: [],
      history_window: { from: "2025-08-10", to: "2026-08-10", timezone: "Asia/Bangkok" },
      history: [{ type: "points", date: "2026-08-01", title: "Points added", status: "posted", points_delta: 25 }],
    });
    assert.doesNotMatch(JSON.stringify(profile.payload), /MMD-PER-01|private_note|line_user_id/i);

    const claim = await request("/member/api/liff/care-back/claim", { body: {}, cookie: profileCookie }, runtime);
    assert.equal(claim.response.status, 200);
    assert.equal(claim.payload.data.personal_code, "");
    assert.equal(claim.payload.data.code_status, "draft");
    assert.equal(claim.payload.data.benefit_state, "benefit_pending");
    assert.equal(claim.payload.data.discount_percent, 0);
    assert.equal(claim.payload.data.coupon_state, "wish_required");
    assert.equal(careCalls.length, 1);
    assert.equal(careCalls[0].memberId, "MMD-PER-01");
    assert.deepEqual(careCalls[0].memberProfile, { display_name: "เปอร์", tier: "Premium", membership_status: "active", membership_expires_at: "2027-08-31", payment_status: "verified", points: null, points_records_count: null, payment_history: [], history_window: { from: "2025-08-10", to: "2026-08-10", timezone: "Asia/Bangkok" }, history: [{ type: "points", date: "2026-08-01", title: "Points added", status: "posted", points_delta: 25 }] });
    assert.match(careCalls[0].identityHash, /^[a-f0-9]{64}$/);
    assert.equal(runtime.LIFF_GATEWAY_STORE.records.length, 1);
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].campaign_code, "6-years-care-back");
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].campaign_claim_id, "CB6-2026-ABCDEF12345678");
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].promo_code, "");
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].promo_status, "draft");
    assert.equal("identity_key" in runtime.LIFF_GATEWAY_STORE.records[0], false);

    const spoof = await request("/member/api/liff/care-back/claim", { body: { member_id: "MMD-OTHER" }, cookie: profileCookie }, runtime);
    assert.equal(spoof.response.status, 400);
    assert.equal(spoof.payload.error.code, "BROWSER_IDENTITY_REJECTED");
    assert.equal(careCalls.length, 1);
  });

  it("normalizes the public payment enum and omits unproven member expiry", async () => {
    const cases = [
      { membership_status: "active", membership_expires_at: "2027-08-31", payment_status: "verified", expiry: "2027-08-31", payment: "verified" },
      { membership_status: "grace", membership_expires_at: "2028-02-29", payment_status: "pending_review", expiry: "2028-02-29", payment: "pending_review" },
      { membership_status: "active", membership_expires_at: "2026-02-30", payment_status: "paid", expiry: "", payment: "unavailable" },
      { membership_status: "active", membership_expires_at: "2027-08-31T00:00:00Z", payment_status: "refunded", expiry: "", payment: "unavailable" },
      { membership_status: "expired", membership_expires_at: "2027-08-31", payment_status: "unavailable", expiry: "", payment: "unavailable" },
    ];

    for (const scenario of cases) {
      const runtime = env({
        MEMBER_STATUS_RESOLVER: resolver({
          member_exists: true,
          mmd_member_id: "MMD-PER-01",
          profile: {
            display_name: "เปอร์",
            tier: "Premium",
            membership_status: scenario.membership_status,
            membership_expires_at: scenario.membership_expires_at,
            payment_status: scenario.payment_status,
            points: 1,
            history_window: { from: "2025-08-10", to: "2026-08-10", timezone: "Asia/Bangkok" },
            history: [],
            payment_ref: "pay_private",
            member_email: "private@example.com",
            receipt_url: "https://private.example/receipt",
            verification_notes: "private",
          },
        }),
      });
      const started = await start(runtime, { id_token: "valid", liff_intent: "status" });
      const cookie = cookiePair(findCookie(started.response, "__Host-mmd_liff_session"));
      const profile = await request("/member/api/liff/profile", { method: "GET", cookie }, runtime);
      assert.equal(profile.payload.data.payment_status, scenario.payment);
      assert.equal(profile.payload.data.membership_expires_at || "", scenario.expiry);
      assert.doesNotMatch(JSON.stringify(profile.payload), /pay_private|private@example|receipt|verification_notes/i);
    }
  });

  it("persists, replays, and reloads one canonical Birthday Wish without exposing storage identity", async () => {
    const careCalls = [];
    const runtime = env({
      MEMBER_STATUS_RESOLVER: resolver({ member_exists: true, mmd_member_id: "MMD-PER-01" }),
      CARE_BACK_STORE: {
        async openOrResume(input) {
          careCalls.push(input);
          const wishSubmitted = input.wishSubmitted === true;
          return {
            claim_record_id: `rec${"A".repeat(14)}`,
            claim_reference: "CB6-2026-ABCDEF12345678",
            claim_status: "identity_verified",
            review_status: "pending",
            personal_code: wishSubmitted ? "ABC234" : "",
            code_status: wishSubmitted ? "active" : "draft",
            discount_percent: wishSubmitted ? 10 : 0,
            coupon_state: wishSubmitted ? "ready" : "wish_required",
            coupon_message: wishSubmitted ? "คูปองส่วนตัวของคุณพร้อมใช้แล้ว" : "ส่งคำอวยพรวันเกิดถึง MMD สำเร็จก่อน จึงจะเปิดคูปองส่วนตัวได้",
            resumed: false,
          };
        },
      },
    });
    const started = await start(runtime, {
      id_token: "valid",
      liff_intent: "promo",
      campaign: "care_back",
    });
    const claimed = await request("/member/api/liff/care-back/claim", {
      body: {},
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
    }, runtime);
    const before = await request("/member/api/liff/care-back/state", {
      method: "GET",
      cookie: cookiePair(findCookie(claimed.response, "__Host-mmd_liff_session")),
    }, runtime);

    assert.equal(before.response.status, 200);
    assert.equal(before.payload.state, "wish_available");
    assert.deepEqual(before.payload.grants, {
      payment: false,
      membership: false,
      points: false,
      hall: false,
      black_card: false,
      svip: false,
      booking: false,
      access: false,
    });

    const first = await request("/member/api/liff/care-back/wish", {
      body: { wish_text: "ขอให้ MMD เติบโตอย่างอบอุ่นต่อไปครับ", request_id: "req_1234567890abcdef" },
      cookie: cookiePair(findCookie(before.response, "__Host-mmd_liff_session")),
    }, runtime);
    assert.equal(first.response.status, 200);
    assert.equal(first.payload.state, "completed");
    assert.equal(first.payload.wish.text, "ขอให้ MMD เติบโตอย่างอบอุ่นต่อไปครับ");
    assert.match(first.payload.final_display.message, /MMD ได้รับคำอวยพรของคุณแล้วครับ/);
    assert.equal(first.payload.claim.personal_code, "ABC234");
    assert.equal(first.payload.claim.discount_percent, 10);
    assert.equal(first.payload.claim.coupon_state, "ready");
    assert.equal(careCalls.length, 2);
    assert.equal(careCalls[1].wishSubmitted, true);

    const replay = await request("/member/api/liff/care-back/wish", {
      body: { wish_text: "ข้อความที่ไม่ควรแทนของเดิม", request_id: "different_1234567890" },
      cookie: cookiePair(findCookie(first.response, "__Host-mmd_liff_session")),
    }, runtime);
    assert.equal(replay.response.status, 200);
    assert.equal(replay.payload.wish.text, first.payload.wish.text);
    assert.equal(runtime.BIRTHDAY_WISH_STORE.wishes.length, 1);

    const returned = await request("/member/api/liff/care-back/state", {
      method: "GET",
      cookie: cookiePair(findCookie(replay.response, "__Host-mmd_liff_session")),
    }, runtime);
    assert.equal(returned.response.status, 200);
    assert.deepEqual(returned.payload.wish, first.payload.wish);
    assert.deepEqual(returned.payload.final_display, first.payload.final_display);

    const rendered = JSON.stringify([first.payload, replay.payload, returned.payload]);
    assert.doesNotMatch(rendered, /rec[A-Za-z0-9]{14}|verified_customer_ref_hash|identity_key|request_id|idempotency|session_id|token/i);
    const createCall = runtime.BIRTHDAY_WISH_STORE.calls.find((call) => call.method === "create");
    assert.match(createCall.input.verifiedCustomerRefHash, /^[a-f0-9]{64}$/);
    assert.notEqual(createCall.input.verifiedCustomerRefHash, "U123");
  });

  it("fails returning Birthday Wish state closed when Airtable ownership differs from the verified session", async () => {
    const birthdayStore = new MemoryBirthdayWishStore();
    const runtime = env({
      BIRTHDAY_WISH_STORE: birthdayStore,
      MEMBER_STATUS_RESOLVER: resolver({ member_exists: true, mmd_member_id: "MMD-PER-01" }),
      CARE_BACK_STORE: {
        async openOrResume() {
          return {
            claim_record_id: `rec${"A".repeat(14)}`,
            claim_reference: "CB6-2026-ABCDEF12345678",
            claim_status: "identity_verified",
            review_status: "pending",
            personal_code: "ABC234",
            code_status: "draft",
            resumed: true,
          };
        },
      },
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "promo", campaign: "care_back" });
    const claimed = await request("/member/api/liff/care-back/claim", {
      body: {},
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
    }, runtime);
    birthdayStore.wishes.push({
      record_id: `rec${"B".repeat(14)}`,
      claim_record_id: `rec${"C".repeat(14)}`,
      claim_id: "CB6-2026-ABCDEF12345678",
      idempotency_key: "req_1234567890abcdef",
      verified_customer_ref_hash: "b".repeat(64),
      wish_id: "wish_1234567890abcdef1234567890abcdef",
      campaign_id: "care_back",
      wish_text: "must not be disclosed",
      wish_option: "",
      wish_status: "completed",
      submitted_at: "2026-08-10T12:00:00.000Z",
      completed_at: "2026-08-10T12:00:00.000Z",
      public_display_text: "must not be disclosed",
      language: "th",
      display_version: "care_back_v1",
    });

    const result = await request("/member/api/liff/care-back/state", {
      method: "GET",
      cookie: cookiePair(findCookie(claimed.response, "__Host-mmd_liff_session")),
    }, runtime);

    assert.equal(result.response.status, 409);
    assert.equal(result.payload.error.code, "BIRTHDAY_WISH_CLAIM_CONFLICT");
    assert.doesNotMatch(JSON.stringify(result.payload), /must not be disclosed|rec[A-Za-z0-9]{14}|verified_customer_ref_hash/i);
    assert.equal(birthdayStore.calls.some((call) => call.method === "complete"), false);
  });

  it("fails returning state closed if completion changes Airtable ownership", async () => {
    const birthdayStore = new MemoryBirthdayWishStore();
    birthdayStore.completeBirthdayWish = async ({ recordId, publicDisplayText, completedAt }) => {
      birthdayStore.calls.push({ method: "complete", recordId });
      const wish = birthdayStore.wishes.find((item) => item.record_id === recordId);
      return {
        ...wish,
        claim_record_id: `rec${"C".repeat(14)}`,
        wish_status: "completed",
        completed_at: completedAt,
        public_display_text: publicDisplayText,
      };
    };
    const runtime = env({
      BIRTHDAY_WISH_STORE: birthdayStore,
      MEMBER_STATUS_RESOLVER: resolver({ member_exists: true, mmd_member_id: "MMD-PER-01" }),
      CARE_BACK_STORE: {
        async openOrResume() {
          return {
            claim_record_id: `rec${"A".repeat(14)}`,
            claim_reference: "CB6-2026-ABCDEF12345678",
            claim_status: "identity_verified",
            review_status: "pending",
            personal_code: "ABC234",
            code_status: "draft",
            resumed: true,
          };
        },
      },
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "promo", campaign: "care_back" });
    const claimed = await request("/member/api/liff/care-back/claim", {
      body: {},
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
    }, runtime);
    const claimedCookie = cookiePair(findCookie(claimed.response, "__Host-mmd_liff_session"));
    const claimedToken = claimedCookie.slice(claimedCookie.indexOf("=") + 1);
    const claimedSessionHash = await keyedDigestForTest(runtime.LIFF_SESSION_SECRET, `session:${claimedToken}`);
    const claimedSession = JSON.parse(runtime.LIFF_IDENTITY_KV.map.get(`liff:session:${claimedSessionHash}`));
    birthdayStore.wishes.push({
      record_id: `rec${"B".repeat(14)}`,
      claim_record_id: `rec${"A".repeat(14)}`,
      claim_id: "CB6-2026-ABCDEF12345678",
      idempotency_key: "req_1234567890abcdef",
      verified_customer_ref_hash: await keyedDigestForTest(runtime.LIFF_SESSION_SECRET, `wish-customer:${claimedSession.identity_key}`),
      wish_id: "wish_1234567890abcdef1234567890abcdef",
      campaign_id: "care_back",
      wish_text: "must not be disclosed",
      wish_option: "",
      wish_status: "submitted",
      submitted_at: "2026-08-10T12:00:00.000Z",
      completed_at: "",
      public_display_text: "",
      language: "th",
      display_version: "care_back_v1",
    });

    const result = await request("/member/api/liff/care-back/state", {
      method: "GET",
      cookie: claimedCookie,
    }, runtime);
    assert.equal(result.response.status, 409);
    assert.equal(result.payload.error.code, "BIRTHDAY_WISH_CLAIM_CONFLICT");
    assert.doesNotMatch(JSON.stringify(result.payload), /must not be disclosed|rec[A-Za-z0-9]{14}/i);
  });

  it("fails Birthday Wish closed for missing sessions, wrong campaigns, review states, and hostile bodies", async () => {
    const missing = await request("/member/api/liff/care-back/state", { method: "GET" });
    assert.equal(missing.response.status, 401);
    assert.equal(missing.payload.error.code, "LIFF_SESSION_REQUIRED");

    const runtime = env({
      MEMBER_STATUS_RESOLVER: resolver({ member_exists: true, mmd_member_id: "MMD-PER-01" }),
      CARE_BACK_STORE: {
        async openOrResume() {
          return {
            claim_record_id: `rec${"A".repeat(14)}`,
            claim_reference: "CB6-2026-ABCDEF12345678",
            claim_status: "identity_verified",
            review_status: "manual_review",
            personal_code: "ABC234",
            code_status: "draft",
            resumed: false,
          };
        },
      },
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "promo", campaign: "care_back" });
    const claimed = await request("/member/api/liff/care-back/claim", {
      body: {},
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
    }, runtime);
    const state = await request("/member/api/liff/care-back/state", {
      method: "GET",
      cookie: cookiePair(findCookie(claimed.response, "__Host-mmd_liff_session")),
    }, runtime);
    assert.equal(state.payload.state, "manual_review");
    assert.equal(runtime.BIRTHDAY_WISH_STORE.wishes.length, 0);

    for (const body of [
      { wish_text: "<img src=x onerror=alert(1)>", request_id: "req_1234567890abcdef" },
      { wish_text: "x".repeat(601), request_id: "req_1234567890abcdef" },
      { wish_text: "hello", request_id: "short" },
      { wish_text: "hello", request_id: "req_1234567890abcdef", claim_id: "browser-claim" },
      { wish_text: "hello", request_id: "req_1234567890abcdef", completed: true },
    ]) {
      const rejected = await request("/member/api/liff/care-back/wish", {
        body,
        cookie: cookiePair(findCookie(state.response, "__Host-mmd_liff_session")),
      }, runtime);
      assert.equal(rejected.response.status, 400);
    }
    assert.equal(runtime.BIRTHDAY_WISH_STORE.wishes.length, 0);

    const oversized = await request("/member/api/liff/care-back/wish", {
      body: { wish_text: "x".repeat(17 * 1024), request_id: "req_1234567890abcdef" },
      cookie: cookiePair(findCookie(state.response, "__Host-mmd_liff_session")),
    }, runtime);
    assert.equal(oversized.response.status, 413);
    assert.equal(oversized.payload.error.code, "REQUEST_BODY_TOO_LARGE");
    assert.equal(runtime.BIRTHDAY_WISH_STORE.wishes.length, 0);

    const declaredOversizedResponse = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/care-back/wish", {
      method: "POST",
      headers: {
        origin: "https://mmdbkk.com",
        cookie: cookiePair(findCookie(state.response, "__Host-mmd_liff_session")),
        "content-type": "application/json",
        "content-length": String(16 * 1024 + 1),
      },
      body: "{}",
    }), runtime);
    assert.equal(declaredOversizedResponse.status, 413);
    assert.equal((await declaredOversizedResponse.json()).error.code, "REQUEST_BODY_TOO_LARGE");
    assert.equal(runtime.BIRTHDAY_WISH_STORE.wishes.length, 0);

    const wrongCampaign = env({
      MEMBER_STATUS_RESOLVER: resolver({ member_exists: true, mmd_member_id: "MMD-PER-02" }),
      CARE_BACK_STORE: runtime.CARE_BACK_STORE,
    });
    const wrongStart = await start(wrongCampaign, { id_token: "valid", liff_intent: "promo" });
    const wrongClaim = await request("/member/api/liff/care-back/claim", {
      body: {},
      cookie: cookiePair(findCookie(wrongStart.response, "__Host-mmd_liff_session")),
    }, wrongCampaign);
    const blocked = await request("/member/api/liff/care-back/wish", {
      body: { wish_text: "hello", request_id: "req_1234567890abcdef" },
      cookie: cookiePair(findCookie(wrongClaim.response, "__Host-mmd_liff_session")),
    }, wrongCampaign);
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.payload.error.code, "CARE_BACK_WISH_NOT_AVAILABLE");
  });

  it("writes only the bounded LIFF session memory through the mock gateway store", async () => {
    const runtime = env();
    lineVerify({ sub: "Uprivate-line-sub" });
    const result = await request("/member/api/liff/start?t=private-signed-t", {
      body: { line_id_token: "private-id-token", liff_intent: "signup" },
    }, runtime);

    assert.equal(result.response.status, 200);
    assert.equal(runtime.LIFF_GATEWAY_STORE.records.length, 1);
    const stored = JSON.stringify(runtime.LIFF_GATEWAY_STORE.records[0]);
    assert.match(stored, /"source_channel":"line_liff"/);
    assert.match(stored, /"liff_intent":"signup"/);
    assert.doesNotMatch(stored, /Uprivate-line-sub|private-id-token|private-signed-t|identity_key|pending_identity_id|tier|points|payment_status/i);
  });

  it("prefers a bounded mock flow-screen spec over the fallback copy", async () => {
    const runtime = env();
    runtime.LIFF_GATEWAY_STORE.screens.set("start_intent", {
      key: "start_intent",
      copy: "ข้อความจาก Flow Screens ครับ",
      actions: [{ id: "signup", label: "สมัคร", endpoint: "/member/api/liff/intent", method: "POST" }],
    });
    const result = await start(runtime);

    assert.equal(result.response.status, 200);
    assert.equal(result.payload.data.screen.copy, "ข้อความจาก Flow Screens ครับ");
    assert.deepEqual(result.payload.data.screen.actions, [{ id: "signup", label: "สมัคร", endpoint: "/member/api/liff/intent", method: "POST" }]);
  });

  it("missing, invalid, expired, wrong-audience, missing-sub, non-2xx, malformed, and timeout LINE verification fail closed", async () => {
    const missing = await request("/member/api/liff/start", { body: {} });
    assert.equal(missing.response.status, 400);
    assert.equal(missing.payload.error.code, "ID_TOKEN_REQUIRED");

    globalThis.fetch = async () => new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 });
    const invalid = await request("/member/api/liff/start", { body: { id_token: "invalid" } });
    assert.equal(invalid.response.status, 401);

    lineVerify({ exp: Math.floor(Date.now() / 1000) - 1 });
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "expired" } })).response.status, 401);

    lineVerify({ aud: "wrong-channel" });
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "wrong-aud" } })).response.status, 401);

    lineVerify({ sub: "" });
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "missing-sub" } })).response.status, 401);

    lineVerify({ status: 500 });
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "line-500" } })).response.status, 401);

    lineVerify({ malformed: true });
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "bad-json" } })).response.status, 401);

    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    const timeout = await request("/member/api/liff/start", { body: { id_token: "slow" } }, env({ LIFF_VERIFY_TIMEOUT_MS: "5" }));
    assert.equal(timeout.response.status, 504);
    assert.equal(timeout.payload.error.code, "LINE_VERIFY_TIMEOUT");
  });

  it("rejects browser identity/account claims and unexpected body fields", async () => {
    for (const body of [
      { id_token: "valid", line_user_id: "Uspoof" },
      { id_token: "valid", lineUserId: "Uspoof" },
      { id_token: "valid", sub: "Uspoof" },
      { id_token: "valid", profile: {} },
      { id_token: "valid", user: {} },
      { id_token: "valid", member_id: "MMD-1" },
      { id_token: "valid", tier: "blackcard" },
      { id_token: "valid", points: 9999 },
      { id_token: "valid", payment_status: "paid" },
      { id_token: "valid", private_access: true },
      { id_token: "valid", entitlements: ["vip"] },
      { id_token: "valid", t: "body-t-not-allowed" },
    ]) {
      const result = await request("/member/api/liff/start", { body });
      assert.equal(result.response.status, 400);
      assert.equal(result.payload.error.code, "BROWSER_IDENTITY_REJECTED");
    }
  });

  it("requires approved-origin JSON requests and does not accept Authorization bearer sessions", async () => {
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "valid" }, origin: "" })).response.status, 403);
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "valid" }, origin: "https://evil.example" })).response.status, 403);
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "valid" }, contentType: "text/plain" })).response.status, 400);

    const webflow = await start(env(), { id_token: "valid" }, "/member/api/liff/start");
    assert.equal(webflow.response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");

    lineVerify();
    const webflowResponse = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/start", {
      method: "POST",
      headers: { origin: "https://mmdprive.webflow.io", "content-type": "application/json" },
      body: JSON.stringify({ id_token: "valid" }),
    }), env());
    assert.equal(webflowResponse.status, 200);
    assert.equal(webflowResponse.headers.get("access-control-allow-origin"), "https://mmdprive.webflow.io");

    const preflight = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/start", {
      method: "OPTIONS",
      headers: { origin: "https://mmdprive.com" },
    }), env());
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://mmdprive.com");

    lineVerify();
    const wwwResponse = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/start", {
      method: "POST",
      headers: { origin: "https://www.mmdbkk.com", "content-type": "application/json" },
      body: JSON.stringify({ id_token: "valid" }),
    }), env());
    assert.equal(wwwResponse.status, 200);
    assert.equal(wwwResponse.headers.get("access-control-allow-origin"), "https://www.mmdbkk.com");

    const rejectedPreflight = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/start", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example" },
    }), env());
    assert.equal(rejectedPreflight.status, 403);
    assert.equal(rejectedPreflight.headers.get("access-control-allow-origin"), null);

    const status = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/status", {
      method: "GET",
      headers: { authorization: "Bearer fake-token" },
    }), env());
    const payload = await status.json();
    assert.equal(status.status, 401);
    assert.equal(payload.error.code, "LIFF_SESSION_REQUIRED");
  });

  it("accepts a same-origin workers.dev request only in bounded synthetic staging mode", async () => {
    const runtime = env({ CARE_BACK_STAGING_MODE: "synthetic" });
    lineVerify();
    const allowed = await worker.fetch(new Request("https://member-dashboard-chat-worker-staging.example.workers.dev/member/api/liff/start", {
      method: "POST",
      headers: {
        origin: "https://member-dashboard-chat-worker-staging.example.workers.dev",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id_token: "valid-token", liff_intent: "promo", campaign: "care_back" }),
    }), runtime);
    const rejectedWithoutMode = await worker.fetch(new Request("https://member-dashboard-chat-worker-staging.example.workers.dev/member/api/liff/start", {
      method: "POST",
      headers: {
        origin: "https://member-dashboard-chat-worker-staging.example.workers.dev",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id_token: "valid-token", liff_intent: "promo", campaign: "care_back" }),
    }), env());

    assert.equal(allowed.status, 200);
    assert.equal(rejectedWithoutMode.status, 403);
    assert.equal((await rejectedWithoutMode.json()).error.code, "ORIGIN_NOT_ALLOWED");
  });

  it("existing member resolves safely without returning tier, points, payment, or entitlement details", async () => {
    const memberResolver = resolver({ member_exists: true, mmd_member_id: "MMD-123", tier: "svip", points: 5000, payment_status: "paid" });
    const runtime = env({ MEMBER_STATUS_RESOLVER: memberResolver });
    lineVerify({ sub: "Uprivate-line-sub" });
    const { response, payload } = await request("/member/api/liff/start?t=private-signed-t", { body: { id_token: "private-id-token" } }, runtime);
    assert.equal(response.status, 200);
    assert.equal(memberResolver.calls[0].line_user_id, "Uprivate-line-sub");
    assert.equal(memberResolver.calls[0].purpose, "liff_identity_resolution");
    assert.equal(memberResolver.calls[0]._resolver_secret, runtime.MEMBER_STATUS_RESOLVER_SECRET);
    assert.equal(payload.data.identity_state, "existing_member");
    assert.equal(payload.data.member_resolved, true);
    assert.equal(payload.data.pending_identity, false);
    assertNoSensitive(JSON.stringify(payload));
  });

  it("fails closed when the dedicated internal resolver secret is unavailable", async () => {
    const runtime = env({ MEMBER_STATUS_RESOLVER_SECRET: "" });
    const result = await request("/member/api/liff/start", { body: { id_token: "valid" } }, runtime);
    assert.equal(result.response.status, 503);
    assert.equal(result.payload.error.code, "LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  });

  it("unknown verified identity creates only one idempotent pending identity and resolver failure creates none", async () => {
    const runtime = env();
    lineVerify();
    const one = await request("/member/api/liff/start", { body: { id_token: "valid" } }, runtime);
    lineVerify();
    const two = await request("/member/api/liff/start", { body: { id_token: "valid" } }, runtime);
    assert.equal(one.payload.data.pending_identity.id, two.payload.data.pending_identity.id);
    assert.equal([...runtime.LIFF_IDENTITY_KV.map.keys()].filter((key) => key.startsWith("liff:pending:")).length, 1);
    assert.equal(one.payload.data.grants.membership, false);
    assert.equal(one.payload.data.grants.points, false);
    assert.equal(one.payload.data.grants.payment_status, false);
    assert.equal(one.payload.data.grants.private_access, false);

    const broken = env({ MEMBER_STATUS_RESOLVER: resolver({}, 500) });
    lineVerify();
    const failed = await request("/member/api/liff/start", { body: { id_token: "valid" } }, broken);
    assert.equal(failed.response.status, 503);
    assert.equal([...broken.LIFF_IDENTITY_KV.map.keys()].filter((key) => key.startsWith("liff:pending:")).length, 0);
  });

  it("keeps separate Airtable session records for separate starts from the same identity", async () => {
    const runtime = env();
    lineVerify({ sub: "Usame-identity" });
    const first = await request("/member/api/liff/start", { body: { id_token: "first-token" } }, runtime);
    const firstRecord = { ...runtime.LIFF_GATEWAY_STORE.records[0] };

    lineVerify({ sub: "Usame-identity" });
    const second = await request("/member/api/liff/start", { body: { id_token: "second-token" } }, runtime);
    const records = runtime.LIFF_GATEWAY_STORE.records;
    const mappingKeys = [...runtime.LIFF_IDENTITY_KV.map.keys()].filter((key) => key.startsWith("liff:gateway-record:"));

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.equal(records.length, 2);
    assert.notEqual(records[0].session_id, records[1].session_id);
    assert.deepEqual(records[0], firstRecord);
    assert.equal(mappingKeys.length, 2);
    assert.ok(mappingKeys.every((key) => records.every((record) => !key.includes(record.session_id))));
  });

  it("status authenticates with cookie, rotates through Set-Cookie only, and retires a prior cookie on sequential reuse", async () => {
    const runtime = env();
    const started = await start(runtime);
    const startCookie = findCookie(started.response, "__Host-mmd_liff_session");

    const unauth = await request("/member/api/liff/status", { method: "GET" }, runtime);
    assert.equal(unauth.response.status, 401);
    assertHostCookie(findCookie(unauth.response, "__Host-mmd_liff_session"), "__Host-mmd_liff_session", 0);

    const checked = await request("/member/api/liff/status", { method: "GET", cookie: cookiePair(startCookie) }, runtime);
    const rotatedCookie = findCookie(checked.response, "__Host-mmd_liff_session");
    assert.equal(checked.response.status, 200);
    assert.equal(checked.response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");
    assertHostCookie(rotatedCookie, "__Host-mmd_liff_session", 900);
    assert.notEqual(cookiePair(rotatedCookie), cookiePair(startCookie));
    assertNoSensitive(JSON.stringify(checked.payload));

    const replay = await request("/member/api/liff/status", { method: "GET", cookie: cookiePair(startCookie) }, runtime);
    assert.equal(replay.response.status, 401);
  });

  it("rejects an unapproved status origin before session rotation or storage writes", async () => {
    const runtime = env();
    const started = await start(runtime);
    const startCookie = cookiePair(findCookie(started.response, "__Host-mmd_liff_session"));
    const recordsBefore = JSON.stringify(runtime.LIFF_GATEWAY_STORE.records);
    const decisionsBefore = runtime.LIFF_GATEWAY_STORE.decisions.length;
    const resolverCallsBefore = runtime.MEMBER_STATUS_RESOLVER.calls.length;

    const rejected = await request("/member/api/liff/status", {
      method: "GET",
      cookie: startCookie,
      origin: "https://evil.example",
    }, runtime);

    assert.equal(rejected.response.status, 403);
    assert.equal(rejected.payload.error.code, "ORIGIN_NOT_ALLOWED");
    assert.equal(findCookie(rejected.response, "__Host-mmd_liff_session"), "");
    assert.equal(rejected.response.headers.get("access-control-allow-origin"), null);
    assert.equal(JSON.stringify(runtime.LIFF_GATEWAY_STORE.records), recordsBefore);
    assert.equal(runtime.LIFF_GATEWAY_STORE.decisions.length, decisionsBefore);
    assert.equal(runtime.MEMBER_STATUS_RESOLVER.calls.length, resolverCallsBefore);

    const approved = await request("/member/api/liff/status", {
      method: "GET",
      cookie: startCookie,
      origin: "https://www.mmdbkk.com",
    }, runtime);

    assert.equal(approved.response.status, 200);
    assert.equal(approved.response.headers.get("access-control-allow-origin"), "https://www.mmdbkk.com");
    assertHostCookie(findCookie(approved.response, "__Host-mmd_liff_session"), "__Host-mmd_liff_session", 900);
  });

  it("keeps the prior cookie usable when package storage fails after rotation", async () => {
    const runtime = env();
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    runtime.LIFF_GATEWAY_STORE.packages.set("believe", {
      package_code: "believe",
      pricing_lane: "believe_member_2999",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      requires_manual_review: false,
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "signup" });
    const audience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const priorCookie = cookiePair(findCookie(audience.response, "__Host-mmd_liff_session"));
    const resolvePackage = runtime.LIFF_GATEWAY_STORE.resolvePackage.bind(runtime.LIFF_GATEWAY_STORE);
    runtime.LIFF_GATEWAY_STORE.resolvePackage = async () => { throw new Error("mock package storage failure"); };

    const failed = await request("/member/api/liff/package", {
      cookie: priorCookie,
      body: { requested_package_code: "believe" },
    }, runtime);
    runtime.LIFF_GATEWAY_STORE.resolvePackage = resolvePackage;
    const retried = await request("/member/api/liff/package", {
      cookie: priorCookie,
      body: { requested_package_code: "believe" },
    }, runtime);

    assert.equal(failed.response.status, 503);
    assert.equal(failed.payload.error.code, "LIFF_GATEWAY_STORAGE_UNAVAILABLE");
    assert.equal(findCookie(failed.response, "__Host-mmd_liff_session"), "");
    assert.equal(retried.response.status, 200);
    assertHostCookie(findCookie(retried.response, "__Host-mmd_liff_session"), "__Host-mmd_liff_session", 900);
  });

  it("status uses only the verified LIFF session and never grants a dashboard route from a query claim", async () => {
    const runtime = env({ MEMBER_STATUS_RESOLVER: resolver({ member_exists: true }) });
    const started = await start(runtime);
    const status = await request("/member/api/liff/status?line_user_id=Uspoof&member_id_candidate=MMD-1", {
      method: "GET",
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
    }, runtime);

    assert.equal(status.response.status, 200);
    assert.equal(status.payload.data.member_resolved, true);
    assert.equal(status.payload.data.next_screen_key, "status_result");
    assert.equal(status.payload.data.route_after_liff, null);
    assert.doesNotMatch(JSON.stringify(status.payload), /Uspoof|MMD-1|\/member\/dashboard|tier/i);
    assert.equal(runtime.LIFF_GATEWAY_STORE.decisions.length, 1);
  });

  it("intent accepts only authenticated cookie sessions and rejects identity substitution", async () => {
    const runtime = env();
    const started = await start(runtime);
    const cookie = cookiePair(findCookie(started.response, "__Host-mmd_liff_session"));
    const changed = await request("/member/api/liff/intent", { cookie, body: { intent: "booking_request" } }, runtime);
    assert.equal(changed.response.status, 200);
    assert.equal(changed.payload.data.intent, "booking_request");
    assertNoSensitive(JSON.stringify(changed.payload));

    const spoof = await request("/member/api/liff/intent", { cookie: cookiePair(findCookie(changed.response, "__Host-mmd_liff_session")), body: { intent: "hall", sub: "Uother" } }, runtime);
    assert.equal(spoof.response.status, 400);
    assert.equal(spoof.payload.error.code, "BROWSER_IDENTITY_REJECTED");
  });

  it("routes a verified LIFF signup intent to audience selection and records a mock-only decision", async () => {
    const runtime = env();
    const started = await start(runtime);
    const result = await request("/member/api/liff/intent", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { liff_intent: "signup" },
    }, runtime);

    assert.equal(result.response.status, 200);
    assert.equal(result.payload.data.next_screen_key, "audience_select");
    assert.equal(result.payload.data.screen.key, "audience_select");
    assert.equal(runtime.LIFF_GATEWAY_STORE.records.length, 1);
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].liff_intent, "signup");
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].hype_decision_status, "asking_audience");
    assert.equal(runtime.LIFF_GATEWAY_STORE.decisions.length, 1);
    assert.deepEqual(result.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
  });

  it("stores a bounded Hall audience decision without exposing its internal labels to the customer", async () => {
    const runtime = env();
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    const started = await start(runtime, { id_token: "valid", liff_intent: "signup" });
    const result = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);

    assert.equal(result.response.status, 200);
    assert.equal(result.payload.data.next_screen_key, "signup_package");
    assert.equal(result.payload.data.screen.key, "signup_package");
    assert.equal(result.payload.data.route_after_liff, "/sigil/member/membership");
    assert.doesNotMatch(JSON.stringify(result.payload), /female_view|show_female_profiles|believe_member_2999/i);
    const stored = runtime.LIFF_GATEWAY_STORE.records[0];
    assert.equal(stored.hall_audience_context, "female_view");
    assert.equal(stored.model_visibility_mode, "show_female_profiles");
    assert.equal(stored.pricing_lane, "believe_member_2999");
    assert.equal(runtime.LIFF_GATEWAY_STORE.decisions.length, 1);
    assert.deepEqual(result.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
  });

  it("maps an LGBT Hall choice only to its bounded visibility mode", async () => {
    const runtime = env();
    runtime.LIFF_GATEWAY_STORE.inventory.add("lgbt_view");
    const started = await start(runtime, { id_token: "valid", liff_intent: "hall" });
    const result = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "lgbt_view" },
    }, runtime);

    assert.equal(result.response.status, 200);
    assert.equal(result.payload.data.next_screen_key, "hall_route");
    assert.equal(result.payload.data.route_after_liff, "/hall");
    assert.doesNotMatch(JSON.stringify(result.payload), /lgbt_view|show_lgbt_profiles|gay_extreme_900/i);
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].hall_audience_context, "lgbt_view");
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].model_visibility_mode, "show_lgbt_profiles");
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].pricing_lane, "gay_extreme_900");
  });

  it("keeps manual-review cases out of packages and payment intent", async () => {
    const runtime = env();
    const payments = paymentsWorker();
    runtime.PAYMENTS_WORKER = payments;
    const started = await start(runtime, { id_token: "valid", liff_intent: "signup" });
    const audience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "manual_review" },
    }, runtime);

    assert.equal(audience.response.status, 200);
    assert.equal(audience.payload.data.next_screen_key, "manual_review");
    assert.equal(audience.payload.data.route_after_liff, "manual_review");
    assert.doesNotMatch(JSON.stringify(audience.payload), /manual_review_only|special_review/i);

    const packageAttempt = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(audience.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "believe" },
    }, runtime);
    assert.equal(packageAttempt.response.status, 409);
    assert.equal(packageAttempt.payload.error.code, "PACKAGE_NOT_READY");

    const paymentAttempt = await request("/member/api/liff/payment-intent", {
      cookie: cookiePair(findCookie(packageAttempt.response, "__Host-mmd_liff_session")),
      body: { package_code: "believe", payment_stage: "membership" },
    }, runtime);
    assert.equal(paymentAttempt.response.status, 409);
    assert.equal(paymentAttempt.payload.error.code, "PAYMENT_INTENT_NOT_READY");
    assert.equal(payments.calls.length, 0);
  });

  it("keeps unknown Hall context out of a model route", async () => {
    const runtime = env();
    const started = await start(runtime, { id_token: "valid", liff_intent: "hall" });
    const result = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "unknown" },
    }, runtime);

    assert.equal(result.response.status, 200);
    assert.equal(result.payload.data.next_screen_key, "audience_select");
    assert.doesNotMatch(JSON.stringify(result.payload), /\/hall/);
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].model_visibility_mode, "hold_until_selected");
  });

  it("uses the mock server package rule and rejects browser pricing claims", async () => {
    const runtime = env();
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    runtime.LIFF_GATEWAY_STORE.packages.set("believe", {
      package_code: "believe",
      pricing_lane: "believe_member_2999",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      requires_manual_review: false,
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "signup" });
    const selectedAudience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const selectedPackage = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(selectedAudience.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "believe" },
    }, runtime);

    assert.equal(selectedPackage.response.status, 200);
    assert.deepEqual(selectedPackage.payload.data.payment_summary, {
      package_code: "believe",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      payment_status: "not_paid",
    });
    assert.deepEqual(selectedPackage.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
    assert.equal(runtime.LIFF_GATEWAY_STORE.records[0].pricing_lane, "believe_member_2999");

    const spoof = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(selectedPackage.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "believe", amount_thb: 1 },
    }, runtime);
    assert.equal(spoof.response.status, 400);
    assert.equal(spoof.payload.error.code, "BROWSER_IDENTITY_REJECTED");
  });

  it("requires a resolved member before recovery package selection", async () => {
    const unknownRuntime = env();
    unknownRuntime.LIFF_GATEWAY_STORE.packages.set("standard", {
      package_code: "standard",
      pricing_lane: "standard_1199",
      amount_thb: 1199,
      duration_days: 365,
      points_after_verification: 0,
      requires_manual_review: false,
    });
    const unknownStart = await start(unknownRuntime);
    const continued = await request("/member/api/liff/intent", {
      cookie: cookiePair(findCookie(unknownStart.response, "__Host-mmd_liff_session")),
      body: { liff_intent: "continue_payment" },
    }, unknownRuntime);
    const rejected = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(continued.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "standard" },
    }, unknownRuntime);

    assert.equal(continued.response.status, 200);
    assert.equal(continued.payload.data.next_screen_key, "renew_member_lookup");
    assert.equal(continued.payload.data.route_after_liff, null);
    assert.equal(rejected.response.status, 409);
    assert.equal(rejected.payload.error.code, "MEMBER_LOOKUP_REQUIRED");
    assert.equal(rejected.payload.data.next_screen_key, "renew_member_lookup");
    assert.equal(rejected.payload.data.route_after_liff, null);
    assert.deepEqual(rejected.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });

    const memberRuntime = env({ MEMBER_STATUS_RESOLVER: resolver({ member_exists: true }) });
    const memberPayments = paymentsWorker();
    memberRuntime.PAYMENTS_WORKER = memberPayments;
    memberRuntime.LIFF_GATEWAY_STORE.packages.set("standard", {
      package_code: "standard",
      pricing_lane: "standard_1199",
      amount_thb: 1199,
      duration_days: 365,
      points_after_verification: 0,
      requires_manual_review: false,
    });
    const memberStart = await start(memberRuntime, { id_token: "member-token", liff_intent: "renew" });
    const allowed = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(memberStart.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "standard" },
    }, memberRuntime);

    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.payload.data.member_resolved, true);
    assert.equal(allowed.payload.data.next_screen_key, "payment_start");
    assert.equal(allowed.payload.data.payment_summary.package_code, "standard");
    assert.deepEqual(allowed.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
    assert.equal(memberPayments.calls.length, 0);
  });

  it("keeps status sessions in lookup or status-only flow without a payment summary", async () => {
    const packageRules = [
      ["standard", "standard_1199", 1199],
      ["premium", "premium_2999", 2999],
    ];
    for (const [packageCode, pricingLane, amountThb] of packageRules) {
      const runtime = env();
      const payments = paymentsWorker();
      runtime.PAYMENTS_WORKER = payments;
      runtime.LIFF_GATEWAY_STORE.packages.set(packageCode, {
        package_code: packageCode,
        pricing_lane: pricingLane,
        amount_thb: amountThb,
        duration_days: 365,
        points_after_verification: 0,
        requires_manual_review: false,
      });

      const started = await start(runtime, { id_token: `unknown-status-${packageCode}`, liff_intent: "status" });
      const rejected = await request("/member/api/liff/package", {
        cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
        body: { requested_package_code: packageCode },
      }, runtime);

      assert.equal(rejected.response.status, 409, packageCode);
      assert.equal(rejected.payload.error.code, "MEMBER_LOOKUP_REQUIRED", packageCode);
      assert.equal(rejected.payload.data.next_screen_key, "renew_member_lookup", packageCode);
      assert.equal(rejected.payload.data.route_after_liff, null, packageCode);
      assert.equal("payment_summary" in rejected.payload.data, false, packageCode);
      assert.deepEqual(rejected.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false }, packageCode);
      assert.equal(payments.calls.length, 0, packageCode);

      const blockedPayment = await request("/member/api/liff/payment-intent", {
        cookie: cookiePair(findCookie(rejected.response, "__Host-mmd_liff_session")),
        body: { package_code: packageCode, payment_stage: "membership" },
      }, runtime);
      assert.equal(blockedPayment.response.status, 409, packageCode);
      assert.equal(blockedPayment.payload.error.code, "MEMBER_LOOKUP_REQUIRED", packageCode);
      assert.equal("payment_summary" in blockedPayment.payload.data, false, packageCode);
      assert.equal(payments.calls.length, 0, packageCode);
    }

    const memberRuntime = env({ MEMBER_STATUS_RESOLVER: resolver({ member_exists: true }) });
    const memberPayments = paymentsWorker();
    memberRuntime.PAYMENTS_WORKER = memberPayments;
    memberRuntime.LIFF_GATEWAY_STORE.packages.set("standard", {
      package_code: "standard",
      pricing_lane: "standard_1199",
      amount_thb: 1199,
      duration_days: 365,
      points_after_verification: 0,
      requires_manual_review: false,
    });
    const memberStart = await start(memberRuntime, { id_token: "member-status", liff_intent: "status" });
    const statusOnly = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(memberStart.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "standard" },
    }, memberRuntime);

    assert.equal(memberStart.payload.data.next_screen_key, "status_result");
    assert.equal(statusOnly.response.status, 409);
    assert.equal(statusOnly.payload.error.code, "STATUS_FLOW_ONLY");
    assert.equal(statusOnly.payload.data.next_screen_key, "status_result");
    assert.equal(statusOnly.payload.data.route_after_liff, null);
    assert.equal("payment_summary" in statusOnly.payload.data, false);
    assert.deepEqual(statusOnly.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
    assert.equal(memberPayments.calls.length, 0);

    const memberPayment = await request("/member/api/liff/payment-intent", {
      cookie: cookiePair(findCookie(statusOnly.response, "__Host-mmd_liff_session")),
      body: { package_code: "standard", payment_stage: "membership" },
    }, memberRuntime);
    assert.equal(memberPayment.response.status, 409);
    assert.equal(memberPayment.payload.error.code, "STATUS_FLOW_ONLY");
    assert.equal("payment_summary" in memberPayment.payload.data, false);
    assert.equal(memberPayments.calls.length, 0);
  });

  it("keeps unknown recovery intents out of audience-specific and future package lanes", async () => {
    const recoveryCases = [
        {
          liffIntent: "renew",
          audience: "female_view",
          packageCode: "believe",
          packageRule: {
            package_code: "believe",
            pricing_lane: "believe_member_2999",
            amount_thb: 2999,
            duration_days: 365,
            points_after_verification: 250,
            requires_manual_review: false,
          },
        },
        {
          liffIntent: "renew",
          audience: "lgbt_view",
          packageCode: "gay",
          packageRule: {
            package_code: "gay",
            pricing_lane: "gay_extreme_900",
            amount_thb: 900,
            duration_days: 365,
            points_after_verification: 90,
            requires_manual_review: false,
          },
        },
        {
          liffIntent: "continue_payment",
          audience: null,
          packageCode: "future_lane",
          packageRule: {
            package_code: "future_lane",
            pricing_lane: "special_review",
            amount_thb: 1,
            duration_days: 1,
            points_after_verification: 0,
            requires_manual_review: false,
          },
        },
    ];

    for (const recovery of recoveryCases) {
      const runtime = env();
      const payments = paymentsWorker();
      runtime.PAYMENTS_WORKER = payments;
      runtime.LIFF_GATEWAY_STORE.packages.set(recovery.packageCode, recovery.packageRule);
      if (recovery.audience) runtime.LIFF_GATEWAY_STORE.inventory.add(recovery.audience);

      const started = await start(runtime, { id_token: `unknown-${recovery.packageCode}`, liff_intent: recovery.liffIntent });
      let cookie = cookiePair(findCookie(started.response, "__Host-mmd_liff_session"));
      if (recovery.audience) {
        const audience = await request("/member/api/liff/audience", {
          cookie,
          body: { hall_audience_context: recovery.audience },
        }, runtime);
        assert.equal(audience.response.status, 409);
        assert.equal(audience.payload.error.code, "MEMBER_LOOKUP_REQUIRED");
        assert.equal(audience.payload.data.next_screen_key, "renew_member_lookup");
        cookie = cookiePair(findCookie(audience.response, "__Host-mmd_liff_session"));
      }

      const rejected = await request("/member/api/liff/package", {
        cookie,
        body: { requested_package_code: recovery.packageCode },
      }, runtime);

      assert.equal(rejected.response.status, 409);
      assert.equal(rejected.payload.error.code, "MEMBER_LOOKUP_REQUIRED");
      assert.equal(rejected.payload.data.next_screen_key, "renew_member_lookup");
      assert.equal(rejected.payload.data.route_after_liff, null);
      assert.equal("payment_summary" in rejected.payload.data, false);
      assert.deepEqual(rejected.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
      assert.equal(payments.calls.length, 0);
    }
  });

  it("routes an unknown renewal package selection to member lookup without grants", async () => {
    const runtime = env();
    const payments = paymentsWorker();
    runtime.PAYMENTS_WORKER = payments;
    runtime.LIFF_GATEWAY_STORE.packages.set("standard", {
      package_code: "standard",
      pricing_lane: "standard_1199",
      amount_thb: 1199,
      duration_days: 365,
      points_after_verification: 0,
      requires_manual_review: false,
    });
    const started = await start(runtime, { id_token: "renew-token", liff_intent: "renew" });
    const rejected = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "standard" },
    }, runtime);

    assert.equal(started.payload.data.next_screen_key, "renew_member_lookup");
    assert.equal(rejected.response.status, 409);
    assert.equal(rejected.payload.error.code, "MEMBER_LOOKUP_REQUIRED");
    assert.equal(rejected.payload.data.next_screen_key, "renew_member_lookup");
    assert.equal(rejected.payload.data.route_after_liff, null);
    assert.equal("payment_summary" in rejected.payload.data, false);
    assert.deepEqual(rejected.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
    assert.equal(payments.calls.length, 0);
  });

  it("invalidates a package when the Hall audience changes", async () => {
    const runtime = env();
    const payments = paymentsWorker();
    runtime.PAYMENTS_WORKER = payments;
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    runtime.LIFF_GATEWAY_STORE.inventory.add("lgbt_view");
    runtime.LIFF_GATEWAY_STORE.packages.set("believe", {
      package_code: "believe",
      pricing_lane: "believe_member_2999",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      requires_manual_review: false,
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "signup" });
    const female = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const selected = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(female.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "believe" },
    }, runtime);
    const lgbt = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(selected.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "lgbt_view" },
    }, runtime);
    const payment = await request("/member/api/liff/payment-intent", {
      cookie: cookiePair(findCookie(lgbt.response, "__Host-mmd_liff_session")),
      body: { package_code: "believe", payment_stage: "membership" },
    }, runtime);

    assert.equal(lgbt.response.status, 200);
    assert.equal(payment.response.status, 409);
    assert.equal(payment.payload.error.code, "PAYMENT_INTENT_NOT_READY");
    assert.equal(payments.calls.length, 0);
  });

  it("invalidates a package when the LIFF intent changes", async () => {
    const runtime = env();
    const payments = paymentsWorker();
    runtime.PAYMENTS_WORKER = payments;
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    runtime.LIFF_GATEWAY_STORE.packages.set("believe", {
      package_code: "believe",
      pricing_lane: "believe_member_2999",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      requires_manual_review: false,
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "signup" });
    const audience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const selected = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(audience.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "believe" },
    }, runtime);
    const renewed = await request("/member/api/liff/intent", {
      cookie: cookiePair(findCookie(selected.response, "__Host-mmd_liff_session")),
      body: { liff_intent: "renew" },
    }, runtime);
    const payment = await request("/member/api/liff/payment-intent", {
      cookie: cookiePair(findCookie(renewed.response, "__Host-mmd_liff_session")),
      body: { package_code: "believe", payment_stage: "renewal" },
    }, runtime);

    assert.equal(renewed.response.status, 200);
    assert.equal(renewed.payload.data.next_screen_key, "renew_member_lookup");
    assert.equal(payment.response.status, 409);
    assert.equal(payment.payload.error.code, "MEMBER_LOOKUP_REQUIRED");
    assert.equal(payment.payload.data.next_screen_key, "renew_member_lookup");
    assert.equal("payment_summary" in payment.payload.data, false);
    assert.deepEqual(payment.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
    assert.equal(payments.calls.length, 0);
  });

  it("revalidates the stored package context before payment intent", async () => {
    const runtime = env();
    const payments = paymentsWorker();
    runtime.PAYMENTS_WORKER = payments;
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    runtime.LIFF_GATEWAY_STORE.packages.set("believe", {
      package_code: "believe",
      pricing_lane: "believe_member_2999",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      requires_manual_review: false,
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "signup" });
    const audience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const selected = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(audience.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "believe" },
    }, runtime);
    const sessionKey = [...runtime.LIFF_IDENTITY_KV.map.keys()].find((key) => key.startsWith("liff:session:"));
    const stored = JSON.parse(runtime.LIFF_IDENTITY_KV.map.get(sessionKey));
    stored.selected_package.context.pricing_lane = "tampered_lane";
    runtime.LIFF_IDENTITY_KV.map.set(sessionKey, JSON.stringify(stored));

    const payment = await request("/member/api/liff/payment-intent", {
      cookie: cookiePair(findCookie(selected.response, "__Host-mmd_liff_session")),
      body: { package_code: "believe", payment_stage: "membership" },
    }, runtime);

    assert.equal(payment.response.status, 409);
    assert.equal(payment.payload.error.code, "PAYMENT_INTENT_STALE_PACKAGE");
    assert.equal(payments.calls.length, 0);
  });

  it("keeps payment intent blocked until an approved token contract exists", async () => {
    const runtime = env();
    const payments = paymentsWorker();
    runtime.PAYMENTS_WORKER = payments;
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    runtime.LIFF_GATEWAY_STORE.packages.set("believe", {
      package_code: "believe",
      pricing_lane: "believe_member_2999",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      requires_manual_review: false,
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "signup" });
    const audience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const selected = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(audience.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "believe" },
    }, runtime);
    const payment = await request("/member/api/liff/payment-intent", {
      cookie: cookiePair(findCookie(selected.response, "__Host-mmd_liff_session")),
      body: { package_code: "believe", payment_stage: "membership" },
    }, runtime);

    assert.equal(payment.response.status, 503);
    assert.equal(payment.payload.error.code, "PAYMENT_TOKEN_CONTRACT_UNAVAILABLE");
    assert.equal(payment.payload.data.payment_binding_status, "contract_unavailable");
    assert.equal(payment.payload.data.route_after_liff, null);
    assert.deepEqual(payment.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
    assert.equal(payments.calls.length, 0);
  });

  it("returns the same controlled payment block when no payment binding exists", async () => {
    const runtime = env();
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    runtime.LIFF_GATEWAY_STORE.packages.set("believe", {
      package_code: "believe",
      pricing_lane: "believe_member_2999",
      amount_thb: 2999,
      duration_days: 365,
      points_after_verification: 250,
      requires_manual_review: false,
    });
    const started = await start(runtime, { id_token: "valid", liff_intent: "signup" });
    const audience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const selected = await request("/member/api/liff/package", {
      cookie: cookiePair(findCookie(audience.response, "__Host-mmd_liff_session")),
      body: { requested_package_code: "believe" },
    }, runtime);
    const payment = await request("/member/api/liff/payment-intent", {
      cookie: cookiePair(findCookie(selected.response, "__Host-mmd_liff_session")),
      body: { package_code: "believe", payment_stage: "membership" },
    }, runtime);

    assert.equal(payment.response.status, 503);
    assert.equal(payment.payload.error.code, "PAYMENT_TOKEN_CONTRACT_UNAVAILABLE");
    assert.equal(payment.payload.data.payment_binding_status, "contract_unavailable");
    assert.equal(payment.payload.data.route_after_liff, null);
    assert.deepEqual(payment.payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
  });

  it("blocks Hall handoff until an atomic session guard is implemented", async () => {
    const runtime = env();
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    lineVerify({ sub: "Uprivate-line-sub" });
    const started = await request("/member/api/liff/start?t=private-signed-t", { body: { id_token: "private-id-token", liff_intent: "hall" } }, runtime);
    const audience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const result = await request("/member/api/liff/hall-token", { cookie: cookiePair(findCookie(audience.response, "__Host-mmd_liff_session")), body: {} }, runtime);
    assert.equal(result.response.status, 503);
    assert.equal(result.payload.error.code, "LIFF_ATOMIC_SESSION_GUARD_REQUIRED");
    assert.equal(result.payload.data.route_after_liff, null);
    assert.equal("redirect_to" in result.payload.data, false);
    assertHostCookie(findCookie(result.response, "__Host-mmd_liff_session"), "__Host-mmd_liff_session", 900);
    assert.doesNotMatch(JSON.stringify(result.payload), /Uprivate-line-sub|private-id-token|private-signed-t|female_view|show_female_profiles/i);
  });

  it("blocks concurrent Hall handoff attempts while no atomic session guard exists", async () => {
    const runtime = env();
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    const started = await start(runtime, { id_token: "valid", liff_intent: "hall" });
    const audience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const cookie = cookiePair(findCookie(audience.response, "__Host-mmd_liff_session"));
    const attempts = await Promise.all([
      request("/member/api/liff/hall-token", { cookie, body: {} }, runtime),
      request("/member/api/liff/hall-token", { cookie, body: {} }, runtime),
    ]);

    assert.ok(attempts.every((attempt) => attempt.response.status >= 400));
    assert.ok(attempts.every((attempt) => attempt.payload?.data?.redirect_to == null));
  });

  it("signs an opaque Hall payload with jti only and requires server-side context storage", async () => {
    const runtime = env();
    const { token, payload } = await createHallRouteToken(runtime);
    const decoded = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));

    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.deepEqual(decoded, payload);
    assert.deepEqual(Object.keys(decoded).sort(), ["aud", "exp", "iat", "jti", "v"]);
    assert.equal(decoded.aud, "hall");
    assert.equal(typeof decoded.jti, "string");
    for (const forbidden of ["sid", "line_user_id", "member", "mode", "record_id", "session_id"]) {
      assert.equal(forbidden in decoded, false, forbidden);
    }
    const tokenHash = await keyedDigestForTest(runtime.LIFF_SESSION_SECRET, `hall:${token}`);
    const jtiHash = await keyedDigestForTest(runtime.LIFF_SESSION_SECRET, `hall-jti:${decoded.jti}`);
    await runtime.LIFF_IDENTITY_KV.put(`liff:hall:${jtiHash}`, JSON.stringify({
      session_id: "internal-session-id",
      model_visibility_mode: "show_female_profiles",
      token_hash: tokenHash,
      expires_at: decoded.exp,
    }));
    assert.deepEqual(await verifyHallRouteToken(token, runtime), {
      ok: true,
      context: { session_id: "internal-session-id", model_visibility_mode: "show_female_profiles" },
    });
  });

  it("does not accept caller-selected Hall destinations or bypass unknown audience context", async () => {
    const unsafe = [
      "https://evil.example/steal",
      "//evil.example/steal",
      "%2F%2Fevil.example",
      "/../hall",
      "/sigil/booking",
      "/pay/membership",
      "/sigil/pay/renewal",
      "/admin/panel",
      "/internal/thing",
      "/model/console",
      "/hall?next=https://evil.example",
      "javascript:alert(1)",
      "data:text/html,hi",
      "/hall\\evil",
    ];
    for (const destination of unsafe) {
      const runtime = env();
      runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
      const started = await start(runtime, { id_token: "valid", liff_intent: "hall" });
      const audience = await request("/member/api/liff/audience", {
        cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
        body: { hall_audience_context: "female_view" },
      }, runtime);
      const result = await request("/member/api/liff/hall-token", {
        cookie: cookiePair(findCookie(audience.response, "__Host-mmd_liff_session")),
        body: { destination },
      }, runtime);
      assert.equal(result.response.status, 400, destination);
      assert.equal(result.payload.error.code, "BROWSER_IDENTITY_REJECTED");
    }

    const runtime = env();
    const started = await start(runtime, { id_token: "valid", liff_intent: "hall" });
    const blocked = await request("/member/api/liff/hall-token", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: {},
    }, runtime);
    assert.equal(blocked.response.status, 409);
    assert.equal(blocked.payload.error.code, "HALL_AUDIENCE_REQUIRED");
  });

  it("does not log ID tokens, raw continuity, cookies, handoff values, or raw sub", async () => {
    const logs = [];
    console.log = (...args) => logs.push(args.join(" "));
    console.error = (...args) => logs.push(args.join(" "));
    const runtime = env();
    runtime.LIFF_GATEWAY_STORE.inventory.add("female_view");
    lineVerify({ sub: "Uprivate-line-sub" });
    const started = await request("/member/api/liff/start?t=private-signed-t", { body: { id_token: "private-id-token", liff_intent: "hall" } }, runtime);
    const audience = await request("/member/api/liff/audience", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { hall_audience_context: "female_view" },
    }, runtime);
    const hall = await request("/member/api/liff/hall-token", {
      cookie: cookiePair(findCookie(audience.response, "__Host-mmd_liff_session")),
      body: {},
    }, runtime);
    assertNoSensitive(`${JSON.stringify(started.payload)}\n${JSON.stringify(hall.payload)}\n${logs.join("\n")}`);
  });

  it("legacy and unknown LIFF routes fail closed", async () => {
    const legacy = await request("/member/api/liff/identify", { body: { line_user_id: "Uspoof" } });
    assert.equal(legacy.response.status, 410);
    assert.equal(legacy.payload.error.code, "LEGACY_LIFF_IDENTITY_DISABLED");

    const unknown = await request("/member/api/liff/unknown", { body: { id_token: "valid" } });
    assert.equal(unknown.response.status, 404);
    assert.equal(unknown.payload.error.code, "LIFF_ROUTE_NOT_FOUND");

    for (const method of ["GET", "POST"]) {
      const legacyWish = await worker.fetch(new Request("https://mmdbkk.com/api/care-back-wish", { method }), {});
      assert.equal(legacyWish.status, 404);
    }
  });

  it("existing member pages, renewal, payment, and dashboard behavior remain delegated unchanged", async () => {
    const legacyMembership = await worker.fetch(new Request("https://mmdbkk.com/member/membership", { method: "GET" }), {});
    assert.equal(legacyMembership.status, 301);
    assert.equal(new URL(legacyMembership.headers.get("location")).pathname, "/sigil/member/membership");

    for (const path of ["/sigil/member/membership", "/sigil/pay/renewal", "/pay/membership"]) {
      const response = await worker.fetch(new Request(`https://mmdbkk.com${path}`, { method: "GET" }), {});
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    }
    const dashboard = await worker.fetch(new Request("https://mmdbkk.com/member/dashboard", { method: "GET" }), {});
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.headers.get("x-mmd-page"), "member-dashboard");
    assert.match(await dashboard.text(), /MMD Privé \\| Member Dashboard/);
  });
});
