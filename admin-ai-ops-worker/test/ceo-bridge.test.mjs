import assert from "node:assert/strict";
import test from "node:test";
import gate from "../src/gate.js";

test("shared AI Ops client supports CEO, single-owner mode and no longer self-blocks", async () => {
  const response = await gate.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js?v=3"), {}, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-ai-ops-client"), "v3-single-owner");
  const source = await response.text();
  assert.match(source, /p==='\/internal\/ceo'/);
  assert.match(source, /data-mmd-ai-ops-ui/);
  assert.match(source, /PER · AI OPS/);
  assert.match(source, /PER · OWNER MODE/);
  assert.match(source, /per-single-owner-v1/);
  assert.match(source, /\/internal\/admin\/jobs\/create-job/);
  assert.doesNotMatch(source, /document\.querySelector\('\[data-mmd-ai-ops\]'\)/);
});

test("CEO context is canonical, single-owner and reads admin dashboard worker", async () => {
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
    assert.equal(response.headers.get("x-mmd-owner-mode"), "single-owner-v1");
    const body = await response.json();
    assert.equal(body.page.surface, "ceo");
    assert.equal(body.page.canonical, true);
    assert.equal(body.owner_mode.mode, "single_owner");
    assert.equal(body.owner_mode.human_operator, "Per");
    assert.equal(body.owner_mode.second_human_review_required, false);
    assert.equal(body.sources[0].route, "/v1/admin/dashboard");
    assert.equal(body.sources[0].ok, true);
    assert.match(body.brief.join(" "), /ตรวจเงินก่อน/);
    assert.match(body.brief[0], /ไม่มีการจำลอง reviewer\/admin คนที่สอง/);
    assert.equal(body.authority.money, "payments-worker");
    assert.equal(body.authority.human_operator, "Per");
    assert.equal(body.next_actions[0].label, "ตรวจ Payments");
  } finally {
    globalThis.fetch = original;
  }
});

test("normal admin context is decorated with the same single-owner contract", async () => {
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
      return new Response(JSON.stringify({ ok: true, counts: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const request = new Request(
      "https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcontrol-room",
      { headers: { cookie: "mmd_admin_gate_v1=test" } },
    );
    const response = await gate.fetch(request, {}, {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-owner-mode"), "single-owner-v1");
    const body = await response.json();
    assert.equal(body.owner_mode.mode, "single_owner");
    assert.equal(body.owner_mode.human_operator, "Per");
    assert.equal(body.authority.human_operator, "Per");
    assert.match(body.brief[0], /เปอร์เป็นคนใช้งานหลักคนเดียว/);
    assert.equal(body.next_actions[1].label, "ตรวจ Payments");
    assert.equal(body.next_actions[2].label, "เช็ก Membership Access");
  } finally {
    globalThis.fetch = original;
  }
});
