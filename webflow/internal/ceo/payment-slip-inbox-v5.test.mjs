import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./payment-slip-inbox-v5.js", import.meta.url), "utf8");

test("CEO slip inbox requests canonical Payment and Session context", () => {
  assert.match(source, /review-queue\?limit=50&include_context=1/);
  assert.match(source, /item\.client_record_id\s*\|\|/);
});

test("CEO slip inbox exposes recovery state without leaking provider errors", () => {
  assert.match(source, /settlement_recovery/);
  assert.match(source, /friendlyReviewError/);
  assert.match(source, /invalid_permissions_or_model_not_found/);
  assert.doesNotMatch(source, /save\.textContent\s*=\s*`บันทึกไม่สำเร็จ · \$\{String\(error\.message/);
});
