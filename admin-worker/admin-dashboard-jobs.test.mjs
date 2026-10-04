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
