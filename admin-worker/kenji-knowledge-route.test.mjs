import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./src/dashboard-worker.js";

const CANONICAL = "/sigil/internal/admin/kenji-knowledge";
const ALIAS = "/internal/admin/kenji-knowledge";
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

for (const path of [CANONICAL, `${CANONICAL}/`, `${CANONICAL}?source=head-test`, `${ALIAS}?source=head-test`]) {
  test(`canonical HEAD is bodyless: ${path}`, async () => {
    const response = await request(path, { method: "HEAD" });

    assert.equal(response.status, 200);
    assertSharedHeaders(response, path.startsWith(ALIAS) ? "compatibility-alias" : "canonical");
    assert.equal(await response.text(), "");
  });
}

test("compatibility alias exact, slash, and query serve the same shell as canonical", async () => {
  const canonical = await request(CANONICAL);
  const canonicalHtml = await canonical.text();

  for (const path of [ALIAS, `${ALIAS}/`, `${ALIAS}?source=alias-test`]) {
    const response = await request(path);
    const html = await response.text();

    assert.equal(response.status, 200);
    assertSharedHeaders(response, "compatibility-alias");
    assert.equal(html, canonicalHtml);
    assertSingleShell(html);
  }
});

test("canonical and alias query requests serve without redirecting or changing their URL", async () => {
  for (const path of [`${CANONICAL}?source=test`, `${ALIAS}?source=test`]) {
    const incoming = new Request(`https://mmdbkk.com${path}`);
    const originalUrl = incoming.url;
    const response = await worker.fetch(incoming, {}, {});

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.equal(incoming.url, originalUrl);
  }
});

for (const path of [
  "/sigil/internal/admin/kenji",
  "/sigil/internal/admin/other",
]) {
  test(`canonical sibling does not serve the Kenji shell: ${path}`, async () => {
    const response = await request(path);
    const body = await response.text();

    assert.equal(body.includes(ROOT), false);
    assert.equal(response.headers.get("x-mmd-page"), null);
  });
}

for (const path of [
  `${CANONICAL}-other`,
  `${CANONICAL}/foo`,
  `${ALIAS}-other`,
  `${ALIAS}/foo`,
]) {
  test(`captured Kenji suffix passes through to origin exactly once: ${path}`, async () => {
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

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://mmdbkk.com${path}`);
    assert.equal(response.status, 418);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(response.headers.get("x-origin-test"), "true");
    assert.equal(response.headers.get("x-mmd-page"), null);
    assert.equal(response.headers.get("x-mmd-route-kind"), null);
    assert.equal(await response.text(), `origin:${path}`);
  });
}

test("suffix pass-through preserves method, query, headers, body, and origin response", async () => {
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

  assert.equal(calls, 1);
  assert.equal(response.status, 207);
  assert.equal(response.headers.get("content-type"), "application/origin-test");
  assert.equal(response.headers.get("x-mmd-route-owner"), null);
  assert.equal(response.headers.get("x-mmd-page"), null);
  assert.equal(response.headers.get("x-mmd-route-kind"), null);
  assert.equal(await response.text(), "origin-body");
});

for (const [routeKind, path] of [["canonical", CANONICAL], ["compatibility-alias", ALIAS]]) {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    test(`${method} exact ${routeKind} passes through to origin once`, async () => {
      const requestPath = `${path}?source=exact-method-test`;
      const requestBody = JSON.stringify({ routeKind, method });
      let calls = 0;
      const response = await withOriginFetchMock(
        async (incoming) => {
          calls += 1;
          assert.equal(incoming.method, method);
          assert.equal(incoming.url, `https://mmdbkk.com${requestPath}`);
          assert.equal(incoming.headers.get("content-type"), "application/json");
          assert.equal(incoming.headers.get("x-safe-test"), "preserved");
          assert.equal(await incoming.text(), requestBody);
          return new Response(`origin:${routeKind}:${method}`, {
            status: 202,
            headers: { "content-type": "text/exact-origin-test" },
          });
        },
        () => request(requestPath, {
          method,
          headers: { "content-type": "application/json", "x-safe-test": "preserved" },
          body: requestBody,
        })
      );

      const body = await response.text();
      assert.equal(calls, 1);
      assert.equal(response.status, 202);
      assert.equal(response.headers.get("content-type"), "text/exact-origin-test");
      assert.equal(response.headers.get("x-mmd-route-owner"), null);
      assert.equal(response.headers.get("x-mmd-page"), null);
      assert.equal(response.headers.get("x-mmd-worker"), null);
      assert.equal(response.headers.get("x-mmd-route-kind"), null);
      assert.equal(response.headers.get("x-mmd-route-canonical"), null);
      assert.equal(body, `origin:${routeKind}:${method}`);
      assert.equal(body.includes(ROOT), false);
      assert.equal(body.includes("not_found"), false);
    });
  }
}

test("canonical and alias route ownership is narrow and isolated", async () => {
  const [adminConfig, redirectConfig, immigrateConfig, immigrateSource] = await Promise.all([
    readFile(new URL("./wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../mmd-redirect-worker/wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../immigrate-worker/wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../immigrate-worker/src/index.ts", import.meta.url), "utf8"),
  ]);
  const canonicalPatterns = routePatterns(CANONICAL);
  const aliasPatterns = routePatterns(ALIAS);

  for (const pattern of [...canonicalPatterns, ...aliasPatterns]) {
    assert.equal(count(adminConfig, `pattern = "${pattern}"`), 1, pattern);
    assert.equal(count(redirectConfig, `pattern = "${pattern}"`), 0, pattern);
    assert.equal(count(immigrateConfig, pattern), 0, pattern);
  }
  assert.equal(immigrateSource.includes(CANONICAL), false);
  assert.equal(immigrateSource.includes(ALIAS), false);

  const forbidden = [
    "mmdbkk.com/sigil/*",
    "www.mmdbkk.com/sigil/*",
    "mmdbkk.com/sigil/internal/admin/*",
    "www.mmdbkk.com/sigil/internal/admin/*",
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
