import test from "node:test";
import assert from "node:assert/strict";
import worker from "../index.js";

const CLAIM_FIELD = "fld0qxp5w6QwMiaue";
const CLAIM_ID = "MMD6-2026-ABCDEF123456";
const CAMPAIGN_ID = "mmd_6th_anniversary_2026";

function environment() {
  return {
    AIRTABLE_API_KEY: "test-only",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TABLE_PAYMENTS: "payments",
    AIRTABLE_TABLE_SESSIONS: "sessions",
    AIRTABLE_TABLE_POINTS_LEDGER: "points",
    AT_PAYMENTS__CAMPAIGN_CLAIM_ID: CLAIM_FIELD,
  };
}

function request(body) {
  return new Request("https://payments-worker.test/v1/pay/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: "membership-session-1",
      payment_stage: "membership",
      amount: 1000,
      payment_ref: "renewal-ref",
      campaign_id: CAMPAIGN_ID,
      ...body,
    }),
  });
}

function mockAirtable(existingPayment = null) {
  const writes = [];
  const fetch = async (_url, init = {}) => {
    if (!init.method || init.method === "GET") {
      return Response.json({ records: existingPayment ? [existingPayment] : [] });
    }
    writes.push(JSON.parse(init.body));
    return Response.json({ records: [{ id: "recPaymentCreated", fields: writes.at(-1).records?.[0]?.fields || {} }] });
  };
  return { fetch, writes };
}

test("Anniversary payment creation fails closed without campaign_claim_id", async () => {
  const original = globalThis.fetch;
  const airtable = mockAirtable();
  globalThis.fetch = airtable.fetch;
  try {
    const response = await worker.fetch(request({}), environment());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "campaign_claim_id_required");
    assert.equal(airtable.writes.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("Anniversary payment intent persists campaign_claim_id before review", async () => {
  const original = globalThis.fetch;
  const airtable = mockAirtable();
  globalThis.fetch = airtable.fetch;
  try {
    const response = await worker.fetch(request({ campaign_claim_id: CLAIM_ID }), environment());
    assert.equal(response.status, 200);
    assert.equal(airtable.writes.length, 1);
    assert.equal(airtable.writes[0].records[0].fields[CLAIM_FIELD], CLAIM_ID);
    assert.equal(airtable.writes[0].records[0].fields["Payment Status"], "pending");
    assert.equal(airtable.writes[0].records[0].fields["Verification Status"], "pending");
  } finally {
    globalThis.fetch = original;
  }
});

test("duplicate payment reference cannot be reused by another claim", async () => {
  const original = globalThis.fetch;
  const airtable = mockAirtable({ id: "recExisting", fields: { [CLAIM_FIELD]: "MMD6-2026-ZYXWVU654321" } });
  globalThis.fetch = airtable.fetch;
  try {
    const response = await worker.fetch(request({ campaign_claim_id: CLAIM_ID }), environment());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "payment_campaign_claim_mismatch");
    assert.equal(airtable.writes.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});
