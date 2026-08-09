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

function resolver(payload = { member_exists: false }, status = 200) {
  const calls = [];
  return {
    calls,
    fetch: async (request) => {
      calls.push({
        ...(await request.json()),
        _resolver_secret: request.headers.get("x-mmd-member-resolver-secret"),
      });
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
  return {
    LINE_LOGIN_CHANNEL_ID: "2000000000",
    LIFF_SESSION_SECRET: "test-only-session-secret-not-production",
    MEMBER_STATUS_RESOLVER_SECRET: "test-only-member-status-resolver-secret-1234567890",
    LIFF_IDENTITY_KV: new MemoryKv(),
    MEMBER_STATUS_RESOLVER: resolver(),
    LIFF_GATEWAY_STORE: new MemoryGatewayStore(),
    ...overrides,
  };
}

function lineVerify({ sub = "U123", aud = "2000000000", exp = Math.floor(Date.now() / 1000) + 600, status = 200, malformed = false } = {}) {
  globalThis.fetch = async (_url, init) => {
    const params = new URLSearchParams(init.body);
    assert.equal(params.get("client_id"), "2000000000");
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
    assert.equal(dashboard.status, 404);
  });
});
