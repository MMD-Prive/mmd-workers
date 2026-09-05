import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";

import worker from "../src/my-mmd-lovable-app-front-gate.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("canonical /my-mmd proxies the full Lovable app without forwarding member credentials", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push({
      url: request.url,
      cookie: request.headers.get("cookie"),
      authorization: request.headers.get("authorization"),
    });
    return new Response(`<!doctype html>
      <html lang="th"><head>
        <link rel="icon" href="/favicon.ico">
        <link rel="stylesheet" href="/assets/app.css">
      </head><body>
        <a href="/">Home</a><a href="/membership">Membership</a>
        <main>MMD PRIVÉ · MY MMD</main>
        <script type="module" src="/assets/app.js"></script>
      </body></html>`, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": "lovable_session=must-not-leak; Secure",
      },
    });
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/my-mmd/points?lang=th", {
    headers: {
      cookie: "__Host-mmd_liff_session=private-member-session",
      authorization: "Bearer must-not-leak",
      accept: "text/html",
    },
  }), {});
  const html = await response.text();

  assert.deepEqual(calls, [{
    url: "https://my-mmd-member-profile.lovable.app/points?lang=th",
    cookie: null,
    authorization: null,
  }]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-ui-source"), "lovable-full-app-proxy");
  assert.equal(response.headers.get("x-mmd-presentation-mode"), "lovable-full-app-20260905");
  assert.equal(response.headers.get("x-mmd-presentation-owner"), "lovable");
  assert.equal(response.headers.get("x-mmd-behavior-owner"), "mmd-workers");
  assert.match(html, /MMD PRIVÉ · MY MMD/);
  assert.match(html, /\/my-mmd-assets\/app\.css/);
  assert.match(html, /\/my-mmd-assets\/app\.js/);
  assert.match(html, /\/my-mmd-assets\/favicon\.ico/);
  assert.match(html, /href="\/my-mmd\/"/);
  assert.match(html, /href="\/my-mmd\/membership"/);
  assert.doesNotMatch(html, /\/member\/my-mmd/);
});

test("Lovable upstream failure returns a visible fail-closed recovery page with HYPE", async () => {
  globalThis.fetch = async () => {
    throw new Error("origin unavailable");
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/my-mmd/"), {});
  const html = await response.text();

  assert.equal(response.status, 502);
  assert.match(html, /My MMD ยังเปิดไม่สำเร็จครับ/);
  assert.match(html, /\/my-mmd-assets\/hype\.webp/);
  assert.match(html, /href="\/my-mmd\/"/);
  assert.ok(html.length > 300);
});

test("Lovable JS assets are republished same-origin and rewritten to the canonical asset prefix", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push(request.url);
    return new Response(`const a="/assets/chunk.js";`, {
      headers: { "content-type": "application/javascript" },
    });
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/my-mmd-assets/app.js"), {});
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["https://my-mmd-member-profile.lovable.app/assets/app.js"]);
  assert.match(body, /\/my-mmd-assets\/chunk\.js/);
});

test("public Lovable assets under /my-mmd/* are proxied from the published origin", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push(request.url);
    return new Response("png-bytes", { headers: { "content-type": "image/png" } });
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/my-mmd/hype-loader.png"), {});
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, "png-bytes");
  assert.deepEqual(calls, ["https://my-mmd-member-profile.lovable.app/hype-loader.png"]);
});

test("HYPE loader asset is republished same-origin from the locked Webflow asset", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push(request.url);
    return new Response("hype-bytes", { headers: { "content-type": "image/webp" } });
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/my-mmd-assets/hype.webp"), {});
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, "hype-bytes");
  assert.deepEqual(calls, ["https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a36fa9c99c7e95731eeca5d_HYPE.webp"]);
});

