import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./src/dashboard-worker.js";

const LOGIN = "/internal/admin/login";
const SESSION = "/internal/admin/login/session";
const KENJI = "/sigil/internal/admin/kenji-knowledge";
const ENV = {
  ADMIN_BEARER: "focused_admin_login_test_credential",
  CONFIRM_KEY: "focused_admin_login_test_confirm_key",
  ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
};

function request(path, init = {}, host = "mmdbkk.com", env = ENV) {
  return worker.fetch(new Request(`https://${host}${path}`, init), env, {});
}

function login(credential = ENV.ADMIN_BEARER, { host = "mmdbkk.com", next = KENJI, origin = `https://${host}`, contentType = "application/x-www-form-urlencoded" } = {}) {
  return request(SESSION, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": contentType },
    body: new URLSearchParams({ credential, next }).toString(),
  }, host);
}

function cookiePair(response) {
  return (response.headers.get("set-cookie") || "").split(";", 1)[0];
}

test("GET login renders a safe server-side POST form", async () => {
  const response = await request(`${LOGIN}?next=${encodeURIComponent(KENJI)}`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/html\b/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.match(response.headers.get("content-security-policy") || "", /form-action 'self'/);
  assert.match(html, /method="post"/);
  assert.match(html, /action="\/internal\/admin\/login\/session"/);
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|<script|\/private/);
});

test("valid login issues a fresh secure host-only cookie and redirects", async () => {
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args);
  try {
    const first = await login();
    const second = await login();
    const header = first.headers.get("set-cookie") || "";
    const body = await first.text();

    assert.equal(first.status, 303);
    assert.equal(first.headers.get("location"), KENJI);
    assert.match(header, /^mmd_admin_gate_v1=/);
    assert.match(header, /; Path=\//);
    assert.match(header, /; Max-Age=28800/);
    assert.match(header, /; HttpOnly/);
    assert.match(header, /; Secure/);
    assert.match(header, /; SameSite=Lax/);
    assert.doesNotMatch(header, /; Domain=/i);
    assert.equal(body, "");
    assert.equal(body.includes(cookiePair(first)), false);
    assert.equal(logs.length, 0);
    assert.equal(logs.flat().join(" ").includes(ENV.ADMIN_BEARER), false);
    assert.notEqual(cookiePair(first), "");
    assert.notEqual(cookiePair(second), "");
    assert.notEqual(cookiePair(first), cookiePair(second));
  } finally {
    console.log = originalLog;
  }
});

test("issued apex cookie authenticates auth/me and Kenji readiness APIs", async () => {
  const response = await login();
  const Cookie = cookiePair(response);
  const headers = { Origin: "https://mmdbkk.com", Cookie };

  const me = await request("/v1/admin/auth/me", { headers });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).authenticated, true);

  for (const path of ["/v1/internal/kenji/knowledge/published", "/v1/admin/kenji/knowledge/meta", "/v1/admin/kenji/knowledge/list"]) {
    const readiness = await request(path, { headers });
    assert.equal(readiness.status, 200, path);
    assert.equal((await readiness.json()).ok, true, path);
  }
});

test("invalid, empty, malformed, and cross-origin login never set a cookie", async () => {
  const cases = [
    await login("invalid"),
    await login(""),
    await login(ENV.ADMIN_BEARER, { contentType: "application/json" }),
    await login(ENV.ADMIN_BEARER, { origin: "https://evil.example" }),
  ];

  for (const response of cases) {
    assert.ok([400, 401, 403].includes(response.status));
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.text();
    assert.match(body, /Unable to sign in\./);
    assert.equal(body.includes(ENV.ADMIN_BEARER), false);
    assert.equal(body.includes(ENV.CONFIRM_KEY), false);
  }
});

