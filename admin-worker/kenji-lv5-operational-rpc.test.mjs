import test from "node:test";
import assert from "node:assert/strict";
import {
  handleKenjiLv5OperationalRpc,
  isKenjiLv5OperationalRpcRequest,
  KENJI_LV5_OPERATIONAL_RPC_PATH,
  KENJI_LV5_LIVE_RPC_PATH,
} from "./src/kenji-lv5-operational-rpc.js";

const ENV = { INTERNAL_TOKEN: "secret" };

function request(body = {}, overrides = {}) {
  return new Request(`https://admin-worker.local${overrides.path || KENJI_LV5_OPERATIONAL_RPC_PATH}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${overrides.token || "secret"}`,
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": overrides.caller || "member-dashboard-chat-worker",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("P1 and P2 routes are POST only", () => {
  assert.equal(isKenjiLv5OperationalRpcRequest(KENJI_LV5_OPERATIONAL_RPC_PATH, "POST"), true);
  assert.equal(isKenjiLv5OperationalRpcRequest(KENJI_LV5_LIVE_RPC_PATH, "POST"), true);
  assert.equal(isKenjiLv5OperationalRpcRequest(KENJI_LV5_OPERATIONAL_RPC_PATH, "GET"), false);
  assert.equal(isKenjiLv5OperationalRpcRequest(KENJI_LV5_LIVE_RPC_PATH, "GET"), false);
});

test("RPC rejects missing service auth without disclosing route", async () => {
  const response = await handleKenjiLv5OperationalRpc(new Request(`https://admin-worker.local${KENJI_LV5_OPERATIONAL_RPC_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }), ENV);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, error: "not_found" });
});

test("RPC rejects wrong caller", async () => {
  const response = await handleKenjiLv5OperationalRpc(request({}, { caller: "browser" }), ENV);
  assert.equal(response.status, 404);
});

test("P2 live RPC keeps the same service-only auth boundary", async () => {
  const response = await handleKenjiLv5OperationalRpc(new Request(`https://admin-worker.local${KENJI_LV5_LIVE_RPC_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }), ENV);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, error: "not_found" });
});

test("RPC returns LV5 orchestration context for trusted service caller", async () => {
  const response = await handleKenjiLv5OperationalRpc(request({
    client: { canonical_client_id: "recClient1", identity_status: "resolved" },
    entitlement: { status: "active", canonical_membership_level: "private_premium" },
    calendar: { status: "available", available: true },
    payment: { status: "pending", deposit_required_thb: 5000 },
    hype: { configured: true, notification_only: true },
    intent: { type: "booking", model_name: "EMs20", date: "2026-09-20", time: "20:00", location: "Bangkok" },
  }), ENV);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-kenji-level"), "lv5-operational-concierge");
  const body = await response.json();
  assert.equal(body.mode, "operational_orchestrator");
  assert.equal(body.transport.mode, "service_binding_only");
  assert.equal(body.transport.caller, "member-dashboard-chat-worker");
  assert.ok(body.next_actions.some((item) => item.action === "prepare_booking_intent"));
  assert.equal(body.guardrails.kenji_is_source_of_truth, false);
});
