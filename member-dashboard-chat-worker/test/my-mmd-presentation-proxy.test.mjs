import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";

import worker from "../src/front-gate-index.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("My MMD presentation proxy strips member credentials and rewrites bounded app HTML", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push({
      url: request.url,
      method: request.method,
      cookie: request.headers.get("cookie"),
      authorization: request.headers.get("authorization"),
    });
    return new Response(`<!doctype html>
      <link rel="modulepreload" href="/assets/index-ABC.js">
      <link rel="stylesheet" href="/assets/styles-ABC.css">
      <link rel="icon" href="/favicon.ico">
      <a href="/">Home</a><a href="/profile">Profile</a>
      <script defer src="/~flock.js" data-proxy-url="/~api/analytics"></script>
      <aside id="lovable-badge"><a href="https://lovable.dev">Edit with Lovable</a></aside>
      <script type="module" src="/assets/index-ABC.js"></script>`, {
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
    url: "https://my-mmd-member-profile.lovable.app/profile?lang=th",
    method: "GET",
    cookie: null,
    authorization: null,
  }]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-ui-source"), "lovable-presentation-proxy");
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/i);
  assert.match(html, /\/member\/my-mmd-assets\/index-ABC\.js/);
  assert.match(html, /\/member\/my-mmd-assets\/styles-ABC\.css/);
  assert.match(html, /\/member\/my-mmd-assets\/favicon\.ico/);
  assert.match(html, /href="\/member\/my-mmd"/);
  assert.match(html, /href="\/member\/my-mmd\/profile"/);
  assert.doesNotMatch(html, /~flock\.js|lovable-badge|Edit with Lovable/);
});

test("My MMD asset proxy keeps module graph on the same-origin asset prefix", async () => {
  const calls = [];
  globalThis.fetch = async (request) => {
    calls.push({ url: request.url, cookie: request.headers.get("cookie") });
    return new Response(`const deps=["assets/routes-ABC.js","/assets/primitives-ABC.js"]; import("./routes-ABC.js");`, {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/my-mmd-assets/index-ABC.js", {
    headers: { cookie: "__Host-mmd_liff_session=private-member-session" },
  }), {});
  const javascript = await response.text();

  assert.deepEqual(calls, [{
    url: "https://my-mmd-member-profile.lovable.app/assets/index-ABC.js",
    cookie: null,
  }]);
  assert.match(javascript, /"member\/my-mmd-assets\/routes-ABC\.js"/);
  assert.match(javascript, /"\/member\/my-mmd-assets\/primitives-ABC\.js"/);
  assert.match(javascript, /import\("\.\/routes-ABC\.js"\)/);
});

test("My MMD asset proxy repairs stale LINE verify links without encoding the endpoint path in liff.state", async () => {
  globalThis.fetch = async () => new Response(
    `const verify="https://miniapp.line.me/2010862595-yT4DCEMc?liff.state=%2Fmember%2Fliff%3Fintent%3Dstatus";`,
    { headers: { "content-type": "text/javascript; charset=utf-8" } },
  );

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/my-mmd-assets/index-LIFF.js"), {});
  const javascript = await response.text();

  assert.equal(response.status, 200);
  assert.match(javascript, /https:\/\/miniapp\.line\.me\/2010862595-yT4DCEMc\/\?intent=status/);
  assert.doesNotMatch(javascript, /liff\.state=%2Fmember%2Fliff/);
  assert.doesNotMatch(javascript, /member\/liff\/member\/liff/);
});

test("My MMD presentation proxy is read-only", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unexpected");
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/my-mmd", { method: "POST" }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
  assert.equal(calls, 0);
});

test("wrangler claims My MMD presentation and asset routes on apex and www", async () => {
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  for (const route of [
    "mmdbkk.com/member/my-mmd*",
    "www.mmdbkk.com/member/my-mmd*",
    "mmdbkk.com/member/my-mmd-assets/*",
    "www.mmdbkk.com/member/my-mmd-assets/*",
  ]) {
    assert.ok(wrangler.includes(`pattern = "${route}"`), `missing Worker route: ${route}`);
  }
});
