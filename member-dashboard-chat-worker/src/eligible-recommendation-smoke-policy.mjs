const READY_STATES = new Set(["available_now", "available_today", "available_soon", "limited"]);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function commonEnvelope(body = {}) {
  return (
    body.mode === "eligible_kenji_recommendation" &&
    body.read_only === true &&
    body.shadow_only === true &&
    body.caller === "member-dashboard-chat-worker" &&
    body.canonical_context_real === true &&
    body.eligible_client_found === true &&
    body.customer_side_effects === false
  );
}

function recommendationQuality(receipt = {}) {
  const recommendations = Array.isArray(receipt.recommendations) ? receipt.recommendations : [];
  if (recommendations.length < 1 || recommendations.length > 3) return false;
  return recommendations.every((item) =>
    Number.isFinite(Number(item.customer_rate_thb)) &&
    Number(item.customer_rate_thb) > 0 &&
    item.price_visible === true &&
    READY_STATES.has(item.availability_state)
  );
}

export function classifyEligibleRecommendationSmoke(body = {}, httpStatus = 0) {
  if (!commonEnvelope(body)) {
    return { ok: false, classification: "invalid_envelope", error: "eligible_smoke_envelope_invalid" };
  }

  const receipt = body.recommendation_receipt || {};
  const context = body.context_receipt || {};
  const guard = body.guardrails || {};

  if (body.ok === true && Number(httpStatus) === 200) {
    const contextHealthy =
      context.identity_state === "known" &&
      context.identity_confidence === "high" &&
      context.adapter_complete === true &&
      context.private_access_active === true &&
      (number(context.reviewed_preference_count) + number(context.prior_model_touch_count)) >= 1 &&
      context.personalization_allowed === true;

    const guardrailsHealthy =
      guard.auto_send_allowed === false &&
      guard.booking_confirmed === false &&
      guard.payment_confirmed === false &&
      guard.entitlement_mutated === false &&
      guard.source_rate_exposed === false &&
      guard.raw_notes_exposed === false;

    const receiptHealthy =
      receipt.upstream_ok === true &&
      receipt.deployment_mode === "shadow" &&
      receipt.customer_ready === true &&
      number(receipt.recommendation_count) >= 1 &&
      number(receipt.recommendation_count) <= 3 &&
      recommendationQuality(receipt);

    if (!contextHealthy || !guardrailsHealthy || !receiptHealthy) {
      return { ok: false, classification: "customer_ready_invalid", error: "eligible_customer_ready_contract_invalid" };
    }

    return {
      ok: true,
      classification: "customer_ready",
      deployment_healthy: true,
      customer_ready: true,
      recommendation_count: number(receipt.recommendation_count),
      review_candidate_count: number(receipt.review_candidate_count),
    };
  }

  const diagnostics = body.diagnostics || {};
  const safeReviewOnly =
    body.ok === false &&
    Number(httpStatus) === 409 &&
    body.error === "eligible_clients_found_but_no_customer_ready_recommendation" &&
    number(body.attempted_eligible_clients) >= 1 &&
    number(diagnostics.max_scanned_profiles) >= 1 &&
    number(diagnostics.max_shortlisted_profiles) >= 1 &&
    number(diagnostics.max_access_matched_candidates) >= 1 &&
    number(diagnostics.max_recommendation_count) === 0 &&
    number(diagnostics.max_review_candidate_count) >= 1 &&
    number(diagnostics.last_http_status) === 200;

  if (safeReviewOnly) {
    return {
      ok: true,
      classification: "review_only",
      deployment_healthy: true,
      customer_ready: false,
      recommendation_count: 0,
      review_candidate_count: number(diagnostics.max_review_candidate_count),
      access_matched_candidates: number(diagnostics.max_access_matched_candidates),
    };
  }

  return { ok: false, classification: "unsafe_failure", error: "eligible_smoke_not_customer_ready_or_safe_review_only" };
}

export function assertEligibleRecommendationSmoke(body = {}, httpStatus = 0) {
  const result = classifyEligibleRecommendationSmoke(body, httpStatus);
  if (!result.ok) {
    throw new Error(`${result.error}: ${JSON.stringify(body)}`);
  }
  return result;
}
