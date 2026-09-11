import assert from "node:assert/strict";
import test from "node:test";
import {
  modelAssetReadinessScore,
  normalizeModelFamilies,
  paymentEvidenceHasContextIssue,
  reconcileExpectedObserved,
  safeRetentionRecommendation,
} from "./src/mmd-intelligence-contract.js";

test("model families allow explicit multi-lane capability", () => {
  assert.deepEqual(
    normalizeModelFamilies({ compcard_family: "C", work_types: ["Travel", "Extreme"] }),
    ["C", "D"]
  );
});

test("model family does not infer A or B from access tier", () => {
  assert.deepEqual(normalizeModelFamilies({ package_code: "premium", tier: "VIP" }), []);
});

test("asset readiness stays separate from supply family", () => {
  const result = modelAssetReadinessScore({
    model_record_id: "rec1",
    r2_prefix: "models/1",
    primary_image_key: "models/1/profile/main.webp",
    profile_ready: true,
    gallery_ready: true,
  });
  assert.equal(result.ready, true);
  assert.equal(result.passed, 5);
});

test("payment evidence context issue is fail-visible", () => {
  assert.equal(
    paymentEvidenceHasContextIssue({
      match_flags: { payment_ref_present: true, amount_present: true, linked_payment_present: false },
    }),
    true
  );
});

test("access reconciliation distinguishes add remove and review", () => {
  assert.equal(reconcileExpectedObserved({ expected: ["premium"], observed: [] }).outcome, "add");
  assert.equal(reconcileExpectedObserved({ expected: [], observed: ["premium"] }).outcome, "remove");
  assert.equal(
    reconcileExpectedObserved({ expected: ["premium"], observed: ["standard"], status: "active" }).outcome,
    "review"
  );
  assert.equal(
    reconcileExpectedObserved({ expected: ["premium"], observed: ["premium"], status: "blocked" }).fail_closed,
    true
  );
});

test("retention recommendation requires verified context", () => {
  assert.equal(safeRetentionRecommendation({ membership_status: "expired", renewal_available: true }).action, "review");
  assert.equal(
    safeRetentionRecommendation({ verified: true, membership_status: "expired", renewal_available: true }).action,
    "renew"
  );
  assert.equal(
    safeRetentionRecommendation({ verified: true, public_member: true, public_service_available: true }).action,
    "public_service"
  );
});
