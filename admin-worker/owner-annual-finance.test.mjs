import test from "node:test";
import assert from "node:assert/strict";
import { summarizeOwnerAnnualFinance } from "./src/owner-annual-finance.js";

const P = { ref: "fldOO6SY49iDw8VBZ", amount: "fldvCSwrUW8OMAooS", date: "fld3yAwxIu2dkw7fO", verification: "fldJ7a0Ube9F0bmRy", officialAt: "fldPNK6qgxCSdaJRM", session: "fld2wdhBvc8xrV6y5" };
const S = { id: "fldLTq2kZbyRv22IA", jobType: "fldjK3U9bghnj7xUe" };
function pay(id, ref, amount, session, status = "official_verified", date = "2026-09-24") {
  return { id, fields: { [P.ref]: ref, [P.amount]: amount, [P.session]: session, [P.date]: date, [P.verification]: status, [P.officialAt]: "2026-09-24T08:00:00Z" } };
}

test("annual receipts separate canonical MMD and MMS sessions, with unknowns isolated", () => {
  const sessions = [
    { id: "recMmd", fields: { [S.id]: "JOB-1", [S.jobType]: "Private" } },
    { id: "recMms", fields: { [S.id]: "MMS-2", [S.jobType]: "MMS" } },
  ];
  const payments = [
    pay("p1", "A", 20000, "JOB-1"),
    pay("p2", "B", 1500, "recMms"),
    pay("p3", "C", 2999, ""),
    pay("p4", "B", 1500, "recMms"),
    pay("p5", "D", 9000, "JOB-1", "pending"),
    pay("p6", "E", 1200, "JOB-1", "official_verified", "2025-12-31"),
  ];
  const result = summarizeOwnerAnnualFinance(payments, sessions, 2026);
  assert.equal(result.totals.mmd.received_thb, 20000);
  assert.equal(result.totals.mms.received_thb, 1500);
  assert.equal(result.totals.unclassified.received_thb, 2999);
  assert.equal(result.totals.all_included_received_thb, 24499);
  assert.equal(result.profit_thb, null);
  assert.equal(result.excluded.duplicates, 1);
});

test("unverified and missing amounts never become revenue", () => {
  const rows = [pay("p1", "A", 100, "JOB-1", "submitted"), pay("p2", "B", "", "JOB-1")];
  const result = summarizeOwnerAnnualFinance(rows, [{ id: "recMmd", fields: { [S.id]: "JOB-1", [S.jobType]: "Public" } }], 2026);
  assert.equal(result.totals.all_included_received_thb, 0);
  assert.equal(result.excluded.not_official, 1);
  assert.equal(result.excluded.missing_received_amount, 1);
});


test("official verified payment uses canonical Amount when legacy Amt Received differs", () => {
  const row = pay("p7", "F", 3250, "MMS-2");
  row.fields.fld5rTIVEF1DXwfe2 = 900;
  const result = summarizeOwnerAnnualFinance([row], [{ id: "recMms", fields: { [S.id]: "MMS-2", [S.jobType]: "MMS" } }], 2026);
  assert.equal(result.totals.mms.received_thb, 3250);
  assert.equal(result.totals.all_included_received_thb, 3250);
});
