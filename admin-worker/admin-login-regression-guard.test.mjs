import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import coreWorker from "./src/index.js";

const APPROVED_PAGE_ID = "admin-login-approved-hero";
const LEGACY_MARKERS = [
  "Internal access.",
  "sigil-internal-login",
  "MMD Admin Sign In",
];

test("admin-worker production entrypoint is permanently pinned to the approved login wrapper", async () => {
  const wrangler = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /^main\s*=\s*"src\/admin-login-hero-worker\.js"$/m);
});

test("core fallback renders the same approved login page", async () => {
  const response = await coreWorker.fetch(
    new Request("https://mmdbkk.com/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room"),
    {}
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-page"), APPROVED_PAGE_ID);
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker");
  assert.match(html, new RegExp(`data-mmd-page="${APPROVED_PAGE_ID}"`));
  assert.match(html, /Ewvon and Chang in MMD internal administration environment/);
  for (const marker of LEGACY_MARKERS) assert.equal(html.includes(marker), false, marker);
});

test("legacy login shell markers cannot remain in either runtime entrypoint", async () => {
  const paths = [
    "./src/admin-login-hero-worker.js",
    "./src/admin-login-page.js",
    "./src/index.js",
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  );

  for (const marker of LEGACY_MARKERS) {
    for (let index = 0; index < sources.length; index += 1) {
      assert.equal(sources[index].includes(marker), false, `${paths[index]} contains ${marker}`);
    }
  }
});
