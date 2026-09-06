import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";

import worker from "../src/front-gate-single-file-shell.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const shellHtml = `<!doctype html><html lang="th" data-mmd-shell="lovable-single-file-v1" data-mmd-boot-state="static"><head><meta name="robots" content="noindex,nofollow"></head><body><main id="view">กำลังเปิด My MMD</main><script>fetch('/api/member/app/dashboard',{credentials:'same-origin'});</script></body></html>`;

test("legacy single-file module can still serve its historical fixture without forwarding member credentials", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push({
      url: request.url,
      method: request.method,
      cookie: request.headers.get("cookie"),
      authorization: request.headers.get("authorization"),
    });
    return new Response(shellHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": "lovable_session=must-not-leak; Secure",
      },
    });
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/my-mmd/profile?lang=th", {
    headers: {
      cookie: "__Host-mmd_liff_session=private-member-session",
      authorization: "Bearer must-not-leak",
      accept: "text/html",
    },
  }), {});
  const html = await response.text();

  assert.deepEqual(calls, [{
    url: "https://my-mmd-member-profile.lovable.app/my-mmd-shell.html",
    method: "GET",
    cookie: null,
    authorization: null,
  }]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-ui-source"), "lovable-single-file-shell");
  assert.equal(response.headers.get("x-mmd-presentation-mode"), "single-file-v1");
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/i);
  assert.match(html, /data-mmd-shell="lovable-single-file-v1"/);
  assert.match(html, /data-mmd-boot-state="static"/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
});

test("legacy single-file module fails visibly instead of returning an unverified or wrong upstream document", async () => {
  globalThis.fetch = async () => new Response("<!doctype html><html><body>wrong build</body></html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/my-mmd"), {});
  const html = await response.text();

  assert.equal(response.status, 502);
  assert.match(html, /My MMD ยังเปิดไม่สำเร็จครับ/);
  assert.match(html, /ลองอีกครั้ง/);
  assert.doesNotMatch(html, /wrong build/);
});

test("legacy single-file shell module stays read-only", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(shellHtml, { headers: { "content-type": "text/html" } });
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/my-mmd", { method: "POST" }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  assert.equal(calls, 0);
});

test("legacy single-file module still delegates non-My-MMD routes to the existing front gate", async () => {
  const runtime = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(JSON.stringify({ ok: false, error: { code: "LIFF_SESSION_REQUIRED" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    },
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/api/member/app/dashboard", {
    headers: { accept: "application/json" },
  }), runtime);

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-upstream-service"), "member-pages-worker");
});

test("wrangler production entrypoint is the canonical bounded Lovable app front gate, not the legacy single-file shell", async () => {
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /^main = "src\/my-mmd-bounded-status-front-gate\.js"$/m);
  assert.doesNotMatch(wrangler, /^main = "src\/front-gate-single-file-shell\.js"$/m);
});
