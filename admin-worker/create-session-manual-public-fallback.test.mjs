import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH,
  CREATE_SESSION_CLIENT_RECENT_PATH,
  handleCreateSessionClientLineageRequest,
} from "./src/create-session-client-lineage-runtime.js";

const env = {
  AIRTABLE_API_KEY: "airtable-test",
  AIRTABLE_BASE_ID: "base-test",
  AIRTABLE_TABLE_CLIENTS_ID: "clients",
  AIRTABLE_TABLE_MEMBERS_ID: "members",
  AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID: "entitlements",
  AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING_ID: "staging",
  INTERNAL_TOKEN: "internal-test",
};

function request(path, init = {}) {
  return new Request(`https://admin-worker.internal${path}`, {
    ...init,
    headers: {
      Authorization: "Bearer internal-test",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function installEmptyAirtable() {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ records: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  return () => {
    globalThis.fetch = original;
  };
}

test("lookup with no canonical match returns one manual public-only client", async () => {
  const restore = installEmptyAirtable();
  try {
    const response = await handleCreateSessionClientLineageRequest(
      request(CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH, {
        method: "POST",
        body: JSON.stringify({ query: "หนุ่ย" }),
      }),
      env,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.manual_fallback, true);
    assert.equal(body.count, 1);
    assert.equal(body.records.length, 1);

    const record = body.records[0];
    assert.equal(record.client_name, "หนุ่ย");
    assert.equal(record.remembered_name, "หนุ่ย");
    assert.equal(record.matched_on, "manual_name_pending_reconcile");
    assert.equal(record.membership_status, "guest_public_only");
    assert.equal(record.manual_public_only, true);
    assert.equal(record.identity_status, "pending_reconcile");
    assert.equal(record.entitlement_snapshot_source, "none");
    assert.match(body.lineage_warnings.join(" "), /manual_public_only_pending_reconcile/);
  } finally {
    restore();
  }
});

test("recent endpoint never creates a manual fallback", async () => {
  const restore = installEmptyAirtable();
  try {
    const response = await handleCreateSessionClientLineageRequest(
      request(CREATE_SESSION_CLIENT_RECENT_PATH, { method: "GET" }),
      env,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.manual_fallback, false);
    assert.equal(body.count, 0);
    assert.deepEqual(body.records, []);
  } finally {
    restore();
  }
});
