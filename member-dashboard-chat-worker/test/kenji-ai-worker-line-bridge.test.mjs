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
          read_only: true,
          review_required: true,
          evidence_discovery: {
            unavailable_is_not_not_found: true,
            note_ready: false,
            evidence_incomplete: true,
            unavailable_sources: ["rename_identity", "line_oa_1to1", "line_crew"],
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
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

test("bridge calls ai-worker through private service-binding headers without sending raw LINE message text", async () => {
  const calls = [];
  const result = await observeKenjiLineEvent({
    env: {
      KENJI_AI_WORKER_BRIDGE_ENABLED: "true",
      AI_WORKER: acceptedAiBinding(calls),
    },
    event: userEvent(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.note_ready, false);
  assert.equal(result.evidence_incomplete, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://ai-worker.local/v1/ai/kenji/customer-reasoning");
  assert.equal(calls[0].headers["x-mmd-internal-call"], "true");
  assert.equal(calls[0].headers["x-mmd-service-binding"], "member-dashboard-chat-worker");
  assert.equal(calls[0].body.actor.role, "system");
  assert.equal(JSON.stringify(calls[0].body).includes("PRIVATE CUSTOMER MESSAGE"), false);
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
  });
  assert.deepEqual(result, {
    ok: true,
    enabled: true,
    events: 1,
    observed: 1,
    succeeded: 1,
    evidence_incomplete: 1,
  });
});
