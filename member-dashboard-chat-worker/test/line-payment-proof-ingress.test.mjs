import assert from "node:assert/strict";
import test from "node:test";

import lineIngressWorker, { LINE_GROUP_INGRESS_INTERNALS } from "../src/line-group-ingress-front-gate.js";
import { analyzeProductionPaymentProof, classifyPaymentImageEvidence, inferServicePaymentPurpose, paymentTrackingKind, servicePaymentCandidates } from "../src/payment-proof-intelligence.mjs";

const {
  alertsOpsThreadId,
  acknowledgeDirectSlipResult,
  hasPaymentContext,
  hasPaymentFollowupContext,
  captureDirectUserImageEvidence,
  membershipOpsThreadId,
  notifyPaymentProofOps,
  notifyDirectCustomerPaymentEvidence,
  observeSignedLineEvents,
  buildDirectPaymentAcknowledgement,
  buildHypeOwnerProblemAlert,
  notifyOwnerBankDetailReady,
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

async function lineSignature(body, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, encoder.encode(body))).toString("base64");
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

test("visual gate routes bank account detail outside payment proof", () => {
  assert.deepEqual(classifyPaymentImageEvidence({
    extraction_method: "ocr",
    account_number: "123-4-56789-0",
    account_name: "นาย ทดสอบ ระบบ",
    account_bank: "กสิกรไทย",
    confidence_score: 0.92,
  }), {
    image_class: "bank_account_detail",
    gate: "reject",
    is_payment_evidence: false,
    confidence: 0.96,
    reason: "bank_account_detail_not_payment_proof",
  });
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

test("production LINE analyzer defaults QR and OCR extraction off", async () => {
  let calls = 0;
  const result = await analyzeProductionPaymentProof({
    env: { SLIP_EXTRACTOR: { async fetch() { calls += 1; throw new Error("must_not_extract"); } } },
    image: { body: new Uint8Array([1]), mimeType: "image/png", byteSize: 1 },
  });
  assert.equal(calls, 0);
  assert.equal(result.accepted, false);
  assert.equal(result.classification.reason, "automated_extraction_disabled_without_payment_context");
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

test("service candidates project operator-safe canonical job context", () => {
  const candidates = servicePaymentCandidates({
    amount_thb: 7500,
    sessions: [{
      id: "rec-session",
      fields: {
        session_id: "sess-001",
        job_id: "MMD-JOB-001",
        client_name: "แม่ไก่",
        model_name: "Gohan",
        job_type: "Private",
        job_date: "2026-09-22",
        start_time: "2026-09-22T19:00:00.000+07:00",
        end_time: "2026-09-22T20:30:00.000+07:00",
        location_name: "Ever Green",
        final_price_thb: 15000,
        paid_received_sum: 0,
        session_state: "pending",
      },
    }],
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].job_id, "MMD-JOB-001");
  assert.equal(candidates[0].model_name, "Gohan");
  assert.equal(candidates[0].job_date, "2026-09-22");
  assert.equal(candidates[0].location_name, "Ever Green");
  assert.equal(candidates[0].match_stage, "deposit");
});

test("Payment Confirm message shows exact job context instead of a bare slip", async () => {
  const h = telegramHarness();
  const result = await notifyPaymentProofOps(h.env, {
    proofId: "line_job_context_1",
    sourceType: "user",
    sourceContext: "direct_user_payment_followup",
    paymentContextText: "โอนมัดจำแล้ว",
    payerName: "แม่ไก่",
    analysis: {
      extraction: { amount_thb: 7500 },
      payment_intelligence: { inferred_label: "ค่าจอง / มัดจำ", tracking_kind: "job_deposit" },
      ops_route: { topic: "payment", reason: "service_payment", should_alert: false },
      customer: { display_name: "แม่ไก่" },
      job_correlation: {
        status: "exact",
        reason: "deposit_ratio_50",
        candidate_count: 1,
        selected: {
          job_id: "MMD-JOB-001",
          session_id: "sess-001",
          model_name: "Gohan",
          job_date: "2026-09-22",
          start_time: "19:00",
          end_time: "20:30",
          location_name: "Ever Green",
        },
      },
    },
  }, { deduped: false });
  assert.equal(result.thread_id, 22);
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0].text, /Customer: แม่ไก่/);
  assert.match(h.messages[0].text, /Job Match: ✅ exact canonical match/);
  assert.match(h.messages[0].text, /Job: MMD-JOB-001/);
  assert.match(h.messages[0].text, /Model: Gohan/);
  assert.match(h.messages[0].text, /Ever Green/);
});

test("Payment Confirm shows bounded candidates when the slip matches multiple jobs", async () => {
  const h = telegramHarness();
  await notifyPaymentProofOps(h.env, {
    proofId: "line_job_ambiguous_1",
    sourceType: "user",
    sourceContext: "direct_user_payment_followup",
    payerName: "แม่ไก่",
    analysis: {
      extraction: { amount_thb: 5000 },
      payment_intelligence: { inferred_label: "ต้องตรวจประเภทเงิน", tracking_kind: "unresolved_payment" },
      ops_route: { topic: "payment", reason: "service_payment", should_alert: false },
      job_correlation: {
        status: "ambiguous",
        reason: "multiple_session_candidates",
        candidate_count: 2,
        candidates: [
          { job_id: "JOB-A", model_name: "A", job_date: "2026-09-22", location_name: "Thonglor" },
          { job_id: "JOB-B", model_name: "B", job_date: "2026-09-23", location_name: "Sathorn" },
        ],
      },
    },
  }, { deduped: false });
  assert.match(h.messages[0].text, /ambiguous · 2 candidates/);
  assert.match(h.messages[0].text, /JOB-A/);
  assert.match(h.messages[0].text, /JOB-B/);
  assert.match(h.messages[0].text, /Do not guess/);
});

test("tracking kind separates membership, job deposit, and job final payment", () => {
  assert.equal(paymentTrackingKind({ inferred_stage: "membership", inferred_intent: "renewal" }), "membership_renewal");
  assert.equal(paymentTrackingKind({ inferred_stage: "deposit" }), "job_deposit");
  assert.equal(paymentTrackingKind({ inferred_stage: "final" }), "job_final");
  assert.equal(paymentTrackingKind({ inferred_stage: "unknown" }), "unresolved_payment");
});

test("HYPE refund-ready alert tells Per the real problem and next action", () => {
  const text = buildHypeOwnerProblemAlert({
    eventType: "refund_ready",
    customerName: "แมน",
    jobId: "JOB-FILM-J-001",
    refundAmountThb: 4500,
    accountNumberMasked: "•••• 1234",
  });
  assert.match(text, /HYPE · REFUND READY/);
  assert.match(text, /ลูกค้าส่งบัญชีเพื่อรับเงินคืนแล้ว/);
  assert.match(text, /ลูกค้า: แมน/);
  assert.match(text, /งาน: JOB-FILM-J-001/);
  assert.match(text, /บัญชี: •••• 1234/);
  assert.match(text, /✓ อ่านข้อมูลบัญชีแล้ว/);
  assert.match(text, /✓ สร้าง Refund Task แล้ว/);
  assert.match(text, /✓ ไม่แก้ Payment \/ Money Truth/);
  assert.match(text, /เปอร์ต้องทำต่อ: คืนเงิน 4,500 บาท/);
  assert.match(text, /\/internal\/admin\/refunds/);
  assert.match(text, /\/internal\/admin\/jobs\/all\?job_id=JOB-FILM-J-001/);
  assert.doesNotMatch(text, /123-4-56789-0/);
});

test("HYPE ACCOUNT CHANGED alert keeps old account intact and asks Per to review", () => {
  const text = buildHypeOwnerProblemAlert({
    eventType: "account_changed",
    customerName: "แมน",
    jobId: "JOB-FILM-J-001",
    accountNumberMasked: "•••• 9876",
  });
  assert.match(text, /HYPE · ACCOUNT CHANGED/);
  assert.match(text, /บัญชีรับเงินคืนใหม่/);
  assert.match(text, /บัญชีใหม่: •••• 9876/);
  assert.match(text, /ไม่ overwrite บัญชีเดิม/);
  assert.match(text, /ไม่แก้ Payment \/ Money Truth/);
  assert.match(text, /เปิด Refund/);
  assert.doesNotMatch(text, /123-4-56789-0/);
});

test("HYPE refund-ready notification uses Alerts and is deduplicated by proof event", async () => {
  const h = telegramHarness({ LINE_SLIP_EVIDENCE: memoryR2() });
  const result = await notifyOwnerBankDetailReady(h.env, {
    proofId: "line_bank_detail_1",
    purpose: "refund",
    customerName: "แมน",
    sessionId: "sess-film-j",
    refundAmountThb: 4500,
    accountNumberMasked: "•••• 1234",
  });
  assert.equal(result.thread_id, 9);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].flow, "alert");
  assert.equal(h.messages[0].message_thread_id, 9);
  assert.match(h.messages[0].text, /REFUND READY/);
  assert.match(h.messages[0].text, /คืนเงิน 4,500 บาท/);
});

