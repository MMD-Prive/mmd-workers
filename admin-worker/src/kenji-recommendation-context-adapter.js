import {
  KENJI_RECOMMENDATION_AVAILABILITY_SCHEMA,
  KENJI_RECOMMENDATION_CONTEXT_SCHEMA,
  list,
  safeDisplayText,
  safeModelKey,
  text,
  token,
} from "../../shared/kenji-recommendation-contract-v1.mjs";

export function boundedRecommendationCustomerContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    schema_version: text(value.schema_version, 100),
    context_only: value.context_only === true,
    live_truth_wins: value.live_truth_wins === true,
    identity: value.identity && typeof value.identity === "object"
      ? { state: token(value.identity.state), confidence: token(value.identity.confidence) }
      : {},
    safety: value.safety && typeof value.safety === "object"
      ? { may_personalize: value.safety.may_personalize === true, review_required: value.safety.review_required === true, stale: value.safety.stale === true }
      : {},
    reviewed_preferences: list(value.reviewed_preferences).slice(0, 8).map((item) => ({
      status: token(item?.review_status || item?.status),
      strength: token(item?.preference_strength || item?.strength),
      summary: safeDisplayText(item?.normalized_summary || item?.customer_safe_summary || item?.summary || item?.preference, 180),
    })),
    prior_model_touches: list(value.prior_model_touches).slice(0, 8).map((item) => ({
      model_key: safeModelKey(typeof item === "string" ? item : item?.model_key || item?.model_ref || item?.key),
      relationship: token(typeof item === "string" ? "" : item?.relationship || item?.touch_type),
    })),
  };
}

export function isBoundedRecommendationContext(value = {}) {
  return value.schema_version === KENJI_RECOMMENDATION_CONTEXT_SCHEMA
    && value.context_only === true
    && value.live_truth_wins === true;
}

export async function readRecommendationAvailability(env = {}, modelKey = "", provider = null) {
  if (typeof provider === "function") {
    try { return await provider(modelKey); } catch { return null; }
  }
  const binding = env.SIGIL_AVAILABILITY_SNAPSHOTS;
  if (!binding || typeof binding.get !== "function") return null;
  try {
    const value = await binding.get(`availability:v1:${modelKey}`, { type: "json" });
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export async function mapRecommendationCandidates(items, mapper, limit = 4) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function recommendationSourceProjection() {
  return {
    availability: KENJI_RECOMMENDATION_AVAILABILITY_SCHEMA,
    customer_context: KENJI_RECOMMENDATION_CONTEXT_SCHEMA,
  };
}
