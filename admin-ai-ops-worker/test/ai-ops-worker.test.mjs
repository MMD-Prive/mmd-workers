import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

test("shared client script is served from one endpoint", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js"), {}, {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /javascript/);
  assert.match(await response.text(), /AI OPS/);
});

test("context requires an authenticated admin session", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcontrol-room"), {}, {});
    assert.equal(response.status, 401);
  } finally {
    globalThis.fetch = original;
  }
});

test("Create Job context returns advisory locks and missing identifiers", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true, actor: "per" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const request = new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fjobs%2Fcreate-job", { headers: { cookie: "mmd_admin_gate_v1=test" } });
    const response = await worker.fetch(request, {}, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.schema_version, "mmd_ai_ops_layer_v1");
    assert.equal(body.page.surface, "create_job");
    assert.equal(body.authority.money, "payments-worker");
    assert.equal(body.authority.entitlement, "my_mmd_entitlement_resolver_v1");
    assert.equal(body.anomalies.some((item) => item.code === "client_context_missing"), true);
    assert.equal(body.anomalies.some((item) => item.code === "model_context_missing"), true);
  } finally {
    globalThis.fetch = original;
  }
});

test("Customer Data remains explicitly HOLD", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcustomer-data", { headers: { cookie: "mmd_admin_gate_v1=test" } }), {}, {});
    const body = await response.json();
    assert.equal(body.page.surface, "customer_data_hold");
    assert.equal(body.anomalies.some((item) => item.code === "surface_hold"), true);
  } finally {
    globalThis.fetch = original;
  }
});
