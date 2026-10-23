import test from "node:test";
import assert from "node:assert/strict";
import { inspectPaymentProof, paymentProofReviewUrl } from "./payment-proof-precheck.mjs";
const hash = "a".repeat(64), otherHash = "b".repeat(64);
const fields = (id, channel = "web_pay", extra = {}) => ({ proof_id: id, channel, status: "pending", Client: ["client-1"], amount_thb: 4000, note: JSON.stringify({ schema: "mmd_web_payment_proof_v1", evidence_sha256: hash }), ...extra });
const original = () => ({ id: "proof-record", fields: fields("webproof_first", "web_pay", { payment_ref: "pay-1", payment: ["payment-1"], session: ["session-1"] }) });
const incoming = () => ({ fields: fields("line_second", "line_ofc", { amount_thb: null }) });
function fixture(proofs = [original()], options = {}) {
 const calls = [];
 const payments = options.payments || [{ id: "payment-1", fields: { payment_ref: "pay-1", session_id: "sess-1", payment_stage: "deposit", amount_thb: 4000, Client: ["client-1"], payment_status: "pending" } }];
 const sessions = options.sessions || [{ id: "session-1", fields: { session_id: "sess-1", Client: ["client-1"], client_name: "Synthetic", model_name: "Synthetic Model" } }];
 const env = { AIRTABLE_BASE_ID: "fixture", AIRTABLE_API_KEY: "fixture-only", AIRTABLE_TABLE_PAYMENT_PROOFS: "proofs", AIRTABLE_TABLE_PAYMENTS: "payments", AIRTABLE_TABLE_SESSIONS: "sessions", AIRTABLE_HTTP: { async fetch(req) {
   assert.equal(req.method, "GET", "precheck must not mutate anything"); calls.push(req);
   const u = new URL(req.url), formula = u.searchParams.get("filterByFormula");
   assert.ok(formula, "no global proof scan");
   const table = u.pathname.split("/").at(-1);
   if (table === "proofs") return Response.json({ records: proofs, ...(options.offset ? { offset: "more" } : {}) });
   const rs = table === "payments" ? payments.filter(p => formula.includes(`'${p.fields.payment_ref}'`)) : sessions.filter(s => formula.includes(`'${s.fields.session_id}'`));
   return Response.json({ records: rs });
 } } };
 return { env, calls };
}
test("same image across web and LINE resolves only through canonical customer, payment and session", async () => {
 const f = fixture(), before = JSON.stringify(original()), result = await inspectPaymentProof(f.env, incoming());
 assert.equal(result.status, "duplicate"); assert.equal(result.duplicate_count, 1); assert.equal(result.primary_proof_id, "webproof_first");
 assert.equal(result.canonical.session_id, "sess-1"); assert.equal(result.canonical.payment_ref, "pay-1");
 assert.match(result.review_url, /proof_id=webproof_first&focus=verify&session_id=sess-1/);
 assert.equal(result.money_truth_changed, false); assert.equal(result.official_verification_required, true);
 assert.equal(JSON.stringify(original()), before); assert.equal(f.calls.length, 3);
});
test("bank reference requires matching amount and full transfer time when image bytes differ", async () => {
 const row = original(); row.fields.note = JSON.stringify({ schema: "line_payment_evidence_v4", extraction: { bank_transaction_ref: "BANK-123", sender_bank: "kbank", amount_thb: 4000, paid_at: "2026-10-23T21:25:00+07:00" } });
 const input = incoming(); input.fields.note = JSON.stringify({ schema: "line_payment_evidence_v4", evidence_sha256: otherHash, extraction: { bank_transaction_ref: "BANK-123", sender_bank: "kbank", amount_thb: 4000, paid_at: "2026-10-23T14:25:00Z" } });
 assert.equal((await inspectPaymentProof(fixture([row]).env, input)).status, "duplicate");
 input.fields.note = JSON.stringify({ schema: "line_payment_evidence_v4", extraction: { bank_transaction_ref: "BANK-123", amount_thb: 4000 } });
 const incomplete = await inspectPaymentProof(fixture([row]).env, input);
 assert.equal(incomplete.status, "needs_review"); assert.equal(incomplete.canonical, null);
});
for (const [label, change] of Object.entries({
 "another customer": x => x.fields.Client = ["client-2"],
 "ambiguous customer": x => x.fields.Client = ["client-1", "client-2"],
 "different amount": x => x.fields.amount_thb = 5000,
 "different existing payment": x => { x.fields.payment = ["different-payment"]; x.fields.payment_ref = "pay-other"; },
})) test(`${label} never redirects an approval to the matched job`, async () => {
 const input = incoming(); change(input); const result = await inspectPaymentProof(fixture().env, input);
 assert.equal(result.status, "needs_review"); assert.equal(result.canonical, null); assert.equal(result.primary_proof_id, "line_second");
});
test("multiple canonical jobs and truncated proof queries remain review-only", async () => {
 const row = original(), row2 = original(); row2.id = "proof-2"; row2.fields = { ...row2.fields, proof_id: "proof_other", payment_ref: "pay-2", payment: ["payment-2"], session: ["session-2"] };
 const f = fixture([row, row2], { payments: [{ id:"payment-1",fields:{payment_ref:"pay-1",session_id:"sess-1",payment_stage:"deposit",Client:["client-1"]} },{ id:"payment-2",fields:{payment_ref:"pay-2",session_id:"sess-2",payment_stage:"deposit",Client:["client-1"]} }], sessions:[{id:"session-1",fields:{session_id:"sess-1",Client:["client-1"]}},{id:"session-2",fields:{session_id:"sess-2",Client:["client-1"]}}] });
 assert.equal((await inspectPaymentProof(f.env, incoming())).status, "needs_review");
 assert.equal((await inspectPaymentProof(fixture([row], {offset:true}).env, incoming())).status, "unavailable");
});
test("unreadable, failed, historical or unconfigured evidence never claims a complete duplicate check", async () => {
 const input=incoming(); input.fields.note=""; assert.equal((await inspectPaymentProof({},input)).status,"insufficient_evidence");
 assert.equal((await inspectPaymentProof({},incoming())).complete,false);
 const row=original(); row.fields.note=JSON.stringify({schema:"mmd_historical_slip_backfill_v1",evidence_sha256:hash});
 assert.equal((await inspectPaymentProof(fixture([row]).env,incoming())).duplicate_count,0);
 assert.equal(paymentProofReviewUrl("../unsafe"),null);
 input.fields.note=JSON.stringify({schema:"customer_note",evidence_sha256:hash});
 assert.equal((await inspectPaymentProof(fixture().env,input)).status,"insufficient_evidence");
});
