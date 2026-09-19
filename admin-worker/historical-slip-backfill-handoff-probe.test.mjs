import test from "node:test";
import assert from "node:assert/strict";

import { handleHistoricalSlipBackfillRequest } from "./src/historical-slip-backfill-runtime.js";

test("validate_handoff reaches payments-worker but cannot mutate Money Truth", async () => {
  const originalFetch = globalThis.fetch;
  const evidenceSha256 = "a".repeat(64);
  const proofId = "hist_controlled_handoff_probe";
  const proof = {
    id: "recProofSmoke",
    fields: {
      proof_id: proofId,
      status: "pending",
      note: JSON.stringify({
        schema: "mmd_historical_slip_backfill_v1",
        source_type: "line_archive",
        source_ref: "github-actions-controlled-smoke:test",
        evidence_sha256: evidenceSha256,
        extraction: {},
        explicit_context: {},
        review_state: "pending",
        review_required: true,
      }),
    },
  };
  const calls = { airtableWrites: 0, payments: 0 };

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.startsWith("https://api.airtable.com/v0/")) {
      if (method !== "GET") calls.airtableWrites += 1;
      return Response.json({ records: [proof] }, { status: 200 });
    }
    if (url === "https://payments.test/v1/internal/payments/historical-slip/reviewed") {
      calls.payments += 1;
      assert.equal(init.headers.Authorization, "Bearer admin-to-payments-secret");
      const body = JSON.parse(init.body);
      assert.equal(body.proof_id, proofId);
      assert.notEqual(body.evidence_sha256, evidenceSha256);
      assert.match(body.evidence_sha256, /^[a-f0-9]{64}$/);
      return Response.json(
        { ok: false, error: "historical_proof_sha_mismatch", authority: "payments-worker" },
        { status: 409 },
      );
    }
    throw new Error("unexpected fetch " + method + " " + url);
  };

  try {
    const response = await handleHistoricalSlipBackfillRequest(
      new Request("https://mmdbkk.com/v1/admin/payments/historical-backfill/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof_id: proofId,
          decision: "validate_handoff",
          review_reason: "controlled handoff contract test",
        }),
      }),
      {
        AIRTABLE_BASE_ID: "app-test",
        AIRTABLE_API_KEY: "airtable-test",
        AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "tbl-test",
        PAYMENTS_BASE_URL: "https://payments.test",
        AUTH_SERVICE_ADMIN_TO_PAYMENTS: "admin-to-payments-secret",
      },
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.state, "pending");
    assert.equal(payload.handoff_validated, true);
    assert.equal(payload.expected_rejection, "historical_proof_sha_mismatch");
    assert.equal(payload.money_truth_mutated, false);
    assert.equal(payload.guardrails?.may_mark_paid, false);
    assert.equal(calls.payments, 1);
    assert.equal(calls.airtableWrites, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
