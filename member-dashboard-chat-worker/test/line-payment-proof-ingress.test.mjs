import assert from "node:assert/strict";
import test from "node:test";

import { LINE_GROUP_INGRESS_INTERNALS } from "../src/line-group-ingress-front-gate.js";

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
    async put(key, value, options = {}) {
      store.set(key, { value, options });
    },
    async get(key) {
      const found = store.get(key);
      if (!found) return null;
      return {
        async text() {
          return typeof found.value === "string" ? found.value : new TextDecoder().decode(found.value);
        },
      };
    },
    async head(key) {
      return store.has(key) ? {} : null;
    },
    async delete(key) {
      store.delete(key);
    },
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
      TELEGRAM_WORKER: {
        async fetch(request) {
          messages.push(await request.json());
          return Response.json({ ok: true });
        },
      },
      ...extra,
    },
  };
}

test("payment context recognizes renewal and transfer language", () => {
  for (const text of ["ต่ออายุสมาชิก", "โอนแล้ว", "ส่งสลิป", "payment proof", "renewal", "bank transfer"]) {
    assert.equal(hasPaymentContext(text), true, text);
  }
  assert.equal(hasPaymentContext("ขอดู profile หน่อย"), false);
});

test("payment follow-up recognizes access and Drive after payment image", () => {
  for (const text of ["ขอเข้ากลุ่มครับ", "แล้ว access", "Drive", "เข้าแล้วนะ", "โอนแล้ว"]) {
    assert.equal(hasPaymentFollowupContext(text), true, text);
  }
  assert.equal(hasPaymentFollowupContext("วันนี้ว่างไหม"), false);
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
  const result = await notifyPaymentProofOps(h.env, {
    proofId: "line_membership_1",
    sourceType: "user",
    sourceContext: "direct_user_payment_followup",
    paymentContextText: "ต่ออายุสมาชิก Premium ครับ โอนแล้ว",
  }, { deduped: false });
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
  const result = await notifyPaymentProofOps(h.env, {
    proofId: "line_payment_1",
    sourceType: "user",
    sourceContext: "direct_user_payment_followup",
    paymentContextText: "โอนแล้วครับ ส่งสลิปให้",
  }, { deduped: false });
  assert.equal(result.topic, "payment");
  assert.equal(result.thread_id, 21);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].flow, "payment_proof");
  assert.equal(h.messages[0].message_thread_id, 21);
});

test("LINE conflicting membership/service wording stays in Confirm and also raises Alerts", async () => {
  const h = telegramHarness();
  const result = await notifyPaymentProofOps(h.env, {
    proofId: "line_conflict_1",
    sourceType: "user",
    sourceContext: "direct_user_payment_followup",
    paymentContextText: "ค่าสมาชิก Premium แต่ยอดนี้เป็นมัดจำงาน",
  }, { deduped: false });
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
  const env = {
    LINE_SLIP_EVIDENCE: r2,
    AIRTABLE_BASE_ID: "appTestBase000001",
    AIRTABLE_API_KEY: "token",
  };
  const event = {
    type: "message",
    timestamp: Date.now(),
    webhookEventId: "evt-1",
    source: { type: "user", userId: "U123" },
    message: { type: "image", id: "img-1" },
  };
  const result = await captureDirectUserImageEvidence(env, event, { recentPaymentContext: false });
  assert.equal(result.candidate, true);
  assert.equal(result.captured, false);
  assert.equal(result.reason, "awaiting_payment_followup");
  assert.equal(r2.store.size, 1);
});

test("non-payment follow-up does not promote a direct image candidate", async () => {
  const r2 = memoryR2();
  const env = { LINE_SLIP_EVIDENCE: r2 };
  const result = await promoteDirectUserCandidate(env, {
    type: "message",
    source: { type: "user", userId: "U123" },
    message: { type: "text", text: "วันนี้ว่างไหม" },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "followup_not_payment_related");
});

test("direct payment evidence resolves the canonical client name without storing a raw LINE id in the proof", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.match(decodeURIComponent(url.pathname), /tblVv58TCbwh5j1fS$/);
    assert.match(url.searchParams.get("filterByFormula") || "", /line_user_id/);
    return Response.json({
      records: [{ id: "rec-client", fields: { "Client Name": "คุณเอ็ม" } }],
    });
  };
  try {
    const result = await resolveDirectPayerContext({
      AIRTABLE_BASE_ID: "appTestBase000001",
      AIRTABLE_API_KEY: "token",
      AIRTABLE_TABLE_CLIENTS_ID: "tblVv58TCbwh5j1fS",
    }, "U1234567890abcdef");
    assert.deepEqual(result, {
      payerName: "คุณเอ็ม",
      identityMatch: "exact_clients_line_user_id",
    });
    assert.equal(JSON.stringify(result).includes("U1234567890abcdef"), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
