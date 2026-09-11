import assert from "node:assert/strict";
import test from "node:test";

import { handleReviewedProof } from "./reviewed-proof.js";

const LINE_ID = "U9231a8783d5d7535343b790bb735642c";
const PROOF_ID = "line_recovery_2500";
const PAYMENT_REF = "RECOVERY-2500-001";
const MEMBER_RECORD = "recAAAAAAAAAAAAAA";
const CLIENT_RECORD = "recBBBBBBBBBBBBBB";
const RENEWAL_RECORD = "recCCCCCCCCCCCCCC";
const PROOF_RECORD = "recDDDDDDDDDDDDDD";

function harness() {
  const tables = {
    "tblfJfM4Sqag9zrLi": [{ id: PROOF_RECORD, fields: {
      proof_id: PROOF_ID,
      payment_ref: PAYMENT_REF,
      amount_thb: 2500,
      status: "pending",
      channel: "line_ofc",
      member: [MEMBER_RECORD],
      paid_at: "2026-09-07T15:16:21.000Z",
    } }],
    "tblgWc5VRon5o8Mhk": [{ id: MEMBER_RECORD, fields: {
      member_id: "inn",
      line_id: LINE_ID,
      "Membership Tier": null,
      "Membership Status": null,
    } }],
    "tblVv58TCbwh5j1fS": [{ id: CLIENT_RECORD, fields: {
      line_user_id: LINE_ID,
      nickname: "inn",
    } }],
    "tblXjQFwo0A2cHseh": [{ id: RENEWAL_RECORD, fields: {
      renewal_session_id: "renew-inn-001",
      renewal_flow_status: "renewal_pending_review",
      line_user_id: LINE_ID,
      requested_package: "premium",
      renewal_amount_thb: 2500,
      Client: [CLIENT_RECORD],
    } }],
    "tblNImdF9PKAxhXGi": [],
  };
  const writes = [];

  const airtableFetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const table = parts[2];
    const recordId = parts[3] || "";
    const rows = tables[table];
    if (!rows) return Response.json({ error: "table_not_found" }, { status: 404 });

    if (request.method === "GET" && recordId) {
      const row = rows.find((candidate) => candidate.id === recordId);
      return row ? Response.json(row) : Response.json({ error: "not_found" }, { status: 404 });
    }
    if (request.method === "GET") {
      const formula = url.searchParams.get("filterByFormula") || "";
      let found = rows;
      const proof = /\{proof_id\}='([^']+)'/.exec(formula)?.[1];
      const paymentRef = /\{payment_ref\}='([^']+)'/.exec(formula)?.[1];
      if (proof) found = found.filter((row) => row.fields.proof_id === proof);
      if (paymentRef) found = found.filter((row) => row.fields.payment_ref === paymentRef);
      return Response.json({ records: found });
    }
    if (request.method === "POST") {
      const body = await request.json();
      const created = (body.records || []).map((entry, index) => ({
        id: `recNEWENTITLEM${String(index + 1).padStart(3, "0")}`,
        fields: structuredClone(entry.fields || {}),
      }));
      rows.push(...created);
      writes.push({ method: "POST", table, created: structuredClone(created) });
      return Response.json({ records: created }, { status: 201 });
    }
    if (request.method === "PATCH" && recordId) {
      const body = await request.json();
      const row = rows.find((candidate) => candidate.id === recordId);
      if (!row) return Response.json({ error: "not_found" }, { status: 404 });
      Object.assign(row.fields, structuredClone(body.fields || {}));
      writes.push({ method: "PATCH", table, recordId, fields: structuredClone(body.fields || {}) });
      return Response.json(row);
    }
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  };

  return {
    env: {
      AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
      AIRTABLE_API_KEY: "pat-test",
      AIRTABLE_HTTP: { fetch: airtableFetch },
      AUTH_SERVICE_ADMIN_TO_PAYMENTS: "service-test",
      INTERNAL_TOKEN: "internal-test",
    },
    tables,
    writes,
  };
}

function request() {
  return new Request("https://payments.example.test/v1/internal/payments/reviewed-proof", {
    method: "POST",
    headers: {
      Authorization: "Bearer service-test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "payment_review_console",
      decision: "approved",
      proof_id: PROOF_ID,
      evidence_record_id: PROOF_RECORD,
      payment_ref: PAYMENT_REF,
      amount_thb: 2500,
      payment_stage: "membership",
      member_id: "inn",
      member_record_id: MEMBER_RECORD,
      client_record_id: CLIENT_RECORD,
      line_user_id: LINE_ID,
      package_code: "premium",
      context_source: "liff_renewal_recovery",
      renewal_session_id: "renew-inn-001",
      renewal_record_id: RENEWAL_RECORD,
      payment_method: "promptpay",
      review_reason: "Owner verified recovered LINE renewal evidence",
      review_actor: "per",
    }),
  });
}

test("email-less canonical LINE recovery materializes entitlement only after trusted notify succeeds", async () => {
  const h = harness();
  let notifyCalls = 0;
  const response = await handleReviewedProof(request(), h.env, {}, async (body) => {
    notifyCalls += 1;
    assert.equal(body.payment_ref, PAYMENT_REF);
    assert.equal(body.amount_thb, 2500);
    assert.equal(body.package_code, "premium");
    assert.equal(body.member_email, undefined);
    return Response.json({ ok: true, payment_ref: PAYMENT_REF, payment_stage: "membership", duplicate: false });
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.authority, "payments-worker");
  assert.equal(result.context_source, "liff_renewal_recovery");
  assert.equal(result.recovery_context, true);
  assert.equal(result.entitlement_materialized, true);
  assert.equal(notifyCalls, 1);

  assert.equal(h.tables.tblNImdF9PKAxhXGi.length, 1);
  const entitlement = h.tables.tblNImdF9PKAxhXGi[0].fields;
  assert.equal(entitlement.package_code, "premium");
  assert.equal(entitlement.access_status, "active");
  assert.equal(entitlement.telegram_access_status, "pending_invite");
  assert.deepEqual(entitlement.member, [MEMBER_RECORD]);
  assert.deepEqual(entitlement.client, [CLIENT_RECORD]);

  assert.equal(h.tables.tblgWc5VRon5o8Mhk[0].fields["Membership Tier"], "Premium");
  assert.equal(h.tables.tblgWc5VRon5o8Mhk[0].fields["Membership Status"], "Active");
  assert.equal(h.tables.tblXjQFwo0A2cHseh[0].fields.renewal_flow_status, "materialized");
  assert.equal(h.tables.tblfJfM4Sqag9zrLi[0].fields.status, "verified");
});

test("email-less recovery does not materialize entitlement if trusted notify fails", async () => {
  const h = harness();
  const response = await handleReviewedProof(request(), h.env, {}, async () => Response.json({ ok: false, error: "money_truth_failed" }, { status: 409 }));
  const result = await response.json();
  assert.equal(response.status, 409);
  assert.equal(result.ok, false);
  assert.equal(h.tables.tblNImdF9PKAxhXGi.length, 0);
  assert.equal(h.tables.tblfJfM4Sqag9zrLi[0].fields.status, "pending");
});
