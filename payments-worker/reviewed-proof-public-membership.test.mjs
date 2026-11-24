import test from "node:test";
import assert from "node:assert/strict";
import { handleReviewedProof, REVIEWED_PROOF_PATH, validateExistingPublicMembershipOrder } from "./reviewed-proof.js";

async function review(tier, amount, { packageCode = tier, rows, body = {}, bindings = {} } = {}) {
  const ref = "synthetic_reference";
  const session = "publicmem_" + tier + "_" + "a".repeat(24);
  const order = { id: "recOrder", fields: { "Payment Reference": ref, "Package Code": tier, Amount: amount,
    payment_stage: "membership", session_id: session } };
  const proof = { id: "recProof", fields: { payment_ref: ref, amount_thb: amount, status: "pending" } };
  const writes = [], calls = [];
  const env = { ...bindings, AUTH_SERVICE_ADMIN_TO_PAYMENTS: "test", INTERNAL_TOKEN: "test",
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

// The production Worker binds writes by Airtable field ID, but default GET
// responses are keyed by the exact schema display names.
const productionBindings = {
  AT_PAYMENTS__PAYMENT_REF: "fldOO6SY49iDw8VBZ",
  AT_PAYMENTS__PACKAGE_CODE: "fldfyHYVrzbGPvMJR",
  AT_PAYMENTS__AMOUNT: "fldvCSwrUW8OMAooS",
  AT_PAYMENTS__SESSION_ID: "fld2wdhBvc8xrV6y5",
  AT_PAYMENTS__PAYMENT_STAGE: "fldrr9g8ZZjqAbdKQ",
};
test("actual Payments field-ID mappings accept Airtable display-name reads", async () => {
  for (const [tier, amount] of [["mmd_member", 690], ["elite", 4990], ["red_card", 11499]]) {
    const r = await review(tier, amount, { bindings: productionBindings });
    assert.equal(r.status, 200);
    assert.equal(r.calls[0].package_code, tier);
  }
});
test("actual Payments field-ID mappings still identify Private relabels", async () => {
  const r = await review("elite", 4990, { bindings: productionBindings, packageCode: "standard" });
  assert.equal(r.status, 409);
  assert.equal(r.result.error, "public_membership_order_context_mismatch");
  assert.deepEqual(r.calls, []);
  assert.deepEqual(r.writes, []);
});

test("official review Worker writes the same Public tier and one durable entitlement against isolated Airtable", async () => {
  const { default: worker } = await import("./index.review-wrapper.js");
  const fieldsById = Object.fromEntries(Object.entries(productionBindings).map(([key, id]) => [id, {
    AT_PAYMENTS__PAYMENT_REF: "Payment Reference", AT_PAYMENTS__PACKAGE_CODE: "Package Code",
    AT_PAYMENTS__AMOUNT: "Amount", AT_PAYMENTS__SESSION_ID: "session_id", AT_PAYMENTS__PAYMENT_STAGE: "payment_stage",
  }[key]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const [tier, amount] of [["mmd_member", 690], ["elite", 4990], ["red_card", 11499]]) {
      const ref = "synthetic_" + tier;
      const email = "fixture@example.test";
      const paidAt = "2026-11-24T05:30:00Z";
      const session = "publicmem_" + tier + "_" + "a".repeat(24);
      const tables = {
        payments: [{ id: "recPaymentFixture", fields: { "Payment Reference": ref, payment_ref: ref, "Package Code": tier, Amount: amount, "Payment Status": "Pending", session_id: session, payment_stage: "membership" } }],
        proofs: [{ id: "recProofFixture", fields: { proof_id: "proof1", payment_ref: ref, amount_thb: amount, status: "pending", paid_at: paidAt } }],
        members: [{ id: "recMemberFixture", fields: { "Contact Email": email, member_id: "fixture_member", line_id: "U1234567890abcdef1234567890abcdef" } }],
        entitlements: [], sessions: [], points_ledger: [],
      };
      const writes = [];
      const env = {
        ...productionBindings, AUTH_SERVICE_ADMIN_TO_PAYMENTS: "fixture-admin", INTERNAL_TOKEN: "fixture-payments",
        AIRTABLE_BASE_ID: "fixture-base", AIRTABLE_API_KEY: "fixture-airtable",
        AIRTABLE_TABLE_PAYMENTS: "payments", AIRTABLE_TABLE_PAYMENT_PROOFS: "proofs",
        AIRTABLE_TABLE_MEMBERS: "members", AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "entitlements",
      };
      globalThis.fetch = async (input, init) => {
        const req = new Request(input, init);
        const url = new URL(req.url);
        assert.equal(url.hostname, "api.airtable.com");
        const [, , base, table, id] = url.pathname.split("/");
        assert.equal(base, env.AIRTABLE_BASE_ID);
        const list = tables[table];
        if (!list) return Response.json({ error: "fixture_unexpected_table" }, { status: 404 });
        const existing = list.find(row => row.id === id);
        if (req.method === "GET") {
          assert.equal(url.searchParams.has("returnFieldsByFieldId"), false);
          if (id) return Response.json(existing || {}, { status: existing ? 200 : 404 });
          const formula = url.searchParams.get("filterByFormula") || "";
          const match = formula.match(/^(LOWER\()?\{([^}]+)\}\)?='([^']+)'$/);
          const results = match ? list.filter(row => {
            const value = String(row.fields[match[2]] ?? "");
            return (match[1] ? value.toLowerCase() : value) === match[3];
          }) : list;
          return Response.json({ records: results });
        }
        const body = await req.json();
        writes.push([table, req.method, body]);
        if (existing && req.method === "PATCH") {
          Object.assign(existing.fields, Object.fromEntries(Object.entries(body.fields).map(([key, value]) => [fieldsById[key] || key, value])));
          return Response.json(existing);
        }
        assert.equal(table, "entitlements");
        assert.equal(req.method, "POST");
        const created = { id: "recGrantFixture", fields: body.records[0].fields };
        list.push(created);
        return Response.json({ records: [created] });
      };
      const notify = (overrides = {}) => worker.fetch(new Request("https://example.test" + REVIEWED_PROOF_PATH, {
        method: "POST", headers: { "X-Internal-Token": "fixture-admin", "Content-Type": "application/json" },
        body: JSON.stringify({ source: "payment_review_console", decision: "approved", proof_id: "proof1",
          review_reason: "Isolated canonical identity fixture", payment_ref: ref, payment_stage: "membership",
          amount_thb: amount, package_code: tier, member_email: email, ...overrides }),
      }), env, {});
      const missingEmail = await notify({ member_email: "" });
      assert.equal(missingEmail.status, 400);
      assert.equal((await missingEmail.json()).error, "member_email_required_for_membership_payment");
      assert.deepEqual(writes, []);
      const firstResponse = await notify();
      const first = await firstResponse.json();
      assert.equal(firstResponse.status, 200, JSON.stringify(first));
      assert.equal(first.entitlement_materialized, true, JSON.stringify(first));
      assert.equal(tables.payments[0].fields["Package Code"], tier);
      assert.equal(tables.payments[0].fields["Payment Status"], "Paid");
      assert.equal(tables.payments[0].fields["Verification Status"], "verified");
      assert.equal(tables.proofs[0].fields.status, "verified");
      assert.equal(tables.entitlements.length, 1);
      const grant = structuredClone(tables.entitlements[0]);
      assert.equal(grant.fields.package_code, tier);
      assert.equal(grant.fields.membership_term, tier === "mmd_member" ? "1_year" : "2_years");
      assert.equal(new Date(grant.fields.expire_at).toISOString(), tier === "mmd_member"
        ? "2027-11-24T05:30:00.000Z" : "2028-11-24T05:30:00.000Z");
      assert.equal(writes.filter(([table]) => table === "entitlements").length, 1);
      const replayResponse = await notify();
      assert.equal(replayResponse.status, 200);
      assert.deepEqual(tables.entitlements, [grant]);
      assert.equal(writes.filter(([table]) => table === "entitlements").length, 1);
      const count = writes.length;
      const badResponse = await notify({ package_code: "standard" });
      assert.equal(badResponse.status, 409);
      assert.equal(writes.length, count);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
