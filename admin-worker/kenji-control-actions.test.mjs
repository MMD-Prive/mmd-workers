import assert from "node:assert/strict";
import test from "node:test";

import {
  handleKenjiControlAction,
  handleKenjiRuntimeStatusRpc,
  isKenjiControlActionRequest,
  isKenjiRuntimeStatusRpcRequest,
  KENJI_RUNTIME_STATUS_RPC_PATH,
} from "./src/kenji-control-actions.js";

const ENV = { AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_API_KEY: "airtable-token", INTERNAL_TOKEN: "internal-token" };
const OWNER = { id: "boss-per", role: "owner" };

function actionRequest(path, body, key = "idem-1") {
  return new Request(`https://mmdbkk.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify(body),
  });
}

function airtableJson(records = []) {
  return new Response(JSON.stringify({ records }), { status: 200, headers: { "content-type": "application/json" } });
}

function emptyAirtableFetch(extra = {}) {
  return async (url, init = {}) => {
    const value = String(url);
    if (extra.handler) {
      const result = await extra.handler(value, init);
      if (result) return result;
    }
    if ((init.method || "GET") === "GET") return airtableJson([]);
    return new Response(JSON.stringify({ id: "rec-created", fields: {} }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("CEO action and runtime RPC route detection stays narrow", () => {
  assert.equal(isKenjiControlActionRequest("/v1/admin/kenji/control/messages/draft", "POST"), true);
  assert.equal(isKenjiControlActionRequest("/v1/admin/kenji/control/messages/draft", "GET"), false);
  assert.equal(isKenjiControlActionRequest("/v1/admin/kenji/control/runtime", "POST"), false);
  assert.equal(isKenjiRuntimeStatusRpcRequest(KENJI_RUNTIME_STATUS_RPC_PATH, "POST"), true);
  assert.equal(isKenjiRuntimeStatusRpcRequest("/v1/internal/kenji/control/runtime", "POST"), false);
});

test("missing idempotency key fails before Airtable", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return airtableJson([]); };
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft", { conversation_id: "c1", channel: "line_oa", reply: "สวัสดีครับ", reason: "review", expected_version: 0 }, ""), ENV, OWNER);
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("unauthorized kill-switch role fails before Airtable", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return airtableJson([]); };
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/runtime/kill-switch", { scope: "line_oa_auto_reply", enabled: true, expected_version: 0, reason: "incident" }), ENV, { id: "reviewer-1", role: "reviewer" });
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("runtime status RPC requires service-bound bearer", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return airtableJson([]); };
  try {
    const request = new Request(`https://admin-worker.local${KENJI_RUNTIME_STATUS_RPC_PATH}`, { method: "POST", headers: { authorization: "Bearer wrong", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" } });
    const response = await handleKenjiRuntimeStatusRpc(request, ENV);
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("runtime status RPC projects latest scope booleans only", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const formula = new URL(String(url)).searchParams.get("filterByFormula") || "";
    const enabled = formula.includes("line_oa_auto_reply");
    return airtableJson([{ id: "rec-runtime", fields: { scope: enabled ? "line_oa_auto_reply" : "other", enabled_state: enabled ? "enabled" : "disabled", version: 2, updated_at: "2026-09-02T00:00:00.000Z" } }]);
  };
  try {
    const request = new Request(`https://admin-worker.local${KENJI_RUNTIME_STATUS_RPC_PATH}`, { method: "POST", headers: { authorization: "Bearer internal-token", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" } });
    const response = await handleKenjiRuntimeStatusRpc(request, ENV);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).controls, { line_oa_auto_reply: true, model_keyword_auto_reply: false, all_kenji_mutations: false });
  } finally { globalThis.fetch = originalFetch; }
});

test("same idempotency key with a different payload is a conflict", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes("tblUzZ8ImRZOkks4c") && (init.method || "GET") === "GET") {
      return airtableJson([{ id: "rec-audit", fields: { action_id: "audit-1", idempotency_key: "idem-1", payload_hash: "different", operation: "message_draft", result: "accepted" } }]);
    }
    throw new Error("unexpected fetch");
  };
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft", { conversation_id: "c1", channel: "line_oa", reply: "สวัสดีครับ", reason: "review", expected_version: 0 }), ENV, OWNER);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "idempotency_conflict");
  } finally { globalThis.fetch = originalFetch; }
});

test("global mutation kill switch blocks mutations fail-closed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyAirtableFetch({ handler: async (url, init) => {
    if (url.includes("tblPRUGp6AxWMM5gQ") && (init.method || "GET") === "GET") return airtableJson([{ id: "rec-runtime", fields: { scope: "all_kenji_mutations", enabled_state: "enabled", version: 1 } }]);
    return null;
  }});
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft", { conversation_id: "c1", channel: "line_oa", reply: "สวัสดีครับ", reason: "review", expected_version: 0 }), ENV, OWNER);
    assert.equal(response.status, 423);
    assert.equal((await response.json()).error, "kill_switch_active");
  } finally { globalThis.fetch = originalFetch; }
});

test("approval decisions enforce optimistic version and non-final transitions", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyAirtableFetch({ handler: async (url, init) => {
    if (url.includes("tblJ52hVu0f4uhEmS/recReview") && (init.method || "GET") === "GET") return new Response(JSON.stringify({ id: "recReview", fields: { request_status: "pending_review", version: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
    return null;
  }});
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/approvals/recReview/decision", { decision: "approve", expected_version: 1, reason: "reviewed" }), ENV, OWNER);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "version_conflict");
  } finally { globalThis.fetch = originalFetch; }
});

test("final approval state cannot be mutated again", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyAirtableFetch({ handler: async (url, init) => {
    if (url.includes("tblJ52hVu0f4uhEmS/recReview") && (init.method || "GET") === "GET") return new Response(JSON.stringify({ id: "recReview", fields: { request_status: "approved", version: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
    return null;
  }});
  try {
    const response = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/approvals/recReview/decision", { decision: "reject", expected_version: 2, reason: "second decision" }), ENV, OWNER);
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error, "transition_not_allowed");
  } finally { globalThis.fetch = originalFetch; }
});

test("unsafe customer draft stays blocked and send remains unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = emptyAirtableFetch();
  try {
    const unsafe = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft", { conversation_id: "c1", channel: "line_oa", reply: "Authorization Bearer secret", reason: "review", expected_version: 0 }), ENV, OWNER);
    assert.equal(unsafe.status, 422);
    const send = await handleKenjiControlAction(actionRequest("/v1/admin/kenji/control/messages/draft-1/send", { expected_version: 1, reason: "approved" }, "idem-send"), ENV, OWNER);
    assert.equal(send.status, 503);
    assert.equal((await send.json()).error, "mutation_not_ready");
  } finally { globalThis.fetch = originalFetch; }
});
