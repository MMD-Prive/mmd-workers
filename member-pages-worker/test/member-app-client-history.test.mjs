import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoryItems,
  buildHistorySummary,
  parseJobCodes,
  readClientBackedHistory,
  readClientBackedHistoryResult,
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

test("buildHistoryItems exposes reviewed completed service/payment history with job detail", () => {
  const items = buildHistoryItems({
    now: new Date("2026-09-07T00:00:00Z"),
    sessions: [
      { id: "recService1", fields: {
        job_date: "2026-08-01",
        "Session Status": "Completed",
        import_review_status: "approved",
        job_type: "PN MK TR",
        model_name: "Tar T",
        location_name: "GO Hotel Bangkok Suvarnabhumi Airport",
        start_time: "17:00",
        end_time: "18:30",
        "Total Amount": 17500,
        "Deposit Paid": 5300,
      } },
      { id: "recService2", fields: { job_date: "2026-08-02", "Session Status": "Pending" } },
    ],
    payments: [
      { id: "recPayment1", fields: { "Payment Date": "2026-08-01", "Payment Status": "Paid", import_review_status: "approved", payment_evidence_source: "imported_history", Amount: 17500 } },
      { id: "recPayment2", fields: { "Payment Date": "2026-08-02", "Payment Status": "Paid", "Verification Status": "pending" } },
    ],
  });
  assert.deepEqual(items.map((item) => item.kind), ["booking", "payment"]);
  assert.equal(items[0].title, "PN + MK");
  assert.equal(items[0].model, "Tar T");
  assert.deepEqual(items[0].serviceCodes, ["PN", "MK"]);
  assert.deepEqual(items[0].chargeComponents, [{ code: "TR", type: "travel_fee" }]);
  assert.equal(items[0].totalAmountThb, 17500);
  assert.equal(items[0].depositAmountThb, 5300);
  assert.equal(items[0].balanceAmountThb, 12200);
  assert.equal(items[0].durationMinutes, 90);
});

test("history is lifetime, not limited to the previous 365 days", () => {
  const items = buildHistoryItems({
    now: new Date("2026-09-13T00:00:00Z"),
    sessions: [
      { id: "recOld1", fields: { job_date: "2021-12-03", "Session Status": "Completed", job_type: "PN", "Total Amount": 10000 } },
      { id: "recNew1", fields: { job_date: "2026-09-10", "Session Status": "Completed", job_type: "MK", "Total Amount": 12000 } },
    ],
  });
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.occurredAt), ["2026-09-10", "2021-12-03"]);
});

test("service spend sums job total once and never deposit plus balance again", () => {
  const items = buildHistoryItems({
    now: new Date("2026-09-13T00:00:00Z"),
    sessions: [
      { id: "recA", fields: { job_date: "2026-02-09", "Session Status": "Completed", job_type: "PN MK TR", "Total Amount": 17500, "Deposit Paid": 5300 } },
      { id: "recB", fields: { job_date: "2026-09-11", "Session Status": "Completed", job_type: "PN", "Total Amount": 10000, "Deposit Paid": 3000 } },
    ],
  });
  const summary = buildHistorySummary(items);
  assert.equal(summary.verifiedServiceCount, 2);
  assert.equal(summary.verifiedServiceSpendThb, 27500);
  assert.equal(summary.travelFeeJobs, 1);
});

test("TR is a travel charge component, not a service", () => {
  assert.deepEqual(parseJobCodes("PN MK TR"), {
    serviceCodes: ["PN", "MK"],
    chargeComponents: [{ code: "TR", type: "travel_fee" }],
  });
});

test("resolveCanonicalClientForLine prefers one exact Client LINE link and fails closed on ambiguity", async () => {
  const one = envFor({ Clients: [{ id: CLIENT_ID, fields: { line_user_id: LINE_ID, email: "member@example.com" } }] });
  assert.equal((await resolveCanonicalClientForLine(one, LINE_ID))?.id, CLIENT_ID);
  const ambiguous = envFor({ Clients: [{ id: CLIENT_ID, fields: { line_user_id: LINE_ID } }, { id: "recOtherClient123", fields: { line_user_id: LINE_ID } }] });
  assert.equal(await resolveCanonicalClientForLine(ambiguous, LINE_ID), null);
});

test("readClientBackedHistory follows committed LINE identity -> canonical Client -> full service records without granting rights", async () => {
  const env = envFor({
    Clients: (formula) => formula.includes("RECORD_ID()") ? [{ id: CLIENT_ID, fields: { email: "member@example.com", "Client Name": "คุณเอ๋ย" } }] : [],
    "tbl1u0foFBvgFpT9G": [{ id: "recStage123456789", fields: { line_user_id: LINE_ID, match_type: "line_user_id_exact", decision: "link_existing_client", review_status: "committed", matched_client: [CLIENT_ID] } }],
    Sessions: [{ id: "recHistorical1", fields: { email: "member@example.com", job_date: "2024-08-10", "Session Status": "Completed", import_review_status: "approved", job_type: "PN MK TR", model_name: "Tar T", "Total Amount": 17500 } }],
    Payments: [{ id: "recHistoricalPay1", fields: { "Member Email": "member@example.com", "Payment Date": "2024-08-10", "Payment Status": "Paid", import_review_status: "approved", payment_evidence_source: "imported_history", Amount: 17500 } }],
  });
  const result = await readClientBackedHistoryResult(env, LINE_ID, new Date("2026-09-07T00:00:00Z"));
  const history = await readClientBackedHistory(env, LINE_ID, new Date("2026-09-07T00:00:00Z"));
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((item) => item.kind), ["booking", "payment"]);
  assert.equal(result.summary.verifiedServiceCount, 1);
  assert.equal(result.summary.verifiedServiceSpendThb, 17500);
  assert.ok(history.every((item) => !Object.hasOwn(item, "membership_status")));
  assert.ok(history.every((item) => !Object.hasOwn(item, "tier")));
  assert.ok(history.every((item) => !Object.hasOwn(item, "points")));
});
