// All network, Airtable, R2, KV and Telegram effects are intercepted or in memory.
// Exercises the deployed review-wrapper -> phase1 -> legacy compatibility chain.
import test from "node:test";
import assert from "node:assert/strict";
import { stablePaymentRef } from "./unified-payment-proof.js";
import { createConfirmTokenRecord, signConfirmToken } from "./index.js";
import worker from "./index.review-wrapper.js";
import { memoryR2 } from "../shared/test/payment-memory-r2.mjs";

async function fixture() {
  const paymentRef = await stablePaymentRef("sess-shared", "deposit");
  const bucket = memoryR2();
  const kv = new Map();
  const records = {
    Proofs: [],
    Payments: [{ id: "recPayment", fields: {
      payment_ref: paymentRef, "Payment Reference": paymentRef, session_id: "sess-shared", payment_stage: "deposit", amount_thb: 7500, Client: ["recClient"],
      fldOO6SY49iDw8VBZ: paymentRef, fld2wdhBvc8xrV6y5: "sess-shared", fldrr9g8ZZjqAbdKQ: "deposit", fldvCSwrUW8OMAooS: 7500, fldEJ1hmm7KwWuI6q: "pending",
    } }],
    Sessions: [{ id: "recSession", fields: {
      session_id: "sess-shared", Client: ["recClient"], client_name: "Test Customer", model_name: "Test Model",
      fldLTq2kZbyRv22IA: "sess-shared", fldojgjSQLaO0uQLX: paymentRef, fldhwC79ndbnEXSZz: 15000, fldvJowquu8RrsOMc: 7500, fldTY5lE6m0kQf72n: "pending",
    } }],
  };
  const calls = { downstream: 0, proofCreates: 0, telegramDocuments: 0, telegramMessages: 0, telegramPayloads: [] };
  let telegramHealthy = true;
  const airtable = async (request) => {
    const url = new URL(request.url);
    assert.equal(url.hostname, "api.airtable.com");
    const [, , table, recordId] = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    const rows = records[table];
    assert.ok(rows, `unexpected table ${table}`);
    if (request.method === "GET") {
      if (recordId) return Response.json(rows.find((r) => r.id === recordId) || {}, { status: rows.some((r) => r.id === recordId) ? 200 : 404 });
      const formula = url.searchParams.get("filterByFormula") || "";
      if (formula.startsWith("OR(FIND(")) {
        const values = [...formula.matchAll(/FIND\('([^']+)'/g)].map(match => match[1]);
        const refs = [...formula.matchAll(/\{payment_ref\}='([^']+)'/g)].map(match => match[1]);
        return Response.json({ records: rows.filter(row => values.some(value => String(row.fields.note || "").includes(value)) || refs.includes(row.fields.payment_ref)) });
      }
      const clauses = [...formula.matchAll(/\{([^}]+)\}='([^']*)'/g)];
      assert.ok(clauses.length, "expected exact filter");
      return Response.json({ records: rows.filter((r) => clauses.every(([, field, value]) => r.fields[field] === value)) });
    }
    const body = await request.json();
    if (request.method === "POST") {
      if (table === "Payments") { const row = { id: "recLegacyPayment", fields: body.fields || body.records[0].fields }; rows.push(row); calls.legacyPaymentCreates = (calls.legacyPaymentCreates || 0) + 1; return Response.json({ records: [row] }); }
      assert.equal(table, "Proofs");
      const row = { id: `recProof${++calls.proofCreates}`, fields: body.fields || body.records[0].fields };
      rows.push(row);
      return Response.json(body.records ? { records: [row] } : row);
    }
    assert.equal(request.method, "PATCH");
    assert.ok(["Proofs", "Payments"].includes(table));
    const row = rows.find((r) => r.id === recordId);
    Object.assign(row.fields, body.fields);
    return Response.json(row);
  };
  const env = {
    AT_PAYMENTS__PAYMENT_STATUS: "fldEJ1hmm7KwWuI6q", AT_PAYMENTS__VERIFICATION_STATUS: "fldJ7a0Ube9F0bmRy",
    AIRTABLE_BASE_ID: "app-test", AIRTABLE_API_KEY: "test",
    AIRTABLE_TABLE_PAYMENTS: "Payments", AIRTABLE_TABLE_PAYMENT_PROOFS: "Proofs", AIRTABLE_TABLE_SESSIONS: "Sessions",
    AIRTABLE_HTTP: { fetch: airtable },
    LINE_SLIP_EVIDENCE: bucket, PAYMENT_SLIP_EVIDENCE: bucket,
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "test-only", ALLOWED_ORIGINS: "https://www.mmdbkk.com",
    PAY_SESSIONS_KV: { async put(key, value) { kv.set(key, value); }, async get(key) { return kv.get(key); } },
    AUTH_SERVICE_PAYMENTS_TO_TELEGRAM: "test", AUTH_SERVICE_LINE_TO_TELEGRAM: "test", TELEGRAM_OPS_CHAT_ID: "-1003546439681",
    TELEGRAM_WORKER: { async fetch(request) {
      if (request.url.endsWith("/proof-document")) {
        calls.telegramDocuments++;
        const form = await request.formData();
        assert.equal(form.get("message_thread_id"), "22");
        assert.match(String(form.get("caption") || ""), /สถานะ:/);
        assert.match(String(form.get("caption") || ""), /ยังไม่ยืนยันเงินเข้า/);
        assert.match(String(form.get("caption") || ""), /บัดเจ็ตรวม:/);
        assert.ok((await form.get("document").arrayBuffer()).byteLength);
      } else {
        calls.telegramMessages++;
        calls.telegramPayloads.push(await request.clone().json().catch(() => ({})));
      }
      return Response.json({ ok: telegramHealthy, message_id: telegramHealthy ? 42 : null }, { status: telegramHealthy ? 200 : 503 });
    } },
  };
  const iat = Math.floor(Date.now() / 1000);
  const claims = { role: "customer", kind: "customer_confirm", session_id: "sess-shared", payment_ref: paymentRef, payment_type: "deposit", iat, exp: iat + 3600 };
  const token = await signConfirmToken(claims, env.PAYMENT_CONFIRMATION_SIGNING_SECRET);
  await createConfirmTokenRecord(env, token, claims);
  return { env, records, calls, bucket, paymentRef, token, airtable };
}

