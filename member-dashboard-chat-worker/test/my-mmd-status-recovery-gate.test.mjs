import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../src/my-mmd-bounded-status-front-gate.js";

test("customer status recovery verifies the LINE session, hard-stops after 12 seconds, and renders one non-overlapping status surface", async () => {
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
  assert.equal(response.headers.get("x-mmd-liff-recovery-gate"), "hard-timeout-v3-single-surface-one-retry");
  assert.equal(response.headers.get("x-mmd-liff-hard-timeout-ms"), "12000");
  assert.equal(response.headers.get("x-mmd-liff-manual-retry-window-ms"), "120000");
  assert.equal(response.headers.get("x-mmd-liff-session-check"), "status-v1");

  assert.match(html, /const statusEndpoint = "\/member\/api\/liff\/status"/);
  assert.match(html, /fetch\(statusEndpoint,/);
  assert.doesNotMatch(html, /const profileEndpoint =/);
  assert.doesNotMatch(html, /\/member\/api\/liff\/profile/);

  // The older embedded bridge still contains its own recovery CSS, but this
  // later v3 override is the final cascade: the raw #message never becomes a
  // second visible text layer. Its text is mirrored into the HYPE veil .t.
  assert.match(html, /id="mmd-status-single-surface-fix"/);
  assert.match(html, /body\.mmd-status-recovery #message\{display:none!important\}/);
  assert.match(html, /body\.mmd-status-recovery #mmd-status-bridge-veil \.t\{display:block!important/);
  assert.match(html, /body #actions\{top:auto!important;bottom:max\(/);
  assert.doesNotMatch(html, /:has\(/);

  assert.match(html, /id="mmd-status-single-surface-sync"/);
  assert.match(html, /statusText\.textContent = text \|\| "ยังยืนยัน LINE Session ไม่สำเร็จครับ"/);
  assert.match(html, /new MutationObserver\(sync\)\.observe\(actions/);
  assert.match(html, /new MutationObserver\(sync\)\.observe\(message/);

  assert.match(html, /id="mmd-status-hard-timeout-gate"/);
  assert.match(html, /const HARD_TIMEOUT_MS = 12000/);
  assert.match(html, /const MANUAL_RETRY_WINDOW_MS = 120000/);
  assert.match(html, /mmd_status_manual_retry_at_v1/);
  assert.match(html, /window\.sessionStorage\.setItem\(RETRY_KEY/);
  assert.match(html, /retryAlreadyUsed/);
  assert.match(html, /ระบบจะไม่วนยืนยันซ้ำเอง/);
  assert.match(html, /LINE Session/);
  assert.match(html, /ตรวจสถานะอีกครั้ง/);
  assert.match(html, /กลับ My MMD/);
  assert.match(html, /retry\.disabled = true/);
  assert.match(html, /window\.location\.reload\(\)/);
  assert.match(html, /window\.location\.replace\("\/my-mmd\/"\)/);
});

test("My MMD serves the pending public-Wish coupon bridge as same-origin behavior code", async () => {
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/my-mmd-assets/care-back-wish-link.js"), {});
  const js = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/javascript/);
  assert.equal(response.headers.get("x-mmd-care-back-wish-bridge"), "verified-coupon-v1");
  assert.match(js, /mmd_care_back_wish_link/);
  assert.match(js, /\/member\/api\/care-back\/link-wish/);
  assert.match(js, /if \(response\.status === 401\) return/);
  assert.match(js, /mmd:care-back:coupon-linked/);
  assert.match(js, /window\.location\.reload\(\)/);
});

test("canonical My MMD HTML receives the pending Wish bridge without moving coupon authority into Lovable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (String(url).startsWith("https://my-mmd-member-profile.lovable.app")) {
      return new Response("<!doctype html><html><head><title>My MMD</title></head><body><main>Lovable app</main></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return originalFetch(input);
  };

  try {
    const response = await worker.fetch(new Request("https://www.mmdbkk.com/my-mmd/"), {});
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-care-back-wish-bridge"), "verified-coupon-v1");
    assert.match(html, /<script src="\/my-mmd-assets\/care-back-wish-link\.js" defer><\/script><\/body>/);
    assert.doesNotMatch(html, /wish_link_token\s*:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
