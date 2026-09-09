import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";

const BASE_ENV = {
  ADMIN_BEARER: "test_kenji_runtime_admin",
  ALLOWED_ORIGINS: "https://mmdbkk.com",
  KENJI_KNOWLEDGE_RUNTIME_V2_ENABLED: "true",
};

function request(path, init = {}, env = BASE_ENV) {
  return worker.fetch(new Request(`https://mmdbkk.com${path}`, {
    ...init,
    headers: {
      Origin: "https://mmdbkk.com",
      ...(init.headers || {}),
    },
  }), env);
}

function bearerHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${BASE_ENV.ADMIN_BEARER}`,
    ...extra,
  };
}

test("runtime gate keeps Kenji Knowledge private", async () => {
  const response = await request("/v1/admin/kenji/knowledge/list");
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "unauthorized");
});

test("enabled runtime returns reviewed static fallback instead of inert empty readiness", async () => {
  const response = await request("/v1/internal/kenji/knowledge/published", {
    headers: bearerHeaders(),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "published_runtime");
  assert.equal(body.data_status, "static_fallback");
  assert.equal(body.storage.persisted, false);
  assert.ok(body.cards.length >= 6);
  assert.equal(response.headers.get("x-mmd-kenji-knowledge"), "runtime-v1");
});

test("draft endpoint cannot silently publish", async () => {
  const response = await request("/v1/admin/kenji/knowledge/draft", {
    method: "POST",
    headers: bearerHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      knowledge_id: "kenji_admin_contract_test",
      title: "Kenji Admin contract test",
      customer_answer: "ข้อความทดสอบ",
      status: "active",
      publish: true,
      reviewed_by: "Boss Per",
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.card.status, "draft");
  assert.equal(body.card.knowledge_id, "kenji_admin_contract_test");
  assert.equal(body.record_id, null);
});

test("runtime stays inert unless the explicit feature gate is enabled", async () => {
  const response = await request("/v1/internal/kenji/knowledge/published", {
    headers: bearerHeaders(),
  }, {
    ...BASE_ENV,
    KENJI_KNOWLEDGE_RUNTIME_V2_ENABLED: "false",
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "published_runtime_readiness");
  assert.deepEqual(body.cards, []);
});
