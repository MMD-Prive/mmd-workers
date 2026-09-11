import assert from "node:assert/strict";
import { test } from "node:test";
import { MODEL_IDENTITY_FIRST_POLICY } from "./src/model-liff-worker.js";
import {
  MODEL_LINE_LINK_BIND_MODE,
  isModelLineLinkBindPayload,
  isModelLineLinkCandidatesRequest,
  isModelLineLinkClaimsRequest,
  isModelLineLinkPage,
} from "./src/model-line-link-review.js";

test("first-time MMD MODEL identity requires owner review", () => {
  assert.equal(MODEL_IDENTITY_FIRST_POLICY, "owner_review_required");
});

test("owner link page is scoped to Kenji Admin query view", () => {
  assert.equal(isModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/kenji?view=model-link")), true);
  assert.equal(isModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/kenji")), false);
  assert.equal(isModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/studio?view=model-link")), false);
  assert.equal(isModelLineLinkPage(new Request("https://mmdbkk.com/internal/admin/kenji?view=model-link", { method: "POST" })), false);
});

test("pending claims use only the explicit activation-candidates queue mode", () => {
  assert.equal(isModelLineLinkClaimsRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates?mode=line-link-claims")), true);
  assert.equal(isModelLineLinkClaimsRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates")), false);
  assert.equal(isModelLineLinkClaimsRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates?mode=line-link-candidates")), false);
});

test("candidate search uses only the explicit line-link candidate mode", () => {
  assert.equal(isModelLineLinkCandidatesRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates?mode=line-link-candidates&q=Mek")), true);
  assert.equal(isModelLineLinkCandidatesRequest(new Request("https://mmdbkk.com/v1/admin/models/activation-candidates?q=Mek")), false);
});

test("owner bind mutation requires the explicit bind mode", () => {
  assert.equal(isModelLineLinkBindPayload({ mode: MODEL_LINE_LINK_BIND_MODE }), true);
  assert.equal(isModelLineLinkBindPayload({ mode: "issue" }), false);
  assert.equal(isModelLineLinkBindPayload(null), null);
});
