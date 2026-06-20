import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import worker, {
  ROUTE_HOP_HEADER,
  findMappedPath,
  getRouteHop,
  normalizePath,
  resolveRouteOwner,
  shouldNeverTouch,
} from "../src/index.js";

let originalFetch;
let passThroughRequests;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  passThroughRequests = [];
  globalThis.fetch = async (request) => {
    passThroughRequests.push(request);
    return new Response("pass-through", {
      status: 209,
      headers: { "x-test-pass-through": "1" },
    });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function request(url, init) {
  return worker.fetch(new Request(url, init));
}

async function requestWithEnv(url, env, init) {
  return worker.fetch(new Request(url, init), env);
}

const VISIBLE_DEBUG_TEXT = [
  "Front Gate Active",
  "Route recovery shell",
  "x-mmd-page",
  "x-mmd-front-gate",
  "x-mmd-front-version",
  "fallback",
  "recovery",
];

function assertPolishedShell(html, url) {
  assert.doesNotMatch(html, /name=["']token["']/i, url);
  for (const text of VISIBLE_DEBUG_TEXT) {
    assert.doesNotMatch(html, new RegExp(text, "i"), `${url} should not show ${text}`);
  }
}

describe("MMD permanent redirect guard", () => {
  it("canonicalizes www legacy paths and preserves query strings", async () => {
    const response = await request("http://www.mmdbkk.com/inme?t=abc123&ref=line");

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/trust/inme?t=abc123&ref=line");
    assert.equal(response.headers.get("x-mmd-route-id"), "canonical-redirect");
    assert.equal(passThroughRequests.length, 0);
  });

  it("maps /login to /trust/inme and preserves ?t=", async () => {
    const response = await request("https://mmdbkk.com/login?t=abc");

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/trust/inme?t=abc");
    assert.equal(response.headers.get("x-mmd-route-mode"), "terminal-redirect");
  });

  it("maps /member and /membership to the membership benefits page", async () => {
    const member = await request("https://mmdbkk.com/member?t=abc");
    const membership = await request("https://www.mmdbkk.com/membership?t=abc");

    assert.equal(member.status, 301);
    assert.equal(member.headers.get("location"), "https://mmdbkk.com/membership/benefits?t=abc");
    assert.equal(membership.status, 301);
    assert.equal(membership.headers.get("location"), "https://mmdbkk.com/membership/benefits?t=abc");
  });

  it("delegates /member/dashboard to immigrate-worker by service binding without redirecting or changing query strings", async () => {
    const serviceRequests = [];
    const env = {
      IMMIGRATE_WORKER: {
        fetch: async (request) => {
          serviceRequests.push(request);
          return new Response("member dashboard", {
            status: 200,
            headers: { "x-mmd-worker": "immigrate-worker", "x-mmd-page": "member-dashboard" },
          });
        },
      },
    };

    const urls = [
      "https://mmdbkk.com/member/dashboard",
      "https://mmdbkk.com/member/dashboard/",
      "https://mmdbkk.com/member/dashboard?t=abc&code=x&promo=y&debug=1",
      "https://www.mmdbkk.com/member/dashboard?t=abc&code=x&promo=y&debug=1",
    ];

    for (const url of urls) {
      const response = await requestWithEnv(url, env);
      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-mmd-page"), "member-dashboard");
      assert.equal(response.headers.get("x-mmd-route-id"), "member-dashboard");
      assert.equal(response.headers.get("x-mmd-route-owner"), "immigrate-worker");
      assert.equal(serviceRequests.at(-1).url, url);
      assert.equal(serviceRequests.at(-1).headers.get(ROUTE_HOP_HEADER), "1");
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("delegates /member/membership to member-pages-worker by service binding without redirecting or changing query strings", async () => {
    const serviceRequests = [];
    const env = {
      MEMBER_PAGES_WORKER: {
        fetch: async (request) => {
          serviceRequests.push(request);
          return new Response("member membership", {
            status: 200,
            headers: { "x-mmd-worker": "member-pages-worker", "x-mmd-page": "member-membership" },
          });
        },
      },
    };

    const urls = [
      "https://mmdbkk.com/member/membership",
      "https://www.mmdbkk.com/member/membership",
      "https://mmdbkk.com/member/membership/",
      "https://www.mmdbkk.com/member/membership/",
      "https://mmdbkk.com/member/membership?t=abc&code=x&promo=y&debug=1",
      "https://www.mmdbkk.com/member/membership?t=abc&code=x&promo=y&debug=1",
    ];

    for (const url of urls) {
      const response = await requestWithEnv(url, env);
      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-mmd-page"), "member-membership");
      assert.equal(response.headers.get("x-mmd-route-id"), "member-membership");
      assert.equal(response.headers.get("x-mmd-route-owner"), "member-pages-worker");
      assert.equal(serviceRequests.at(-1).url, url);
      assert.equal(serviceRequests.at(-1).headers.get(ROUTE_HOP_HEADER), "1");
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("delegates /member/payments to admin-worker without redirecting or changing query strings", async () => {
    const adminRequests = [];
    const env = {
      ADMIN_WORKER: {
        fetch: async (request) => {
          adminRequests.push(request);
          const query = new URL(request.url).search;
          return new Response(`<a href="/member/dashboard${query}">Dashboard</a>`, {
            status: 200,
            headers: { "x-mmd-worker": "admin-worker", "x-mmd-page": "member-payments" },
          });
        },
      },
    };

    const urls = [
      "https://mmdbkk.com/member/payments?t=abc",
      "https://mmdbkk.com/member/payments/?t=abc",
      "https://www.mmdbkk.com/member/payments?t=abc&code=x&promo=y&debug=1",
    ];

    for (const url of urls) {
      const response = await requestWithEnv(url, env);
      const html = await response.text();
      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-worker"), "admin-worker", url);
      assert.equal(response.headers.get("x-mmd-page"), "member-payments", url);
      assert.equal(response.headers.get("x-mmd-route-id"), "member-payments", url);
      assert.match(html, new RegExp(`/member/dashboard\\${new URL(url).search}`), url);
      assert.doesNotMatch(html, /name=["']token["']/i, url);
      assert.equal(adminRequests.at(-1).url, url);
      assert.equal(adminRequests.at(-1).headers.get(ROUTE_HOP_HEADER), "1");
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("renders /hall as a polished MMD Privé page without redirecting or changing query strings", async () => {
    const urls = [
      "https://mmdbkk.com/hall?t=abc&cb=test",
      "https://mmdbkk.com/hall/?t=abc&cb=test",
      "https://www.mmdbkk.com/hall?t=abc&code=x&promo=y&debug=1",
    ];

    for (const url of urls) {
      const response = await request(url);
      const html = await response.text();
      const query = new URL(url).search;

      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-worker"), "mmd-redirect-worker", url);
      assert.equal(response.headers.get("x-mmd-page"), "hall", url);
      assert.equal(response.headers.get("x-mmd-route-id"), "hall", url);
      assert.equal(response.headers.get("x-mmd-temporary-route"), "true", url);
      assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0", url);
      assert.equal(response.headers.get("pragma"), "no-cache", url);
      assert.equal(response.headers.get("expires"), "0", url);
      assert.match(html, /MMD Hall/, url);
      assert.match(html, /พื้นที่กลางสำหรับเข้าสู่ระบบสมาชิก/, url);
      assert.ok(html.includes(`/member/dashboard${query}`), url);
      assert.ok(html.includes(`/member/payments${query}`), url);
      assertPolishedShell(html, url);
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("renders unknown /member/* routes as polished MMD Privé pages without redirecting", async () => {
    const urls = [
      "https://mmdbkk.com/member/kenji-20-ai?t=abc&cb=test",
      "https://mmdbkk.com/member/some-new-page?t=abc&cb=test",
      "https://www.mmdbkk.com/member/kenji-20-ai?t=abc&code=x&promo=y&debug=1",
    ];

    for (const url of urls) {
      const response = await request(url);
      const html = await response.text();
      const query = new URL(url).search;

      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-page"), "member-static", url);
      assert.equal(response.headers.get("x-mmd-route-id"), "member-static", url);
      assert.equal(response.headers.get("x-mmd-temporary-route"), "true", url);
      assert.match(html, url.includes("kenji-20-ai") ? /Kenji 20 AI/ : /Some New Page/, url);
      assert.match(html, /หน้านี้อยู่ในพื้นที่สมาชิกของ MMD Privé/, url);
      assert.ok(html.includes(`/member/dashboard${query}`), url);
      assert.ok(html.includes(`/member/membership${query}`), url);
      assertPolishedShell(html, url);
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("renders /model/console as a polished MMD Privé page without redirecting", async () => {
    const urls = [
      "https://mmdbkk.com/model/console?t=abc&cb=test",
      "https://www.mmdbkk.com/model/console?t=abc&debug=1",
    ];

    for (const url of urls) {
      const response = await request(url);
      const html = await response.text();
      const query = new URL(url).search;

      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-page"), "model-console", url);
      assert.equal(response.headers.get("x-mmd-route-id"), "model-console", url);
      assert.equal(response.headers.get("x-mmd-temporary-route"), "true", url);
      assert.match(html, /Model Console/, url);
      assert.match(html, /พื้นที่สำหรับผู้ให้บริการตรวจสถานะงาน/, url);
      assert.ok(html.includes(`/v1/model/session/dashboard${query}`), url);
      assert.ok(html.includes(`/member/dashboard${query}`), url);
      assertPolishedShell(html, url);
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("falls back to the member-pages-worker upstream for /member/membership when service binding is missing", async () => {
    globalThis.fetch = async (request) => {
      passThroughRequests.push(request);
      return new Response("membership upstream", {
        status: 200,
        headers: { "x-mmd-worker": "member-pages-worker", "x-mmd-page": "member-membership" },
      });
    };

    const urls = [
      "https://mmdbkk.com/member/membership",
      "https://mmdbkk.com/member/membership/",
      "https://mmdbkk.com/member/membership?t=abc&code=x&promo=y&debug=1",
    ];

    for (const url of urls) {
      const response = await request(url);
      const expected = new URL(url);
      expected.protocol = "https:";
      expected.hostname = "member-pages-worker.malemodel-bkk.workers.dev";
      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-mmd-route-id"), "member-membership");
      assert.equal(passThroughRequests.at(-1).url, expected.toString());
      assert.equal(passThroughRequests.at(-1).headers.get(ROUTE_HOP_HEADER), "1");
    }
  });

  it("proxies /member/dashboard on both hosts without redirecting or changing query strings", async () => {
    const urls = [
      "https://mmdbkk.com/member/dashboard?t=test",
      "https://www.mmdbkk.com/member/dashboard?t=test",
      "https://mmdbkk.com/member/dashboard/?t=test",
      "https://www.mmdbkk.com/member/dashboard/?t=test",
      "https://mmdbkk.com/member/dashboard?code=KJ-PRV-TEST01",
      "https://www.mmdbkk.com/member/dashboard?code=KJ-PRV-TEST01",
      "https://mmdbkk.com/member/dashboard?promo=KJ-PRV-TEST01",
      "https://www.mmdbkk.com/member/dashboard?promo=KJ-PRV-TEST01",
      "https://mmdbkk.com/member/dashboard?t=test&code=KJ-PRV-TEST01",
      "https://www.mmdbkk.com/member/dashboard?t=test&code=KJ-PRV-TEST01",
      "https://mmdbkk.com/member/dashboard?t=test&promo=KJ-PRV-TEST01",
      "https://www.mmdbkk.com/member/dashboard?t=test&promo=KJ-PRV-TEST01",
      "https://mmdbkk.com/member/dashboard/?t=test&code=KJ-PRV-TEST01",
      "https://www.mmdbkk.com/member/dashboard/?t=test&code=KJ-PRV-TEST01",
      "https://mmdbkk.com/member/dashboard/?t=test&promo=KJ-PRV-TEST01",
      "https://www.mmdbkk.com/member/dashboard/?t=test&promo=KJ-PRV-TEST01",
    ];

    for (const url of urls) {
      const response = await request(url);
      const expected = new URL(url);
      expected.protocol = "https:";
      expected.hostname = "immigrate-worker.malemodel-bkk.workers.dev";
      assert.equal(response.status, 209, url);
      assert.equal(passThroughRequests.at(-1).url, expected.toString());
      assert.equal(passThroughRequests.at(-1).headers.get(ROUTE_HOP_HEADER), "1");
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-mmd-route-id"), "member-dashboard");
    }
  });

  it("keeps /pay/membership separate as the payment page pass-through", async () => {
    const response = await request("https://mmdbkk.com/pay/membership?t=abc&code=x&promo=y&debug=1");

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-test-pass-through"), "1");
    assert.equal(response.headers.get("x-mmd-route-id"), "never-touch-pass-through");
    assert.equal(passThroughRequests.at(-1).url, "https://mmdbkk.com/pay/membership?t=abc&code=x&promo=y&debug=1");
  });

  it("maps nested /member/membership paths to /pay/membership paths", async () => {
    const response = await request("https://www.mmdbkk.com/member/membership/benefits?t=abc");

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/pay/membership?t=abc");
  });

  it("maps /member/membership/benefits directly to /pay/membership", async () => {
    const response = await request("https://mmdbkk.com/member/membership/benefits?t=abc");

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/pay/membership?t=abc");
  });

  it("canonicalizes www host without changing query parameter order or names", async () => {
    const response = await request("https://www.mmdbkk.com/path?x=1&t=abc");

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/path?x=1&t=abc");
  });

  it("redirects legacy domains to canonical host while preserving normalized paths", async () => {
    const response = await request("https://www.mmdprive.com/old-trust/a//b/?t=tok");

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/trust/a/b?t=tok");
  });

  it("normalizes duplicate and trailing slashes on managed hosts", async () => {
    const response = await request("https://mmdbkk.com/trust//inme/?t=kept");

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/trust/inme?t=kept");
  });

  it("redirects a trailing slash once and then passes through canonical target", async () => {
    const first = await request("https://mmdbkk.com/trust/inme/");
    assert.equal(first.status, 301);
    assert.equal(first.headers.get("location"), "https://mmdbkk.com/trust/inme");

    const second = await request(first.headers.get("location"));
    assert.equal(second.status, 209);
    assert.equal(passThroughRequests.length, 1);
  });

  it("normalizes duplicate slashes once and then passes through canonical target", async () => {
    const first = await request("https://mmdbkk.com/trust//inme");
    assert.equal(first.status, 301);
    assert.equal(first.headers.get("location"), "https://mmdbkk.com/trust/inme");

    const second = await request(first.headers.get("location"));
    assert.equal(second.status, 209);
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through canonical URLs that do not need changes as terminal pass-through", async () => {
    const response = await request("https://mmdbkk.com/about?t=abc");

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("x-test-pass-through"), "1");
    assert.equal(response.headers.get("x-mmd-route-id"), "canonical-pass-through");
    assert.equal(response.headers.get("x-mmd-route-mode"), "terminal-pass-through");
    assert.equal(passThroughRequests.length, 1);
    assert.equal(passThroughRequests.at(-1).headers.get(ROUTE_HOP_HEADER), "1");
  });

  it("passes through already canonical /trust/inme", async () => {
    const response = await request("https://mmdbkk.com/trust/inme");

    assert.equal(response.status, 209);
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through unsafe methods", async () => {
    const response = await request("https://www.mmdbkk.com/inme?t=abc", { method: "POST" });

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("x-mmd-route-id"), "unsafe-method-pass-through");
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through POST /login without redirecting", async () => {
    const response = await request("https://www.mmdbkk.com/login?t=abc", { method: "POST" });

    assert.equal(response.status, 209);
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through SIGIL admin and booking with explicit route ownership", async () => {
    const urls = [
      ["https://mmdbkk.com/sigil/admin/login?t=abc", "sigil-admin", "sigil-admin-worker"],
      ["https://mmdbkk.com/sigil/booking?t=abc", "sigil-booking", "sigil-model-search-worker"],
    ];

    for (const [url, routeId, owner] of urls) {
      const response = await request(url);
      assert.equal(response.status, 209, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-route-id"), routeId, url);
      assert.equal(response.headers.get("x-mmd-route-owner"), owner, url);
      assert.equal(passThroughRequests.at(-1).url, url);
      assert.equal(passThroughRequests.at(-1).headers.get(ROUTE_HOP_HEADER), "1", url);
    }
  });

  it("passes through API, payment, webhook, admin, and asset prefixes", async () => {
    const paths = [
      "/api/member",
      "/api/health",
      "/webhook/line",
      "/webhooks/line",
      "/pay/renewal",
      "/payments/checkout",
      "/payments/test",
      "/payment/review",
      "/payment-webhook/stripe",
      "/admin/console",
      "/sigil/pay/renewal",
      "/sigil/api/recovery/ack",
      "/cdn-cgi/trace",
      "/assets/app.js",
      "/static/app.css",
      "/uploads/photo.jpg",
    ];

    for (const path of paths) {
      const response = await request(`https://www.mmdbkk.com${path}?t=abc`);
      assert.equal(response.status, 209, path);
    }

    assert.equal(passThroughRequests.length, paths.length);
  });

  it("passes through never-touch hosts", async () => {
    const response = await request("https://sigil.mmdbkk.com/inme?t=abc");

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("x-mmd-route-id"), "never-touch-pass-through");
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through unmanaged hosts", async () => {
    const response = await request("https://models.mmdbkk.com/inme?t=abc");

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("x-mmd-route-id"), "unmanaged-host-pass-through");
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through SIGIL admin on a never-touch host if it ever reaches this worker", async () => {
    const response = await request("https://sigil.mmdbkk.com/sigil/admin/login?t=abc");

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("x-mmd-route-id"), "sigil-admin");
    assert.equal(passThroughRequests.length, 1);
  });

  it("blocks requests that re-enter the front gate too many times", async () => {
    const response = await request("https://mmdbkk.com/about?t=abc", {
      headers: { [ROUTE_HOP_HEADER]: "2" },
    });
    const text = await response.text();

    assert.equal(response.status, 508);
    assert.equal(text, "MMD route loop blocked");
    assert.equal(response.headers.get("x-mmd-route-error"), "loop-blocked");
    assert.equal(response.headers.get("x-mmd-route-id"), "route-loop-blocked");
    assert.equal(passThroughRequests.length, 0);
  });

  it("injects the dashboard bridge on the payment confirmation page only", async () => {
    globalThis.fetch = async (request) => {
      passThroughRequests.push(request);
      return new Response("<html><body><main>confirm</main></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    };

    const response = await request("https://mmdbkk.com/confirm/payment-confirmation?payment_ref=pay_1");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /mmd-confirm-dashboard-bridge/);
    assert.match(html, /payments\\\/notify/);
    assert.equal(passThroughRequests.length, 1);
  });
});

describe("redirect helpers", () => {
  it("normalizes paths", () => {
    assert.equal(normalizePath("/a//b///"), "/a/b");
    assert.equal(normalizePath("/"), "/");
    assert.equal(normalizePath(""), "/");
  });

  it("maps exact and folder redirects case-insensitively", () => {
    assert.equal(findMappedPath("/LOGIN/"), "/trust/inme");
    assert.equal(findMappedPath("/old-academy/Lv1"), "/academy/Lv1");
  });

  it("recognizes exact no-touch prefixes without trailing slash", () => {
    assert.equal(shouldNeverTouch(new URL("https://mmdbkk.com/api")), true);
    assert.equal(shouldNeverTouch(new URL("https://mmdbkk.com/payment")), true);
  });

  it("resolves explicit route owners without path-group inference", () => {
    assert.equal(resolveRouteOwner(new URL("https://mmdbkk.com/member/dashboard?t=abc")).id, "member-dashboard");
    assert.equal(resolveRouteOwner(new URL("https://mmdbkk.com/member/membership?t=abc")).id, "member-membership");
    assert.equal(resolveRouteOwner(new URL("https://mmdbkk.com/sigil/admin/login")).id, "sigil-admin");
    assert.equal(resolveRouteOwner(new URL("https://mmdbkk.com/sigil/booking")).id, "sigil-booking");
    assert.equal(resolveRouteOwner(new URL("https://mmdbkk.com/member/membership/benefits")), null);
  });

  it("reads route hop headers safely", () => {
    assert.equal(getRouteHop(new Request("https://mmdbkk.com/about")), 0);
    assert.equal(getRouteHop(new Request("https://mmdbkk.com/about", { headers: { [ROUTE_HOP_HEADER]: "2" } })), 2);
    assert.equal(getRouteHop(new Request("https://mmdbkk.com/about", { headers: { [ROUTE_HOP_HEADER]: "bad" } })), 0);
  });
});
