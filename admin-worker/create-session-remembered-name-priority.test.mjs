import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH,
  CUSTOMER_LOOKUP_CHAIN,
  CUSTOMER_LOOKUP_PRIORITY,
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

function request(query) {
  return new Request(`https://admin-worker.internal${CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer internal-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
}

function installMock() {
  const original = globalThis.fetch;
  const fixtures = {
    clients: [
      {
        id: "recRemembered",
        createdTime: "2026-01-01T00:00:00.000Z",
        fields: {
          "Client Name": "Canonical N",
          nickname: "Old Nickname",
          line_user_id: "U-REMEMBERED",
          email: "remembered@example.com",
        },
      },
      {
        id: "recCanonicalCollision",
        createdTime: "2026-09-01T00:00:00.000Z",
        fields: {
          "Client Name": "หนุ่ย",
          line_user_id: "U-COLLISION",
          email: "collision@example.com",
        },
      },
    ],
    members: [],
    entitlements: [],
    staging: [
      {
        id: "recStageRemembered",
        createdTime: "2026-08-31T00:00:00.000Z",
        fields: {
          import_id: "stage-remembered",
          line_user_id: "U-REMEMBERED",
          line_display_name: "Nui LINE",
          line_renamed_name: "หนุ่ย",
          normalized_name: "nui legacy",
          matched_client_id: "recRemembered",
          review_status: "reviewed",
        },
      },
    ],
  };

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const table = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "");
    return new Response(JSON.stringify({ records: fixtures[table] || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return () => {
    globalThis.fetch = original;
  };
}

test("Per manual rename is deterministic search priority #1 even when canonical name collides", async () => {
  const restore = installMock();
  try {
    const response = await handleCreateSessionClientLineageRequest(request("หนุ่ย"), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-client-lineage"), "canonical-v3-remembered-name-first");
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.deepEqual(body.lookup_chain, CUSTOMER_LOOKUP_CHAIN);
    assert.deepEqual(body.lookup_priority, CUSTOMER_LOOKUP_PRIORITY);
    assert.equal(body.lookup_priority[0], "per_manual_rename");

    assert.equal(body.records.length, 2);
    assert.equal(body.records[0].client_id, "recRemembered");
    assert.equal(body.records[0].remembered_name, "หนุ่ย");
    assert.equal(body.records[0].canonical_name, "Canonical N");
    assert.equal(body.records[0].client_name, "หนุ่ย");
    assert.equal(body.records[0].matched_on, "per_manual_rename");
    assert.equal(body.records[0].matched_value, "หนุ่ย");
    assert.ok(body.records[0].aliases.includes("Old Nickname"));
    assert.ok(body.records[0].aliases.includes("Nui LINE"));

    assert.equal(body.records[1].client_id, "recCanonicalCollision");
    assert.equal(body.records[1].matched_on, "historical_name");
  } finally {
    restore();
  }
});

test("lookup chain stays identity-first and does not claim entitlement authority", async () => {
  const restore = installMock();
  try {
    const response = await handleCreateSessionClientLineageRequest(request("หนุ่ย"), env);
    const body = await response.json();
    assert.deepEqual(body.lookup_chain, [
      "per_manual_rename",
      "canonical_client",
      "aliases",
      "application",
      "earliest_verified_session",
      "full_history",
    ]);
    assert.equal(body.entitlement_policy, "display_snapshot_only_backend_rechecks");
    assert.equal(body.authority, "airtable_operational_records");
  } finally {
    restore();
  }
});
