import test from "node:test";
import assert from "node:assert/strict";
import { readKenjiPrivateSignupCatalog } from "../src/kenji-private-interest.js";
import { handleKenjiLineMemberTruth } from "../src/kenji-line-member-truth.js";
const uid = `U${"b".repeat(32)}`;
const rows = () => [
  { fields: { code: "standard", tier: "standard", price: 1199, duration_days: 365, is_active: true } },
  { fields: { code: "premium", tier: "premium", price: 2999, duration_days: 730, is_active: true } },
];
function fixture(records = rows()) {
  const reads = [];
  return { reads, env: { AIRTABLE_API_KEY: "fixture", AIRTABLE_BASE_ID: "fixture-base", MEMBER_STATUS_RESOLVER: { fetch() { throw new Error("must not invoke identity recovery"); } }, AIRTABLE_HTTP: { fetch: async request => {
    assert.equal(request.method, "GET"); const url = new URL(request.url); reads.push(url);
    if (url.pathname.endsWith("tblg2z8dENx75yHka")) return Response.json({ records });
    assert.match(url.searchParams.get("filterByFormula"), new RegExp(uid)); return Response.json({ records: [] });
  } } } };
}
test("signup catalog reads active Private prices, not renewal amounts or Public rates", async () => {
  const f = fixture(); const result = await readKenjiPrivateSignupCatalog(f.env);
  assert.equal(result.status, "verified"); assert.deepEqual(result.packages.map(row => row.price_thb), [1199, 2999]);
  assert.deepEqual(result.packages.map(row => row.base_years), [1, 2]);
  assert.equal(result.new_member_policy.welcome_points, 66); assert.equal(result.new_member_policy.eligibility_requires_review, true);
  assert.doesNotMatch(f.reads[0].searchParams.get("filterByFormula"), /public|elite|red_card/);
  assert.equal(f.reads[0].searchParams.getAll("fields[]").includes("renew_price"), false);
});
test("current catalog price is read each time rather than invented from a client amount", async () => {
  const records = rows(); records[0].fields.price = 1299;
  assert.equal((await readKenjiPrivateSignupCatalog(fixture(records).env)).packages[0].price_thb, 1299);
});
for (const change of [records => records.pop(), records => records.push(records[0]), records => records[0].fields.is_active = false, records => records[1].fields.duration_days = 1095, records => records[0].fields.price = "1199", records => records[0].fields.tier = "public_member"]) test("invalid or ambiguous catalog remains unavailable", async () => {
  const records = rows(); change(records); const result = await readKenjiPrivateSignupCatalog(fixture(records).env);
  assert.equal(result.status, "unavailable"); assert.deepEqual(result.packages, []);
});
function request(host = "member-pages-worker.internal") {
  return new Request(`https://${host}/__internal/kenji/member-truth`, { method: "POST", headers: { "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" }, body: JSON.stringify({ line_user_id: uid, intent: "private_interest" }) });
}
test("no entitlement match stays unknown with general catalog, never confirmed nonmember", async () => {
  const f = fixture(); const response = await handleKenjiLineMemberTruth(request(), f.env); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.identity_status, "unresolved"); assert.equal(result.private_signup_catalog.status, "verified");
  assert.equal(result.member_exists, undefined); assert.equal(f.reads.length, 4);
});
test("unauthorized host cannot query customer or catalog", async () => {
  const f = fixture(); assert.equal((await handleKenjiLineMemberTruth(request("mmdbkk.com"), f.env)).status, 404); assert.equal(f.reads.length, 0);
});
