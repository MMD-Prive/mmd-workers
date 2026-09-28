import assert from "node:assert/strict";
import test from "node:test";

import { reconcileOne } from "./src/membership-payment-pending-recovery.js";

const renewalId = "recAAAAAAAAAAAAAA";
const memberRecordId = "recBBBBBBBBBBBBBB";
const clientRecordId = "recCCCCCCCCCCCCCC";
const proofRecordId = "recDDDDDDDDDDDDDD";
const mergeRecordId = "recEEEEEEEEEEEEEE";
const lineUserId = "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const memberId = "mmd_rec_recBBBBBBBBBBBBBB";

function fixture({ proofStatus = "verified", amount = 1999 } = {}) {
  const records = new Map([
    [proofRecordId, {
      id: proofRecordId,
      fields: {
        proof_id: "PROOF-FIRST-REAL",
        status: proofStatus,
        amount_thb: amount,
        payment_ref: "016257231759COR07646",
        member: [memberRecordId],
        Client: [clientRecordId],
        "MMD — LIFF Renewal Sessions": [renewalId],
      },
    }],
    [clientRecordId, {
      id: clientRecordId,
      fields: { line_user_id: lineUserId },
    }],
    [mergeRecordId, {
      id: mergeRecordId,
      fields: {
        status: "applied",
        match_confidence: 1,
        "Candidate Member": [memberRecordId],
        "Candidate Client": [clientRecordId],
      },
    }],
    [memberRecordId, {
      id: memberRecordId,
      fields: { member_id: memberId, line_id: lineUserId },
    }],
  ]);

  const updates = [];
  const paymentCalls = [];

  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "service-secret",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const table = parts[2];
        const recordId = parts[3] || "";

        if (request.method === "PATCH") {
          const body = await request.json();
          updates.push({ table, recordId, body });
          return json({ id: recordId, fields: body.fields || {} });
        }

        if (recordId) {
          const record = records.get(recordId);
          return record ? json(record) : json({ error: "not_found" }, 404);
        }

        if (table === "tblgWc5VRon5o8Mhk") {
          return json({ records: [records.get(memberRecordId)] });
        }

        return json({ records: [] });
      },
    },
    PAYMENTS_WORKER: {
      async fetch(request) {
        paymentCalls.push({
          url: request.url,
          auth: request.headers.get("authorization"),
          caller: request.headers.get("x-mmd-service-caller"),
          body: await request.json(),
        });
        return json({
          ok: true,
          entitlement_materialized: true,
          entitlement_record_id: "recFFFFFFFFFFFFFF",
          membership_expire_at: "2028-09-14T00:00:00.000Z",
          membership_term: "2_years",
        });
      },
    },
  };

  const renewal = {
    id: renewalId,
    fields: {
      line_user_id: lineUserId,
      member_id_canonical: memberId,
      member_id_validation_status: "approved",
      renewal_flow_status: "renewal_pending_review",
      "Payment Proof": [proofRecordId],
      Client: [clientRecordId],
      "MMD — Identity Merge Requests": [mergeRecordId],
      renewal_session_id: "renewal-session-first-real",
      review_note: "identity resolved",
    },
  };

  return { env, renewal, updates, paymentCalls };
}

test("verified 1,999 LINE recovery infers Premium and delegates materialization to payments-worker", async () => {
  const h = fixture();
  const result = await reconcileOne(h.env, h.renewal);

  assert.equal(result.status, "materialized");
  assert.equal(result.package_code, "premium");
  assert.equal(result.amount_thb, 1999);
  assert.equal(result.entitlement_record_id, "recFFFFFFFFFFFFFF");

  assert.equal(h.updates.length, 1);
  assert.equal(h.updates[0].table, "tblXjQFwo0A2cHseh");
  assert.equal(h.updates[0].recordId, renewalId);
  assert.equal(h.updates[0].body.typecast, false);
  assert.equal(h.updates[0].body.fields.requested_package, "premium");
  assert.equal(h.updates[0].body.fields.renewal_amount_thb, 1999);
  assert.match(h.updates[0].body.fields.review_note, /private_premium_spend_20000/);

  assert.equal(h.paymentCalls.length, 1);
  const call = h.paymentCalls[0];
  assert.equal(call.auth, "Bearer service-secret");
  assert.equal(call.caller, "admin-worker");
  assert.equal(call.body.source, "payment_review_console");
  assert.equal(call.body.decision, "approved");
  assert.equal(call.body.context_source, "liff_renewal_recovery");
  assert.equal(call.body.package_code, "premium");
  assert.equal(call.body.amount_thb, 1999);
  assert.equal(call.body.member_id, memberId);
  assert.equal(call.body.member_record_id, memberRecordId);
  assert.equal(call.body.client_record_id, clientRecordId);
  assert.equal(call.body.renewal_record_id, renewalId);
  assert.equal(call.body.line_user_id, lineUserId);
});

test("unverified proof stays fail-closed and never calls payments-worker", async () => {
  const h = fixture({ proofStatus: "pending" });
  const result = await reconcileOne(h.env, h.renewal);

  assert.deepEqual(result, { status: "review_required", reason: "payment_proof_not_verified" });
  assert.equal(h.updates.length, 0);
  assert.equal(h.paymentCalls.length, 0);
});

test("unknown membership amount stays fail-closed", async () => {
  const h = fixture({ amount: 1800 });
  const result = await reconcileOne(h.env, h.renewal);

  assert.deepEqual(result, { status: "review_required", reason: "renewal_package_inference_not_safe" });
  assert.equal(h.updates.length, 0);
  assert.equal(h.paymentCalls.length, 0);
});

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
