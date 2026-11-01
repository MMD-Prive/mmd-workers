import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
globalThis.crypto ??= webcrypto;
import {
  previewProofSessionBinding as preview,
  bindProofSession as bind,
} from "./src/payment-proof-session-binding.js";
import { handlePaymentReviewRequest as handle } from "./src/payment-review-runtime.js";
import { paymentJobSlipSummary as summary } from "./src/payment-job-slip-summary.js";
const owner = { id: "synthetic-owner", role: "owner" };
const selection = {
  proof_id: "line_synthetic",
  session_id: "sess_synthetic",
  payment_stage: "deposit",
  duplicate_of_proof_id: "web_synthetic",
};
function fixture() {
  const proof = {
    id: "recPending",
    fields: {
      proof_id: "line_synthetic",
      status: "pending",
      Client: ["recClient"],
      note: JSON.stringify({
        schema: "line_payment_evidence_v4",
        r2_key: "original.jpg",
        extraction: { original: true },
      }),
    },
  };
  const original = {
    id: "recOriginal",
    fields: {
      proof_id: "web_synthetic",
      status: "verified",
      amount_thb: 4000,
      session: ["recSession"],
      Client: ["recClient"],
      payment_ref: "pay_synthetic",
      payment: ["recPayment"],
    },
  };
  const session = {
    id: "recSession",
    fields: {
      session_id: "sess_synthetic",
      Client: ["recClient"],
      amount_thb: 13000,
      "MMD — Payment Proofs": ["recOriginal"],
      client_name: "Synthetic customer",
    },
  };
  const payment = {
    id: "recPayment",
    fields: {
      session_id: "sess_synthetic",
      "Payment Reference": "pay_synthetic",
      Amount: 4000,
      "Verification Status": "verified",
      "Payment Status": "Paid",
      payment_stage: "deposit",
    },
  };
  const calls = [];
  const deps = {
    env: {},
    loadProof: async (id) =>
      structuredClone(
        id === "line_synthetic"
          ? proof
          : id === "web_synthetic"
            ? original
            : null,
      ),
    loadSession: async () => structuredClone(session),
    loadPayments: async () => [structuredClone(payment)],
    loadLinkedProofs: async () => [structuredClone(original)],
    audit: async (v) => calls.push(["audit", v]),
    patch: async (id, fields) => {
      calls.push(["patch", fields]);
      Object.assign(proof.fields, fields);
    },
  };
  return { proof, original, session, payment, calls, deps };
}
async function input(h, extra = {}) {
  const p = await preview({ ...selection, ...extra }, owner, h.deps);
  return {
    ...selection,
    ...extra,
    action: "bind_session",
    idempotency_key: "synthetic-key-001",
    expected_snapshot: p.snapshot,
    evidence_checked: true,
    same_transfer_confirmed: true,
    admin_reason:
      "Both synthetic slips have the same transfer reference, time and amount",
  };
}
test("preview is read-only and binding writes only proof links and audit, preserving pending evidence and money", async () => {
  const h = fixture(),
    x = await input(h);
  assert.equal(h.calls.length, 0);
  const ledger = JSON.stringify(h.payment);
  const result = await bind(x, owner, h.deps);
  assert.equal(result.money_truth_changed, false);
  assert.equal(result.approval_performed, false);
  assert.deepEqual(
    h.calls.map((x) => x[0]),
    ["audit", "patch"],
  );
  assert.deepEqual(Object.keys(h.calls[1][1]).sort(), [
    "Client",
    "note",
    "session",
  ]);
  assert.equal(h.proof.fields.status, "pending");
  assert.equal(h.proof.fields.amount_thb, undefined);
  assert.equal(h.proof.fields.payment_ref, undefined);
  assert.equal(JSON.stringify(h.payment), ledger);
  assert.equal(JSON.parse(h.proof.fields.note).extraction.original, true);
  assert.equal((await bind(x, owner, h.deps)).idempotent, true);
  assert.equal(h.calls.length, 2);
  await assert.rejects(
    bind(
      { ...x, admin_reason: "Different requested operation" },
      owner,
      h.deps,
    ),
    /already_bound/,
  );
});
test("rejects missing confirmation, wrong roles, wrong customer, MMS, stale ledger and already-settled proof without writes", async () => {
  for (const variant of [
    "confirm",
    "same",
    "role",
    "client",
    "mms",
    "stale",
    "settled",
    "session",
    "payment",
    "duplicate",
  ]) {
    const h = fixture(),
      x = await input(h);
    let actor = owner;
    if (variant === "confirm") x.evidence_checked = false;
    if (variant === "same") x.same_transfer_confirmed = false;
    if (variant === "role") actor = { id: "staff", role: "staff" };
    if (variant === "client") h.session.fields.Client = ["recOther"];
    if (variant === "mms") h.session.fields["Session Type"] = "MMS";
    if (variant === "stale") h.payment.fields.Amount = 5000;
    if (variant === "settled") h.proof.fields.status = "verified";
    if (variant === "session") h.proof.fields.session = ["recOther"];
    if (variant === "payment") h.proof.fields.payment = ["recOther"];
    if (variant === "duplicate") h.original.fields.status = "pending";
    await assert.rejects(bind(x, actor, h.deps), undefined, variant);
    assert.equal(h.calls.length, 0, variant);
  }
});
test("audit failure and uncertain write do not call financial services; replay recovers saved binding", async () => {
  let h = fixture(),
    x = await input(h);
  h.deps.audit = async () => {
    throw Error("audit failed");
  };
  await assert.rejects(bind(x, owner, h.deps), /audit failed/);
  assert.equal(h.calls.length, 0);
  h = fixture();
  x = await input(h);
  const patch = h.deps.patch;
  h.deps.patch = async (...args) => {
    await patch(...args);
    throw Error("lost response");
  };
  await assert.rejects(bind(x, owner, h.deps), /lost response/);
  assert.equal((await bind(x, owner, h.deps)).idempotent, true);
  assert.equal(h.calls.length, 2);
});
test("normal session binding remains pending and does not assign a payment or duplicate", async () => {
  const h = fixture(),
    x = await input(h, { duplicate_of_proof_id: "" });
  const r = await bind(x, owner, h.deps);
  assert.equal(r.duplicate_of, null);
  assert.equal(h.proof.fields.status, "pending");
  assert.equal(h.proof.fields.payment, undefined);
});
test("linked duplicate is visible in queue but blocked from approval and excluded from pending totals", async () => {
  const h = fixture();
  await bind(await input(h), owner, h.deps);
  h.session.fields["MMD — Payment Proofs"].push(h.proof.id);
  const s = await summary("sess_synthetic", {
    sessionsTable: "sessions",
    paymentsTable: "payments",
    proofsTable: "proofs",
    page: async (table) => ({
      records:
        table === "sessions"
          ? [h.session]
          : table === "payments"
            ? [h.payment]
            : [h.proof, h.original],
    }),
  });
  assert.equal(s.verified_paid_thb, 4000);
  assert.equal(s.pending_amount_thb, 0);
  assert.equal(s.remaining_amount_thb, 9000);
  assert.equal(s.pending_complete, true);
  const env = {
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_API_KEY: "fake",
    PAYMENTS_WORKER: {
      fetch() {
        throw Error("settlement forbidden");
      },
    },
    AIRTABLE_HTTP: {
      fetch: async (req) => {
        assert.equal(req.method, "GET");
        return Response.json({
          records: new URL(req.url).pathname.includes("Access")
            ? []
            : [h.proof],
        });
      },
    },
  };
  const response = await handle(
    new Request("https://example.test/v1/admin/payments/review", {
      method: "POST",
      body: JSON.stringify({
        proof_id: "line_synthetic",
        decision: "approve",
        admin_reason: "Must be blocked",
        idempotency_key: "synthetic-approve",
      }),
    }),
    env,
    owner,
  );
  assert.equal(response.status, 409);
  assert.equal(
    (await response.json()).error,
    "proof_already_received_duplicate_evidence",
  );
  const q = await handle(
    new Request("https://example.test/v1/admin/payments/review-queue"),
    env,
    owner,
  );
  const item = (await q.json()).items[0];
  assert.equal(item.session_id, "sess_synthetic");
  assert.equal(item.status, "pending");
  assert.equal(item.session_binding.duplicate_of_proof_id, "web_synthetic");
});
test("duplicate exclusion fails closed if the original verified proof changes", async () => {
  const h = fixture();
  await bind(await input(h), owner, h.deps);
  h.session.fields["MMD — Payment Proofs"].push(h.proof.id);
  h.original.fields.status = "pending";
  const s = await summary("sess_synthetic", {
    sessionsTable: "sessions",
    paymentsTable: "payments",
    proofsTable: "proofs",
    page: async (table) => ({
      records:
        table === "sessions"
          ? [h.session]
          : table === "payments"
            ? [h.payment]
            : [h.proof, h.original],
    }),
  });
  assert.equal(s.verified_paid_thb, 4000);
  assert.equal(s.pending_complete, false);
  assert.equal(s.pending_amount_thb, null);
});
test("HTTP bind action respects authentication and writes no tables other than Proofs and Access Log", async () => {
  const h = fixture(),
    x = await input(h),
    writes = [];
  const env = {
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_API_KEY: "fake",
    PAYMENTS_WORKER: {
      fetch() {
        throw Error("no settlement");
      },
    },
    AIRTABLE_HTTP: {
      fetch: async (req) => {
        const u = new URL(req.url),
          table = decodeURIComponent(u.pathname.split("/")[3] || "");
        if (req.method === "POST") {
          assert.equal(table, "System — Access Log");
          writes.push(table);
          return Response.json({ records: [{ id: "recAudit" }] });
        }
        if (req.method === "PATCH") {
          assert.equal(table, "tblfJfM4Sqag9zrLi");
          const b = await req.json();
          writes.push(table);
          await h.deps.patch(h.proof.id, b.fields);
          return Response.json(h.proof);
        }
        const f = u.searchParams.get("filterByFormula") || "";
        return Response.json({
          records:
            table === "tblWGGJJOx5eBvBZJ"
              ? [h.payment]
              : table === "tblC98mKWbzmPuNzX"
                ? [h.session]
                : f.includes("RECORD_ID()") || f.includes("web_synthetic")
                  ? [h.original]
                  : [h.proof],
        });
      },
    },
  };
  const req = () =>
    new Request("https://example.test/v1/admin/payments/review", {
      method: "POST",
      body: JSON.stringify(x),
    });
  assert.equal((await handle(req(), env, null)).status, 401);
  const res = await handle(req(), env, owner);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.deepEqual(writes, ["System — Access Log", "tblfJfM4Sqag9zrLi"]);
});