test("Telegram payment topic helpers keep Membership, Confirm and Alerts separate", () => {
  assert.equal(membershipOpsThreadId({}), 20);
  assert.equal(paymentOpsThreadId({}), 22);
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
  assert.match(h.messages[0].text, /สลิปค่าสมาชิก/);
});

test("Telegram clearly labels four LINE slip categories and does not verify from classification alone", async () => {
  const cases = [
    { kind: "membership_signup", context: "สมัครสมาชิก", label: "ค่าสมาชิก", thread: 20 },
    { kind: "membership_renewal", context: "ต่ออายุสมาชิก", label: "ค่าต่อสมาชิก", thread: 20 },
    { kind: "job_deposit", context: "โอนมัดจำงาน", label: "ค่ามัดจำ", thread: 22 },
    { kind: "job_final", context: "โอนยอดคงเหลืองาน", label: "ค่าจบงาน", thread: 22 },
  ];
  for (const [index, item] of cases.entries()) {
    const h = telegramHarness();
    const result = await notifyPaymentProofOps(h.env, {
      proofId: `line_four_types_${index}`,
      sourceType: "user",
      sourceContext: "direct_user_payment_followup",
      paymentContextText: item.context,
      analysis: {
        extraction: { amount_thb: item.kind === "membership_renewal" ? 1000 : 7500 },
        payment_intelligence: { tracking_kind: item.kind },
      },
    }, { deduped: false });
    assert.equal(result.thread_id, item.thread, item.kind);
    assert.match(h.messages[0].text, new RegExp(`ประเภท: ${item.label}`), item.kind);
    assert.match(h.messages[0].text, /สถานะ: รอตรวจสอบ/, item.kind);
    assert.doesNotMatch(h.messages[0].text, /verified|ยืนยันแล้วจากระบบรับเงิน/i, item.kind);
  }
});

