import assert from "node:assert/strict";
import test from "node:test";

import { LINE_GROUP_INGRESS_INTERNALS } from "../src/line-group-ingress-front-gate.js";
import { classifyPaymentImageEvidence, inferServicePaymentPurpose } from "../src/payment-proof-intelligence.mjs";

const {
  alertsOpsThreadId,
  hasPaymentContext,
  hasPaymentFollowupContext,
  captureDirectUserImageEvidence,
  membershipOpsThreadId,
  notifyPaymentProofOps,
  paymentOpsThreadId,
  promoteDirectUserCandidate,
  resolveDirectPayerContext,
} = LINE_GROUP_INGRESS_INTERNALS;

function memoryR2() {
  const store = new Map();
  return {
    async put(key, value, options = {}) { store.set(key, { value, options }); },
    async get(key) {
      const found = store.get(key);
      if (!found) return null;
      return { async text() { return typeof found.value === "string" ? found.value : new TextDecoder().decode(found.value); } };
    },
    async head(key) { return store.has(key) ? {} : null; },
    async delete(key) { store.delete(key); },
    store,
  };
}

function telegramHarness(extra = {}) {
  const messages = [];
  return {
    messages,
    env: {
      AUTH_SERVICE_LINE_TO_TELEGRAM: "test-token",
      TELEGRAM_OPS_CHAT_ID: "-1003546439681",
      TELEGRAM_WORKER: { async fetch(request) { messages.push(await request.json()); return Response.json({ ok: true }); } },
      ...extra,
    },
  };
}

test("payment context recognizes renewal and transfer language", () => {
  for (const text of ["ต่ออายุสมาชิก", "โอนแล้ว", "ส่งสลิป", "payment proof", "renewal", "bank transfer"]) assert.equal(hasPaymentContext(text), true, text);
  assert.equal(hasPaymentContext("ขอดู profile หน่อย"), false);
});

test("payment follow-up recognizes access and Drive after payment image", () => {
  for (const text of ["ขอเข้ากลุ่มครับ", "แล้ว access", "Drive", "เข้าแล้วนะ", "โอนแล้ว"]) assert.equal(hasPaymentFollowupContext(text), true, text);
  assert.equal(hasPaymentFollowupContext("วันนี้ว่างไหม"), false);
});

test("visual gate rejects ordinary images with no transaction evidence", () => {
  assert.deepEqual(classifyPaymentImageEvidence({ extraction_method: "ocr", confidence_score: 0 }), {
    image_class: "non_payment_image",
    gate: "reject",
    is_payment_evidence: false,
    confidence: 0.92,
    reason: "no_transaction_evidence_detected",
  });
});

test("visual gate rejects payment-request QR without proof of completed transfer", () => {
  const result = classifyPaymentImageEvidence({ extraction_method: "qr", amount_thb: 1999, provider: "promptpay", confidence_score: 0.55 });
  assert.equal(result.image_class, "payment_qr_request");
  assert.equal(result.gate, "reject");
  assert.equal(result.is_payment_evidence, false);
});

test("visual gate accepts bank slip only with strong transaction evidence", () => {
  const result = classifyPaymentImageEvidence({ extraction_method: "ocr", amount_thb: 1999, payment_ref: "TXN123456789", paid_at: "2026-09-13T12:00:00+07:00", provider: "bank_transfer", confidence_score: 0.89 });
  assert.equal(result.image_class, "bank_transfer_slip");
  assert.equal(result.gate, "accept");
  assert.equal(result.is_payment_evidence, true);
});

test("service purpose infers final payment from exact balance due", () => {
  const result = inferServicePaymentPurpose({
    amount_thb: 19250,
    sessions: [{ id: "rec-session", fields: { session_id: "EMs22", job_id: "job-22", final_price_thb: 27500, balance_due_calc: 19250, paid_received_sum: 8250, session_state: "confirmed" } }],
  });
  assert.equal(result.inferred_stage, "final");
  assert.equal(result.inferred_label, "ค่าจบงาน / ยอดคงเหลือ");
  assert.equal(result.session_record_id, "rec-session");
  assert.ok(result.confidence >= 0.98);
});

test("service purpose infers booking deposit from known ratio", () => {
  const result = inferServicePaymentPurpose({
    amount_thb: 8250,
    sessions: [{ id: "rec-session", fields: { session_id: "EMs22", final_price_thb: 27500, paid_received_sum: 0, session_state: "pending" } }],
  });
  assert.equal(result.inferred_stage, "deposit");
  assert.equal(result.inferred_label, "ค่าจอง / มัดจำ");
  assert.equal(result.match_basis, "deposit_ratio_30");
});

test("service purpose fails closed when two sessions match equally", () => {
  const sessions = [
    { id: "rec-a", fields: { session_id: "A", balance_due_calc: 1000, session_state: "confirmed" } },
    { id: "rec-b", fields: { session_id: "B", balance_due_calc: 1000, session_state: "confirmed" } },
  ];
  const result = inferServicePaymentPurpose({ amount_thb: 1000, sessions });
  assert.equal(result.inferred_stage, "unknown");
  assert.equal(result.ambiguous, true);
});

