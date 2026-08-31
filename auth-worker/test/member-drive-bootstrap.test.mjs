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

function fakeEnv({ writes = [], entitlements = [] } = {}) {
  let memberCreated = false;
  return {
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_API_KEY: "patTest",
    AIRTABLE_MEMBERS_EMAIL_FIELD: "Contact Email",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_id",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").pop());
        const method = request.method;
        const body = method === "GET" ? null : await request.json();
        if (body) writes.push({ table, method, body });

        if (method === "GET" && table === "Members") {
          return json({ records: memberCreated ? [{ id: "recMember", fields: { "Contact Email": "member@example.com", line_id: LINE_ID } }] : [] });
        }
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
