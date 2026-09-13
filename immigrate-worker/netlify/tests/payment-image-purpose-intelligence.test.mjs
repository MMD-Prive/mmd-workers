import test from "node:test";
import assert from "node:assert/strict";
import { classifyPaymentImageEvidence, inferServicePaymentPurpose } from "../functions/line-payment-slip-intake.mjs";

const fakeImage = { mimeType: "image/jpeg", body: Buffer.from("fake") };

function fakeFetch(payload) {
  return async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

test("visual gate rejects a model/profile photo even after payment chat context", async () => {
  const result = await classifyPaymentImageEvidence({
    env: { LINE_SLIP_IMAGE_CLASSIFIER_URL: "https://classifier.invalid" },
    image: fakeImage,
    extraction: { amount_thb: null, payment_ref: "", paid_at: "", confidence_score: 0 },
    fetchImpl: fakeFetch({ image_class: "model_profile_photo", confidence: 0.99 }),
  });
  assert.equal(result.is_payment_evidence, false);
  assert.equal(result.gate, "reject");
  assert.equal(result.image_class, "model_profile_photo");
});

test("visual gate rejects payment-request QR without a completed transfer reference", async () => {
  const result = await classifyPaymentImageEvidence({
    env: { LINE_SLIP_IMAGE_CLASSIFIER_URL: "https://classifier.invalid" },
    image: fakeImage,
    extraction: { amount_thb: 1999, payment_ref: "", paid_at: "", confidence_score: 0.8 },
    fetchImpl: fakeFetch({ image_class: "payment_qr_request", confidence: 0.98 }),
  });
  assert.equal(result.is_payment_evidence, false);
  assert.equal(result.reason, "payment_request_not_transfer");
});

test("visual gate accepts transaction evidence with reference and amount", async () => {
  const result = await classifyPaymentImageEvidence({
    env: {},
    image: fakeImage,
    extraction: { amount_thb: 1999, payment_ref: "TXN-123", paid_at: "2026-09-12T19:23:00+07:00", confidence_score: 0.91 },
  });
  assert.equal(result.is_payment_evidence, true);
  assert.equal(result.image_class, "bank_transfer_slip");
});

test("empty OCR/QR evidence is held out of the payment queue", async () => {
  const result = await classifyPaymentImageEvidence({
    env: {},
    image: fakeImage,
    extraction: { amount_thb: null, payment_ref: "", paid_at: "", payer_name: "", confidence_score: 0 },
  });
  assert.equal(result.is_payment_evidence, false);
  assert.equal(result.gate, "hold");
});

test("service purpose matches final payment from session balance", () => {
  const purpose = inferServicePaymentPurpose({
    amount_thb: 19250,
    sessions: [{ id: "rec_session", fields: { session_id: "SES-22", job_id: "JOB-22", "Total Amount": 27500, balance_due_calc: 19250, paid_received_sum: 8250, session_state: "confirmed" } }],
  });
  assert.equal(purpose.inferred_stage, "final");
  assert.equal(purpose.inferred_label, "ค่าจบงาน / ยอดคงเหลือ");
  assert.equal(purpose.session_record_id, "rec_session");
});

test("service purpose recognizes common booking deposit ratio", () => {
  const purpose = inferServicePaymentPurpose({
    amount_thb: 8250,
    sessions: [{ id: "rec_session", fields: { session_id: "SES-22", "Total Amount": 27500, paid_received_sum: 0, session_state: "pending" } }],
  });
  assert.equal(purpose.inferred_stage, "deposit");
  assert.equal(purpose.inferred_label, "ค่าจอง / มัดจำ");
});

test("multiple equally plausible sessions fail closed as ambiguous", () => {
  const purpose = inferServicePaymentPurpose({
    amount_thb: 5000,
    sessions: [
      { id: "rec_a", fields: { session_id: "A", balance_due_calc: 5000 } },
      { id: "rec_b", fields: { session_id: "B", balance_due_calc: 5000 } },
    ],
  });
  assert.equal(purpose.inferred_stage, "unknown");
  assert.equal(purpose.ambiguous, true);
});
