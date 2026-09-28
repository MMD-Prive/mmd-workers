import assert from "node:assert/strict";
import test from "node:test";
import { buildKenjiRecommendations, KENJI_RECOMMENDATION_CONTEXT_SCHEMA } from "./kenji-recommendation-layer-v1.mjs";
import { NOW, candidate, input } from "./kenji-recommendation-test-fixtures.mjs";

test("only reviewed history from a verified bounded context influences ranking", () => {
  const candidates = [
    candidate({ model_key: "ATH1", safe_display_name: "Athletic", safe_keywords: ["athletic"] }),
    candidate({ model_key: "SOFT1", safe_display_name: "Soft", safe_keywords: ["soft"] }),
  ];
  const reviewed = buildKenjiRecommendations(input(candidates, {
    request: { ...input([]).request, preferences: [] },
    customer_context: { ...input([]).customer_context, reviewed_preferences: [
      { status: "pending", summary: "soft" },
      { status: "reviewed", summary: "athletic" },
    ] },
  }), { now: NOW });
  assert.equal(reviewed.recommendations[0].model_key, "ATH1");
  assert(reviewed.recommendations[0].match_reasons.includes("reviewed_history_match"));

  const ambiguous = buildKenjiRecommendations(input(candidates, {
    request: { ...input([]).request, preferences: [] },
    customer_context: { ...input([]).customer_context, identity: { state: "ambiguous", confidence: "low" }, reviewed_preferences: [{ status: "reviewed", summary: "soft" }] },
  }), { now: NOW });
  assert(ambiguous.recommendations.every((item) => !item.match_reasons.includes("reviewed_history_match")));
});

test("negative preference and complaint/block history exclude candidates", () => {
  const result = buildKenjiRecommendations(input([
    candidate({ model_key: "NOATH1", safe_display_name: "Avoid Style", safe_keywords: ["athletic"] }),
    candidate({ model_key: "BLOCK1", safe_display_name: "Blocked Model", safe_keywords: ["friendly"] }),
    candidate({ model_key: "OK1", safe_display_name: "Okay", safe_keywords: ["friendly"] }),
  ], {
    request: { ...input([]).request, preferences: [] },
    customer_context: { ...input([]).customer_context,
      reviewed_preferences: [{ status: "reviewed", strength: "avoid", summary: "athletic" }],
      prior_model_touches: [{ model_key: "BLOCK1", relationship: "complaint" }],
    },
  }), { now: NOW });
  assert.deepEqual(result.recommendations.map((item) => item.model_key), ["OK1"]);
});

test("New Release is inserted only when relevant to request or reviewed history", () => {
  const result = buildKenjiRecommendations(input([
    candidate({ model_key: "REG1", safe_display_name: "Regular", safe_keywords: ["athletic"] }),
    candidate({ model_key: "NEW1", safe_display_name: "New Relevant", safe_keywords: ["athletic", "friendly"], is_new_release: true }),
    candidate({ model_key: "NEW2", safe_display_name: "New Irrelevant", safe_keywords: ["formal"], is_new_release: true }),
  ]), { now: NOW });
  assert.equal(result.recommendations[0].model_key, "NEW1");
  assert.equal(result.recommendations.some((item) => item.model_key === "NEW2"), false);
  assert(result.recommendations[0].match_reasons.includes("new_release_relevant"));
});

test("memory without context-only/live-truth-wins cannot personalize", () => {
  const result = buildKenjiRecommendations(input([
    candidate({ model_key: "ATH1", safe_display_name: "Athletic", safe_keywords: ["athletic"] }),
    candidate({ model_key: "SOFT1", safe_display_name: "Soft", safe_keywords: ["soft"] }),
  ], {
    request: { ...input([]).request, preferences: [] },
    customer_context: {
      schema_version: KENJI_RECOMMENDATION_CONTEXT_SCHEMA,
      context_only: false,
      live_truth_wins: false,
      identity: { state: "known", confidence: "high" },
      safety: { may_personalize: true },
      reviewed_preferences: [{ status: "reviewed", summary: "soft" }],
    },
  }), { now: NOW });
  assert(result.recommendations.every((item) => !item.match_reasons.includes("reviewed_history_match")));
  assert.equal(result.recommendations[0].model_key, "ATH1");
});
