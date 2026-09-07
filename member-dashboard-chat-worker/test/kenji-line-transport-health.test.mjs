import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalLineWebhookEndpointMatches,
  handleKenjiLineTransportHealth,
  inspectKenjiLineTransport,
  isKenjiLineTransportHealthRequest,
} from "../src/kenji-line-transport-health.mjs";

function memberPagesHealthBinding(overrides = {}) {
  return {
    async fetch(req) {
      assert.equal(new URL(req.url).pathname, "/__internal/kenji/member-truth/health");
      assert.equal(req.method, "POST");
      assert.equal(req.headers.get("x-mmd-internal-call"), "true");
      assert.equal(req.headers.get("x-mmd-service-binding"), "member-dashboard-chat-worker");
      const status = overrides.http_status || 200;
      return Response.json({
        schema: "mmd.kenji_member_truth_health.v1",
        configured: overrides.configured ?? true,
        resolver_binding_present: overrides.resolver_binding_present ?? true,
        resolver_secret_present: overrides.resolver_secret_present ?? true,
        upstream_http_status: overrides.upstream_http_status ?? 200,
        ok: overrides.ok ?? true,
        status: overrides.status || "ready",
      }, { status });
    },
  };
}

function installReadyLineFetch(calls = []) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    assert.equal(init.headers.authorization, "Bearer secret-token-value");
    if (String(url).endsWith("/webhook/endpoint")) {
      return new Response(JSON.stringify({
        endpoint: "https://www.mmdbkk.com/webhooks/line",
        active: true,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    assert.equal(String(url), "https://api.line.me/v2/bot/channel/webhook/test");
    assert.equal(init.method, "POST");
    assert.equal(init.body, "{}");
    return new Response(JSON.stringify({
      success: true,
      timestamp: "2026-09-07T00:00:00Z",
      statusCode: 200,
      reason: "OK",
      detail: "200",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return originalFetch;
}

test("recognizes bounded MMD LINE transport health only on the canonical GET path", () => {
  assert.equal(isKenjiLineTransportHealthRequest(new Request("https://www.mmdbkk.com/webhooks/line", {
    headers: { "x-mmd-line-transport-health": "1" },
  })), true);
  assert.equal(isKenjiLineTransportHealthRequest(new Request("https://www.mmdbkk.com/webhooks/line?transport_health=1")), true);
  assert.equal(isKenjiLineTransportHealthRequest(new Request("https://www.mmdbkk.com/webhooks/line")), false);
  assert.equal(isKenjiLineTransportHealthRequest(new Request("https://www.mmdbkk.com/webhooks/line/mms?transport_health=1")), false);
  assert.equal(isKenjiLineTransportHealthRequest(new Request("https://www.mmdbkk.com/webhooks/line?transport_health=1", { method: "POST" })), false);
});

test("accepts only the two canonical MMD webhook endpoints", () => {
  assert.equal(canonicalLineWebhookEndpointMatches("https://mmdbkk.com/webhooks/line"), true);
  assert.equal(canonicalLineWebhookEndpointMatches("https://www.mmdbkk.com/webhooks/line/"), true);
  assert.equal(canonicalLineWebhookEndpointMatches("https://example.com/webhooks/line"), false);
  assert.equal(canonicalLineWebhookEndpointMatches("https://www.mmdbkk.com/webhooks/line/mms"), false);
});

test("requires signed webhook, ingress diagnostics, and member truth bridge before reporting ready", async () => {
  const calls = [];
  const originalFetch = installReadyLineFetch(calls);
  try {
    const response = await handleKenjiLineTransportHealth(
      new Request("https://www.mmdbkk.com/webhooks/line", {
        headers: { "x-mmd-line-transport-health": "1" },
      }),
      {
        LINE_CHANNEL_SECRET: "secret-signature-value",
        LINE_CHANNEL_ACCESS_TOKEN: "secret-token-value",
        MEMBER_PAGES_WORKER: memberPagesHealthBinding(),
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.schema, "mmd.kenji_line_transport_health.v4");
    assert.equal(payload.status, "ready");
    assert.equal(payload.signature_secret_present, true);
    assert.equal(payload.access_token_present, true);
    assert.equal(payload.line_api_reachable, true);
    assert.equal(payload.webhook_active, true);
    assert.equal(payload.endpoint_match, true);
    assert.equal(payload.signed_webhook_test_attempted, true);
    assert.equal(payload.signed_webhook_test_success, true);
    assert.equal(payload.signed_webhook_test_status_code, 200);
    assert.equal(payload.signed_webhook_test_reason, "OK");
    assert.equal(payload.member_truth_bridge_configured, true);
    assert.equal(payload.member_truth_bridge_ok, true);
    assert.equal(payload.member_truth_bridge_status, "ready");
    assert.equal(payload.member_truth_bridge_http_status, 200);
    assert.equal(payload.member_truth_resolver_binding_present, true);
    assert.equal(payload.member_truth_resolver_secret_present, true);
    assert.equal(calls.length, 2);
    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes("secret-token-value"), false);
    assert.equal(serialized.includes("secret-signature-value"), false);
    assert.equal(serialized.includes("www.mmdbkk.com/webhooks/line"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("surfaces resolver auth rejection separately from healthy LINE transport", async () => {
  const calls = [];
  const originalFetch = installReadyLineFetch(calls);
  try {
    const response = await handleKenjiLineTransportHealth(
      new Request("https://www.mmdbkk.com/webhooks/line?transport_health=1"),
      {
        LINE_CHANNEL_SECRET: "secret-signature-value",
        LINE_CHANNEL_ACCESS_TOKEN: "secret-token-value",
        MEMBER_PAGES_WORKER: memberPagesHealthBinding({
          http_status: 503,
          ok: false,
          status: "resolver_auth_rejected",
          upstream_http_status: 404,
        }),
      },
    );
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.status, "ready");
    assert.equal(payload.signed_webhook_test_success, true);
    assert.equal(payload.member_truth_bridge_configured, true);
    assert.equal(payload.member_truth_bridge_ok, false);
    assert.equal(payload.member_truth_bridge_status, "resolver_auth_rejected");
    assert.equal(payload.member_truth_bridge_http_status, 503);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("surfaces a 401 signed webhook round-trip failure without exposing LINE payload detail", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/webhook/endpoint")) {
      return new Response(JSON.stringify({
        endpoint: "https://www.mmdbkk.com/webhooks/line",
        active: true,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      success: false,
      timestamp: "2026-09-07T00:00:00Z",
      statusCode: 401,
      reason: "ERROR_STATUS_CODE",
      detail: "HTTP status code: 401",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const health = await inspectKenjiLineTransport({
      LINE_CHANNEL_SECRET: "present",
      LINE_CHANNEL_ACCESS_TOKEN: "present",
    });
    assert.equal(health.status, "signature_mismatch_or_webhook_auth_failure");
    assert.equal(health.signed_webhook_test_attempted, true);
    assert.equal(health.signed_webhook_test_success, false);
    assert.equal(health.signed_webhook_test_status_code, 401);
    assert.equal(health.signed_webhook_test_reason, "ERROR_STATUS_CODE");
    assert.equal(JSON.stringify(health).includes("HTTP status code"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed before the signed test when the channel endpoint is inactive", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      endpoint: "https://example.com/webhooks/line",
      active: false,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const health = await inspectKenjiLineTransport({
      LINE_CHANNEL_SECRET: "present",
      LINE_CHANNEL_ACCESS_TOKEN: "present",
    });
    assert.equal(health.status, "webhook_inactive");
    assert.equal(health.webhook_active, false);
    assert.equal(health.endpoint_match, false);
    assert.equal(health.signed_webhook_test_attempted, false);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
