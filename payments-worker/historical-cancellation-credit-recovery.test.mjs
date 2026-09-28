import test from "node:test";
import assert from "node:assert/strict";

import worker from "./index.phase1.js";

const IDs = Object.freeze({
  proof: "recProof000000000",
  client: "recClient00000000",
  session: "recSession0000000",
  payment: "recPayment0000000",
});
const PROOF_ID = "hist_016267003725dor08189";
const SESSION_ID = "cxl_hist_hist_016267003725dor08189";
const PAYMENT_REF = "016267003725DOR08189";

function fixture() {
  const db = {
    proofs: [{
      id: IDs.proof,
      fields: {
        proof_id: PROOF_ID,
        status: "pending",
        payment_ref: PAYMENT_REF,
        amount_thb: 4500,
        note: JSON.stringify({
          schema: "mmd_historical_slip_backfill_v1",
          source_type: "line_archive",
          evidence_sha256: "a".repeat(64),
          review_state: "pending",
          extraction: { payment_ref: PAYMENT_REF, amount_thb: 4500 },
        }),
      },
    }],
    sessions: [{
      id: IDs.session,
      fields: {
        fldLTq2kZbyRv22IA: SESSION_ID,
        fldmwuvOaiCFdzzRa: "Cancelled",
        fld6P6if0vDZCeV0C: [IDs.client],
        fldojgjSQLaO0uQLX: PAYMENT_REF,
      },
    }],
    payments: [],
  };
  const calls = { paymentPatches: [], sessionPatches: [], proofPatches: [], unexpected: [] };
  const byTable = (name) => ({ "Payment Proofs": "proofs", Sessions: "sessions", Payments: "payments" }[name]);
  const fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (!url.hostname.includes("api.airtable.com")) {
      calls.unexpected.push(`${request.method} ${url}`);
      throw new Error(`unexpected network ${request.method} ${url}`);
    }
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const tableName = parts[2];
    const collection = byTable(tableName);
    const recordId = parts[3] || "";
    if (!collection) throw new Error(`unknown table ${tableName}`);
    const rows = db[collection];
    if (request.method === "GET" && recordId) {
      const found = rows.find((row) => row.id === recordId);
      return found ? Response.json(found) : Response.json({ error: "not_found" }, { status: 404 });
    }
    if (request.method === "GET") {
      const formula = url.searchParams.get("filterByFormula") || "";
      const ref = formula.match(/='([^']+)'/)?.[1] || "";
      let found = rows;
      if (collection === "proofs") found = rows.filter((row) => row.fields.proof_id === ref);
      if (collection === "sessions") found = rows.filter((row) => row.fields.fldLTq2kZbyRv22IA === ref || row.fields.session_id === ref);
      if (collection === "payments") {
        found = rows.filter((row) => row.fields.fldOO6SY49iDw8VBZ === ref || row.fields["Payment Reference"] === ref || row.fields.payment_ref === ref);
      }
      return Response.json({ records: found });
    }
    if (request.method === "POST" && collection === "payments") {
      const body = await request.json();
      const record = { id: IDs.payment, fields: body.records?.[0]?.fields || {} };
      rows.push(record);
      return Response.json({ records: [record] }, { status: 201 });
    }
    if (request.method === "PATCH" && recordId) {
      const body = await request.json();
      const record = rows.find((row) => row.id === recordId);
      if (!record) return Response.json({ error: "not_found" }, { status: 404 });
      Object.assign(record.fields, body.fields || {});
      if (collection === "payments") calls.paymentPatches.push(body.fields || {});
      if (collection === "sessions") calls.sessionPatches.push(body.fields || {});
      if (collection === "proofs") calls.proofPatches.push(body.fields || {});
      return Response.json(record);
    }
    throw new Error(`unexpected Airtable operation ${request.method} ${url}`);
  };
  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_TABLE_PAYMENT_PROOFS: "Payment Proofs",
    AIRTABLE_TABLE_PAYMENTS: "Payments",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "admin-to-payments-secret",
    INTERNAL_TOKEN: "payments-internal-secret",
    AT_PAYMENTS__PAYMENT_REF: "fldOO6SY49iDw8VBZ",
    AT_PAYMENTS__PAYMENT_DATE: "fld3yAwxIu2dkw7fO",
    AT_PAYMENTS__AMOUNT: "fldvCSwrUW8OMAooS",
    AT_PAYMENTS__PAYMENT_STATUS: "fldEJ1hmm7KwWuI6q",
    AT_PAYMENTS__PAYMENT_METHOD: "fldsblzIn0wzan3c9",
    AT_PAYMENTS__NOTES: "fldjsZIKoJPawlb2u",
    AT_PAYMENTS__VERIFICATION_STATUS: "fldJ7a0Ube9F0bmRy",
    AT_PAYMENTS__PAYMENT_INTENT_STATUS: "fld04fr3bRJTohO6y",
    AT_PAYMENTS__SESSION_ID: "fld2wdhBvc8xrV6y5",
    AT_PAYMENTS__PAYMENT_STAGE: "fldrr9g8ZZjqAbdKQ",
    AT_PAYMENTS__PAYMENT_TYPE: "fldydUWHhqVLMkNSC",
    AT_SESSIONS__PAYMENT_STATUS: "fldTY5lE6m0kQf72n",
    AT_SESSIONS__PAYMENT_REF: "fldojgjSQLaO0uQLX",
  };
  return { db, calls, env, fetch };
}

