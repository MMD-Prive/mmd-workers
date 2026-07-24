import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./src/dashboard-worker.js";

const CANONICAL = "/internal/admin/kenji-knowledge";
const LEGACY_SIGIL = "/sigil/internal/admin/kenji-knowledge";
const ROOT = "<div id=\"mmdKenjiKnowledgeV9\"></div>";
const CSS = "https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-board-bridge.css";
const LOADER = "https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-1-webflow-loader-board196.js";

async function request(path, init) {
  return worker.fetch(new Request(`https://mmdbkk.com${path}`, init), {}, {});
}

async function withOriginFetchMock(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function assertSharedHeaders(response, kind) {
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker");
  assert.equal(response.headers.get("x-mmd-page"), "kenji-knowledge-admin");
  assert.equal(response.headers.get("x-mmd-worker"), "admin-worker");
  assert.equal(response.headers.get("x-mmd-route-canonical"), CANONICAL);
  assert.equal(response.headers.get("x-mmd-route-kind"), kind);
  assert.equal(response.headers.get("x-mmd-front-gate"), null);
}

function assertSingleShell(html) {
  assert.equal(count(html, ROOT), 1);
  assert.equal(count(html, CSS), 1);
  assert.equal(count(html, LOADER), 1);
}

for (const path of [CANONICAL, `${CANONICAL}/`, `${CANONICAL}?source=canonical-test`]) {
  test(`canonical GET serves the shared shell: ${path}`, async () => {
    const response = await request(path);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^text\/html\b/);
    assertSharedHeaders(response, "canonical");
    assertSingleShell(html);
  });
}

for (const path of [CANONICAL, `${CANONICAL}/`, `${CANONICAL}?source=head-test`]) {
  test(`canonical HEAD is bodyless: ${path}`, async () => {
    const response = await request(path, { method: "HEAD" });

    assert.equal(response.status, 200);
    assertSharedHeaders(response, "canonical");
    assert.equal(await response.text(), "");
  });
}

test("legacy sigil internal admin route redirects to canonical with query preserved", async () => {
  for (const [path, location] of [
    [LEGACY_SIGIL, `https://mmdbkk.com${CANONICAL}`],
    [`${LEGACY_SIGIL}/`, `https://mmdbkk.com${CANONICAL}/`],
    [`${LEGACY_SIGIL}?abc=123`, `https://mmdbkk.com${CANONICAL}?abc=123`],
    [`${LEGACY_SIGIL}/foo?source=legacy-test`, `https://mmdbkk.com${CANONICAL}/foo?source=legacy-test`],
    ["/sigil/internal/admin/login?next=/internal/admin/kenji-knowledge", "https://mmdbkk.com/internal/admin/login?next=/internal/admin/kenji-knowledge"],
    ["/sigil/internal/admin/console?x=1", "https://mmdbkk.com/internal/admin/console?x=1"],
  ]) {
    const response = await request(path);

    assert.equal(response.status, 308, path);
    assert.equal(response.headers.get("location"), location, path);
    assert.equal(response.headers.get("x-mmd-route-canonical"), location.replace("https://mmdbkk.com", ""), path);
    assert.equal(await response.text(), "");
  }
});

test("canonical query request serves without redirecting or changing its URL", async () => {
  const path = `${CANONICAL}?source=test`;
  const incoming = new Request(`https://mmdbkk.com${path}`);
  const originalUrl = incoming.url;
  const response = await worker.fetch(incoming, {}, {});

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(incoming.url, originalUrl);
});

for (const path of [
  "/sigil/internal/admin/kenji",
  "/sigil/internal/admin/other",
]) {
  test(`legacy sigil internal admin sibling redirects to canonical namespace: ${path}`, async () => {
    const response = await request(path);

    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `https://mmdbkk.com${path.replace("/sigil/internal/admin", "/internal/admin")}`);
  });
}

for (const path of [
  `${CANONICAL}-other`,
  `${CANONICAL}/foo`,
]) {
  test(`captured canonical Kenji suffix does not fall through to origin: ${path}`, async () => {
    const calls = [];
    const response = await withOriginFetchMock(
      async (incoming) => {
        calls.push(incoming);
        return new Response(`origin:${new URL(incoming.url).pathname}`, {
          status: 418,
          headers: { "content-type": "text/plain; charset=utf-8", "x-origin-test": "true" },
        });
      },
      () => request(path)
    );

    assert.equal(calls.length, 0);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-mmd-page"), null);
    assert.equal((await response.json()).error, "admin_route_not_found");
  });
}

