import test from "node:test";
import assert from "node:assert/strict";
import { handleReviewedProof, REVIEWED_PROOF_PATH, validateExistingPublicMembershipOrder } from "./reviewed-proof.js";

async function review(tier, amount, { packageCode = tier, rows, body = {} } = {}) {
  const ref = "synthetic_reference";
  const session = "publicmem_" + tier + "_" + "a".repeat(24);
  const order = { id: "recOrder", fields: { "Payment Reference": ref, "Package Code": tier, Amount: amount,
    payment_stage: "membership", session_id: session } };
  const proof = { id: "recProof", fields: { payment_ref: ref, amount_thb: amount, status: "pending" } };
  const writes = [], calls = [];
  const env = { AUTH_SERVICE_ADMIN_TO_PAYMENTS: "test", INTERNAL_TOKEN: "test",
    AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "test", AIRTABLE_TABLE_PAYMENT_PROOFS: "proofs",
    AIRTABLE_HTTP: { fetch: async (r) => {
      const url = new URL(r.url);
      if (r.method !== "GET") { writes.push(url.pathname); return Response.json({ id: proof.id }); }
      if (url.pathname.endsWith("/proofs")) return Response.json({ records: [proof] });
      assert.ok(url.pathname.endsWith("/payments"));
      assert.equal(url.searchParams.get("filterByFormula"), "{payment_ref}='synthetic_reference'");
      return Response.json({ records: rows ? rows(order) : [order] });
    }}
  };
  const r = await handleReviewedProof(new Request("https://example.test" + REVIEWED_PROOF_PATH, {
    method: "POST", headers: { "X-Internal-Token": "test", "Content-Type": "application/json" },
    body: JSON.stringify({ source: "payment_review_console", decision: "approved", proof_id: "proof1",
      review_reason: "Synthetic approved proof", amount_thb: amount, member_email: "member@example.test",
      payment_ref: ref, payment_stage: "membership", package_code: packageCode, ...body }),
  }), env, null, async payload => {
    calls.push(payload);
    return Response.json({ ok: true, payment_ref: ref });
  });
  return { status: r.status, result: await r.json(), calls, writes, session };
}

for (const [tier, amount] of [["mmd_member", 690], ["elite", 4990], ["red_card", 11499]]) {
  test("keeps existing Public package and session: " + tier, async () => {
    const r = await review(tier, amount);
    assert.equal(r.status, 200);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].package_code, tier);
    assert.equal(r.calls[0].amount_thb, amount);
    assert.equal(r.calls[0].session_id, r.session);
  });
}
for (const [label, options, error] of [
  ["Private relabel", { packageCode: "lite" }, "public_membership_order_context_mismatch"],
  ["different Public package", { packageCode: "red_card" }, "public_membership_order_context_mismatch"],
  ["missing original order", { rows: () => [] }, "public_membership_order_not_found"],
  ["duplicate orders", { rows: o => [o, o] }, "public_membership_order_ambiguous"],
  ["stored amount disagreement", { rows: o => [{ ...o, fields: { ...o.fields, Amount: 1 } }] }, "public_membership_order_amount_mismatch"],
  ["different session", { body: { session_id: "publicmem_elite_" + "b".repeat(24) } }, "public_membership_order_context_mismatch"],
  ["cross-stage review", { body: { payment_stage: "deposit", session_id: "publicmem_elite_" + "a".repeat(24) } }, "public_membership_order_context_mismatch"],
  ["missing canonical email", { body: { member_email: "" } }, "member_email_required_for_membership_payment"],
]) {
  test("stops before settlement and proof mutation: " + label, async () => {
    const r = await review("elite", 4990, options);
    assert.ok(r.status >= 400);
    assert.equal(r.result.error, error);
    assert.deepEqual(r.calls, []);
    assert.deepEqual(r.writes, []);
  });
}
for (const [packageCode, expected, amount] of [["standard", "standard", 1199], ["lite", "standard", 1199], ["premium", "premium", 2999]]) {
  test("preserves Private review: " + packageCode, async () => {
    const r = await review(expected, amount, { packageCode, rows: () => [] });
    assert.equal(r.status, 200);
    assert.equal(r.calls[0].package_code, expected);
  });
}

test("trusted writer's existing-order check rejects a service stage without a Public request marker", () => {
  const session = "publicmem_elite_" + "a".repeat(24);
  const row = { fields: { "Payment Reference": "test_ref", "Package Code": "elite", Amount: 4990, payment_stage: "membership", session_id: session } };
  assert.throws(() => validateExistingPublicMembershipOrder({}, row, {
    paymentRef: "test_ref", paymentStage: "deposit", sessionId: "job_session", packageCode: "", amountThb: 4990,
  }), /public_membership_order_context_mismatch/);
});
