import fs from "node:fs";

const path = "immigrate-worker/test/renewal-expiry-resolver-v5-contract.test.mjs";
let source = fs.readFileSync(path, "utf8");
source = source
  .replace('assert.match(source, /resolveMemberEntitlements\\(matched\\)/);', 'assert.ok(source.includes("resolveMemberEntitlements(matched)"));')
  .replace('assert.match(types, /AIRTABLE_TABLE_MEMBER_ENTITLEMENTS\\?: string/);', 'assert.ok(types.includes("AIRTABLE_TABLE_MEMBER_ENTITLEMENTS?: string"));')
  .replace('assert.match(types, /AIRTABLE_TABLE_MEMBERS\\?: string/);', 'assert.ok(types.includes("AIRTABLE_TABLE_MEMBERS?: string"));')
  .replace('assert.match(wrangler, /AIRTABLE_TABLE_MEMBER_ENTITLEMENTS = "MMD — Member Entitlements"/);', 'assert.ok(wrangler.includes(\'AIRTABLE_TABLE_MEMBER_ENTITLEMENTS = "MMD — Member Entitlements"\'));')
  .replace('assert.match(wrangler, /AIRTABLE_TABLE_MEMBERS = "Members"/);', 'assert.ok(wrangler.includes(\'AIRTABLE_TABLE_MEMBERS = "Members"\'));');
fs.writeFileSync(path, source);
console.log("Hardened V5 contract assertions");
