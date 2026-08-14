import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const section = (toml, name) => {
  const marker = `[${name}]`;
  const start = toml.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker}`);
  return toml.slice(start);
};

const [memberPages, frontGate, fixtures] = await Promise.all([
  read("member-pages-worker/wrangler.toml"),
  read("member-dashboard-chat-worker/wrangler.toml"),
  read("care-back-staging-fixtures-worker/wrangler.toml"),
]);

const memberStaging = section(memberPages, "env.staging");
assert.match(memberStaging, /name\s*=\s*"member-pages-worker-staging"/);
assert.match(memberStaging, /CARE_BACK_STAGING_MODE\s*=\s*"synthetic"/);
assert.match(memberStaging, /AIRTABLE_BASE_ID\s*=\s*"appsV1ILPRfIjkaYg"/);
assert.match(memberStaging, /AIRTABLE_TABLE_CARE_BACK_BIRTHDAY_WISHES\s*=\s*"tblvMJjYXy29mgDLb"/);
assert.equal((memberStaging.match(/service\s*=\s*"care-back-staging-fixtures-worker-staging"/g) || []).length, 2);
assert.doesNotMatch(memberStaging, /\[\[env\.staging\.routes\]\]/);

const frontStaging = section(frontGate, "env.staging");
assert.match(frontStaging, /name\s*=\s*"member-dashboard-chat-worker-staging"/);
assert.match(frontStaging, /service\s*=\s*"member-pages-worker-staging"/);
assert.match(frontStaging, /workers_dev\s*=\s*true/);
assert.doesNotMatch(frontStaging, /\[\[env\.staging\.routes\]\]/);

const fixtureStaging = section(fixtures, "env.staging");
assert.match(fixtureStaging, /name\s*=\s*"care-back-staging-fixtures-worker-staging"/);
assert.match(fixtureStaging, /workers_dev\s*=\s*false/);

console.log("CARE BACK staging config is isolated from production routes.");
