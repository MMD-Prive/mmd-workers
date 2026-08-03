import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import worker from "../src/index.js";

const LINE_ID = `U${"a".repeat(32)}`;
const RESOLVER_SECRET = "test-only-member-status-resolver-secret-1234567890";
const RESOLVER_URL = "https://mmd-auth-worker.internal/__internal/member-status/resolve";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function env(overrides = {}) {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "line_user_id",
    MEMBER_STATUS_RESOLVER_SECRET: RESOLVER_SECRET,
    ...overrides,
  };
}

function resolverRequest(body, { secret = RESOLVER_SECRET, contentType = "application/json" } = {}) {
  const headers = {};
  if (contentType) headers["content-type"] = contentType;
  if (secret) headers["x-mmd-member-resolver-secret"] = secret;
  return new Request(RESOLVER_URL, { method: "POST", headers, body: JSON.stringify(body) });
}

test("member status resolver is not publicly callable", async () => {
  let airtableCalled = false;
  globalThis.fetch = async () => {
    airtableCalled = true;
    throw new Error("Airtable must not be called for an unauthorized request");
  };

  const response = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }, { secret: "" }), env());
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "NOT_FOUND");
  assert.equal(airtableCalled, false);
});

test("member status resolver accepts only the Phase 1 verified LINE-subject contract", async () => {
  let airtableCalled = false;
  globalThis.fetch = async () => {
    airtableCalled = true;
    throw new Error("Airtable must not be called for an invalid request");
  };

  const wrongPurpose = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "dashboard" }), env());
  const browserMemberClaim = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution", member_id: "spoof" }), env());

  assert.equal(wrongPurpose.status, 400);
  assert.equal(browserMemberClaim.status, 400);
  assert.equal(airtableCalled, false);
});

test("member status resolver returns only a boolean for one exact member match", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.airtable.com");
    assert.equal(url.pathname, "/v0/app_test/Members");
    assert.equal(init.method || "GET", "GET");
    assert.equal(url.searchParams.get("maxRecords"), "2");
    return new Response(JSON.stringify({ records: [{ id: "rec_member", fields: { line_user_id: LINE_ID, member_id: "MMD-should-not-leak" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const response = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, data: { member_exists: true } });
  assert.doesNotMatch(JSON.stringify(payload), /MMD-should-not-leak|Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
});

test("member status resolver distinguishes no match from ambiguous or unavailable data without granting access", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ records: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const noMatch = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
  assert.deepEqual(await noMatch.json(), { ok: true, data: { member_exists: false } });

  globalThis.fetch = async () => new Response(JSON.stringify({ records: [{ id: "rec_one", fields: {} }, { id: "rec_two", fields: {} }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const ambiguous = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
  const ambiguousPayload = await ambiguous.json();
  assert.equal(ambiguous.status, 409);
  assert.equal(ambiguousPayload.error.code, "MEMBER_MATCH_AMBIGUOUS");

  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "private Airtable diagnostic" } }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
  const unavailable = await worker.fetch(resolverRequest({ line_user_id: LINE_ID, purpose: "liff_identity_resolution" }), env());
  const unavailablePayload = await unavailable.json();
  assert.equal(unavailable.status, 503);
  assert.equal(unavailablePayload.error.code, "MEMBER_STATUS_RESOLVER_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(unavailablePayload), /private Airtable diagnostic/);
});
