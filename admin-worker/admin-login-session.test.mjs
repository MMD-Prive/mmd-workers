import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./src/dashboard-worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const LOGIN = "/internal/admin/login";
const SIGIL_LOGIN = "/sigil/internal/admin/login";
const SESSION = "/internal/admin/login/session";
const KENJI = "/internal/admin/kenji-knowledge";
const LEGACY_SIGIL_KENJI = "/sigil/internal/admin/kenji-knowledge";
const ENV = {
  ADMIN_LOGIN_CREDENTIAL: "focused_admin_login_test_credential",
  ADMIN_SESSION_SECRET: "focused_admin_session_secret",
  ADMIN_BEARER: "focused_admin_api_bearer",
  INTERNAL_TOKEN: "focused_admin_login_test_internal_token",
  CONFIRM_KEY: "focused_admin_login_test_confirm_key",
  ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
};

function request(path, init = {}, host = "mmdbkk.com", env = ENV) {
  return worker.fetch(new Request(`https://${host}${path}`, init), env, {});
}

function login(
  credential = ENV.ADMIN_LOGIN_CREDENTIAL,
  {
    host = "mmdbkk.com",
    next = KENJI,
    origin = `https://${host}`,
    contentType = "application/x-www-form-urlencoded",
    secFetchSite,
    env = ENV,
  } = {}
) {
  const headers = { "Content-Type": contentType };
  if (origin !== null) headers.Origin = origin;
  if (secFetchSite !== undefined) headers["Sec-Fetch-Site"] = secFetchSite;

  return request(SESSION, {
    method: "POST",
    headers,
    body: new URLSearchParams({ credential, next }).toString(),
  }, host, env);
}

function cookiePair(response) {
  return (response.headers.get("set-cookie") || "").split(";", 1)[0];
}

function cookieValue(cookie) {
  return decodeURIComponent(String(cookie || "").split("=", 2)[1] || "");
}

test("SIGIL login is served by admin-worker while using the canonical session endpoint", async () => {
  const response = await request(SIGIL_LOGIN);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker");
  assert.match(html, /form method="post" action="\/internal\/admin\/login\/session"/);
});

function decodeCookiePayload(cookie) {
  const [payloadPart] = cookieValue(cookie).split(".");
  return JSON.parse(base64UrlDecode(payloadPart));
}

