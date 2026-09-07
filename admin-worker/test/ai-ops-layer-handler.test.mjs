import assert from "node:assert/strict";
import test from "node:test";
import { handleAiOpsRequest } from "../src/ai-ops-layer-handler.js";

test("AI Ops context endpoint returns JSON", async () => {
  const request = new Request("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcontrol-room");
  const response = handleAiOpsRequest(request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  const body = await response.json();
  assert.equal(body.schema_version, "mmd_ai_ops_layer_v1");
});

test("AI Ops client endpoint returns shared JavaScript", async () => {
  const request = new Request("https://mmdbkk.com/v1/admin/ai-ops/client.js");
  const response = handleAiOpsRequest(request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /javascript/);
  assert.match(await response.text(), /AI OPS/);
});
