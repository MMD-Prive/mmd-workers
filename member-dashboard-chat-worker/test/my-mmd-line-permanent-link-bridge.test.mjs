import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../src/my-mmd-lovable-app-front-gate.js";

function runtimeWithDarkLegacyShell() {
  return {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        `<!doctype html><html><head></head><body><main style="background:#090909">LEGACY DARK MEMBER DASHBOARD</main><div id="message"></div><div id="actions"></div><script nonce="abc123">const target = "/member/my-mmd"; const profileEndpoint = "/member/api/liff/profile"; if (payload && payload.ok === true) window.location.replace(target);</script></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    },
  };
}

for (const url of [
  "https://mmdbkk.com/member/liff",
  "https://mmdbkk.com/member/liff?liff.state=%3Fintent%3Dstatus",
  "https://mmdbkk.com/member/liff?liff_state=%2F%3Fintent%3Dstatus",
]) {
  test(`LINE status bridge covers legacy dark UI for ${url}`, async () => {
    const response = await worker.fetch(new Request(url), runtimeWithDarkLegacyShell());
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-liff-ui-mode"), "auth-bridge-only");
    assert.equal(response.headers.get("x-mmd-liff-return-target"), "/my-mmd/");
    assert.match(html, /id="mmd-status-bridge-veil"/);
    assert.match(html, /\/my-mmd-assets\/hype\.webp/);
    assert.match(html, /background:#fbf9f5/);
    assert.match(html, /const target = "\/my-mmd\/"/);
  });
}
