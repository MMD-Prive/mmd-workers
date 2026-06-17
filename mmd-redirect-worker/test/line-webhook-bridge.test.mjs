import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import worker from "../src/index.js";

let originalFetch;
let upstreamRequests;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  upstreamRequests = [];
  globalThis.fetch = async (request) => {
    upstreamRequests.push(request);
    return new Response("line upstream", {
      status: 209,
      headers: { "x-test-line-upstream": "1" },
    });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function requestWithEnv(url, env, init) {
  return worker.fetch(new Request(url, init), env);
}

describe("LINE webhook bridge", () => {
  it("bridges mmdbkk.com /webhooks/line to the configured upstream", async () => {
    const env = {
      LINE_WEBHOOK_UPSTREAM_URL: "https://example.com/.netlify/functions/webhook",
    };

    const response = await requestWithEnv("https://mmdbkk.com/webhooks/line?debug=1", env, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-test-signature": "test-signature",
      },
      body: JSON.stringify({ events: [] }),
    });

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker");
    assert.equal(response.headers.get("x-test-line-upstream"), "1");
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].url, "https://example.com/.netlify/functions/webhook?debug=1");
    assert.equal(upstreamRequests[0].method, "POST");
    assert.equal(upstreamRequests[0].headers.get("x-mmd-test-signature"), "test-signature");
  });

  it("keeps /webhooks/line as pass-through when no bridge upstream is configured", async () => {
    const response = await requestWithEnv("https://mmdbkk.com/webhooks/line", {}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [] }),
    });

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker");
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].url, "https://mmdbkk.com/webhooks/line");
  });
});
