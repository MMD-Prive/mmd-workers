import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCustomer360MemberProfile } from "../src/customer-360-resolver.js";
import { serializeCustomer360Profile } from "../../member-pages-worker/src/customer-360-serializer.js";

const LINE_ID = `U${"a".repeat(32)}`;
const NOW = new Date("2026-09-05T10:00:00.000Z");

function listRecords(key) {
  if (key === "SESSIONS") {
    return Promise.resolve([{
      fields: {
        line_user_id: LINE_ID,
        job_number: "JOB-FIN-659",
        job_date: "2026-09-12",
        start_time: "21:00",
        job_type: "Dinner",
        "Session Status": "confirmed",
        payment_status: "pending",
        verification_status: "pending_review",
        balance_due_calc: 17850,
        pay_model_thb: 17000,
        model_payout_amount_thb: 17000,
        customer_total: 25500,
        amount_thb: 25500,
        quoted_price: 25500,
        deposit_verified_amount: 7650,
        remaining_balance: 13000,
        payment_ref: "pay_private_659",
        margin_thb: 8500,
        commission_thb: 1000,
      },
    }]);
  }
  return Promise.resolve([]);
}

test("MY MMD returns canonical customer amount due and drops model/internal finance", async () => {
  const profile = await buildCustomer360MemberProfile({
    memberFields: {
      member_id: "MMD-FIN-659",
      "Full Name (Display)": "คุณลูกค้า",
      "Contact Email": "customer@example.test",
    },
    lineUserId: LINE_ID,
    listRecords,
    now: NOW,
  });

  const resolverJob = profile.customer_360.jobs.upcoming_jobs[0];
  assert.equal(resolverJob.amount_due_thb, 17850);

  const member = serializeCustomer360Profile(profile);
  const memberJob = member.customer_360.jobs.upcoming_jobs[0];
  assert.equal(memberJob.amount_due_thb, 17850);

  const json = JSON.stringify(member);
  assert.doesNotMatch(json, /pay_model_thb|model_payout_amount_thb|expected_payout_thb|customer_total|amount_thb|quoted_price|deposit_verified_amount|remaining_balance|payment_ref|margin_thb|commission_thb/i);
  assert.doesNotMatch(json, /17000|25500|7650|13000/);
});

test("generic remaining_balance is not customer-visible unless explicitly configured", async () => {
  const profile = await buildCustomer360MemberProfile({
    memberFields: { member_id: "MMD-FIN-660", "Contact Email": "customer2@example.test" },
    lineUserId: LINE_ID,
    listRecords: async (key) => key === "SESSIONS" ? [{
      fields: {
        line_user_id: LINE_ID,
        job_number: "JOB-FIN-660",
        job_date: "2026-09-13",
        job_type: "Dinner",
        "Session Status": "confirmed",
        remaining_balance: 13000,
      },
    }] : [],
    now: NOW,
  });

  const job = profile.customer_360.jobs.upcoming_jobs[0];
  assert.equal(Object.hasOwn(job, "amount_due_thb"), false);
  assert.doesNotMatch(JSON.stringify(profile), /13000/);
});