test("Telegram remains pending even if a caller reports materialized settlement", async () => {
  const h = telegramHarness();
  await notifyPaymentProofOps(h.env, {
    proofId: "line_membership_pending_guard_1",
    sourceType: "user",
    paymentContextText: "ต่ออายุสมาชิก",
    analysis: { payment_intelligence: { tracking_kind: "membership_renewal" } },
  }, { deduped: false, settlement: { status: "materialized" } });
  assert.match(h.messages[0].text, /สถานะ: รอตรวจสอบ/);
  assert.match(h.messages[0].text, /Official Verify/);
  assert.doesNotMatch(h.messages[0].text, /ยืนยันแล้วจากระบบรับเงิน|materialized/i);
});

test("Telegram review-required membership remains pending and asks for Official Verify", async () => {
  const h = telegramHarness();
  await notifyPaymentProofOps(h.env, {
    proofId: "line_membership_review_required_1",
    sourceType: "user",
    paymentContextText: "ต่ออายุสมาชิก",
    analysis: {
      extraction: { amount_thb: 1000 },
      payment_intelligence: { tracking_kind: "membership_renewal" },
    },
  }, { deduped: false, settlement: { status: "review_required" } });
  assert.match(h.messages[0].text, /สถานะ: รอตรวจสอบ/);
  assert.match(h.messages[0].text, /Official Verify/);
  assert.doesNotMatch(h.messages[0].text, /สถานะ: ต้องตรวจสอบ|ยืนยันแล้วจากระบบรับเงิน/);
});


test("direct LINE customer receives SAFE acknowledgement through Reply API without Push fallback", async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.url === "https://api.line.me/v2/bot/message/reply") {
      calls.push(await request.json());
      return new Response("", { status: 200 });
    }
    throw new Error(`unexpected_fetch:${request.url}`);
  };
  try {
    const evidence = {
      proofId: "line_direct_ack_1",
      sourceType: "user",
      paymentContextText: "โอนมัดจำแล้ว",
      analysis: {
        payment_intelligence: { tracking_kind: "job_deposit" },
        ops_route: { topic: "payment", reason: "service_payment", should_alert: false },
        job_correlation: {
          status: "exact",
          selected: {
            model_name: "Film J",
            job_date: "2026-10-11",
            start_time: "19:30",
            end_time: "20:30",
          },
        },
      },
    };
    const result = await notifyDirectCustomerPaymentEvidence(
      { LINE_CHANNEL_ACCESS_TOKEN: "line-token" },
      evidence,
      { deduped: true, acknowledgement: "safe" },
      "reply-token-1",
    );
    assert.equal(result.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].replyToken, "reply-token-1");
    assert.equal(calls[0].to, undefined);
    assert.equal(calls[0].messages[0].text, "ได้รับหลักฐานการชำระเงินแล้วครับ ผมกำลังส่งรายละเอียดให้ทางระบบตรวจสอบ กรุณารอสักครู่ก่อนนะครับ");
    assert.doesNotMatch(calls[0].messages[0].text, /paid|verified|ยืนยันรับเงิน/i);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("acknowledgement policy distinguishes manual, safe replay, and pre-durable retry", () => {
  const evidence = { sourceType: "user" };
  const manual = buildDirectPaymentAcknowledgement(evidence, { manualReviewRequired: true });
  const safe = buildDirectPaymentAcknowledgement(evidence, { deduped: true });
  const retry = buildDirectPaymentAcknowledgement(evidence, { acknowledgement: "retry" });
  assert.equal(manual, "ได้รับหลักฐานการชำระเงินแล้วครับ แต่รายละเอียดต้องให้ทาง MMD ตรวจสอบด้วยตนเอง กรุณารอสักครู่ก่อนนะครับ");
  assert.equal(safe, "ได้รับหลักฐานการชำระเงินแล้วครับ ผมกำลังส่งรายละเอียดให้ทางระบบตรวจสอบ กรุณารอสักครู่ก่อนนะครับ");
  assert.equal(retry, "ขณะนี้ระบบยังบันทึกหลักฐานการชำระเงินไม่สำเร็จครับ กรุณาเก็บสลิปไว้ก่อน ทาง MMD จะตรวจสอบและแจ้งให้ทราบอีกครั้งครับ");
  for (const text of [manual, safe, retry]) assert.doesNotMatch(text, /paid|verified|ยืนยัน(?:รับเงิน|การชำระ)/i);
});

