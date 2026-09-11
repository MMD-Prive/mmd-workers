import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../src/lib/airtable.ts", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
const wrangler = fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

test("v5 uses the canonical resolver before readback fallbacks", () => {
  const explicit = source.indexOf("toStr(input.expire_at) ||");
  const resolver = source.indexOf("resolverExpireAt ||");
  const member = source.indexOf("canonicalMemberExpireAt ||");
  const session = source.indexOf("toStr(latestSession?.expire_at) ||");
  assert.ok(explicit >= 0 && resolver > explicit && member > resolver && session > member);
  assert.ok(source.includes("resolveMemberEntitlements(matched)"));
  assert.match(source, /snapshot.fail_closed !== true/);
});

test("v5 profile readback is stable-identity only and expiry-only", () => {
  const block = source.slice(source.indexOf("async function readVerifiedCanonicalMemberExpiry"), source.indexOf("function headers"));
  assert.doesNotMatch(block, /display_name|email/i);
  assert.match(block, /line_user_id/);
  assert.match(block, /member_id/);
  assert.doesNotMatch(block, /memberstack/i);
  assert.doesNotMatch(block, /current_tier|membership_status|access_status|points/i);
});

test("v5 declares canonical Airtable sources", () => {
  assert.ok(types.includes("AIRTABLE_TABLE_MEMBER_ENTITLEMENTS?: string"));
  assert.ok(types.includes("AIRTABLE_TABLE_MEMBERS?: string"));
  assert.ok(wrangler.includes('AIRTABLE_TABLE_MEMBER_ENTITLEMENTS = "MMD — Member Entitlements"'));
  assert.ok(wrangler.includes('AIRTABLE_TABLE_MEMBERS = "Members"'));
});
