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

test("lookup with no canonical match signals manual Public fallback without returning a customer", async () => {
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
    assert.equal(body.no_canonical_match, true);
    assert.equal(body.count, 0);
    for (const key of ["records", "results", "items"]) {
      assert.deepEqual(body[key], [], key);
    }
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
