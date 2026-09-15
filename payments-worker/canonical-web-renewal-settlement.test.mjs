import test from "node:test";
import assert from "node:assert/strict";

import { reconcileCanonicalWebRenewalProof } from "./canonical-web-renewal-settlement.js";

const LINE_ID = "U1234567890abcdef1234567890abcdef";
const MEMBER_ID = "MMD-001";

function harness() {
  let createCount = 1;
  const tables = {
    payments: [{
      id: "recPayment123456",
      fields: {
        payment_ref: "PAY-WEB-RENEW-1",
        session_id: "liff-session-1",
        payment_stage: "membership",
        amount_thb: 799,
        package_code: "standard",
        "Payment Status": "pending",
        "Verification Status": "pending",
      },
    }],
    proofs: [{
      id: "recProof12345678",
      fields: {
        proof_id: "webproof_123456",
        payment_ref: "PAY-WEB-RENEW-1",
        status: "submitted",
        note: "schema=mmd_web_payment_proof_v1",
      },
    }],
    renewals: [{
      id: "recRenew12345678",
      fields: {
        renewal_session_id: "liff-session-1",
        liff_intent: "renew",
        line_user_id: LINE_ID,
        renewal_flow_status: "renewal_pending_payment",
        requested_package: "standard",
        renewal_amount_thb: 799,
      },
    }],
    members: [{
      id: "recMember1234567",
      fields: {
        member_id: MEMBER_ID,
        line_id: LINE_ID,
      },
    }],
    packages: [{
      id: "recPackage123456",
      fields: { code: "standard", is_active: true, require_approval: false },
    }],
    entitlements: [{
      id: "recEntitle123456",
      fields: {
        entitlement_id: "existing-standard",
        member: ["recMember1234567"],
        member_id: MEMBER_ID,
        line_user_id: LINE_ID,
        member_status: "active",
        member_lifecycle_status: "active",
        access_status: "active",
        capability: "private_standard",
        entitlement_level: "standard_basic",
        package_code: "standard",
        start_at: "2026-01-01T00:00:00.000Z",
        expire_at: "2026-12-31T00:00:00.000Z",
        source_ref: "existing:standard",
      },
    }],
  };

  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TABLE_PAYMENTS: "payments",
    AIRTABLE_TABLE_PAYMENT_PROOFS: "proofs",
    AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS: "renewals",
    AIRTABLE_TABLE_MEMBERS: "members",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "entitlements",
    AIRTABLE_TABLE_PACKAGES: "packages",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const tableName = parts[1];
        const recordId = parts[2] || "";
        const rows = tables[tableName];
        if (!rows) return json({ error: "table_not_found" }, 404);

        if (request.method === "GET" && recordId) {
          const row = rows.find((item) => item.id === recordId);
          return row ? json(row, 200) : json({ error: "not_found" }, 404);
        }
        if (request.method === "GET") {
          const formula = url.searchParams.get("filterByFormula") || "";
          const match = /^\{([^}]+)}='((?:\\'|[^'])*)'$/.exec(formula);
          let found = rows;
          if (match) {
            const field = match[1];
            const value = match[2].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
            found = rows.filter((item) => String(item.fields?.[field] ?? "") === value);
          }
          return json({ records: found.slice(0, Number(url.searchParams.get("maxRecords") || 100)) }, 200);
        }
        if (request.method === "POST") {
          const body = await request.json();
          const created = (body.records || []).map((item) => {
            const row = { id: `recCreated${String(createCount++).padStart(8, "0")}`, fields: structuredClone(item.fields || {}) };
            rows.push(row);
            return row;
          });
          return json({ records: created }, 200);
        }
        if (request.method === "PATCH" && recordId) {
          const row = rows.find((item) => item.id === recordId);
          if (!row) return json({ error: "not_found" }, 404);
          const body = await request.json();
          row.fields = { ...row.fields, ...structuredClone(body.fields || {}) };
          return json(row, 200);
        }
        return json({ error: "method_not_allowed" }, 405);
      },
    },
  };
  return { env, tables };
}

function renewalRequest({ paymentRef = "PAY-WEB-RENEW-1" } = {}) {
  const form = new FormData();
  form.append("payment_ref", paymentRef);
  form.append("source_page", "sigil_pay");
  form.append("file", new Blob(["fake-slip"], { type: "image/png" }), "slip.png");
  return new Request("https://mmdbkk.com/v1/pay/slip/evidence", { method: "POST", body: form });
}

function slipResponse() {
  return new Response(JSON.stringify({
    ok: true,
    evidence_submitted: true,
    payment_status: "pending",
    verification_status: "pending_verification",
    payment_ref: "PAY-WEB-RENEW-1",
    proof_id: "webproof_123456",
    proof_record_id: "recProof12345678",
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function json(value, status) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("signed Standard renewal accepts slip money truth and materializes one entitlement", async () => {
  const h = harness();
  const response = await reconcileCanonicalWebRenewalProof(renewalRequest(), slipResponse(), h.env);
  const body = await response.json();

  assert.equal(body.payment_status, "paid");
  assert.equal(body.verification_status, "verified");
  assert.equal(body.entitlement_materialized, true);
  assert.equal(body.manual_membership_review_required, false);
  assert.equal(body.renewal_settlement.owner_policy, "membership_slip_simple_accept_v1");
  assert.equal(body.renewal_settlement.package_code, "standard");

  assert.equal(h.tables.payments[0].fields["Payment Status"], "paid");
  assert.equal(h.tables.payments[0].fields["Verification Status"], "verified");
  assert.equal(h.tables.proofs[0].fields.status, "verified");
  assert.equal(h.tables.renewals[0].fields.renewal_flow_status, "materialized");

  const created = h.tables.entitlements.filter((row) => String(row.fields?.source_ref || "").startsWith("payment:"));
  assert.equal(created.length, 1);
  assert.equal(created[0].fields.package_code, "standard");
  assert.equal(created[0].fields.member_id, MEMBER_ID);
  assert.equal(created[0].fields.expire_at, "2027-12-31T00:00:00.000Z");
});

test("amount/package conflict stays pending and never materializes", async () => {
  const h = harness();
  h.tables.payments[0].fields.amount_thb = 2999;
  const response = await reconcileCanonicalWebRenewalProof(renewalRequest(), slipResponse(), h.env);
  const body = await response.json();

  assert.equal(body.entitlement_materialized, false);
  assert.equal(body.manual_membership_review_required, true);
  assert.equal(body.renewal_settlement.reason, "renewal_payment_context_not_safe");
  assert.equal(h.tables.payments[0].fields["Payment Status"], "pending");
  assert.equal(h.tables.entitlements.filter((row) => String(row.fields?.source_ref || "").startsWith("payment:")).length, 0);
});

test("same accepted payment is idempotent", async () => {
  const h = harness();
  const first = await reconcileCanonicalWebRenewalProof(renewalRequest(), slipResponse(), h.env);
  assert.equal((await first.json()).entitlement_materialized, true);
  const second = await reconcileCanonicalWebRenewalProof(renewalRequest(), slipResponse(), h.env);
  const body = await second.json();
  assert.equal(body.entitlement_materialized, true);
  assert.equal(body.renewal_settlement.duplicate, true);
  assert.equal(h.tables.entitlements.filter((row) => String(row.fields?.source_ref || "").startsWith("payment:")).length, 1);
});
