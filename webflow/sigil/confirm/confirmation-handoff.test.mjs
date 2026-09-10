import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./confirmation-handoff.js", import.meta.url), "utf8");

test("confirmation handoff uses canonical customer and model destinations", () => {
  assert.match(source, /CUSTOMER_CONFIRM_PATH = "\/sigil\/confirm\/job-confirmation"/);
  assert.match(source, /MODEL_CONFIRM_PATH = "\/sigil\/confirm\/job-model"/);
  assert.match(source, /MY_MMD_PATH = "\/my-mmd\/"/);
  assert.match(source, /MODEL_DASHBOARD_PATH = "\/sigil\/model\/dashboard"/);
});

test("confirmation handoff does not route to legacy destinations", () => {
  assert.doesNotMatch(source, /href\s*=\s*["']\/model\/dashboard/);
  assert.doesNotMatch(source, /href\s*=\s*["']\/member\/my-mmd/);
  assert.doesNotMatch(source, /location\.(?:assign|replace)\(/);
});