async function withOriginFetchMock(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("GET login renders a safe server-side POST form", async () => {
  const response = await request(`${LOGIN}?next=${encodeURIComponent(KENJI)}`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/html\b/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.match(response.headers.get("content-security-policy") || "", /connect-src 'self'/);
  assert.match(response.headers.get("content-security-policy") || "", /form-action 'self'/);
  assert.match(html, /<title>MMD Privé · Internal Login<\/title>/);
  assert.match(html, /data-mmd-page="admin-login-approved-hero"/);
  assert.match(html, /Enter the/);
  assert.match(html, /Internal Admin Chang Ewvon/);
  assert.match(html, /rel="icon" type="image\/png"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /mmd-login21/);
  assert.match(html, /method="post"/);
  assert.match(html, /action="\/internal\/admin\/login\/session"/);
  assert.match(html, /data-mmd-login-form/);
  assert.match(html, /fetch\(form\.action/);
  assert.match(html, /name="credential"/);
  assert.match(html, /name="next" value="\/internal\/admin\/kenji-knowledge"/);
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /MMD Admin Sign In/);
  assert.doesNotMatch(html, /admin-worker\.malemodel-bkk\.workers\.dev/);
  assert.doesNotMatch(html, /mmdprive\.webflow\.io\/internal\/admin\/login/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|Internal access\.|sigil-internal-login/);
  assert.doesNotMatch(html, /access_code|\/v1\/admin\/auth\/login|\/kenji\/access-code\/validate/);
});

test("apex and www query-bearing login pages render without redirecting", async () => {
  for (const host of ["mmdbkk.com", "www.mmdbkk.com"]) {
    const path = `${LOGIN}?next=${encodeURIComponent(`${KENJI}?source=query-login`)}`;
    const response = await request(path, {}, host);
    const html = await response.text();

    assert.equal(response.status, 200, host);
    assert.equal(response.headers.get("location"), null, host);
    assert.match(html, /action="\/internal\/admin\/login\/session"/, host);
    assert.match(html, /name="next" value="\/internal\/admin\/kenji-knowledge\?source=query-login"/, host);
  }
});

test("query login sanitizes external, protocol-relative, and unapproved next values", async () => {
  for (const next of ["https://evil.example/steal", "//evil.example/steal", "/unapproved"]) {
    const response = await request(`${LOGIN}?next=${encodeURIComponent(next)}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /name="next" value="\/internal\/admin\/kenji-knowledge"/);
    assert.equal(html.includes("evil.example"), false);
    assert.equal(html.includes("/unapproved"), false);
  }
});

test("HEAD query login returns login headers with an empty body", async () => {
  const response = await request(`${LOGIN}?next=${encodeURIComponent(KENJI)}`, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/html\b/);
  assert.equal(await response.text(), "");
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
    assert.equal(logs.flat().join(" ").includes(ENV.ADMIN_LOGIN_CREDENTIAL), false);
    assert.equal(logs.flat().join(" ").includes(ENV.ADMIN_BEARER), false);
    assert.equal(header.includes(ENV.ADMIN_LOGIN_CREDENTIAL), false);
    assert.equal(header.includes(ENV.ADMIN_SESSION_SECRET), false);
    assert.equal(header.includes(ENV.ADMIN_BEARER), false);
    assert.equal(header.includes(ENV.INTERNAL_TOKEN), false);
    assert.equal(header.includes(ENV.CONFIRM_KEY), false);
    assert.equal(header.includes("focused_admin_login_test_credential"), false);
    const payload = decodeCookiePayload(cookiePair(first));
    assert.deepEqual(Object.keys(payload).sort(), ["auth_method", "exp", "host", "iat", "nonce", "scope", "version"]);
    assert.equal(payload.version, 2);
    assert.equal(payload.scope, "internal_admin");
    assert.equal(payload.host, "https://mmdbkk.com");
    assert.equal(JSON.stringify(payload).includes(ENV.ADMIN_LOGIN_CREDENTIAL), false);
    assert.equal(JSON.stringify(payload).includes(ENV.ADMIN_SESSION_SECRET), false);
    assert.equal(JSON.stringify(payload).includes(ENV.ADMIN_BEARER), false);
    assert.equal(JSON.stringify(payload).includes(ENV.INTERNAL_TOKEN), false);
    assert.equal(JSON.stringify(payload).includes(ENV.CONFIRM_KEY), false);
    assert.notEqual(cookiePair(first), "");
    assert.notEqual(cookiePair(second), "");
    assert.notEqual(cookiePair(first), cookiePair(second));
  } finally {
    console.log = originalLog;
  }
});

test("missing-origin browser posts are accepted only with safe fetch metadata and allowed host", async () => {
  for (const secFetchSite of [undefined, "same-origin", "none"]) {
    const accepted = await login(ENV.ADMIN_LOGIN_CREDENTIAL, {
      origin: null,
      secFetchSite,
    });
    assert.equal(accepted.status, 303, `Sec-Fetch-Site ${secFetchSite || "absent"}`);
    assert.match(accepted.headers.get("set-cookie") || "", /^mmd_admin_gate_v1=/);
  }

  for (const secFetchSite of ["cross-site", "same-site"]) {
    const rejected = await login(ENV.ADMIN_LOGIN_CREDENTIAL, {
      origin: null,
      secFetchSite,
    });
    assert.equal(rejected.status, 403, `Sec-Fetch-Site ${secFetchSite}`);
    assert.equal(rejected.headers.get("set-cookie"), null);
    assert.match(await rejected.text(), /Unable to sign in\./);
  }

  const disallowedHost = await login(ENV.ADMIN_LOGIN_CREDENTIAL, {
    host: "evil.example",
    origin: null,
    secFetchSite: "same-origin",
  });
  assert.equal(disallowedHost.status, 403);
  assert.equal(disallowedHost.headers.get("set-cookie"), null);
});

test("dedicated login credential is isolated from API bearer credentials", async () => {
  const dedicatedCredential = "focused_dedicated_admin_login_credential";
  const env = { ...ENV, ADMIN_LOGIN_CREDENTIAL: dedicatedCredential };

  const valid = await login(dedicatedCredential, { env });
  assert.equal(valid.status, 303);
  assert.match(valid.headers.get("set-cookie") || "", /^mmd_admin_gate_v1=/);

  for (const credential of [ENV.ADMIN_BEARER, ENV.INTERNAL_TOKEN, ENV.CONFIRM_KEY]) {
    const rejected = await login(credential, { env });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get("set-cookie"), null);
  }
});

test("dedicated admin session secret rejects cookies signed by the legacy bearer", async () => {
  const env = {
    ...ENV,
    ADMIN_LOGIN_CREDENTIAL: "focused_dedicated_admin_login_credential",
    ADMIN_SESSION_SECRET: "focused_dedicated_admin_session_secret",
  };
  const issued = await login(env.ADMIN_LOGIN_CREDENTIAL, { env });
  const valid = await request("/v1/admin/auth/me", {
    headers: { Origin: "https://mmdbkk.com", Cookie: cookiePair(issued) },
  }, "mmdbkk.com", env);
  assert.equal(valid.status, 200);

  const legacyCookie = await sessionCookie({}, ENV.ADMIN_BEARER);
  const rejected = await request("/v1/admin/auth/me", {
    headers: { Origin: "https://mmdbkk.com", Cookie: legacyCookie },
  }, "mmdbkk.com", env);
  assert.equal(rejected.status, 401);
});

test("missing admin login credential no longer falls back to API bearer credentials", async () => {
  const { ADMIN_LOGIN_CREDENTIAL: _credential, ...env } = ENV;

  for (const credential of [ENV.ADMIN_BEARER, ENV.INTERNAL_TOKEN, ENV.CONFIRM_KEY]) {
    const rejected = await login(credential, { env });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get("set-cookie"), null);
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

test("issued apex cookie authenticates dashboard wrapper entrypoint", async () => {
  const response = await login();
  const Cookie = cookiePair(response);
  const dashboard = await request("/v1/admin/dashboard", {
    headers: { Origin: "https://mmdbkk.com", Cookie },
  });
  const body = await dashboard.json();

  assert.equal(dashboard.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.source, "admin-worker");
});

test("invalid, empty, malformed, and cross-origin login never set a cookie", async () => {
  const cases = [
    await login("invalid"),
    await login(""),
    await login(ENV.ADMIN_LOGIN_CREDENTIAL, { contentType: "application/json" }),
    await login(ENV.ADMIN_LOGIN_CREDENTIAL, { origin: "https://evil.example" }),
  ];

  for (const response of cases) {
    assert.ok([400, 401, 403].includes(response.status));
    assert.equal(response.headers.get("set-cookie"), null);
    const body = await response.text();
    assert.match(body, /Unable to sign in\./);
    assert.equal(body.includes(ENV.ADMIN_LOGIN_CREDENTIAL), false);
    assert.equal(body.includes(ENV.ADMIN_SESSION_SECRET), false);
    assert.equal(body.includes(ENV.ADMIN_BEARER), false);
    assert.equal(body.includes(ENV.CONFIRM_KEY), false);
  }
});

test("expired, future, tampered payload, and tampered signature cookies are rejected", async () => {
  const now = Date.now();
  const valid = cookiePair(await login());
  const expired = await sessionCookie({ iat: now - (9 * 60 * 60 * 1000), exp: now - 1000 });
  const future = await sessionCookie({ iat: now + 60_000, exp: now + ADMIN_GATE_TTL_MS });
  const tamperedPayload = tamperCookiePayload(valid, { host: "https://www.mmdbkk.com" });
  const tamperedSignature = tamperCookieSignature(valid);

  for (const Cookie of [expired, future, tamperedPayload, tamperedSignature]) {
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

  const wwwCookie = cookiePair(await login(ENV.ADMIN_LOGIN_CREDENTIAL, { host: "www.mmdbkk.com" }));
  const wwwMe = await request("/v1/admin/auth/me", {
    headers: { Origin: "https://www.mmdbkk.com", Cookie: wwwCookie },
  }, "www.mmdbkk.com");
  assert.equal(wwwMe.status, 200);

  const wwwOnApex = await request("/v1/admin/auth/me", {
    headers: { Origin: "https://mmdbkk.com", Cookie: wwwCookie },
  });
  assert.equal(wwwOnApex.status, 401);
});

test("direct workers.dev auth/me rejects public-host cookies and forwarded-host markers", async () => {
  const Cookie = cookiePair(await login());
  const response = await request("/v1/admin/auth/me", {
    headers: {
      Origin: "https://mmdbkk.com",
      Cookie,
      "X-Forwarded-Host": "mmdbkk.com",
      "X-MMD-Public-Origin": "https://mmdbkk.com",
    },
  }, "admin-worker.malemodel-bkk.workers.dev");

  assert.equal(response.status, 401);
  assert.equal((await response.json()).authenticated, false);
});

test("next redirects are allowlisted and external targets fall back to canonical", async () => {
  const allowedTargets = [
    `${KENJI}?source=login`,
    LEGACY_SIGIL_KENJI,
    "/internal/admin/control-room",
    "/internal/admin/control-room?tab=line-inbox",
    "/internal/admin/control-room/sessions/live?filter=open",
    "/internal/admin/create-session",
    "/internal/admin/jobs/create-session",
    "/internal/jobs/create-job?session=sess_public_safe",
  ];
  for (const next of allowedTargets) {
    const allowed = await login(ENV.ADMIN_LOGIN_CREDENTIAL, { next });
    assert.equal(allowed.headers.get("location"), next === LEGACY_SIGIL_KENJI ? KENJI : next);
  }

  for (const next of [
    "https://evil.example/steal",
    "//evil.example/steal",
    "/unapproved",
    "/internal/admin/unknown",
    "/sigil/internal/admin/unknown",
    "/%2F%2Fevil.example/steal",
    "/internal/admin/control-room/../unknown",
    "/internal/admin/control-room/%2e%2e/unknown",
    "/internal/admin/control-room?token=secret",
    "/internal/jobs/create-job?credential=secret",
  ]) {
    const response = await login(ENV.ADMIN_LOGIN_CREDENTIAL, { next });
    assert.equal(response.headers.get("location"), KENJI);
  }
});

test("existing bearer and confirm-key auth still work without a cookie", async () => {
  const bearer = await request("/v1/admin/auth/me", {
    headers: { Origin: "https://mmdbkk.com", Authorization: `Bearer ${ENV.INTERNAL_TOKEN}` },
  });
  assert.equal(bearer.status, 200);

  const confirmKey = await request("/v1/admin/auth/me", {
    headers: { Origin: "https://mmdbkk.com", "X-Confirm-Key": ENV.CONFIRM_KEY },
  });
  assert.equal(confirmKey.status, 200);
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

test("exact session endpoint never passes through and keeps method behavior", async () => {
  let calls = 0;
  await withOriginFetchMock(async () => {
    calls += 1;
    return new Response("unexpected-origin");
  }, async () => {
    const post = await login();
    assert.equal(post.status, 303);
    assert.match(post.headers.get("set-cookie") || "", /^mmd_admin_gate_v1=/);

    const remove = await request(SESSION, {
      method: "DELETE",
      headers: { Origin: "https://mmdbkk.com" },
    });
    assert.equal(remove.status, 303);
    assert.match(remove.headers.get("set-cookie") || "", /Max-Age=0/);

    const get = await request(SESSION);
    assert.equal(get.status, 405);
    assert.equal((await get.json()).error, "method_not_allowed");
  });
  assert.equal(calls, 0);
});

test("captured login suffixes fail closed without origin/Webflow fallback", async () => {
  const cases = [
    ["mmdbkk.com", `${LOGIN}-other?source=apex`],
    ["mmdbkk.com", `${LOGIN}/foo?source=slash`],
    ["mmdbkk.com", `${SESSION}-extra?source=session-suffix`],
    ["www.mmdbkk.com", `${LOGIN}-other?source=www`],
  ];

  for (const [host, path] of cases) {
    let calls = 0;
    const requestBody = JSON.stringify({ safe: true });
    const response = await withOriginFetchMock(async (incoming) => {
      calls += 1;
      return new Response("unexpected-origin");
    }, () => request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-safe-test": "preserved" },
      body: requestBody,
    }, host));

    assert.equal(calls, 0, path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("set-cookie"), null, path);
    assert.equal(response.headers.get("x-mmd-route-owner"), null, path);
    assert.equal(response.headers.get("x-mmd-page"), null, path);
    assert.equal((await response.json()).error, "admin_route_not_found", path);
  }
});

test("login ownership routes are query-safe, narrow, unique, and absent from other workers", async () => {
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
  for (const pattern of [
    "mmdbkk.com/internal/admin/login*",
    "www.mmdbkk.com/internal/admin/login*",
  ]) {
    assert.equal(count(admin, `pattern = "${pattern}"`), 1, pattern);
    assert.equal(count(redirect, `pattern = "${pattern}"`), 0, pattern);
    assert.equal(count(immigrate, `pattern = "${pattern}"`), 0, pattern);
  }
  assert.doesNotMatch(admin, /pattern = "(?:www\.)?mmdbkk\.com\/internal\/admin\/\*"/);
  assert.doesNotMatch(admin, /pattern = "(?:www\.)?mmdbkk\.com\/internal\/admin\*"/);
  assert.doesNotMatch(admin, /pattern = "(?:www\.)?mmdbkk\.com\/internal\/admin\/login\/session\*"/);
});

const ADMIN_GATE_TTL_MS = 8 * 60 * 60 * 1000;

async function sessionCookie(overrides = {}, secret = adminSessionSigningSecret()) {
  const now = Date.now();
  const session = {
    version: 2,
    scope: "internal_admin",
    host: "https://mmdbkk.com",
    iat: now,
    exp: now + ADMIN_GATE_TTL_MS,
    nonce: crypto.randomUUID(),
    auth_method: "bearer",
    ...overrides,
  };
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = await signPayload(payload, secret);
  return `mmd_admin_gate_v1=${encodeURIComponent(`${payload}.${signature}`)}`;
}

function tamperCookiePayload(cookie, patch) {
  const [payloadPart, signaturePart] = cookieValue(cookie).split(".");
  const payload = JSON.parse(base64UrlDecode(payloadPart));
  const tampered = base64UrlEncode(JSON.stringify({ ...payload, ...patch }));
  return `mmd_admin_gate_v1=${encodeURIComponent(`${tampered}.${signaturePart}`)}`;
}

function tamperCookieSignature(cookie) {
  const [payloadPart, signaturePart] = cookieValue(cookie).split(".");
  const replacement = signaturePart.endsWith("A") ? "B" : "A";
  return `mmd_admin_gate_v1=${encodeURIComponent(`${payloadPart}.${signaturePart.slice(0, -1)}${replacement}`)}`;
}

function adminSessionSigningSecret(env = ENV) {
  return `${env.ADMIN_SESSION_SECRET}.${env.ADMIN_LOGIN_CREDENTIAL}`;
}

async function signPayload(payload, secret = adminSessionSigningSecret()) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function count(value, needle) {
  return value.split(needle).length - 1;
}
