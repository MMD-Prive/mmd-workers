import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./src/dashboard-worker.js";

const ROOT = "<div id=\"mmdKenjiKnowledgeV9\"></div>";
const CSS = "https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-board-bridge.css";
const LOADER = "https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-1-webflow-loader-board196.js";

async function request(path, init) {
  return worker.fetch(new Request(`https://mmdbkk.com${path}`, init), {}, {});
}

for (const path of [
  "/internal/admin/kenji-knowledge",
  "/internal/admin/kenji-knowledge/",
  "/internal/admin/kenji-knowledge?source=route-handoff",
]) {
  test(`production entrypoint serves GET ${path}`, async () => {
    const response = await request(path);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^text\/html\b/);
    assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate, max-age=0");
    assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker");
    assert.equal(response.headers.get("x-mmd-page"), "kenji-knowledge-admin");
    assert.equal(response.headers.get("x-mmd-origin"), "admin-worker:kenji-knowledge-shell");
    assert.equal(response.headers.get("x-mmd-worker"), "admin-worker");
    assert.equal(response.headers.get("x-mmd-front-gate"), null);
    assert.match(html, new RegExp(ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(html.includes(CSS));
    assert.ok(html.includes(`<script defer src="${LOADER}"></script>`));
    assert.doesNotMatch(html, /not_found|AIRTABLE|ADMIN_BEARER|CONFIRM_KEY|INTERNAL_TOKEN/);
  });
}

for (const path of [
  "/internal/admin/kenji-knowledge",
  "/internal/admin/kenji-knowledge/",
]) {
  test(`production entrypoint serves bodyless HEAD ${path}`, async () => {
    const response = await request(path, { method: "HEAD" });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^text\/html\b/);
    assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker");
    assert.equal(await response.text(), "");
  });
}

test("non-Kenji routes still delegate to the core worker", async () => {
  const response = await request("/ping");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.worker, "admin-worker");
  assert.match(response.headers.get("content-type") || "", /^application\/json\b/);
});

test("route ownership is narrow and absent from the redirect-worker config", async () => {
  const [adminConfig, redirectConfig] = await Promise.all([
    readFile(new URL("./wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../mmd-redirect-worker/wrangler.toml", import.meta.url), "utf8"),
  ]);
  const expected = [
    "mmdbkk.com/internal/admin/kenji-knowledge",
    "mmdbkk.com/internal/admin/kenji-knowledge/",
    "mmdbkk.com/internal/admin/kenji-knowledge*",
    "www.mmdbkk.com/internal/admin/kenji-knowledge",
    "www.mmdbkk.com/internal/admin/kenji-knowledge/",
    "www.mmdbkk.com/internal/admin/kenji-knowledge*",
  ];

  for (const pattern of expected) {
    assert.equal(count(adminConfig, `pattern = "${pattern}"`), 1, pattern);
    assert.equal(count(redirectConfig, `pattern = "${pattern}"`), 0, pattern);
  }
  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/internal\/admin\/\*"/);
  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/internal\/\*"/);
  assert.doesNotMatch(adminConfig, /pattern = "(?:www\.)?mmdbkk\.com\/\*"/);
  assert.match(redirectConfig, /pattern = "mmdbkk\.com\/\*"/);
  assert.match(redirectConfig, /pattern = "www\.mmdbkk\.com\/\*"/);
});

function count(value, needle) {
  return value.split(needle).length - 1;
}
