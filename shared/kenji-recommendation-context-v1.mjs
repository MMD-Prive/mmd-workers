import {
  KENJI_RECOMMENDATION_CONTEXT_SCHEMA,
  KENJI_RECOMMENDATION_MODEL_ACCESS_POLICY,
  MAX_PERMISSION_AGE_MS,
  finite,
  keywordTokens,
  list,
  normalizeLane,
  parseTime,
  safeModelKey,
  text,
  token,
  unique,
} from "./kenji-recommendation-contract-v1.mjs";

const REVIEWED_STATES = new Set(["approved", "reviewed", "verified", "materialized"]);
const NEGATIVE_STRENGTHS = new Set(["avoid", "negative", "dislike", "do_not_recommend", "never"]);
const POSITIVE_TOUCH_TYPES = new Set(["booked", "completed", "favorite", "liked", "requested", "repeat"]);
const NEGATIVE_TOUCH_TYPES = new Set(["blocked", "complaint", "declined", "disliked", "not_interested", "unsafe"]);

export function normalizeRecommendationRequest(input = {}) {
  const request = input.request && typeof input.request === "object" ? input.request : {};
  return {
    lane: normalizeLane(request.lane),
    city: token(request.city),
    zones: keywordTokens(request.zones, 12),
    preferences: keywordTokens(request.preferences, 24),
    budget_min_thb: finite(request?.budget_thb?.min ?? request.budget_min_thb),
    budget_max_thb: finite(request?.budget_thb?.max ?? request.budget_max_thb),
    operational_filters: request.operational_filters && typeof request.operational_filters === "object"
      ? { burn: request.operational_filters.burn, mk: request.operational_filters.mk, live: request.operational_filters.live }
      : {},
  };
}

export function resolveRecommendationPermissionGate(input = {}, nowMs) {
  const gate = input.permission_gate && typeof input.permission_gate === "object" ? input.permission_gate : {};
  const evaluatedAt = parseTime(gate.evaluated_at);
  const fresh = evaluatedAt !== null && evaluatedAt <= nowMs + 60_000 && nowMs - evaluatedAt <= MAX_PERMISSION_AGE_MS;
  const valid = gate.applied === true
    && text(gate.policy_version, 100) === KENJI_RECOMMENDATION_MODEL_ACCESS_POLICY
    && fresh;
  return {
    valid,
    evaluated_at: evaluatedAt === null ? "" : new Date(evaluatedAt).toISOString(),
    reason: valid ? "permission_gate_applied" : !fresh ? "permission_gate_stale_or_missing" : "permission_gate_policy_mismatch",
  };
}

export function personalizationAllowed(customer = {}) {
  const identity = customer.identity && typeof customer.identity === "object" ? customer.identity : {};
  const safety = customer.safety && typeof customer.safety === "object" ? customer.safety : {};
  return text(customer.schema_version, 100) === KENJI_RECOMMENDATION_CONTEXT_SCHEMA
    && customer.context_only === true
    && customer.live_truth_wins === true
    && token(identity.state) === "known"
    && token(identity.confidence) === "high"
    && safety.may_personalize === true
    && safety.review_required !== true
    && safety.stale !== true;
}

export function resolveRecommendationPersonalization(customer = {}) {
  const positivePreferences = [];
  const negativePreferences = [];
  const positiveTouches = new Set();
  const negativeTouches = new Set();
  const neutralTouches = new Set();
  if (!personalizationAllowed(customer)) {
    return { preferences: { positive: [], negative: [] }, touches: { positive: positiveTouches, negative: negativeTouches, neutral: neutralTouches } };
  }

  for (const raw of list(customer.reviewed_preferences)) {
    const item = raw && typeof raw === "object" ? raw : {};
    if (!REVIEWED_STATES.has(token(item.review_status || item.status))) continue;
    const values = keywordTokens(item.normalized_summary || item.customer_safe_summary || item.summary || item.preference, 16);
    if (NEGATIVE_STRENGTHS.has(token(item.preference_strength || item.strength))) negativePreferences.push(...values);
    else positivePreferences.push(...values);
  }

  for (const raw of list(customer.prior_model_touches)) {
    const item = typeof raw === "string" ? { model_key: raw } : (raw && typeof raw === "object" ? raw : {});
    const key = safeModelKey(item.model_key || item.model_ref || item.key).toLowerCase();
    if (!key) continue;
    const relation = token(item.relationship || item.touch_type);
    if (NEGATIVE_TOUCH_TYPES.has(relation)) negativeTouches.add(key);
    else if (POSITIVE_TOUCH_TYPES.has(relation)) positiveTouches.add(key);
    else neutralTouches.add(key);
  }

  return {
    preferences: { positive: unique(positivePreferences, 24), negative: unique(negativePreferences, 24) },
    touches: { positive: positiveTouches, negative: negativeTouches, neutral: neutralTouches },
  };
}

export function operationalFilterState(requestFilters = {}, flags = {}) {
  let unresolved = false;
  for (const key of ["burn", "mk", "live"]) {
    if (requestFilters[key] !== true && requestFilters[key] !== false) continue;
    if (flags[key] !== true && flags[key] !== false) unresolved = true;
    else if (flags[key] !== requestFilters[key]) return "mismatch";
  }
  return unresolved ? "unresolved" : "match";
}
