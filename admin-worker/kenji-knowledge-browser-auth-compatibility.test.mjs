import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./src/dashboard-worker.js";

const ADMIN_BEARER = "test_browser_admin_bearer";
const CONFIRM_KEY = "test_browser_confirm_key";
const BASE_ENV = {
  ADMIN_BEARER,
  CONFIRM_KEY,
  ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
};
const ADMIN_COOKIE_NAME = "mmd_admin_gate_v1";

function request(path, init = {}, env = BASE_ENV, host = "mmdbkk.com") {
  return worker.fetch(new Request(`https://${host}${path}`, init), env, {});
}

async function jsonRequest(path, init = {}, env = BASE_ENV, host = "mmdbkk.com") {
  const response = await request(path, init, env, host);
  return { response, body: await response.json() };
}

function adminGateCookie(overrides = {}) {
  const session = {
    ok: true,
    at: Date.now(),
    baseUrl: "https://mmdbkk.com",
    bearer: ADMIN_BEARER,
    ...overrides,
  };
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(btoa(JSON.stringify(session)))}`;
}

function cookieHeaders({ origin = "https://mmdbkk.com", cookie = adminGateCookie(), contentType = false } = {}) {
  return {
    Origin: origin,
    Cookie: cookie,
    ...(contentType ? { "content-type": "application/json" } : {}),
  };
}

test("no browser auth returns 401", async () => {
  const { response, body } = await jsonRequest("/v1/admin/auth/me", {
    headers: { Origin: "https://mmdbkk.com" },
  });

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.authenticated, false);
  assert.equal(body.error, "unauthorized");
});

test("valid HttpOnly admin gate cookie is browser-compatible auth", async () => {
  const { response, body } = await jsonRequest("/v1/admin/auth/me", {
    headers: cookieHeaders(),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    ok: true,
    authenticated: true,
    worker: "admin-worker",
    scope: "internal_admin",
    source: "admin-worker",
  });
});

test("invalid and expired admin gate cookies return 401", async () => {
  const invalid = await jsonRequest("/v1/admin/auth/me", {
    headers: cookieHeaders({ cookie: adminGateCookie({ bearer: "wrong" }) }),
  });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.body.error, "unauthorized");

  const expired = await jsonRequest("/v1/admin/auth/me", {
    headers: cookieHeaders({ cookie: adminGateCookie({ at: Date.now() - 9 * 60 * 60 * 1000 }) }),
  });
  assert.equal(expired.response.status, 401);
  assert.equal(expired.body.error, "unauthorized");
});

test("apex and www origins accept their separately host-bound browser cookies", async () => {
  const apex = await jsonRequest("/v1/admin/auth/me", {
    headers: cookieHeaders({ origin: "https://mmdbkk.com" }),
  });
  assert.equal(apex.response.status, 200);
  assert.equal(apex.response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");

  const www = await jsonRequest("/v1/admin/auth/me", {
    headers: cookieHeaders({
      origin: "https://www.mmdbkk.com",
      cookie: adminGateCookie({ baseUrl: "https://www.mmdbkk.com" }),
    }),
  }, BASE_ENV, "www.mmdbkk.com");
  assert.equal(www.response.status, 200);
  assert.equal(www.response.headers.get("access-control-allow-origin"), "https://www.mmdbkk.com");
});

test("unapproved origin returns 403 before auth data", async () => {
  const { response, body } = await jsonRequest("/v1/admin/auth/me", {
    headers: cookieHeaders({ origin: "https://evil.example" }),
  });

  assert.equal(response.status, 403);
  assert.equal(body.ok, false);
  assert.equal(body.error, "origin_not_allowed");
});

test("OPTIONS returns 204 for browser preflight", async () => {
  const response = await request("/v1/admin/auth/me", {
    method: "OPTIONS",
    headers: {
      Origin: "https://www.mmdbkk.com",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://www.mmdbkk.com");
  assert.match(response.headers.get("access-control-allow-methods") || "", /\bGET\b/);
});

test("HEAD enforces browser auth and returns an empty body", async () => {
  const authed = await request("/v1/admin/auth/me", {
    method: "HEAD",
    headers: cookieHeaders(),
  });
  assert.equal(authed.status, 200);
  assert.equal(await authed.text(), "");

  const unauth = await request("/v1/admin/auth/me", {
    method: "HEAD",
    headers: { Origin: "https://mmdbkk.com" },
  });
  assert.equal(unauth.status, 401);
  assert.equal(await unauth.text(), "");
});

test("published endpoint uses the same browser auth contract and readiness schema", async () => {
  const { response, body } = await jsonRequest("/v1/internal/kenji/knowledge/published", {
    headers: cookieHeaders(),
  });

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.source, "admin-worker");
  assert.equal(body.mode, "published_runtime_readiness");
  assert.equal(body.data_status, "readiness_only");
  assert.deepEqual(body.storage, { persisted: false, reason: "not_configured" });
  assert.deepEqual(body.cards, []);
});

test("draft POST uses the same browser auth contract and remains inert", async () => {
  const { response, body } = await jsonRequest("/v1/admin/kenji/knowledge/draft", {
    method: "POST",
    headers: cookieHeaders({ contentType: true }),
    body: JSON.stringify({ title: "Browser draft" }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.draft_received, true);
  assert.deepEqual(body.storage, { persisted: false, reason: "not_configured" });
});

test("responses do not expose browser cookie or server secrets", async () => {
  const { body } = await jsonRequest("/v1/admin/auth/me", {
    headers: cookieHeaders(),
  });
  const serialized = JSON.stringify(body);

  assert.equal(serialized.includes(ADMIN_BEARER), false);
  assert.equal(serialized.includes(CONFIRM_KEY), false);
  assert.equal(serialized.includes(ADMIN_COOKIE_NAME), false);
});

test("no broad routes are added for browser auth compatibility", async () => {
  const adminConfig = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");

  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/admin\/\*"/);
  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/internal\/\*"/);
  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/\*"/);
});
