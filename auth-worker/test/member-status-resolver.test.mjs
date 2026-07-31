import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const LINE_ID = "U" + "a".repeat(32);
const INTERNAL_SECRET = "s".repeat(48);

function env() {
  return {
    INTERNAL_SERVICE_SECRET: INTERNAL_SECRET,
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
  };
}

test("member status resolver rejects requests without the internal secret", async () => {
  const response = await worker.fetch(new Request("https://auth.internal/v1/internal/members/by-line", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lineUserId: LINE_ID }),
  }), env());

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "internal_service_unauthorized");
});

test("member status resolver returns only the active package snapshot for a verified LINE subject", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/Members")) {
      return Response.json({ records: [{ id: "rec_member", fields: { member_id: "mem_1", "Contact Email": "member@example.com", line_user_id: LINE_ID } }] });
    }
    if (url.pathname.endsWith("/member_packages")) {
      return Response.json({ records: [{ id: "rec_package", fields: { status: "active", package_code: "premium", start_date: "2026-01-01", end_date: "2099-01-01" } }] });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const response = await worker.fetch(new Request("https://auth.internal/v1/internal/members/by-line", {
      method: "POST",
      headers: { "content-type": "application/json", "x-mmd-internal-secret": INTERNAL_SECRET },
      body: JSON.stringify({ lineUserId: LINE_ID }),
    }), env());
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.data, {
      memberId: "mem_1",
      clientId: "",
      matchStatus: "matched",
      membershipState: "active",
      packageState: "current",
      membershipTier: "premium",
      membershipStartAt: "2026-01-01",
      membershipEndAt: "2099-01-01",
      hasFirstJob: false,
      firstSessionStatus: "",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("member status resolver returns the most recent expired package for promotion eligibility", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/Members")) {
      return Response.json({ records: [{ id: "rec_member", fields: { member_id: "mem_1", "Contact Email": "member@example.com", line_user_id: LINE_ID } }] });
    }
    if (url.pathname.endsWith("/member_packages")) {
      return Response.json({ records: [{ id: "rec_package", fields: { status: "expired", package_code: "standard", start_date: "2025-01-01", end_date: "2026-06-01" } }] });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const response = await worker.fetch(new Request("https://auth.internal/v1/internal/members/by-line", {
      method: "POST",
      headers: { "content-type": "application/json", "x-mmd-internal-secret": INTERNAL_SECRET },
      body: JSON.stringify({ lineUserId: LINE_ID }),
    }), env());
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.data.membershipState, "expired");
    assert.equal(payload.data.packageState, "previous");
    assert.equal(payload.data.membershipTier, "standard");
    assert.equal(payload.data.membershipEndAt, "2026-06-01");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
