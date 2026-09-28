import assert from "node:assert/strict";
import test from "node:test";

import { parsePerRenameDateSuffix } from "./src/per-rename-date-suffix.js";

test("parses Thai month suffix and Buddhist short year", () => {
  const parsed = parsePerRenameDateSuffix("ก้อง 12 กย 68");
  assert.equal(parsed.matched, true);
  assert.equal(parsed.base_name, "ก้อง");
  assert.equal(parsed.date_label, "12 กย 68");
  assert.equal(parsed.date_iso, "2025-09-12");
});

test("parses numeric suffix with Gregorian short year", () => {
  const parsed = parsePerRenameDateSuffix("BOSS 28/09/26");
  assert.equal(parsed.matched, true);
  assert.equal(parsed.base_name, "BOSS");
  assert.equal(parsed.date_iso, "2026-09-28");
});

test("parses Buddhist four-digit year and Thai digits", () => {
  const parsed = parsePerRenameDateSuffix("คุณเอ ๒๘ ก.ย. ๒๕๖๙");
  assert.equal(parsed.matched, true);
  assert.equal(parsed.base_name, "คุณเอ");
  assert.equal(parsed.date_iso, "2026-09-28");
});

test("does not treat non-date suffix as a date", () => {
  const parsed = parsePerRenameDateSuffix("ก้อง - SVIP -");
  assert.equal(parsed.matched, false);
  assert.equal(parsed.base_name, "ก้อง - SVIP -");
  assert.equal(parsed.date_iso, "");
});

test("rejects impossible dates", () => {
  const parsed = parsePerRenameDateSuffix("BOSS 31/02/26");
  assert.equal(parsed.matched, false);
  assert.equal(parsed.date_iso, "");
});
