import assert from "node:assert/strict";
import test from "node:test";
import { AI_OPS_CLIENT_JS } from "../src/ai-ops-layer-client.js";

test("shared client is guarded to internal admin namespace", () => {
  assert.match(AI_OPS_CLIENT_JS, /startsWith\('\/internal\/admin\/'\)/);
  assert.match(AI_OPS_CLIENT_JS, /\/v1\/admin\/ai-ops\/context/);
  assert.match(AI_OPS_CLIENT_JS, /payments-worker/);
});
