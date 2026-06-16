import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index.js";

const DEBUG_TEXT = /Front Gate Active|Route recovery shell|x-mmd-page|x-mmd-front-gate|x-mmd-front-version|fallback|recovery/i;

test("known member system pages render from admin-worker with preserved query links", async () => {
  const pages = [
    ["/member/profile", "member-profile", "Member Profile"],
    ["/member/sessions", "member-sessions", "Member Sessions"],
    ["/member/points", "member-points", "Member Points"],
    ["/member/upgrade", "member-upgrade", "Member Upgrade"],
  ];

  for (const [path, page, heading] of pages) {
    const response = await worker.fetch(new Request(`https://mmdbkk.com${path}?t=abc&code=x&promo=y&cb=test`), {});
    const html = await response.text();

    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type") || "", /text\/html/i, path);
    assert.equal(response.headers.get("x-mmd-owner"), "admin-worker", path);
    assert.equal(response.headers.get("x-mmd-page"), page, path);
    assert.match(html, new RegExp(`<h1>${heading}</h1>`), path);
    assert.ok(html.includes("/member/dashboard?t=abc&amp;code=x&amp;promo=y&amp;cb=test"), path);
    assert.doesNotMatch(html, /name=["']token["']/i, path);
    assert.doesNotMatch(html, DEBUG_TEXT, path);
  }
});
