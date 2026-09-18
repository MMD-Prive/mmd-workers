import test from "node:test";
import assert from "node:assert/strict";

import { handleHistoricalSlipBackfillRequest } from "./src/historical-slip-backfill-runtime.js";

function makeEnv({ withExtractor = true, withStorage = true } = {}) {
  const createdProofs = [];
  const extractorCalls = [];
  const r2Writes = [];
  const r2Deletes = [];

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
        const parts = url.pathname.split("/").filter(Boolean);
        const table = decodeURIComponent(parts.at(-1));
        if (request.method === "GET") {
          if (["Payment Proofs", "Payments", "Sessions", "Members", "Clients"].includes(table)) {
            return Response.json({ records: [] });
          }
        }
        if (request.method === "POST" && table === "Payment Proofs") {
          const body = await request.json();
          const record = { id: "rec-historical-1", fields: body.fields, createdTime: "2026-09-13T10:00:00.000Z" };
          createdProofs.push(record);
          return Response.json(record, { status: 201 });
        }
        throw new Error(`Unexpected Airtable call: ${request.method} ${url.pathname}`);
      },
    },
  };

  if (withExtractor) {
    env.SLIP_EXTRACTOR = {
      async fetch(request) {
        extractorCalls.push({
          url: request.url,
          internal: request.headers.get("x-mmd-internal-call"),
          binding: request.headers.get("x-mmd-service-binding"),
          type: request.headers.get("content-type"),
          length: request.headers.get("content-length"),
        });
        assert.equal(new URL(request.url).pathname, "/v1/extract/qr");
        return Response.json({
          result: {
            payment_ref: "HIST-PRIVATE-REF-01",
            amount_thb: 1999,
            paid_at: "2026-09-12T12:30:00+07:00",
            payer_name: "Historical Test",
            provider: "bank_qr",
            confidence_score: 0.99,
          },
        });
      },
    };
  }

  if (withStorage) {
    env.LINE_SLIP_EVIDENCE = {
      async put(key, bytes, options) {
        r2Writes.push({ key, bytes: new Uint8Array(bytes), options });
      },
      async delete(key) {
        r2Deletes.push(key);
      },
    };
  }

  return { env, createdProofs, extractorCalls, r2Writes, r2Deletes };
}

function intakeRequest({ sourceType = "line_archive", sourceRef = "line-archive:test-001" } = {}) {
  const form = new FormData();
  form.set("source_type", sourceType);
  form.set("source_ref", sourceRef);
  form.set("file", new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "image/png" }), "old-slip.png");
  return new Request("https://mmdbkk.com/v1/admin/payments/historical-backfill/intake", {
    method: "POST",
    body: form,
  });
}

test("historical intake uses the private production extractor and stores the original in private R2", async () => {
  const state = makeEnv();
  const response = await handleHistoricalSlipBackfillRequest(intakeRequest(), state.env);
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.ok, true);
  assert.equal(payload.duplicate, false);
  assert.match(payload.proof_id, /^hist_[a-f0-9]{24}$/);
  assert.match(payload.evidence_preview_url, /^\/v1\/admin\/payments\/evidence\?proof_id=hist_/);

  assert.equal(state.extractorCalls.length, 1);
  assert.equal(state.extractorCalls[0].internal, "true");
  assert.equal(state.extractorCalls[0].binding, "admin-worker");
  assert.equal(state.extractorCalls[0].type, "image/png");
  assert.equal(state.extractorCalls[0].length, "5");

  assert.equal(state.r2Writes.length, 1);
  const evidence = state.r2Writes[0];
  assert.match(evidence.key, /^line-ofc\/payment-proofs\/\d{4}\/\d{2}\/hist_[a-f0-9]{24}\/original\.png$/);
  assert.deepEqual([...evidence.bytes], [1, 2, 3, 4, 5]);
  assert.equal(evidence.options.httpMetadata.contentType, "image/png");
  assert.equal(evidence.options.customMetadata.provenance, "historical_slip_backfill");
  assert.match(evidence.options.customMetadata.evidence_sha256, /^[a-f0-9]{64}$/);

  assert.equal(state.createdProofs.length, 1);
  const note = JSON.parse(state.createdProofs[0].fields.note);
  assert.equal(note.schema, "mmd_historical_slip_backfill_v1");
  assert.equal(note.r2_key, evidence.key);
  assert.equal(note.extraction.payment_ref, "HIST-PRIVATE-REF-01");
  assert.equal(note.extraction.amount_thb, 1999);
  assert.equal(note.extraction.extraction_method, "qr");
});

test("historical intake fails closed when the private extractor binding is missing", async () => {
  const state = makeEnv({ withExtractor: false, withStorage: true });
  const response = await handleHistoricalSlipBackfillRequest(intakeRequest(), state.env);
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error, "private_extractor_binding_missing");
  assert.match(payload.trace_id, /^historical-[0-9a-f-]{36}$/);
  assert.equal(state.createdProofs.length, 0);
  assert.equal(state.r2Writes.length, 0);
});

test("historical intake fails closed when private R2 evidence storage is missing", async () => {
  const state = makeEnv({ withExtractor: true, withStorage: false });
  const response = await handleHistoricalSlipBackfillRequest(intakeRequest(), state.env);
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error, "historical_evidence_storage_unavailable");
  assert.match(payload.trace_id, /^historical-[0-9a-f-]{36}$/);
  assert.equal(state.createdProofs.length, 0);
  assert.equal(state.extractorCalls.length, 0);
});

test("historical intake accepts the documented LINE group album source and preserves Unicode context", async () => {
  const state = makeEnv();
  const sourceRef = "LINE OFC · champ · Simba · 18 Sep 2026";
  const response = await handleHistoricalSlipBackfillRequest(intakeRequest({
    sourceType: "line_group_album",
    sourceRef,
  }), state.env);
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.ok, true);
  assert.equal(state.r2Writes.length, 1);
  assert.equal(state.r2Writes[0].options.customMetadata.source_type, "line_album");
  assert.equal(state.r2Writes[0].options.customMetadata.source_ref, sourceRef);
  assert.equal(state.createdProofs.length, 1);
  const note = JSON.parse(state.createdProofs[0].fields.note);
  assert.equal(note.source_type, "line_album");
  assert.equal(note.source_ref, sourceRef);
});
