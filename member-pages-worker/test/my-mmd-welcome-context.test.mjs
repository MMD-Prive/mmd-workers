import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";
import { handleMyMmdWelcomeContext } from "../src/my-mmd-canonical-entitlement-bridge.js";

const SECRET = "welcome-context-test-secret-0123456789-abcdef";
const TOKEN = "verified-welcome-session-token";
const LINE_ID = `U${"a".repeat(32)}`;

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeEnv({ entitlement = true, resolverFails = false } = {}) {
  const sessionKey = `liff:session:${await hmacHex(SECRET, `session:${TOKEN}`)}`;
  const writes = [];
  const resolverCalls = [];
  return {
    writes,
    resolverCalls,
    env: {
      LIFF_SESSION_SECRET: SECRET,
      LIFF_IDENTITY_KV: {
        async get(key, format) {
          assert.equal(key, sessionKey);
          assert.equal(format, "json");
          return { line_user_id: LINE_ID, expires_at: Date.now() + 60_000, member_exists: true };
        },
        async put(...args) { writes.push(args); },
      },
      MEMBER_STATUS_RESOLVER_SECRET: SECRET,
      MEMBER_STATUS_RESOLVER: {
        async fetch(request) {
          resolverCalls.push(request);
          if (resolverFails) return new Response("unavailable", { status: 503 });
          return Response.json({ ok: true, data: {
            member_exists: true, member_id: "recCanonicalMember",
            profile: { membership_status: "active", display_name: "not returned" },
            entitlement_snapshot: entitlement ? {
              schema_version: "my_mmd_entitlement_resolver_v1", source_status: "verified", fail_closed: true, member_blocked: false,
              access: { public_service_access: true, protected_capabilities_active: ["vip"], protected_capabilities_grace: [] },
              entitlements: [{ capability: "vip", lifecycle: "active", start_at: "2026-09-01", expire_at: "2027-09-01", package_code: "vip_1y" }],
            } : {
              schema_version: "my_mmd_entitlement_resolver_v1", source_status: "verified", fail_closed: true, member_blocked: false,
              access: { public_service_access: true, protected_capabilities_active: [], protected_capabilities_grace: [] }, entitlements: [],
            },
          } });
        },
      },
    },
    cookie: `__Host-mmd_liff_session=${TOKEN}`,
  };
}

test("welcome context returns only resolver-proven active Private eligibility without side effects", async () => {
  const fixture = await makeEnv();
  const request = new Request("https://mmdbkk.com/member/api/liff/welcome-context", { headers: { cookie: fixture.cookie, origin: "https://mmdbkk.com" } });
  const response = await worker.fetch(request, fixture.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, data: { tier: "VIP", membership_status: "active" } });
  assert.equal(response.headers.get("x-mmd-member-display-authority"), "my_mmd_entitlement_resolver_v1");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(fixture.resolverCalls.length, 1);
  assert.equal(fixture.resolverCalls[0].method, "POST");
  assert.deepEqual(fixture.writes, []);
  assert.doesNotMatch(JSON.stringify(payload), /LINE|line_user|display_name|member_id|entitlement_snapshot/);
});

test("missing protected entitlement and missing session remain Public", async () => {
  const fixture = await makeEnv({ entitlement: false });
  const response = await handleMyMmdWelcomeContext(new Request("https://mmdbkk.com/member/api/liff/welcome-context", { headers: { cookie: fixture.cookie } }), fixture.env);
  const payload = await response.json();
  assert.deepEqual(payload, { ok: true, data: { tier: "", membership_status: "" } });
  assert.equal(response.headers.get("x-mmd-member-display-authority"), null);

  const anonymous = await handleMyMmdWelcomeContext(new Request("https://mmdbkk.com/member/api/liff/welcome-context"), fixture.env);
  assert.equal(anonymous.status, 200);
  assert.deepEqual(await anonymous.json(), { ok: true, data: { tier: "", membership_status: "" } });
});

test("invalid request shape, cross-origin request and unavailable resolver fail closed", async () => {
  const fixture = await makeEnv({ resolverFails: true });
  const wrongOrigin = await handleMyMmdWelcomeContext(new Request("https://mmdbkk.com/member/api/liff/welcome-context", { headers: { origin: "https://attacker.example", cookie: fixture.cookie } }), fixture.env);
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await wrongOrigin.json()).data, undefined);

  const claimedWorld = await handleMyMmdWelcomeContext(new Request("https://mmdbkk.com/member/api/liff/welcome-context?world=private", { headers: { cookie: fixture.cookie } }), fixture.env);
  assert.equal(claimedWorld.status, 400);

  const unavailable = await handleMyMmdWelcomeContext(new Request("https://mmdbkk.com/member/api/liff/welcome-context", { headers: { cookie: fixture.cookie } }), fixture.env);
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).state, "public");
  assert.deepEqual(fixture.writes, []);
});
