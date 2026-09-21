import assert from "node:assert/strict";
import test from "node:test";

import {
  REAL_RECOMMENDATION_SHADOW_SMOKE_MODE,
  runRealKenjiRecommendationShadowSmoke,
} from "../src/internal-kenji-recommendation-shadow-smoke.mjs";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";

function adaptedContext() {
  return {
    ok: true,
    context_bundle: {
      identity: {
        state: "known",
        confidence: "high",
        canonical_client_ref: "client:recPRIVATE123456",
        preferred_name: "PRIVATE NAME",
      },
      reviewed_preferences: [
        {
          review_status: "reviewed",
          normalized_summary: "athletic friendly",
          preference_strength: "positive",
        },
      ],
      prior_model_touches: [
        { model_key: "MX01", relationship: "completed" },
      ],
      conversation_matrix: {
        schema_version: "mmd.kenji_conversation_matrix.v1",
      },
      domain_guard: {
        review_required: false,
      },
      rights_authority: "my_mmd_entitlement_resolver_v1",
    },
    telemetry: {
      identity_state: "known",
      adapter_complete: true,
      memory_candidate: true,
      matrix_version: 4,
      review_required: false,
    },
  };
}

test("real shadow smoke uses authenticated member-dashboard service binding and returns only bounded diagnostics", async () => {
  const calls = [];
  const env = {
    INTERNAL_TOKEN: "internal-secret",
    ADMIN_WORKER: {
      async fetch(request) {
        calls.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: await request.json(),
        });
        return new Response(JSON.stringify({
          ok: true,
          deployment_mode: "shadow",
          customer_ready: true,
          recommendation_count: 1,
          recommendations: [{
            model_key: "MX17",
            safe_display_name: "SAFE NAME",
            sales: {
              customer_rate_thb: 12000,
              price_visible: true,
            },
            availability: {
              state: "available_today",
            },
            match_reasons: ["reviewed_history_match", "available_today"],
            is_new_release: false,
            safe_next_action: "continue_to_booking_review",
          }],
          review_candidates: [],
          new_release: { included: false },
          guardrails: {
            auto_send_allowed: false,
            booking_confirmed: false,
            payment_confirmed: false,
            entitlement_mutated: false,
            source_rate_exposed: false,
            raw_notes_exposed: false,
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  };

  const result = await runRealKenjiRecommendationShadowSmoke(env, {
    contextSelector: async () => ({
      lineUserId: LINE_USER_ID,
      adapted: adaptedContext(),
      score: 15,
    }),
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.mode, REAL_RECOMMENDATION_SHADOW_SMOKE_MODE);
  assert.equal(result.payload.canonical_context_real, true);
  assert.equal(result.payload.customer_side_effects, false);
  assert.equal(result.payload.context_receipt.identity_state, "known");
  assert.equal(result.payload.context_receipt.identity_confidence, "high");
  assert.equal(result.payload.context_receipt.personalization_allowed, true);
  assert.equal(result.payload.recommendation_receipt.deployment_mode, "shadow");
  assert.equal(result.payload.recommendation_receipt.recommendation_count, 1);
  assert.deepEqual(result.payload.recommendation_receipt.recommendations, [{
    model_key: "MX17",
    customer_rate_thb: 12000,
    price_visible: true,
    availability_state: "available_today",
    match_reasons: ["reviewed_history_match", "available_today"],
    is_new_release: false,
    safe_next_action: "continue_to_booking_review",
  }]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://admin-worker.local/v1/internal/kenji/recommendations");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.authorization, "Bearer internal-secret");
  assert.equal(calls[0].headers["x-mmd-internal-call"], "true");
  assert.equal(calls[0].headers["x-mmd-service-binding"], "member-dashboard-chat-worker");
  assert.equal(calls[0].body.line_user_id, LINE_USER_ID);
  assert.equal(calls[0].body.customer_context.identity.state, "known");
  assert.equal(calls[0].body.customer_context.safety.may_personalize, true);

  const publicPayload = JSON.stringify(result.payload);
  assert.doesNotMatch(publicPayload, /U1234567890abcdef/);
  assert.doesNotMatch(publicPayload, /recPRIVATE123456/);
  assert.doesNotMatch(publicPayload, /PRIVATE NAME/);
  assert.doesNotMatch(publicPayload, /SAFE NAME/);
  assert.equal(result.payload.guardrails.auto_send_allowed, false);
  assert.equal(result.payload.guardrails.booking_confirmed, false);
  assert.equal(result.payload.guardrails.payment_confirmed, false);
  assert.equal(result.payload.guardrails.entitlement_mutated, false);
});

test("real shadow smoke fails closed if upstream ever enables customer send or mutation", async () => {
  const env = {
    INTERNAL_TOKEN: "internal-secret",
    ADMIN_WORKER: {
      async fetch() {
        return new Response(JSON.stringify({
          ok: true,
          deployment_mode: "shadow",
          recommendations: [],
          review_candidates: [],
          guardrails: {
            auto_send_allowed: true,
            booking_confirmed: false,
            payment_confirmed: false,
            entitlement_mutated: false,
            source_rate_exposed: false,
            raw_notes_exposed: false,
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  };

  const result = await runRealKenjiRecommendationShadowSmoke(env, {
    contextSelector: async () => ({ lineUserId: LINE_USER_ID, adapted: adaptedContext() }),
  });

  assert.equal(result.status, 502);
  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.guardrails.auto_send_allowed, true);
});

test("real shadow smoke returns no customer detail when no verified canonical context can be selected", async () => {
  const result = await runRealKenjiRecommendationShadowSmoke({}, {
    contextSelector: async () => null,
  });

  assert.equal(result.status, 409);
  assert.deepEqual(result.payload, {
    ok: false,
    mode: REAL_RECOMMENDATION_SHADOW_SMOKE_MODE,
    read_only: true,
    shadow_only: true,
    canonical_context_real: false,
    customer_side_effects: false,
    error: "real_verified_canonical_context_unavailable",
  });
});
