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
