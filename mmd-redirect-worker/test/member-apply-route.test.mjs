import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import worker, { FRONT_VERSION, shouldNeverTouch } from "../src/index.js";

let originalFetch;
let passThroughRequests;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  passThroughRequests = [];
  globalThis.fetch = async (request) => {
    passThroughRequests.push(request);
    return new Response("<main id=\"webflow-member-apply\">Member Apply</main>", {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-origin": "webflow",
      },
    });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("member apply route ownership", () => {
  it("marks both /member/apply variants as never-redirect exact paths", () => {
    assert.equal(shouldNeverTouch(new URL("https://mmdbkk.com/member/apply")), true);
    assert.equal(shouldNeverTouch(new URL("https://mmdbkk.com/member/apply/")), true);
  });

  it("passes /member/apply through to Webflow without recovery shell or redirect", async () => {
    const query = "t=test-token&code=KJ-PRV-123456&promo=gold&x=1";

    for (const path of ["/member/apply", "/member/apply/"]) {
      const url = `https://mmdbkk.com${path}?${query}`;
      const response = await worker.fetch(new Request(url));
      const html = await response.text();

      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("location"), null, path);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", path);
      assert.equal(response.headers.get("x-mmd-front-version"), FRONT_VERSION, path);
      assert.equal(response.headers.get("x-mmd-temporary-route"), null, path);
      assert.equal(response.headers.get("x-origin"), "webflow", path);
      assert.match(html, /webflow-member-apply/, path);
      assert.doesNotMatch(html, /data-mmd-page-shell="member-static"/, path);
      assert.equal(passThroughRequests.at(-1).url, url, path);
    }

    assert.equal(passThroughRequests.length, 2);
  });

  it("preserves query parameters exactly for www host pass-through", async () => {
    const url = "https://www.mmdbkk.com/member/apply?t=abc&code=x&promo=y&payment_ref=p1";
    const response = await worker.fetch(new Request(url));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.equal(passThroughRequests.length, 1);
    assert.equal(passThroughRequests[0].url, url);
  });
});
