import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../src/my-mmd-bounded-status-front-gate.js";

test("customer status recovery is WebView-safe, hard-stops after 12 seconds, and does not offer an endless reload loop", async () => {
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
  assert.equal(response.headers.get("x-mmd-liff-recovery-gate"), "hard-timeout-v2-one-retry");
  assert.equal(response.headers.get("x-mmd-liff-hard-timeout-ms"), "12000");
  assert.equal(response.headers.get("x-mmd-liff-manual-retry-window-ms"), "120000");

  assert.match(html, /body\.mmd-status-recovery #message\{display:block!important/);
  assert.match(html, /body\.mmd-status-recovery #mmd-status-bridge-veil \.t\{display:none!important/);
  assert.doesNotMatch(html, /:has\(/);

  assert.match(html, /id="mmd-status-bridge-recovery-observer"/);
  assert.match(html, /new MutationObserver\(syncRecoveryState\)/);
  assert.match(html, /classList\.toggle\("mmd-status-recovery"/);

  assert.match(html, /id="mmd-status-hard-timeout-gate"/);
  assert.match(html, /const HARD_TIMEOUT_MS = 12000/);
  assert.match(html, /const MANUAL_RETRY_WINDOW_MS = 120000/);
  assert.match(html, /mmd_status_manual_retry_at_v1/);
  assert.match(html, /window\.sessionStorage\.setItem\(RETRY_KEY/);
  assert.match(html, /retryAlreadyUsed/);
  assert.match(html, /ระบบจะไม่วนยืนยันซ้ำเอง/);
  assert.match(html, /ตรวจสถานะอีกครั้ง/);
  assert.match(html, /กลับ My MMD/);
  assert.match(html, /retry\.disabled = true/);
  assert.match(html, /window\.location\.reload\(\)/);
  assert.match(html, /window\.location\.replace\("\/my-mmd\/"\)/);
});
