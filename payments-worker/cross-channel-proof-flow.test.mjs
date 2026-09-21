import test from "node:test";
import assert from "node:assert/strict";
import { handleUnifiedSlipEvidence, stablePaymentRef, drainWebProofNotifications } from "./unified-payment-proof.js";
import { handleConfirmationDetails } from "./confirmation-details.js";
import { createConfirmTokenRecord, signConfirmToken } from "./index.js";
import { LINE_GROUP_INGRESS_INTERNALS } from "../member-dashboard-chat-worker/src/line-group-ingress-front-gate.js";
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
  const calls = { downstream: 0, proofCreates: 0, telegramDocuments: 0, telegramMessages: 0 };
  let telegramHealthy = true;
  const airtable = async (request) => {
    const url = new URL(request.url);
    assert.equal(url.hostname, "api.airtable.com");
    const [, , table, recordId] = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    const rows = records[table];
    assert.ok(rows, `unexpected table ${table}`);
    if (request.method === "GET") {
      if (recordId) return Response.json(rows.find((r) => r.id === recordId) || {}, { status: rows.some((r) => r.id === recordId) ? 200 : 404 });
      const clauses = [...(url.searchParams.get("filterByFormula") || "").matchAll(/\{([^}]+)\}='([^']*)'/g)];
      assert.ok(clauses.length, "expected exact filter");
      return Response.json({ records: rows.filter((r) => clauses.every(([, field, value]) => r.fields[field] === value)) });
    }
    const body = await request.json();
    if (request.method === "POST") {
      assert.equal(table, "Proofs", "intake never writes money truth");
      const row = { id: `recProof${++calls.proofCreates}`, fields: body.fields || body.records[0].fields };
      rows.push(row);
      return Response.json(body.records ? { records: [row] } : row);
    }
    assert.equal(request.method, "PATCH");
    assert.equal(table, "Proofs");
    const row = rows.find((r) => r.id === recordId);
    Object.assign(row.fields, body.fields);
    return Response.json(row);
  };
  const env = {
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
        assert.ok((await form.get("document").arrayBuffer()).byteLength);
      } else calls.telegramMessages++;
      return Response.json({ ok: telegramHealthy, message_id: telegramHealthy ? 42 : null }, { status: telegramHealthy ? 200 : 503 });
    } },
  };
  const iat = Math.floor(Date.now() / 1000);
  const claims = { role: "customer", kind: "customer_confirm", session_id: "sess-shared", payment_ref: paymentRef, payment_type: "deposit", iat, exp: iat + 3600 };
  const token = await signConfirmToken(claims, env.PAYMENT_CONFIRMATION_SIGNING_SECRET);
  await createConfirmTokenRecord(env, token, claims);
  return {
    env, records, calls, bucket, paymentRef, token, airtable,
    telegramHealthy(value) { telegramHealthy = value; },
    async web() {
      const form = new FormData();
      for (const [name, value] of Object.entries({ payment_ref: paymentRef, session_id: "sess-shared", payment_stage: "deposit", source_page: "sigil_pay_v22", t: token })) form.append(name, value);
      form.append("file", new File(["synthetic proof, no customer data"], "proof.png", { type: "image/png" }));
      const response = await handleUnifiedSlipEvidence(new Request("https://sigil.mmdbkk.com/v1/pay/slip/evidence", { method: "POST", headers: { origin: "https://www.mmdbkk.com" }, body: form }), env, async () => {
        calls.downstream++;
        return Response.json({ ok: true, evidence_only: true });
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(response.headers.get("access-control-allow-origin"), "https://www.mmdbkk.com");
      return body;
    },
    async line() {
      const image = { body: new TextEncoder().encode("synthetic LINE proof").buffer, mimeType: "image/png", extension: "png", byteSize: 20, sha256: "test-hash" };
      return LINE_GROUP_INGRESS_INTERNALS.persistAcceptedEvidence(env, {
        proofId: "line_test", image, sourceType: "user", lineUserId: "U11111111111111111111111111111111",
        analysis: {
          accepted: true, customer: { status: "matched", display_name: "Test Customer", source: "clients.line_user_id" },
          links: { client: "recClient", session: "recSession" },
          extraction: { payment_ref: "BANK-TRANSACTION-123", amount_thb: 7500 },
          payment_intelligence: { inferred_stage: "deposit", inferred_label: "Deposit" },
          job_correlation: { status: "exact", selected: { session_record_id: "recSession", session_id: "sess-shared" } },
          ops_route: { topic: "payment", reason: "service_payment" },
        },
      });
    },
    async details() {
      const response = await handleConfirmationDetails(new Request("https://sigil.mmdbkk.com/v1/confirm/details", {
        method: "POST", headers: { "content-type": "application/json", origin: "https://www.mmdbkk.com" }, body: JSON.stringify({ t: token, expected_role: "customer" }),
      }), env);
      assert.equal(response.status, 200);
      return response.json();
    },
  };
}

test("LINE first: bank ref is preserved, payment page sees evidence, web upload is duplicate", async () => {
  const h = await fixture();
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => h.airtable(input instanceof Request ? input : new Request(input, init));
  try {
    await h.line();
    const proof = h.records.Proofs[0];
    assert.equal(proof.fields.payment_ref, h.paymentRef);
    assert.deepEqual(proof.fields.payment, ["recPayment"]);
    assert.equal(JSON.parse(proof.fields.note).extraction.bank_transaction_ref, "BANK-TRANSACTION-123");
    assert.equal(proof.fields.status, "pending");
    const details = await h.details();
    assert.equal(details.payment.proof_received, true);
    assert.equal(details.payment.verified, false);
    assert.equal((await h.web()).duplicate, true);
    assert.equal(h.calls.proofCreates, 1);
    assert.equal(h.calls.downstream, 0);
    assert.equal(h.calls.telegramDocuments, 0);
  } finally { globalThis.fetch = original; }
});

test("web first: LINE reuses canonical evidence without creating or notifying twice", async () => {
  const h = await fixture();
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => h.airtable(input instanceof Request ? input : new Request(input, init));
  try {
    assert.equal((await h.web()).telegram_file_received, true);
    assert.equal((await h.line()).deduped, true);
    assert.equal(h.calls.proofCreates, 1);
    assert.equal(h.calls.telegramDocuments, 1);
    assert.equal(h.calls.telegramMessages, 0);
    assert.equal(h.records.Proofs[0].fields.status, "pending");
  } finally { globalThis.fetch = original; }
});

test("Telegram failure retries the saved proof without recreating proof or payment", async () => {
  const h = await fixture();
  h.telegramHealthy(false);
  const first = await h.web();
  assert.equal(first.evidence_submitted, true);
  assert.equal(first.telegram_retry_queued, true);
  assert.equal(first.telegram_file_received, false);
  assert.equal((await h.web()).duplicate, true);
  assert.equal(h.calls.telegramDocuments, 1, "respect retry backoff");
  h.telegramHealthy(true);
  const sweep = await drainWebProofNotifications(h.env, { now: Date.now() + 120000 });
  assert.equal(sweep.delivered, 1);
  assert.equal(h.calls.telegramDocuments, 2);
  assert.equal(h.calls.proofCreates, 1);
  assert.equal(h.calls.downstream, 1);
  assert.match(h.records.Proofs[0].fields.note, /telegram_delivered=true/);
  assert.equal(h.records.Proofs[0].fields.status, "pending");
  await h.web();
  await drainWebProofNotifications(h.env, { now: Date.now() + 300000 });
  assert.equal(h.calls.telegramDocuments, 2);
});

test("intake errors allow the configured website origin without broadening CORS", async () => {
  for (const origin of ["https://www.mmdbkk.com", "https://untrusted.example"]) {
    const form = new FormData();
    form.append("payment_ref", "pay-1");
    form.append("source_page", "sigil_pay_v22");
    const response = await handleUnifiedSlipEvidence(new Request("https://sigil.mmdbkk.com/v1/pay/slip/evidence", {
      method: "POST", headers: { origin }, body: form,
    }), { ALLOWED_ORIGINS: '"https://www.mmdbkk.com"' }, () => assert.fail("missing-token request wrote evidence"));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("access-control-allow-origin"), origin.includes("mmdbkk.com") ? origin : null);
  }
});