test("historical cancellation recovery verifies a cancelled same-client session and writes official funds without points/partner side effects", async () => {
  const state = fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = state.fetch;
  try {
    const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/v1/internal/payments/historical-slip/reviewed", {
      method: "POST",
      headers: { authorization: "Bearer admin-to-payments-secret", "content-type": "application/json" },
      body: JSON.stringify({
        source: "historical_slip_backfill",
        decision: "approved",
        proof_id: PROOF_ID,
        evidence_sha256: "a".repeat(64),
        payment_ref: PAYMENT_REF,
        amount_thb: 4500,
        payment_stage: "deposit",
        session_id: SESSION_ID,
        review_reason: "Cancellation-to-credit recovery reviewed by owner",
        cancellation_credit_recovery: true,
        recovery_client_record_id: IDs.client,
      }),
    }), state.env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.cancellation_credit_recovery, true);
    assert.equal(payload.points_ledger.skipped, true);
    assert.equal(payload.partner_confirmation.skipped, true);
    assert.equal(state.calls.unexpected.length, 0);
    assert.equal(state.db.sessions[0].fields.fldmwuvOaiCFdzzRa, "Cancelled");

    const payment = state.db.payments[0].fields;
    assert.deepEqual(payment.fldcrLuJijj7xr0y8, [IDs.client]);
    assert.equal(payment.fld5rTIVEF1DXwfe2, 4500);
    assert.equal(payment.fldJ7a0Ube9F0bmRy, "official_verified");
    assert.equal(payment.fldD0mQWTfdmyBAeT, "official_verified");
    assert.equal(payment.flddkMKy5H8RbFwt9, PAYMENT_REF);
    assert.equal(payment.fld208LCmQZB5llNo, "payments-worker");
    assert.ok(payment.fldPNK6qgxCSdaJRM);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recovery rejects a client that is not the canonical client on the cancelled session before money writes", async () => {
  const state = fixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = state.fetch;
  try {
    const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/v1/internal/payments/historical-slip/reviewed", {
      method: "POST",
      headers: { authorization: "Bearer admin-to-payments-secret", "content-type": "application/json" },
      body: JSON.stringify({
        source: "historical_slip_backfill",
        decision: "approved",
        proof_id: PROOF_ID,
        evidence_sha256: "a".repeat(64),
        payment_ref: PAYMENT_REF,
        amount_thb: 4500,
        payment_stage: "deposit",
        session_id: SESSION_ID,
        review_reason: "Cancellation-to-credit recovery reviewed by owner",
        cancellation_credit_recovery: true,
        recovery_client_record_id: "recOther000000000",
      }),
    }), state.env);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "recovery_session_client_mismatch");
    assert.equal(state.db.payments.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
