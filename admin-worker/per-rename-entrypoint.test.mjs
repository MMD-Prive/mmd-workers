import assert from "node:assert/strict";
import fs from "node:fs";

const wrangler = fs.readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const activeWorker = fs.readFileSync(new URL("./src/admin-login-hero-worker.js", import.meta.url), "utf8");
const coreWorker = fs.readFileSync(new URL("./src/admin-login-hero-core.js", import.meta.url), "utf8");
const legacyWrapper = fs.readFileSync(new URL("./src/admin-live-marker-wrapper.js", import.meta.url), "utf8");

assert.match(
  wrangler,
  /^main\s*=\s*"src\/admin-login-hero-worker\.js"/m,
  "wrangler must deploy the active admin-login-hero-worker.js entrypoint",
);

for (const path of [
  "/v1/admin/clients/lineage-lookup",
  "/v1/admin/clients/recent",
]) {
  assert.ok(wrangler.includes(path), `wrangler must bind ${path}`);
}

assert.ok(
  activeWorker.includes("enrichLineageWithPerRename"),
  "active worker must run Per Rename enrichment",
);
assert.ok(
  activeWorker.includes("./admin-login-hero-core.js"),
  "active worker must delegate to the preserved core implementation",
);
assert.ok(
  coreWorker.includes("job-orchestrator-owner-ops-wrapper.js"),
  "core worker must preserve the existing admin implementation",
);
assert.ok(
  legacyWrapper.includes('export { default } from "./admin-login-hero-worker.js"'),
  "legacy wrapper must delegate to the active entrypoint without a second enrichment layer",
);

console.log("Per Rename active entrypoint smoke passed.");
