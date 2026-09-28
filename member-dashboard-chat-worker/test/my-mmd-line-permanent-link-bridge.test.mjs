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
  test(`LINE status stays on the native LIFF surface for ${url}`, async () => {
    const response = await worker.fetch(new Request(url), runtimeWithDarkLegacyShell());
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-liff-ui-mode"), null);
    assert.equal(response.headers.get("x-mmd-liff-return-target"), null);
    assert.match(html, /LEGACY DARK MEMBER DASHBOARD/);
    assert.doesNotMatch(html, /mmd-status-bridge-veil/);
    assert.doesNotMatch(html, /\/my-mmd-assets\/hype\.webp/);
  });
}
