import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPublicCompanionPaymentMetadata,
  computePoints,
  shouldAwardPointsForVerifiedPayment,
} from "./index.js";

describe("payments-worker Public Companion Membership readiness", () => {
  it("uses FLOOR when the production Points rate is 100 THB", () => {
    const env = { POINTS_RATE: "100" };
    assert.equal(computePoints(env, 690), 6);
    assert.equal(computePoints(env, 1499), 14);
    assert.equal(computePoints(env, 14999), 149);
  });

  it("does not authorize Points before payment is verified", () => {
    assert.equal(shouldAwardPointsForVerifiedPayment({ verification_status: "pending" }), false);
    assert.equal(shouldAwardPointsForVerifiedPayment({ verification_status: "pending_review" }), false);
    assert.equal(shouldAwardPointsForVerifiedPayment({}), false);
    assert.equal(shouldAwardPointsForVerifiedPayment({ verification_status: "verified" }), true);
  });

  it("builds canonical payment metadata only when the server amount matches", () => {
    assert.equal(buildPublicCompanionPaymentMetadata({
      package_id: "public_info_member_690_yearly",
      amount_thb: 691,
    }), null);
    assert.deepEqual(buildPublicCompanionPaymentMetadata({
      package_id: "public_info_member_690_yearly",
      amount_thb: 690,
      source_route: "/member/membership",
      entry_context: "identity_verified",
    }), {
      package_id: "public_info_member_690_yearly",
      package_label: "Public Info Member",
      amount_thb: 690,
      term_months: 12,
      points_policy: "floor_100_thb_1_point",
      points_awarded: 6,
      source_route: "/member/membership",
      entry_context: "identity_verified",
      requires_manual_review: false,
      visibility_lane: "public_info",
    });
  });
});
