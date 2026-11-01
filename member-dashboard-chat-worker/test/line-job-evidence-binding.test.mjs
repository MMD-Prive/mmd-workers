import test from "node:test";
import assert from "node:assert/strict";
import { bindLineJobEvidence } from "../src/line-job-evidence-binding.mjs";
import { LINE_GROUP_INGRESS_INTERNALS } from "../src/line-group-ingress-front-gate.js";
const hash = "a".repeat(64);
const session = () => ({ id: "recSession", fields: { session_id: "sess_job", Client: ["recClient"], "Session Status": "confirmed" } });
const payment = () => ({ id: "recPayment", fields: { "Payment Reference": "pay_job", payment_ref: "pay_job", "Amount": 4000, amount_thb: 4000, session_id: "sess_job", payment_stage: "deposit", Client: ["recClient"], "Verification Status": "verified", "Payment Status": "paid" } });
const original = () => ({ id: "recOriginal", fields: { proof_id: "webproof_original", status: "verified", channel: "web_pay", amount_thb: 4000, payment_ref: "pay_job", Client: ["recClient"], session: ["recSession"], payment: ["recPayment"], note: JSON.stringify({ schema: "mmd_web_payment_proof_v1", evidence_sha256: hash }) } });
const analysis = () => ({ customer: { status: "matched" }, links: { client: "recClient", session: "recSession" }, extraction: { amount_thb: 4000, payment_ref: "BANK-REF", extraction_method: "qr" }, payment_intelligence: { inferred_stage: "deposit" }, job_correlation: { status: "exact", selected: { session_id: "sess_job", session_record_id: "recSession" } }, proof_precheck: { complete: true, status: "clear" } });
const duplicate = () => ({ ...analysis(), proof_precheck: { complete: true, status: "duplicate", primary_proof_id: "webproof_original", canonical: { session_id: "sess_job", session_record_id: "recSession", payment_ref: "pay_job", payment_record_id: "recPayment", payment_stage: "deposit" } } });
function fixture(changes = {}) {
 const records = { SESSIONS: session(), PAYMENTS: payment(), PAYMENT_PROOFS: original(), ...changes }, calls = [], writes = [];
 const env = { AIRTABLE_BASE_ID: "fixture", AIRTABLE_API_KEY: "test-only", AIRTABLE_TABLE_SESSIONS: "SESSIONS", AIRTABLE_TABLE_PAYMENTS: "PAYMENTS", AIRTABLE_TABLE_PAYMENT_PROOFS: "PAYMENT_PROOFS" };
 const fetcher = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init), u = new URL(req.url), table = u.pathname.split("/").at(-1);
  assert.equal(u.hostname, "api.airtable.com", "no settlement, bank or messaging calls"); calls.push(req);
  if (req.method !== "GET") {
   assert.equal(req.method, "POST"); assert.equal(table, "PAYMENT_PROOFS", "only a pending proof may be created");
   const payload = await req.json(); writes.push(payload.fields); return Response.json({ id: "recNew", ...payload });
  }
  assert.ok(u.searchParams.get("filterByFormula"), "bounded exact lookups only");
  const filter = u.searchParams.get("filterByFormula"), row = records[table];
  if (filter.includes("{proof_id}='line_new'")) return Response.json({ records: writes.map((fields) => ({ id: "recNew", fields })) });
  return Response.json({ records: row ? [row] : [], ...(changes.offset ? { offset: "more" } : {}) });
 };
 env.AIRTABLE_HTTP = { fetch: fetcher };
 return { env, calls, writes, fetcher };
}
test("explicit job and stage plus canonical client bind pending evidence without money links", async () => {
 const f = fixture(), result = await bindLineJobEvidence(f.env, analysis(), { proofId: "line_new", evidenceSha256: hash, contextText: "มัดจำ sess_job โอนแล้ว" });
 assert.equal(result.session_binding.session_id, "sess_job"); assert.equal(result.session_binding.duplicate_of, null);
 assert.equal(result.links.payment, ""); assert.equal(result.payment_intelligence.may_mark_paid, false);
 assert.equal(result.session_binding.money_truth_changed, false); assert.ok(f.calls.every(r => r.method === "GET"));
});
test("exact duplicate re-reads verified original and ledger then marks duplicate evidence only", async () => {
 const f = fixture(), result = await bindLineJobEvidence(f.env, duplicate(), { proofId: "line_new", evidenceSha256: hash });
 assert.equal(result.session_binding.duplicate_of.proof_id, "webproof_original");
 assert.equal(result.session_binding.duplicate_of.amount_thb, 4000); assert.equal(result.links.payment, "");
 assert.equal(result.proof_precheck.primary_proof_id, "line_new"); assert.equal(f.calls.length, 3);
});
for (const [name, mutate, context = ""] of [
 ["amount alone", () => {}],
 ["multiple explicit jobs", () => {}, "มัดจำ sess_job sess_other"],
 ["stage unspecified", () => {}, "sess_job"],
 ["conflicting stages", () => {}, "มัดจำ final sess_job"],
 ["unreadable evidence", a => a.extraction = {}, "มัดจำ sess_job"],
 ["ambiguous customer", a => a.customer.status = "ambiguous", "มัดจำ sess_job"],
 ["incomplete precheck", a => a.proof_precheck.complete = false, "มัดจำ sess_job"],
 ["possible duplicate", a => a.proof_precheck.status = "needs_review", "มัดจำ sess_job"],
]) test(`${name} stays unbound for manual review`, async () => {
 const a = analysis(); mutate(a); const result = await bindLineJobEvidence(fixture().env, a, { proofId: "line_new", evidenceSha256: hash, contextText: context });
 assert.equal(result.automatic_job_binding.status, "needs_review"); assert.equal(result.links.session, ""); assert.equal(result.links.payment, ""); assert.equal(result.session_binding, undefined);
});
for (const [name, mutate] of [
 ["other client", f => f.SESSIONS.fields.Client = ["other"]],
 ["multiple clients", f => f.SESSIONS.fields.Client.push("other")],
 ["cancelled session", f => f.SESSIONS.fields["Session Status"] = "cancelled"],
 ["original not approved", f => f.PAYMENT_PROOFS.fields.status = "pending"],
 ["original wrong session", f => f.PAYMENT_PROOFS.fields.session = ["other"]],
 ["amount changed", f => f.PAYMENT_PROOFS.fields.amount_thb = 5000],
 ["ledger customer changed", f => f.PAYMENTS.fields.Client = ["other"]],
 ["ledger stage changed", f => f.PAYMENTS.fields.payment_stage = "full"],
 ["reversed ledger", f => f.PAYMENTS.fields["Payment Status"] = "refunded"],
 ["unverified ledger", f => f.PAYMENTS.fields["Verification Status"] = "pending"],
 ["historical evidence", f => f.PAYMENT_PROOFS.fields.note = "mmd_historical_slip_backfill_v1"],
]) test(`${name} cannot create a duplicate binding`, async () => {
 const records = { SESSIONS: session(), PAYMENTS: payment(), PAYMENT_PROOFS: original() }; mutate(records);
 const result = await bindLineJobEvidence(fixture(records).env, duplicate(), { proofId: "line_new", evidenceSha256: hash });
 assert.equal(result.links.session, ""); assert.equal(result.session_binding, undefined);
});
test("truncated lookups and explicit job conflicts fail closed", async () => {
 for (const opts of [{ env: fixture({ offset: true }).env }, { env: fixture().env, contextText: "sess_other" }]) {
  const result = await bindLineJobEvidence(opts.env, duplicate(), { proofId: "line_new", evidenceSha256: hash, contextText: opts.contextText });
  assert.equal(result.session_binding, undefined); assert.equal(result.links.session, "");
 }
});
test("MMS and membership analyses pass through unchanged", async () => {
 for (const adjust of [a => a.job_correlation.selected.job_type = "MMS", a => a.payment_intelligence.inferred_stage = "membership", a => a.links.renewal = "recRenewal"]) {
  const a = analysis(); adjust(a); assert.equal(await bindLineJobEvidence({}, a), a);
 }
 const a = duplicate(), s = session(); s.fields.model_work_lane = "massage";
 assert.equal(await bindLineJobEvidence(fixture({ SESSIONS: s }).env, a), a);
});
test("LINE persistence keeps a separate duplicate pending proof, job scope and replay idempotency", async () => {
 const f = fixture(), savedFetch = globalThis.fetch; globalThis.fetch = f.fetcher;
 try {
  const a = analysis(); a.links.session = ""; a.customer.display_name = "Synthetic";
  const input = { proofId: "line_new", evidenceSha256: hash, sourceType: "group", sourceContext: "allowlisted_payment_group", analysis: a,
   image: { sha256: hash, body: new Uint8Array([1]), extension: "jpg", mimeType: "image/jpeg", byteSize: 1 } };
  const storage = new Map(); f.env.LINE_SLIP_EVIDENCE = { async head(k) { return storage.has(k); }, async put(k,v) { storage.set(k,v); } };
  const result = await LINE_GROUP_INGRESS_INTERNALS.persistAcceptedEvidence(f.env, input);
  assert.equal(result.verified, false); assert.equal(result.reviewProofId, "line_new"); assert.match(result.reviewUrl, /session_id=sess_job/);
  assert.equal(f.writes.length, 1); const proof = f.writes[0], note = JSON.parse(proof.note);
  assert.equal(proof.status, "pending"); assert.deepEqual(proof.session, ["recSession"]);
  assert.equal(proof.payment, undefined); assert.equal(proof.payment_ref, undefined);
  assert.equal(note.session_binding.duplicate_of.proof_id, "webproof_original"); assert.equal(note.may_mark_paid, false);
  await LINE_GROUP_INGRESS_INTERNALS.persistAcceptedEvidence(f.env, input);
  assert.equal(f.writes.length, 1, "same LINE event does not create another proof");
 } finally { globalThis.fetch = savedFetch; }
});

