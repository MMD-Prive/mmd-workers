import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  deterministicPrivateModelKey,
  isPrivateModelAdminRequest,
  isPrivateModelDecisionRequest,
  selectCanonicalModelId,
} from "./src/private-model-application-handoff.js";

test("private-model handoff captures only admin decision POST", () => {
  assert.equal(isPrivateModelDecisionRequest(new Request("https://mmdbkk.com/v1/admin/model-applications/pma_abcdefgh1234/decision", { method: "POST" })), true);
  assert.equal(isPrivateModelDecisionRequest(new Request("https://mmdbkk.com/v1/admin/model-applications/pma_abcdefgh1234/decision", { method: "GET" })), false);
  assert.equal(isPrivateModelDecisionRequest(new Request("https://mmdbkk.com/v1/admin/model-applications/pma_abcdefgh1234", { method: "POST" })), false);
});

test("private-model owner surface stays inside existing guarded admin routes", () => {
  assert.equal(isPrivateModelAdminRequest(new Request("https://mmdbkk.com/internal/admin/model-applications?application_type=private_model")), true);
  assert.equal(isPrivateModelAdminRequest(new Request("https://mmdbkk.com/v1/admin/model-applications?application_type=private_model")), true);
  assert.equal(isPrivateModelAdminRequest(new Request("https://mmdbkk.com/v1/admin/model-applications/pma_abcdefgh1234")), true);
  assert.equal(isPrivateModelAdminRequest(new Request("https://mmdbkk.com/sigil/api/private-model/apply")), false);
});

test("deterministic provisional MMD MODEL key is application-owned and stable", () => {
  assert.equal(deterministicPrivateModelKey("pma_20260913_AbC-123_xyz"), "mdl_pri_app_20260913_abc-123_xyz");
  assert.equal(deterministicPrivateModelKey("bad"), "");
});

test("canonical model selection fails closed on ambiguous stored links", () => {
  assert.deepEqual(selectCanonicalModelId([], ""), { ok: false, error: "canonical_model_required" });
  assert.deepEqual(selectCanonicalModelId(["recAAAAAAAAAAAAAA"], ""), { ok: true, model_record_id: "recAAAAAAAAAAAAAA" });
  assert.deepEqual(selectCanonicalModelId(["recAAAAAAAAAAAAAA", "recBBBBBBBBBBBBBB"], ""), { ok: false, error: "canonical_model_ambiguous" });
  assert.deepEqual(selectCanonicalModelId(["recAAAAAAAAAAAAAA"], "recBBBBBBBBBBBBBB"), { ok: false, error: "canonical_model_conflict" });
});

test("approve orchestration does not read a raw canonical Airtable id from browser JSON", async () => {
  const source = await readFile(new URL("./src/private-model-application-handoff.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /body\?\.(canonical_model_record_id|model_record_id|canonical_model)/);
  assert.match(source, /resolveOrCreateCanonicalModel\(env, application\)/);
  assert.match(source, /environment:\s*"published"/);
  assert.ok(source.includes('patch[PRIVATE_MODEL_HANDOFF_FIELDS.handoffStatus] = resolved.line_user_id ? "linked" : "ready";'));
});

test("active wrapper clones guarded Private Model requests before delegated worker consumes them", async () => {
  const source = await readFile(new URL("./src/admin-login-hero-worker.js", import.meta.url), "utf8");
  assert.match(source, /if \(isPrivateModelAdminRequest\(request\)\) privateModelRequest = request\.clone\(\)/);
  assert.match(source, /maybeHandlePrivateModelAdminRequest\(privateModelRequest, env, response\)/);
});


test("canonical creation is serialized by the existing Durable Object namespace", async () => {
  const handoff = await readFile(new URL("./src/private-model-application-handoff.js", import.meta.url), "utf8");
  const activation = await readFile(new URL("./src/model-first-time-activation.js", import.meta.url), "utf8");
  assert.match(handoff, /resolvePrivateCanonicalModel\(env,\s*\{/);
  assert.doesNotMatch(handoff, /findModelsByModelKey\(env, modelKey\)/);
  assert.match(activation, /idFromName\(`private-model-create:\$\{modelKey\}`\)/);
  assert.match(activation, /url\.pathname === "\/resolve-private-model"/);
  assert.match(activation, /findModelsByPrivateModelKey\(this\.env, modelKey\)/);
  assert.match(activation, /createPrivateCanonicalModel\(this\.env, modelKey, workingName\)/);
});
