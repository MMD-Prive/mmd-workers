import test from "node:test";
import assert from "node:assert/strict";

import { buildJobsPage, projectJobs, handleAdminDashboardJobsRequest } from "./src/admin-dashboard-jobs.js";

const CLIENT_A = "recAAAAAAAAAAAAAA";
const CLIENT_B = "recBBBBBBBBBBBBBB";

test("Console customer scope matches one canonical Client and retains the Session handoff", () => {
  const first = session("SESSION-A", "2026-10-04");
  first.fields.Client = [CLIENT_A];
  const second = session("SESSION-B", "2026-10-04");
  second.fields.Client = [CLIENT_B];
  const conflict = session("SESSION-C", "2026-10-04");
  conflict.fields.Client = [CLIENT_A];
  conflict.fields.client_id = CLIENT_B;
  const ambiguous = session("SESSION-D", "2026-10-04");
  ambiguous.fields.Client = [CLIENT_A, CLIENT_B];
  const page = buildJobsPage([first, second, conflict, ambiguous], { clientId: CLIENT_A });
  assert.equal(page.pagination.total, 1);
  assert.equal(page.items[0].session_id, "SESSION-A");
  assert.equal(page.items[0].client_id, CLIENT_A);
  assert.equal(page.items[0].customer_view_href, "/my-mmd/?session_id=SESSION-A");
  assert.equal(buildJobsPage([first, second], { sessionId: "SESSION-B", clientId: CLIENT_A }).items.length, 0);
  assert.equal(projectJobs([{ id: "recFallback", fields: { job_id: "JOB-FALLBACK" } }])[0].customer_view_href, null);
});

test("Console client selector requires admin auth and rejects invalid or repeated client IDs", async () => {
  const call = (query, actor) => handleAdminDashboardJobsRequest(new Request("https://www.mmdbkk.com/v1/admin/dashboard?view=jobs&" + query), {}, actor);
  assert.equal((await call("client_id=" + CLIENT_A, null)).status, 401);
  for (const query of ["client_id=customer-name", "client_id=", "client_id=" + CLIENT_A + "&client_id=" + CLIENT_B]) {
    assert.equal((await call(query, { role: "admin" })).status, 400);
  }
});

function session(id, jobDate, startTime = "19:00", status = "confirmed", jobId = "") {
  return {
    id: `rec_${id}`,
    fields: {
      session_id: id,
      ...(jobId ? { job_id: jobId } : {}),
      model_name: `Model ${id}`,
      client_name: `Client ${id}`,
      job_date: jobDate,
      start_time: startTime,
      status,
    },
  };
}

test("all-jobs view paginates the full projected set instead of six dashboard rows", () => {
  const records = Array.from({ length: 47 }, (_, index) => {
    const day = String(10 + (index % 10)).padStart(2, "0");
    return session(`job_${index + 1}`, `2026-09-${day}`);
  });

  const page = buildJobsPage(records, {
    now: new Date("2026-09-10T09:00:00.000Z"),
    page: 2,
    pageSize: 20,
  });

  assert.equal(page.pagination.total, 47);
  assert.equal(page.pagination.total_pages, 3);
  assert.equal(page.pagination.page, 2);
  assert.equal(page.pagination.page_size, 20);
  assert.equal(page.pagination.has_prev, true);
  assert.equal(page.pagination.has_next, true);
  assert.equal(page.items.length, 20);
  assert.equal(page.counts.all, 47);
});

test("all-jobs view filters one canonical job date and resets pagination to valid bounds", () => {
  const records = [
    session("today_a", "2026-09-10", "18:00"),
    session("today_b", "2026-09-10", "20:00", "pending"),
    session("future", "2026-09-11", "19:00"),
    session("past", "2026-09-09", "21:00", "finished"),
  ];

  const page = buildJobsPage(records, {
    now: new Date("2026-09-10T09:00:00.000Z"),
    page: 99,
    pageSize: 20,
    jobDate: "2026-09-10",
  });

  assert.equal(page.pagination.total, 2);
  assert.equal(page.pagination.page, 1);
  assert.deepEqual(page.items.map((item) => item.id), ["today_a", "today_b"]);
  assert.equal(page.counts.today, 2);
  assert.equal(page.counts.upcoming, 1);
  assert.equal(page.counts.past, 1);
});

test("all-jobs projection preserves date/time fallback rules from the dashboard", () => {
  const jobs = projectJobs([
    {
      id: "rec_iso",
      fields: {
        session_id: "iso",
        model_name: "ISO Model",
        client_name: "ISO Client",
        scheduled_at: "2026-09-11T12:15:00.000Z",
        status: "confirmed",
      },
    },
    {
      id: "rec_missing",
      fields: {
        session_id: "missing",
        model_name: "Missing Model",
        client_name: "Missing Client",
        status: "pending",
      },
    },
  ], new Date("2026-09-10T09:00:00.000Z"));

  assert.equal(jobs[0].id, "iso");
  assert.equal(jobs[0].href, "/internal/admin/jobs/all?session_id=iso");
  assert.equal(jobs[0].job_date, "2026-09-11");
  assert.equal(jobs[0].time_only, "19:15");
  assert.match(jobs[0].time, /19:15$/);

  assert.equal(jobs[1].id, "missing");
  assert.equal(jobs[1].href, "/internal/admin/jobs/all?session_id=missing");
  assert.equal(jobs[1].job_date, "");
  assert.equal(jobs[1].time, "ยังไม่มีวันเวลา");
});


