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
  assert.match(source, /asset_ids/);
  assert.match(source, /published:false|published\s*:\s*false|ledger-only|ledger_only/i);
  assert.doesNotMatch(source, /r2\/upload|webflow.*publish/i);
});

test("Studio Webflow bridge does not expose browser credential storage or raw LINE identity", async () => {
  const source = await readFile(new URL("studio-production-bridge.js", SOURCE_DIR), "utf8");

  assert.doesNotMatch(source, /localStorage\.setItem|sessionStorage\.setItem/);
  assert.doesNotMatch(source, /Authorization|X-Confirm-Key|X-Internal-Token/);
  assert.doesNotMatch(source, /r2_required_keys|r2_key|storage_key|bucket_name|public_url|presigned/i);
  assert.doesNotMatch(source, /searchParams\.get\(["']t["']\)|[?&]t=/);
  assert.match(source, /line_user_id/);
  assert.match(source, /SECRET_QUERY/);
  assert.match(source, /purgeStoredPhotos/);
  assert.match(source, /data:image/);
  assert.doesNotMatch(source, /readAsDataURL|data:image\/[^/]+;base64|sessionStorage\.setItem|localStorage\.setItem/);
  assert.doesNotMatch(source, /document\.querySelectorAll\(["']form["']\)|document\.querySelectorAll\(["']input/);
});

test("Studio Webflow embed snippets are paste-ready, noindex where internal, and page-scoped", async () => {
  for (const [file, page] of [
    ["studio-page-embed.html", "studio"],
    ["upload-page-embed.html", "upload"],
    ["review-page-embed.html", "review"],
    ["model-preview-page-embed.html", "model-preview"],
  ]) {
    const html = await readFile(new URL(file, SOURCE_DIR), "utf8");
    if (page !== "studio") assert.match(html, /noindex,nofollow/, file);
    assert.match(html, new RegExp(`data-mmd-studio-page="${page}"`), file);
    assert.doesNotMatch(html, /Paste the contents|placeholder/i, file);
    assert.match(html, /\/v1\/admin\/auth\/me/, file);
    assert.match(html, /\/studio\/api\/upload/, file);
    assert.match(html, /COMMIT_LEDGER_ONLY/, file);
    assert.doesNotMatch(html, /r2_required_keys|r2_key|storage_key|bucket_name|public_url|presigned/i, file);
  }
});
