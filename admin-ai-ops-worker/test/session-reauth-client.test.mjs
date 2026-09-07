import assert from "node:assert/strict";
import test from "node:test";
import gate from "../src/gate.js";

test("shared AI Ops client turns context 401 into a Back Office reauth action", async () => {
  const response = await gate.fetch(
    new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js?v=4"),
    {},
    {},
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-ai-ops-session-ux"), "reauth-v1");
  const source = await response.text();
  assert.match(source, /data-mmd-aiops-reauth/);
  assert.match(source, /Back Office session หมดอายุหรือยังไม่ได้ยืนยัน/);
  assert.match(source, /\/internal\/admin\/login\?next=/);
  assert.match(source, /r\.status===401/);
});

test("context still fails closed without an authenticated admin session", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ ok: false, authenticated: false, error: "unauthorized" }),
    { status: 401, headers: { "content-type": "application/json" } },
  );

  try {
    const response = await gate.fetch(
      new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fdashboard"),
      {},
      {},
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" });
  } finally {
    globalThis.fetch = original;
  }
});
