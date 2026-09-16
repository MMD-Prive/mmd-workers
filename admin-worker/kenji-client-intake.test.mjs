import assert from "node:assert/strict";
import test from "node:test";

import { handleKenjiClientIntake, KENJI_CLIENT_INTAKE_PATH } from "./src/kenji-client-intake.js";
import { isKenjiControlActionRequest } from "./src/kenji-control-actions.js";

const ENV = {
  AIRTABLE_BASE_ID: "base-test",
  AIRTABLE_API_KEY: "airtable-test",
  AIRTABLE_TABLE_CLIENTS_ID: "clients",
};
const OWNER = { id: "boss-per", role: "owner" };

function request(body) {
  return new Request(`https://mmdbkk.com${KENJI_CLIENT_INTAKE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("client intake route stays exact and POST-only", () => {
  assert.equal(isKenjiControlActionRequest(KENJI_CLIENT_INTAKE_PATH, "POST"), true);
  assert.equal(isKenjiControlActionRequest(KENJI_CLIENT_INTAKE_PATH, "GET"), false);
  assert.equal(isKenjiControlActionRequest(`${KENJI_CLIENT_INTAKE_PATH}/extra`, "POST"), false);
});

test("client intake creates only a canonical Airtable Client", async () => {
  const originalFetch = globalThis.fetch;
  let createdClientFields = null;

  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    const method = init.method || "GET";
    if (method === "GET" && value.includes("/clients?")) return jsonResponse({ records: [] });
    if (method === "POST" && value.endsWith("/clients")) {
      const body = JSON.parse(init.body);
      createdClientFields = body.fields;
      return jsonResponse({ id: "recClientNew", fields: body.fields });
    }
    if (method === "POST" && value.endsWith("/tblUzZ8ImRZOkks4c")) {
      return jsonResponse({ id: "recAudit", fields: JSON.parse(init.body).fields });
    }
    throw new Error(`unexpected fetch ${method} ${value}`);
  };

  try {
    const response = await handleKenjiClientIntake(request({
      display_name: "หนุ่ย",
      phone: "081-234-5678",
      source: "operator_manual",
      note: "เตรียมสร้างงาน Public",
      reason: "Prepare canonical Airtable Client before Create Session",
    }), ENV, OWNER, { idempotencyKey: "kci-create-1", payloadHash: "hash-create-1" });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.action, "created");
    assert.equal(body.client.record_id, "recClientNew");
    assert.equal(body.client.display_name, "หนุ่ย");
    assert.equal(body.membership_mutation, false);
    assert.equal(body.entitlement_mutation, false);
    assert.equal(body.private_access_mutation, false);

    assert.equal(createdClientFields["Client Name"], "หนุ่ย");
    assert.equal(createdClientFields["Phone Number"], "081-234-5678");
    assert.equal(Object.hasOwn(createdClientFields, "member_status"), false);
    assert.equal(Object.hasOwn(createdClientFields, "entitlement_level"), false);
    assert.equal(Object.hasOwn(createdClientFields, "Privacy Level"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("client intake reuses one strong identity match instead of creating a duplicate", async () => {
  const originalFetch = globalThis.fetch;
  let clientCreates = 0;

  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    const method = init.method || "GET";
    if (method === "GET" && value.includes("/clients?")) {
      const formula = new URL(value).searchParams.get("filterByFormula") || "";
      if (formula.includes("line_user_id")) {
        return jsonResponse({ records: [{ id: "recExisting", fields: {
          "Client Name": "Nui Canonical",
          line_user_id: "U123",
          source: "line_oa",
          primary_channel: "line_oa",
          notes_raw: "existing",
        } }] });
      }
      return jsonResponse({ records: [] });
    }
    if (method === "PATCH" && value.endsWith("/clients/recExisting")) {
      const patch = JSON.parse(init.body).fields;
      return jsonResponse({ id: "recExisting", fields: {
        "Client Name": "Nui Canonical",
        line_user_id: "U123",
        source: "line_oa",
        primary_channel: "line_oa",
        notes_raw: "existing",
        ...patch,
      } });
    }
    if (method === "POST" && value.endsWith("/clients")) {
      clientCreates += 1;
      return jsonResponse({ id: "should-not-create", fields: {} });
    }
    if (method === "POST" && value.endsWith("/tblUzZ8ImRZOkks4c")) {
      return jsonResponse({ id: "recAudit", fields: JSON.parse(init.body).fields });
    }
    throw new Error(`unexpected fetch ${method} ${value}`);
  };

  try {
    const response = await handleKenjiClientIntake(request({
      display_name: "หนุ่ย",
      line_user_id: "U123",
      source: "operator_manual",
      reason: "Prepare canonical Airtable Client before Create Session",
    }), ENV, OWNER, { idempotencyKey: "kci-match-1", payloadHash: "hash-match-1" });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.action, "matched");
    assert.equal(body.client.record_id, "recExisting");
    assert.equal(body.client.matched_on, "strong_identity");
    assert.equal(clientCreates, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("client intake fails closed when one identifier points at multiple clients", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    if ((init.method || "GET") === "GET" && value.includes("/clients?")) {
      return jsonResponse({ records: [
        { id: "recA", fields: { "Client Name": "A", line_user_id: "U999" } },
        { id: "recB", fields: { "Client Name": "B", line_user_id: "U999" } },
      ] });
    }
    throw new Error("unexpected mutation");
  };

  try {
    await assert.rejects(
      () => handleKenjiClientIntake(request({
        display_name: "หนุ่ย",
        line_user_id: "U999",
        reason: "Prepare canonical Airtable Client before Create Session",
      }), ENV, OWNER, { idempotencyKey: "kci-ambiguous", payloadHash: "hash-ambiguous" }),
      /client_match_ambiguous/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