test("re-encoded image can bind only with the same complete bank transaction", async () => {
 const a = duplicate(), row = original();
 const transaction = { bank_transaction_ref: "BANK-REF", sender_bank: "kbank", amount_thb: 4000, paid_at: "2026-10-23T14:25:00Z" };
 row.fields.note = JSON.stringify({ schema: "mmd_web_payment_proof_v1", evidence_sha256: "b".repeat(64), extraction: transaction });
 a.extraction = { ...a.extraction, sender_bank: "kbank", paid_at: "2026-10-23T21:25:00+07:00" };
 const result = await bindLineJobEvidence(fixture({ PAYMENT_PROOFS: row }).env, a, { proofId: "line_new", evidenceSha256: hash });
 assert.equal(result.session_binding.duplicate_of.proof_id, "webproof_original");
 for (const changed of [{ ...a.extraction, paid_at: "2026-10-23T21:26:00+07:00" }, { ...a.extraction, sender_bank: "" }, { ...a.extraction, amount_thb: 5000 }]) {
  const held = await bindLineJobEvidence(fixture({ PAYMENT_PROOFS: row }).env, { ...a, extraction: changed }, { proofId: "line_new", evidenceSha256: hash });
  assert.equal(held.session_binding, undefined);
 }
});

test("original image changing after precheck prevents a duplicate binding", async () => {
 const row = original(); row.fields.note = JSON.stringify({ schema: "mmd_web_payment_proof_v1", evidence_sha256: "b".repeat(64) });
 const result = await bindLineJobEvidence(fixture({ PAYMENT_PROOFS: row }).env, duplicate(), { proofId: "line_new", evidenceSha256: hash });
 assert.equal(result.session_binding, undefined); assert.equal(result.links.session, "");
});

