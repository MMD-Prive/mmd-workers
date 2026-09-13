import test from "node:test";
import assert from "node:assert/strict";

import { classifyPaymentOpsRoute, inferMembershipPayment, membershipInferenceLabel } from "./payment-intelligence.mjs";

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

test("routes explicit web membership proof to Membership even before Official Verify", () => {
  const route = classifyPaymentOpsRoute({
    payment_stage: "membership",
    amount_thb: 2500,
    package_code: "premium",
    source_page: "pay_membership",
  });
  assert.equal(route.topic, "membership");
  assert.equal(route.flow, "membership");
  assert.equal(route.classification, "membership_payment");
  assert.equal(route.inference?.inferred_intent, "renewal");
  assert.equal(route.should_alert, false);
  assert.equal(route.may_activate_membership, false);
});

test("routes explicit LINE renewal language to Membership even when OCR amount is not available yet", () => {
  const route = classifyPaymentOpsRoute({ context_text: "ขอต่ออายุสมาชิกครับ โอนแล้ว" });
  assert.equal(route.topic, "membership");
  assert.equal(route.classification, "membership_payment");
  assert.equal(route.inference, null);
  assert.equal(route.official_verification_required, true);
});

test("does not route service deposit to Membership just because the amount matches a renewal price", () => {
  const route = classifyPaymentOpsRoute({ payment_stage: "deposit", amount_thb: 2500 });
  assert.equal(route.topic, "payment");
  assert.equal(route.classification, "service_payment");
  assert.equal(route.inferred_membership, true);
  assert.equal(route.should_alert, false);
});

test("keeps amount-only membership matches in Payment until membership context is confirmed", () => {
  const route = classifyPaymentOpsRoute({ amount_thb: 2999 });
  assert.equal(route.topic, "payment");
  assert.equal(route.classification, "unresolved_payment");
  assert.equal(route.reason, "amount_matches_membership_but_context_unconfirmed");
});

test("membership amount/package conflict stays in Payment and raises an exception flag", () => {
  const route = classifyPaymentOpsRoute({
    payment_stage: "membership",
    amount_thb: 2999,
    package_code: "standard",
  });
  assert.equal(route.topic, "payment");
  assert.equal(route.classification, "conflict");
  assert.equal(route.reason, "membership_amount_package_mismatch");
  assert.equal(route.should_alert, true);
});

test("contradictory service and membership context fails safe to Payment + Alerts", () => {
  const route = classifyPaymentOpsRoute({
    payment_stage: "deposit",
    context_text: "ค่าสมาชิก Premium",
  });
  assert.equal(route.topic, "payment");
  assert.equal(route.reason, "conflicting_payment_context");
  assert.equal(route.should_alert, true);
});
