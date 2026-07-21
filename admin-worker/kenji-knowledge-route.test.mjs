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

for (const path of [CANONICAL, `${CANONICAL}/`]) {
  test(`canonical HEAD is bodyless: ${path}`, async () => {
    const response = await request(path, { method: "HEAD" });

    assert.equal(response.status, 200);
    assertSharedHeaders(response, "canonical");
    assert.equal(await response.text(), "");
  });
}

test("compatibility alias exact and slash serve the same shell as canonical", async () => {
  const canonical = await request(CANONICAL);
  const canonicalHtml = await canonical.text();

  for (const path of [ALIAS, `${ALIAS}/`]) {
    const response = await request(path);
    const html = await response.text();

    assert.equal(response.status, 200);
    assertSharedHeaders(response, "compatibility-alias");
    assert.equal(html, canonicalHtml);
    assertSingleShell(html);
  }
});

for (const path of [
  "/sigil/internal/admin/kenji-knowledge-other",
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
