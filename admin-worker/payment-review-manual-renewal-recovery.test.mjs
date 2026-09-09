import assert from "node:assert/strict";
import test from "node:test";

import { handlePaymentReviewRequest } from "./src/payment-review-runtime.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const PROOF_ID = "line_recovery_test_2500";
const PAYMENT_REF = "TXN-REC-001";
const MEMBER_EMAIL = "winnie@example.test";

function proof(overrides = {}) {
  return {
    id: "rec-proof-1",
    createdTime: "2026-09-07T15:16:21.000Z",
    fields: {
      proof_id: PROOF_ID,
      payment_ref: PAYMENT_REF,
      amount_thb: 2500,
      status: "pending",
      channel: "line_ofc",
      note: `MANUAL_RECOVERY|2026-09-07|Owner recovered missed direct LINE renewal slip; line_user_id ${LINE_USER_ID} / LIFF renewal session renew-001. Evidence only; official verification required.`,
      "MMD — LIFF Renewal Sessions": ["rec-renewal-1"],
      ...overrides,
    },
  };
}

function renewal(overrides = {}) {
  return {
    id: "rec-renewal-1",
    fields: {
      renewal_session_id: "renew-001",
      renewal_flow_status: "identity_linked",
      ...overrides,
    },
  };
}

function entitlement(overrides = {}) {
  return {
    id: "rec-entitlement-1",
    fields: {
      line_user_id: LINE_USER_ID,
      member_email: MEMBER_EMAIL,
      package_code: "premium",
      member: ["rec-member-1"],
      ...overrides,
    },
  };
}

function member(overrides = {}) {
  return {
    id: "rec-member-1",
    fields: {
      "Contact Email": MEMBER_EMAIL,
      "Membership Tier": "Premium",
      member_id: "winniein",
      ...overrides,
    },
  };
}

function makeHarness({
  proofRecord = proof(),
  renewalRecord = renewal(),
  entitlementRows = [entitlement()],
  memberRecord = member(),
} = {}) {
  const tables = {
    "MMD — Payment Proofs": [structuredClone(proofRecord)],
    Payments: [],
    "MMD — LIFF Renewal Sessions": [structuredClone(renewalRecord)],
    "MMD — Member Entitlements": structuredClone(entitlementRows),
    Members: [structuredClone(memberRecord)],
    Clients: [],
    "System — Access Log": [],
  };
  const writes = [];
  const handoffs = [];

  const airtableFetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const tail = parts.at(-1) || "";
    const maybeTable = parts.at(-2) || "";
    const table = Object.prototype.hasOwnProperty.call(tables, tail) ? tail : maybeTable;
    const recordId = table === maybeTable ? tail : "";
    const rows = tables[table];
    if (!rows) return Response.json({ error: "table_not_found", table }, { status: 404 });

    if (request.method === "GET" && recordId) {
      const row = rows.find((candidate) => candidate.id === recordId);
      return row ? Response.json(row) : Response.json({ error: "not_found" }, { status: 404 });
    }

    if (request.method === "GET") {
      const formula = url.searchParams.get("filterByFormula") || "";
      let found = rows;
      const proofId = extractFormulaValue(formula, "proof_id");
      const paymentRef = extractFormulaValue(formula, "payment_ref") || extractFormulaValue(formula, "Payment Reference");
      const lineUserId = extractFormulaValue(formula, "line_user_id");
      const memberId = extractFormulaValue(formula, "member_id");
      const email = extractLowerFormulaValue(formula, "Contact Email") || extractLowerFormulaValue(formula, "email");
      const action = extractFormulaValue(formula, "Action");
      const sourceRef = extractFormulaValue(formula, "Source Ref");

      if (proofId) found = found.filter((row) => row.fields?.proof_id === proofId);
      if (paymentRef) found = found.filter((row) => (row.fields?.payment_ref || row.fields?.["Payment Reference"]) === paymentRef);
      if (lineUserId) found = found.filter((row) => row.fields?.line_user_id === lineUserId);
      if (memberId) found = found.filter((row) => row.fields?.member_id === memberId);
      if (email) found = found.filter((row) => String(row.fields?.["Contact Email"] || row.fields?.email || "").toLowerCase() === email);
      if (action) found = found.filter((row) => row.fields?.Action === action);
      if (sourceRef) found = found.filter((row) => row.fields?.["Source Ref"] === sourceRef);
      return Response.json({ records: found });
    }

    if (request.method === "POST") {
      const body = await request.json();
      const created = (body.records || []).map((entry, index) => ({
        id: `rec-created-${table.replace(/\W+/g, "-")}-${rows.length + index + 1}`,
        fields: structuredClone(entry.fields || {}),
      }));
      rows.push(...created);
      writes.push({ table, records: structuredClone(created) });
      return Response.json({ records: created }, { status: 201 });
    }

    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  };

  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_HTTP: { fetch: airtableFetch },
    AIRTABLE_TABLE_PAYMENT_PROOFS: "MMD — Payment Proofs",
    AIRTABLE_TABLE_PAYMENTS_ID: "Payments",
    AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID: "MMD — LIFF Renewal Sessions",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID: "MMD — Member Entitlements",
    AIRTABLE_TABLE_MEMBERS_ID: "Members",
    AIRTABLE_TABLE_CLIENTS_ID: "Clients",
    AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    PAYMENTS_BASE_URL: "https://payments.example.test",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "admin-to-payments-test",
  };

  const externalFetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.url === "https://payments.example.test/v1/internal/payments/reviewed-proof") {
      assert.equal(request.headers.get("authorization"), "Bearer admin-to-payments-test");
      const body = await request.json();
      handoffs.push(body);
      return Response.json({
        ok: true,
        payment_ref: body.payment_ref,
        payment_stage: body.payment_stage,
        duplicate: false,
      });
    }
    throw new Error(`Unexpected external fetch: ${request.method} ${request.url}`);
  };

  return { env, tables, writes, handoffs, externalFetch };
}

