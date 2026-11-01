import test from 'node:test';
import assert from 'node:assert/strict';
import {handleUnifiedSlipEvidence,stablePaymentRef,handleUnifiedPaymentIntent} from './unified-payment-proof.js';
import {handleConfirmationDetails} from './confirmation-details.js';
import {memoryR2} from '../shared/test/payment-memory-r2.mjs';
async function fixture(tier) {
  const amount=tier==='standard'?1000:2500;
  const sessionId='liffrenew_'+tier+'_'+'a'.repeat(24);
  const paymentRef = await stablePaymentRef(sessionId, "membership");
  const bucket = memoryR2();
  const kv = new Map();
  const records = {
    Proofs: [],
    Payments: [{ id: "recPayment", fields: {
      payment_ref: paymentRef, "Payment Reference": paymentRef, session_id: sessionId, payment_stage: "membership", package_code:tier, "Package Code":tier, amount_thb: amount, Client: ["recClient"],
      fldOO6SY49iDw8VBZ: paymentRef, fld2wdhBvc8xrV6y5: sessionId, fldrr9g8ZZjqAbdKQ: "membership", fldvCSwrUW8OMAooS: amount, fldEJ1hmm7KwWuI6q: "pending",
    } }],
    Sessions: [{ id: "recSession", fields: {
      session_id: sessionId, Client: ["recClient"], client_name: "Test Customer", model_name: "Test Model",
      fldLTq2kZbyRv22IA: sessionId, fldojgjSQLaO0uQLX: paymentRef, fldhwC79ndbnEXSZz: amount, fldvJowquu8RrsOMc: amount, fldTY5lE6m0kQf72n: "pending",
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
    AUTH_SERVICE_PAYMENTS_TO_TELEGRAM: "test", AUTH_SERVICE_LINE_TO_TELEGRAM: "test", TELEGRAM_OPS_CHAT_ID: "fixture-chat", TG_THREAD_PAYMENTS_MEMBERSHIP:"22", TG_THREAD_MEMBERSHIP:"22",
    TELEGRAM_WORKER: { async fetch(request) {
      if (request.url.endsWith("/proof-document")) {
        calls.telegramDocuments++;
        const form = await request.formData();
        assert.equal(form.get("message_thread_id"), "22");
        assert.match(String(form.get("caption") || ""), /สลิปลูกค้าเข้าแล้ว/);
        assert.match(String(form.get("caption") || ""), /Official Verify/);
        assert.match(String(form.get("caption") || ""), /ยังไม่ปล่อยลิงก์ลูกค้า \/ โมเดล/);
        assert.ok((await form.get("document").arrayBuffer()).byteLength);
      } else {
        calls.telegramMessages++;
        calls.telegramPayloads.push(await request.clone().json().catch(() => ({})));
      }
      return Response.json({ ok: telegramHealthy, message_id: telegramHealthy ? 42 : null }, { status: telegramHealthy ? 200 : 503 });
    } },
  };
  const handoffResponse=await handleUnifiedPaymentIntent(new Request('https://fixture.invalid/v1/pay/verify',{method:'POST',body:JSON.stringify({session_id:sessionId,payment_stage:'membership',package_code:tier,amount})}),env,async request=>{
    const body=await request.json();assert.equal(body.session_id,sessionId);assert.equal(body.payment_ref,paymentRef);
    return Response.json({ok:true,payment_ref:paymentRef,session_id:sessionId});
  });
  const handoff=await handoffResponse.json();assert.equal(handoff.ok,true);
  const checkout=new URL(handoff.customer_payment_url);assert.equal(checkout.pathname,'/pay/checkout');
  assert.deepEqual([...checkout.searchParams.keys()],['t']);const token=checkout.searchParams.get('t');assert.ok(token);
  return {
    env, records, calls, bucket, paymentRef, token, airtable,
    telegramHealthy(value) { telegramHealthy = value; },
    async web(content = "synthetic proof, no customer data") {
      const form = new FormData();
      for (const [name, value] of Object.entries({ payment_ref: paymentRef, session_id: sessionId, payment_stage: "membership", source_page: "public_pay", t: token })) form.append(name, value);
      form.append("file", new File([content], "proof.png", { type: "image/png" }));
      const response = await handleUnifiedSlipEvidence(new Request("https://sigil.mmdbkk.com/v1/pay/slip/evidence", { method: "POST", headers: { origin: "https://www.mmdbkk.com" }, body: form }), env, async () => {
        calls.downstream++;
        return Response.json({ ok: true, evidence_only: true });
      });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(response.headers.get("access-control-allow-origin"), "https://www.mmdbkk.com");
      return body;
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

for(const tier of ['standard','premium'])test(`Renewal ${tier}: signed checkout proof enters pending and is readable again without changing money/member truth`,async()=>{
 const h=await fixture(tier);const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>h.airtable(input instanceof Request?input:new Request(input,init));
 const moneyBefore=structuredClone(h.records.Payments),sessionsBefore=structuredClone(h.records.Sessions);
 const image=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/yQAAAAASUVORK5CYII=','base64'));
 try{
  const result=await h.web(image);
  assert.equal(result.evidence_submitted,true);assert.equal(result.payment_status,'pending');
  assert.equal(result.verification_status,'pending_verification');
  assert.equal(h.records.Proofs.length,1);const proof=h.records.Proofs[0];
  assert.equal(proof.fields.status,'pending');assert.equal(proof.fields.amount_thb,tier==='standard'?1000:2500);
  assert.equal(proof.fields.payment_ref,h.paymentRef);assert.deepEqual(proof.fields.payment,['recPayment']);
  const imageKeys=[...h.bucket.objects.keys()].filter(k=>k.startsWith('web-payment-proofs/')&&k.endsWith('.png'));
  assert.equal(imageKeys.length,1);const stored=await h.bucket.get(imageKeys[0]);
  assert.deepEqual(new Uint8Array(await stored.arrayBuffer()),image);
  const reopened=await h.details();assert.equal(reopened.payment.proof_received,true);assert.equal(reopened.payment.verified,false);
  const retry=await h.web(image);assert.equal(retry.duplicate,true);assert.equal(h.calls.proofCreates,1);
  assert.deepEqual(h.records.Payments,moneyBefore);assert.deepEqual(h.records.Sessions,sessionsBefore);
 }finally{globalThis.fetch=original;}
});
