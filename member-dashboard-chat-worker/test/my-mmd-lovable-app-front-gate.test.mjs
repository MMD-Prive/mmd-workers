import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";

import worker from "../src/my-mmd-lovable-app-front-gate.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("canonical /my-mmd serves the self-contained Lovable incident shell without forwarding member credentials", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push({
      url: request.url,
      cookie: request.headers.get("cookie"),
      authorization: request.headers.get("authorization"),
    });
    return new Response(`<!doctype html>
      <html lang="th" data-mmd-shell="lovable-single-file-v1" data-mmd-boot-state="static">
      <head><link rel="icon" href="/favicon.ico"></head>
      <body><main>กำลังเปิด My MMD</main>
      <script>var p=location.pathname; var i=p.indexOf("/member/my-mmd"); var base="/member/my-mmd";</script>
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
    url: "https://my-mmd-member-profile.lovable.app/my-mmd-shell.html",
    cookie: null,
    authorization: null,
  }]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-ui-source"), "lovable-single-file-incident-rollback");
  assert.equal(response.headers.get("x-mmd-presentation-mode"), "single-file-incident-rollback-20260905");
  assert.equal(response.headers.get("x-mmd-presentation-owner"), "lovable");
  assert.equal(response.headers.get("x-mmd-behavior-owner"), "mmd-workers");
  assert.match(html, /data-mmd-shell="lovable-single-file-v1"/);
  assert.match(html, /data-mmd-boot-state="static"/);
  assert.match(html, /กำลังเปิด My MMD/);
  assert.match(html, /\/my-mmd-assets\/favicon\.ico/);
  assert.match(html, /\/my-mmd/);
  assert.doesNotMatch(html, /\/member\/my-mmd/);
});

test("missing or invalid Lovable incident shell returns a visible fail-closed recovery page instead of a blank response", async () => {
  globalThis.fetch = async () => new Response("<!doctype html><html><body>wrong artifact</body></html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  const response = await worker.fetch(new Request("https://mmdbkk.com/my-mmd/"), {});
  const html = await response.text();

  assert.equal(response.status, 502);
  assert.match(html, /My MMD ยังเปิดไม่สำเร็จครับ/);
  assert.match(html, /href="\/my-mmd\/"/);
  assert.ok(html.length > 300);
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
