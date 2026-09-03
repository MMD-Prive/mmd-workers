import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH,
  CREATE_SESSION_CLIENT_RECENT_PATH,
  handleCreateSessionClientLineageRequest,
  isCreateSessionClientLineageRequest,
} from "./src/create-session-client-lineage-runtime.js";

const here = dirname(fileURLToPath(import.meta.url));

const env = {
  AIRTABLE_API_KEY: "airtable-test",
  AIRTABLE_BASE_ID: "base-test",
  AIRTABLE_TABLE_CLIENTS_ID: "clients",
  AIRTABLE_TABLE_MEMBERS_ID: "members",
  AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID: "entitlements",
  AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING_ID: "staging",
  INTERNAL_TOKEN: "internal-test",
};

const fixtures = {
  clients: [
    {
      id: "recClient1",
      createdTime: "2026-09-03T01:00:00.000Z",
      fields: {
        "Client Name": "Per Client",
        username: "perclient",
        line_user_id: "U123",
        line_display_name: "Per LINE",
        telegram_username: "@perclient",
        email: "per@example.com",
      },
    },
  ],
  members: [
    {
      id: "recMember1",
      createdTime: "2026-08-01T01:00:00.000Z",
      fields: {
        "Full Name": "Per Member",
        "Contact Email": "per@example.com",
        "Membership Tier": "Premium",
        "Membership Status": "Active",
        member_id: "perpm",
        username: "perclient",
        telegram_username: "@perclient",
      },
    },
  ],
  entitlements: [
    {
      id: "recEnt1",
      createdTime: "2026-09-01T01:00:00.000Z",
      fields: {
        client: ["recClient1"],
        member: ["recMember1"],
        member_email: "per@example.com",
        line_user_id: "U123",
        package_code: "Premium",
        entitlement_level: "premium",
        member_lifecycle_status: "active",
        access_status: "active",
        telegram_access_status: "linked",
        expire_at: "2027-01-01T00:00:00.000Z",
        capability: "membership",
      },
    },
  ],
  staging: [
    {
      id: "recStage1",
      createdTime: "2026-08-31T01:00:00.000Z",
      fields: {
        import_id: "line-import-1",
        line_user_id: "U123",
        line_display_name: "Per LINE",
        line_renamed_name: "Per Premium",
        line_tags_raw: "#purchased,#mem2026",
        matched_client_id: "recClient1",
        review_status: "reviewed",
      },
    },
    {
      id: "recStageOnly",
      createdTime: "2026-09-02T01:00:00.000Z",
      fields: {
        import_id: "stage-only",
        line_user_id: "U-stage-only",
        line_display_name: "Staging Only",
        line_tags_raw: "#premium",
        review_status: "pending",
      },
    },
  ],
};

function authedRequest(path, init = {}) {
  return new Request(`https://admin-worker.internal${path}`, {
    ...init,
    headers: {
      Authorization: "Bearer internal-test",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function installAirtableMock() {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    calls.push(url);
    const table = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "");
    const records = fixtures[table] || [];
    return new Response(JSON.stringify({ records }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return () => {
    globalThis.fetch = original;
    return calls;
  };
}

test("route predicate covers only real lineage lookup and recent", () => {
  assert.equal(isCreateSessionClientLineageRequest(CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH, "POST"), true);
  assert.equal(isCreateSessionClientLineageRequest(CREATE_SESSION_CLIENT_RECENT_PATH, "GET"), true);
  assert.equal(isCreateSessionClientLineageRequest(CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH, "GET"), false);
  assert.equal(isCreateSessionClientLineageRequest("/v1/admin/models/search", "GET"), false);
});

test("lineage lookup returns canonical client enriched by member, entitlement and reviewed LINE staging", async () => {
  const restore = installAirtableMock();
  try {
    const response = await handleCreateSessionClientLineageRequest(
      authedRequest(CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH, {
        method: "POST",
        body: JSON.stringify({ query: "Per Premium" }),
      }),
      env,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-client-lineage"), "canonical-v1");
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.records.length, 1);
    const record = body.records[0];
    assert.equal(record.client_id, "recClient1");
    assert.equal(record.member_id, "perpm");
    assert.equal(record.line_user_id, "U123");
    assert.equal(record.package_code, "Premium");
    assert.equal(record.tier, "premium");
    assert.equal(record.membership_status, "active");
    assert.equal(record.customer_telegram_status, "linked");
    assert.deepEqual(record.legacy_tags, ["#purchased", "#mem2026"]);
    assert.equal(record.entitlement_snapshot_source, "member_entitlements_display_only");
    assert.equal(body.records.some((item) => item.client_name === "Staging Only"), false);
  } finally {
    restore();
  }
});

test("recent lineage returns canonical clients and never materializes staging-only rows", async () => {
  const restore = installAirtableMock();
  try {
    const response = await handleCreateSessionClientLineageRequest(
      authedRequest(CREATE_SESSION_CLIENT_RECENT_PATH, { method: "GET" }),
      env,
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].client_id, "recClient1");
    assert.equal(body.records.some((item) => item.line_user_id === "U-stage-only"), false);
  } finally {
    restore();
  }
});

test("lineage runtime fails closed without internal authorization", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  try {
    const response = await handleCreateSessionClientLineageRequest(
      new Request(`https://admin-worker.internal${CREATE_SESSION_CLIENT_RECENT_PATH}`),
      env,
    );
    assert.equal(response.status, 401);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("active composed worker wires lineage before studio fallback", async () => {
  const source = await readFile(join(here, "src/studio-telegram-worker.js"), "utf8");
  assert.match(source, /isCreateSessionClientLineageRequest\(path, method\)/);
  assert.match(source, /handleCreateSessionClientLineageRequest\(request, env\)/);
  assert.ok(
    source.indexOf("isCreateSessionClientLineageRequest(path, method)") < source.indexOf("studioWorker.fetch(request, env, ctx)"),
    "lineage handler must run before the legacy fallback",
  );
});
