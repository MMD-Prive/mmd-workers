import test from "node:test";
import assert from "node:assert/strict";

import { inferMembershipPayment, membershipInferenceLabel } from "./payment-intelligence.mjs";

test("recognises the 1,999 THB history-qualified Premium renewal", () => {
  const result = inferMembershipPayment({ amount_thb: 1999, linked_member: true });
  assert.equal(result.inferred_stage, "membership");
  assert.equal(result.inferred_intent, "renewal");
  assert.equal(result.inferred_package_code, "premium");
  assert.equal(result.inferred_price_rule, "private_premium_spend_20000");
  assert.equal(result.inferred_term_days, 730);
  assert.equal(result.pending_member_profile, false);
  assert.equal(result.may_activate_membership, false);
  assert.equal(membershipInferenceLabel(result), "ต่ออายุ Private Premium");
});

test("stages an identity claim when a recognised membership payment is not linked", () => {
  const result = inferMembershipPayment({ amount_thb: 1999 });
  assert.equal(result.identity_state, "pending_identity_match");
  assert.equal(result.pending_member_profile, true);
  assert.equal(result.history_lookup_requested, true);
  assert.equal(result.official_verification_required, true);
});

test("does not invent membership intent for an arbitrary service amount", () => {
  assert.equal(inferMembershipPayment({ amount_thb: 27500 }), null);
});

