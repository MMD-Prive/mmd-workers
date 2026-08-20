import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import worker from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const retiredUpstreamEnvName = ["LINE", "WEBHOOK", "UPSTREAM", "URL"].join("_");

let originalFetch;
let upstreamRequests;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  upstreamRequests = [];
  globalThis.fetch = async (request) => {
    upstreamRequests.push(request);
    throw new Error("LINE webhook path must not be fetched by mmd-redirect-worker");
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function requestWithEnv(url, env, init) {
  return worker.fetch(new Request(url, init), env);
}

describe("LINE webhook owner guard", () => {
  it("fails closed when mmd-redirect-worker catches canonical /webhooks/line", async () => {
    const response = await requestWithEnv(
      "https://mmdbkk.com/webhooks/line?debug=1",
      { [retiredUpstreamEnvName]: "https://legacy.invalid/.netlify/functions/webhook" },
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mmd-test-signature": "test-signature",
        },
        body: JSON.stringify({ events: [] }),
      },
    );

    assert.equal(response.status, 421);
    assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker");
    assert.equal(upstreamRequests.length, 0);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "line_webhook_owner_mismatch",
      owner: "member-dashboard-chat-worker",
      route: "/webhooks/line",
    });
  });

  it("fails closed for legacy /webhook/line without forwarding", async () => {
    const response = await requestWithEnv("https://www.mmdbkk.com/webhook/line", {}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [] }),
    });

    assert.equal(response.status, 421);
    assert.equal(upstreamRequests.length, 0);
  });

  it("keeps production LINE ownership on member-dashboard-chat-worker only", () => {
    const source = readFileSync(resolve(__dirname, "../src/index.js"), "utf8");
    assert.doesNotMatch(source, new RegExp(retiredUpstreamEnvName));
    assert.doesNotMatch(source, /\.netlify\/functions\/webhook|line-webhook-netlify/i);

    const wrangler = readFileSync(resolve(__dirname, "../../member-dashboard-chat-worker/wrangler.toml"), "utf8");
    assert.match(wrangler, /pattern\s*=\s*"mmdbkk\.com\/webhooks\/line"/);
    assert.match(wrangler, /pattern\s*=\s*"www\.mmdbkk\.com\/webhooks\/line"/);
    assert.match(wrangler, /pattern\s*=\s*"mmdbkk\.com\/webhooks\/line\/"/);
    assert.match(wrangler, /pattern\s*=\s*"www\.mmdbkk\.com\/webhooks\/line\/"/);
  });
});
