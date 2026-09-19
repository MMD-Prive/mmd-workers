import test from "node:test";
import assert from "node:assert/strict";

import { handlePaymentReviewRequest } from "./src/payment-review-runtime.js";

function paymentProofEnv(record) {
  return {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "Payment Proofs",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").at(-1));
        assert.equal(table, "Payment Proofs");
        return Response.json({ records: [record] });
      },
    },
  };
}

test("review queue understands v3 nested extraction and treats a linked Session as canonical job context", async () => {
  const record = {
    id: "rec-proof-service-final",
    createdTime: "2026-09-13T10:00:00.000Z",
    fields: {
      proof_id: "line_service_final_01",
      channel: "line_ofc",
      status: "pending",
      amount_thb: 19250,
      payment_ref: "SERVICE-FINAL-REF-01",
      payer_name: "คุณเอ็ม",
      session: ["rec-session-01"],
      note: JSON.stringify({
        schema: "line_payment_evidence_v3",
        r2_key: "line-ofc/payment-proofs/2026/09/line_service_final_01/original.png",
        mime_type: "image/png",
        source_context: "direct_user_payment_followup",
        extraction: {
          method: "qr",
          confidence: 0.97,
          provider: "bank_qr",
          error: "",
        },
        payment_intelligence: {
          schema: "mmd_payment_proof_intelligence_v2",
          inferred_stage: "final",
          inferred_label: "ค่าจบงาน / ยอดคงเหลือ",
          tracking_kind: "job_final",
          confidence: 0.98,
          match_basis: "session_balance_exact",
        },
      }),
    },
  };

  const response = await handlePaymentReviewRequest(
    new Request("https://mmdbkk.com/v1/admin/payments/review-queue?limit=10"),
    paymentProofEnv(record),
    { id: "per", role: "owner" },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.items.length, 1);
  const item = payload.items[0];
  assert.equal(item.payment_stage, "final");
  assert.equal(item.tracking_kind, "job_final");
  assert.equal(item.inferred_label, "ค่าจบงาน / ยอดคงเหลือ");
  assert.equal(item.extraction_method, "qr");
  assert.equal(item.extraction_confidence, 0.97);
  assert.equal(item.match_flags.linked_session_present, true);
  assert.equal(item.context_issues.includes("customer_or_job_not_linked"), false);
  assert.deepEqual(item.context_issues, []);
  assert.equal(item.review_lane, "owner_review");
  assert.equal(item.can_approve, true);
});

test("service-stage fallback labels never fall through to a membership label", async () => {
  const record = {
    id: "rec-proof-service-deposit",
    createdTime: "2026-09-13T10:01:00.000Z",
    fields: {
      proof_id: "line_service_deposit_01",
      channel: "line_ofc",
      status: "pending",
      amount_thb: 8250,
      payment_ref: "SERVICE-DEPOSIT-REF-01",
      session: ["rec-session-02"],
      note: JSON.stringify({
        schema: "line_payment_evidence_v3",
        r2_key: "line-ofc/payment-proofs/2026/09/line_service_deposit_01/original.jpg",
        mime_type: "image/jpeg",
        extraction: { method: "ocr", confidence_score: 0.91 },
        payment_intelligence: { inferred_stage: "deposit", confidence: 0.93 },
      }),
    },
  };

  const response = await handlePaymentReviewRequest(
    new Request("https://mmdbkk.com/v1/admin/payments/review-queue?limit=10"),
    paymentProofEnv(record),
    { id: "per", role: "owner" },
  );
  const payload = await response.json();
  const item = payload.items[0];

  assert.equal(item.inferred_label, "ค่าจอง / มัดจำ");
  assert.equal(item.tracking_kind, "job_deposit");
  assert.equal(item.extraction_method, "ocr");
  assert.equal(item.extraction_confidence, 0.91);
  assert.equal(item.can_approve, true);
});
