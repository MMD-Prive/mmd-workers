import assert from "node:assert/strict";
import test from "node:test";
import gate from "../src/gate.js";

test("shared AI Ops client supports CEO and no longer self-blocks on script marker", async () => {
  const response = await gate.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js?v=2"), {}, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-ai-ops-client"), "v2-ceo-bridge");
  const source = await response.text();
  assert.match(source, /p==='\/internal\/ceo'/);
  assert.match(source, /data-mmd-ai-ops-ui/);
  assert.doesNotMatch(source, /document\.querySelector\('\[data-mmd-ai-ops\]'\)/);
});

test("CEO context is canonical and reads admin dashboard worker", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") {
      return new Response(JSON.stringify({ ok: true, authenticated: true, actor: "per" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/v1/admin/dashboard") {
      return new Response(JSON.stringify({
        ok: true,
        source: "admin-worker",
        focus: { title: "ตรวจเงินก่อน", text: "มีรายการรอตรวจ 2 รายการ" },
        counts: { urgent: 2, payments: 2, jobs: 1, members: 0 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const request = new Request(
      "https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fceo",
      { headers: { cookie: "mmd_admin_gate_v1=test" } },
    );
    const response = await gate.fetch(request, {}, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.page.surface, "ceo");
    assert.equal(body.page.canonical, true);
    assert.equal(body.sources[0].route, "/v1/admin/dashboard");
    assert.equal(body.sources[0].ok, true);
    assert.match(body.brief[0], /ตรวจเงินก่อน/);
    assert.equal(body.authority.money, "payments-worker");
  } finally {
    globalThis.fetch = original;
  }
});
