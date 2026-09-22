import test from "node:test";
import assert from "node:assert/strict";
import { resolveLineCanonicalPayment } from "./canonical-payment-evidence.mjs";

const analysis = () => ({
  customer: { status: "matched" },
  links: { client: "recClient", session: "recSession" },
  extraction: { amount_thb: 7500, payment_ref: "BANK-REF" },
  payment_intelligence: { inferred_stage: "deposit" },
  job_correlation: { status: "exact", selected: { session_record_id: "recSession", session_id: "sess-1" } },
});
const payment = () => ({ id: "recPay", fields: { payment_ref: "pay_123", session_id: "sess-1", payment_stage: "deposit", amount_thb: 7500, Client: ["recClient"] } });
const envFor = (records, offset) => ({
  AIRTABLE_BASE_ID: "base", AIRTABLE_API_KEY: "test",
  AIRTABLE_HTTP: { async fetch(request) {
    assert.match(new URL(request.url).searchParams.get("filterByFormula"), /session_id/);
    return Response.json({ records, offset });
  } },
});

test("an exact customer/session/stage/amount resolves to the stored canonical reference", async () => {
  const result = await resolveLineCanonicalPayment(envFor([payment()]), analysis());
  assert.equal(result.status, "exact");
  assert.equal(result.payment_ref, "pay_123");
  assert.equal(result.payment_record_id, "recPay");
});

test("names or amounts alone never bridge to a canonical payment", async () => {
  const a = analysis();
  a.customer.status = "ambiguous";
  assert.equal((await resolveLineCanonicalPayment({}, a)).status, "unresolved");
  a.customer.status = "matched";
  a.job_correlation.status = "ambiguous";
  assert.equal((await resolveLineCanonicalPayment({}, a)).status, "unresolved");
});

for (const [label, changes] of Object.entries({
  "other client": { Client: ["recOther"] }, "other session": { session_id: "sess-2" },
  "different stage": { payment_stage: "final" }, "different amount": { amount_thb: 7501 },
  "cancelled payment": { payment_status: "cancelled" },
})) test(`${label} cannot lock the customer's payment page`, async () => {
  const p = payment();
  Object.assign(p.fields, changes);
  assert.equal((await resolveLineCanonicalPayment(envFor([p]), analysis())).status, "unresolved");
});

test("duplicate canonical candidates and truncated queries remain review-only", async () => {
  assert.equal((await resolveLineCanonicalPayment(envFor([payment(), { ...payment(), id: "recOther" }]), analysis())).reason, "canonical_payment_ambiguous");
  assert.equal((await resolveLineCanonicalPayment(envFor([payment()], "more"), analysis())).reason, "canonical_payment_candidates_truncated");
});