test("acknowledgement is withheld before durable evidence and Telegram state cannot reclassify it", async () => {
  let calls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls += 1; return new Response("", { status: 200 }); };
  try {
    const beforeDurable = await acknowledgeDirectSlipResult(
      { LINE_CHANNEL_ACCESS_TOKEN: "line-token" },
      { source: { type: "user" }, replyToken: "reply-before-durable" },
      { captured: false, opsDelivery: { delivered: false } },
    );
    assert.equal(beforeDurable.skipped, true);
    assert.equal(beforeDurable.reason, "no_durable_payment_evidence");
    assert.equal(calls, 0);
    assert.equal(buildDirectPaymentAcknowledgement({}, { captured: true, manualReviewRequired: true, opsDelivery: { delivered: false } }), "ได้รับหลักฐานการชำระเงินแล้วครับ แต่รายละเอียดต้องให้ทาง MMD ตรวจสอบด้วยตนเอง กรุณารอสักครู่ก่อนนะครับ");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("LINE Reply API failure is bounded and never falls back to Push", async () => {
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request.url);
    return new Response("", { status: 503 });
  };
  try {
    const result = await notifyDirectCustomerPaymentEvidence(
      { LINE_CHANNEL_ACCESS_TOKEN: "line-token" },
      { sourceType: "user" },
      { captured: true, manualReviewRequired: true },
      "reply-secret-token",
    );
    assert.deepEqual(result, { sent: false, status: 503, reason: "line_reply_503" });
    assert.deepEqual(calls, ["https://api.line.me/v2/bot/message/reply"]);
    assert.equal(JSON.stringify(result).includes("reply-secret-token"), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("group payment evidence never sends a direct customer acknowledgement", async () => {
  const result = await notifyDirectCustomerPaymentEvidence(
    { LINE_CHANNEL_ACCESS_TOKEN: "line-token" },
    { sourceType: "group", analysis: {} },
    { deduped: false },
    "reply-token-group",
  );
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "not_direct_user");
});

test("LINE generic transfer proof stays in Payments Confirm topic 22", async () => {
  const h = telegramHarness();
  const result = await notifyPaymentProofOps(h.env, { proofId: "line_payment_1", sourceType: "user", sourceContext: "direct_user_payment_followup", paymentContextText: "โอนแล้วครับ ส่งสลิปให้" }, { deduped: false });
  assert.equal(result.topic, "payment");
  assert.equal(result.thread_id, 22);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].flow, "payment_proof");
  assert.equal(h.messages[0].message_thread_id, 22);
});

test("LINE conflicting membership/service wording stays in Confirm and also raises Alerts", async () => {
  const h = telegramHarness();
  const result = await notifyPaymentProofOps(h.env, { proofId: "line_conflict_1", sourceType: "user", sourceContext: "direct_user_payment_followup", paymentContextText: "ค่าสมาชิก Premium แต่ยอดนี้เป็นมัดจำงาน" }, { deduped: false });
  assert.equal(result.topic, "payment");
  assert.equal(result.thread_id, 22);
  assert.equal(result.alert_sent, true);
  assert.equal(h.messages.length, 2);
  assert.equal(h.messages[0].message_thread_id, 22);
  assert.equal(h.messages[1].flow, "alert");
  assert.equal(h.messages[1].message_thread_id, 9);
});

test("explicit payment context stores pending evidence without QR, OCR, or payments-worker mutation", async () => {
  const r2 = memoryR2();
  const previousFetch = globalThis.fetch;
  let proofPost = null;
  let proofPatch = null;
  let extractorCalls = 0;
  let paymentsCalls = 0;
  const lineUserId = "U1234567890abcdef1234567890abcdef";
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "api-data.line.me") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
    if (url.hostname !== "api.airtable.com") throw new Error(`unexpected_fetch:${request.method}:${request.url}`);
    const table = decodeURIComponent(url.pathname.split("/").filter(Boolean)[2] || "");
    if (request.method === "GET" && table === "proofs") return Response.json({ records: [] });
    if (request.method === "GET" && table === "members") return Response.json({ records: [{ id: "recMember12345678", fields: { member_id: "bookei", line_id: lineUserId, "Contact Email": "book@example.com" } }] });
    if (request.method === "GET" && table === "clients") return Response.json({ records: [{ id: "recClient12345678", fields: { line_user_id: lineUserId, "Client Name": "Book EI" } }] });
    if (request.method === "GET" && table === "renewals") return Response.json({ records: [{ id: "recRenewal123456", fields: { renewal_session_id: "renew-book-1", line_user_id: lineUserId, requested_package: "standard", renewal_amount_thb: 1000 } }] });
    if (request.method === "GET" && table === "sessions") return Response.json({ records: [] });
    if (request.method === "POST" && table === "proofs") {
      proofPost = await request.json();
      return Response.json({ id: "recProof12345678", fields: proofPost.fields });
    }
    if (request.method === "PATCH" && table === "proofs") {
      proofPatch = await request.json();
      return Response.json({ id: "recProof12345678", fields: proofPatch.fields });
    }
    throw new Error(`unexpected_airtable:${request.method}:${table}`);
  };
  const env = {
    LINE_SLIP_EVIDENCE: r2,
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    AIRTABLE_BASE_ID: "appTestBase000001",
    AIRTABLE_API_KEY: "token",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "proofs",
    AIRTABLE_TABLE_MEMBERS_ID: "members",
    AIRTABLE_TABLE_CLIENTS_ID: "clients",
    AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID: "renewals",
    AIRTABLE_TABLE_SESSIONS_ID: "sessions",
    INTERNAL_TOKEN: "internal-token",
    SLIP_EXTRACTOR: { async fetch() { extractorCalls += 1; throw new Error("must_not_extract"); } },
    PAYMENTS_WORKER: { async fetch() { paymentsCalls += 1; throw new Error("must_not_settle"); } },
  };
  const event = { type: "message", timestamp: Date.now(), webhookEventId: "evt-1", source: { type: "user", userId: lineUserId }, message: { type: "image", id: "img-1" } };
  try {
    const result = await captureDirectUserImageEvidence(env, event, { recentPaymentContext: true, paymentContextText: "ต่ออายุสมาชิกครับ ส่งสลิปให้" });
    assert.equal(result.captured, true);
    assert.equal(result.settlementStatus, "pending");
    assert.equal(result.verified, false);
    assert.equal(result.manualReviewRequired, true);
    assert.equal(result.acknowledgement, "manual");
    assert.equal(proofPost.fields.status, "pending");
    assert.equal(proofPatch, null);
    const note = JSON.parse(proofPost.fields.note);
    assert.equal(note.payment_truth, "unverified");
    assert.equal(note.official_verification_required, true);
    assert.equal(note.may_mark_paid, false);
    assert.equal(note.may_award_points, false);
    assert.equal(note.may_extend_membership, false);
    assert.equal(note.may_confirm_session, false);
    assert.equal(note.extraction.method, "none");
    assert.equal(extractorCalls, 0);
    assert.equal(paymentsCalls, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(r2.store.size, 1);
});

test("signed direct intake replies MANUAL only after private R2 and pending Airtable persistence", async () => {
  const order = [];
  const r2 = memoryR2();
  const originalPut = r2.put.bind(r2);
  r2.put = async (...args) => { order.push("r2_put"); return originalPut(...args); };
  const previousFetch = globalThis.fetch;
  let proofFields = null;
  let replyBody = null;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "api-data.line.me") { order.push("line_download"); return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }); }
    if (url.hostname === "api.line.me" && url.pathname.startsWith("/v2/bot/profile/")) return Response.json({ displayName: "Fixture" });
    if (request.url === "https://api.line.me/v2/bot/message/reply") { order.push("line_reply"); replyBody = await request.json(); return new Response("", { status: 200 }); }
    if (url.hostname !== "api.airtable.com") throw new Error(`unexpected_fetch:${request.method}:${request.url}`);
    const table = decodeURIComponent(url.pathname.split("/").filter(Boolean)[2] || "");
    if (request.method === "GET" && table === "inbox") return Response.json({ records: [{ id: "recContext", fields: { admin_note: "ต่ออายุสมาชิกครับ ส่งสลิปให้" } }] });
    if (request.method === "GET") return Response.json({ records: [] });
    if (request.method === "POST" && table === "proofs") {
      order.push("airtable_proof");
      proofFields = (await request.json()).fields;
      return Response.json({ id: "recProofDurable", fields: proofFields });
    }
    throw new Error(`unexpected_airtable:${request.method}:${table}`);
  };
  const env = {
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    LINE_SLIP_EVIDENCE: r2,
    AIRTABLE_BASE_ID: "appTestBase000001",
    AIRTABLE_API_KEY: "token",
    AIRTABLE_TABLE_CONSOLE_INBOX_ID: "inbox",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "proofs",
    AIRTABLE_TABLE_MEMBERS_ID: "members",
    AIRTABLE_TABLE_CLIENTS_ID: "clients",
    AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID: "renewals",
    AIRTABLE_TABLE_SESSIONS_ID: "sessions",
    SLIP_EXTRACTOR: { async fetch() { throw new Error("must_not_extract"); } },
    PAYMENTS_WORKER: { async fetch() { throw new Error("must_not_settle"); } },
  };
  const payload = JSON.stringify({ events: [{ type: "message", mode: "active", timestamp: Date.now(), webhookEventId: "evt-durable", replyToken: "reply-durable", source: { type: "user", userId: "U-durable" }, message: { type: "image", id: "img-durable" } }] });
  const signature = await lineSignature(payload, env.LINE_CHANNEL_SECRET);
  try {
    await observeSignedLineEvents(new Request("https://mmdbkk.com/webhooks/line", { method: "POST", headers: { "x-line-signature": signature }, body: payload }), env);
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(proofFields.status, "pending");
  assert.equal(replyBody.replyToken, "reply-durable");
  assert.equal(replyBody.messages[0].text, "ได้รับหลักฐานการชำระเงินแล้วครับ แต่รายละเอียดต้องให้ทาง MMD ตรวจสอบด้วยตนเอง กรุณารอสักครู่ก่อนนะครับ");
  assert.ok(order.indexOf("line_download") < order.indexOf("r2_put"));
  assert.ok(order.indexOf("r2_put") < order.indexOf("airtable_proof"));
  assert.ok(order.indexOf("airtable_proof") < order.indexOf("line_reply"));
});

