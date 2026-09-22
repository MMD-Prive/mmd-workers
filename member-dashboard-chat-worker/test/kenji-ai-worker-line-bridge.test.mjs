import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKenjiLineEvidenceContext,
  observeKenjiLineEvent,
  observeKenjiLineWebhook,
} from "../src/kenji-ai-worker-line-bridge.mjs";

const LINE_USER_ID = "U0123456789abcdef0123456789abcdef";

function userEvent(overrides = {}) {
  return {
    type: "message",
    webhookEventId: "evt-1",
    source: { type: "user", userId: LINE_USER_ID },
    message: { type: "text", id: "msg-1", text: "PRIVATE CUSTOMER MESSAGE" },
    deliveryContext: { isRedelivery: false },
    ...overrides,
  };
}

function acceptedAiBinding(calls) {
  return {
    fetch: async (request) => {
      calls.push({
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
        body: await request.json(),
      });
      return new Response(JSON.stringify({
        ok: true,
        data: {
          schema_version: "mmd.kenji_conversation_matrix.v1",
          read_only: true,
          identity: { state: "known" },
          continuity_resolution: { matrix_version: 4 },
          safety: {
            memory_is_context_only: true,
            may_grant_entitlement: false,
            may_confirm_payment: false,
            may_confirm_booking_or_availability: false,
            review_required: true,
          },
          evidence: {
            evidence_incomplete: true,
            unavailable_sources: ["rename_identity", "line_oa_1to1", "line_crew"],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  };
}

async function canonicalContextBuilder() {
  return {
    ok: true,
    context_bundle: {
      evaluated_at: "2026-09-21T12:00:00.000Z",
      identity: {
        state: "known",
        canonical_client_ref: "client:recSafe",
        preferred_name: "พี่ต้น",
        confidence: "high",
        source: "exact_line_canonical_client",
      },
      continuity: { last_intent: "membership_status", updated_at: "2026-09-21T11:50:00.000Z" },
      current_intent: "membership_status",
      domain_guard: { handoff_required: true, review_required: false },
    },
    telemetry: { memory_candidate: true, identity_state: "known", matrix_version: 4 },
  };
}

test("current OA webhook does not masquerade as historical LINE search", () => {
  const context = buildKenjiLineEvidenceContext(userEvent(), {});
  assert.equal(context.line_user_id, LINE_USER_ID);
  assert.equal(context.current_line_event.source_type, "user");
  assert.equal(context.evidence_sources.line_oa_1to1.state, "SOURCE_UNAVAILABLE");
  assert.equal(context.evidence_sources.line_oa_1to1.reason, "current_oa_event_observed_historical_search_unavailable");
  assert.equal(context.evidence_sources.line_crew.state, "SOURCE_UNAVAILABLE");
});

test("Crew event is recognized only from an explicit reviewed source allowlist and still does not claim historical search", () => {
  const event = userEvent({
    source: { type: "group", groupId: "Ccrew-reviewed" },
  });
  const context = buildKenjiLineEvidenceContext(event, { KENJI_LINE_CREW_SOURCE_IDS: "Ccrew-reviewed" });
  assert.equal(context.line_user_id, "");
  assert.equal(context.current_line_event.crew_source_allowlisted, true);
  assert.equal(context.evidence_sources.line_crew.state, "SOURCE_UNAVAILABLE");
  assert.equal(context.evidence_sources.line_crew.reason, "current_crew_event_observed_historical_search_unavailable");
});

test("bridge calls Conversation Matrix through private service binding and emits safe shadow metadata only", async () => {
  const calls = [];
  const result = await observeKenjiLineEvent({
    env: {
      KENJI_AI_WORKER_BRIDGE_ENABLED: "true",
      AI_WORKER: acceptedAiBinding(calls),
    },
    event: userEvent(),
    contextBuilder: canonicalContextBuilder,
  });

  assert.equal(result.ok, true);
  assert.equal(result.note_ready, false);
  assert.equal(result.evidence_incomplete, true);
  assert.equal(result.memory_used, true);
  assert.equal(result.identity_state, "known");
  assert.equal(result.matrix_version, 4);
  assert.equal(result.review_required, true);
  assert.equal(result.shadow_only, true);
  assert.equal(result.customer_copy_changed, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://ai-worker.local/v1/ai/kenji/conversation-matrix");
  assert.equal(calls[0].headers["x-mmd-internal-call"], "true");
  assert.equal(calls[0].headers["x-mmd-service-binding"], "member-dashboard-chat-worker");
  assert.equal(calls[0].body.actor.role, "system");
  assert.equal(calls[0].body.context_bundle.identity.canonical_client_ref, "client:recSafe");
  assert.equal(JSON.stringify(calls[0].body).includes("PRIVATE CUSTOMER MESSAGE"), false);
  assert.equal(JSON.stringify(calls[0].body).includes(LINE_USER_ID), false);
});

test("enabled transcript reaches only the private AI binding and never bridge output", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async () => new Response(JSON.stringify({
    records: [{
      id: "recInbound",
      fields: {
        source: "line",
        created_at: "2026-09-22T12:00:00.000Z",
        payload_json: JSON.stringify({ raw_text: "ข้อความเก่าของลูกค้า" }),
      },
    }, {
      id: "recSent",
      fields: {
        source: "line_ofc_outbound",
        status: "sent",
        created_at: "2026-09-22T12:01:00.000Z",
        payload_json: JSON.stringify({ direction: "outbound", actual_sent: true, sent_text: "คำตอบที่ส่งจริง" }),
      },
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const result = await observeKenjiLineEvent({
      env: {
        KENJI_AI_WORKER_BRIDGE_ENABLED: "true",
        KENJI_LINE_CONVERSATION_SHADOW_ENABLED: "true",
        AIRTABLE_API_KEY: "test-key",
        AIRTABLE_BASE_ID: "app-test",
        AI_WORKER: acceptedAiBinding(calls),
      },
      event: userEvent(),
      contextBuilder: canonicalContextBuilder,
    });
    assert.equal(calls.length, 1);
    const transcript = calls[0].body.context_bundle.conversation_history_v1;
    assert.equal(transcript.turns.length, 3);
    assert.equal(transcript.coverage.reply_history_complete, true);
    assert.equal(transcript.memory.schema, "mmd.kenji_line_conversation_memory.v1");
    assert.equal(transcript.memory.summary, "ข้อความล่าสุดจากลูกค้า: PRIVATE CUSTOMER MESSAGE");
    assert.equal(transcript.turns[0].content, "ข้อความเก่าของลูกค้า");
    assert.equal(transcript.turns[1].content, "คำตอบที่ส่งจริง");
    assert.equal(result.conversation_turns_read, 3);
    assert.equal(result.confirmed_assistant_turns_read, 1);
    assert.equal(result.reply_history_complete, true);
    const serializedResult = JSON.stringify(result);
    assert.equal(serializedResult.includes("ข้อความเก่าของลูกค้า"), false);
    assert.equal(serializedResult.includes("คำตอบที่ส่งจริง"), false);
    assert.equal(serializedResult.includes("PRIVATE CUSTOMER MESSAGE"), false);
    assert.equal(serializedResult.includes("ข้อความล่าสุดจากลูกค้า"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing ai-worker binding fails closed and never becomes SEARCHED_NO_MATCH", async () => {
  const result = await observeKenjiLineEvent({
    env: { KENJI_AI_WORKER_BRIDGE_ENABLED: "true" },
    event: userEvent(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ai_worker_binding_missing");
  assert.equal(result.note_ready, false);
  assert.equal(result.evidence_incomplete, true);
});

test("redelivered LINE event is not observed twice", async () => {
  const calls = [];
  const result = await observeKenjiLineEvent({
    env: { KENJI_AI_WORKER_BRIDGE_ENABLED: "true", AI_WORKER: acceptedAiBinding(calls) },
    event: userEvent({ deliveryContext: { isRedelivery: true } }),
    contextBuilder: canonicalContextBuilder,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "line_redelivery_skipped");
  assert.equal(calls.length, 0);
});

test("webhook observer aggregates only safe counts", async () => {
  const calls = [];
  const request = new Request("https://www.mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [userEvent()] }),
  });
  const result = await observeKenjiLineWebhook({
    request,
    env: { KENJI_AI_WORKER_BRIDGE_ENABLED: "true", AI_WORKER: acceptedAiBinding(calls) },
    contextBuilder: canonicalContextBuilder,
  });
  assert.deepEqual(result, {
    ok: true,
    enabled: true,
    events: 1,
    observed: 1,
    succeeded: 1,
    evidence_incomplete: 1,
    memory_used: 1,
    identity_state: "known",
    matrix_version: 4,
    review_required: 1,
    shadow_only: true,
    customer_copy_changed: false,
  });
});

test("multi-event shadow observation uses bounded concurrency", async () => {
  const calls = [];
  let active = 0;
  let peak = 0;
  const contextBuilder = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return canonicalContextBuilder();
  };
  const events = Array.from({ length: 10 }, (_, index) => userEvent({
    webhookEventId: `evt-${index}`,
    message: { type: "text", id: `msg-${index}`, text: "PRIVATE CUSTOMER MESSAGE" },
  }));
  const request = new Request("https://www.mmdbkk.com/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events }),
  });

  const result = await observeKenjiLineWebhook({
    request,
    env: { KENJI_AI_WORKER_BRIDGE_ENABLED: "true", AI_WORKER: acceptedAiBinding(calls) },
    contextBuilder,
  });

  assert.equal(result.ok, true);
  assert.equal(result.events, 10);
  assert.equal(result.observed, 10);
  assert.equal(calls.length, 10);
  assert.ok(peak > 1, `expected concurrent observations, peak=${peak}`);
  assert.ok(peak <= 4, `expected at most four concurrent observations, peak=${peak}`);
});
