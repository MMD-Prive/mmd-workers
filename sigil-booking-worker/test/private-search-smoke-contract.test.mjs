import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateSearchFailClosed } from "./private-search-smoke-contract.mjs";

const valid = {
  ok: true,
  matched: false,
  blocked: true,
  reason: "private_requires_active_member",
  access_scope: "public_only",
  allowed_model_folders: [],
  visibility_enforced: true,
  items: [],
};

test("accepts the current no-member fail-closed private search response", () => {
  assert.equal(isPrivateSearchFailClosed(valid), true);
  assert.equal(isPrivateSearchFailClosed({ ...valid, model: null }), true);
});

test("rejects the stale reason even when access is blocked", () => {
  assert.equal(isPrivateSearchFailClosed({ ...valid, reason: "private_requires_entitlement_snapshot" }), false);
});

test("rejects a Private result or folder leaking to the unauthenticated response", () => {
  assert.equal(isPrivateSearchFailClosed({ ...valid, items: [{ model_id: "private-model" }] }), false);
  assert.equal(isPrivateSearchFailClosed({ ...valid, allowed_model_folders: ["premium"] }), false);
  assert.equal(isPrivateSearchFailClosed({ ...valid, model: { model_id: "private-model" } }), false);
});

test("rejects missing or malformed fail-closed fields", () => {
  const { items, ...missingItems } = valid;
  assert.equal(isPrivateSearchFailClosed(missingItems), false);
  assert.equal(isPrivateSearchFailClosed({ ...valid, items: null }), false);
  assert.equal(isPrivateSearchFailClosed({ ...valid, visibility_enforced: false }), false);
  assert.equal(isPrivateSearchFailClosed({ ...valid, access_scope: "public_private" }), false);
  assert.equal(isPrivateSearchFailClosed(null), false);
  assert.equal(isPrivateSearchFailClosed([]), false);
});
