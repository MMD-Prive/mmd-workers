import assert from "node:assert/strict";
import test from "node:test";

import {
  ELIGIBLE_RECOMMENDATION_SHADOW_SMOKE_MODE,
  REAL_RECOMMENDATION_SHADOW_SMOKE_MODE,
  runEligibleKenjiRecommendationShadowSmoke,
  runRealKenjiRecommendationShadowSmoke,
  REAL_RECOMMENDATION_SHADOW_SMOKE_INTERNALS,
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
      customer_context: {
        entitlement_snapshot: {
          member_blocked: false,
          capability_state: {
            active: ["private_member"],
            recognized: ["premium"],
          },
          access: {
            private_visibility_envelope: "premium",
            new_model_reveals_allowed: true,
            protected_capabilities_active: ["private_models"],
          },
        },
      },
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


test("eligible shadow smoke requires active private access plus reviewed history and returns 1-3 rate+availability recommendations", async () => {
  const calls = [];
  const env = {
    INTERNAL_TOKEN: "internal-secret",
    ADMIN_WORKER: {
      async fetch(request) {
        calls.push(await request.json());
        return new Response(JSON.stringify({
          ok: true,
          deployment_mode: "shadow",
          customer_ready: true,
          recommendation_count: 2,
          discovery: {
            scanned_profiles: 28,
            shortlisted_profiles: 7,
            access_matched_candidates: 3,
          },
          recommendations: [
            {
              model_key: "MX17",
              safe_display_name: "SAFE NAME 1",
              sales: { customer_rate_thb: 12000, price_visible: true },
              availability: { state: "available_today" },
              match_reasons: ["reviewed_history_match", "available_today"],
              is_new_release: false,
              safe_next_action: "continue_to_booking_review",
            },
            {
              model_key: "MX29",
              safe_display_name: "SAFE NAME 2",
              sales: { customer_rate_thb: 15000, price_visible: true },
              availability: { state: "available_soon" },
              match_reasons: ["request_preference_match", "available_soon"],
              is_new_release: true,
              safe_next_action: "per_review_before_offer",
            },
          ],
          review_candidates: [],
          new_release: { included: true },
          guardrails: {
            auto_send_allowed: false,
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

  const result = await runEligibleKenjiRecommendationShadowSmoke(env, {
    eligibleSelections: async () => [{
      lineUserId: LINE_USER_ID,
      adapted: adaptedContext(),
      eligibility: {
        eligible: true,
        private_visibility_envelope: "premium",
        active_capability_count: 1,
        recognized_capability_count: 1,
        reviewed_preference_count: 1,
        prior_model_touch_count: 1,
        has_reviewed_history: true,
      },
    }],
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.mode, ELIGIBLE_RECOMMENDATION_SHADOW_SMOKE_MODE);
  assert.equal(result.payload.eligible_client_found, true);
  assert.equal(result.payload.context_receipt.private_access_active, true);
  assert.equal(result.payload.context_receipt.private_visibility_envelope, "premium");
  assert.equal(result.payload.context_receipt.reviewed_preference_count, 1);
  assert.equal(result.payload.context_receipt.prior_model_touch_count, 1);
  assert.equal(result.payload.recommendation_receipt.recommendation_count, 2);
  assert.equal(result.payload.recommendation_receipt.discovery.access_matched_candidates, 3);
  assert.equal(result.payload.recommendation_receipt.recommendations[0].customer_rate_thb, 12000);
  assert.equal(result.payload.recommendation_receipt.recommendations[0].availability_state, "available_today");
  assert.equal(result.payload.recommendation_receipt.recommendations[1].customer_rate_thb, 15000);
  assert.equal(result.payload.recommendation_receipt.recommendations[1].availability_state, "available_soon");
  assert.equal(result.payload.guardrails.auto_send_allowed, false);
  assert.equal(result.payload.customer_side_effects, false);
  assert.equal(calls.length, 1);

  const publicPayload = JSON.stringify(result.payload);
  assert.doesNotMatch(publicPayload, /U1234567890abcdef/);
  assert.doesNotMatch(publicPayload, /recPRIVATE123456/);
  assert.doesNotMatch(publicPayload, /PRIVATE NAME/);
  assert.doesNotMatch(publicPayload, /SAFE NAME/);
});

test("eligible shadow smoke rejects recommendations missing a customer rate or ready availability", async () => {
  const result = await runEligibleKenjiRecommendationShadowSmoke({}, {
    eligibleSelections: async () => [{
      lineUserId: LINE_USER_ID,
      adapted: adaptedContext(),
      eligibility: {
        eligible: true,
        private_visibility_envelope: "premium",
        active_capability_count: 1,
        recognized_capability_count: 1,
        reviewed_preference_count: 1,
        prior_model_touch_count: 1,
      },
    }],
    recommendationCaller: async () => ({
      status: 200,
      payload: {
        ok: true,
        deployment_mode: "shadow",
        customer_ready: true,
        recommendation_count: 1,
        discovery: { scanned_profiles: 20, shortlisted_profiles: 5, access_matched_candidates: 1 },
        recommendations: [{
          model_key: "MX17",
          sales: { customer_rate_thb: null, price_visible: false },
          availability: { state: "unknown" },
          match_reasons: [],
        }],
        review_candidates: [],
        guardrails: {
          auto_send_allowed: false,
          booking_confirmed: false,
          payment_confirmed: false,
          entitlement_mutated: false,
          source_rate_exposed: false,
          raw_notes_exposed: false,
        },
      },
    }),
  });

  assert.equal(result.status, 409);
  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.eligible_client_found, true);
  assert.equal(result.payload.error, "eligible_clients_found_but_no_customer_ready_recommendation");
  assert.equal(result.payload.diagnostics.max_access_matched_candidates, 1);
  assert.equal(result.payload.diagnostics.max_recommendation_count, 1);
});

test("eligible shadow smoke does not accept a canonical client without reviewed preference/history", async () => {
  const result = await runEligibleKenjiRecommendationShadowSmoke({}, {
    eligibleSelections: async () => [],
  });
  assert.equal(result.status, 409);
  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.eligible_client_found, false);
  assert.equal(result.payload.error, "eligible_private_client_with_reviewed_history_unavailable");
});


test("resolver-first candidate discovery prioritizes linked reviewed history and entitlement even when Clients verification field is blank", async () => {
  const unverifiedEligibleLine = "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const verifiedOnlyLine = "Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const seenUrls = [];
  const fetchImpl = async (url) => {
    seenUrls.push(url);
    return Response.json({
      records: [
        {
          id: "recVerifiedOnly",
          fields: {
            line_user_id: verifiedOnlyLine,
            "Verification Status": { name: "Verified" },
            "MMD — Member Entitlements": [],
            "MMD — Customer History Reviews": [],
          },
        },
        {
          id: "recResolverEligible",
          fields: {
            line_user_id: unverifiedEligibleLine,
            "MMD — Member Entitlements": ["recEntitlement"],
            "MMD — Customer History Reviews": ["recHistory1", "recHistory2"],
          },
        },
      ],
    });
  };

  const ids = await REAL_RECOMMENDATION_SHADOW_SMOKE_INTERNALS.listCanonicalCandidateLineIds({
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  }, fetchImpl);

  assert.deepEqual(ids.slice(0, 2), [unverifiedEligibleLine, verifiedOnlyLine]);
  assert.equal(seenUrls.length, 1);
  const requestUrl = new URL(seenUrls[0]);
  assert.equal(requestUrl.searchParams.get("filterByFormula"), 'LEN({line_user_id}&"")=33');
  assert.ok(requestUrl.searchParams.getAll("fields[]").includes("MMD — Member Entitlements"));
  assert.ok(requestUrl.searchParams.getAll("fields[]").includes("MMD — Customer History Reviews"));
  assert.doesNotMatch(requestUrl.searchParams.get("filterByFormula"), /Verification Status/i);
});

test("candidate priority keeps reviewed history plus entitlement ahead of legacy verified-only rows", () => {
  const priority = REAL_RECOMMENDATION_SHADOW_SMOKE_INTERNALS.candidatePriority;
  assert.ok(priority({
    fields: {
      "MMD — Member Entitlements": ["recEnt"],
      "MMD — Customer History Reviews": ["recHistory"],
    },
  }) > priority({
    fields: {
      "Verification Status": { name: "Verified" },
    },
  }));
});


test("paginated candidate discovery finds high-priority eligible candidates after the first Airtable page", async () => {
  const page1 = Array.from({ length: 100 }, (_, index) => ({
    id: `recPage1_${index}`,
    fields: {
      line_user_id: `U${String(index).padStart(32, "0")}`,
      "Verification Status": index === 0 ? { name: "Verified" } : undefined,
      "MMD — Member Entitlements": [],
      "MMD — Customer History Reviews": [],
    },
  }));
  const eligibleLine = "Uffffffffffffffffffffffffffffffff";
  const page2 = [{
    id: "recEligiblePage2",
    fields: {
      line_user_id: eligibleLine,
      "MMD — Member Entitlements": ["recEnt"],
      "MMD — Customer History Reviews": ["recHistory1", "recHistory2"],
    },
  }];

  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const parsed = new URL(url);
    if (!parsed.searchParams.get("offset")) {
      return Response.json({ records: page1, offset: "page-2" });
    }
    return Response.json({ records: page2 });
  };

  const ids = await REAL_RECOMMENDATION_SHADOW_SMOKE_INTERNALS.listCanonicalCandidateLineIds({
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  }, fetchImpl);

  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[1]).searchParams.get("offset"), "page-2");
  assert.equal(ids[0], eligibleLine);
});
