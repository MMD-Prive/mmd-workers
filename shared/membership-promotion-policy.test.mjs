import assert from "node:assert/strict";
import test from "node:test";

import { applyMembershipPromotion, currentPrivateMembershipPromotion } from "./membership-promotion-policy.mjs";

test("CARE BACK applies from August 2026 only to Private Standard and Premium", () => {
  assert.equal(currentPrivateMembershipPromotion({ package_code: "standard", verified_at: "2026-07-31T16:59:59.999Z", action: "renewal" }), null);
  assert.equal(currentPrivateMembershipPromotion({ package_code: "mmd_member", verified_at: "2026-09-17T00:00:00.000Z", action: "signup" }), null);
  assert.equal(currentPrivateMembershipPromotion({ package_code: "standard", verified_at: "2026-09-17T00:00:00.000Z", action: "renewal" }).bonus_days, 180);
  assert.equal(currentPrivateMembershipPromotion({ package_code: "premium", verified_at: "2026-09-17T00:00:00.000Z", action: "renewal" }).bonus_years, 1);
});

test("CARE BACK promotion preserves calendar semantics", () => {
  const standard = currentPrivateMembershipPromotion({ package_code: "standard", verified_at: "2026-09-17T00:00:00.000Z", action: "signup" });
  const premium = currentPrivateMembershipPromotion({ package_code: "premium", verified_at: "2026-09-17T00:00:00.000Z", action: "signup" });
  assert.equal(applyMembershipPromotion("2027-09-17T00:00:00.000Z", standard).toISOString(), "2028-03-15T00:00:00.000Z");
  assert.equal(applyMembershipPromotion("2028-02-29T00:00:00.000Z", premium).toISOString(), "2029-02-28T00:00:00.000Z");
});