test("durable replay uses SAFE acknowledgement without downloading or duplicating evidence", async () => {
  const r2 = memoryR2();
  const previousFetch = globalThis.fetch;
  let downloads = 0;
  let writes = 0;
  let replyBody = null;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "api-data.line.me") { downloads += 1; throw new Error("must_not_download"); }
    if (request.url === "https://api.line.me/v2/bot/message/reply") { replyBody = await request.json(); return new Response("", { status: 200 }); }
    if (url.hostname !== "api.airtable.com") throw new Error(`unexpected_fetch:${request.method}:${request.url}`);
    const table = decodeURIComponent(url.pathname.split("/").filter(Boolean)[2] || "");
    if (request.method === "GET" && table === "inbox") return Response.json({ records: [{ id: "recContext", fields: { admin_note: "โอนแล้ว ส่งสลิปให้" } }] });
    if (request.method === "GET" && table === "proofs") return Response.json({ records: [{ id: "recExisting", fields: { proof_id: "line-existing", status: "pending" } }] });
    if (request.method === "POST") { writes += 1; throw new Error("must_not_write"); }
    return Response.json({ records: [] });
  };
  const env = { LINE_CHANNEL_SECRET: "line-secret", LINE_CHANNEL_ACCESS_TOKEN: "line-token", LINE_SLIP_EVIDENCE: r2, AIRTABLE_BASE_ID: "appTestBase000001", AIRTABLE_API_KEY: "token", AIRTABLE_TABLE_CONSOLE_INBOX_ID: "inbox", AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "proofs" };
  const payload = JSON.stringify({ events: [{ type: "message", mode: "active", timestamp: Date.now(), webhookEventId: "evt-replay", replyToken: "reply-replay", source: { type: "user", userId: "U-replay" }, message: { type: "image", id: "img-replay" } }] });
  const signature = await lineSignature(payload, env.LINE_CHANNEL_SECRET);
  try {
    await observeSignedLineEvents(new Request("https://mmdbkk.com/webhooks/line", { method: "POST", headers: { "x-line-signature": signature }, body: payload }), env);
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(downloads, 0);
  assert.equal(writes, 0);
  assert.equal(r2.store.size, 0);
  assert.equal(replyBody.messages[0].text, "ได้รับหลักฐานการชำระเงินแล้วครับ ผมกำลังส่งรายละเอียดให้ทางระบบตรวจสอบ กรุณารอสักครู่ก่อนนะครับ");
});

