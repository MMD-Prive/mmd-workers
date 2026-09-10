import test from "node:test";
import assert from "node:assert/strict";

import { buildJobsPage, projectJobs } from "./src/admin-dashboard-jobs.js";

function session(id, jobDate, startTime = "19:00", status = "confirmed") {
  return {
    id: `rec_${id}`,
    fields: {
      session_id: id,
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
  assert.equal(jobs[0].job_date, "2026-09-11");
  assert.equal(jobs[0].time_only, "19:15");
  assert.match(jobs[0].time, /19:15$/);

  assert.equal(jobs[1].id, "missing");
  assert.equal(jobs[1].job_date, "");
  assert.equal(jobs[1].time, "ยังไม่มีวันเวลา");
});
