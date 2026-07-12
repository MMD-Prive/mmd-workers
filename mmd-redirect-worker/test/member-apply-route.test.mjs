import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import worker, { FRONT_VERSION, WEBFLOW_UPSTREAM, shouldNeverTouch } from "../src/index.js";

let originalFetch;
let upstreamRequests;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  upstreamRequests = [];
  globalThis.fetch = async (request) => {
    upstreamRequests.push(request);
    return new Response("<main id=\"webflow-member-apply\">Member Apply V6</main>", {
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

  it("proxies /member/apply directly to the Webflow preview origin", async () => {
    const query = "t=test-token&code=KJ-PRV-123456&promo=gold&x=1";

    for (const path of ["/member/apply", "/member/apply/"]) {
      const publicUrl = `https://mmdbkk.com${path}?${query}`;
      const response = await worker.fetch(new Request(publicUrl));
      const html = await response.text();
      const expectedUpstream = `${WEBFLOW_UPSTREAM}${path}?${query}`;

      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("location"), null, path);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", path);
      assert.equal(response.headers.get("x-mmd-front-version"), FRONT_VERSION, path);
      assert.equal(response.headers.get("x-mmd-route-owner"), "webflow", path);
      assert.equal(response.headers.get("x-mmd-page"), "member-apply", path);
      assert.equal(response.headers.get("x-mmd-origin"), WEBFLOW_UPSTREAM, path);
      assert.equal(response.headers.get("x-mmd-temporary-route"), null, path);
      assert.equal(response.headers.get("x-origin"), "webflow", path);
      assert.match(html, /webflow-member-apply/, path);
      assert.doesNotMatch(html, /data-mmd-page-shell="member-static"/, path);
      assert.equal(upstreamRequests.at(-1).url, expectedUpstream, path);
      assert.equal(upstreamRequests.at(-1).headers.get("x-mmd-original-host"), "mmdbkk.com", path);
    }

    assert.equal(upstreamRequests.length, 2);
  });

  it("preserves all query parameters from the www host", async () => {
    const publicUrl = "https://www.mmdbkk.com/member/apply?t=abc&code=x&promo=y&payment_ref=p1";
    const response = await worker.fetch(new Request(publicUrl));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.equal(upstreamRequests.length, 1);
    assert.equal(
      upstreamRequests[0].url,
      `${WEBFLOW_UPSTREAM}/member/apply?t=abc&code=x&promo=y&payment_ref=p1`,
    );
    assert.equal(upstreamRequests[0].headers.get("x-mmd-original-host"), "www.mmdbkk.com");
  });
});
