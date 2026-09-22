import test from "node:test";
import assert from "node:assert/strict";
import { classifyEligibility, makeClaimId, makeIdempotencyKey, validateTransition } from "../src/index.js";

test("active member receives four months", () => {
  const x = classifyEligibility({ referenceDate: "2026-08-05", membershipEndAt: "2026-11-30", membershipTier: "premium" });
  assert.equal(x.classificationGroup, "active_member");
  assert.equal(x.defaultMonths, 4);
  assert.equal(x.pointsBonus, 66);
});

test("90 days remains recently expired", () => {
  const x = classifyEligibility({ referenceDate: "2026-08-05", membershipEndAt: "2026-05-07", membershipTier: "standard" });
  assert.equal(x.daysExpiredAtClaim, 90);
  assert.equal(x.classificationGroup, "recently_expired");
  assert.equal(x.defaultMonths, 2);
});

test("91 days becomes long expired", () => {
  const x = classifyEligibility({ referenceDate: "2026-08-05", membershipEndAt: "2026-05-06", membershipTier: "standard" });
  assert.equal(x.daysExpiredAtClaim, 91);
  assert.equal(x.classificationGroup, "long_expired");
  assert.equal(x.defaultMonths, 3);
});

test("special tiers always require manual review", () => {
  const x = classifyEligibility({ referenceDate: "2026-08-05", membershipEndAt: "2027-01-01", membershipTier: "blackcard" });
  assert.equal(x.classificationGroup, "special_tier");
  assert.equal(x.manualReview, true);
  assert.equal(x.pointsBonus, null);
});

test("approve and apply are separate transitions", () => {
  assert.equal(validateTransition("matched", "benefit_approved"), true);
  assert.equal(validateTransition("matched", "benefit_applied"), false);
  assert.equal(validateTransition("benefit_approved", "applying"), true);
});

test("idempotency key is deterministic per benefit", () => {
  assert.equal(makeIdempotencyKey("mmd_6th_anniversary_2026", "MMD6-2026-000184", "anniversary_points_66"),
    "mmd_6th_anniversary_2026:MMD6-2026-000184:anniversary_points_66");
});

test("claim id is opaque and year-scoped", () => {
  assert.equal(
    makeClaimId(new Date("2026-08-05T00:00:00Z"), "12345678-90ab-cdef-1234-567890abcdef"),
    "MMD6-2026-1234567890"
  );
});

test("invalid eligibility dates fail closed", () => {
  assert.throws(() => classifyEligibility({ referenceDate: "bad", membershipEndAt: "2026-01-01", membershipTier: "standard" }));
});
