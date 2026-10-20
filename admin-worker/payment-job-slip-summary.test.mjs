import test from "node:test";
import assert from "node:assert/strict";
import {
  paymentJobSlipSummary as read,
  completeSummaryRows,
} from "./src/payment-job-slip-summary.js";
import { handlePaymentReviewRequest } from "./src/payment-review-runtime.js";
const sid = "synthetic-job";
const session = {
  id: "rec-session",
  fields: { session_id: sid, amount_thb: 5000, Client: ["rec-client"] },
};
const payment = (id, amount, verified = false, stage = "deposit") => ({
  id,
  fields: {
    session_id: sid,
    "Payment Reference": `pay-${id}`,
    Amount: amount,
    payment_stage: stage,
    "Verification Status": verified ? "verified" : "pending_review",
    "Payment Status": verified ? "Paid" : "Pending",
    Client: ["rec-client"],
  },
});
const proof = (id, amount, p, stage = "deposit") => ({
  id: `proof-row-${id}`,
  fields: {
    proof_id: id,
    status: "pending",
    amount_thb: amount,
    payment_ref: p ? `pay-${p}` : "",
    payment: p ? [p] : [],
    session_id: sid,
    session: [session.id],
    payment_stage: stage,
  },
});
function fixture(payments = [], proofs = [], sessions = [session]) {
  const calls = [];
  return {
    calls,
    deps: {
      sessionsTable: "sessions",
      paymentsTable: "payments",
      proofsTable: "proofs",
      page: async (table, params) => {
        calls.push({ table, params });
        return { records: { sessions, payments, proofs }[table] };
      },
    },
  };
}
test("two pending slips are advisory only; partial and fully verified states use the ledger", async () => {
  for (const [v1, v2, paid, pending, due] of [
    [false, false, 0, 5000, 5000],
    [true, false, 4000, 1000, 1000],
    [true, true, 5000, 0, 0],
  ]) {
    const f = fixture(
      [payment("first", 4000, v1), payment("second", 1000, v2)],
      [proof("first", 4000, "first"), proof("second", 1000, "second")],
    );
    const s = await read(sid, f.deps);
    assert.equal(s.verified_paid_thb, paid);
    assert.equal(s.pending_amount_thb, pending);
    assert.equal(s.remaining_amount_thb, due);
    assert.equal(s.projected_remaining_thb, 0);
    assert.equal(s.money_truth_changed, false);
    assert.equal(s.advisory_only, true);
    assert(f.calls.every((c) => c.params.maxRecords === undefined));
  }
});
test("reads proofs linked directly to the job as well as by payment; repeated read rows count once", async () => {
  const f = fixture([], [proof("first", 4000), proof("second", 1000)]);
  const s = await read(sid, f.deps);
  assert.equal(s.pending_amount_thb, 5000);
  assert.equal(s.pending_proof_count, 2);
});
test("duplicate references, image hashes, missing amount, client/session conflicts never guess pending totals", async () => {
  for (const mutate of [
    (a) => {
      a[1].fields.payment_ref = a[0].fields.payment_ref;
    },
    (a) => {
      a[0].fields.image_sha256 = "same";
      a[1].fields.image_sha256 = "same";
    },
    (a) => {
      a[1].fields.amount_thb = null;
    },
    (a) => {
      a[1].fields.session_id = "other-job";
    },
    (a) => {
      a[1].fields.client = ["other-client"];
    },
    (a) => {
      a[1].fields.payment = ["different-payment"];
    },
    (a) => {
      a[1].fields.payment_stage = "";
    },
  ]) {
    const proofs = [proof("first", 4000), proof("second", 1000)];
    proofs[0].fields.payment_ref = "unmatched-first";
    mutate(proofs);
    const s = await read(sid, fixture([], proofs).deps);
    assert.equal(s.pending_complete, false);
    assert.equal(s.pending_amount_thb, null);
    assert.equal(s.projected_remaining_thb, null);
    assert.equal(s.remaining_amount_thb, 5000);
  }
});
test("tips are excluded; deposit shortfall differs from whole job remaining; satang and overpayment retained", async () => {
  const f = fixture(
    [payment("deposit", 1000, true), payment("tip", 500, true, "tips")],
    [proof("extra", 200), proof("tip", 500, "tip", "tips")],
  );
  const s = await read(sid, f.deps);
  assert.equal(s.verified_paid_thb, 1000);
  assert.equal(s.remaining_amount_thb, 4000);
  assert.equal(s.pending_amount_thb, 200);
  assert.equal(s.deposit.remaining_thb, 500);
  assert.equal(s.deposit.projected_remaining_thb, 300);
  const extra = await read(
    sid,
    fixture([], [proof("a", 4000.01), proof("b", 1000.02)]).deps,
  );
  assert.equal(extra.projected_remaining_thb, 0);
  assert.equal(extra.projected_overpaid_thb, 0.03);
});
test("canonical duplicate transactions or ambiguous job stop the summary", async () => {
  const p1 = payment("first", 4000, true),
    p2 = payment("second", 1000, true);
  p2.fields["Payment Reference"] = p1.fields["Payment Reference"];
  await assert.rejects(
    read(sid, fixture([p1, p2]).deps),
    /balance_duplicate_verified_reference/,
  );
  await assert.rejects(
    read(sid, fixture([], [], [session, session]).deps),
    /summary_session_ambiguous/,
  );
});
test("complete paging follows every page; failures and repeating cursors never return a partial balance", async () => {
  let n = 0;
  assert.equal(
    (
      await completeSummaryRows(
        async () =>
          ++n === 1
            ? { records: [{ id: "a" }], offset: "next" }
            : { records: [{ id: "b" }] },
        "payments",
      )
    ).length,
    2,
  );
  await assert.rejects(
    completeSummaryRows(
      async () => ({ records: [], offset: "same" }),
      "payments",
    ),
    /summary_pagination_invalid/,
  );
  await assert.rejects(
    completeSummaryRows(
      async () => ({ records: Array(1000).fill({}), offset: "more" }),
      "payments",
    ),
    /summary_read_incomplete/,
  );
  await assert.rejects(
    completeSummaryRows(async () => {
      throw Error("unavailable");
    }, "payments"),
    /unavailable/,
  );
});
test("new projection uses the existing authenticated GET boundary and performs no writes", async () => {
  const methods = [];
  const env = {
    AIRTABLE_BASE_ID: "fixture",
    AIRTABLE_API_KEY: "fixture",
    AIRTABLE_TABLE_SESSIONS: "sessions",
    AIRTABLE_TABLE_PAYMENTS: "payments",
    AIRTABLE_TABLE_PAYMENT_PROOFS: "proofs",
    AIRTABLE_HTTP: {
      fetch: async (req) => {
        methods.push(req.method);
        const table = new URL(req.url).pathname.split("/").pop();
        return Response.json({
          records: table === "sessions" ? [session] : [],
        });
      },
    },
  };
  const req = () =>
    new Request(
      `https://www.mmdbkk.com/v1/admin/payments/review-queue?view=job_slip_summary&session_id=${sid}`,
    );
  assert.equal(
    (await handlePaymentReviewRequest(req(), env, null)).status,
    401,
  );
  assert.equal(methods.length, 0);
  const response = await handlePaymentReviewRequest(req(), env, {
    id: "fixture-owner",
    role: "owner",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).summary.remaining_amount_thb, 5000);
  assert(methods.every((m) => m === "GET"));
  const invalid = await handlePaymentReviewRequest(
    new Request(
      "https://www.mmdbkk.com/v1/admin/payments/review-queue?view=job_slip_summary&session_id=bad%27",
    ),
    env,
    { id: "fixture-owner", role: "owner" },
  );
  assert.equal(invalid.status, 400);
});
test("matches actual Session links, never a linked-record display name or unrelated pending slip", async () => {
  const linked = proof("linked", 1000);
  delete linked.fields.session_id;
  const unrelated = proof("other", 3000);
  unrelated.fields.session_id = "other-job";
  unrelated.fields.session = ["rec-other"];
  const s = await read(sid, fixture([], [linked, unrelated]).deps);
  assert.equal(s.pending_complete, true);
  assert.equal(s.pending_amount_thb, 1000);
  assert.deepEqual(
    s.pending_proofs.map((p) => p.proof_id),
    ["linked"],
  );
});
test("a pending re-upload of an already verified image cannot inflate the projection", async () => {
  const a = proof("approved", 4000, "approved"),
    b = proof("new-ref", 1000);
  a.fields.image_sha256 = "same-image";
  b.fields.image_sha256 = "same-image";
  const s = await read(
    sid,
    fixture([payment("approved", 4000, true)], [b, a]).deps,
  );
  assert.equal(s.verified_paid_thb, 4000);
  assert.equal(s.pending_amount_thb, null);
  assert(s.issues.includes("possible_duplicate_transfer"));
});

test("a fully paid service never displays a remaining minimum deposit", async () => {
  const s=await read(sid,fixture([payment("full",5000,true,"full")]).deps);
  assert.equal(s.remaining_amount_thb,0);assert.equal(s.deposit.remaining_thb,0);assert.equal(s.deposit.projected_remaining_thb,0);
});

test("pending full-service evidence projects the minimum but never becomes verified money", async () => {
 const s=await read(sid,fixture([],[proof("full-pending",5000,null,"full")]).deps);
 assert.equal(s.verified_paid_thb,0);assert.equal(s.deposit.remaining_thb,1500);assert.equal(s.deposit.projected_remaining_thb,0);
});