test("pre-durable download failure replies RETRY and creates no evidence", async () => {
  const r2 = memoryR2();
  const previousFetch = globalThis.fetch;
  let proofWrites = 0;
  let replyBody = null;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "api-data.line.me") return new Response("unavailable", { status: 503 });
    if (request.url === "https://api.line.me/v2/bot/message/reply") { replyBody = await request.json(); return new Response("", { status: 200 }); }
    if (url.hostname !== "api.airtable.com") throw new Error(`unexpected_fetch:${request.method}:${request.url}`);
    const table = decodeURIComponent(url.pathname.split("/").filter(Boolean)[2] || "");
    if (request.method === "GET" && table === "inbox") return Response.json({ records: [{ id: "recContext", fields: { admin_note: "โอนแล้ว ส่งสลิปให้" } }] });
    if (request.method === "GET") return Response.json({ records: [] });
    if (request.method === "POST") { proofWrites += 1; return Response.json({ id: "unexpected" }); }
    throw new Error(`unexpected_airtable:${request.method}:${table}`);
  };
  const env = { LINE_CHANNEL_SECRET: "line-secret", LINE_CHANNEL_ACCESS_TOKEN: "line-token", LINE_SLIP_EVIDENCE: r2, AIRTABLE_BASE_ID: "appTestBase000001", AIRTABLE_API_KEY: "token", AIRTABLE_TABLE_CONSOLE_INBOX_ID: "inbox", AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "proofs" };
  const payload = JSON.stringify({ events: [{ type: "message", mode: "active", timestamp: Date.now(), webhookEventId: "evt-retry", replyToken: "reply-retry", source: { type: "user", userId: "U-retry" }, message: { type: "image", id: "img-retry" } }] });
  const signature = await lineSignature(payload, env.LINE_CHANNEL_SECRET);
  try {
    await observeSignedLineEvents(new Request("https://mmdbkk.com/webhooks/line", { method: "POST", headers: { "x-line-signature": signature }, body: payload }), env);
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(proofWrites, 0);
  assert.equal(r2.store.size, 0);
  assert.equal(replyBody.messages[0].text, "ขณะนี้ระบบยังบันทึกหลักฐานการชำระเงินไม่สำเร็จครับ กรุณาเก็บสลิปไว้ก่อน ทาง MMD จะตรวจสอบและแจ้งให้ทราบอีกครั้งครับ");
});

test("non-payment follow-up does not promote a direct image candidate", async () => {
  const r2 = memoryR2();
  const env = { LINE_SLIP_EVIDENCE: r2 };
  const result = await promoteDirectUserCandidate(env, { type: "message", source: { type: "user", userId: "U123" }, message: { type: "text", text: "วันนี้ว่างไหม" } });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "followup_not_payment_related");
});

test("signed payment follow-up with no image candidate emits a privacy-safe diagnostic", async () => {
  const logs = [];
  const originalLog = console.log;
  const env = {
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_SLIP_EVIDENCE: { async get() { return null; } },
  };
  const payload = JSON.stringify({ events: [{
    type: "message",
    mode: "active",
    timestamp: Date.now(),
    webhookEventId: "evt-private-diagnostic",
    replyToken: "reply-private-diagnostic",
    source: { type: "user", userId: "U-private-diagnostic" },
    message: { type: "text", id: "msg-private-diagnostic", text: "โอนแล้ว ทดสอบระบบ LINE OFC" },
  }] });
  const signature = await lineSignature(payload, env.LINE_CHANNEL_SECRET);
  console.log = (line) => logs.push(String(line));
  try {
    await observeSignedLineEvents(new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "x-line-signature": signature },
      body: payload,
    }), env);
  } finally {
    console.log = originalLog;
  }

  const entries = logs.map((line) => {
    try { return JSON.parse(line); } catch (_) { return {}; }
  });
  const eventSeen = entries.find((entry) => entry.line_payment_match === "event_seen");
  const lookup = entries.find((entry) => entry.line_payment_match === "candidate_lookup");
  const diagnostic = entries.find((entry) => entry.line_payment_ingress === "candidate_missing");
  assert.deepEqual(entries.find((entry) => entry.line_payment_observer === "batch_parsed"), {
    line_payment_observer: "batch_parsed", events_array: true, event_count: 1, event_type_counts: { message: 1 },
  });
  assert.deepEqual(eventSeen, { line_payment_match: "event_seen", source_type: "user", message_type: "text", payment_followup: true });
  assert.deepEqual(lookup, { line_payment_match: "candidate_lookup", candidate_found: false });
  assert.equal(diagnostic?.reason, "candidate_missing_or_stale");
  assert.equal(diagnostic?.source_type, "user");
  assert.equal(diagnostic?.message_type, "text");
  assert.equal(logs.join("\n").includes("U-private-diagnostic"), false);
  assert.equal(logs.join("\n").includes("โอนแล้ว"), false);
  assert.equal(logs.join("\n").includes("reply-private-diagnostic"), false);
  assert.equal(logs.join("\n").includes("evt-private-diagnostic"), false);
});

