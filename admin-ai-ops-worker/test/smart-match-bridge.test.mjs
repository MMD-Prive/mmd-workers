import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/smart-match-bridge.js";

const url = "https://mmdbkk.com/v1/admin/ai-ops/smart-match/preview";

test("Smart Matching is fail-closed without authenticated=true", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, authenticated: false }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await worker.fetch(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ work_type: "public", folder: "travel" }),
    }), {}, {});
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" });
  } finally {
    globalThis.fetch = original;
  }
});

test("Smart Matching asks canonical model search and ranks only returned candidates", async () => {
  const original = globalThis.fetch;
  let modelSearchUrl = null;
  globalThis.fetch = async (input) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (target.pathname === "/v1/admin/auth/me") {
      return new Response(JSON.stringify({ ok: true, authenticated: true, actor: "per" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.pathname === "/v1/admin/models/search") {
      modelSearchUrl = target;
      return new Response(JSON.stringify({
        ok: true,
        booking_visibility: "private",
        folder: "premium",
        customer_lane: "gay",
        private_access: { private_access_level: "premium", allowed_private_folders: ["standard", "premium"] },
        items: [{
          model_id: "m-1",
          model_name: "Model One",
          model_lookup_key: "MMD-M1",
          folders: ["premium"],
          orientation: "gay",
          available: true,
          status: "available",
          telegram_status: "verified",
          operational: { mk: true, burn: true, live: false },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected ${target.pathname}`);
  };
  try {
    const response = await worker.fetch(new Request(url, {
      method: "POST",
      headers: { cookie: "mmd_admin_gate_v1=test", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: "recClient1",
        work_type: "private",
        folder: "premium",
        orientation: "gay",
        mk: true,
      }),
    }), {}, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.matches.length, 1);
    assert.equal(body.matches[0].model_id, "m-1");
    assert.equal(body.assignment_authority, "Per");
    assert.equal(body.mode, "preview_only");
    assert.equal(modelSearchUrl.searchParams.get("client_id"), "recClient1");
    assert.equal(modelSearchUrl.searchParams.get("folder"), "premium");
    assert.equal(modelSearchUrl.searchParams.get("mk"), "1");
  } finally {
    globalThis.fetch = original;
  }
});

test("canonical model-search block is preserved and never replaced with invented candidates", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (target.pathname === "/v1/admin/auth/me") {
      return new Response(JSON.stringify({ ok: true, authenticated: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.pathname === "/v1/admin/models/search") {
      return new Response(JSON.stringify({ ok: false, error: "private_folder_not_allowed" }), { status: 403, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected ${target.pathname}`);
  };
  try {
    const response = await worker.fetch(new Request(url, {
      method: "POST",
      headers: { cookie: "mmd_admin_gate_v1=test", "content-type": "application/json" },
      body: JSON.stringify({ client_id: "recClient1", work_type: "private", folder: "exclusive", orientation: "gay" }),
    }), {}, {});
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "canonical_model_search_blocked");
    assert.equal(body.source_error, "private_folder_not_allowed");
    assert.equal("matches" in body, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("shared AI Ops client exposes Smart Match without another standalone admin home", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js"), {}, {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-smart-matching"), "p1");
  const source = await response.text();
  assert.match(source, /SMART MATCH/);
  assert.match(source, /\/v1\/admin\/ai-ops\/smart-match\/preview/);
  assert.match(source, /AI จัดอันดับ · เปอร์เลือกเอง/);
});
