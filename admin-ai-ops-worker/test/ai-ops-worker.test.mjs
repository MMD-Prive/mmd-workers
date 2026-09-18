import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

test("shared client script is served from one endpoint", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js"), {}, {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /javascript/);
  const source = await response.text();
  assert.match(source, /AI OPS/);
  assert.match(source, /ASK PER AI/);
  assert.match(source, /\/v1\/admin\/ai-ops\/command\/preview/);
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

test("Command Center requires admin auth", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/command-center"), {}, {});
    assert.equal(response.status, 401);
  } finally {
    globalThis.fetch = original;
  }
});

test("Command Center normalizes Needs Per and prepared Action Cards from verified dashboard data", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") {
      return new Response(JSON.stringify({ ok: true, actor: "per" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/v1/admin/dashboard") {
      return new Response(JSON.stringify({
        ok: true,
        focus: { title: "ตรวจเงินก่อน", text: "มีรายการรอตรวจ" },
        todos: [{ title: "ตรวจเงินของคุณหนุ่ย", text: "ref pay-1", href: "/internal/admin/payments", color: "red" }],
        boss: [{ title: "Job Exception", text: "งานถูก hold", href: "/internal/admin/control-room" }],
        money: [{ title: "คุณหนุ่ย", text: "รอตรวจสลิป", href: "/internal/admin/payments" }],
        jobs: [{ id: "job-1", title: "Mek · หนุ่ย", text: "pending confirm", status: "pending", href: "/internal/admin/jobs/job-1" }],
        members: [{ title: "คุณเอ", text: "Premium · ใกล้หมดอายุ", href: "/internal/admin/member-intelligence" }],
        status: { admin: "พร้อม", payments: "พร้อม", telegram: "พร้อม", data: "พร้อม" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/command-center", { headers: { cookie: "mmd_admin_gate_v1=test" } }), {}, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.owner_mode, "single_owner");
    assert.equal(body.human_operator, "Per");
    assert.equal(body.command_center.status, "ready");
    assert.equal(body.command_center.needs_per.length, 2);
    assert.equal(body.command_center.prepared.length, 2);
    assert.equal(body.command_center.prepared[0].execution_mode, "handoff_only");
    assert.equal(body.command_center.watching.autopilot_active, false);
    assert.equal(body.command_center.done_today.status, "waiting");
    assert.equal(body.command_center.phases[0].key, "command_center");
    assert.equal(body.command_center.phases[5].key, "system_health");
  } finally {
    globalThis.fetch = original;
  }
});

test("plain-language command preview is safe and never mutates protected authority", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true, actor: "per" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const request = new Request("https://mmdbkk.com/v1/admin/ai-ops/command/preview", {
      method: "POST",
      headers: { cookie: "mmd_admin_gate_v1=test", "content-type": "application/json" },
      body: JSON.stringify({ command: "เช็กสลิปคุณหนุ่ยว่าจ่ายหรือยัง" }),
    });
    const response = await worker.fetch(request, {}, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.matched, true);
    assert.equal(body.intent, "payments");
    assert.equal(body.action_card.authority, "payments-worker");
    assert.equal(body.action_card.execution_mode, "handoff_only");
    assert.equal(body.per_confirmation_required, false);
    assert.equal(body.guard, "paid_state_remains_payments_worker");
  } finally {
    globalThis.fetch = original;
  }
});

test("unsupported command does not invent an action", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const request = new Request("https://mmdbkk.com/v1/admin/ai-ops/command/preview", {
      method: "POST",
      headers: { cookie: "mmd_admin_gate_v1=test", "content-type": "application/json" },
      body: JSON.stringify({ command: "ทำทุกอย่างแทนฉันเลย" }),
    });
    const response = await worker.fetch(request, {}, {});
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.matched, false);
    assert.equal("action_card" in body, false);
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

test("Control Room context embeds Command Center P0 without a second fetch", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.pathname === "/v1/admin/dashboard") {
      return new Response(JSON.stringify({ ok: true, todos: [], boss: [], money: [], jobs: [], members: [], status: { admin: "พร้อม" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcontrol-room", { headers: { cookie: "mmd_admin_gate_v1=test" } }), {}, {});
    const body = await response.json();
    assert.equal(body.page.surface, "control_room");
    assert.equal(body.command_center.mode, "per_command_center_v1");
    assert.equal(body.command_center.status, "ready");
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