import assert from "node:assert/strict";
import { test } from "node:test";

import worker, {
  canonicalMyMmdHostRedirect,
  withSharedPendingWishCookie,
} from "../src/my-mmd-bounded-status-front-gate.js";

test("apex My MMD canonicalizes to www and migrates an existing host-only pending Wish", () => {
  const token = `pw_${"A".repeat(43)}`;
  const response = canonicalMyMmdHostRedirect(new Request("https://mmdbkk.com/member/my-mmd?from=care-back", {
    headers: { cookie: `mmd_care_back_wish_link=${token}` },
  }));

  assert.ok(response);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://www.mmdbkk.com/member/my-mmd?from=care-back");
  assert.equal(response.headers.get("x-mmd-my-mmd-canonical-host"), "www.mmdbkk.com");
  assert.equal(response.headers.get("x-mmd-care-back-wish-cookie-migrated"), "true");
  const setCookie = response.headers.get("set-cookie") || "";
  assert.match(setCookie, new RegExp(`mmd_care_back_wish_link=${token}`));
  assert.match(setCookie, /Domain=mmdbkk\.com/i);
  assert.match(setCookie, /mmd_care_back_wish_link=; Max-Age=0; Path=\//i);
});

test("CARE BACK pending-Wish response cookies are shared across apex and www", () => {
  const response = withSharedPendingWishCookie(new Response("{}", {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": "mmd_care_back_wish_link=pw_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef; Max-Age=2592000; Path=/; Secure; SameSite=Lax",
    },
  }));

  assert.equal(response.headers.get("x-mmd-care-back-wish-cookie-scope"), "parent-domain-v1");
  assert.match(response.headers.get("set-cookie") || "", /Domain=mmdbkk\.com/i);
});

test("direct customer status uses a bounded LIFF verification bridge before Lovable MY MMD", async () => {
  const runtime = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        `<!doctype html><html><head></head><body><main data-mmd-liff-digital="v2">MY MMD LIFF DIGITAL</main><div id="message"></div><div id="actions"></div><script nonce="abc123">window.__shell=true;</script></body></html>`,
        { headers: { "content-type":"text/html; charset=utf-8" } },
      ),
    },
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/liff?intent=status"), runtime);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-liff-ui-mode"), "auth-bridge-only");
  assert.equal(response.headers.get("x-mmd-liff-return-target"), "/my-mmd/");
  assert.equal(response.headers.get("x-mmd-liff-recovery-gate"), "hard-timeout-v3-single-surface-one-retry");
  assert.equal(response.headers.get("x-mmd-liff-session-check"), "status-v1");
  assert.match(html, /MY MMD LIFF DIGITAL/);
  assert.match(html, /mmd-status-hard-timeout-gate/);
  assert.match(html, /mmd-status-bridge-veil/);
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
  assert.match(js, /Domain=mmdbkk\.com/);
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