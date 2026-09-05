import assert from "node:assert/strict";
import test from "node:test";

import { handleLineOfcClientImport, LINE_OFC_CLIENT_IMPORT_PATH } from "./src/line-ofc-client-import.js";
import { isKenjiControlActionRequest } from "./src/kenji-control-actions.js";

const ENV = {
  AIRTABLE_BASE_ID: "base-test",
  AIRTABLE_API_KEY: "airtable-test",
  AIRTABLE_TABLE_CLIENTS_ID: "clients",
  AIRTABLE_LINE_OFC_IMPORT_TABLE_ID: "line-imports",
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

test("LINE OFC import route is exact and POST-only", () => {
  assert.equal(isKenjiControlActionRequest(LINE_OFC_CLIENT_IMPORT_PATH, "POST"), true);
  assert.equal(isKenjiControlActionRequest(LINE_OFC_CLIENT_IMPORT_PATH, "GET"), false);
  assert.equal(isKenjiControlActionRequest(LINE_OFC_CLIENT_IMPORT_PATH + "/extra", "POST"), false);
});

test("LINE OFC import stages private context and candidate history without entitlement mutation", async () => {
  const originalFetch = globalThis.fetch;
  let staged = null;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    const method = init.method || "GET";
    if (method === "GET" && value.includes("/clients?")) {
      const formula = new URL(value).searchParams.get("filterByFormula") || "";
      return response({ records: formula.includes("line_user_id") ? [{ id: "recClient", fields: { line_user_id: "U123" } }] : [] });
    }
    if (method === "POST" && value.endsWith("/line-imports")) {
      staged = JSON.parse(init.body).fields;
      return response({ id: "recImport", fields: staged });
    }
    if (method === "POST" && value.endsWith("/tblUzZ8ImRZOkks4c")) return response({ id: "recAudit" });
    throw new Error(`unexpected fetch ${method} ${value}`);
  };
  try {
    const res = await handleLineOfcClientImport(request({
      import_id: "line-export-20260905-001",
      line_user_id: "U123",
      email: "member@example.com",
      phone: "0812345678",
      telegram_username: "@membertg",
      current_line_rename: "Premium · 2027-01-31",
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
    assert.equal(body.membership_mutation, false);
    assert.equal(body.entitlement_mutation, false);
    assert.equal(body.telegram_mutation, false);
    assert.deepEqual(staged["Canonical Client"], ["recClient"]);
    assert.equal(staged["Telegram Username"], "membertg");
    assert.equal(staged["Raw LINE Notes"], "private notes");
    assert.match(staged["Service History Candidate JSON"], /private session/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});