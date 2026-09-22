import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXTUAL_UNDERSTANDING_SHADOW_SMOKE_MODE,
  runKenjiContextualUnderstandingShadowSmoke,
} from "../src/internal-kenji-contextual-shadow-smoke.mjs";

function modelResponse(overrides = {}) {
  const output = {
    relation: "comparison",
    topic_relation: "same_topic",
    referent_state: "resolved",
    referent_type: "model",
    referent_label: "synthetic prior option",
    patch_fields: [],
    preserve_fields: [],
    preference_delta: {
      wants_similar: true,
      price_direction: "lower",
      liked_reference: true,
      rejected_reference: false,
      notes: "same style, lower price",
    },
    needs_clarification: false,
    clarification_target: "",
    confidence: 0.96,
    evidence_turn_indexes: [0, 1, 2, 3],
    analysis_note: "synthetic semantic smoke",
    ...overrides,
  };
  return new Response(JSON.stringify({
    status: "completed",
    output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("contextual smoke proves model semantics without customer side effects", async () => {
  let requestBody = null;
  const result = await runKenjiContextualUnderstandingShadowSmoke({
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-5.6",
  }, {
    fetchImpl: async (_url, init = {}) => {
      requestBody = JSON.parse(init.body);
      return modelResponse();
    },
  });

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.mode, CONTEXTUAL_UNDERSTANDING_SHADOW_SMOKE_MODE);
  assert.equal(result.payload.model_success, true);
  assert.equal(result.payload.analysis_source, "model");
  assert.equal(result.payload.relation, "comparison");
  assert.equal(result.payload.topic_relation, "same_topic");
  assert.equal(result.payload.wants_similar, true);
  assert.equal(result.payload.price_direction, "lower");
  assert.equal(result.payload.shadow_only, true);
  assert.equal(result.payload.customer_side_effects, false);
  assert.equal(result.payload.auto_send_allowed, false);
  assert.equal(JSON.stringify(result.payload).includes("คนนี้ดูดี"), false);
  assert.equal(JSON.stringify(result.payload).includes("25k"), false);

  assert.match(requestBody.input, /คนนี้ดูดี/);
  assert.match(requestBody.input, /25k/);
  assert.match(requestBody.input, /แต่แพงไปหน่อย/);
  assert.match(requestBody.input, /มีแนวนี้อีกไหม/);
});

test("contextual smoke exposes bounded 429 diagnostics without provider message text", async () => {
  const result = await runKenjiContextualUnderstandingShadowSmoke({
    OPENAI_API_KEY: "test-key",
    KENJI_CONTEXTUAL_OPENAI_MODEL: "gpt-4.1-mini",
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        code: "rate_limit_exceeded",
        type: "requests",
        param: "requests_per_minute",
        message: "PRIVATE PROVIDER DETAIL",
      },
    }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "3",
        "x-ratelimit-remaining-requests": "0",
        "x-ratelimit-reset-requests": "2.5s",
      },
    }),
  });

  assert.equal(result.status, 502);
  assert.equal(result.payload.model_failure_reason, "openai_http_429_rate_limit_exceeded");
  assert.deepEqual(result.payload.model_failure_diagnostics, {
    provider_code: "rate_limit_exceeded",
    provider_type: "requests",
    provider_param: "requests_per_minute",
    retry_after: "3",
    limit_requests: "",
    limit_tokens: "",
    remaining_requests: "0",
    remaining_tokens: "",
    reset_requests: "2.5s",
    reset_tokens: "",
  });
  assert.equal(JSON.stringify(result.payload).includes("PRIVATE PROVIDER DETAIL"), false);
  assert.equal(result.payload.customer_side_effects, false);
  assert.equal(result.payload.auto_send_allowed, false);
});

test("contextual smoke fails closed when model semantics do not satisfy the contract", async () => {
  const result = await runKenjiContextualUnderstandingShadowSmoke({
    OPENAI_API_KEY: "test-key",
  }, {
    fetchImpl: async () => modelResponse({
      relation: "standalone",
      topic_relation: "new_topic",
      preference_delta: {
        wants_similar: false,
        price_direction: "unknown",
        liked_reference: false,
        rejected_reference: false,
        notes: "",
      },
      confidence: 0.3,
    }),
  });

  assert.equal(result.status, 502);
  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.error, "CONTEXTUAL_SHADOW_CONTRACT_REJECTED");
  assert.equal(result.payload.auto_send_allowed, false);
  assert.equal(result.payload.customer_side_effects, false);
});