test("owner handoff selects the exact canonical Session across job dates and pages", () => {
  const records = Array.from({ length: 75 }, (_, index) => session(`job_${index + 1}`, "2026-09-11"));
  const page = buildJobsPage(records, { now: new Date("2026-09-10T09:00:00.000Z"), sessionId: "job_74", pageSize: 20 });
  assert.deepEqual(page.items.map((item) => item.id), ["job_74"]);
  assert.equal(page.pagination.total, 1);
});

test("owner handoff accepts job_id deep links without losing the canonical session", () => {
  const records = [
    session("sess_alpha", "2026-09-11", "18:00", "pending", "JOB-ALPHA"),
    session("sess_target", "2026-09-12", "19:00", "pending", "JOB-8B799C2387-C1BC84"),
    session("sess_other", "2026-09-12", "20:00", "confirmed", "JOB-OTHER"),
  ];
  const page = buildJobsPage(records, {
    now: new Date("2026-09-10T09:00:00.000Z"),
    jobId: "JOB-8B799C2387-C1BC84",
    pageSize: 20,
  });

  assert.equal(page.pagination.total, 1);
  assert.equal(page.items[0].id, "sess_target");
  assert.equal(page.items[0].session_id, "sess_target");
  assert.equal(page.items[0].job_id, "JOB-8B799C2387-C1BC84");
  assert.equal(page.items[0].href, "/internal/admin/jobs/all?job_id=JOB-8B799C2387-C1BC84");
});

import { parsePricingHistory, projectFinance, JOB_FINANCE_FIELD_IDS as FIN } from "./src/admin-dashboard-jobs.js";

const NOTE = '[MMD SERVICE PRICING v1] ' + JSON.stringify({ version: 1, currency: "THB", settlement_mode: "direct",
  client_base_amount_thb: 20000, model_base_payout_thb: 11500, addons: [{ option: "mk", client_amount_thb: 1000, model_payout_thb: 500 }],
  client_total_amount_thb: 18900, model_total_payout_thb: 11750, client_gross_amount_thb: 21000, model_gross_payout_thb: 12000,
  discount: { mode: "promotion", type: "percent", value: 10, amount_thb: 2100, mmd_share_thb: 1050, model_share_thb: 1050, reason: "OCT promo" } })
  + '\n[object Object]\n[SIGIL Pricing v1] ' + JSON.stringify({ deposit_due_thb: 5700, deposit_received_thb: 0, balance_thb: 13200 });

test("job finance exposes pre-discount history, discount split and deposit, never tokens", () => {
  const h = parsePricingHistory(NOTE);
  assert.equal(h.client_gross_thb, 21000); assert.equal(h.client_net_thb, 18900);
  assert.equal(h.model_gross_thb, 12000); assert.equal(h.model_net_thb, 11750);
  assert.deepEqual(h.addons, [{ option: "mk", client_thb: 1000, model_thb: 500 }]);
  assert.equal(h.discount.mode, "promotion"); assert.equal(h.discount.model_share_thb, 1050); assert.equal(h.discount.reason, "OCT promo");
  const f = projectFinance({ [FIN.noteA]: NOTE, [FIN.paymentStatus]: { name: "pending" }, [FIN.amount]: 18900, [FIN.paymentRef]: "pay_x",
    [FIN.sessionStatus]: "Pending", "https://x/?t=secret": "ignored" });
  assert.equal(f.payment_status, "pending"); assert.equal(f.deposit_due_thb, 5700); assert.equal(f.balance_thb, 13200); assert.equal(f.amount_thb, 18900);
  assert.equal(JSON.stringify(f).includes("secret"), false);
});

test("job finance is null-safe without extras, malformed notes or a discount", () => {
  assert.equal(projectFinance(undefined), null);
  assert.equal(parsePricingHistory("[MMD SERVICE PRICING v1] {not json"), null);
  assert.equal(parsePricingHistory("hello"), null);
  const noDiscount = parsePricingHistory('[MMD SERVICE PRICING v1] {"version":1,"client_base_amount_thb":5000,"client_total_amount_thb":5000,"addons":[]}');
  assert.equal(noDiscount.discount, null); assert.equal(noDiscount.client_gross_thb, 5000);
  const page = buildJobsPage([{ id: "recS1", fields: { session_id: "S1", job_date: "2026-10-10" } }], { extrasById: { recS1: { [FIN.noteA]: NOTE } } });
  assert.equal(page.items[0].finance.pricing.discount.type, "percent");
  assert.equal(buildJobsPage([{ id: "recS2", fields: { session_id: "S2" } }]).items[0].finance, null);
});

test("projectFinance exposes customer/model acknowledgement times only", async () => {
  const { projectFinance, JOB_FINANCE_FIELD_IDS: F } = await import("./src/admin-dashboard-jobs.js");
  const f = projectFinance({ [F.customerAck]: "2026-10-09T01:00:00.000Z", [F.modelAck]: "not-a-date" });
  assert.equal(f.customer_ack_at, "2026-10-09T01:00:00.000Z");
  assert.equal(f.model_ack_at, null);
});