function reviewRequest(idempotencyKey = "manual-recovery-test-001") {
  return new Request("https://mmdbkk.com/v1/admin/payments/review", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      decision: "approve",
      proof_id: PROOF_ID,
      admin_reason: "Owner reviewed recovered LINE renewal evidence",
    }),
  });
}

function extractFormulaValue(formula, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\{${escaped}\\}='([^']+)'`, "i").exec(formula)?.[1] || "";
}

function extractLowerFormulaValue(formula, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`LOWER\\(\\{${escaped}\\}\\)='([^']+)'`, "i").exec(formula)?.[1] || "";
}

async function withExternalFetch(harness, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = harness.externalFetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = previous;
  }
}

test("owner/admin can approve a linked manual LINE renewal recovery without a pre-existing Payment record", async () => {
  const h = makeHarness();
  const response = await withExternalFetch(h, () => handlePaymentReviewRequest(
    reviewRequest(),
    h.env,
    { id: "per", role: "admin" }
  ));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.authority, "payments-worker");
  assert.equal(body.context_source, "liff_renewal_recovery");
  assert.equal(body.recovery_context, true);
  assert.equal(body.money_truth_changed, true);
  assert.equal(h.handoffs.length, 1);
  assert.deepEqual(
    {
      payment_ref: h.handoffs[0].payment_ref,
      amount_thb: h.handoffs[0].amount_thb,
      payment_stage: h.handoffs[0].payment_stage,
      member_email: h.handoffs[0].member_email,
      package_code: h.handoffs[0].package_code,
      renewal_session_id: h.handoffs[0].renewal_session_id,
    },
    {
      payment_ref: PAYMENT_REF,
      amount_thb: 2500,
      payment_stage: "membership",
      member_email: MEMBER_EMAIL,
      package_code: "premium",
      renewal_session_id: "renew-001",
    }
  );
  assert.equal(h.tables.Payments.length, 0, "admin-worker must not create Money Truth directly");
  assert.equal(h.writes.some((write) => write.table === "Payments"), false);
  assert.equal(h.tables["System — Access Log"].length, 1);
});

test("manual renewal recovery refuses a non-owner/non-admin reviewer", async () => {
  const h = makeHarness();
  const response = await withExternalFetch(h, () => handlePaymentReviewRequest(
    reviewRequest("manual-recovery-test-reviewer"),
    h.env,
    { id: "reviewer-1", role: "reviewer" }
  ));
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "manual_recovery_requires_owner_admin");
  assert.equal(h.handoffs.length, 0);
  assert.equal(h.tables.Payments.length, 0);
});

test("manual renewal recovery fails closed when LINE entitlement evidence points to multiple canonical members", async () => {
  const h = makeHarness({
    entitlementRows: [
      entitlement(),
      entitlement({ member_email: "other@example.test", member: ["rec-member-2"] }),
    ],
  });
  const response = await withExternalFetch(h, () => handlePaymentReviewRequest(
    reviewRequest("manual-recovery-test-ambiguous"),
    h.env,
    { id: "per", role: "owner" }
  ));
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, "canonical_member_context_ambiguous");
  assert.equal(h.handoffs.length, 0);
  assert.equal(h.tables.Payments.length, 0);
});
