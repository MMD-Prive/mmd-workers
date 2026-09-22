import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA,
  observeKenjiLineContextualUnderstandingShadow,
} from "../src/kenji-line-contextual-understanding-shadow.mjs";

const LINE_USER_ID = "U0123456789abcdef0123456789abcdef";

function event(message) {
  return {
    type: "message",
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: "msg-phase2", type: "text", text: message },
  };
}

function responsePayload(value) {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{
      content: [{
        type: "output_text",
        text: JSON.stringify(value),
      }],
    }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("Phase 2 model reads the whole visible thread and returns semantics only", async () => {
  const calls = [];
  const history = {
    available: true,
    turns: [
      { role: "customer", content: "คนนี้ดูดี", evidence: "customer_received" },
      { role: "assistant", content: "Sansui อายุ 26 สูง 181 เรท 25k ครับ", evidence: "line_delivery_succeeded" },
      { role: "customer", content: "แต่แพงไปหน่อย", evidence: "customer_received" },
      { role: "customer", content: "มีแนวนี้อีกไหม", evidence: "current_webhook" },
    ],
    memory: {
      known_facts: [],
      corrections: [],
      latest_customer_message: "มีแนวนี้อีกไหม",
    },
  };

  const result = await observeKenjiLineContextualUnderstandingShadow({
    env: {
      KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.6",
      KENJI_CONTEXTUAL_OPENAI_MODEL: "gpt-4.1-mini",
    },
    history,
    event: event("มีแนวนี้อีกไหม"),
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return responsePayload({
        relation: "comparison",
        topic_relation: "same_topic",
        referent_state: "resolved",
        referent_type: "model",
        referent_label: "Sansui",
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
        analysis_note: "Customer likes the prior model style but wants a cheaper alternative.",
      });
    },
  });

  assert.equal(result.schema, KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA);
  assert.equal(result.relation, "comparison");
  assert.equal(result.topic_relation, "same_topic");
  assert.equal(result.referent_state, "resolved");
  assert.equal(result.referent_label, "Sansui");
  assert.equal(result.preference_delta.wants_similar, true);
  assert.equal(result.preference_delta.price_direction, "lower");
  assert.equal(result.preference_delta.liked_reference, true);
  assert.equal(result.analysis_source, "model");
  assert.equal(result.model_success, true);
  assert.equal(result.shadow_only, true);
  assert.equal(result.auto_send_allowed, false);
  assert.equal(result.customer_copy_changed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "answer"), false);

  const request = JSON.parse(calls[0].init.body);
  assert.match(request.input, /คนนี้ดูดี/);
  assert.match(request.input, /Sansui/);
  assert.match(request.input, /แต่แพงไปหน่อย/);
  assert.match(request.input, /มีแนวนี้อีกไหม/);
  assert.match(request.instructions, /Do not answer the customer/);
  assert.equal(request.model, "gpt-4.1-mini");
});

test("model failure reason stays internal and fallback remains shadow-only", async () => {
  const result = await observeKenjiLineContextualUnderstandingShadow({
    env: {
      KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.6",
    },
    history: {
      available: true,
      turns: [
        { role: "customer", content: "คนนี้ดูดี", evidence: "customer_received" },
        { role: "assistant", content: "ตัวเลือก A เรท 25k ครับ", evidence: "line_delivery_succeeded" },
        { role: "customer", content: "แต่แพงไปหน่อย", evidence: "customer_received" },
        { role: "customer", content: "มีแนวนี้อีกไหม", evidence: "current_webhook" },
      ],
      memory: { known_facts: [], corrections: [] },
    },
    event: event("มีแนวนี้อีกไหม"),
    fetchImpl: async () => {
      const error = new Error("synthetic abort");
      error.name = "AbortError";
      throw error;
    },
  });

  assert.equal(result.analysis_source, "deterministic_fallback");
  assert.equal(result.model_attempted, true);
  assert.equal(result.model_success, false);
  assert.equal(result.model_failure_reason, "openai_timeout");
  assert.equal(result.shadow_only, true);
  assert.equal(result.auto_send_allowed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "answer"), false);
});

