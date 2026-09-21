import assert from "node:assert/strict";
import test from "node:test";
import {
  handleKenjiRecommendationRpc,
  isKenjiRecommendationRpcRequest,
  KENJI_RECOMMENDATION_RPC_PATH,
} from "./src/kenji-recommendation-rpc.js";
import { ENV, body, options, request } from "./kenji-recommendation-test-fixtures.mjs";

test("service-only RPC is auth, method, and content-type constrained", async () => {
  assert.equal(isKenjiRecommendationRpcRequest(KENJI_RECOMMENDATION_RPC_PATH, "POST"), true);
  const unauthorized = await handleKenjiRecommendationRpc(new Request(`https://admin-worker.local${KENJI_RECOMMENDATION_RPC_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), ENV, options());
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error, "internal_auth_required");
  const wrongMethod = await handleKenjiRecommendationRpc(request({}, { method: "GET" }), ENV, options());
  assert.equal(wrongMethod.status, 405);
  const wrongType = await handleKenjiRecommendationRpc(request({}, { headers: { "content-type": "text/plain" } }), ENV, options());
  assert.equal(wrongType.status, 415);
});

test("handler returns bounded payload and never mutates or sends", async () => {
  const response = await handleKenjiRecommendationRpc(request(), ENV, options());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.rpc_schema, "mmd.kenji_recommendation_rpc.v1");
  assert.equal(payload.guardrails.entitlement_mutated, false);
  assert.equal(payload.guardrails.booking_confirmed, false);
  assert.equal(payload.guardrails.auto_send_allowed, false);
});

test("invalid identity and invalid JSON fail without source reads", async () => {
  const invalidIdentity = await handleKenjiRecommendationRpc(request(body({ line_user_id: "bad" })), ENV, options());
  assert.equal(invalidIdentity.status, 400);
  const malformed = new Request(`https://admin-worker.local${KENJI_RECOMMENDATION_RPC_PATH}`, {
    method: "POST",
    headers: { authorization: "Bearer internal-token", "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" },
    body: "{",
  });
  const invalidJson = await handleKenjiRecommendationRpc(malformed, ENV, options());
  assert.equal(invalidJson.status, 400);
});
