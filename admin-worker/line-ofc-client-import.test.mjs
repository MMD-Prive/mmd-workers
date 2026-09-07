import assert from "node:assert/strict";
import test from "node:test";

import { handleLineOfcClientImport, LINE_OFC_CLIENT_IMPORT_PATH } from "./src/line-ofc-client-import.js";
import { isKenjiControlActionRequest } from "./src/kenji-control-actions.js";

const ENV = {
  AIRTABLE_BASE_ID: "base-test",
  AIRTABLE_API_KEY: "airtable-test",
  AIRTABLE_TABLE_CLIENTS_ID: "clients",
  AIRTABLE_LINE_OFC_IMPORT_TABLE_ID: "line-imports",
  AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING_ID: "verified-staging",
  AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID: "pre-session-index",
};
const OWNER = { id: "boss-per", role: "owner" };

function request(body) {
  return new Request(`https://mmdbkk.com${LINE_OFC_CLIENT_IMPORT_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function response(body) { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }

function tableName(value) {
  const url = new URL(String(value));
  const parts = url.pathname.split("/").filter(Boolean);
  const maybeRecord = parts.at(-1) || "";
  if (maybeRecord.startsWith("rec")) return decodeURIComponent(parts.at(-2) || "");
  return decodeURIComponent(maybeRecord);
}

test("LINE OFC import route is exact and POST-only", () => {
  assert.equal(isKenjiControlActionRequest(LINE_OFC_CLIENT_IMPORT_PATH, "POST"), true);
  assert.equal(isKenjiControlActionRequest(LINE_OFC_CLIENT_IMPORT_PATH, "GET"), false);
  assert.equal(isKenjiControlActionRequest(LINE_OFC_CLIENT_IMPORT_PATH + "/extra", "POST"), false);
});

test("matched LINE OA import projects rename into reviewed staging and canonical-ready pre-session index", async () => {
  const originalFetch = globalThis.fetch;
  let staged = null;
  let verified = null;
  let indexed = null;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    const method = init.method || "GET";
    const table = tableName(value);

    if (method === "GET" && table === "clients") {
      const formula = new URL(value).searchParams.get("filterByFormula") || "";
      return response({ records: formula.includes("line_user_id") ? [{ id: "recClient", fields: { line_user_id: "U123" } }] : [] });
    }
    if (method === "GET" && ["line-imports", "verified-staging", "pre-session-index"].includes(table)) return response({ records: [] });
    if (method === "POST" && table === "line-imports") {
      staged = JSON.parse(init.body).fields;
      return response({ id: "recImport", fields: staged });
    }
    if (method === "POST" && table === "verified-staging") {
      verified = JSON.parse(init.body).fields;
      return response({ id: "recVerified", fields: verified });
    }
    if (method === "POST" && table === "pre-session-index") {
      indexed = JSON.parse(init.body).fields;
      return response({ id: "recIndex", fields: indexed });
    }
    if (method === "POST" && table === "tblUzZ8ImRZOkks4c") return response({ id: "recAudit" });
    throw new Error(`unexpected fetch ${method} ${value}`);
  };
  try {
    const res = await handleLineOfcClientImport(request({
      import_id: "line-export-20260905-001",
      line_user_id: "U123",
      email: "member@example.com",
      phone: "0812345678",
      display_name: "Original LINE",
      telegram_username: "@membertg",
      current_line_rename: "หนุ่ย",
      raw_line_notes: "private notes",
      membership_application_sensitive: "application answers",
      behaviour_care_context: "prefers short messages",
      service_history_candidate: [{ date: "2026-08-01", service: "private session" }],
      source_hash: "sha256:test",
      reason: "Backfill verified LINE OFC customer history",
    }), ENV, OWNER, { idempotencyKey: "line-import-1", payloadHash: "hash-1" });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "matched");
    assert.equal(body.canonical_client_id, "recClient");
    assert.equal(body.verified_staging_record_id, "recVerified");
    assert.equal(body.pre_session_index_record_id, "recIndex");
    assert.equal(body.pre_session_lookup_status, "canonical_ready");
    assert.equal(body.membership_mutation, false);
    assert.equal(body.entitlement_mutation, false);
    assert.equal(body.telegram_mutation, false);

    assert.deepEqual(staged["Canonical Client"], ["recClient"]);
    assert.equal(staged["Telegram Username"], "membertg");
    assert.equal(staged["Raw LINE Notes"], "private notes");
    assert.match(staged["Service History Candidate JSON"], /private session/);

    assert.equal(verified.line_renamed_name, "หนุ่ย");
    assert.equal(verified.line_display_name, "Original LINE");
    assert.deepEqual(verified.matched_client, ["recClient"]);
    assert.equal(verified.matched_client_id, "recClient");
    assert.equal(verified.review_status, "committed");
    assert.equal(verified.decision, "link_existing_client");

    assert.equal(indexed.preferred_name, "หนุ่ย");
    assert.deepEqual(indexed.linked_client, ["recClient"]);
    assert.equal(indexed.resolution_status, "linked");
    assert.equal(indexed.session_lookup_status, "canonical_ready");
    assert.equal(indexed.candidate_only, false);
    assert.equal(indexed.current_rights_source, "my_mmd_entitlement_resolver_v1");

    assert.doesNotMatch(JSON.stringify(verified), /private notes|application answers|prefers short messages|private session/);
    assert.doesNotMatch(JSON.stringify(indexed), /private notes|application answers|prefers short messages|private session/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unmatched verified LINE OA import becomes searchable candidate without rights", async () => {
  const originalFetch = globalThis.fetch;
  let indexed = null;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    const method = init.method || "GET";
    const table = tableName(value);
    if (method === "GET" && ["clients", "line-imports", "verified-staging", "pre-session-index"].includes(table)) return response({ records: [] });
    if (method === "POST" && table === "line-imports") return response({ id: "recImport2", fields: JSON.parse(init.body).fields });
    if (method === "POST" && table === "verified-staging") return response({ id: "recVerified2", fields: JSON.parse(init.body).fields });
    if (method === "POST" && table === "pre-session-index") {
      indexed = JSON.parse(init.body).fields;
      return response({ id: "recIndex2", fields: indexed });
    }
    if (method === "POST" && table === "tblUzZ8ImRZOkks4c") return response({ id: "recAudit2" });
    throw new Error(`unexpected fetch ${method} ${value}`);
  };
  try {
    const res = await handleLineOfcClientImport(request({
      import_id: "line-export-unmatched-001",
      line_user_id: "U-unmatched",
      display_name: "LINE Guest",
      current_line_rename: "ลูกค้าใหม่",
      raw_line_notes: "identity evidence only",
      reason: "Verified LINE OA export",
    }), ENV, OWNER, { idempotencyKey: "line-import-2", payloadHash: "hash-2" });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.canonical_client_id, null);
    assert.equal(body.pre_session_lookup_status, "searchable_candidate");
    assert.equal(indexed.preferred_name, "ลูกค้าใหม่");
    assert.equal(indexed.resolution_status, "candidate");
    assert.equal(indexed.session_lookup_status, "searchable_candidate");
    assert.equal(indexed.candidate_only, true);
    assert.equal(indexed.current_rights_source, "my_mmd_entitlement_resolver_v1");
    assert.equal(indexed.linked_client, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
