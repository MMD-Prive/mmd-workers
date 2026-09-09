import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import coreWorker from "./src/index.js";

const APPROVED_PAGE_ID = "admin-login-approved-hero";
const LEGACY_MARKERS = [
  "Internal access.",
  "sigil-internal-login",
  "MMD Admin Sign In",
  "Internal Admin Chang Ewvon",
];

test("admin deploy actions use Node24 runtimes without changing the application Node version", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-admin-worker.yml", import.meta.url), "utf8");
  assert.match(workflow, /uses: actions\/checkout@v5/);
  assert.match(workflow, /uses: actions\/setup-node@v5/);
  assert.match(workflow, /node-version: "22"/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/);
  assert.doesNotMatch(workflow, /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/);
});

test("dashboard deploy smoke distinguishes allowed production ingress from a blocked direct host", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-admin-worker.yml", import.meta.url), "utf8");
  assert.match(workflow, /ADMIN_DASHBOARD_PRODUCTION_URL: https:\/\/mmdbkk\.com\/v1\/admin\/dashboard/);
  const smoke = workflow.split("- name: Verify production dashboard route")[1].split("- name: Report deploy stage diagnosis")[0];
  assert.match(smoke, /for origin in https:\/\/mmdbkk\.com https:\/\/www\.mmdbkk\.com; do/);
  assert.match(smoke, /"\$origin\/v1\/admin\/dashboard"\)"\s+test "\$http_code" = "401"\s+grep -q '\"error\":\"unauthorized\"'/);
  assert.match(smoke, /"https:\/\/admin-worker\.malemodel-bkk\.workers\.dev\/v1\/admin\/dashboard"\)"\s+test "\$http_code" = "403"\s+grep -q '\"error\":\"dashboard_host_not_allowed\"'/);
  // A redirect, unexpected 200 or arbitrary 403 is not a passing auth check.
  assert.doesNotMatch(smoke, /continue-on-error|\|\| true|curl[^\n]*--location/);
});

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
  assert.match(html, /MMD SIGIL Internal Admin/);
  assert.doesNotMatch(html, /Internal Admin Chang Ewvon/);
  assert.match(html, /data-mmd-page="admin-login-approved-hero"/);
  assert.match(html, /rel="icon" type="image\/webp"/);
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
