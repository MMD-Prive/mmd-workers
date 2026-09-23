import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBossList,
  ownerActionMembershipReviewItems,
  ownerActionPaymentReviewItems,
} from "./src/dashboard-worker.js";

test("Owner Actions payment triage keeps only proofs ready for owner review", () => {
  const items = ownerActionPaymentReviewItems([
    { proof_id: "ready", reviewable: true, review_lane: "owner_review", can_approve: true, context_issues: [] },
    { proof_id: "enrich", reviewable: true, review_lane: "needs_enrichment", can_approve: false, context_issues: ["customer_or_job_not_linked"] },
    { proof_id: "blocked", reviewable: true, review_lane: "owner_review", can_approve: false, context_issues: [] },
    { proof_id: "closed", reviewable: false, review_lane: "owner_review", can_approve: true, context_issues: [] },
  ]);

  assert.deepEqual(items.map((item) => item.proof_id), ["ready"]);
});

test("Owner Actions membership triage excludes active, expired, and tier-only records", () => {
  const items = ownerActionMembershipReviewItems([
    { id: "rec-active", fields: { "Membership Status": "active", "Membership Tier": "SVIP" } },
    { id: "rec-expired", fields: { "Membership Status": "expired", "Membership Tier": "Premium" } },
    { id: "rec-review", fields: { resolver_state: "review_required" } },
    { id: "rec-ready", fields: { identity_readiness: "ready_for_owner_verification" } },
    { id: "rec-hold", fields: { "Verification Status": "hold" } },
  ]);

  assert.deepEqual(items, [
    { id: "rec-review", review_state: "review_required" },
    { id: "rec-ready", review_state: "ready_for_owner_verification" },
    { id: "rec-hold", review_state: "hold" },
  ]);
});

test("Boss exception lane ignores protected tiers and queue density heuristics", () => {
  assert.deepEqual(buildBossList({ sessionRecords: [] }), []);
  assert.deepEqual(buildBossList({
    sessionRecords: [{ id: "normal", fields: { status: "confirmed", member_tier: "SVIP" } }],
  }), []);

  const exception = buildBossList({
    sessionRecords: [{ id: "held", fields: { status: "hold", note: "manual owner review" } }],
  });
  assert.equal(exception.length, 1);
  assert.equal(exception[0].title, "Job Exception");
});
