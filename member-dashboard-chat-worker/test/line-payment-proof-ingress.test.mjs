import assert from "node:assert/strict";
import test from "node:test";

import { LINE_GROUP_INGRESS_INTERNALS } from "../src/line-group-ingress-front-gate.js";

const {
  hasPaymentContext,
  hasPaymentFollowupContext,
  captureDirectUserImageEvidence,
  promoteDirectUserCandidate,
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
