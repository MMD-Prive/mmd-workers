import assert from "node:assert/strict";
import test from "node:test";

import { recoverCanonicalMemberLineLink } from "../src/my-mmd-line-identity-bridge.js";

const LINE_ID = `U${"a".repeat(32)}`;

function response(records, status = 200) {
  return Response.json({ records }, { status });
}

function baseEnv(handler) {
  return {
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_id",
    AIRTABLE_MEMBERS_EMAIL_FIELD: "Contact Email",
    AIRTABLE_CLIENTS_LINE_USER_ID_FIELD: "line_user_id",
    AIRTABLE_CLIENTS_EMAIL_FIELDS: "Contact Email,email",
    AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD: "line_user_id",
    AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD: "member_email",
    AIRTABLE_HTTP: { fetch: handler },
  };
}

function tableName(url) {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[2] || "");
}

test("links only the Members LINE field from one exact canonical client email", async () => {
  const writes = [];
  const env = baseEnv(async (request) => {
    const url = new URL(request.url);
    const table = tableName(url);
    if (request.method === "PATCH") {
      const body = await request.json();
      writes.push({ table, record: decodeURIComponent(url.pathname.split("/").pop()), body });
      return Response.json({ id: "recMember01", fields: body.fields });
    }
    if (table === "Clients") {
      return response([{ id: "recClient01", fields: { line_user_id: LINE_ID, "Contact Email": "member@example.com" } }]);
    }
    if (table === "MMD — Member Entitlements") return response([]);
    if (table === "LINE OFC Client Import Staging") return response([]);
    if (table === "Members") {
      return response([{ id: "recMember01", fields: { "Contact Email": "member@example.com", line_id: "", "Membership Tier": "Premium" } }]);
    }
    return response([]);
  });

  const result = await recoverCanonicalMemberLineLink(env, LINE_ID);
  assert.equal(result.linked, true);
  assert.equal(result.reason, "linked");
  assert.deepEqual(writes, [{
    table: "Members",
    record: "recMember01",
    body: { fields: { line_id: LINE_ID }, typecast: false },
  }]);
});

test("fails closed when canonical evidence points at different emails", async () => {
  let writes = 0;
  const env = baseEnv(async (request) => {
    const table = tableName(request.url);
    if (request.method === "PATCH") { writes += 1; return Response.json({ id: "unexpected" }); }
    if (table === "Clients") {
      return response([{ id: "recClient01", fields: { line_user_id: LINE_ID, "Contact Email": "one@example.com" } }]);
    }
    if (table === "MMD — Member Entitlements") {
      return response([{ id: "recEntitle1", fields: { line_user_id: LINE_ID, member_email: "two@example.com" } }]);
    }
    if (table === "LINE OFC Client Import Staging") return response([]);
    return response([]);
  });

  const result = await recoverCanonicalMemberLineLink(env, LINE_ID);
  assert.equal(result.linked, false);
  assert.equal(result.reason, "canonical_email_ambiguous");
  assert.equal(writes, 0);
});

test("accepts a committed exact LINE staging link but never changes access fields", async () => {
  const writes = [];
  const env = baseEnv(async (request) => {
    const url = new URL(request.url);
    const table = tableName(url);
    if (request.method === "PATCH") {
      const body = await request.json();
      writes.push(body);
      return Response.json({ id: "recMember02", fields: body.fields });
    }
    if (table === "Clients") {
      if (url.searchParams.get("filterByFormula")?.startsWith("RECORD_ID()")) {
        return response([{ id: "recClient02", fields: { line_user_id: LINE_ID, email: "linked@example.com" } }]);
      }
      return response([]);
    }
    if (table === "MMD — Member Entitlements") return response([]);
    if (table === "LINE OFC Client Import Staging") {
      return response([{ id: "recStage001", fields: {
        line_user_id: LINE_ID,
        match_type: "line_user_id_exact",
        decision: "link_existing_client",
        review_status: "committed",
        dry_run_only: false,
        matched_client: ["recClient02"],
      } }]);
    }
    if (table === "Members") {
      return response([{ id: "recMember02", fields: { "Contact Email": "linked@example.com", line_id: "", "Membership Status": "Expired" } }]);
    }
    return response([]);
  });

  const result = await recoverCanonicalMemberLineLink(env, LINE_ID);
  assert.equal(result.linked, true);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { fields: { line_id: LINE_ID }, typecast: false });
});
