import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const configs = [
  "payments-worker/wrangler.merged.toml",
  "member-pages-worker/wrangler.toml",
  "mms-worker/wrangler.jsonc",
  "himai-chat-worker/wrangler.toml",
  "partners-worker/wrangler.toml",
  "sigil-booking-worker/wrangler.toml",
];

const healthSources = [
  "payments-worker/index.review-wrapper.js",
  "member-pages-worker/src/runtime-index.js",
  "mms-worker/src/runtime-index-with-dispatch.js",
  "himai-chat-worker/src/entry.js",
  "partners-worker/src/index.ts",
  "sigil-booking-worker/src/index.js",
];

for (const path of configs) {
  test(`Phase 0 PostHog runtime token wired: ${path}`, async () => {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /POSTHOG_PROJECT_TOKEN/);
  });
}

for (const path of healthSources) {
  test(`Phase 0 analytics health exposed: ${path}`, async () => {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /authorityRuntimeHealth/);
  });
}

test("MMS core runtime receives ExecutionContext for fail-open analytics", async () => {
  const source = await readFile(new URL("mms-worker/src/index.js", root), "utf8");
  assert.match(source, /async fetch\(request, env, ctx\)/);
  assert.match(source, /handlePrebooking\(request, env, cors, requestId, ctx\)/);
});