test("LINE status GIF is republished same-origin from the locked Webflow asset", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push(request.url);
    return new Response("gif-bytes", { headers: { "content-type": "image/gif" } });
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/my-mmd-assets/hype-loading.gif"), {});
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body, "gif-bytes");
  assert.deepEqual(calls, ["https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a9be30ba79b9386ecdbe9ab_HYPE_NOW_LOADING_10FRAMES.gif"]);
});

test("legacy /member/my-mmd route is compatibility-only and redirects to /my-mmd preserving suffix and query", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unexpected");
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/my-mmd/points?lang=zh"), {});

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://www.mmdbkk.com/my-mmd/points?lang=zh");
  assert.equal(response.headers.get("x-mmd-legacy-route"), "member-my-mmd-to-my-mmd");
  assert.equal(calls, 0);
});

test("My MMD presentation remains read-only while behavior stays on /api/member/app/*", async () => {
  const appPost = await worker.fetch(new Request("https://mmdbkk.com/my-mmd/", { method: "POST" }), {});
  assert.equal(appPost.status, 405);
  assert.equal(appPost.headers.get("allow"), "GET, HEAD");

  const calls = [];
  const runtime = {
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        calls.push({ path: new URL(request.url).pathname, cookie: request.headers.get("cookie") });
        return Response.json({ ok: true, points: { balance: 120 } });
      },
    },
  };
  const api = await worker.fetch(new Request("https://mmdbkk.com/api/member/app/dashboard", {
    headers: { cookie: "__Host-mmd_liff_session=current", accept: "application/json" },
  }), runtime);

  assert.equal(api.status, 200);
  assert.deepEqual(calls, [{ path: "/api/member/app/dashboard", cookie: "__Host-mmd_liff_session=current" }]);
  assert.equal(api.headers.get("x-mmd-upstream-service"), "member-pages-worker");
});

test("status LIFF remains auth-bridge-only and returns to the single /my-mmd/ surface", async () => {
  const runtime = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        `<!doctype html><html><head></head><body><main>SECOND DASHBOARD SHOULD BE COVERED</main><div id="message"></div><div id="actions"></div><script nonce="abc123">const target = "/member/my-mmd"; const profileEndpoint = "/member/api/liff/profile"; if (payload && payload.ok === true) window.location.replace(target);</script></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    },
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=status"), runtime);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-liff-return-target"), "/my-mmd/");
  assert.equal(response.headers.get("x-mmd-liff-ui-mode"), "auth-bridge-only");
  assert.match(html, /const target = "\/my-mmd\/"/);
  assert.match(html, /id="mmd-status-bridge-veil"/);
  assert.match(html, /html,body\{background:#000!important\}/);
  assert.match(html, /กำลังยืนยันสมาชิก…/);
  assert.match(html, /\/my-mmd-assets\/hype-loading\.gif/);
  assert.match(html, /\/member\/api\/liff\/profile/);
});

test("non-status LIFF intents keep their existing specialized surfaces", async () => {
  const runtime = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        `<!doctype html><html><head></head><body><main>PROMO SURFACE</main></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    },
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=promo&campaign=care_back"), runtime);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-liff-ui-mode"), null);
  assert.match(html, /PROMO SURFACE/);
  assert.doesNotMatch(html, /mmd-status-bridge-veil/);
});

test("wrangler keeps canonical My MMD, BFF and legacy redirect routes Worker-owned", async () => {
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /^main = "src\/my-mmd-lovable-app-front-gate\.js"$/m);
  for (const route of [
    "mmdbkk.com/my-mmd*",
    "www.mmdbkk.com/my-mmd*",
    "mmdbkk.com/my-mmd-assets/*",
    "www.mmdbkk.com/my-mmd-assets/*",
    "mmdbkk.com/api/member/app/*",
    "www.mmdbkk.com/api/member/app/*",
    "mmdbkk.com/member/my-mmd*",
    "www.mmdbkk.com/member/my-mmd*",
  ]) {
    assert.ok(wrangler.includes(`pattern = "${route}"`), `missing Worker route: ${route}`);
  }
});
