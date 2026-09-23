import {
  KENJI_RECOMMENDATION_AVAILABILITY_SCHEMA,
  KENJI_RECOMMENDATION_CONTEXT_SCHEMA,
  KENJI_RECOMMENDATION_MODEL_ACCESS_POLICY,
} from "./kenji-recommendation-layer-v1.mjs";
import { MODEL_SALES_POLICY_VERSION } from "./model-sales-control-v1.mjs";

export const NOW = "2026-09-21T16:00:00.000Z";

export function gate(overrides = {}) {
  return {
    applied: true,
    policy_version: KENJI_RECOMMENDATION_MODEL_ACCESS_POLICY,
    evaluated_at: "2026-09-21T15:58:00.000Z",
    ...overrides,
  };
}

export function candidate(overrides = {}) {
  return {
    model_key: "MX17",
    safe_display_name: "น้องซิน",
    model_lane: "both",
    access_allowed: true,
    safe_keywords: ["athletic", "friendly"],
    summary: "Athletic and friendly style",
    availability: {
      schema: KENJI_RECOMMENDATION_AVAILABILITY_SCHEMA,
      safe_availability_state: "available_today",
      updated_at: "2026-09-21T15:55:00.000Z",
      expires_at: "2026-09-21T18:00:00.000Z",
      city: "Bangkok",
      zones: ["sukhumvit"],
      operational_flags: { burn: false, mk: false, live: true },
    },
    sales: {
      policy_version: MODEL_SALES_POLICY_VERSION,
      sellable: true,
      visibility: "on",
      customer_rate_thb: 12000,
      price_visible: true,
      requires_per_approval: false,
      rule_version: 3,
    },
    ...overrides,
  };
}

export function input(candidates, overrides = {}) {
  return {
    evaluated_at: NOW,
    permission_gate: gate(),
    request: {
      lane: "gay",
      city: "Bangkok",
      zones: ["sukhumvit"],
      preferences: ["athletic"],
      budget_thb: { max: 15000 },
      operational_filters: { burn: false, mk: false, live: true },
    },
    customer_context: {
      schema_version: KENJI_RECOMMENDATION_CONTEXT_SCHEMA,
      context_only: true,
      live_truth_wins: true,
      identity: { state: "known", confidence: "high" },
      safety: { may_personalize: true, review_required: false, stale: false },
      reviewed_preferences: [{ status: "reviewed", strength: "positive", summary: "friendly athletic" }],
      prior_model_touches: [{ model_key: "OLD01", relationship: "completed" }],
    },
    candidates,
    ...overrides,
  };
}
