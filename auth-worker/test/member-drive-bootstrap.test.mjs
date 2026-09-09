import test from "node:test";
import assert from "node:assert/strict";

import runtime, { packageAccessLayers } from "../src/runtime-index.js";

const SECRET = "0123456789abcdef0123456789abcdef";
const LINE_ID = "U5107dbdc87dbdd985ef5516b7f208fc3";

test("Premium materializes both Standard and Premium entitlements", async () => {
  const writes = [];
  const env = fakeEnv({ writes });
  const response = await runtime.fetch(bootstrapRequest({
    package_code: "premium",
    drive_folder_id: "premium-folder-id",
    access_layers: ["standard", "premium"],
  }), env, {});
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.access_layers, ["standard", "premium"]);

  const entitlements = writes
    .filter((write) => write.table === "MMD — Member Entitlements" && write.method === "POST")
    .flatMap((write) => write.body.records.map((record) => record.fields.package_code));
  assert.deepEqual(entitlements.sort(), ["premium", "standard"]);
});

test("Standard revokes an active Premium entitlement and grants Standard only", async () => {
  const writes = [];
  const env = fakeEnv({
    writes,
    entitlements: [{
      id: "recPremium",
      fields: {
        member_email: "member@example.com",
        line_user_id: LINE_ID,
        package_code: "premium",
        access_status: "active",
      },
    }],
  });
  const response = await runtime.fetch(bootstrapRequest({
    package_code: "standard",
    drive_folder_id: "standard-folder-id",
    access_layers: ["standard"],
  }), env, {});
  assert.equal(response.status, 200);

  const revoke = writes.find((write) => (
    write.table === "MMD — Member Entitlements"
    && write.method === "PATCH"
    && write.body.records?.[0]?.id === "recPremium"
  ));
  assert.equal(revoke.body.records[0].fields.access_status, "revoked");

  const createdLayers = writes
    .filter((write) => write.table === "MMD — Member Entitlements" && write.method === "POST")
    .flatMap((write) => write.body.records.map((record) => record.fields.package_code));
  assert.deepEqual(createdLayers, ["standard"]);
});

test("trusted identity resolves a unique Client email when LINE email claim is absent", async () => {
  const response = await runtime.fetch(identityRequest(), fakeEnv({
    identityMembers: [],
    clients: [{ id: "recClient", fields: { line_user_id: LINE_ID, "Contact Email": "Member@Example.com" } }],
    entitlements: [],
  }), {});
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, data: { resolved: true, email: "member@example.com" } });
});

test("trusted identity accepts corroborating Client and Entitlement emails", async () => {
  const response = await runtime.fetch(identityRequest(), fakeEnv({
    identityMembers: [],
    clients: [{ id: "recClient", fields: { line_user_id: LINE_ID, email: "member@example.com" } }],
    entitlements: [
      { id: "recEntStandard", fields: { line_user_id: LINE_ID, member_email: "MEMBER@example.com" } },
      { id: "recEntPremium", fields: { line_user_id: LINE_ID, member_email: "member@example.com" } },
    ],
  }), {});
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.data.resolved, true);
  assert.equal(payload.data.email, "member@example.com");
});

test("trusted identity resolves a committed exact LINE staging link through canonical Client", async () => {
  const response = await runtime.fetch(identityRequest(), fakeEnv({
    identityMembers: [],
    clients: [],
    entitlements: [],
    lineStaging: [{
      id: "recStageOne",
      fields: {
        line_user_id: LINE_ID,
        match_type: "line_user_id_exact",
        decision: "link_existing_client",
        review_status: "committed",
        matched_client: ["recABCDEF1234567"],
      },
    }],
    linkedClients: [{
      id: "recABCDEF1234567",
      fields: { "Contact Email": "Member@Example.com" },
    }],
  }), {});
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, data: { resolved: true, email: "member@example.com" } });
});

