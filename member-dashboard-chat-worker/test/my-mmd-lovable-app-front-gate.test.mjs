import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";

import worker from "../src/my-mmd-lovable-app-front-gate.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("canonical /my-mmd app proxies the Lovable React presentation without forwarding member credentials", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push({
      url: request.url,
      cookie: request.headers.get("cookie"),
      authorization: request.headers.get("authorization"),
    });
    return new Response(`<!doctype html><html><head>
      <link rel="stylesheet" href="/assets/app.css">
      <link rel="icon" href="/favicon.ico">
      </head><body>
      <a href="/">Home</a><a href="/points">Points</a>
      <aside id="lovable-badge">Edit with Lovable</aside>
      <script src="/~flock.js"></script>
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
  assert.equal(response.headers.get("x-mmd-ui-source"), "lovable-app-proxy");
  assert.equal(response.headers.get("x-mmd-presentation-owner"), "lovable");
  assert.equal(response.headers.get("x-mmd-behavior-owner"), "mmd-workers");
  assert.match(html, /\/my-mmd-assets\/app\.css/);
  assert.match(html, /\/my-mmd-assets\/app\.js/);
  assert.match(html, /\/my-mmd-assets\/favicon\.ico/);
  assert.match(html, /href="\/my-mmd\/"/);
  assert.match(html, /href="\/my-mmd\/points"/);
  assert.doesNotMatch(html, /lovable-badge|Edit with Lovable|~flock\.js/);
  assert.doesNotMatch(html, /data-mmd-shell="lovable-single-file-v1"/);
});

test("canonical My MMD asset graph stays same-origin and stale old base paths are migrated", async () => {
  globalThis.fetch = async (request) => new Response(
    `const a="/assets/chunk.js"; const b="assets/local.js"; const old="/member/my-mmd/points";`,
    { headers: { "content-type": "text/javascript; charset=utf-8", "x-upstream-url": request.url } },
  );

  const response = await worker.fetch(new Request("https://mmdbkk.com/my-mmd-assets/app.js"), {});
  const javascript = await response.text();

  assert.equal(response.status, 200);
  assert.match(javascript, /"\/my-mmd-assets\/chunk\.js"/);
  assert.match(javascript, /"my-mmd-assets\/local\.js"/);
  assert.match(javascript, /"\/my-mmd\/points"/);
  assert.doesNotMatch(javascript, /\/member\/my-mmd/);
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

test("My MMD app remains read-only while behavior stays on /api/member/app/*", async () => {
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

test("status LIFF bridge returns to /my-mmd/ after the existing same-site verification gate", async () => {
  const runtime = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        `<!doctype html><html><body><div id="message"></div><div id="actions"></div><script nonce="abc123">window.__shell=true;</script></body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    },
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=status"), runtime);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-liff-return-target"), "/my-mmd/");
  assert.match(html, /const target = "\/my-mmd\/"/);
  assert.doesNotMatch(html, /const target = "\/member\/my-mmd"/);
  assert.match(html, /\/member\/api\/liff\/profile/);
  assert.match(html, /payload && payload\.ok === true/);
});

test("wrangler locks the canonical Lovable app routes and Worker BFF routes on apex and www", async () => {
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
