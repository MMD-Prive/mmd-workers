import assert from "node:assert/strict";
import test from "node:test";
import { buildAiOpsContextResponse } from "../src/ai-ops-layer-runtime.js";

test("Create Job AI Ops context stays advisory and preserves authority locks", () => {
  const result = buildAiOpsContextResponse("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fjobs%2Fcreate-job&client_id=rec_client&model_id=rec_model");
  assert.equal(result.ok, true);
  assert.equal(result.schema_version, "mmd_ai_ops_layer_v1");
  assert.equal(result.page.surface, "create_job");
  assert.equal(result.context.client_id, "rec_client");
  assert.equal(result.context.model_id, "rec_model");
  assert.equal(result.authority.money, "payments-worker");
  assert.equal(result.authority.entitlement, "my_mmd_entitlement_resolver_v1");
});

test("Customer Data is explicitly marked HOLD", () => {
  const result = buildAiOpsContextResponse("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcustomer-data");
  assert.equal(result.page.surface, "customer_data_hold");
  assert.equal(result.anomalies.some((item) => item.code === "surface_hold"), true);
});

test("Unknown internal admin pages do not become canonical", () => {
  const result = buildAiOpsContextResponse("https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Flegacy-thing");
  assert.equal(result.page.canonical, false);
  assert.equal(result.page.surface, "admin_other");
});
