import test from "node:test";
import assert from "node:assert/strict";
import { handlePaymentReviewRequest } from "./src/payment-review-runtime.js";
import { drainApprovedJobLinkNotifications } from "./src/payment-approved-job-link-dispatch.js";
import { memoryR2 } from "../shared/test/payment-memory-r2.mjs";

function fixture() {
  const tables = {
    Proofs: [{ id: "recProof", fields: { proof_id: "proof-1", payment_ref: "pay-1", amount_thb: 7500, payment: ["recPayment"], status: "pending" } }],
    Payments: [{ id: "recPayment", fields: { payment_ref: "pay-1", session_id: "sess-1", amount_thb: 7500, payment_stage: "deposit" } }],
    Sessions: [{ id: "recSession", fields: { session_id: "sess-1", fldi9ZdoiUXzSv1rI: "https://www.mmdbkk.com/sigil/confirm/job-confirmation?t=customer", fld0mFma9J9yfEaKb: "https://www.mmdbkk.com/sigil/confirm/job-model?t=model" } }],
    Audit: [],
  };
  let settlements = 0;
  let paymentAccepted = true;
  const env = {
    AIRTABLE_BASE_ID: "app-test", AIRTABLE_API_KEY: "test",
    AIRTABLE_TABLE_PAYMENT_PROOFS: "Proofs", AIRTABLE_TABLE_PAYMENTS: "Payments", AIRTABLE_TABLE_SESSIONS: "Sessions", AIRTABLE_TABLE_ACCESS_LOG: "Audit",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "test", TELEGRAM_INTERNAL_SEND_URL: "https://telegram.example/internal/send", INTERNAL_TOKEN: "test",
    LINE_SLIP_EVIDENCE: memoryR2(),
    PAYMENTS_WORKER: { async fetch() {
      settlements++;
      if (!paymentAccepted) return Response.json({ ok: false, error: "review_failed" }, { status: 409 });
      tables.Proofs[0].fields.status = "verified";
      return Response.json({ ok: true, payment_ref: "pay-1", payment_stage: "deposit" });
    } },
    AIRTABLE_HTTP: { async fetch(request) {
      const url = new URL(request.url);
      const [, , table, id] = decodeURIComponent(url.pathname).split("/").filter(Boolean);
      const rows = tables[table];
      assert.ok(rows, table);
      if (request.method === "POST") {
        assert.equal(table, "Audit");
        const body = await request.json();
        const row = { id: `recAudit${rows.length + 1}`, fields: body.records[0].fields };
        rows.push(row);
        return Response.json({ records: [row] });
      }
      if (id) return Response.json(rows.find((row) => row.id === id));
      const clauses = [...(url.searchParams.get("filterByFormula") || "").matchAll(/\{([^}]+)\}='([^']*)'/g)];
      return Response.json({ records: rows.filter((row) => clauses.every(([, field, value]) => row.fields[field] === value)) });
    } },
  };
  return {
    env, tables, settlements: () => settlements, rejectPayment() { paymentAccepted = false; },
    async review(overrides = {}) {
      return handlePaymentReviewRequest(new Request("https://www.mmdbkk.com/v1/admin/payments/review", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve", proof_id: "proof-1", idempotency_key: "review-1", admin_reason: "checked bank transfer", ...overrides }),
      }), env, { id: "owner-test", role: "owner" });
    },
  };
}

test("same review key recovers failed notifications after approval without another settlement", async () => {
  const h = fixture();
  const original = globalThis.fetch;
  let sends = 0;
  let healthy = false;
  globalThis.fetch = async () => { sends++; return Response.json({ ok: healthy }, { status: healthy ? 200 : 503 }); };
  try {
    const response = await h.review();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).job_link_dispatch.retry_queued, true);
    const audit = JSON.parse(h.tables.Audit[0].fields["After JSON"]);
    assert.equal(audit.session_id, "sess-1");
    assert.equal(audit.payment_ref, "pay-1");
    const replay = await (await h.review()).json();
    assert.equal(replay.duplicate, true);
    assert.equal(replay.money_truth_changed, false);
    assert.equal(replay.job_link_dispatch.retry_queued, true);
    assert.equal(h.settlements(), 1);
    assert.equal(sends, 1);
    healthy = true;
    await drainApprovedJobLinkNotifications(h.env, { now: Date.now() + 120000 });
    const recovered = await (await h.review()).json();
    assert.equal(recovered.job_link_dispatch.delivery_status, "delivered");
    assert.equal(h.settlements(), 1);
    assert.equal(sends, 2);
    assert.equal((await h.review({ proof_id: "different-proof" })).status, 409);
    assert.equal(sends, 2);
  } finally { globalThis.fetch = original; }
});

test("failed Official Verify never enqueues or dispatches confirmation links", async () => {
  const h = fixture();
  h.rejectPayment();
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail("confirmation released before verification");
  try {
    assert.equal((await h.review()).status, 409);
    assert.equal(h.env.LINE_SLIP_EVIDENCE.objects.size, 0);
    assert.equal(h.tables.Audit.length, 0);
  } finally { globalThis.fetch = original; }
});
