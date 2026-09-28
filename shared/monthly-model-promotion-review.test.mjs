import test from "node:test";
import assert from "node:assert/strict";
import { buildMonthlyModelPromotionReview } from "./monthly-model-promotion-review.mjs";

const date = "2026-09-27T00:00:00Z";
const eligible = (id, extra = {}) => ({
  canonical_model_id: id, created_at: "2024-01-01T00:00:00Z", active: true,
  marketing_consent_verified: true, public_media_approved: true,
  promotion_history_complete: true, completed_revenue_verified: true,
  verified_completed_revenue_thb: 200_000,
  last_promoted_at: "2026-01-01T00:00:00Z", ...extra,
});

test("ranks older, higher completed revenue, and longer unpromoted models for owner review", () => {
  const result = buildMonthlyModelPromotionReview([
    eligible("recOld", { created_at: "2020-01-01", last_promoted_at: "2024-01-01" }),
    eligible("recNewer", { created_at: "2025-01-01", verified_completed_revenue_thb: 1000 }),
  ], { now: date });
  assert.equal(result.month, "2026-09");
  assert.equal(result.mode, "owner_review_only");
  assert.equal(result.candidates[0].canonical_model_id, "recOld");
  assert.equal(result.publish_authorized, false);
});

test("fails closed on missing promotion history, unverified sales, media, consent and cooldown", () => {
  const models = [
    eligible("recMissing", { promotion_history_complete: false }),
    eligible("recSales", { completed_revenue_verified: false }),
    eligible("recMedia", { public_media_approved: false }),
    eligible("recConsent", { marketing_consent_verified: false }),
    eligible("recRecent", { last_promoted_at: "2026-09-15" }),
    eligible("recValid", { last_promoted_at: "2026-07-01" }),
  ];
  const result = buildMonthlyModelPromotionReview(models, { now: date });
  assert.deepEqual(result.candidates.map((x) => x.canonical_model_id), ["recValid"]);
  assert.equal(result.evidence_missing_or_ineligible, 5);
});

test("deterministic order and no guessed revenue or malformed identity", () => {
  const result = buildMonthlyModelPromotionReview([
    eligible("recB"), eligible("recA"), eligible("userId", { verified_completed_revenue_thb: NaN }),
  ], { now: date, maxCandidates: 1 });
  assert.deepEqual(result.candidates.map((x) => x.canonical_model_id), ["recA"]);
  assert.equal(result.accepted, 1);
});