test("provider 429 exposes only a bounded provider code and never provider message text", async () => {
  const result = await observeKenjiLineContextualUnderstandingShadow({
    env: {
      KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
      KENJI_CONTEXTUAL_OPENAI_MODEL: "gpt-4.1-mini",
    },
    history: {
      turns: [
        { role: "customer", content: "คนนี้ดูดี", evidence: "customer_received" },
        { role: "assistant", content: "ตัวเลือก A เรท 25k ครับ", evidence: "line_delivery_succeeded" },
        { role: "customer", content: "มีแนวนี้อีกไหม", evidence: "current_webhook" },
      ],
      memory: { known_facts: [], corrections: [] },
    },
    event: event("มีแนวนี้อีกไหม"),
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        code: "rate_limit_exceeded",
        type: "requests",
        message: "PRIVATE PROVIDER MESSAGE MUST NOT LEAK",
      },
    }), { status: 429, headers: { "content-type": "application/json" } }),
  });

  assert.equal(result.model_success, false);
  assert.equal(result.model_failure_reason, "openai_http_429_rate_limit_exceeded");
  assert.equal(JSON.stringify(result).includes("PRIVATE PROVIDER MESSAGE"), false);
  assert.equal(result.auto_send_allowed, false);
});

test("correction fallback patches only the field the customer changed", async () => {
  const result = await observeKenjiLineContextualUnderstandingShadow({
    env: { KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: "true" },
    history: {
      available: true,
      turns: [
        { role: "customer", content: "เสาร์นี้ สองทุ่ม สุขุมวิท", evidence: "customer_received" },
        { role: "customer", content: "เปลี่ยนเป็นสามทุ่มนะ", evidence: "current_webhook" },
      ],
      memory: {
        known_facts: [
          { field: "day", value: "เสาร์นี้" },
          { field: "time", value: "21:00" },
          { field: "area", value: "สุขุมวิท" },
        ],
        corrections: [{
          field: "time",
          previous_value: "20:00",
          next_value: "21:00",
          evidence: "customer_correction",
        }],
        latest_customer_message: "เปลี่ยนเป็นสามทุ่มนะ",
      },
    },
    event: event("เปลี่ยนเป็นสามทุ่มนะ"),
  });

  assert.equal(result.relation, "correction");
  assert.deepEqual(result.patch_fields, ["time"]);
  assert.deepEqual(result.preserve_fields.sort(), ["area", "day"]);
  assert.equal(result.needs_clarification, false);
  assert.equal(result.analysis_source, "deterministic_fallback");
  assert.equal(result.auto_send_allowed, false);
});

test("ambiguous ordinal referent asks for one targeted clarification instead of guessing", async () => {
  const result = await observeKenjiLineContextualUnderstandingShadow({
    env: { KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: "true" },
    history: {
      turns: [
        { role: "customer", content: "มีหลายคนให้ดูไหม", evidence: "customer_received" },
        { role: "customer", content: "อันที่สองโอเค", evidence: "current_webhook" },
      ],
      memory: { known_facts: [], corrections: [] },
    },
    event: event("อันที่สองโอเค"),
  });

  assert.equal(result.relation, "comparison");
  assert.equal(result.referent_state, "unresolved");
  assert.equal(result.needs_clarification, true);
  assert.equal(result.clarification_target, "referent");
});

test("explicit topic switch does not inherit the previous subject", async () => {
  const result = await observeKenjiLineContextualUnderstandingShadow({
    env: { KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: "true" },
    history: {
      turns: [
        { role: "customer", content: "คุยเรื่อง Sansui อยู่", evidence: "customer_received" },
        { role: "customer", content: "อีกเรื่อง ขอถามสมาชิกหน่อย", evidence: "current_webhook" },
      ],
      memory: { known_facts: [], corrections: [] },
    },
    event: event("อีกเรื่อง ขอถามสมาชิกหน่อย"),
  });

  assert.equal(result.relation, "topic_switch");
  assert.equal(result.topic_relation, "new_topic");
  assert.equal(result.referent_state, "not_needed");
});

test("Phase 2 production config is shadow-only while LINE auto reply stays off", () => {
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /^KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED\s*=\s*"true"$/m);
  assert.match(wrangler, /^KENJI_CONTEXTUAL_OPENAI_MODEL\s*=\s*"gpt-4\.1-mini"$/m);
  assert.match(wrangler, /^KENJI_LINE_CONVERSATION_SHADOW_ENABLED\s*=\s*"true"$/m);
  assert.match(wrangler, /^LINE_AUTO_REPLY_ENABLED\s*=\s*"false"$/m);
});
