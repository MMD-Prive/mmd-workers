import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import worker, {
  findStudioWebflowRoute,
  FRONT_VERSION,
} from "../src/index.js";

let originalFetch;
let upstreamRequests;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  upstreamRequests = [];
  globalThis.fetch = async (request) => {
    upstreamRequests.push(request);
    return new Response("studio webflow", {
      status: 200,
      headers: { "x-webflow-test": "1" },
    });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function request(url, init) {
  return worker.fetch(new Request(url, init));
}

describe("Studio clean route rewrites", () => {
  it("normalizes clean Studio paths to internal Webflow routes", () => {
    assert.deepEqual(findStudioWebflowRoute("/studio/upload"), {
      path: "/internal/admin/studio/upload",
      page: "studio-upload",
    });
    assert.deepEqual(findStudioWebflowRoute("/studio/review/"), {
      path: "/internal/admin/studio/review",
      page: "studio-review",
    });
    assert.deepEqual(findStudioWebflowRoute("/studio/model-preview"), {
      path: "/internal/admin/studio/model-preview",
      page: "studio-model-preview",
    });
  });

  it("rewrites /studio/upload, /studio/review, and /studio/model-preview without browser redirect", async () => {
    const cases = [
      ["https://www.mmdbkk.com/studio/upload?t=tok&x=1", "https://mmdbkk.com/internal/admin/studio/upload?t=tok&x=1", "studio-upload"],
      ["https://mmdbkk.com/studio/review?seed=1", "https://mmdbkk.com/internal/admin/studio/review?seed=1", "studio-review"],
      ["https://mmdbkk.com/studio/model-preview?run=EMs000", "https://mmdbkk.com/internal/admin/studio/model-preview?run=EMs000", "studio-model-preview"],
    ];

    for (const [inputUrl, expectedUpstream, page] of cases) {
      const response = await request(inputUrl);

      assert.equal(response.status, 200, inputUrl);
      assert.equal(response.headers.get("location"), null, inputUrl);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", inputUrl);
      assert.equal(response.headers.get("x-mmd-front-version"), FRONT_VERSION, inputUrl);
      assert.equal(response.headers.get("x-mmd-route-owner"), "mmd-redirect-worker", inputUrl);
      assert.equal(response.headers.get("x-mmd-page"), page, inputUrl);
      assert.equal(response.headers.get("x-mmd-origin"), `webflow-rewrite:${new URL(expectedUpstream).pathname}`, inputUrl);
      assert.equal(upstreamRequests.at(-1).url, expectedUpstream, inputUrl);
    }

    assert.equal(upstreamRequests.length, cases.length);
  });

  it("does not rewrite near-miss Studio paths", async () => {
    const response = await request("https://mmdbkk.com/studio/review-extra?t=1");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-page"), null);
    assert.equal(upstreamRequests.at(-1).url, "https://mmdbkk.com/studio/review-extra?t=1");
  });
});
