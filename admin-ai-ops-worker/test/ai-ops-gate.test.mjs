import assert from "node:assert/strict";
import test from "node:test";
import gate from "../src/gate.js";

const contextUrl = "https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcontrol-room";
const followUpUrl = "https://mmdbkk.com/v1/admin/ai-ops/follow-ups";
const commandCenterUrl = "https://mmdbkk.com/v1/admin/ai-ops/command-center";

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

test("strict gate now covers command center and durable follow-up endpoints too", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, authenticated: false }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const followUp = await gate.fetch(new Request(followUpUrl), {}, {});
    const commandCenter = await gate.fetch(new Request(commandCenterUrl), {}, {});
    assert.equal(followUp.status, 401);
    assert.equal(commandCenter.status, 401);
  } finally {
    globalThis.fetch = original;
  }
});

test("shared client remains readable without admin context data", async () => {
  const response = await gate.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js"), {}, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-follow-up-autopilot"), "p1");
  const body = await response.text();
  assert.match(body, /AI OPS/);
  assert.match(body, /WATCHING · AUTOPILOT/);
});
