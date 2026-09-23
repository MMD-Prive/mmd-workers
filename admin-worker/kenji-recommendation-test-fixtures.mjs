import {
  KENJI_RECOMMENDATION_AVAILABILITY_SCHEMA,
  KENJI_RECOMMENDATION_CONTEXT_SCHEMA,
} from "../shared/kenji-recommendation-layer-v1.mjs";
import { KENJI_RECOMMENDATION_RPC_PATH } from "./src/kenji-recommendation-rpc.js";

export const NOW = "2026-09-21T16:00:00.000Z";
export const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
export const ENV = { INTERNAL_TOKEN: "internal-token", KENJI_RECOMMENDATION_MODE: "shadow" };

export function profile(overrides = {}) {
  return { model_key: "MX17", working_name: "น้องซิน", model_lane: "both", safe_keywords: ["athletic", "friendly"], summary: "ข้อมูลแนะนำที่อนุมัติแล้ว", is_new_release: false, release_status: "", ...overrides };
}

export function access(modelKey, overrides = {}) {
  return {
    status: "match",
    model: {
      model_code: modelKey,
      working_name: `Model ${modelKey}`,
      summary: "Approved summary",
      image_url: "https://images.example.test/model.webp",
      sales: { sellable: true, visibility: "on", customer_rate_thb: 12000, price_visible: true, requires_per_approval: false, reason_code: "matched_active_rule", term_summary: "Always", rule_version: 2 },
      ...overrides,
    },
  };
}

export function availability(overrides = {}) {
  return {
    schema: KENJI_RECOMMENDATION_AVAILABILITY_SCHEMA,
    safe_availability_state: "available_today",
    updated_at: "2026-09-21T15:55:00.000Z",
    expires_at: "2026-09-21T18:00:00.000Z",
    city: "Bangkok",
    zones: ["sukhumvit"],
    operational_flags: { burn: false, mk: false, live: true },
    ...overrides,
  };
}

export function body(overrides = {}) {
  return {
    line_user_id: LINE_USER_ID,
    evaluated_at: NOW,
    request: { lane: "gay", city: "Bangkok", zones: ["sukhumvit"], preferences: ["athletic"], budget_thb: { max: 15000 }, operational_filters: { burn: false, mk: false, live: true } },
    customer_context: {
      schema_version: KENJI_RECOMMENDATION_CONTEXT_SCHEMA,
      context_only: true,
      live_truth_wins: true,
      identity: { state: "known", confidence: "high", canonical_client_ref: "recPRIVATE" },
      safety: { may_personalize: true },
      reviewed_preferences: [{ status: "reviewed", summary: "friendly" }],
      prior_model_touches: [{ model_key: "OLD01", relationship: "completed", private_note: "never expose" }],
      raw_transcript: "private transcript",
    },
    ...overrides,
  };
}

export function options(overrides = {}) {
  return {
    now: NOW,
    profileProvider: async () => [profile()],
    modelAccessResolver: async (_env, input) => access(input.query),
    availabilityProvider: async () => availability(),
    ...overrides,
  };
}

export function request(payload = body(), overrides = {}) {
  const method = overrides.method || "POST";
  return new Request(`https://admin-worker.local${KENJI_RECOMMENDATION_RPC_PATH}`, {
    method,
    headers: { authorization: "Bearer internal-token", "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker", ...(overrides.headers || {}) },
    body: method === "POST" ? JSON.stringify(payload) : undefined,
  });
}
