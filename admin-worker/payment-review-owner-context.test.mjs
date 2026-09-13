import test from "node:test";
import assert from "node:assert/strict";
import {
  parseOperatorPaymentContext,
  mergeOperatorPaymentContext,
  resolveOperatorPaymentContext,
} from "./src/payment-review-owner-context.js";
import { inferPaymentContextFromConversation } from "./src/payment-review-auto-context.js";

function envFor(recordsByField) {
  return {
    AIRTABLE_API_KEY: "test",
    AIRTABLE_BASE_ID: "base",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    AIRTABLE_TABLE_MEMBERS: "Members",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const formula = url.searchParams.get("filterByFormula") || "";
        for (const [needle, records] of Object.entries(recordsByField)) {
          if (formula.includes(needle)) return Response.json({ records });
        }
        return Response.json({ records: [] });
      },
    },
  };
}

test("parses operator context without making names authoritative", () => {
  assert.deepEqual(parseOperatorPaymentContext({
    payment_stage: "deposit",
    session_id: "JOB-123",
    customer_name: "คุณเอ",
    model_name: "Model B",
  }), {
    payment_stage: "deposit",
    session_id: "JOB-123",
    member_email: "",
    package_code: "",
    customer_name: "คุณเอ",
    model_name: "Model B",
  });
});

test("service context requires an exact canonical session", async () => {
  const env = envFor({ "JOB-123": [{ id: "recSession1", fields: { session_id: "JOB-123" } }] });
  const result = await resolveOperatorPaymentContext(env, {
    payment_stage: "final",
    session_id: "JOB-123",
    customer_name: "ช่วยจำเท่านั้น",
    model_name: "ช่วยจำเท่านั้น",
  }, { payment_ref: "REF-1", amount_thb: 1999 });
  assert.equal(result.context_source, "owner_context_match");
  assert.equal(result.payment_fields.payment_stage, "final");
  assert.equal(result.payment_fields.session_id, "JOB-123");
  assert.equal(result.operator_context.customer_model_labels_authoritative, false);
  assert.equal(result.operator_context.session_record_id, "recSession1");
});

test("membership context requires exact member email and supported package", async () => {
  const env = envFor({ "person@example.com": [{ id: "recMember1", fields: { email: "person@example.com" } }] });
  const result = await resolveOperatorPaymentContext(env, {
    payment_stage: "membership",
    member_email: "PERSON@example.com",
    package_code: "premium",
    customer_name: "คุณลูกค้า",
  }, { payment_ref: "REF-2", amount_thb: 2500 });
  assert.equal(result.payment_fields.member_email, "person@example.com");
  assert.equal(result.payment_fields.package_code, "premium");
  assert.equal(result.operator_context.member_record_id, "recMember1");
});

test("special membership remains fail closed", async () => {
  await assert.rejects(
    resolveOperatorPaymentContext(envFor({}), {
      payment_stage: "membership",
      member_email: "person@example.com",
      package_code: "blackcard",
    }, { payment_ref: "REF-3", amount_thb: 25000 }),
    /operator_context_package_requires_special_review/
  );
});

test("operator context cannot contradict canonical payment context", () => {
  assert.throws(() => mergeOperatorPaymentContext({ payment_stage: "deposit", session_id: "JOB-1" }, {
    payment_stage: "final",
    session_id: "JOB-1",
  }), /operator_context_stage_mismatch/);
  assert.throws(() => mergeOperatorPaymentContext({ payment_stage: "deposit", session_id: "JOB-1" }, {
    payment_stage: "deposit",
    session_id: "JOB-2",
  }), /operator_context_session_mismatch/);
});

test("LINE conversation infers Premium renewal before manual override", () => {
  const result = inferPaymentContextFromConversation({
    texts: ["โอนแล้วครับ", "ขอต่อ Premium ครับ"],
    matrix: { last_customer_intent: "membership_renewal" },
    amount_thb: 1999,
  });
  assert.equal(result.payment_stage, "membership");
  assert.equal(result.package_code, "premium");
  assert.equal(result.renewal_like, true);
});

test("LINE conversation infers deposit and final stages from latest customer context", () => {
  assert.equal(inferPaymentContextFromConversation({
    texts: ["โอนมัดจำแล้วครับ", "จอง EMs22 วันที่ 17"],
    matrix: { last_customer_intent: "payment_slip" },
    amount_thb: 8250,
  }).payment_stage, "deposit");
  assert.equal(inferPaymentContextFromConversation({
    texts: ["โอนส่วนที่เหลือแล้ว", "ก่อนหน้านี้จองงานไว้ครับ"],
    matrix: { last_customer_intent: "payment_slip" },
    amount_thb: 19250,
  }).payment_stage, "final");
});

test("amount alone never creates membership intent", () => {
  const result = inferPaymentContextFromConversation({ texts: [], matrix: {}, amount_thb: 1999 });
  assert.equal(result.payment_stage, "");
  assert.equal(result.package_code, "");
});
