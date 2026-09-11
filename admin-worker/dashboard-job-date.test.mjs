import test from "node:test";
import assert from "node:assert/strict";

import { buildJobList } from "./src/dashboard-worker.js";

test("dashboard jobs preserve SIGIL job_date and render date with time", () => {
  const jobs = buildJobList([
    {
      id: "rec_future",
      fields: {
        session_id: "sess_future",
        model_name: "Future Model",
        client_name: "Future Client",
        job_date: "2026-09-12",
        start_time: "20:00",
        status: "confirmed",
      },
    },
    {
      id: "rec_today",
      fields: {
        session_id: "sess_today",
        model_name: "Today Model",
        client_name: "Today Client",
        job_date: "2026-09-10",
        start_time: "19:30",
        status: "pending",
      },
    },
    {
      id: "rec_past",
      fields: {
        session_id: "sess_past",
        model_name: "Past Model",
        client_name: "Past Client",
        job_date: "2026-09-09",
        start_time: "18:00",
        status: "finished",
      },
    },
  ], new Date("2026-09-10T09:00:00.000Z"));

  assert.equal(jobs[0].id, "sess_today");
  assert.equal(jobs[0].job_date, "2026-09-10");
  assert.equal(jobs[0].time_only, "19:30");
  assert.ok(jobs[0].date_label);
  assert.equal(jobs[0].time, `${jobs[0].date_label} · 19:30`);
  assert.equal(jobs[1].id, "sess_future");
  assert.equal(jobs[2].id, "sess_past");
});

test("dashboard never invents a fallback job time", () => {
  const [job] = buildJobList([
    {
      id: "rec_missing_time",
      fields: {
        session_id: "sess_missing_time",
        model_name: "Model",
        client_name: "Client",
        status: "pending",
      },
    },
  ], new Date("2026-09-10T09:00:00.000Z"));

  assert.equal(job.job_date, "");
  assert.equal(job.date_label, "");
  assert.equal(job.time_only, "");
  assert.equal(job.time, "ยังไม่มีวันเวลา");
});

test("dashboard can derive date and time from a canonical scheduled timestamp", () => {
  const [job] = buildJobList([
    {
      id: "rec_iso",
      fields: {
        session_id: "sess_iso",
        model_name: "Model",
        client_name: "Client",
        scheduled_at: "2026-09-11T12:15:00.000Z",
        status: "confirmed",
      },
    },
  ], new Date("2026-09-10T09:00:00.000Z"));

  assert.equal(job.job_date, "2026-09-11");
  assert.equal(job.time_only, "19:15");
  assert.ok(job.time.startsWith(job.date_label));
});
