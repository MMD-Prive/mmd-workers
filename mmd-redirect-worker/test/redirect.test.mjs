import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";

import worker, {
  findMappedPath,
  normalizePath,
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

const TELEGRAM_BRIEF_FORBIDDEN_TEXT = /Briefing HYPE TELEGRAMBOT|TELEGRAMBOT|CEO TELEGRAM BRIEF/i;
const wranglerConfig = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const PRESERVED_QUERY = "t=test-token&code=abc&promo=gold&payment_ref=pay123&session_id=sess_1&x=1";

function assertPolishedShell(html, url) {
  assert.doesNotMatch(html, /name=["']token["']/i, url);
  for (const text of VISIBLE_DEBUG_TEXT) {
    assert.doesNotMatch(html, new RegExp(text, "i"), `${url} should not show ${text}`);
  }
}

describe("MMD permanent redirect guard", () => {
  it("declares explicit /trust/inme route ownership for mmd-redirect-worker", () => {
    assert.ok(wranglerConfig.includes('pattern = "mmdbkk.com/trust/inme*"'));
    assert.ok(wranglerConfig.includes('pattern = "www.mmdbkk.com/trust/inme*"'));
  });

  it("canonicalizes www legacy paths and preserves query strings", async () => {
    const response = await request("http://www.mmdbkk.com/inme?t=abc123&ref=line");

    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/sigil/start?t=abc123&ref=line");
    assert.equal(passThroughRequests.length, 0);
  });

  it("maps legacy SIGIL start aliases to /sigil/start and preserves query strings exactly", async () => {
    const aliases = [
      "/trust/inme",
      "/inme",
      "/login",
      "/members",
      "/trust",
    ];

    for (const alias of aliases) {
      const response = await request(`https://www.mmdbkk.com${alias}?${PRESERVED_QUERY}`);
      assert.equal(response.status, 301, alias);
      assert.equal(
        response.headers.get("location"),
        `https://mmdbkk.com/sigil/start?${PRESERVED_QUERY}`,
        alias,
      );
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("redirects /member to /member/dashboard with query strings preserved exactly", async () => {
    for (const path of ["/member", "/member/"]) {
      const response = await request(`https://www.mmdbkk.com${path}?${PRESERVED_QUERY}`);

      assert.equal(response.status, 301, path);
      assert.equal(response.headers.get("location"), `https://mmdbkk.com/member/dashboard?${PRESERVED_QUERY}`, path);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", path);
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("redirects legacy membership routes to /member/membership with query strings preserved exactly", async () => {
    const aliases = [
      "/membership",
      "/membership/",
      "/membership/benefits",
      "/membership/benefits/",
      "/member/membership/benefits",
      "/member/membership/benefits/",
    ];

    for (const alias of aliases) {
      const response = await request(`https://www.mmdbkk.com${alias}?${PRESERVED_QUERY}`);

      assert.equal(response.status, 301, alias);
      assert.equal(response.headers.get("location"), `https://mmdbkk.com/member/membership?${PRESERVED_QUERY}`, alias);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", alias);
      assert.notEqual(response.headers.get("location"), `https://mmdbkk.com/pay/membership?${PRESERVED_QUERY}`, alias);
      assert.notEqual(response.headers.get("location"), `https://mmdbkk.com/membership/benefits?${PRESERVED_QUERY}`, alias);
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("redirects renewal aliases to /sigil/membership with query strings preserved exactly", async () => {
    for (const path of ["/renew", "/renew/", "/renewal", "/renewal/"]) {
      const response = await request(`https://www.mmdbkk.com${path}?${PRESERVED_QUERY}`);

      assert.equal(response.status, 301, path);
      assert.equal(response.headers.get("location"), `https://mmdbkk.com/sigil/membership?${PRESERVED_QUERY}`, path);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", path);
      assert.notEqual(response.headers.get("location"), `https://mmdbkk.com/trust/inme?${PRESERVED_QUERY}`, path);
      assert.notEqual(response.headers.get("location"), `https://mmdbkk.com/sigil/start?${PRESERVED_QUERY}`, path);
    }

    assert.equal(passThroughRequests.length, 0);
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
      assert.equal(serviceRequests.at(-1).url, url);
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("passes /member/membership through to the Webflow origin path without redirecting or changing query strings", async () => {
    const memberPageRequests = [];
    const immigrateRequests = [];
    const env = {
      MEMBER_PAGES_WORKER: {
        fetch: async (request) => {
          memberPageRequests.push(request);
          throw new Error(`/member/membership must not route to member-pages-worker: ${request.url}`);
        },
      },
      IMMIGRATE_WORKER: {
        fetch: async (request) => {
          immigrateRequests.push(request);
          throw new Error(`/member/membership must not route to immigrate-worker: ${request.url}`);
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
      const upstream = new URL(url);
      upstream.protocol = "https:";
      upstream.hostname = "mmdprive.webflow.io";

      assert.notEqual(response.status, 301, url);
      assert.notEqual(response.status, 302, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-worker"), null, url);
      assert.notEqual(response.headers.get("x-mmd-worker"), "member-pages-worker", url);
      assert.equal(response.headers.get("x-mmd-origin-pass-through"), "webflow-origin", url);
      assert.equal(passThroughRequests.at(-1).url, upstream.toString(), url);
    }

    assert.equal(memberPageRequests.length, 0);
    assert.equal(immigrateRequests.length, 0);
    assert.equal(passThroughRequests.length, urls.length);
  });

  it("delegates /sigil/membership to member-pages-worker before generic SIGIL pass-through", async () => {
    const serviceRequests = [];
    const env = {
      MEMBER_PAGES_WORKER: {
        fetch: async (request) => {
          serviceRequests.push(request);
          return new Response("<main>Renewal / Access Conditions official verification</main>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8", "x-mmd-worker": "member-pages-worker", "x-mmd-page": "sigil-membership" },
          });
        },
      },
    };

    for (const url of [
      `https://mmdbkk.com/sigil/membership?${PRESERVED_QUERY}`,
      `https://www.mmdbkk.com/sigil/membership/?${PRESERVED_QUERY}`,
    ]) {
      const response = await requestWithEnv(url, env);
      const html = await response.text();

      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", url);
      assert.equal(response.headers.get("x-mmd-page"), "sigil-membership", url);
      assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker", url);
      assert.match(html, /Renewal \/ Access Conditions/, url);
      assert.equal(serviceRequests.at(-1).url, url);
    }

    assert.equal(serviceRequests.length, 2);
    assert.equal(passThroughRequests.length, 0);
  });

  it("falls back to member-pages-worker upstream for /sigil/membership without Webflow pass-through", async () => {
    const response = await request(`https://www.mmdbkk.com/sigil/membership?${PRESERVED_QUERY}`);
    const expected = new URL(`https://www.mmdbkk.com/sigil/membership?${PRESERVED_QUERY}`);
    expected.protocol = "https:";
    expected.hostname = "member-pages-worker.malemodel-bkk.workers.dev";

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker");
    assert.equal(passThroughRequests.at(-1).url, expected.toString());
    assert.notEqual(new URL(passThroughRequests.at(-1).url).hostname, "mmdprive.webflow.io");
  });

  it("following renewal aliases reaches valid SIGIL membership content", async () => {
    const env = {
      MEMBER_PAGES_WORKER: {
        fetch: async (request) => new Response("<main>Renewal / Access Conditions official verification</main>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8", "x-mmd-worker": "member-pages-worker", "x-mmd-page": "sigil-membership" },
        }),
      },
    };

    for (const alias of ["/renew", "/renewal"]) {
      const first = await requestWithEnv(`https://www.mmdbkk.com${alias}?${PRESERVED_QUERY}`, env);
      assert.equal(first.status, 301, alias);
      assert.equal(first.headers.get("location"), `https://mmdbkk.com/sigil/membership?${PRESERVED_QUERY}`, alias);

      const followed = await requestWithEnv(first.headers.get("location"), env);
      const html = await followed.text();

      assert.equal(followed.status, 200, alias);
      assert.equal(followed.headers.get("location"), null, alias);
      assert.equal(followed.headers.get("x-mmd-page"), "sigil-membership", alias);
      assert.match(html, /Renewal \/ Access Conditions/, alias);
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("delegates canonical /sigil/apply routes to sigil-worker with ownership headers and preserved query strings", async () => {
    const sigilRequests = [];
    const env = {
      SIGIL_WORKER: {
        fetch: async (request) => {
          sigilRequests.push(request);
          const url = new URL(request.url);
          return new Response(`<main>SIGIL Private Model Setup ${url.search}</main>`, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "x-mmd-page": "sigil-private-model-setup",
              "x-mmd-sigil-page-source": "webflow/private-model-setup",
            },
          });
        },
      },
    };

    const urls = [
      "https://mmdbkk.com/sigil/apply",
      "https://mmdbkk.com/sigil/apply/",
      "https://www.mmdbkk.com/sigil/apply?t=abc&code=x&promo=y",
      "https://www.mmdbkk.com/sigil/apply/?t=abc&code=x&promo=y",
    ];

    for (const url of urls) {
      const response = await requestWithEnv(url, env);
      const html = await response.text();

      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-route-owner"), "sigil-worker", url);
      assert.equal(response.headers.get("x-mmd-page"), "sigil-private-model-setup", url);
      assert.equal(response.headers.get("x-mmd-origin"), "service-binding:sigil-worker", url);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", url);
      assert.equal(response.headers.get("x-mmd-front-version"), "20260622T071500Z", url);
      assert.doesNotMatch(html, TELEGRAM_BRIEF_FORBIDDEN_TEXT, url);
      assert.equal(sigilRequests.at(-1).url, url);
    }

    assert.equal(sigilRequests.length, urls.length);
    assert.equal(passThroughRequests.length, 0);
  });

  it("delegates /sigil/api/private-model/apply POST and OPTIONS to sigil-worker with ownership headers", async () => {
    const sigilRequests = [];
    const env = {
      SIGIL_WORKER: {
        fetch: async (request) => {
          sigilRequests.push(request);
          if (request.method === "OPTIONS") {
            return new Response(null, {
              status: 204,
              headers: {
                "access-control-allow-origin": "https://www.mmdbkk.com",
                "x-mmd-page": "sigil-private-model-apply-api",
              },
            });
          }
          return new Response(JSON.stringify({ ok: true, method: request.method }), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "access-control-allow-origin": "https://www.mmdbkk.com",
              "x-mmd-page": "sigil-private-model-apply-api",
            },
          });
        },
      },
    };

    const post = await requestWithEnv("https://www.mmdbkk.com/sigil/api/private-model/apply?t=abc&code=x&promo=y", env, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://www.mmdbkk.com" },
      body: JSON.stringify({
        nickname: "Test",
        phone: "0999999999",
        private_standard: "standard_private",
        minimum_rate_thb: 8000,
        consent: true,
        website: "",
      }),
    });

    assert.equal(post.status, 200);
    assert.equal(post.headers.get("location"), null);
    assert.equal(post.headers.get("x-mmd-route-owner"), "sigil-worker");
    assert.equal(post.headers.get("x-mmd-page"), "sigil-private-model-apply-api");
    assert.equal(post.headers.get("x-mmd-origin"), "service-binding:sigil-worker");
    assert.equal(sigilRequests.at(-1).url, "https://www.mmdbkk.com/sigil/api/private-model/apply?t=abc&code=x&promo=y");
    assert.equal(sigilRequests.at(-1).method, "POST");

    const options = await requestWithEnv("https://mmdbkk.com/sigil/api/private-model/apply?payment_ref=pay_1", env, {
      method: "OPTIONS",
      headers: {
        origin: "https://www.mmdbkk.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    assert.equal(options.status, 204);
    assert.equal(options.headers.get("x-mmd-route-owner"), "sigil-worker");
    assert.equal(options.headers.get("x-mmd-page"), "sigil-private-model-apply-api");
    assert.equal(options.headers.get("x-mmd-origin"), "service-binding:sigil-worker");
    assert.equal(sigilRequests.at(-1).url, "https://mmdbkk.com/sigil/api/private-model/apply?payment_ref=pay_1");
    assert.equal(sigilRequests.at(-1).method, "OPTIONS");
    assert.equal(passThroughRequests.length, 0);
  });

  it("does not use Webflow or generic pass-through for /sigil/api/private-model/apply when service binding is unavailable", async () => {
    const response = await request("https://www.mmdbkk.com/sigil/api/private-model/apply?t=abc&code=x&promo=y", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ private_standard: "standard_private" }),
    });
    const expected = new URL("https://www.mmdbkk.com/sigil/api/private-model/apply?t=abc&code=x&promo=y");
    expected.protocol = "https:";
    expected.hostname = "sigil.mmdbkk.com";

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-mmd-route-owner"), "sigil-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-private-model-apply-api");
    assert.equal(response.headers.get("x-mmd-origin"), "https://sigil.mmdbkk.com");
    assert.equal(passThroughRequests.at(-1).url, expected.toString());
    assert.notEqual(new URL(passThroughRequests.at(-1).url).hostname, "mmdprive.webflow.io");
  });

  it("does not use Webflow or generic pass-through for /sigil/apply when the service binding is unavailable", async () => {
    const urls = [
      "https://mmdbkk.com/sigil/apply?t=abc&code=x&promo=y",
      "https://www.mmdbkk.com/sigil/apply/?t=abc&code=x&promo=y",
    ];

    for (const url of urls) {
      const response = await request(url);
      const html = await response.text();
      const expected = new URL(url);
      expected.protocol = "https:";
      expected.hostname = "sigil.mmdbkk.com";

      assert.equal(response.status, 209, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-route-owner"), "sigil-worker", url);
      assert.equal(response.headers.get("x-mmd-page"), "sigil-private-model-setup", url);
      assert.equal(response.headers.get("x-mmd-origin"), "https://sigil.mmdbkk.com", url);
      assert.equal(passThroughRequests.at(-1).url, expected.toString(), url);
      assert.notEqual(new URL(passThroughRequests.at(-1).url).hostname, "mmdprive.webflow.io", url);
      assert.doesNotMatch(html, TELEGRAM_BRIEF_FORBIDDEN_TEXT, url);
    }

    assert.equal(passThroughRequests.length, urls.length);
  });

  it("fails closed without Webflow or generic pass-through when /sigil/apply service binding throws", async () => {
    const env = {
      SIGIL_WORKER: {
        fetch: async () => {
          throw new Error("sigil service unavailable");
        },
      },
    };

    await assert.rejects(
      requestWithEnv("https://www.mmdbkk.com/sigil/apply?t=abc&code=x&promo=y", env),
      /sigil service unavailable/,
    );

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
      assert.match(html, new RegExp(`/member/dashboard\\${new URL(url).search}`), url);
      assert.doesNotMatch(html, /name=["']token["']/i, url);
      assert.equal(adminRequests.at(-1).url, url);
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
      assert.equal(response.headers.get("x-mmd-temporary-route"), "true", url);
      assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate, max-age=0", url);
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
      assert.equal(response.headers.get("x-mmd-temporary-route"), "true", url);
      assert.match(html, /Model Console/, url);
      assert.match(html, /พื้นที่สำหรับผู้ให้บริการตรวจสถานะงาน/, url);
      assert.ok(html.includes(`/v1/model/session/dashboard${query}`), url);
      assert.ok(html.includes(`/member/dashboard${query}`), url);
      assertPolishedShell(html, url);
    }

    assert.equal(passThroughRequests.length, 0);
  });

  it("passes /member/membership through to origin when service bindings are missing", async () => {
    globalThis.fetch = async (request) => {
      passThroughRequests.push(request);
      return new Response("webflow membership", {
        status: 200,
        headers: { "x-webflow-page": "member-membership" },
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
      expected.hostname = "mmdprive.webflow.io";
      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-webflow-page"), "member-membership");
      assert.notEqual(response.headers.get("x-mmd-worker"), "member-pages-worker", url);
      assert.equal(response.headers.get("x-mmd-origin-pass-through"), "webflow-origin", url);
      assert.equal(passThroughRequests.at(-1).url, expected.toString());
    }
  });

  it("preserves t, code, and promo on /member/membership without legacy redirects", async () => {
    globalThis.fetch = async (request) => {
      passThroughRequests.push(request);
      return new Response("webflow membership", { status: 200 });
    };

    const urls = [
      "https://mmdbkk.com/member/membership?t=abc&code=x&promo=y",
      "https://www.mmdbkk.com/member/membership?t=abc&code=x&promo=y",
      "https://mmdbkk.com/member/membership/?t=abc&code=x&promo=y",
    ];

    for (const url of urls) {
      const response = await request(url);
      const upstreamUrl = passThroughRequests.at(-1).url;

      assert.equal(response.status, 200, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.doesNotMatch(upstreamUrl, /\/pay\/membership|\/trust\/inme|\/membership\/benefits/i, url);
      assert.match(upstreamUrl, /[?&]t=abc(?:&|$)/, url);
      assert.match(upstreamUrl, /[?&]code=x(?:&|$)/, url);
      assert.match(upstreamUrl, /[?&]promo=y(?:&|$)/, url);
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
      assert.equal(response.headers.get("location"), null);
    }
  });

  it("keeps /pay routes separate from SIGIL start redirects", async () => {
    const memberPageUrls = [
      "https://mmdbkk.com/pay/membership?t=abc&code=x&promo=y&debug=1",
    ];
    const genericPayUrls = [
      "https://www.mmdbkk.com/pay/renewal?t=abc&payment_ref=pay_1",
      "https://mmdbkk.com/pay/checkout?promo=y&payment_ref=pay_2",
    ];

    for (const url of memberPageUrls) {
      const response = await request(url);
      const expected = new URL(url);
      expected.protocol = "https:";
      expected.hostname = "member-pages-worker.malemodel-bkk.workers.dev";

      assert.equal(response.status, 209, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-test-pass-through"), "1", url);
      assert.equal(passThroughRequests.at(-1).url, expected.toString(), url);
    }

    for (const url of genericPayUrls) {
      const response = await request(url);

      assert.equal(response.status, 209, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-test-pass-through"), "1", url);
      assert.equal(passThroughRequests.at(-1).url, url, url);
    }
  });

  it("leaves generic webhook POST routes untouched", async () => {
    const response = await request("https://www.mmdbkk.com/webhooks/payment?t=abc&payment_ref=pay_1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-test-pass-through"), "1");
    assert.equal(passThroughRequests.at(-1).url, "https://www.mmdbkk.com/webhooks/payment?t=abc&payment_ref=pay_1");
    assert.equal(passThroughRequests.at(-1).method, "POST");
  });

  it("keeps protected membership, payment, webhook, SIGIL start, and SIGIL apply routes from legacy redirects", async () => {
    const protectedRequests = [
      { url: `https://www.mmdbkk.com/member/dashboard?${PRESERVED_QUERY}`, expectedStatus: 209 },
      { url: `https://www.mmdbkk.com/member/membership?${PRESERVED_QUERY}`, expectedStatus: 209 },
      { url: `https://www.mmdbkk.com/pay/membership?${PRESERVED_QUERY}`, expectedStatus: 209 },
      { url: `https://www.mmdbkk.com/pay/pending-verification?${PRESERVED_QUERY}`, expectedStatus: 209 },
      { url: `https://www.mmdbkk.com/webhooks/line?${PRESERVED_QUERY}`, expectedStatus: 209 },
      { url: `https://www.mmdbkk.com/sigil/start?${PRESERVED_QUERY}`, expectedStatus: 209 },
      { url: `https://www.mmdbkk.com/sigil/membership?${PRESERVED_QUERY}`, expectedStatus: 209 },
      { url: `https://www.mmdbkk.com/sigil/apply?${PRESERVED_QUERY}`, expectedStatus: 209 },
    ];

    for (const { url, expectedStatus } of protectedRequests) {
      const response = await request(url);

      assert.equal(response.status, expectedStatus, url);
      assert.equal(response.headers.get("location"), null, url);
      assert.equal(response.headers.get("x-mmd-front-gate"), "mmd-redirect-worker", url);
      assert.notEqual(response.headers.get("location"), `https://mmdbkk.com/sigil/start?${PRESERVED_QUERY}`, url);
    }

    const api = await request(`https://www.mmdbkk.com/sigil/api/private-model/apply?${PRESERVED_QUERY}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://www.mmdbkk.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    assert.equal(api.status, 209);
    assert.equal(api.headers.get("location"), null);
    assert.equal(api.headers.get("x-mmd-route-owner"), "sigil-worker");
    assert.equal(api.headers.get("x-mmd-page"), "sigil-private-model-apply-api");
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
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/sigil/start?t=kept");
  });

  it("redirects a trailing legacy slash once to SIGIL start and then passes through canonical target", async () => {
    const first = await request("https://mmdbkk.com/trust/inme/");
    assert.equal(first.status, 301);
    assert.equal(first.headers.get("location"), "https://mmdbkk.com/sigil/start");

    const second = await request(first.headers.get("location"));
    assert.equal(second.status, 209);
    assert.equal(passThroughRequests.length, 1);
  });

  it("normalizes duplicate legacy slashes once to SIGIL start and then passes through canonical target", async () => {
    const first = await request("https://mmdbkk.com/trust//inme");
    assert.equal(first.status, 301);
    assert.equal(first.headers.get("location"), "https://mmdbkk.com/sigil/start");

    const second = await request(first.headers.get("location"));
    assert.equal(second.status, 209);
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through canonical URLs that do not need changes", async () => {
    const response = await request("https://mmdbkk.com/about?t=abc");

    assert.equal(response.status, 209);
    assert.equal(response.headers.get("x-test-pass-through"), "1");
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through already canonical /sigil/start", async () => {
    const response = await request("https://mmdbkk.com/sigil/start?t=abc");

    assert.equal(response.status, 209);
    assert.equal(passThroughRequests.length, 1);
    assert.equal(passThroughRequests[0].url, "https://mmdbkk.com/sigil/start?t=abc");
  });

  it("passes through unsafe methods", async () => {
    const response = await request("https://www.mmdbkk.com/inme?t=abc", { method: "POST" });

    assert.equal(response.status, 209);
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through POST /login without redirecting", async () => {
    const response = await request("https://www.mmdbkk.com/login?t=abc", { method: "POST" });

    assert.equal(response.status, 209);
    assert.equal(passThroughRequests.length, 1);
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
      "/sigil/admin/login",
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
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through unmanaged hosts", async () => {
    const response = await request("https://models.mmdbkk.com/inme?t=abc");

    assert.equal(response.status, 209);
    assert.equal(passThroughRequests.length, 1);
  });

  it("passes through SIGIL admin on a never-touch host if it ever reaches this worker", async () => {
    const response = await request("https://sigil.mmdbkk.com/sigil/admin/login?t=abc");

    assert.equal(response.status, 209);
    assert.equal(passThroughRequests.length, 1);
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
    assert.equal(findMappedPath("/LOGIN/"), "/sigil/start");
    assert.equal(findMappedPath("/trust/inme"), "/sigil/start");
    assert.equal(findMappedPath("/MEMBERSHIP/BENEFITS/"), "/member/membership");
    assert.equal(findMappedPath("/renewal/"), "/sigil/membership");
    assert.equal(findMappedPath("/old-academy/Lv1"), "/academy/Lv1");
  });

  it("recognizes exact no-touch prefixes without trailing slash", () => {
    assert.equal(shouldNeverTouch(new URL("https://mmdbkk.com/api")), true);
    assert.equal(shouldNeverTouch(new URL("https://mmdbkk.com/payment")), true);
  });
});