test("signed image then payment text finds the same user's candidate and persists one pending proof", async () => {
  const logs = [];
  const order = [];
  const r2 = memoryR2();
  const originalPut = r2.put.bind(r2);
  r2.put = async (key, ...args) => {
    order.push(key.includes("/direct-user-candidates/") ? "candidate_put" : key.includes("/original.") ? "evidence_put" : "other_r2_put");
    return originalPut(key, ...args);
  };
  const originalLog = console.log;
  const originalFetch = globalThis.fetch;
  let proofFields = null;
  let replyBody = null;
  let paymentCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === "api-data.line.me") { order.push("line_download"); return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }); }
    if (url.hostname === "api.line.me" && url.pathname.startsWith("/v2/bot/profile/")) return Response.json({ displayName: "Fixture" });
    if (request.url === "https://api.line.me/v2/bot/message/reply") { order.push("line_reply"); replyBody = await request.json(); return new Response("", { status: 200 }); }
    if (url.hostname !== "api.airtable.com") throw new Error(`unexpected_fetch:${request.method}:${url.hostname}`);
    const table = decodeURIComponent(url.pathname.split("/").filter(Boolean)[2] || "");
    if (request.method === "GET") return Response.json({ records: [] });
    if (request.method === "POST" && table === "proofs") {
      order.push("airtable_proof");
      proofFields = (await request.json()).fields;
      return Response.json({ id: "recProofCandidate", fields: proofFields });
    }
    throw new Error(`unexpected_airtable:${request.method}:${table}`);
  };
  const env = {
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    LINE_SLIP_EVIDENCE: r2,
    AIRTABLE_BASE_ID: "appTestBase000001",
    AIRTABLE_API_KEY: "token",
    AIRTABLE_TABLE_CONSOLE_INBOX_ID: "inbox",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "proofs",
    AIRTABLE_TABLE_MEMBERS_ID: "members",
    AIRTABLE_TABLE_CLIENTS_ID: "clients",
    AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID: "renewals",
    AIRTABLE_TABLE_SESSIONS_ID: "sessions",
    SLIP_EXTRACTOR: { async fetch() { throw new Error("must_not_extract"); } },
    PAYMENTS_WORKER: { async fetch() { paymentCalls += 1; throw new Error("must_not_settle"); } },
  };
  const image = { type: "message", timestamp: Date.now(), webhookEventId: "evt-candidate-image", replyToken: "reply-image", source: { type: "user", userId: "U-candidate-test" }, message: { type: "image", id: "img-candidate-test" } };
  const textEvent = { type: "message", timestamp: Date.now() + 1000, webhookEventId: "evt-candidate-text", replyToken: "reply-text", source: { type: "user", userId: "U-candidate-test" }, message: { type: "text", id: "msg-candidate-test", text: "โอนแล้ว ทดสอบระบบ LINE OFC" } };
  console.log = (line) => logs.push(String(line));
  try {
    for (const event of [image, textEvent]) {
      const payload = JSON.stringify({ events: [event] });
      const signature = await lineSignature(payload, env.LINE_CHANNEL_SECRET);
      await observeSignedLineEvents(new Request("https://mmdbkk.com/webhooks/line", { method: "POST", headers: { "x-line-signature": signature }, body: payload }), env);
    }
  } finally {
    console.log = originalLog;
    globalThis.fetch = originalFetch;
  }
  const entries = logs.map((line) => JSON.parse(line));
  assert.deepEqual(entries.filter((entry) => entry.line_payment_match === "event_seen").map((entry) => [entry.message_type, entry.payment_followup]), [["image", null], ["text", true]]);
  assert.deepEqual(entries.find((entry) => entry.line_payment_match === "candidate_lookup"), { line_payment_match: "candidate_lookup", candidate_found: true });
  assert.equal(proofFields?.status, "pending");
  assert.equal(proofFields?.channel, "line_ofc");
  assert.equal(paymentCalls, 0);
  assert.equal(replyBody?.replyToken, "reply-text");
  assert.equal(replyBody?.messages?.[0]?.text, "ได้รับหลักฐานการชำระเงินแล้วครับ แต่รายละเอียดต้องให้ทาง MMD ตรวจสอบด้วยตนเอง กรุณารอสักครู่ก่อนนะครับ");
  assert.ok(order.indexOf("candidate_put") < order.indexOf("line_download"));
  assert.ok(order.indexOf("line_download") < order.indexOf("evidence_put"));
  assert.ok(order.indexOf("evidence_put") < order.indexOf("airtable_proof"));
  assert.ok(order.indexOf("airtable_proof") < order.indexOf("line_reply"));
  for (const privateValue of ["U-candidate-test", "img-candidate-test", "msg-candidate-test", "reply-text", "โอนแล้ว", "line-token"]) assert.equal(logs.join("\n").includes(privateValue), false);
});

test("signed non-payment text reports a safe match miss without looking up evidence", async () => {
  const logs = [];
  const originalLog = console.log;
  let r2Reads = 0;
  const env = {
    LINE_CHANNEL_SECRET: "line-secret",
    LINE_SLIP_EVIDENCE: { async get() { r2Reads += 1; return null; } },
  };
  const payload = JSON.stringify({ events: [{
    type: "message",
    source: { type: "user", userId: "U-private-nonpayment" },
    message: { type: "text", id: "msg-private-nonpayment", text: "วันนี้ว่างไหม" },
  }] });
  const signature = await lineSignature(payload, env.LINE_CHANNEL_SECRET);
  console.log = (line) => logs.push(String(line));
  try {
    await observeSignedLineEvents(new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "x-line-signature": signature },
      body: payload,
    }), env);
  } finally {
    console.log = originalLog;
  }
  const entries = logs.map((line) => JSON.parse(line));
  assert.deepEqual(entries.find((entry) => entry.line_payment_match === "event_seen"), {
    line_payment_match: "event_seen", source_type: "user", message_type: "text", payment_followup: false,
  });
  assert.equal(entries.some((entry) => entry.line_payment_match === "candidate_lookup"), false);
  assert.equal(r2Reads, 0);
  assert.equal(logs.join("\n").includes("U-private-nonpayment"), false);
  assert.equal(logs.join("\n").includes("วันนี้ว่างไหม"), false);
});

