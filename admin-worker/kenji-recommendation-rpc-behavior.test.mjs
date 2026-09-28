import assert from "node:assert/strict";
import test from "node:test";
import { handleKenjiRecommendationRpc, resolveKenjiRecommendationPreview } from "./src/kenji-recommendation-rpc.js";
import { ENV, LINE_USER_ID, access, body, options, profile, request } from "./kenji-recommendation-test-fixtures.mjs";

test("preview discovers profiles, re-checks exact access/sales authority, and strips private context", async () => {
  const calls = [];
  const result = await resolveKenjiRecommendationPreview(ENV, body(), options({
    profileProvider: async () => [profile({ model_key: "FIT1", safe_keywords: ["athletic", "friendly"] }), profile({ model_key: "OTHER1", safe_keywords: ["formal"] })],
    modelAccessResolver: async (_env, input) => { calls.push(input); return access(input.query); },
  }));
  assert.equal(result.recommendations[0].model_key, "FIT1");
  assert(calls.every((item) => item.line_user_id === LINE_USER_ID));
  assert.equal(result.source.access, "KENJI_MODEL_ACCESS_V1");
  assert.equal(result.source.sales, "model_sales_control_v1_20260921");
  assert.doesNotMatch(JSON.stringify(result), /U1234567890abcdef|recPRIVATE|private transcript|never expose/);
});

test("silent/non-sellable access cannot become recommendations", async () => {
  const result = await resolveKenjiRecommendationPreview(ENV, body(), options({
    profileProvider: async () => [profile({ model_key: "DENY1" }), profile({ model_key: "OFF1" })],
    modelAccessResolver: async (_env, input) => input.query === "DENY1" ? { status: "silent" } : access("OFF1", { sales: { ...access("OFF1").model.sales, sellable: false } }),
  }));
  assert.equal(result.recommendation_count, 0);
  assert.equal(result.review_candidates.length, 0);
});

test("missing safe availability remains review-only", async () => {
  const result = await resolveKenjiRecommendationPreview(ENV, body(), options({ availabilityProvider: async () => null }));
  assert.equal(result.recommendation_count, 0);
  assert.equal(result.review_candidates[0].reason, "availability_missing");
});

test("irrelevant New Release is not promoted merely because it is new", async () => {
  const result = await resolveKenjiRecommendationPreview(ENV, body({
    customer_context: { schema_version: "mmd.kenji_conversation_matrix.v1", context_only: true, live_truth_wins: true, identity: { state: "unknown", confidence: "unknown" }, safety: { may_personalize: false } },
  }), options({
    profileProvider: async () => [
      profile({ model_key: "NEW1", safe_keywords: ["formal"], is_new_release: true, release_status: "new_release" }),
      profile({ model_key: "FIT1", safe_keywords: ["athletic"] }),
    ],
  }));
  assert.deepEqual(result.recommendations.map((item) => item.model_key), ["FIT1"]);
});

test("source failures return 503 rather than a misleading empty result", async () => {
  const profileFailure = await handleKenjiRecommendationRpc(request(), ENV, options({ profileProvider: async () => { throw new Error("private source detail"); } }));
  assert.equal(profileFailure.status, 503);
  assert.deepEqual(await profileFailure.json(), { ok: false, error: "keyword_profile_source_unavailable" });
  const accessFailure = await handleKenjiRecommendationRpc(request(), ENV, options({ modelAccessResolver: async () => { throw new Error("private upstream failure"); } }));
  assert.equal(accessFailure.status, 503);
  assert.deepEqual(await accessFailure.json(), { ok: false, error: "model_access_source_unavailable" });
});
