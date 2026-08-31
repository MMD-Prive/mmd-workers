import fs from "node:fs";

const path = "auth-worker/test/member-profile-resolver.test.mjs";
let text = fs.readFileSync(path, "utf8");
const from = `function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
    AIRTABLE_TABLE_PAYMENTS: "Payments",
    AIRTABLE_TABLE_POINTS_LEDGER: "MMD — Points Ledger",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_id",
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
  };
}`;
const to = `function env(overrides = {}) {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
    AIRTABLE_TABLE_PAYMENTS: "Payments",
    AIRTABLE_TABLE_POINTS_LEDGER: "MMD — Points Ledger",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_id",
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
    ...overrides,
  };
}`;
if (!text.includes(from)) throw new Error("member profile test env helper anchor missing");
fs.writeFileSync(path, text.replace(from, to));
