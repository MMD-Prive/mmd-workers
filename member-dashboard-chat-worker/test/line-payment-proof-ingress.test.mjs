import assert from "node:assert/strict";
import test from "node:test";

import { LINE_GROUP_INGRESS_INTERNALS } from "../src/line-group-ingress-front-gate.js";
import { classifyPaymentImageEvidence, inferServicePaymentPurpose, paymentTrackingKind, servicePaymentCandidates } from "../src/payment-proof-intelligence.mjs";

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
  assert.match(h.messages[0].text, /Membership Payment Proof/);
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

test("direct LINE image is visually checked and tracked immediately without waiting for follow-up text", async () => {
  const r2 = memoryR2();
  const previousFetch = globalThis.fetch;
  let proofPost = null;
  let proofPatch = null;
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
    SLIP_EXTRACTOR: { async fetch(request) {
      if (new URL(request.url).pathname.endsWith("/qr")) return Response.json({ result: { payment_ref: "REF-DIRECT-1", amount_thb: 1000, paid_at: "2026-09-17T10:00:00+07:00", provider: "promptpay", confidence_score: 0.99 } });
      return Response.json({ result: {} });
    } },
    PAYMENTS_WORKER: { async fetch(request) {
      const body = await request.json();
      assert.equal(body.source, "line_ofc_payment_ingress");
      assert.equal(body.payment_stage, "membership");
      assert.equal(body.member_email, "book@example.com");
      return Response.json({ ok: true, entitlement_materialized: true, entitlement_record_id: "recEntitle123456", membership_expire_at: "2028-06-28T00:00:00.000Z", membership_term: "1_year_plus_180_days", membership_expiry_rule: "1_year_from_current_expiry_plus_care_back_private_standard_2026", membership_write_through: { promotion: { code: "care_back_private_standard_2026", bonus_days: 180 } } });
    } },
  };
  const event = { type: "message", timestamp: Date.now(), webhookEventId: "evt-1", source: { type: "user", userId: lineUserId }, message: { type: "image", id: "img-1" } };
  try {
    const result = await captureDirectUserImageEvidence(env, event, { recentPaymentContext: false });
    assert.equal(result.captured, true);
    assert.equal(result.trackingKind, "membership_renewal");
    assert.equal(result.settlementStatus, "materialized");
    assert.equal(result.verified, true);
    assert.equal(proofPost.fields.status, "pending");
    assert.equal(proofPatch.fields.status, "verified");
    assert.equal(JSON.parse(proofPost.fields.note).payment_intelligence.tracking_kind, "membership_renewal");
    assert.equal(JSON.parse(proofPatch.fields.note).settlement.status, "materialized");
  } finally {
    globalThis.fetch = previousFetch;
  }
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
