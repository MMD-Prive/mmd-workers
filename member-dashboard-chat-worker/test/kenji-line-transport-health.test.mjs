import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalLineWebhookEndpointMatches,
  handleKenjiLineTransportHealth,
  inspectKenjiLineTransport,
  isKenjiLineTransportHealthRequest,
} from "../src/kenji-line-transport-health.mjs";

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

test("returns bounded ready transport health without exposing token or configured endpoint", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(String(url), "https://api.line.me/v2/bot/channel/webhook/endpoint");
    assert.equal(init.headers.authorization, "Bearer secret-token-value");
    return new Response(JSON.stringify({
      endpoint: "https://www.mmdbkk.com/webhooks/line",
      active: true,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await handleKenjiLineTransportHealth(
      new Request("https://www.mmdbkk.com/webhooks/line", {
        headers: { "x-mmd-line-transport-health": "1" },
      }),
      { LINE_CHANNEL_SECRET: "secret-signature-value", LINE_CHANNEL_ACCESS_TOKEN: "secret-token-value" },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.status, "ready");
    assert.equal(payload.signature_secret_present, true);
    assert.equal(payload.access_token_present, true);
    assert.equal(payload.line_api_reachable, true);
    assert.equal(payload.webhook_active, true);
    assert.equal(payload.endpoint_match, true);
    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes("secret-token-value"), false);
    assert.equal(serialized.includes("secret-signature-value"), false);
    assert.equal(serialized.includes("www.mmdbkk.com/webhooks/line"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed with a safe reason when the channel endpoint is inactive or mismatched", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    endpoint: "https://example.com/webhooks/line",
    active: false,
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const health = await inspectKenjiLineTransport({
      LINE_CHANNEL_SECRET: "present",
      LINE_CHANNEL_ACCESS_TOKEN: "present",
    });
    assert.equal(health.status, "webhook_inactive");
    assert.equal(health.webhook_active, false);
    assert.equal(health.endpoint_match, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
