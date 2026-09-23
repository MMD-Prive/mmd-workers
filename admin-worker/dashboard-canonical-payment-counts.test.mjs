import test from "node:test";
import assert from "node:assert/strict";

import { buildAdminDashboard } from "./src/dashboard-worker.js";

const PAYMENT_PROOF_TABLE = "tblfJfM4Sqag9zrLi";
const MEMBERS_TABLE = "tblgWc5VRon5o8Mhk";
const SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const PAYMENTS_TABLE = "tblWGGJJOx5eBvBZJ";

function normalPaymentProof() {
  return {
    id: "rec-proof-current",
    createdTime: "2026-09-13T10:00:00.000Z",
    fields: {
      proof_id: "line_current_01",
      status: "pending",
      channel: "line_ofc",
      amount_thb: 19250,
      payment_ref: "CURRENT-PAYMENT-REF-01",
      payer_name: "คุณเอ็ม",
      session: ["rec-session-current"],
      payment: ["rec-payment-current"],
      Client: ["rec-client-current"],
      note: JSON.stringify({
        schema: "line_payment_evidence_v3",
        r2_key: "line-ofc/payment-proofs/2026/09/line_current_01/original.png",
        mime_type: "image/png",
        extraction: { method: "qr", confidence: 0.98 },
        payment_intelligence: {
          inferred_stage: "final",
          inferred_label: "ค่าจบงาน / ยอดคงเหลือ",
          confidence: 0.99,
        },
      }),
    },
  };
}

function historicalProof(id, reviewState) {
  return {
    id: `rec-${id}`,
    createdTime: "2026-09-12T08:00:00.000Z",
    fields: {
      proof_id: id,
      status: reviewState === "processed" ? "reviewed" : "pending",
      amount_thb: 1999,
      payment_ref: `${id}-REF`,
      note: JSON.stringify({
        schema: "mmd_historical_slip_backfill_v1",
        review_state: reviewState,
        source_type: "line_archive",
        source_ref: `archive:${id}`,
        evidence_sha256: "a".repeat(64),
        r2_key: `line-ofc/payment-proofs/2026/09/${id}/original.png`,
        mime_type: "image/png",
        extraction: { extraction_method: "qr", confidence_score: 0.96 },
        created_at: "2026-09-12T08:00:00.000Z",
      }),
    },
  };
}

function env() {
  const currentProof = normalPaymentProof();
  const historical = [historicalProof("hist_pending_01", "pending"), historicalProof("hist_done_01", "processed")];
  return {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: PAYMENT_PROOF_TABLE,
    AIRTABLE_TABLE_MEMBERS_ID: MEMBERS_TABLE,
    AIRTABLE_TABLE_SESSIONS: SESSIONS_TABLE,
    AIRTABLE_TABLE_PAYMENTS_ID: PAYMENTS_TABLE,
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").at(-1));
        const formula = url.searchParams.get("filterByFormula") || "";

        if (table === PAYMENT_PROOF_TABLE) {
          if (formula.includes("mmd_historical_slip_backfill_v1")) {
            return Response.json({ records: historical });
          }
          return Response.json({ records: [currentProof, ...historical] });
        }

        if (table === PAYMENTS_TABLE) {
          return Response.json({ records: [{
            id: "rec-payment-current",
            fields: {
              "Payment Reference": "CURRENT-PAYMENT-REF-01",
              Amount: 19250,
              payment_stage: "final",
              session_id: "sess-current",
              "Payment Status": "Pending",
              Client: ["rec-client-current"],
            },
          }] });
        }
        if (table === SESSIONS_TABLE) return Response.json({ records: [{
          id: "rec-session-current",
          fields: {
            session_id: "sess-current",
            Client: ["rec-client-current"],
            client_name: "คุณเอ็ม",
            model_name: "Model A",
            job_date: "2026-09-13",
            start_time: "18:00",
          },
        }] });
        if (table === MEMBERS_TABLE) {
          return Response.json({
            records: [
              {
                id: "rec-member-review",
                fields: {
                  "Full Name (Display)": "คุณเอ",
                  "Membership Tier": "Premium",
                  resolver_state: "review_required",
                },
              },
              {
                id: "rec-member-expired",
                fields: {
                  "Full Name (Display)": "คุณบี",
                  "Membership Tier": "SVIP",
                  "Membership Status": "expired",
                },
              },
            ],
          });
        }

        throw new Error(`Unexpected Airtable table: ${table}`);
      },
    },
  };
}

test("dashboard reuses canonical payment-review and historical-recovery queues for counts and routes", async () => {
  const dashboard = await buildAdminDashboard(env());

  assert.equal(dashboard.ok, true);
  assert.equal(dashboard.counts.payments, 1);
  assert.equal(dashboard.counts.payment_review, 1);
  assert.equal(dashboard.counts.historical_recovery, 1);
  assert.equal(dashboard.counts.membership_review, 1);

  assert.equal(dashboard.queues.payment_review.count, 1);
  assert.equal(dashboard.queues.payment_review.href, "/internal/admin/payments");
  assert.equal(dashboard.queues.historical_recovery.count, 1);
  assert.equal(dashboard.queues.historical_recovery.href, "/internal/admin/payments/historical-backfill");
  assert.equal(dashboard.queues.membership_review.count, 1);

  assert.equal(dashboard.money.length, 1);
  assert.equal(dashboard.money[0].title, "คุณเอ็ม");
  assert.match(dashboard.money[0].text, /ค่าจบงาน \/ ยอดคงเหลือ/);
  assert.equal(dashboard.historical_recovery.length, 1);
  assert.equal(dashboard.historical_recovery[0].proof_id, "hist_pending_01");

  assert.equal(dashboard.todos.some((item) => item.href === "/internal/admin/payments"), true);
  assert.equal(dashboard.todos.some((item) => item.href === "/internal/admin/payments/historical-backfill"), true);
  assert.equal(dashboard.status.payments, "พร้อม");
  assert.equal(dashboard.status.historical_recovery, "พร้อม");
});
