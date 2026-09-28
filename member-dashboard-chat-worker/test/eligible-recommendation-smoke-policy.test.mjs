import assert from "node:assert/strict";
import test from "node:test";

import {
  assertEligibleRecommendationSmoke,
  classifyEligibleRecommendationSmoke,
} from "../src/eligible-recommendation-smoke-policy.mjs";

function baseEnvelope() {
  return {
    mode: "eligible_kenji_recommendation",
    read_only: true,
    shadow_only: true,
    caller: "member-dashboard-chat-worker",
    canonical_context_real: true,
    eligible_client_found: true,
    customer_side_effects: false,
  };
}

test("customer-ready eligible smoke remains a strict success", () => {
  const body = {
    ...baseEnvelope(),
    ok: true,
    context_receipt: {
      identity_state: "known",
      identity_confidence: "high",
      adapter_complete: true,
      private_access_active: true,
      reviewed_preference_count: 0,
      prior_model_touch_count: 3,
      personalization_allowed: true,
    },
    recommendation_receipt: {
      upstream_ok: true,
      deployment_mode: "shadow",
      customer_ready: true,
      recommendation_count: 1,
      review_candidate_count: 0,
      recommendations: [{
        model_key: "mdl_pri_str_master",
        customer_rate_thb: 18000,
        price_visible: true,
        availability_state: "available_now",
      }],
    },
    guardrails: {
      auto_send_allowed: false,
      booking_confirmed: false,
      payment_confirmed: false,
      entitlement_mutated: false,
      source_rate_exposed: false,
      raw_notes_exposed: false,
    },
  };

  assert.deepEqual(classifyEligibleRecommendationSmoke(body, 200), {
    ok: true,
    classification: "customer_ready",
    deployment_healthy: true,
    customer_ready: true,
    recommendation_count: 1,
    review_candidate_count: 0,
  });
});

test("review-only live-data gap is deployment healthy but not customer-ready", () => {
  const body = {
    ...baseEnvelope(),
    ok: false,
    attempted_eligible_clients: 1,
    diagnostics: {
      max_scanned_profiles: 16,
      max_shortlisted_profiles: 12,
      max_access_matched_candidates: 3,
      max_recommendation_count: 0,
      max_review_candidate_count: 1,
      last_http_status: 200,
    },
    error: "eligible_clients_found_but_no_customer_ready_recommendation",
  };

  assert.deepEqual(classifyEligibleRecommendationSmoke(body, 409), {
    ok: true,
    classification: "review_only",
    deployment_healthy: true,
    customer_ready: false,
    recommendation_count: 0,
    review_candidate_count: 1,
    access_matched_candidates: 3,
  });
});

test("zero access matches remains a deployment failure", () => {
  const body = {
    ...baseEnvelope(),
    ok: false,
    attempted_eligible_clients: 1,
    diagnostics: {
      max_scanned_profiles: 16,
      max_shortlisted_profiles: 12,
      max_access_matched_candidates: 0,
      max_recommendation_count: 0,
      max_review_candidate_count: 0,
      last_http_status: 200,
    },
    error: "eligible_clients_found_but_no_customer_ready_recommendation",
  };
  assert.equal(classifyEligibleRecommendationSmoke(body, 409).ok, false);
});

test("upstream errors remain a deployment failure", () => {
  const body = {
    ...baseEnvelope(),
    ok: false,
    attempted_eligible_clients: 1,
    diagnostics: {
      max_scanned_profiles: 16,
      max_shortlisted_profiles: 12,
      max_access_matched_candidates: 3,
      max_recommendation_count: 0,
      max_review_candidate_count: 1,
      last_http_status: 503,
    },
    error: "eligible_clients_found_but_no_customer_ready_recommendation",
  };
  assert.equal(classifyEligibleRecommendationSmoke(body, 409).ok, false);
});

test("guardrail regressions remain fatal even with a recommendation", () => {
  const body = {
    ...baseEnvelope(),
    ok: true,
    context_receipt: {
      identity_state: "known",
      identity_confidence: "high",
      adapter_complete: true,
      private_access_active: true,
      reviewed_preference_count: 1,
      prior_model_touch_count: 0,
      personalization_allowed: true,
    },
    recommendation_receipt: {
      upstream_ok: true,
      deployment_mode: "shadow",
      customer_ready: true,
      recommendation_count: 1,
      recommendations: [{
        customer_rate_thb: 18000,
        price_visible: true,
        availability_state: "available_today",
      }],
    },
    guardrails: {
      auto_send_allowed: true,
      booking_confirmed: false,
      payment_confirmed: false,
      entitlement_mutated: false,
      source_rate_exposed: false,
      raw_notes_exposed: false,
    },
  };
  assert.throws(() => assertEligibleRecommendationSmoke(body, 200), /eligible_customer_ready_contract_invalid/);
});
