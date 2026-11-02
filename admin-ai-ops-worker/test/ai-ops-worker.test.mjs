import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

test("dashboard recovery allows a slow source and retries transient GETs only", async () => {
  const original = AbortSignal.timeout, delays = [];
  AbortSignal.timeout = ms => { delays.push(ms); return new AbortController().signal; };
  let calls = 0;
  const service = { fetch: async req => {
    assert.equal(req.method, "GET");
    assert.equal(req.headers.get("cookie"), "synthetic");
    if (new URL(req.url).pathname === "/v1/admin/auth/me") return Response.json({ok:true,authenticated:true,worker:"admin-worker"});
    if (++calls === 1) throw new DOMException("Synthetic timeout", "TimeoutError");
    return Response.json({ok:true,todos:[],boss:[],money:[],jobs:[],members:[],status:{}});
  }};
  try {
    const r = await worker.fetch(new Request("https://www.mmdbkk.com/v1/admin/ai-ops/context?path=/internal/admin/dashboard", {headers:{cookie:"synthetic"}}), {MMS_ADMIN:service}, {}), d = await r.json();
    assert.equal(d.command_center.status,"ready");
    assert.equal(calls,2);
    assert.equal(d.sources[0].attempts,2);
    assert.equal(d.sources[0].ok,true);
    assert.deepEqual(delays,[7000,30000,30000]);
  } finally { AbortSignal.timeout = original; }
});

test("dashboard retries share a 45s deadline rather than multiplying timeouts",async()=>{
 const timeout=AbortSignal.timeout,now=Date.now;let clock=0;const delays=[];
 AbortSignal.timeout=ms=>{delays.push(ms);return new AbortController().signal;};Date.now=()=>clock;
 const service={fetch:async req=>{if(new URL(req.url).pathname==="/v1/admin/auth/me")return Response.json({ok:true,authenticated:true,worker:"admin-worker"});clock+=delays.at(-1);throw new DOMException("Synthetic timeout","TimeoutError");}};
 try{const d=await (await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=/internal/admin/dashboard"),{MMS_ADMIN:service},{})).json();assert.deepEqual(delays,[7000,30000,15000]);assert.equal(d.sources[0].elapsed_ms,45000);assert.equal(d.sources[0].error_code,"timeout");assert.equal(d.command_center.status,"waiting");}finally{AbortSignal.timeout=timeout;Date.now=now;}
});

for (const scenario of ["503_then_ok","network_then_ok","401","invalid_json","ok_false","always_timeout"]) {
  test("dashboard recovery fails closed: "+scenario, async () => {
    let calls=0;
    const service={fetch:async req=>{
      if(new URL(req.url).pathname==="/v1/admin/auth/me")return Response.json({ok:true,authenticated:true,worker:"admin-worker"});
      calls++;
      if(scenario==="always_timeout")throw new DOMException("Synthetic timeout","TimeoutError");
      if(scenario==="503_then_ok"&&calls===1)return new Response("Unavailable",{status:503});
      if(scenario==="network_then_ok"&&calls===1)throw new TypeError("Synthetic network failure");
      if(scenario==="401")return Response.json({ok:false},{status:401});
      if(scenario==="invalid_json")return new Response("<html>login</html>",{status:200});
      if(scenario==="ok_false")return Response.json({ok:false});
      return Response.json({ok:true,todos:[],boss:[],money:[],jobs:[],members:[],status:{}});
    }};
    const r=await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=/internal/admin/dashboard"),{MMS_ADMIN:service},{}),d=await r.json();
    const recovered=scenario.endsWith("then_ok");
    assert.equal(d.sources[0].ok,recovered);
    assert.equal(calls,recovered||scenario==="always_timeout"?2:1);
    assert.equal(d.command_center.status,recovered?"ready":"waiting");
    if(!recovered)assert.equal(d.anomalies.some(x=>x.code==="intel_source_unavailable"),true);
    assert.doesNotMatch(JSON.stringify(d),/Synthetic timeout|Synthetic network failure/);
  });
}

test("shared client script is served from one endpoint", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js"), { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
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
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcontrol-room"), { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
    assert.equal(response.status, 401);
  } finally {
    globalThis.fetch = original;
  }
});

test("Command Center requires admin auth", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/command-center"), { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
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
      return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker", actor: "per" }), { status: 200, headers: { "content-type": "application/json" } });
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
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/command-center", { headers: { cookie: "mmd_admin_gate_v1=test" } }), { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
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
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker", actor: "per" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const request = new Request("https://mmdbkk.com/v1/admin/ai-ops/command/preview", {
      method: "POST",
      headers: { cookie: "mmd_admin_gate_v1=test", "content-type": "application/json" },
      body: JSON.stringify({ command: "เช็กสลิปคุณหนุ่ยว่าจ่ายหรือยัง" }),
    });
    const response = await worker.fetch(request, { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
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

test("MY MMD recovery command routes Owner to the read-only diagnostic", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") {
      return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker", actor: "per" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const request = new Request("https://mmdbkk.com/v1/admin/ai-ops/command/preview", {
      method: "POST",
      headers: { cookie: "mmd_admin_gate_v1=test", "content-type": "application/json" },
      body: JSON.stringify({ command: "เช็ก MY MMD ของเชนว่า recovery reconciled และ mmdacc เป็นอะไร" }),
    });
    const response = await worker.fetch(request, { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.matched, true);
    assert.equal(body.intent, "my_mmd_recovery");
    assert.equal(body.action_card.href, "/internal/admin/my-mmd/recovery");
    assert.equal(body.action_card.authority, "mmd.owner_my_mmd_recovery_diagnostic.v1");
    assert.equal(body.action_card.execution_mode, "handoff_only");
    assert.equal(body.guard, "my_mmd_trust_rule_server_side_read_only");
    assert.equal(body.per_confirmation_required, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("unsupported command does not invent an action", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const request = new Request("https://mmdbkk.com/v1/admin/ai-ops/command/preview", {
      method: "POST",
      headers: { cookie: "mmd_admin_gate_v1=test", "content-type": "application/json" },
      body: JSON.stringify({ command: "ทำทุกอย่างแทนฉันเลย" }),
    });
    const response = await worker.fetch(request, { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
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
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker", actor: "per" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const request = new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fjobs%2Fcreate-job", { headers: { cookie: "mmd_admin_gate_v1=test" } });
    const response = await worker.fetch(request, { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
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
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker" }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.pathname === "/v1/admin/dashboard") {
      return new Response(JSON.stringify({ ok: true, todos: [], boss: [], money: [], jobs: [], members: [], status: { admin: "พร้อม" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcontrol-room", { headers: { cookie: "mmd_admin_gate_v1=test" } }), { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
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
    if (url.pathname === "/v1/admin/auth/me") return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker" }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, authenticated: true, worker: "admin-worker" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcustomer-data", { headers: { cookie: "mmd_admin_gate_v1=test" } }), { MMS_ADMIN: { fetch: globalThis.fetch } }, {});
    const body = await response.json();
    assert.equal(body.page.surface, "customer_data_hold");
    assert.equal(body.anomalies.some((item) => item.code === "surface_hold"), true);
  } finally {
    globalThis.fetch = original;
  }
});
