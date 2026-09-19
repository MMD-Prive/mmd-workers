import test from "node:test";
import assert from "node:assert/strict";
import { resolveHeldIdentityIds } from "./src/sigil-jobs-held-release.js";

test("held reconciliation preserves a Client linked on an earlier retry", () => {
  const session = { canonical_links: { client_record_id: "recCLIENT00000001", model_record_id: "" } };
  const ids = resolveHeldIdentityIds(session, { model_record_id: "recMODEL000000001" });
  assert.equal(ids.client_record_id, "recCLIENT00000001");
  assert.equal(ids.model_record_id, "recMODEL000000001");
});

test("held reconciliation preserves a Model linked on an earlier retry", () => {
  const session = { canonical_links: { client_record_id: "", model_record_id: "recMODEL000000001" } };
  const ids = resolveHeldIdentityIds(session, { client_record_id: "recCLIENT00000001" });
  assert.equal(ids.client_record_id, "recCLIENT00000001");
  assert.equal(ids.model_record_id, "recMODEL000000001");
});

test("new explicit canonical selection overrides the previously linked identity snapshot", () => {
  const session = { canonical_links: { client_record_id: "recCLIENT00000001", model_record_id: "recMODEL000000001" } };
  const ids = resolveHeldIdentityIds(session, {
    client_record_id: "recCLIENT00000002",
    model: { model_id: "recMODEL000000002" },
  });
  assert.equal(ids.requested_client_id, "recCLIENT00000002");
  assert.equal(ids.requested_model_id, "recMODEL000000002");
  assert.equal(ids.client_record_id, "recCLIENT00000002");
  assert.equal(ids.model_record_id, "recMODEL000000002");
});
