import assert from "node:assert/strict";
import test from "node:test";
import { runInternalAiServiceBindingSmoke } from "../src/internal-ai-service-binding-smoke.mjs";

test("internal AI service-binding smoke sends synthetic read-only context only", async () => {
  let upstreamRequest;
  const result = await runInternalAiServiceBindingSmoke({
    AI_WORKER: {
      async fetch(request) {
        upstreamRequest = request;
        return new Response(JSON.stringify({
          ok: true,
          data: {
            read_only: true,
            evidence_discovery: { unavailable_is_not_not_found: true },
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.payload, {
    ok: true,
    read_only: true,
    service: "ai-worker",
    contract: "kenji_customer_reasoning_v1",
  });
  assert.equal(upstreamRequest.method, "POST");
  assert.equal(upstreamRequest.url, "https://ai-worker.local/v1/ai/kenji/customer-reasoning");
  assert.equal(upstreamRequest.headers.get("x-mmd-internal-call"), "true");
  assert.equal(upstreamRequest.headers.get("x-mmd-service-binding"), "member-dashboard-chat-worker");

  const body = await upstreamRequest.json();
  assert.equal(body.actor.role, "system");
  assert.equal(body.actor.purpose, "read_only_service_binding_smoke");
  assert.equal(body.customer_context.synthetic, true);
  assert.equal(body.customer_context.line_user_id, "");
  assert.equal(body.customer_context.current_line_event.observed, false);
  assert.equal(JSON.stringify(body).match(/replyToken|messageId|line_user_id[^"]*U[a-f0-9]{32}|airtable|payment/gi), null);
});

test("internal AI service-binding smoke fails closed for a rejected upstream contract", async () => {
  const result = await runInternalAiServiceBindingSmoke({
    AI_WORKER: {
      async fetch() {
        return new Response(JSON.stringify({ ok: true, data: { read_only: false } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });

  assert.equal(result.status, 502);
  assert.equal(result.payload.error.code, "AI_WORKER_CONTRACT_REJECTED");
  assert.equal(result.payload.read_only, true);
});

test("internal AI service-binding smoke fails closed when the binding is absent", async () => {
  const result = await runInternalAiServiceBindingSmoke({});
  assert.equal(result.status, 503);
  assert.equal(result.payload.error.code, "AI_WORKER_BINDING_MISSING");
});