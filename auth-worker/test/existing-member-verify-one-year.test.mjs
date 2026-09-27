import test from "node:test";
import assert from "node:assert/strict";
import {
  EXISTING_MEMBER_VERIFY_CAMPAIGN,
  EXISTING_MEMBER_VERIFY_EXTENSION_PATH,
  EXISTING_MEMBER_VERIFY_PURPOSE,
  handleExistingMemberVerifyOneYear,
} from "../src/existing-member-verify-one-year.js";

const realFetch = globalThis.fetch;
const SECRET = "resolver-secret-for-existing-member-verify-123456789";
const LINE = "U" + "a".repeat(32);

function env(overrides = {}) {
  return {
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
    AIRTABLE_API_KEY: "airtable-test",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_id",
    AIRTABLE_MEMBERS_EMAIL_FIELD: "Contact Email",
    ...overrides,
  };
}

function request(body, secret = SECRET) {
  return new Request("https://mmd-auth-worker.internal" + EXISTING_MEMBER_VERIFY_EXTENSION_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-member-resolver-secret": secret,
    },
    body: JSON.stringify(body),
  });
}

function tableFrom(input) {
  const parts = new URL(typeof input === "string" ? input : input.url).pathname.split("/");
  return decodeURIComponent(parts.at(-1));
}

test.afterEach(() => { globalThis.fetch = realFetch; });

test("internal owner rejects requests without the resolver secret", async () => {
  const response = await handleExistingMemberVerifyOneYear(
    request({ line_user_id: LINE, purpose: EXISTING_MEMBER_VERIFY_PURPOSE }, "wrong"),
    env(),
  );
  assert.equal(response.status, 404);
});

test("active Standard member receives one calendar year from real current expiry", async () => {
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const table = tableFrom(input);
    const method = init.method || "GET";
    if (method === "GET") {
      if (table === "Members") return Response.json({ records: [{
        id: "recMember123456",
        fields: { line_id: LINE, member_id: "MMD-STD-1", "Contact Email": "std@example.com" },
      }]});
      if (table === "member_packages") return Response.json({ records: [{
        id: "recPackage12345",
        fields: {
          member_id: "MMD-STD-1",
          member_email: "std@example.com",
          package_code: "standard",
          status: "active",
          start_date: "2026-01-01",
          end_date: "2027-01-31",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      }]});
      if (table === "MMD — Member Entitlements") return Response.json({ records: [] });
    }
    if (method === "POST") {
      const fields = JSON.parse(init.body).fields;
      writes.push({ table, fields });
      return Response.json({ id: table === "member_packages" ? "recVerifyPackage1" : "recVerifyEntitlement", fields });
    }
    throw new Error("unexpected request");
  };

  const response = await handleExistingMemberVerifyOneYear(
    request({ line_user_id: LINE, purpose: EXISTING_MEMBER_VERIFY_PURPOSE }),
    env(),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.eligible, true);
  assert.equal(body.data.extension_years, 1);
  assert.equal(body.data.extension_months, 12);
  assert.equal(body.data.active_through, "2028-01-31");

  const pkg = writes.find((x) => x.table === "member_packages");
  const entitlement = writes.find((x) => x.table === "MMD — Member Entitlements");
  assert.ok(pkg);
  assert.equal(pkg.fields.campaign_code, EXISTING_MEMBER_VERIFY_CAMPAIGN);
  assert.equal(pkg.fields.package_code, "standard");
  assert.equal(pkg.fields.end_date, "2028-01-31");
  assert.equal(pkg.fields.ledger_type, "comped");
  assert.ok(entitlement);
  assert.equal(entitlement.fields.extension_months, 12);
  assert.equal(entitlement.fields.previous_expire_at, "2027-01-31");
  assert.equal(entitlement.fields.new_expire_at.slice(0, 10), "2028-01-31");
  assert.equal(entitlement.fields.capability, "private_standard");
});

test("expired Premium member restarts from Verify date and the write is idempotent", async () => {
  let phase = 0;
  const writes = [];
  let createdPackage = null;
  let createdEntitlement = null;
  globalThis.fetch = async (input, init = {}) => {
    const table = tableFrom(input);
    const method = init.method || "GET";
    if (method === "GET") {
      if (table === "Members") return Response.json({ records: [{
        id: "recMemberPremium1",
        fields: { line_id: LINE, member_id: "MMD-PREM-1", "Contact Email": "prem@example.com" },
      }]});
      if (table === "member_packages") {
        const records = [{
          id: "recOldPremium123",
          fields: {
            member_id: "MMD-PREM-1",
            member_email: "prem@example.com",
            package_code: "premium",
            status: "expired",
            start_date: "2024-01-01",
            end_date: "2025-01-01",
            created_at: "2024-01-01T00:00:00.000Z",
          },
        }];
        if (phase > 0 && createdPackage) records.unshift(createdPackage);
        return Response.json({ records });
      }
      if (table === "MMD — Member Entitlements") {
        return Response.json({ records: phase > 0 && createdEntitlement ? [createdEntitlement] : [] });
      }
    }
    if (method === "POST") {
      const fields = JSON.parse(init.body).fields;
      writes.push({ table, fields });
      if (table === "member_packages") createdPackage = { id: "recVerifyPremium", fields: { ...fields, created_at: "2026-09-28T00:00:00.000Z" } };
      else createdEntitlement = { id: "recVerifyPremiumEnt", fields };
      return Response.json(table === "member_packages" ? createdPackage : createdEntitlement);
    }
    throw new Error("unexpected request");
  };

  const one = await handleExistingMemberVerifyOneYear(
    request({ line_user_id: LINE, purpose: EXISTING_MEMBER_VERIFY_PURPOSE }),
    env(),
  );
  const first = await one.json();
  assert.equal(one.status, 200);
  assert.equal(first.data.eligible, true);
  assert.equal(first.data.package_code, "premium");
  assert.equal(writes.length, 2);

  phase = 1;
  const two = await handleExistingMemberVerifyOneYear(
    request({ line_user_id: LINE, purpose: EXISTING_MEMBER_VERIFY_PURPOSE }),
    env(),
  );
  const second = await two.json();
  assert.equal(two.status, 200);
  assert.equal(second.data.idempotent, true);
  assert.equal(second.data.applied, false);
  assert.equal(second.data.active_through, first.data.active_through);
  assert.equal(writes.length, 2);
});

test("protected or unresolved package tiers are left to their separate entitlement policy", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const table = tableFrom(input);
    if ((init.method || "GET") !== "GET") throw new Error("no write expected");
    if (table === "Members") return Response.json({ records: [{
      id: "recProtected1234",
      fields: { line_id: LINE, member_id: "MMD-VIP-1", "Contact Email": "vip@example.com" },
    }]});
    if (table === "member_packages") return Response.json({ records: [] });
    if (table === "MMD — Member Entitlements") return Response.json({ records: [{
      id: "recVipEntitlement",
      fields: { member_id: "MMD-VIP-1", line_user_id: LINE, capability: "vip", access_status: "active" },
    }]});
    return Response.json({ records: [] });
  };

  const response = await handleExistingMemberVerifyOneYear(
    request({ line_user_id: LINE, purpose: EXISTING_MEMBER_VERIFY_PURPOSE }),
    env(),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.eligible, false);
  assert.equal(body.data.protected_policy_unchanged, true);
});