test("expired, future, and tampered cookies are rejected", async () => {
  const expired = sessionCookie({ at: Date.now() - (9 * 60 * 60 * 1000) });
  const future = sessionCookie({ at: Date.now() + 60_000 });
  const tampered = sessionCookie({ bearer: "tampered" });

  for (const Cookie of [expired, future, tampered]) {
    const response = await request("/v1/admin/auth/me", {
      headers: { Origin: "https://mmdbkk.com", Cookie },
    });
    assert.equal(response.status, 401);
  }
});

test("apex and www sessions are independently host-bound", async () => {
  const apexCookie = cookiePair(await login());
  const apexOnWww = await request("/v1/admin/auth/me", {
    headers: { Origin: "https://www.mmdbkk.com", Cookie: apexCookie },
  }, "www.mmdbkk.com");
  assert.equal(apexOnWww.status, 401);

  const wwwCookie = cookiePair(await login(ENV.ADMIN_BEARER, { host: "www.mmdbkk.com" }));
  const wwwMe = await request("/v1/admin/auth/me", {
    headers: { Origin: "https://www.mmdbkk.com", Cookie: wwwCookie },
  }, "www.mmdbkk.com");
  assert.equal(wwwMe.status, 200);

  const wwwOnApex = await request("/v1/admin/auth/me", {
    headers: { Origin: "https://mmdbkk.com", Cookie: wwwCookie },
  });
  assert.equal(wwwOnApex.status, 401);
});

test("next redirects are allowlisted and external targets fall back to canonical", async () => {
  const allowed = await login(ENV.ADMIN_BEARER, { next: `${KENJI}?source=login` });
  assert.equal(allowed.headers.get("location"), `${KENJI}?source=login`);

  for (const next of ["https://evil.example/steal", "//evil.example/steal", "/unapproved"]) {
    const response = await login(ENV.ADMIN_BEARER, { next });
    assert.equal(response.headers.get("location"), KENJI);
  }
});

test("unauthorized admin root points only to the canonical login", async () => {
  const response = await request("/internal/admin");
  const html = await response.text();
  assert.equal(response.status, 401);
  assert.match(html, /href="\/internal\/admin\/login"/);
  assert.doesNotMatch(html, /\/private/);
});

test("logout expires the same host-only cookie without exposing its value", async () => {
  const response = await request(SESSION, {
    method: "DELETE",
    headers: { Origin: "https://mmdbkk.com" },
  });
  const cookie = response.headers.get("set-cookie") || "";
  assert.equal(response.status, 303);
  assert.match(cookie, /^mmd_admin_gate_v1=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test("login ownership routes are exact, unique, and not added to other workers", async () => {
  const [admin, redirect, immigrate] = await Promise.all([
    readFile(new URL("./wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../mmd-redirect-worker/wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../immigrate-worker/wrangler.toml", import.meta.url), "utf8"),
  ]);
  const patterns = [
    "mmdbkk.com/internal/admin",
    "www.mmdbkk.com/internal/admin",
    "mmdbkk.com/internal/admin/login",
    "www.mmdbkk.com/internal/admin/login",
    "mmdbkk.com/internal/admin/login/session",
    "www.mmdbkk.com/internal/admin/login/session",
  ];
  for (const pattern of patterns) {
    assert.equal(count(admin, `pattern = "${pattern}"`), 1, pattern);
    assert.equal(count(redirect, `pattern = "${pattern}"`), 0, pattern);
    assert.equal(count(immigrate, `pattern = "${pattern}"`), 0, pattern);
  }
  assert.doesNotMatch(admin, /pattern = "(?:www\.)?mmdbkk\.com\/internal\/admin\/\*"/);
});

function sessionCookie(overrides = {}) {
  const session = {
    ok: true,
    at: Date.now(),
    baseUrl: "https://mmdbkk.com",
    bearer: ENV.ADMIN_BEARER,
    ...overrides,
  };
  return `mmd_admin_gate_v1=${encodeURIComponent(btoa(JSON.stringify(session)))}`;
}

function count(value, needle) {
  return value.split(needle).length - 1;
}
