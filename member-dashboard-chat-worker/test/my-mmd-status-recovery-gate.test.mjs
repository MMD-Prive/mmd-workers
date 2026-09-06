import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../src/my-mmd-bounded-status-front-gate.js";

test("customer status recovery is WebView-safe and hard-stops the visible spinner after 12 seconds", async () => {
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
  assert.equal(response.headers.get("x-mmd-liff-recovery-gate"), "hard-timeout-v1");
  assert.equal(response.headers.get("x-mmd-liff-hard-timeout-ms"), "12000");

  assert.match(html, /body\.mmd-status-recovery #message\{display:block!important/);
  assert.match(html, /body\.mmd-status-recovery #mmd-status-bridge-veil \.t\{display:none!important/);
  assert.doesNotMatch(html, /:has\(/);

  assert.match(html, /id="mmd-status-bridge-recovery-observer"/);
  assert.match(html, /new MutationObserver\(syncRecoveryState\)/);
  assert.match(html, /classList\.toggle\("mmd-status-recovery"/);

  assert.match(html, /id="mmd-status-hard-timeout-gate"/);
  assert.match(html, /const HARD_TIMEOUT_MS = 12000/);
  assert.match(html, /window\.setTimeout\([\s\S]*HARD_TIMEOUT_MS/);
  assert.match(html, /ยังยืนยันข้อมูลสมาชิกไม่ได้ครับ/);
  assert.match(html, /ลองยืนยันอีกครั้ง/);
  assert.match(html, /กลับ My MMD/);
  assert.match(html, /window\.location\.reload\(\)/);
  assert.match(html, /window\.location\.replace\("\/my-mmd\/"\)/);
});