const scenarios = [
  { name: "missing signed token", token: "", status: 401, error: "confirmation_token_required" },
  { name: "invalid signed token", token: "invalid-test-token", status: 401 },
  { name: "mismatched payment reference", ref: "pay_other", status: 409, error: "confirmation_payment_ref_mismatch" },
  { name: "mismatched session", session: "sess-other", status: 409, error: "confirmation_session_mismatch" },
  { name: "mismatched payment stage", stage: "full", status: 409, error: "confirmation_payment_stage_mismatch" },
  { name: "missing canonical payment", noPayment: true, status: 409, error: "canonical_payment_not_found" },
  { name: "missing slip file", noFile: true, status: 400, error: "payment_proof_file_required" },
  { name: "valid customer slip", status: 200 },
];
for (const scenario of scenarios) {
  test(`SIGIL V21 production review wrapper: ${scenario.name}`, async () => {
    const h = await fixture();
    if (scenario.noPayment) h.records.Payments.length = 0;
    const original = globalThis.fetch;
    const externalCalls = [];
    globalThis.fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      externalCalls.push({ host: new URL(request.url).hostname, method: request.method });
      return h.airtable(request);
    };
    try {
      const form = new FormData();
      for (const [name, value] of Object.entries({
        payment_ref: scenario.ref || h.paymentRef,
        session_id: scenario.session || "sess-shared",
        payment_stage: scenario.stage || "deposit",
        payment_type: scenario.stage || "deposit",
        source_page: "sigil_pay_v21",
        proof_type: "payment_slip",
        payment_method: "bank_transfer",
        t: scenario.token ?? h.token,
      })) if (value) form.append(name, value);
      if (!scenario.noFile) form.append("file", new File(["synthetic proof; no customer data"], "proof.png", { type: "image/png" }));
      const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/v1/pay/slip/evidence", {
        method: "POST", headers: { origin: "https://www.mmdbkk.com" }, body: form,
      }), h.env, {});
      const body = await response.json();
      assert.equal(response.status, scenario.status, JSON.stringify({ body, calls: h.calls }));
      if (scenario.error) assert.equal(body.error, scenario.error);
      assert.ok(externalCalls.every(call => call.host === "api.airtable.com"));
      if (scenario.status !== 200) {
        assert.equal(h.calls.proofCreates, 0);
        assert.equal(h.calls.legacyPaymentCreates || 0, 0);
        assert.equal(h.calls.telegramDocuments, 0);
      } else {
        assert.equal(body.ok, true);
        assert.equal(body.evidence_only, true);
        assert.equal(body.official_verification_required, true);
        assert.equal(body.payment_status, "pending");
        assert.equal(body.verification_status, "pending_verification");
        assert.equal(body.evidence_submitted, true);
        assert.equal(body.storage, "cloudflare_r2");
        assert.equal(body.telegram_file_received, true);
        assert.equal(body.telegram_thread_id, 22);
        assert.equal(h.calls.proofCreates, 1);
        assert.equal(h.calls.telegramDocuments, 1);
        assert.equal(h.records.Proofs[0].fields.status, "pending");
        assert.equal(h.records.Payments.length, 1);
        assert.equal(h.records.Payments[0].fields.fldEJ1hmm7KwWuI6q, "Pending");
        assert.equal(body.customer_confirmation_url, undefined);
        assert.equal(body.model_confirmation_url, undefined);
      }
    } finally { globalThis.fetch = original; }
  });
}
