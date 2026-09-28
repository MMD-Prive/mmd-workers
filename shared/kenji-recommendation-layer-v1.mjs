import {
  KENJI_RECOMMENDATION_MODEL_ACCESS_POLICY,
  KENJI_RECOMMENDATION_POLICY_VERSION,
  KENJI_RECOMMENDATION_SCHEMA,
  MAX_RECOMMENDATIONS,
  MAX_REVIEW_CANDIDATES,
  list,
  parseTime,
} from "./kenji-recommendation-contract-v1.mjs";
import {
  normalizeRecommendationRequest,
  resolveRecommendationPermissionGate,
  resolveRecommendationPersonalization,
} from "./kenji-recommendation-context-v1.mjs";
import {
  compareRecommendationCandidates,
  normalizeRecommendationCandidate,
  publicRecommendation,
} from "./kenji-recommendation-candidate-v1.mjs";

export * from "./kenji-recommendation-contract-v1.mjs";

function errorResult(code, detail = {}) {
  return {
    ok: false,
    schema: KENJI_RECOMMENDATION_SCHEMA,
    policy_version: KENJI_RECOMMENDATION_POLICY_VERSION,
    error: { code, ...detail },
    recommendations: [],
    review_candidates: [],
  };
}

export function buildKenjiRecommendations(input = {}, options = {}) {
  const nowMs = parseTime(options.now || input.evaluated_at || new Date().toISOString());
  if (nowMs === null) return errorResult("invalid_evaluated_at");
  const permission = resolveRecommendationPermissionGate(input, nowMs);
  if (!permission.valid) return errorResult("permission_gate_required", { reason: permission.reason });

  const request = normalizeRecommendationRequest(input);
  const customer = input.customer_context && typeof input.customer_context === "object" ? input.customer_context : {};
  const personalization = resolveRecommendationPersonalization(customer);
  const context = { nowMs, request, ...personalization };
  const normalized = list(input.candidates)
    .map((candidate) => normalizeRecommendationCandidate(candidate, context))
    .filter(Boolean)
    .sort(compareRecommendationCandidates);
  const ready = normalized.filter((candidate) => candidate.customer_ready).slice(0, MAX_RECOMMENDATIONS);
  const review = normalized.filter((candidate) => !candidate.customer_ready).slice(0, MAX_REVIEW_CANDIDATES);

  return {
    ok: true,
    schema: KENJI_RECOMMENDATION_SCHEMA,
    policy_version: KENJI_RECOMMENDATION_POLICY_VERSION,
    evaluated_at: new Date(nowMs).toISOString(),
    permission_gate: { applied: true, policy_version: KENJI_RECOMMENDATION_MODEL_ACCESS_POLICY, evaluated_at: permission.evaluated_at },
    customer_ready: ready.length > 0,
    recommendation_count: ready.length,
    recommendations: ready.map(publicRecommendation),
    review_candidates: review.map((candidate) => ({
      model_key: candidate.model_key,
      safe_display_name: candidate.safe_display_name,
      reason: candidate.review_reason,
      safe_next_action: candidate.review_reason === "price_verification_required" ? "verify_customer_price_before_offer" : "verify_live_availability_before_offer",
    })),
    new_release: { included: ready.some((candidate) => candidate.is_new_release), policy: "relevant_only" },
    guardrails: {
      access_prevalidated_required: true,
      canonical_sales_offer_required: true,
      fresh_sanitized_availability_required: true,
      reviewed_history_is_context_only: true,
      source_rate_exposed: false,
      raw_notes_exposed: false,
      booking_confirmed: false,
      payment_confirmed: false,
      entitlement_mutated: false,
      auto_send_allowed: false,
    },
  };
}