test("canonical suffix rejects POST without origin/Webflow fallback", async () => {
  const path = `${CANONICAL}/foo?source=suffix-test`;
  let calls = 0;
  const response = await withOriginFetchMock(
    async (incoming) => {
      calls += 1;
      assert.equal(incoming.method, "POST");
      assert.equal(incoming.url, `https://mmdbkk.com${path}`);
      assert.equal(incoming.headers.get("content-type"), "application/json");
      assert.equal(incoming.headers.get("x-safe-test"), "preserved");
      assert.deepEqual(await incoming.json(), { safe: true });
      return new Response("origin-body", {
        status: 207,
        headers: { "content-type": "application/origin-test" },
      });
    },
    () => request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-safe-test": "preserved" },
      body: JSON.stringify({ safe: true }),
    })
  );

  assert.equal(calls, 0);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-mmd-route-owner"), null);
  assert.equal(response.headers.get("x-mmd-page"), null);
  assert.equal((await response.json()).error, "admin_route_not_found");
});

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  test(`${method} exact canonical route returns method-not-allowed without origin fallback`, async () => {
    const requestPath = `${CANONICAL}?source=exact-method-test`;
    let calls = 0;
    const response = await withOriginFetchMock(
      async () => {
        calls += 1;
        return new Response("unexpected-origin");
      },
      () => request(requestPath, {
        method,
        headers: { "content-type": "application/json", "x-safe-test": "preserved" },
        body: JSON.stringify({ method }),
      })
    );

    const body = await response.json();
    assert.equal(calls, 0);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.equal(body.error, "method_not_allowed");
  });
}

test("canonical and alias route ownership is narrow and isolated", async () => {
  const [adminConfig, redirectConfig, immigrateConfig, immigrateSource] = await Promise.all([
    readFile(new URL("./wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../mmd-redirect-worker/wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../immigrate-worker/wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../immigrate-worker/src/index.ts", import.meta.url), "utf8"),
  ]);
  const canonicalPatterns = routePatterns(CANONICAL);
  const legacySigilPatterns = routePatterns(LEGACY_SIGIL);
  const legacySigilRedirectPatterns = [
    "mmdbkk.com/sigil/internal/admin*",
    "www.mmdbkk.com/sigil/internal/admin*",
  ];

  for (const pattern of [...canonicalPatterns, ...legacySigilPatterns]) {
    assert.equal(count(adminConfig, `pattern = "${pattern}"`), 1, pattern);
    assert.equal(count(redirectConfig, `pattern = "${pattern}"`), 0, pattern);
    assert.equal(count(immigrateConfig, pattern), 0, pattern);
  }
  for (const pattern of legacySigilRedirectPatterns) {
    assert.equal(count(adminConfig, `pattern = "${pattern}"`), 1, pattern);
    assert.equal(count(redirectConfig, `pattern = "${pattern}"`), 0, pattern);
    assert.equal(count(immigrateConfig, pattern), 0, pattern);
  }
  assert.equal(immigrateSource.includes(CANONICAL), false);
  assert.equal(immigrateSource.includes(LEGACY_SIGIL), false);

  const forbidden = [
    "mmdbkk.com/sigil/*",
    "www.mmdbkk.com/sigil/*",
    "mmdbkk.com/internal/admin/*",
    "www.mmdbkk.com/internal/admin/*",
    "mmdbkk.com/*",
    "www.mmdbkk.com/*",
  ];
  for (const pattern of forbidden) {
    assert.equal(count(adminConfig, `pattern = "${pattern}"`), 0, pattern);
  }
  assert.doesNotMatch(adminConfig, /global_fetch_strictly_public/);
});

test("PR 206 readiness API route declarations remain exact", async () => {
  const adminConfig = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");
  const expected = [
    "/v1/admin/auth/me",
    "/v1/internal/kenji/knowledge/published",
    "/v1/admin/kenji/knowledge/meta",
    "/v1/admin/kenji/knowledge/list",
    "/v1/admin/kenji/knowledge/*",
    "/v1/admin/kenji/knowledge/draft",
  ];

  for (const path of expected) {
    assert.equal(count(adminConfig, `pattern = "mmdbkk.com${path}"`), 1, path);
    assert.equal(count(adminConfig, `pattern = "www.mmdbkk.com${path}"`), 1, path);
  }
});

function routePatterns(path) {
  return [
    `mmdbkk.com${path}`,
    `mmdbkk.com${path}/`,
    `mmdbkk.com${path}*`,
    `www.mmdbkk.com${path}`,
    `www.mmdbkk.com${path}/`,
    `www.mmdbkk.com${path}*`,
  ];
}

function count(value, needle) {
  return value.split(needle).length - 1;
}
