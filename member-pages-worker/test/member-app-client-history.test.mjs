import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoryItems,
  readClientBackedHistory,
  resolveCanonicalClientForLine,
} from "../src/member-app-client-history.js";

const LINE_ID = `U${"a".repeat(32)}`;
const BASE = "appsV1ILPRfIjkaYg";
const CLIENT_ID = "recIPm5INk35vgcnY";

function envFor(tables) {
  return {
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_BASE_ID: BASE,
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const parts = url.pathname.split("/").filter(Boolean);
        const table = decodeURIComponent(parts.at(-1));
        const records = typeof tables[table] === "function"
          ? tables[table](url.searchParams.get("filterByFormula") || "")
          : (tables[table] || []);
        return Response.json({ records });
      },
    },
  };
}

test("buildHistoryItems exposes only reviewed completed service/payment history", () => {
  const items = buildHistoryItems({
    now: new Date("2026-09-07T00:00:00Z"),
    sessions: [
      { id: "recService1", fields: { job_date: "2026-08-01", "Session Status": "Completed", import_review_status: "approved", job_type: "historical_service" } },
      { id: "recService2", fields: { job_date: "2026-08-02", "Session Status": "Pending" } },
    ],
    payments: [
      { id: "recPayment1", fields: { "Payment Date": "2026-08-01", "Payment Status": "Paid", import_review_status: "approved", payment_evidence_source: "imported_history" } },
      { id: "recPayment2", fields: { "Payment Date": "2026-08-02", "Payment Status": "Paid", "Verification Status": "pending" } },
    ],
  });

  assert.deepEqual(items.map((item) => item.kind), ["booking", "payment"]);
  assert.equal(items[0].occurredAt, "2026-08-01");
  assert.equal(items[1].occurredAt, "2026-08-01");
});

test("resolveCanonicalClientForLine prefers one exact Client LINE link and fails closed on ambiguity", async () => {
  const one = envFor({
    Clients: [{ id: CLIENT_ID, fields: { line_user_id: LINE_ID, email: "member@example.com" } }],
  });
  assert.equal((await resolveCanonicalClientForLine(one, LINE_ID))?.id, CLIENT_ID);

  const ambiguous = envFor({
    Clients: [
      { id: CLIENT_ID, fields: { line_user_id: LINE_ID } },
      { id: "recOtherClient123", fields: { line_user_id: LINE_ID } },
    ],
  });
  assert.equal(await resolveCanonicalClientForLine(ambiguous, LINE_ID), null);
});

test("readClientBackedHistory follows committed LINE identity -> canonical Client -> service records without granting rights", async () => {
  const env = envFor({
    Clients: (formula) => formula.includes("RECORD_ID()")
      ? [{ id: CLIENT_ID, fields: { email: "member@example.com" } }]
      : [],
    "tbl1u0foFBvgFpT9G": [{
      id: "recStage123456789",
      fields: {
        line_user_id: LINE_ID,
        match_type: "line_user_id_exact",
        decision: "link_existing_client",
        review_status: "committed",
        matched_client: [CLIENT_ID],
      },
    }],
    Sessions: [{
      id: "recHistorical1",
      fields: {
        email: "member@example.com",
        job_date: "2026-08-10",
        "Session Status": "Completed",
        import_review_status: "approved",
        job_type: "historical_service",
      },
    }],
    Payments: [{
      id: "recHistoricalPay1",
      fields: {
        "Member Email": "member@example.com",
        "Payment Date": "2026-08-10",
        "Payment Status": "Paid",
        import_review_status: "approved",
        payment_evidence_source: "imported_history",
      },
    }],
  });

  const history = await readClientBackedHistory(env, LINE_ID, new Date("2026-09-07T00:00:00Z"));
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((item) => item.kind), ["booking", "payment"]);
  assert.ok(history.every((item) => !Object.hasOwn(item, "membership_status")));
  assert.ok(history.every((item) => !Object.hasOwn(item, "tier")));
  assert.ok(history.every((item) => !Object.hasOwn(item, "points")));
});
