import {
  KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA,
  observeKenjiLineContextualUnderstandingShadow,
} from "./kenji-line-contextual-understanding-shadow.mjs";

export const CONTEXTUAL_UNDERSTANDING_SHADOW_SMOKE_MODE = "contextual_understanding_shadow";

const SYNTHETIC_LINE_USER_ID = "U00000000000000000000000000000000";

function syntheticEvent() {
  return {
    type: "message",
    source: { type: "user", userId: SYNTHETIC_LINE_USER_ID },
    message: { id: "synthetic-contextual-smoke-4", type: "text", text: "มีแนวนี้อีกไหม" },
  };
}

function syntheticHistory() {
  return {
    enabled: true,
    available: true,
    schema: "mmd.kenji_line_conversation_history.v1",
    turns: [
      {
        role: "customer",
        content: "คนนี้ดูดี",
        occurred_at: "2026-09-23T00:00:00.000Z",
        evidence: "synthetic_customer",
      },
      {
        role: "assistant",
        content: "ตัวเลือก A สูง 181 อายุ 26 เรท 25k ครับ",
        occurred_at: "2026-09-23T00:00:01.000Z",
        evidence: "synthetic_delivered_reply",
      },
      {
        role: "customer",
        content: "แต่แพงไปหน่อย",
        occurred_at: "2026-09-23T00:00:02.000Z",
        evidence: "synthetic_customer",
      },
      {
        role: "customer",
        content: "มีแนวนี้อีกไหม",
        occurred_at: "2026-09-23T00:00:03.000Z",
        evidence: "synthetic_current_webhook",
      },
    ],
    memory: {
      schema: "mmd.kenji_line_conversation_memory.v1",
      summary: "บทสนทนาจำลองสำหรับ semantic shadow smoke",
      known_facts: [],
      pending_questions: [],
      corrections: [],
      latest_customer_message: "มีแนวนี้อีกไหม",
    },
    coverage: {
      customer_messages: 3,
      confirmed_assistant_messages: 1,
      reply_history_complete: true,
    },
    reason: "synthetic_diagnostic",
  };
}

function accepted(result = {}) {
  return result?.enabled === true
    && result?.schema === KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA
    && result?.analysis_source === "model"
    && result?.model_attempted === true
    && result?.model_success === true
    && ["comparison", "referential_followup"].includes(result?.relation)
    && result?.topic_relation === "same_topic"
    && result?.preference_delta?.wants_similar === true
    && result?.preference_delta?.price_direction === "lower"
    && result?.shadow_only === true
    && result?.auto_send_allowed === false
    && result?.customer_copy_changed === false
    && !Object.prototype.hasOwnProperty.call(result, "answer");
}

export async function runKenjiContextualUnderstandingShadowSmoke(env = {}, { fetchImpl = fetch } = {}) {
  const result = await observeKenjiLineContextualUnderstandingShadow({
    env: {
      ...env,
      KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED: "true",
    },
    history: syntheticHistory(),
    event: syntheticEvent(),
    fetchImpl,
  });

  if (!accepted(result)) {
    return {
      status: 502,
      payload: {
        ok: false,
        mode: CONTEXTUAL_UNDERSTANDING_SHADOW_SMOKE_MODE,
        schema: KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA,
        shadow_only: true,
        customer_side_effects: false,
        auto_send_allowed: false,
        model_attempted: result?.model_attempted === true,
        model_success: result?.model_success === true,
        model_failure_reason: String(result?.model_failure_reason || "").slice(0, 80),
        model_failure_diagnostics: {
          provider_code: String(result?.model_failure_diagnostics?.provider_code || "").slice(0, 60),
          provider_type: String(result?.model_failure_diagnostics?.provider_type || "").slice(0, 60),
          provider_param: String(result?.model_failure_diagnostics?.provider_param || "").slice(0, 60),
          retry_after: String(result?.model_failure_diagnostics?.retry_after || "").slice(0, 60),
          limit_requests: String(result?.model_failure_diagnostics?.limit_requests || "").slice(0, 60),
          limit_tokens: String(result?.model_failure_diagnostics?.limit_tokens || "").slice(0, 60),
          remaining_requests: String(result?.model_failure_diagnostics?.remaining_requests || "").slice(0, 60),
          remaining_tokens: String(result?.model_failure_diagnostics?.remaining_tokens || "").slice(0, 60),
          reset_requests: String(result?.model_failure_diagnostics?.reset_requests || "").slice(0, 60),
          reset_tokens: String(result?.model_failure_diagnostics?.reset_tokens || "").slice(0, 60),
        },
        analysis_source: String(result?.analysis_source || "unknown").slice(0, 40),
        relation: String(result?.relation || "unknown").slice(0, 40),
        topic_relation: String(result?.topic_relation || "unknown").slice(0, 40),
        wants_similar: result?.preference_delta?.wants_similar === true,
        price_direction: String(result?.preference_delta?.price_direction || "unknown").slice(0, 20),
        error: "CONTEXTUAL_SHADOW_CONTRACT_REJECTED",
      },
    };
  }

  return {
    status: 200,
    payload: {
      ok: true,
      mode: CONTEXTUAL_UNDERSTANDING_SHADOW_SMOKE_MODE,
      schema: KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA,
      shadow_only: true,
      customer_side_effects: false,
      auto_send_allowed: false,
      model_attempted: true,
      model_success: true,
      analysis_source: "model",
      relation: result.relation,
      topic_relation: result.topic_relation,
      referent_state: result.referent_state,
      wants_similar: true,
      price_direction: "lower",
      clarification_required: result.needs_clarification === true,
    },
  };
}

export const KENJI_CONTEXTUAL_SHADOW_SMOKE_INTERNALS = Object.freeze({
  accepted,
  syntheticEvent,
  syntheticHistory,
});
