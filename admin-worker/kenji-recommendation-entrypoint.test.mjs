import assert from "node:assert/strict";
import test from "node:test";

import {
  handleKenjiLv5OperationalRpc,
  isKenjiLv5OperationalRpcRequest,
} from "./src/kenji-lv5-operational-rpc.js";
import {
  handleKenjiRecommendationRpc,
  KENJI_RECOMMENDATION_RPC_PATH,
} from "./src/kenji-recommendation-rpc.js";
import { ENV, options, request } from "./kenji-recommendation-test-fixtures.mjs";

test("active Kenji RPC dispatcher recognizes and delegates recommendation route", async () => {
  assert.equal(isKenjiLv5OperationalRpcRequest(KENJI_RECOMMENDATION_RPC_PATH, "POST"), true);
  const response = await handleKenjiLv5OperationalRpc(request(), ENV, options());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.rpc_schema, "mmd.kenji_recommendation_rpc.v1");
  assert.equal(payload.deployment_mode, "shadow");
  assert.equal(payload.guardrails.auto_send_allowed, false);
});

test("recommendation route is disabled by default even for an authenticated service call", async () => {
  const response = await handleKenjiRecommendationRpc(
    request(),
    { INTERNAL_TOKEN: ENV.INTERNAL_TOKEN },
    options(),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "recommendation_layer_disabled",
  });
});

test("public hostname cannot enter the service-only recommendation route", async () => {
  const publicRequest = new Request(`https://admin-worker.malemodel-bkk.workers.dev${KENJI_RECOMMENDATION_RPC_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const response = await handleKenjiLv5OperationalRpc(publicRequest, ENV);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "internal_auth_required",
  });
});
