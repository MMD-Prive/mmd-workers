import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import worker from "../src/index.js";

let originalFetch;
let passThroughRequests;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  passThroughRequests = [];
  globalThis.fetch = async (request) => {
    passThroughRequests.push(request);
    return new Response("pass-through", {
      status: 209,
      headers: { "x-test-pass-through": "1" },
    });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function request(url, init) {
  return worker.fetch(new Request(url, init));
}

describe("public model apply worker page", () => {
  it("renders /apply/public-model from the front gate with TarT voice and logo", async () => {
    const urls = [
      "https://mmdbkk.com/apply/public-model?t=abc&code=x&promo=y",
      "https://mmdbkk.com/apply/public-model/?t=abc&code=x&promo=y",
      "https://www.mmdbkk.com/apply/public-model?t=abc&code=x&promo=y",
    ];

    for (const url of urls) {
      const response = await request(url);
      const html = await response.text();

      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", url);
      assert.equal(response.headers.get("x-mmd-page"), "public-model-apply-tart", url);
      assert.equal(response.headers.get("x-mmd-route-owner"), "mmd-redirect-worker", url);
      assert.equal(response.headers.get("x-mmd-origin"), "front-gate:public-model-apply-worker", url);
      assert.equal(response.headers.get("x-mmd-public-model-api"), "https://sigil.mmdbkk.com/v1/public-model/apply", url);
      assert.match(html, /ส่งโปรไฟล์ให้ผมอ่านครับ/, url);
      assert.match(html, /TarT note/, url);
      assert.match(html, /Prive%20Trans\.webp/, url);
      assert.match(html, /6a5bb3bb1bc958a523198c50_ChatGPT%20Image/, url);
      assert.match(html, /https:\/\/sigil\.mmdbkk\.com\/v1\/public-model\/apply/, url);
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("does not inject a body on HEAD requests", async () => {
    const response = await request("https://mmdbkk.com/apply/public-model", { method: "HEAD" });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-page"), "public-model-apply-tart");
    assert.equal(html, "");
    assert.equal(passThroughRequests.length, 0);
  });
});