test("automatically bound duplicate appears in the job without increasing received or pending amounts", async () => {
 const { paymentJobSlipSummary } = await import("../../admin-worker/src/payment-job-slip-summary.js");
 const bound = await bindLineJobEvidence(fixture().env, duplicate(), { proofId: "line_new", evidenceSha256: hash });
 const proof = { id: "recNew", fields: { proof_id: "line_new", channel: "line_ofc", status: "pending", amount_thb: 4000, Client: ["recClient"], session: ["recSession"], note: JSON.stringify({ session_binding: bound.session_binding }) } };
 const job = session(); job.fields.amount_thb = 13000; job.fields["MMD — Payment Proofs"] = ["recOriginal", "recNew"];
 const rows = { sessions: [job], payments: [payment()], proofs: [original(), proof] };
 const result = await paymentJobSlipSummary("sess_job", { sessionsTable: "sessions", paymentsTable: "payments", proofsTable: "proofs", page: async table => ({ records: rows[table] }) });
 assert.equal(result.verified_paid_thb, 4000); assert.equal(result.remaining_amount_thb, 9000);
 assert.equal(result.pending_complete, true); assert.equal(result.pending_amount_thb, 0);
 assert.equal(proof.fields.status, "pending"); assert.equal(result.money_truth_changed, false);
});

test("explicit job context preserves a freshly checked existing intent link without creating money", async () => {
 const a = analysis(); a.canonical_payment = { status: "exact", session_id: "sess_job", payment_stage: "deposit", payment_ref: "pay_job", payment_record_id: "recPayment" };
 const result = await bindLineJobEvidence(fixture().env, a, { proofId: "line_new", contextText: "deposit sess_job" });
 assert.equal(result.links.payment, "recPayment"); assert.equal(result.session_binding.duplicate_of, null);
 for (const change of [p => p.fields.Client = ["other"], p => p.fields["Payment Status"] = "refunded"]) {
  const p = payment(); change(p);
  assert.equal((await bindLineJobEvidence(fixture({ PAYMENTS: p }).env, a, { proofId: "line_new", contextText: "deposit sess_job" })).session_binding, undefined);
 }
});
