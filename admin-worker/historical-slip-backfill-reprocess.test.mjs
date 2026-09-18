import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { handleHistoricalSlipBackfillRequest } from "./src/historical-slip-backfill-runtime.js";

const PROOF_ID = "hist_27e486711c103e44c03329f5";
const PROOF_RECORD_ID = "recProofChampSimba";
const SESSION_RECORD_ID = "recSessionChampSimba";
const EVIDENCE_KEY = `line-ofc/payment-proofs/2026/09/${PROOF_ID}/original.png`;
const EVIDENCE_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const EVIDENCE_SHA256 = createHash("sha256").update(EVIDENCE_BYTES).digest("hex");

function makeState({ evidenceSha256 = EVIDENCE_SHA256, status = "pending", reviewState = "pending" } = {}) {
  const calls = { creates: 0, patches: [], extractor: 0, r2Gets: 0 };
  const proof = {
    id: PROOF_RECORD_ID,
    fields: {
      proof_id: PROOF_ID,
      status,
      session: [SESSION_RECORD_ID],
      note: JSON.stringify({
        schema: "mmd_historical_slip_backfill_v1",
        source_type: "line_album",
        source_ref: "LINE OFC · champ · Simba · 18 Sep 2026",
        evidence_sha256: evidenceSha256,
        r2_key: EVIDENCE_KEY,
        mime_type: "image/png",
        extraction: {
          extraction_method: "none",
          confidence_score: 0,
          extraction_error: "qr_private_extractor_failed_401,ocr_private_extractor_failed_401",
        },
        explicit_context: {
          session_id: "session-champ-simba",
          payment_stage: "final",
        },
        match: { session: SESSION_RECORD_ID, ambiguous: false },
        review_required: true,
        review_state: reviewState,
        payments_worker_handoff: {
          proof_id: PROOF_ID,
          session_id: "session-champ-simba",
          payment_stage: "final",
          state: "pending",
        },
      }),
    },
  };

  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "Payment Proofs",
    AIRTABLE_TABLE_PAYMENTS_ID: "Payments",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    AIRTABLE_TABLE_MEMBERS_ID: "Members",
    AIRTABLE_TABLE_CLIENTS_ID: "Clients",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const table = parts[2];
        const recordId = parts[3] || "";
        if (request.method === "GET" && table === "Payment Proofs" && !recordId) {
          return Response.json({ records: [proof] });
        }
        if (request.method === "GET" && table === "Sessions") {
          return Response.json({ records: [{ id: SESSION_RECORD_ID, fields: { session_id: "session-champ-simba" } }] });
        }
        if (request.method === "GET" && ["Payments", "Members", "Clients"].includes(table)) {
          return Response.json({ records: [] });
        }
        if (request.method === "POST") {
          calls.creates += 1;
          throw new Error("reprocess_must_never_create_airtable_record");
        }
        if (request.method === "PATCH" && table === "Payment Proofs" && recordId === PROOF_RECORD_ID) {
          const body = await request.json();
          calls.patches.push(body.fields);
          return Response.json({ id: PROOF_RECORD_ID, fields: { ...proof.fields, ...body.fields } });
        }
        throw new Error(`Unexpected Airtable call: ${request.method} ${url.pathname}`);
      },
    },
    LINE_SLIP_EVIDENCE: {
      async get(key) {
        calls.r2Gets += 1;
        assert.equal(key, EVIDENCE_KEY);
        return {
          size: EVIDENCE_BYTES.byteLength,
          httpMetadata: { contentType: "image/png" },
          async arrayBuffer() {
            return EVIDENCE_BYTES.buffer.slice(
              EVIDENCE_BYTES.byteOffset,
              EVIDENCE_BYTES.byteOffset + EVIDENCE_BYTES.byteLength,
            );
          },
        };
      },
    },
    SLIP_EXTRACTOR: {
      async fetch(request) {
        calls.extractor += 1;
        assert.equal(new URL(request.url).pathname, "/v1/extract/qr");
        assert.equal(request.headers.get("x-mmd-internal-call"), "true");
        assert.equal(request.headers.get("x-mmd-service-binding"), "admin-worker");
        return Response.json({
          result: {
            payment_ref: "016261212049AOR09688",
            amount_thb: 10500,
            paid_at: "2026-09-18T21:20:00+07:00",
            payer_name: "champ",
            provider: "bank_qr",
            confidence_score: 0.99,
          },
        });
      },
    },
  };
  return { env, calls };
}

function reprocessRequest() {
  return new Request("https://mmdbkk.com/v1/admin/payments/historical-backfill/reprocess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proof_id: PROOF_ID }),
  });
}

test("reprocess verifies original R2 evidence and patches the same pending proof only", async () => {
  const state = makeState();
  const response = await handleHistoricalSlipBackfillRequest(reprocessRequest(), state.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.created, false);
  assert.equal(payload.proof_id, PROOF_ID);
  assert.equal(payload.proof_record_id, PROOF_RECORD_ID);
  assert.equal(payload.status, "pending");
  assert.equal(payload.state, "pending");
  assert.equal(payload.review_state, "pending");
  assert.equal(payload.amount_thb, 10500);
  assert.equal(payload.payment_stage, "final");
  assert.equal(payload.extraction_method, "qr");
  assert.equal(payload.extraction_error, "");
  assert.equal(payload.payment_ref_masked, "0162…9688");
  assert.equal(payload.evidence_sha256_verified, true);
  assert.equal(payload.money_truth_mutated, false);
  assert.equal(payload.guardrails?.may_mark_paid, false);
  assert.equal(payload.guardrails?.may_award_points, false);

  assert.equal(state.calls.r2Gets, 1);
  assert.equal(state.calls.extractor, 1);
  assert.equal(state.calls.creates, 0);
  assert.equal(state.calls.patches.length, 1);
  const patch = state.calls.patches[0];
  assert.equal(patch.status, "pending");
  assert.equal(patch.payment_ref, "016261212049AOR09688");
  assert.equal(patch.amount_thb, 10500);
  assert.deepEqual(patch.session, [SESSION_RECORD_ID]);
  const note = JSON.parse(patch.note);
  assert.equal(note.review_state, "pending");
  assert.equal(note.reprocess_count, 1);
  assert.equal(note.reprocess_previous_error, "qr_private_extractor_failed_401,ocr_private_extractor_failed_401");
  assert.equal(note.extraction.payment_ref, "016261212049AOR09688");
  assert.equal(note.extraction.amount_thb, 10500);
  assert.equal(note.extraction.extraction_error, null);
  assert.equal(note.payments_worker_handoff.state, "pending");
  assert.equal(note.payments_worker_handoff.may_mark_paid, false);
});

test("reprocess rejects an R2 SHA mismatch before extraction or Airtable writes", async () => {
  const state = makeState({ evidenceSha256: "0".repeat(64) });
  const response = await handleHistoricalSlipBackfillRequest(reprocessRequest(), state.env);
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.ok, false);
  assert.equal(payload.error, "historical_evidence_sha_mismatch");
  assert.equal(state.calls.r2Gets, 1);
  assert.equal(state.calls.extractor, 0);
  assert.equal(state.calls.creates, 0);
  assert.equal(state.calls.patches.length, 0);
});
