import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexSource = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const phase1Source = readFileSync(new URL("./points-phase1.js", import.meta.url), "utf8");
const mergedConfig = readFileSync(new URL("./wrangler.merged.toml", import.meta.url), "utf8");
const compatibilityConfig = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");

test("canonical Points Ledger table id is locked in every active payments config", () => {
  for (const source of [mergedConfig, compatibilityConfig]) {
    assert.match(source, /AIRTABLE_TABLE_POINTS_LEDGER\s*=\s*"tbl5dfnwjUFMLbnWL"/);
    assert.doesNotMatch(source, /AIRTABLE_TABLE_POINTS_LEDGER\s*=\s*"points_ledger"/);
  }
  assert.match(phase1Source, /AIRTABLE_TABLE_POINTS_LEDGER\s*\|\|\s*"tbl5dfnwjUFMLbnWL"/);
});

test("legacy post-commit points hook cannot touch Airtable", () => {
  const start = indexSource.indexOf("async function awardPointsIfEligible");
  const end = indexSource.indexOf("/* -------------------------------------------------- */\n/* handlers */", start);
  assert.ok(start >= 0 && end > start);
  const fn = indexSource.slice(start, end);
  assert.match(fn, /legacy_points_writer_retired/);
  assert.match(fn, /canonical_writer:\s*"points_phase1"/);
  assert.doesNotMatch(fn, /findPointLedgerByPaymentRef|airtableCreate|airtablePatch|airtableFetch/);
});
