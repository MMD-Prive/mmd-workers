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

test("membership schema typecast is restricted to internal Official Verify and allowlisted packages", () => {
  const guardStart = indexSource.indexOf("export function reviewedMembershipSchemaTypecast");
  const guardEnd = indexSource.indexOf("async function createOrUpdatePaymentIntent", guardStart);
  assert.ok(guardStart >= 0 && guardEnd > guardStart);
  const guard = indexSource.slice(guardStart, guardEnd);
  assert.match(guard, /allow_membership_schema_typecast !== true/);
  assert.match(guard, /payment_stage.*membership/);
  assert.match(guard, /CANONICAL_MEMBERSHIP_PACKAGES/);
  assert.match(indexSource, /"mmd_member", "elite", "red_card", "standard", "premium"/);

  const verifyStart = indexSource.indexOf("async function handleVerify");
  const notifyStart = indexSource.indexOf("async function handleNotify");
  const nextHandler = indexSource.indexOf("async function handle", notifyStart + 10);
  assert.ok(verifyStart >= 0 && notifyStart > verifyStart);
  const publicVerify = indexSource.slice(verifyStart, notifyStart);
  const internalNotify = indexSource.slice(notifyStart, nextHandler > notifyStart ? nextHandler : indexSource.length);
  assert.doesNotMatch(publicVerify, /allow_membership_schema_typecast:\s*true/);
  assert.match(internalNotify, /allow_membership_schema_typecast:\s*true/);
});
