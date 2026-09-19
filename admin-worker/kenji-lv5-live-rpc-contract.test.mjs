import test from "node:test";
import assert from "node:assert/strict";
import {
  KENJI_LV5_LIVE_RPC_PATH,
  isKenjiLv5OperationalRpcRequest,
} from "./src/kenji-lv5-operational-rpc.js";

test("P2 live context endpoint remains exact service POST surface", () => {
  assert.equal(KENJI_LV5_LIVE_RPC_PATH, "/v1/internal/kenji/operational-context/live");
  assert.equal(isKenjiLv5OperationalRpcRequest(KENJI_LV5_LIVE_RPC_PATH, "POST"), true);
  assert.equal(isKenjiLv5OperationalRpcRequest(`${KENJI_LV5_LIVE_RPC_PATH}/extra`, "POST"), false);
  assert.equal(isKenjiLv5OperationalRpcRequest(KENJI_LV5_LIVE_RPC_PATH, "GET"), false);
});
