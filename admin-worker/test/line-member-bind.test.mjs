import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import worker from "../src/index.js";

const BASE = "https://sigil.mmdbkk.com";
const VALID_PAYLOAD = {
  source: "sigil_member_membership",
  line_user_id: "U1234567890abcdef1234567890abcdef",
  line_display_name: "Per Test",
  line_picture_url: "https://example.com/picture.jpg",
  selected_package: "premium",
  context: {
    os: "ios",
    language: "th",
    type: "utou",
    utm_source: "line_rich_menu",
  },
};

let originalFetch;
let fetchCalls;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  fetchCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        records: [{ id: "recLineBindEvidence", fields: {} }],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function bindRequest(body = VALID_PAYLOAD, headers = {}) {
  return new Request(`${BASE}/v1/line/member/bind`, {
    method: "POST",
    headers: {
      Origin: "https://mmdbkk.com",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function call(body, env = {}, headers = {}) {
  return worker.fetch(bindRequest(body, headers), env);
}

test("LINE member bind accepts valid payload without persistence when Airtable env is absent", async () => {
  const response = await call(VALID_PAYLOAD);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, "accepted_no_persistence");
  assert.equal(body.materialization.membership_active, false);
  assert.equal(body.materialization.points_awarded, false);
  assert.equal(body.materialization.payments_verified, false);
  assert.equal(fetchCalls.length, 0);
  assert.equal(JSON.stringify(body).includes(VALID_PAYLOAD.line_user_id), false);
});

test("LINE member bind rejects invalid origin", async () => {
  const response = await worker.fetch(bindRequest(VALID_PAYLOAD, { Origin: "https://evil.example" }), {});
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "origin_not_allowed");
});

test("LINE member bind rejects non-JSON requests", async () => {
  const response = await worker.fetch(
    new Request(`${BASE}/v1/line/member/bind`, {
      method: "POST",
      headers: {
        Origin: "https://mmdbkk.com",
        "Content-Type": "text/plain",
      },
      body: "not-json",
    }),
    {}
  );
  const body = await response.json();

  assert.equal(response.status, 415);
  assert.equal(body.error, "json_required");
});

test("LINE member bind rejects token-like payload fields", async () => {
  const response = await call({ ...VALID_PAYLOAD, access_token: "should-not-be-sent" });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "forbidden_payload_field");
  assert.equal(fetchCalls.length, 0);
});

test("LINE member bind persists evidence-only record when Airtable env is present", async () => {
  const response = await call(VALID_PAYLOAD, {
    AIRTABLE_API_KEY: "airtable-test-key",
    AIRTABLE_BASE_ID: "appTestBase",
    AIRTABLE_TABLE_CONSOLE_INBOX_ID: "tblConsoleInbox",
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, "persisted");
  assert.equal(body.record_id, "recLineBindEvidence");
  assert.equal(body.materialization.entitlements_materialized, false);
  assert.equal(fetchCalls.length, 1);

  const airtableBody = JSON.parse(fetchCalls[0].init.body);
  const fields = airtableBody.records[0].fields;
  const payload = JSON.parse(fields.payload_json);

  assert.equal(fields.source, "sigil_member_membership");
  assert.equal(fields.intent, "liff_member_bind");
  assert.equal(fields.line_user_id, VALID_PAYLOAD.line_user_id);
  assert.equal(payload.line_user_id_hash.length, 64);
  assert.equal(JSON.stringify(payload).includes("access_token"), false);
  assert.equal(payload.materialization.membership_active, false);
  assert.equal(payload.materialization.points_awarded, false);
  assert.equal(payload.materialization.payments_verified, false);
});