test("Telegram payment topic helpers keep Membership, Confirm and Alerts separate", () => {
  assert.equal(membershipOpsThreadId({}), 20);
  assert.equal(paymentOpsThreadId({}), 21);
  assert.equal(alertsOpsThreadId({}), 9);
  assert.equal(membershipOpsThreadId({ TELEGRAM_MEMBERSHIP_THREAD_ID: "120" }), 120);
  assert.equal(paymentOpsThreadId({ TELEGRAM_PAYMENT_THREAD_ID: "121" }), 121);
  assert.equal(alertsOpsThreadId({ TELEGRAM_ALERTS_THREAD_ID: "109" }), 109);
});

test("LINE membership or renewal proof routes to Membership topic 20", async () => {
  const h = telegramHarness();
  const result = await notifyPaymentProofOps(h.env, { proofId: "line_membership_1", sourceType: "user", sourceContext: "direct_user_payment_followup", paymentContextText: "ต่ออายุสมาชิก Premium ครับ โอนแล้ว" }, { deduped: false });
  assert.equal(result.sent, true);
  assert.equal(result.topic, "membership");
  assert.equal(result.thread_id, 20);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].flow, "membership");
  assert.equal(h.messages[0].message_thread_id, 20);
  assert.match(h.messages[0].text, /Membership Payment Proof/);
});

test("LINE generic transfer proof stays in Payments Confirm topic 21", async () => {
  const h = telegramHarness();
  const result = await notifyPaymentProofOps(h.env, { proofId: "line_payment_1", sourceType: "user", sourceContext: "direct_user_payment_followup", paymentContextText: "โอนแล้วครับ ส่งสลิปให้" }, { deduped: false });
  assert.equal(result.topic, "payment");
  assert.equal(result.thread_id, 21);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].flow, "payment_proof");
  assert.equal(h.messages[0].message_thread_id, 21);
});

test("LINE conflicting membership/service wording stays in Confirm and also raises Alerts", async () => {
  const h = telegramHarness();
  const result = await notifyPaymentProofOps(h.env, { proofId: "line_conflict_1", sourceType: "user", sourceContext: "direct_user_payment_followup", paymentContextText: "ค่าสมาชิก Premium แต่ยอดนี้เป็นมัดจำงาน" }, { deduped: false });
  assert.equal(result.topic, "payment");
  assert.equal(result.thread_id, 21);
  assert.equal(result.alert_sent, true);
  assert.equal(h.messages.length, 2);
  assert.equal(h.messages[0].message_thread_id, 21);
  assert.equal(h.messages[1].flow, "alert");
  assert.equal(h.messages[1].message_thread_id, 9);
});

test("direct image becomes bounded candidate when recent payment context is absent", async () => {
  const r2 = memoryR2();
  const env = { LINE_SLIP_EVIDENCE: r2, AIRTABLE_BASE_ID: "appTestBase000001", AIRTABLE_API_KEY: "token" };
  const event = { type: "message", timestamp: Date.now(), webhookEventId: "evt-1", source: { type: "user", userId: "U123" }, message: { type: "image", id: "img-1" } };
  const result = await captureDirectUserImageEvidence(env, event, { recentPaymentContext: false });
  assert.equal(result.candidate, true);
  assert.equal(result.captured, false);
  assert.equal(result.reason, "awaiting_payment_followup");
  assert.equal(r2.store.size, 1);
});

test("non-payment follow-up does not promote a direct image candidate", async () => {
  const r2 = memoryR2();
  const env = { LINE_SLIP_EVIDENCE: r2 };
  const result = await promoteDirectUserCandidate(env, { type: "message", source: { type: "user", userId: "U123" }, message: { type: "text", text: "วันนี้ว่างไหม" } });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "followup_not_payment_related");
});

test("direct payment evidence resolves the canonical client name without storing a raw LINE id in the proof", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.match(decodeURIComponent(url.pathname), /tblVv58TCbwh5j1fS$/);
    assert.match(url.searchParams.get("filterByFormula") || "", /line_user_id/);
    return Response.json({ records: [{ id: "rec-client", fields: { "Client Name": "คุณเอ็ม" } }] });
  };
  try {
    const result = await resolveDirectPayerContext({ AIRTABLE_BASE_ID: "appTestBase000001", AIRTABLE_API_KEY: "token", AIRTABLE_TABLE_CLIENTS_ID: "tblVv58TCbwh5j1fS" }, "U1234567890abcdef");
    assert.deepEqual(result, { payerName: "คุณเอ็ม", identityMatch: "exact_clients_line_user_id" });
    assert.equal(JSON.stringify(result).includes("U1234567890abcdef"), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
