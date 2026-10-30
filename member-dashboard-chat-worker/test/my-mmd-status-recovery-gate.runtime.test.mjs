import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";

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

test("direct customer status bypasses the old auth-only Lovable recovery layer", async () => {
  const runtime = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        `<!doctype html><html><head></head><body><main>MY MMD LIFF DIGITAL</main><div id="message"></div><div id="actions"></div><script nonce="abc123">const historyEndpoint="/api/member/app/history"; const LOVABLE_POINTS_PATH="/my-mmd/points";</script></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    },
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/liff?intent=status"), runtime);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-liff-ui-mode"), null);
  assert.equal(response.headers.get("x-mmd-liff-return-target"), "/my-mmd/");
  assert.equal(response.headers.get("x-mmd-liff-recovery-gate"), null);
  assert.equal(response.headers.get("x-mmd-liff-session-check"), null);
  assert.match(html, /MY MMD LIFF DIGITAL/);
  assert.match(html, /\/api\/member\/app\/history/);
  assert.match(html, /LOVABLE_POINTS_PATH="\/my-mmd\/points"/);
  assert.doesNotMatch(html, /mmd-status-hard-timeout-gate/);
  assert.doesNotMatch(html, /mmd-status-single-surface-fix/);
  const script = html.match(/<script nonce="abc123" id="mmd-ems-login-return">([\s\S]*?)<\/script>/);
  assert.ok(script);
  for (const [label, reply, expected] of [
    ["verified", () => Response.json({ ok: true }), "/my-mmd/"],
    ["unverified", () => Response.json({ ok: false }), null],
    ["unauthorized", () => Response.json({ ok: true }, { status: 401 }), null],
    ["unavailable", () => Response.json({ ok: true }, { status: 503 }), null],
    ["malformed", () => new Response("not json"), null],
    ["network", () => { throw new Error("fixture failure"); }, null],
  ]) {
    let destination = null;
    const requests = [];
    vm.runInNewContext(script[1], {
      fetch: async (url, options) => {
        requests.push({ url, options });
        return reply();
      },
      location: { replace: (url) => { destination = url; } },
      clearTimeout() {}, setTimeout() {}, addEventListener() {},
      document: {
        createElement: () => ({ style: {}, setAttribute() {}, append() {} }),
        body: { prepend() {} }, addEventListener() {}, getElementById: () => null,
      },
    });
    await new Promise(setImmediate);
    assert.equal(destination, expected, label);
    assert.equal(requests.length, 1, label);
    assert.equal(requests[0].url, "/api/member/app/profile");
    assert.equal(requests[0].options.credentials, "same-origin");
    assert.equal(requests[0].options.cache, "no-store");
  }
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
    if (String(url).startsWith("https://mmdprive.webflow.io/member/dashboard?")) {
      return new Response('<!doctype html><html><head><title>My MMD</title></head><body><main class="mymmd-wf">Webflow Home</main></body></html>', {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    throw new Error("Unexpected fixture upstream");
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

test("Black Card LINE return never overlays the rendered Digital Home recovery UI", async () => {
  const html = '<!doctype html><html><head></head><body><main id="profile">SĪGIL system</main><div id="customer-boot-progress"></div><div id="message"></div><div id="actions"></div><script nonce="abc123">const homeReady=true;</script></body></html>';
  const env = { MEMBER_PAGES_WORKER: { fetch: async () => new Response(html, {headers:{"content-type":"text/html"}}) } };
  for (const query of ["intent=continue_payment","intent=continue_payment&view=blackcard","liff.state=%3Fintent%3Dcontinue_payment%26view%3Dblackcard"]) {
    const res = await worker.fetch(new Request("https://www.mmdbkk.com/member/liff?"+query),env);
    const body = await res.text();
    assert.match(body,/SĪGIL system/);
    const target = query.includes('blackcard') ? '/my-mmd/payments/blackcard' : '/my-mmd/payments';
    assert.equal(res.headers.get('x-mmd-liff-return-target'),target);
    assert.ok(body.includes('const target = "'+target+'";'));
    assert.doesNotMatch(body,/mmd-status-bridge-veil|mmd-status-hard-timeout-gate|mmd-status-single-surface-fix/);
    assert.equal(res.headers.get("x-mmd-liff-ui-mode"),null);
    assert.equal(res.headers.get("x-mmd-liff-recovery-gate"),null);
  }
});
