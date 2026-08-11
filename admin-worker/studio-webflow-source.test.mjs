import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SOURCE_DIR = new URL("../webflow/internal/admin/studio/", import.meta.url);

test("Studio Webflow bridge calls the approved authenticated API endpoints only", async () => {
  const source = await readFile(new URL("studio-production-bridge.js", SOURCE_DIR), "utf8");

  for (const endpoint of [
    "/v1/admin/auth/me",
    "/studio/api/intake/validate",
    "/studio/api/intake/commit",
    "/studio/api/review/validate",
    "/studio/api/review/commit",
    "/studio/api/model-preview/publish-plan",
    "/studio/api/model-preview/commit",
    "/studio/api/upload",
  ]) {
    assert.ok(source.includes(endpoint), endpoint);
  }

  assert.match(source, /credentials:\s*"include"/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /COMMIT_LEDGER_ONLY/);
  assert.doesNotMatch(source, /r2\/upload|webflow.*publish/i);
});

test("Studio Webflow bridge does not expose browser credential storage or raw LINE identity", async () => {
  const source = await readFile(new URL("studio-production-bridge.js", SOURCE_DIR), "utf8");

  assert.doesNotMatch(source, /localStorage\.setItem|sessionStorage\.setItem/);
  assert.doesNotMatch(source, /Authorization|X-Confirm-Key|X-Internal-Token/);
  assert.doesNotMatch(source, /r2_required_keys|storage_key|bucket_name|public_url/);
  assert.match(source, /line_user_id/);
  assert.match(source, /SECRET_QUERY/);
  assert.match(source, /purgeStoredPhotos/);
  assert.match(source, /data:image/);
});

test("internal Studio Webflow embed snippets are noindex and page-scoped", async () => {
  for (const [file, page] of [
    ["upload-page-embed.html", "upload"],
    ["review-page-embed.html", "review"],
    ["model-preview-page-embed.html", "model-preview"],
  ]) {
    const html = await readFile(new URL(file, SOURCE_DIR), "utf8");
    assert.match(html, /noindex,nofollow/, file);
    assert.match(html, new RegExp(`data-mmd-studio-page="${page}"`), file);
  }
});
