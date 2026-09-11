import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../src/my-mmd-lovable-app-front-gate.js";

test("LINE status bridge keeps recovery copy visible when recovery actions exist", async () => {
  const runtime = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        `<!doctype html><html><head></head><body><main>LEGACY MEMBER SURFACE</main><div id="message"></div><div id="actions"></div><script nonce="abc123">const target = "/member/my-mmd"; const profileEndpoint = "/member/api/liff/profile";</script></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    },
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=status"), runtime);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /body #message\{display:none!important\}/);
  assert.match(html, /body:has\(#actions:not\(:empty\)\) #message\{display:block!important/);
  assert.match(html, /body:has\(#actions:not\(:empty\)\) #mmd-status-bridge-veil \.t\{display:none!important\}/);
  assert.match(html, /id="actions"/);
  assert.match(html, /id="message"/);
  assert.equal(response.headers.get("x-mmd-liff-ui-mode"), "auth-bridge-only");
  assert.equal(response.headers.get("x-mmd-liff-return-target"), "/my-mmd/");
});