test("invalid LINE signature never emits payment matching diagnostics", async () => {
  const logs = [];
  const originalLog = console.log;
  const payload = JSON.stringify({ events: [{ type: "message", source: { type: "user", userId: "U-invalid" }, message: { type: "text", text: "โอนแล้ว" } }] });
  console.log = (line) => logs.push(String(line));
  try {
    await observeSignedLineEvents(new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "x-line-signature": "invalid" },
      body: payload,
    }), { LINE_CHANNEL_SECRET: "line-secret" });
  } finally {
    console.log = originalLog;
  }
  const entries = logs.map((line) => JSON.parse(line));
  assert.equal(entries.some((entry) => entry.line_payment_match), false);
  assert.equal(entries.some((entry) => entry.line_payment_observer === "batch_parsed"), false);
  assert.equal(entries[0]?.line_payment_ingress, "signature_rejected");
  assert.equal(logs.join("\n").includes("U-invalid"), false);
});

test("signed non-message and unknown events expose only allowlisted type counts", async () => {
  const logs = [];
  const originalLog = console.log;
  const payload = JSON.stringify({ events: [
    { type: "postback", source: { type: "user", userId: "U-private-shape" }, postback: { data: "private-postback" } },
    { type: "unsend", source: { type: "user", userId: "U-private-shape" } },
    { type: "private-event-type", source: { type: "user", userId: "U-private-shape" } },
  ] });
  const signature = await lineSignature(payload, "line-secret");
  console.log = (line) => logs.push(String(line));
  try {
    await observeSignedLineEvents(new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST", headers: { "x-line-signature": signature }, body: payload,
    }), { LINE_CHANNEL_SECRET: "line-secret" });
  } finally {
    console.log = originalLog;
  }
  const entries = logs.map((line) => JSON.parse(line));
  assert.deepEqual(entries.find((entry) => entry.line_payment_observer === "batch_parsed"), {
    line_payment_observer: "batch_parsed", events_array: true, event_count: 3,
    event_type_counts: { postback: 1, unsend: 1, other: 1 },
  });
  assert.equal(entries.some((entry) => entry.line_payment_match === "event_seen"), false);
  for (const privateValue of ["U-private-shape", "private-postback", "private-event-type", signature]) assert.equal(logs.join("\n").includes(privateValue), false);
});

test("signed payload without an events array reports an empty batch without leaking payload", async () => {
  const logs = [];
  const originalLog = console.log;
  const payload = JSON.stringify({ events: "private-payload" });
  const signature = await lineSignature(payload, "line-secret");
  console.log = (line) => logs.push(String(line));
  try {
    await observeSignedLineEvents(new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST", headers: { "x-line-signature": signature }, body: payload,
    }), { LINE_CHANNEL_SECRET: "line-secret" });
  } finally {
    console.log = originalLog;
  }
  const entries = logs.map((line) => JSON.parse(line));
  assert.deepEqual(entries.find((entry) => entry.line_payment_observer === "batch_parsed"), {
    line_payment_observer: "batch_parsed", events_array: false, event_count: 0, event_type_counts: {},
  });
  assert.equal(logs.join("\n").includes("private-payload"), false);
  assert.equal(logs.join("\n").includes(signature), false);
});

test("webhook wrapper reports observer scheduling or non-2xx skip without changing responses", async () => {
  const logs = [];
  const background = [];
  const originalLog = console.log;
  const body = JSON.stringify({ events: [] });
  const signature = await lineSignature(body, "line-secret");
  console.log = (line) => logs.push(String(line));
  try {
    const rejected = await lineIngressWorker.fetch(new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST", headers: { "x-line-signature": "invalid" }, body,
    }), { LINE_CHANNEL_SECRET: "line-secret" });
    assert.equal(rejected.status, 401);
    const accepted = await lineIngressWorker.fetch(new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST", headers: { "x-line-signature": signature }, body,
    }), { LINE_CHANNEL_SECRET: "line-secret" });
    assert.equal(accepted.status, 200);
    const deferred = await lineIngressWorker.fetch(new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST", headers: { "x-line-signature": signature }, body,
    }), { LINE_CHANNEL_SECRET: "line-secret" }, { waitUntil(work) { background.push(work); } });
    assert.equal(deferred.status, 200);
    await Promise.all(background);
  } finally {
    console.log = originalLog;
  }
  const entries = logs.map((line) => { try { return JSON.parse(line); } catch (_) { return {}; } });
  assert.deepEqual(entries.find((entry) => entry.line_payment_observer === "skipped"), {
    line_payment_observer: "skipped", reason: "handler_non_2xx", response_status: 401,
  });
  assert.deepEqual(entries.find((entry) => entry.line_payment_observer === "scheduled"), {
    line_payment_observer: "scheduled", response_status: 200, execution: "inline",
  });
  assert.deepEqual(entries.find((entry) => entry.line_payment_observer === "scheduled" && entry.execution === "wait_until"), {
    line_payment_observer: "scheduled", response_status: 200, execution: "wait_until",
  });
  assert.deepEqual(entries.find((entry) => entry.line_payment_observer === "batch_parsed"), {
    line_payment_observer: "batch_parsed", events_array: true, event_count: 0, event_type_counts: {},
  });
  assert.equal(logs.join("\n").includes(signature), false);
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
