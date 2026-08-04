import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import worker from "../src/liff-identity-foundation.js";

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

function env(overrides = {}) {
  return {
    LINE_LOGIN_CHANNEL_ID: "2000000000",
    LIFF_SESSION_SECRET: "test-only-session-secret-not-production",
    MEMBER_STATUS_RESOLVER_SECRET: "test-only-member-status-resolver-secret-1234567890",
    LIFF_IDENTITY_KV: new MemoryKv(),
    MEMBER_STATUS_RESOLVER: resolver(),
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

describe("Phase 1 LIFF identity foundation security correction", () => {
  it("valid LINE token succeeds, sets secure session cookie, and returns no raw token", async () => {
    const { response, payload } = await start();
    const cookie = findCookie(response, "__Host-mmd_liff_session");
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.identity_state, "pending_identity");
    assert.equal(payload.data.member_resolved, false);
    assert.deepEqual(payload.data.grants, { membership: false, points: false, payment_status: false, private_access: false });
    assertHostCookie(cookie, "__Host-mmd_liff_session", 900);
    assertNoSensitive(JSON.stringify(payload));
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

  it("requires same-origin JSON POSTs and does not accept Authorization bearer sessions", async () => {
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "valid" }, origin: "" })).response.status, 403);
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "valid" }, origin: "https://evil.example" })).response.status, 403);
    assert.equal((await request("/member/api/liff/start", { body: { id_token: "valid" }, contentType: "text/plain" })).response.status, 400);

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

  it("status authenticates with cookie, rotates through Set-Cookie only, and rejects replay", async () => {
    const runtime = env();
    const started = await start(runtime);
    const startCookie = findCookie(started.response, "__Host-mmd_liff_session");

    const unauth = await request("/member/api/liff/status", { method: "GET" }, runtime);
    assert.equal(unauth.response.status, 401);
    assertHostCookie(findCookie(unauth.response, "__Host-mmd_liff_session"), "__Host-mmd_liff_session", 0);

    const checked = await request("/member/api/liff/status", { method: "GET", cookie: cookiePair(startCookie) }, runtime);
    const rotatedCookie = findCookie(checked.response, "__Host-mmd_liff_session");
    assert.equal(checked.response.status, 200);
    assertHostCookie(rotatedCookie, "__Host-mmd_liff_session", 900);
    assert.notEqual(cookiePair(rotatedCookie), cookiePair(startCookie));
    assertNoSensitive(JSON.stringify(checked.payload));

    const replay = await request("/member/api/liff/status", { method: "GET", cookie: cookiePair(startCookie) }, runtime);
    assert.equal(replay.response.status, 401);
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

  it("hall handoff uses secure cookie, returns safe destination only, and consumes session", async () => {
    const runtime = env();
    const started = await start(runtime, { id_token: "valid" }, "/member/api/liff/start?t=private-signed-t");
    const sessionCookie = cookiePair(findCookie(started.response, "__Host-mmd_liff_session"));
    const result = await request("/member/api/liff/hall-token", { cookie: sessionCookie, body: { destination: "/hall" } }, runtime);
    const handoff = findCookie(result.response, "__Host-mmd_liff_handoff");
    const cleared = findCookie(result.response, "__Host-mmd_liff_session");
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.payload.data, { redirect_to: "/hall", expires_in: 300 });
    assertHostCookie(handoff, "__Host-mmd_liff_handoff", 300);
    assertHostCookie(cleared, "__Host-mmd_liff_session", 0);
    assertNoSensitive(JSON.stringify(result.payload));
    assert.doesNotMatch(JSON.stringify(result.payload), /private-signed-t/);

    const replay = await request("/member/api/liff/hall-token", { cookie: sessionCookie, body: { destination: "/hall" } }, runtime);
    assert.equal(replay.response.status, 401);
  });

  it("hall destination allowlist rejects unsafe and out-of-phase routes", async () => {
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
      const started = await start(runtime);
      const result = await request("/member/api/liff/hall-token", {
        cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
        body: { destination },
      }, runtime);
      assert.equal(result.response.status, 400, destination);
      assert.equal(result.payload.error.code, "DESTINATION_NOT_ALLOWED");
    }
  });

  it("does not log ID tokens, raw continuity, cookies, handoff values, or raw sub", async () => {
    const logs = [];
    console.log = (...args) => logs.push(args.join(" "));
    console.error = (...args) => logs.push(args.join(" "));
    const runtime = env();
    lineVerify({ sub: "Uprivate-line-sub" });
    const started = await request("/member/api/liff/start?t=private-signed-t", { body: { id_token: "private-id-token" } }, runtime);
    const hall = await request("/member/api/liff/hall-token", {
      cookie: cookiePair(findCookie(started.response, "__Host-mmd_liff_session")),
      body: { destination: "/public/access" },
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
    const legacyMembership = await worker.fetch(new Request("https://mmdbkk.com/sigil/member/membership", { method: "GET" }), {});
    assert.equal(legacyMembership.status, 301);
    assert.equal(new URL(legacyMembership.headers.get("location")).pathname, "/member/membership");

    for (const path of ["/member/membership", "/sigil/pay/renewal", "/pay/membership"]) {
      const response = await worker.fetch(new Request(`https://mmdbkk.com${path}`, { method: "GET" }), {});
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    }
    const dashboard = await worker.fetch(new Request("https://mmdbkk.com/member/dashboard", { method: "GET" }), {});
    assert.equal(dashboard.status, 404);
  });
});
