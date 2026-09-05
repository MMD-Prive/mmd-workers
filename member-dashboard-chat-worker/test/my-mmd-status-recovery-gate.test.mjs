import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../src/my-mmd-lovable-app-front-gate.js";

test("customer status recovery is visible without CSS :has and is driven by an explicit WebView-safe state", async () => {
  const runtime = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        `<!doctype html><html><head></head><body><main>LIFF bridge</main><div id="message"></div><div id="actions"></div><script nonce="abc123">window.__shell=true;</script></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    },
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/liff?intent=status"), runtime);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-liff-ui-mode"), "auth-bridge-only");
  assert.equal(response.headers.get("x-mmd-liff-return-target"), "/my-mmd/");

  assert.match(html, /body\.mmd-status-recovery #message\{display:block!important/);
  assert.match(html, /body\.mmd-status-recovery #mmd-status-bridge-veil \.t\{display:none!important/);
  assert.doesNotMatch(html, /:has\(/);

  assert.match(html, /id="mmd-status-bridge-recovery-observer"/);
  assert.match(html, /new MutationObserver\(syncRecoveryState\)/);
  assert.match(html, /classList\.toggle\("mmd-status-recovery"/);

  assert.match(html, /ยังยืนยัน Member Session ไม่สำเร็จครับ/);
  assert.match(html, /ลองยืนยันอีกครั้ง/);
  assert.match(html, /กลับ My MMD/);
});
