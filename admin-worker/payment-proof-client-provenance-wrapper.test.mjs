import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCanonicalClientToReviewItem,
  hasCanonicalClientMismatch,
} from "./src/payment-proof-client-provenance-wrapper.js";

test("canonical Client link clears only the missing-customer enrichment issue", () => {
  const item = {
    proof_id: "proof_1",
    reviewable: true,
    identity_state: "",
    context_issues: ["customer_or_job_not_linked"],
    review_lane: "needs_enrichment",
    can_approve: false,
    match_flags: { linked_member_present: false },
  };
  const result = applyCanonicalClientToReviewItem(item, {
    ambiguous: false,
    clientRecordId: "recWvkmwiNDuZ44mu",
    clientName: "คุณ เอ็ม",
  });
  assert.equal(result.client_record_id, "recWvkmwiNDuZ44mu");
  assert.equal(result.client_name, "คุณ เอ็ม");
  assert.equal(result.identity_state, "canonical_client_linked");
  assert.deepEqual(result.context_issues, []);
  assert.equal(result.review_lane, "owner_review");
  assert.equal(result.can_approve, true);
  assert.equal(result.match_flags.linked_client_present, true);
});

test("canonical Client link does not erase unrelated review issues", () => {
  const item = {
    reviewable: true,
    context_issues: ["customer_or_job_not_linked", "amount_not_extracted"],
    match_flags: {},
  };
  const result = applyCanonicalClientToReviewItem(item, {
    ambiguous: false,
    clientRecordId: "recWvkmwiNDuZ44mu",
    clientName: "คุณ เอ็ม",
  });
  assert.deepEqual(result.context_issues, ["amount_not_extracted"]);
  assert.equal(result.can_approve, false);
  assert.equal(result.review_lane, "needs_enrichment");
});

test("proof and Payment canonical Client mismatch fails closed", () => {
  assert.equal(hasCanonicalClientMismatch(["recAAAAAAAAAAAAAA"], ["recBBBBBBBBBBBBBB"]), true);
  assert.equal(hasCanonicalClientMismatch(["recAAAAAAAAAAAAAA"], ["recAAAAAAAAAAAAAA"]), false);
  assert.equal(hasCanonicalClientMismatch([], ["recAAAAAAAAAAAAAA"]), false);
  assert.equal(hasCanonicalClientMismatch(["recAAAAAAAAAAAAAA", "recBBBBBBBBBBBBBB"], ["recAAAAAAAAAAAAAA"]), true);
});
