import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker, { MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH } from "./src/admin-login-hero-worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const ORIGIN = "https://mmdbkk.com";
const SESSION_PATH = "/internal/admin/login/session";
const ENV_SECRET = "focused-resolver-diagnostic-admin-session-secret";
const LOGIN_CREDENTIAL = "focused-resolver-diagnostic-login-credential";

function rpc(result = "healthy_zero_match") {
  const calls = [];
  return {
    calls,
    async runMemberResolverDiagnostic(...args) {
      calls.push(args);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function env(resolverRpc = rpc()) {
  return {
    ADMIN_LOGIN_CREDENTIAL: LOGIN_CREDENTIAL,
    ADMIN_SESSION_SECRET: ENV_SECRET,
    ALLOWED_ORIGINS: `${ORIGIN},https://www.mmdbkk.com`,
    MEMBER_PAGES_RESOLVER_DIAGNOSTIC: resolverRpc,
  };
}

function request(path = MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH, init = {}, environment = env()) {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init), environment, {});
}

async function login(environment = env()) {
  const response = await request(SESSION_PATH, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ credential: LOGIN_CREDENTIAL, next: "/internal/admin/control-room" }).toString(),
  }, environment);
  return (response.headers.get("set-cookie") || "").split(";", 1)[0];
}

async function signedCookie(overrides = {}) {
  const now = Date.now();
  const payload = {
    version: 1,
    scope: "internal_admin",
    host: ORIGIN,
    iat: now,
    exp: now + 60_000,
    nonce: "resolver-diagnostic-test-nonce",
    auth_method: "login",
    ...overrides,
  };
  const payloadPart = base64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ENV_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart));
  return `mmd_admin_gate_v1=${encodeURIComponent(`${payloadPart}.${base64UrlBytes(new Uint8Array(signature))}`)}`;
}

function base64Url(value) {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function invoke({ Cookie = "", origin = ORIGIN, path = MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH, body } = {}, environment = env()) {
  const headers = { Origin: origin };
  if (Cookie) headers.Cookie = Cookie;
  const init = { method: "POST", headers };
  if (body !== undefined) {
    headers["Content-Type"] = "text/plain";
    init.body = body;
  }
  return request(path, init, environment);
}

test("missing and forged admin sessions return indistinguishable 404 with zero RPC calls", async () => {
  const service = rpc();
  const environment = env(service);
  for (const Cookie of ["", "mmd_admin_gate_v1=forged.payload"]) {
    const response = await invoke({ Cookie }, environment);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "");
  }
  assert.equal(service.calls.length, 0);
});

test("expired and wrong-scope signed sessions return 404 with zero RPC calls", async () => {
  const service = rpc();
  const environment = env(service);
  const now = Date.now();
  for (const Cookie of [
    await signedCookie({ iat: now - 120_000, exp: now - 60_000 }),
    await signedCookie({ scope: "customer" }),
  ]) {
    const response = await invoke({ Cookie }, environment);
    assert.equal(response.status, 404);
  }
  assert.equal(service.calls.length, 0);
});

test("wrong origin, query, or body returns 404 before RPC", async () => {
  const service = rpc();
  const environment = env(service);
  const Cookie = await login(environment);
  const cases = [
    { Cookie, origin: "https://evil.example" },
    { Cookie, path: `${MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH}?debug=1` },
    { Cookie, body: "diagnostic options are forbidden" },
  ];
  for (const input of cases) {
    const response = await invoke(input, environment);
    assert.equal(response.status, 404);
  }
  assert.equal(service.calls.length, 0);
});

test("valid signed admin session invokes the named RPC exactly once with zero arguments", async () => {
  const service = rpc("healthy_zero_match");
  const environment = env(service);
  const Cookie = await login(environment);
  const response = await invoke({ Cookie }, environment);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "healthy_zero_match");
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.deepEqual(service.calls, [[]]);
});

test("generic, malformed, and thrown RPC results remain bounded", async () => {
  for (const result of ["generic_failure", "unexpected", { result: "healthy_zero_match" }, new Error("private provider detail")]) {
    const service = rpc(result);
    const environment = env(service);
    const Cookie = await login(environment);
    const response = await invoke({ Cookie }, environment);
    const text = await response.text();

    assert.equal(response.status, 503);
    assert.equal(text, "generic_failure");
    assert.doesNotMatch(text, /private|provider|secret|sentinel|line|airtable|record/i);
    assert.deepEqual(service.calls, [[]]);
  }
});

test("diagnostic response and logs expose no session, secret, identity, or provider data", async () => {
  const logs = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args) => logs.push(args);
  console.warn = (...args) => logs.push(args);
  try {
    const service = rpc(new Error("private-provider-email@example.com-rec_private"));
    const environment = env(service);
    const Cookie = await login(environment);
    const response = await invoke({ Cookie }, environment);
    const receipt = JSON.stringify({ status: response.status, body: await response.text(), logs });
    assert.doesNotMatch(receipt, /example\.com|rec_private|focused-resolver|mmd_admin_gate|private-provider/i);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
});

test("existing GET and HEAD /internal/admin behavior remains unchanged", async () => {
  const get = await request(MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH, { method: "GET" });
  const head = await request(MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH, { method: "HEAD" });
  assert.equal(get.status, 401);
  assert.match(await get.text(), /Admin access required/);
  assert.equal(head.status, 401);
  assert.equal(await head.text(), "");
});

test("wrangler adds one named service binding and no diagnostic route or secret", async () => {
  const wrangler = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /binding = "MEMBER_PAGES_RESOLVER_DIAGNOSTIC"\s+service = "member-pages-worker"\s+entrypoint = "MemberResolverDiagnosticEntrypoint"/);
  assert.equal((wrangler.match(/binding = "MEMBER_PAGES_RESOLVER_DIAGNOSTIC"/g) || []).length, 1);
  assert.doesNotMatch(wrangler, /pattern = ".*diagnostic/i);
  assert.doesNotMatch(wrangler, /MEMBER_STATUS_RESOLVER_SECRET/);
});
