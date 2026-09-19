import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./src/dashboard-worker.js";

const ADMIN_BEARER = "test_kenji_admin_bearer";
const INTERNAL_TOKEN = "test_kenji_internal_token";
const CONFIRM_KEY = "test_kenji_confirm_key";
const BASE_ENV = {
  ADMIN_BEARER,
  INTERNAL_TOKEN,
  CONFIRM_KEY,
  ALLOWED_ORIGINS: "https://mmdbkk.com,https://www.mmdbkk.com",
};

function request(path, init = {}, env = BASE_ENV) {
  return worker.fetch(new Request(`https://mmdbkk.com${path}`, init), env, {});
}

async function jsonRequest(path, init = {}, env = BASE_ENV) {
  const response = await request(path, init, env);
  return { response, body: await response.json() };
}

function bearerHeaders() {
  return {
    Authorization: `Bearer ${ADMIN_BEARER}`,
    Origin: "https://mmdbkk.com",
  };
}

test("GET /v1/admin/auth/me rejects unauthenticated requests", async () => {
  const { response, body } = await jsonRequest("/v1/admin/auth/me", {
    headers: { Origin: "https://mmdbkk.com" },
  });

  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    ok: false,
    authenticated: false,
    error: "unauthorized",
  });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");
});

test("GET /v1/admin/auth/me reports internal admin readiness when authenticated", async () => {
  const { response, body } = await jsonRequest("/v1/admin/auth/me", {
    headers: bearerHeaders(),
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

test("HEAD /v1/admin/auth/me uses the same auth status without a body", async () => {
  const response = await request("/v1/admin/auth/me", {
    method: "HEAD",
    headers: bearerHeaders(),
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("GET /v1/internal/kenji/knowledge/published rejects unauthenticated requests", async () => {
  const { response, body } = await jsonRequest("/v1/internal/kenji/knowledge/published", {
    headers: { Origin: "https://mmdbkk.com" },
  });

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.authenticated, false);
  assert.equal(body.error, "unauthorized");
});

test("GET /v1/internal/kenji/knowledge/published returns loader-compatible cards array", async () => {
  const { response, body } = await jsonRequest("/v1/internal/kenji/knowledge/published", {
    headers: bearerHeaders(),
  });

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.source, "admin-worker");
  assert.equal(body.mode, "published_runtime_readiness");
  assert.equal(body.data_status, "readiness_only");
  assert.deepEqual(body.storage, { persisted: false, reason: "not_configured" });
  assert.deepEqual(body.cards, []);
});

test("Kenji Knowledge meta/list/draft readiness endpoints are authenticated and inert", async () => {
  const meta = await jsonRequest("/v1/admin/kenji/knowledge/meta", { headers: bearerHeaders() });
  assert.equal(meta.response.status, 200);
  assert.equal(meta.body.ok, true);
  assert.equal(meta.body.mode, "kenji_knowledge_readiness");
  assert.deepEqual(meta.body.storage, { persisted: false, reason: "not_configured" });

  const list = await jsonRequest("/v1/admin/kenji/knowledge/list", { headers: bearerHeaders() });
  assert.equal(list.response.status, 200);
  assert.equal(list.body.ok, true);
  assert.equal(list.body.mode, "kenji_knowledge_list");
  assert.equal(list.body.data_status, "no_storage");
  assert.deepEqual(list.body.storage, { persisted: false, reason: "not_configured" });
  assert.deepEqual(list.body.query, {
    q: null,
    status: null,
    lane: null,
    language: null,
    audience: null,
    sort: "updated_at",
    order: "desc",
    limit: 25,
  });
  assert.deepEqual(list.body.cards, []);
  assert.deepEqual(list.body.items, []);
  assert.equal(list.body.count, 0);
  assert.equal(list.body.total, 0);
  assert.equal(list.body.has_more, false);

  const draft = await jsonRequest("/v1/admin/kenji/knowledge/draft", {
    method: "POST",
    headers: {
      ...bearerHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ title: "Safe draft" }),
  });
  assert.equal(draft.response.status, 200);
  assert.equal(draft.body.ok, true);
  assert.equal(draft.body.draft_received, true);
  assert.deepEqual(draft.body.storage, { persisted: false, reason: "not_configured" });
});

test("Kenji Knowledge list accepts safe filter query and keeps stable empty no-storage shape", async () => {
  const { response, body } = await jsonRequest("/v1/admin/kenji/knowledge/list?q=route&status=draft&lane=client&language=th&audience=internal_only&sort=title&order=asc&limit=10", {
    headers: bearerHeaders(),
  });

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, "kenji_knowledge_list");
  assert.equal(body.data_status, "no_storage");
  assert.deepEqual(body.query, {
    q: "route",
    status: "draft",
    lane: "client",
    language: "th",
    audience: "internal_only",
    sort: "title",
    order: "asc",
    limit: 10,
  });
  assert.deepEqual(body.storage, { persisted: false, reason: "not_configured" });
  assert.deepEqual(body.cards, []);
  assert.deepEqual(body.items, []);
  assert.equal(body.count, 0);
  assert.equal(body.total, 0);
  assert.equal(body.has_more, false);
});

test("Kenji Knowledge list rejects malformed query values", async () => {
  const cases = [
    ["limit", "/v1/admin/kenji/knowledge/list?limit=0"],
    ["limit", "/v1/admin/kenji/knowledge/list?limit=101"],
    ["limit", "/v1/admin/kenji/knowledge/list?limit=abc"],
    ["order", "/v1/admin/kenji/knowledge/list?order=newest"],
    ["sort", "/v1/admin/kenji/knowledge/list?sort=rank"],
    ["status", "/v1/admin/kenji/knowledge/list?status=deleted"],
    ["lane", "/v1/admin/kenji/knowledge/list?lane=unknown"],
    ["language", "/v1/admin/kenji/knowledge/list?language=thai"],
    ["audience", "/v1/admin/kenji/knowledge/list?audience=everyone"],
    ["q", `/v1/admin/kenji/knowledge/list?q=${"x".repeat(121)}`],
  ];

  for (const [field, path] of cases) {
    const { response, body } = await jsonRequest(path, { headers: bearerHeaders() });
    assert.equal(response.status, 400, path);
    assert.equal(body.ok, false, path);
    assert.equal(body.error, "invalid_query", path);
    assert.equal(body.field, field, path);
  }
});

test("Kenji Knowledge read endpoint rejects malformed ids and returns not found for valid missing ids", async () => {
  for (const id of ["ab", "bad/id", "%2F%2Fevil.example", " space"]) {
    const { response, body } = await jsonRequest(`/v1/admin/kenji/knowledge/${id}`, { headers: bearerHeaders() });
    assert.equal(response.status, 400, id);
    assert.equal(body.ok, false, id);
    assert.equal(body.error, "invalid_id", id);
    assert.equal(body.field, "id", id);
  }

  const missing = await jsonRequest("/v1/admin/kenji/knowledge/kk_safe_001", { headers: bearerHeaders() });
  assert.equal(missing.response.status, 404);
  assert.deepEqual(missing.body, {
    ok: false,
    source: "admin-worker",
    mode: "kenji_knowledge_read",
    error: "not_found",
    code: "kenji_knowledge_not_found",
    id: "kk_safe_001",
    storage: { persisted: false, reason: "not_configured" },
  });
});

test("HEAD Kenji Knowledge list and read endpoints keep status without a body", async () => {
  const list = await request("/v1/admin/kenji/knowledge/list?limit=5", {
    method: "HEAD",
    headers: bearerHeaders(),
  });
  assert.equal(list.status, 200);
  assert.equal(await list.text(), "");

  const malformed = await request("/v1/admin/kenji/knowledge/bad/id", {
    method: "HEAD",
    headers: bearerHeaders(),
  });
  assert.equal(malformed.status, 400);
  assert.equal(await malformed.text(), "");

  const missing = await request("/v1/admin/kenji/knowledge/kk_safe_001", {
    method: "HEAD",
    headers: bearerHeaders(),
  });
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), "");
});

test("OPTIONS still returns CORS preflight success", async () => {
  const response = await request("/v1/admin/auth/me", {
    method: "OPTIONS",
    headers: {
      Origin: "https://www.mmdbkk.com",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://www.mmdbkk.com");
});

test("Kenji readiness route ownership remains exact and absent from redirect-worker", async () => {
  const [adminConfig, redirectConfig, redirectSource] = await Promise.all([
    readFile(new URL("./wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../mmd-redirect-worker/wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../mmd-redirect-worker/src/index.js", import.meta.url), "utf8"),
  ]);
  const expected = [
    "mmdbkk.com/v1/admin/auth/me",
    "www.mmdbkk.com/v1/admin/auth/me",
    "mmdbkk.com/v1/internal/kenji/knowledge/published",
    "www.mmdbkk.com/v1/internal/kenji/knowledge/published",
    "mmdbkk.com/v1/admin/kenji/knowledge/meta",
    "www.mmdbkk.com/v1/admin/kenji/knowledge/meta",
    "mmdbkk.com/v1/admin/kenji/knowledge/list",
    "www.mmdbkk.com/v1/admin/kenji/knowledge/list",
    "mmdbkk.com/v1/admin/kenji/knowledge/*",
    "www.mmdbkk.com/v1/admin/kenji/knowledge/*",
    "mmdbkk.com/v1/admin/kenji/knowledge/draft",
    "www.mmdbkk.com/v1/admin/kenji/knowledge/draft",
  ];

  for (const pattern of expected) {
    assert.equal(count(adminConfig, `pattern = "${pattern}"`), 1, pattern);
    assert.equal(count(redirectConfig, `pattern = "${pattern}"`), 0, pattern);
  }

  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/admin\/\*"/);
  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/internal\/\*"/);
  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/admin\/kenji\/\*"/);
  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/\*"/);
  assert.doesNotMatch(redirectConfig, /v1\/admin\/auth\/me|v1\/internal\/kenji\/knowledge\/published/);
  assert.doesNotMatch(redirectSource, /v1\/admin\/auth\/me|v1\/internal\/kenji\/knowledge\/published/);
});

function count(value, needle) {
  return value.split(needle).length - 1;
}
