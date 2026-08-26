import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  POINTS_POLICY,
  PUBLIC_COMPANION_MEMBERSHIP_PACKAGES,
  floorMembershipPoints,
  membershipPointsLedgerReasons,
  verifiedMembershipPaymentMetadata,
} from "./public-companion-membership-packages.mjs";

describe("Public Companion Membership package contract", () => {
  it("uses FLOOR only at the 100 THB boundary", () => {
    assert.equal(floorMembershipPoints(99), 0);
    assert.equal(floorMembershipPoints(100), 1);
    assert.equal(floorMembershipPoints(199), 1);
    assert.equal(floorMembershipPoints(690), 6);
    assert.equal(floorMembershipPoints(1499), 14);
    assert.equal(floorMembershipPoints(14999), 149);
  });

  it("locks the exact package metadata", () => {
    assert.deepEqual(Object.values(PUBLIC_COMPANION_MEMBERSHIP_PACKAGES).map((pkg) => ({
      id: pkg.id,
      label: pkg.label,
      price_thb: pkg.price_thb,
      term_months: pkg.term_months,
      points_awarded_floor: pkg.points_awarded_floor,
      visibility_lane: pkg.visibility_lane,
      requires_identity_gate: pkg.requires_identity_gate,
      requires_manual_review: pkg.requires_manual_review,
      public_display_level: pkg.public_display_level,
    })), [
      { id: "public_info_member_690_yearly", label: "Public Info Member", price_thb: 690, term_months: 12, points_awarded_floor: 6, visibility_lane: "public_info", requires_identity_gate: true, requires_manual_review: false, public_display_level: "public" },
      { id: "freelance_model_access_1499_yearly", label: "Freelance Model Access", price_thb: 1499, term_months: 12, points_awarded_floor: 14, visibility_lane: "public_model_deep_category", requires_identity_gate: true, requires_manual_review: false, public_display_level: "public" },
      { id: "red_card_dining_14999_3y_intro", label: "Red Card Dining Access", price_thb: 14999, term_months: 36, points_awarded_floor: 149, visibility_lane: "red_card_dining_review", requires_identity_gate: true, requires_manual_review: true, public_display_level: "teaser" },
    ]);
  });

  it("keeps Red Card review-only and builds server-owned payment metadata", () => {
    const metadata = verifiedMembershipPaymentMetadata({
      package_id: "red_card_dining_14999_3y_intro",
      source_route: "/services/companion",
      entry_context: "identity_verified",
    });
    assert.equal(metadata.requires_manual_review, true);
    assert.equal(metadata.points_policy, POINTS_POLICY);
    assert.equal(metadata.points_awarded, 149);
    assert.deepEqual(membershipPointsLedgerReasons(metadata.package_id), [
      "membership_package_payment",
      "red_card_dining_access_intro",
    ]);
  });
});
