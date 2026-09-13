import test from "node:test";
import assert from "node:assert/strict";

import {
  isPrivateModelDecisionRequest,
  selectCanonicalModelId,
} from "./src/private-model-application-handoff.js";

test("private-model handoff captures only admin decision POST", () => {
  assert.equal(isPrivateModelDecisionRequest(new Request("https://mmdbkk.com/v1/admin/model-applications/pma_abcdefgh1234/decision", { method: "POST" })), true);
  assert.equal(isPrivateModelDecisionRequest(new Request("https://mmdbkk.com/v1/admin/model-applications/pma_abcdefgh1234/decision", { method: "GET" })), false);
  assert.equal(isPrivateModelDecisionRequest(new Request("https://mmdbkk.com/v1/admin/model-applications/pma_abcdefgh1234", { method: "POST" })), false);
});

test("canonical model selection requires exactly one trusted record", () => {
  assert.deepEqual(selectCanonicalModelId([], ""), { ok: false, error: "canonical_model_required" });
  assert.deepEqual(selectCanonicalModelId(["recAAAAAAAAAAAAAA"], ""), { ok: true, model_record_id: "recAAAAAAAAAAAAAA" });
  assert.deepEqual(selectCanonicalModelId([], "recBBBBBBBBBBBBBB"), { ok: true, model_record_id: "recBBBBBBBBBBBBBB" });
  assert.deepEqual(selectCanonicalModelId(["recAAAAAAAAAAAAAA"], "recBBBBBBBBBBBBBB"), { ok: false, error: "canonical_model_conflict" });
  assert.deepEqual(selectCanonicalModelId(["recAAAAAAAAAAAAAA", "recBBBBBBBBBBBBBB"], ""), { ok: false, error: "canonical_model_ambiguous" });
});

test("canonical model selection rejects browser-shaped junk ids", () => {
  assert.deepEqual(selectCanonicalModelId([], "model-123"), { ok: false, error: "canonical_model_required" });
  assert.deepEqual(selectCanonicalModelId(["not-an-airtable-record"], ""), { ok: false, error: "canonical_model_required" });
});
