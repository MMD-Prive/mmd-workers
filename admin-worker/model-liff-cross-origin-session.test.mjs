import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL(".", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Lovable Model Hub is the only cross-site session origin", async () => {
  const wrangler = await source("wrangler.toml");
  assert.match(wrangler, /MODEL_DASHBOARD_ORIGIN = "https:\/\/mmdmodel\.lovable\.app"/);
  assert.match(wrangler, /ALLOWED_ORIGINS = ".*https:\/\/mmdmodel\.lovable\.app"/);
});

test("canonical model LIFF entrypoint delegates through the owner-review worker", async () => {
  const text = await source("src/model-liff-worker.js");
  assert.match(text, /import worker from "\.\/model-liff-manual-review-worker\.js"/);
  assert.match(text, /export \* from "\.\/model-liff-manual-review-worker\.js"/);
  assert.match(text, /export default worker/);
});

test("owner-review worker preserves the existing session implementation", async () => {
  const text = await source("src/model-liff-manual-review-worker.js");
  assert.match(text, /from "\.\/model-liff-worker-pre-manual-review\.js"/);
  assert.match(text, /return legacyWorker\.fetch\(delegated, env, ctx\)/);
});

for (const file of [
  "src/model-liff-worker-pre-manual-review.js",
  "src/model-liff-worker-legacy.js",
]) {
  test(`${file} uses a partitioned cookie only for the configured dashboard origin`, async () => {
    const text = await source(file);
    assert.match(text, /function usesPartitionedDashboardCookie\(request, env\)/);
    assert.match(text, /origin !== dashboardOrigin/);
    assert.match(text, /origin !== new URL\(request\.url\)\.origin/);
    assert.match(text, /\? "None; Partitioned" : "Lax"/);
    assert.match(text, /SameSite=\$\{sameSite\}/);
  });
}
