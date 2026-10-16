import test from "node:test";
import assert from "node:assert/strict";

import {
  handleSessionCreatorPageRequest,
  isSessionCreatorAssetRequest,
  isSessionCreatorPageRequest,
} from "../src/session-creator-page-proxy.js";

test("routes only the Session Creator work and job pages", () => {
  assert.equal(isSessionCreatorPageRequest("/internal/admin/work", "GET"), true);
  assert.equal(isSessionCreatorPageRequest("/internal/admin/jobs/all", "GET"), true);
  assert.equal(isSessionCreatorPageRequest("/internal/admin/jobs/create-job", "GET"), true);
  assert.equal(isSessionCreatorPageRequest("/internal/admin/jobs/job-board", "GET"), true);
  assert.equal(isSessionCreatorPageRequest("/internal/admin/dashboard", "GET"), false);
  assert.equal(isSessionCreatorPageRequest("/internal/admin/work", "POST"), false);
  assert.equal(isSessionCreatorAssetRequest("/internal/admin/work/assets/index.js", "GET"), true);
  assert.equal(isSessionCreatorAssetRequest("/internal/admin/work/assets/", "GET"), false);
  assert.equal(isSessionCreatorAssetRequest("/internal/admin/clients/assets/index.js", "GET"), false);
});

test("proxies All Jobs query strings to Session Creator without forwarding cookies", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (request) => {
    upstreamRequest = request;
    return new Response("<html><head></head><body>All Jobs</body></html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  try {
    const response = await handleSessionCreatorPageRequest(new Request(
      "https://mmdbkk.com/internal/admin/jobs/all?session_id=sess_exact&page=2",
      { headers: { cookie: "admin_session=private", accept: "text/html" } },
    ));
    assert.equal(upstreamRequest.url, "https://mmd-os.lovable.app/internal/admin/jobs/all?session_id=sess_exact&page=2");
    assert.equal(upstreamRequest.headers.has("cookie"), false);
    assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker-session-creator-pro");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxies the page without forwarding operator cookies and rewrites assets to same origin", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequest;
  globalThis.fetch = async (request) => {
    upstreamRequest = request;
    return new Response('<html><head><link rel="modulepreload" href="/assets/index.js"><script defer src="/~flock.js" data-proxy-url="/~api/analytics"></script></head></html>', {
      headers: { "content-type": "text/html; charset=utf-8", "set-cookie": "upstream=secret" },
    });
  };

  try {
    const response = await handleSessionCreatorPageRequest(new Request("https://www.mmdbkk.com/internal/admin/work?tab=today", {
      headers: { cookie: "admin_session=private", accept: "text/html" },
    }));
    const html = await response.text();
    assert.equal(upstreamRequest.url, "https://mmd-os.lovable.app/internal/admin/work?tab=today");
    assert.equal(upstreamRequest.headers.has("cookie"), false);
    assert.match(html, /href="\/internal\/admin\/work\/assets\/index\.js"/);
    assert.doesNotMatch(html, /flock\.js/);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker-session-creator-pro");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rewrites nested JavaScript asset references and rejects asset traversal", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (request) => {
    requestedUrl = request.url;
    return new Response('import "/assets/lazy-chunk.js"; const icon="/assets/icon.svg";', {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  };

  try {
    const response = await handleSessionCreatorPageRequest(new Request(
      "https://mmdbkk.com/internal/admin/work/assets/main.js",
    ));
    const source = await response.text();
    assert.equal(requestedUrl, "https://mmd-os.lovable.app/assets/main.js");
    assert.match(source, /\/internal\/admin\/work\/assets\/lazy-chunk\.js/);
    assert.match(source, /\/internal\/admin\/work\/assets\/icon\.svg/);
    const rejected = await handleSessionCreatorPageRequest(new Request(
      "https://mmdbkk.com/internal/admin/work/assets/%2e%2e/private.js",
    ));
    assert.equal(rejected.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Money Control accepts GET/HEAD and slash alias but never payment APIs or historical pages", async () => {
  for (const path of ["/internal/admin/payments", "/internal/admin/payments/"]) {
    for (const method of ["GET", "HEAD"]) assert.equal(isSessionCreatorPageRequest(path, method), true);
    assert.equal(isSessionCreatorPageRequest(path, "POST"), false);
  }
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("must not proxy unrelated routes"); };
  try {
    for (const path of ["/internal/admin/payments/historical-backfill", "/v1/admin/payments/review", "/internal/admin/payments-other"]) {
      assert.equal(isSessionCreatorPageRequest(path, "GET"), false);
      const response = await handleSessionCreatorPageRequest(new Request("https://mmdbkk.com" + path));
      assert.equal(response.status, 404);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test("Money Control preserves proof_id, strips credentials and serves same-origin assets without cookies", async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async request => {
    requests.push(request);
    return new Response(request.method === "HEAD" ? null : '<html>Money Control<script src="/assets/money.js"></script></html>', {
      headers: { "content-type": "text/html", "set-cookie": "upstream=private" },
    });
  };
  try {
    for (const host of ["mmdbkk.com", "www.mmdbkk.com"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await handleSessionCreatorPageRequest(new Request("https://" + host + "/internal/admin/payments/?proof_id=proof_fixture", {
          method, headers: { Cookie: "admin_session=private", Authorization: "Bearer private" },
        }));
        assert.equal(response.status, 200);
        const upstream = requests.at(-1);
        assert.equal(upstream.url, "https://mmd-os.lovable.app/internal/admin/payments?proof_id=proof_fixture");
        assert.equal(upstream.method, method);
        assert.equal(upstream.headers.has("cookie"), false);
        assert.equal(upstream.headers.has("authorization"), false);
        assert.equal(response.headers.get("set-cookie"), null);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const body = await response.text();
        if (method === "HEAD") assert.equal(body, "");
        else assert.ok(body.includes('src="/internal/admin/work/assets/money.js"'));
      }
    }
  } finally { globalThis.fetch = original; }
});


test("rewrites hydration manifests and inline imports without changing API or external URLs", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    '<html><link href="/assets/styles.css"><script>window.manifest={preloads:["/assets/index.js"],src:"/assets/client.js"};import("/assets/route.js");const api="/v1/admin/auth/me";const external="https://example.com/assets/keep.js";</script></html>',
    { headers: { "content-type": "text/html" } },
  );
  try {
    const response = await handleSessionCreatorPageRequest(new Request("https://www.mmdbkk.com/internal/admin/jobs/job-board"));
    const html = await response.text();
    for (const file of ["styles.css", "index.js", "client.js", "route.js"])
      assert.ok(html.includes("/internal/admin/work/assets/" + file));
    assert.ok(html.includes('"/v1/admin/auth/me"'));
    assert.ok(html.includes('"https://example.com/assets/keep.js"'));
    assert.doesNotMatch(html, /["']\/assets\//);
    assert.doesNotMatch(html, /\/internal\/admin\/work\/internal\/admin\/work/);
  } finally { globalThis.fetch = original; }
});

test("does not cache missing asset responses", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("missing", { status: 404 });
  try {
    const response = await handleSessionCreatorPageRequest(new Request("https://mmdbkk.com/internal/admin/work/assets/missing.js"));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { globalThis.fetch = original; }
});