test("trusted identity ignores staging links that are not committed exact matches", async () => {
  const response = await runtime.fetch(identityRequest(), fakeEnv({
    identityMembers: [],
    clients: [],
    entitlements: [],
    lineStaging: [{
      id: "recStageReview",
      fields: {
        line_user_id: LINE_ID,
        match_type: "line_user_id_exact",
        decision: "link_existing_client",
        review_status: "review_required",
        matched_client: ["recABCDEF1234567"],
      },
    }, {
      id: "recStageDryRun",
      fields: {
        line_user_id: LINE_ID,
        match_type: "line_user_id_exact",
        decision: "link_existing_client",
        review_status: "committed",
        dry_run_only: true,
        matched_client: ["recABCDEF1234567"],
      },
    }],
    linkedClients: [{
      id: "recABCDEF1234567",
      fields: { "Contact Email": "member@example.com" },
    }],
  }), {});
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, data: { resolved: false } });
});

test("trusted identity fails closed when committed LINE staging links disagree", async () => {
  const response = await runtime.fetch(identityRequest(), fakeEnv({
    identityMembers: [],
    clients: [],
    entitlements: [],
    lineStaging: [{
      id: "recStageOne",
      fields: {
        line_user_id: LINE_ID,
        match_type: "line_user_id_exact",
        decision: "link_existing_client",
        review_status: "committed",
        matched_client: ["recABCDEF1234567"],
      },
    }, {
      id: "recStageTwo",
      fields: {
        line_user_id: LINE_ID,
        match_type: "line_user_id_exact",
        decision: "link_existing_client",
        review_status: "committed",
        matched_client: ["recZYXWVU7654321"],
      },
    }],
  }), {});
  const payload = await response.json();
  assert.equal(response.status, 409);
  assert.equal(payload.error.code, "DRIVE_IDENTITY_AMBIGUOUS");
});

test("trusted identity fails closed when canonical sources disagree", async () => {
  const response = await runtime.fetch(identityRequest(), fakeEnv({
    identityMembers: [{ id: "recMember", fields: { line_id: LINE_ID, "Contact Email": "member@example.com" } }],
    clients: [{ id: "recClient", fields: { line_user_id: LINE_ID, "Contact Email": "other@example.com" } }],
    entitlements: [],
  }), {});
  const payload = await response.json();
  assert.equal(response.status, 409);
  assert.equal(payload.error.code, "DRIVE_IDENTITY_AMBIGUOUS");
});

test("trusted identity returns unresolved when no trusted source has email", async () => {
  const response = await runtime.fetch(identityRequest(), fakeEnv({
    identityMembers: [],
    clients: [],
    entitlements: [],
  }), {});
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, data: { resolved: false } });
});

test("bootstrap reuses the canonical Member matched by LINE before creating a new Member", async () => {
  const writes = [];
  const response = await runtime.fetch(bootstrapRequest(), fakeEnv({
    writes,
    bootstrapEmailMembers: [],
    bootstrapLineMembers: [{
      id: "recExistingMember",
      fields: { line_id: LINE_ID, "Full Name": "Existing Member" },
    }],
  }), {});
  assert.equal(response.status, 200);

  const memberCreates = writes.filter((write) => write.table === "Members" && write.method === "POST");
  assert.equal(memberCreates.length, 0);
  const memberPatch = writes.find((write) => write.table === "Members" && write.method === "PATCH");
  assert.equal(memberPatch.body.records[0].id, "recExistingMember");
  assert.equal(memberPatch.body.records[0].fields.line_id, LINE_ID);
  assert.equal(memberPatch.body.records[0].fields["Contact Email"], "member@example.com");
});

test("bootstrap fails closed when email and LINE resolve to different Members", async () => {
  const response = await runtime.fetch(bootstrapRequest(), fakeEnv({
    bootstrapEmailMembers: [{
      id: "recEmailMember",
      fields: { "Contact Email": "member@example.com" },
    }],
    bootstrapLineMembers: [{
      id: "recLineMember",
      fields: { line_id: LINE_ID },
    }],
  }), {});
  const payload = await response.json();
  assert.equal(response.status, 409);
  assert.equal(payload.error.code, "MEMBER_IDENTITY_CONFLICT");
});

test("trusted identity rejects a browser-like call without the internal resolver secret", async () => {
  const request = new Request("https://mmd-auth-worker.internal/__internal/member-drive/identity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose: "liff_drive_identity_resolution", line_user_id: LINE_ID }),
  });
  const response = await runtime.fetch(request, fakeEnv({}), {});
  assert.equal(response.status, 404);
});

