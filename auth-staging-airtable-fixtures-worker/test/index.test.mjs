import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.mjs";

async function read(table, formula) {
  const url = new URL(`https://api.airtable.com/v0/app_auth_staging_fixture/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", formula);
  const response = await worker.fetch(new Request(url));
  return { response, payload: await response.json() };
}

test("serves bounded current-member Customer 360 source fixtures", async () => {
  const line = "U00000000000000000000000000000001";
  const email = "care-back-current@example.invalid";

  const member = await read("Members", `{line_id}='${line}'`);
  const packages = await read("member_packages", `LOWER({member_email})='${email}'`);
  const points = await read("MMD — Points Ledger", `LOWER({member_email})='${email}'`);
  const sessions = await read("Sessions", `OR({line_user_id}='${line}',LOWER({email})='${email}')`);
  const payments = await read("Payments", `LOWER({Member Email})='${email}'`);

  assert.equal(member.response.status, 200);
  assert.equal(member.payload.records[0].fields.member_id, "MMD-STAGING-CURRENT-01");
  assert.equal(packages.payload.records[0].fields.status, "active");
  assert.equal(points.payload.records[0].fields.points, 25);
  assert.equal(sessions.payload.records[0].fields["Session Status"], "Completed");
  assert.equal(payments.payload.records[0].fields["Verification Status"], "verified");
});

test("serves returning and unknown identities without production data", async () => {
  const returning = await read("Members", "{line_id}='U00000000000000000000000000000002'");
  const unknown = await read("Members", "{line_id}='U00000000000000000000000000000003'");
  const returningPackage = await read("member_packages", "LOWER({member_email})='care-back-returning@example.invalid'");

  assert.equal(returning.payload.records[0].fields.member_id, "MMD-STAGING-RETURNING-01");
  assert.equal(returningPackage.payload.records[0].fields.status, "expired");
  assert.deepEqual(unknown.payload.records, []);
});

test("rejects writes and unknown tables", async () => {
  const write = await worker.fetch(new Request("https://api.airtable.com/v0/app_auth_staging_fixture/Members", { method: "POST" }));
  const missing = await worker.fetch(new Request("https://api.airtable.com/v0/app_auth_staging_fixture/Private", { method: "GET" }));
  assert.equal(write.status, 405);
  assert.equal(missing.status, 404);
});
