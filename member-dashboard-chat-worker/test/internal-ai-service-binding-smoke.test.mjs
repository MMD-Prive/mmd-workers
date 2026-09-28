import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
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
            schema_version: "mmd.kenji_conversation_matrix.v1",
            identity: { state: "unknown" },
            safety: {
              memory_is_context_only: true,
              may_grant_entitlement: false,
              may_confirm_payment: false,
              may_confirm_booking_or_availability: false,
            },
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
    contract: "kenji_conversation_matrix_shadow_v1",
    customer_side_effects: false,
  });
  assert.equal(upstreamRequest.method, "POST");
  assert.equal(upstreamRequest.url, "https://ai-worker.local/v1/ai/kenji/conversation-matrix");
  assert.equal(upstreamRequest.headers.get("x-mmd-internal-call"), "true");
  assert.equal(upstreamRequest.headers.get("x-mmd-service-binding"), "member-dashboard-chat-worker");

  const body = await upstreamRequest.json();
  assert.equal(body.actor.role, "system");
  assert.equal(body.actor.purpose, "read_only_service_binding_smoke");
  assert.equal(body.context_bundle.customer_context.synthetic, true);
  assert.equal(body.context_bundle.identity.state, "unknown");
  assert.equal(body.context_bundle.identity.canonical_client_ref, "");
  assert.equal(JSON.stringify(body).match(/replyToken|messageId|U[a-f0-9]{32}/gi), null);
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

test("diagnostic route requires dedicated AI_SERVICE_SMOKE_TOKEN before invoking AI_WORKER", async () => {
  let calls = 0;
  const env = {
    INTERNAL_TOKEN: "must-not-authorize-smoke",
    AI_SERVICE_SMOKE_TOKEN: "test-ai-service-smoke-token",
    AI_WORKER: {
      async fetch() {
        calls += 1;
        return new Response(JSON.stringify({
          ok: true,
          data: {
            read_only: true,
            schema_version: "mmd.kenji_conversation_matrix.v1",
            identity: { state: "unknown" },
            safety: {
              memory_is_context_only: true,
              may_grant_entitlement: false,
              may_confirm_payment: false,
              may_confirm_booking_or_availability: false,
            },
          },
        }), { headers: { "content-type": "application/json" } });
      },
    },
  };

  const unauthorized = await worker.fetch(new Request("https://www.mmdbkk.com/v1/internal/ai/service-binding-smoke", {
    method: "POST",
    headers: { authorization: "Bearer must-not-authorize-smoke" },
  }), env);
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0);

  const authorized = await worker.fetch(new Request("https://www.mmdbkk.com/v1/internal/ai/service-binding-smoke", {
    method: "POST",
    headers: { authorization: "Bearer test-ai-service-smoke-token" },
  }), env);
  assert.equal(authorized.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(await authorized.json(), {
    ok: true,
    read_only: true,
    service: "ai-worker",
    contract: "kenji_conversation_matrix_shadow_v1",
    customer_side_effects: false,
  });
});
