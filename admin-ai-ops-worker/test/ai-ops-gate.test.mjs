import assert from "node:assert/strict";
import test from "node:test";
import gate from "../src/gate.js";

const contextUrl = "https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcontrol-room";

test("strict gate rejects non-JSON or ambiguous auth responses", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } });
  try {
    const response = await gate.fetch(new Request(contextUrl), {}, {});
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" });
  } finally {
    globalThis.fetch = original;
  }
});

test("strict gate rejects ok response without authenticated=true", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, authenticated: false }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await gate.fetch(new Request(contextUrl), {}, {});
    assert.equal(response.status, 401);
  } finally {
    globalThis.fetch = original;
  }
});

test("shared client remains readable without admin context data", async () => {
  const response = await gate.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js"), {}, {});
  assert.equal(response.status, 200);
  assert.match(await response.text(), /AI OPS/);
});