test("bootstrap rejects a browser-like call without the internal resolver secret", async () => {
  const request = new Request("https://mmd-auth-worker.internal/__internal/member-drive/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const response = await runtime.fetch(request, fakeEnv({}), {});
  assert.equal(response.status, 404);
});

test("server rejects a forged Premium hierarchy", async () => {
  const response = await runtime.fetch(bootstrapRequest({
    package_code: "premium",
    drive_folder_id: "premium-folder-id",
    access_layers: ["premium"],
  }), fakeEnv({}), {});
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "INVALID_ACCESS_HIERARCHY");
});

test("canonical hierarchy helper is fail closed", () => {
  assert.deepEqual(packageAccessLayers("premium"), ["standard", "premium"]);
  assert.deepEqual(packageAccessLayers("standard"), ["standard"]);
  assert.deepEqual(packageAccessLayers("vip"), []);
});

function bootstrapRequest(overrides = {}) {
  return new Request("https://mmd-auth-worker.internal/__internal/member-drive/bootstrap", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-member-resolver-secret": SECRET,
    },
    body: JSON.stringify({
      purpose: "liff_drive_member_bootstrap",
      line_user_id: LINE_ID,
      email: "member@example.com",
      display_name: "Member Test",
      package_code: "standard",
      drive_folder_id: "standard-folder-id",
      access_layers: ["standard"],
      ...overrides,
    }),
  });
}

function identityRequest(overrides = {}) {
  return new Request("https://mmd-auth-worker.internal/__internal/member-drive/identity", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-member-resolver-secret": SECRET,
    },
    body: JSON.stringify({
      purpose: "liff_drive_identity_resolution",
      line_user_id: LINE_ID,
      ...overrides,
    }),
  });
}

function fakeEnv({
  writes = [],
  entitlements = [],
  identityMembers,
  clients = [],
  lineStaging = [],
  linkedClients = [],
  bootstrapEmailMembers,
  bootstrapLineMembers,
} = {}) {
  let memberCreated = false;
  return {
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_API_KEY: "patTest",
    AIRTABLE_MEMBERS_EMAIL_FIELD: "Contact Email",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_id",
    AIRTABLE_CLIENTS_LINE_USER_ID_FIELD: "line_user_id",
    AIRTABLE_CLIENTS_EMAIL_FIELDS: "Contact Email,email",
    AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD: "line_user_id",
    AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD: "member_email",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").pop());
        const method = request.method;
        const body = method === "GET" ? null : await request.json();
        if (body) writes.push({ table, method, body });

        if (method === "GET" && table === "Members") {
          const formula = String(url.searchParams.get("filterByFormula") || "");
          if (formula.includes("LOWER(")) {
            if (bootstrapEmailMembers !== undefined) return json({ records: bootstrapEmailMembers });
            return json({ records: memberCreated ? [{ id: "recMember", fields: { "Contact Email": "member@example.com", line_id: LINE_ID } }] : [] });
          }
          if (bootstrapLineMembers !== undefined) return json({ records: bootstrapLineMembers });
          if (identityMembers !== undefined) return json({ records: identityMembers });
          return json({ records: memberCreated ? [{ id: "recMember", fields: { "Contact Email": "member@example.com", line_id: LINE_ID } }] : [] });
        }
        if (method === "GET" && table === "Clients") {
          const formula = String(url.searchParams.get("filterByFormula") || "");
          return json({ records: formula.includes("RECORD_ID()") ? linkedClients : clients });
        }
        if (method === "GET" && table === "LINE OFC Client Import Staging") return json({ records: lineStaging });
        if (method === "POST" && table === "Members") {
          memberCreated = true;
          return json({ records: [{ id: "recMember", fields: body.records[0].fields }] });
        }
        if (method === "PATCH" && table === "Members") return json({ records: body.records });
        if (method === "GET" && table === "member_packages") return json({ records: [] });
        if (method === "POST" && table === "member_packages") return json({ records: [{ id: "recPackage", fields: body.records[0].fields }] });
        if (method === "GET" && table === "MMD — Member Entitlements") return json({ records: entitlements });
        if (method === "PATCH" && table === "MMD — Member Entitlements") return json({ records: body.records });
        if (method === "POST" && table === "MMD — Member Entitlements") return json({ records: [{ id: `recEnt${writes.length}`, fields: body.records[0].fields }] });
        return json({ error: "unexpected" }, 500);
      },
    },
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
