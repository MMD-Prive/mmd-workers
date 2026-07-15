#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/dashboard-worker.js";

const TABLES = {
  "MMD — Auth Sessions": [],
  "MMD — Auth Identities": [],
  Members: [],
  "MMD — Member Entitlements": [],
  Payments: [],
  Sessions: [],
  "MMD — Points Ledger": [],
  "MMD — LIFF Renewal Sessions": [],
};

function record(id, fields) {
  return { id, fields };
}

function fixtures(overrides = {}) {
  return {
    ...TABLES,
    "MMD — Auth Sessions": [record("recAuth", { token: "valid-token", member_id: "member-1" })],
    Members: [record("recMember", { member_id: "member-1", display_name: "Kenji Member" })],
    ...overrides,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function dashboardRequest(query, tableFixtures = fixtures(), { failTable = "" } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const tableName = decodeURIComponent(url.pathname.split("/").at(-1));
    if (tableName === failTable) return jsonResponse({ error: "upstream_failure" }, 500);
    return jsonResponse({ records: tableFixtures[tableName] || [] });
  };

  try {
    const response = await worker.fetch(
      new Request(`https://admin-worker.test/v1/member/dashboard${query}`),
      { AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "test-base" },
    );
    return { response, body: await response.json() };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("missing t returns 404 invalid_link without loading Airtable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assert.fail("Airtable must not be called without t");
  try {
    const response = await worker.fetch(
      new Request("https://admin-worker.test/v1/member/dashboard?code=ignored"),
      {},
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      ok: false,
      state: "invalid_link",
      message: "ไม่พบลิงก์ส่วนตัวครับ",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unknown t returns 404 invalid_link", async () => {
  const { response, body } = await dashboardRequest("?t=unknown");
  assert.equal(response.status, 404);
  assert.equal(body.state, "invalid_link");
});

test("approved entitlement maps to active", async () => {
  const data = fixtures({
    "MMD — Member Entitlements": [record("recEnt", { member_id: "member-1", status: "approved", tier: "PRIVATE" })],
  });
  const { response, body } = await dashboardRequest("?t=valid-token", data);
  assert.equal(response.status, 200);
  assert.equal(body.data.dashboard_state, "active");
  assert.equal(body.data.access.status, "active");
});

test("ended entitlement maps to expired with renewal URL", async () => {
  const data = fixtures({
    "MMD — Member Entitlements": [record("recEnt", { member_id: "member-1", status: "ended" })],
  });
  const { body } = await dashboardRequest("?t=valid-token", data);
  assert.equal(body.data.dashboard_state, "expired");
  assert.equal(body.data.actions.renewal_url, "/sigil/pay/renewal?t=valid-token");
});

test("pending verification maps to pending with payment URL", async () => {
  const data = fixtures({
    Payments: [record("recPayment", { member_id: "member-1", verification_status: "under_review" })],
  });
  const { body } = await dashboardRequest("?t=valid-token", data);
  assert.equal(body.data.dashboard_state, "pending");
  assert.equal(body.data.actions.payment_url, "/confirm/payment-confirmation?t=valid-token");
});

test("uploaded payment proof without verified entitlement never activates access", async () => {
  const data = fixtures({
    Payments: [record("recPayment", { member_id: "member-1", status: "proof_uploaded" })],
  });
  const { body } = await dashboardRequest("?t=valid-token", data);
  assert.equal(body.data.dashboard_state, "pending");
  assert.notEqual(body.data.access.status, "active");
});

test("Airtable failure returns 502 load_error", async () => {
  const { response, body } = await dashboardRequest("?t=valid-token", fixtures(), {
    failTable: "MMD — Member Entitlements",
  });
  assert.equal(response.status, 502);
  assert.equal(body.state, "load_error");
});

test("safe campaign params are preserved and all other params are dropped", async () => {
  const data = fixtures({
    "MMD — Member Entitlements": [record("recEnt", { member_id: "member-1", status: "active" })],
    Sessions: [record("recSession", { member_id: "member-1", session_id: "session/1" })],
  });
  const query = "?t=valid-token&code=C1&promo=P1&source=line&invite=I1&redirect=https://evil.test";
  const { body } = await dashboardRequest(query, data);
  const urls = Object.values(body.data.actions).filter(Boolean);
  for (const value of urls) {
    assert.match(value, /t=valid-token/);
    assert.match(value, /code=C1/);
    assert.match(value, /promo=P1/);
    assert.match(value, /source=line/);
    assert.match(value, /invite=I1/);
    assert.doesNotMatch(value, /evil|redirect/);
    const parsed = new URL(value, "https://mmdbkk.com");
    assert.ok(["mmdbkk.com", "www.mmdbkk.com", "sigil.mmdbkk.com", "t.me"].includes(parsed.hostname));
  }
});

test("SVIP Eligible fields are ignored", async () => {
  const data = fixtures({
    Members: [record("recMember", { member_id: "member-1", display_name: "Kenji Member", "SVIP Eligible": true })],
    "MMD — Member Entitlements": [record("recEnt", { member_id: "member-1", status: "pending" })],
  });
  const { body } = await dashboardRequest("?t=valid-token", data);
  assert.equal(body.data.dashboard_state, "pending");
  assert.equal(body.data.member.tier, null);
  assert.equal(JSON.stringify(body).includes("SVIP"), false);
});
