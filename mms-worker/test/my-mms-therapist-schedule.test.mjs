import assert from "node:assert/strict";
import test from "node:test";
import { createMmsTherapistScheduleCoordinator } from "../src/my-mms-therapist-schedule-store.mjs";

class TestDurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}

function createSchedule() {
  const rows = new Map();
  const ctx = {
    storage: {
      sql: {
        exec(query, ...values) {
          const sql = query.replace(/\s+/g, " ").trim();
          if (sql.startsWith("CREATE TABLE") || sql.startsWith("CREATE INDEX")) return { toArray: () => [] };
          if (sql.startsWith("INSERT OR IGNORE INTO therapist_schedule_reservations")) {
            const [jobId, startAt, endAt, state, createdAt, updatedAt] = values;
            if (!rows.has(jobId)) rows.set(jobId, { job_id: jobId, start_at: startAt, end_at: endAt, state, created_at: createdAt, updated_at: updatedAt });
            return { toArray: () => [] };
          }
          if (sql.startsWith("SELECT job_id, start_at, end_at, state FROM therapist_schedule_reservations WHERE job_id=?")) {
            const row = rows.get(values[0]);
            return { toArray: () => row ? [{ job_id: row.job_id, start_at: row.start_at, end_at: row.end_at, state: row.state }] : [] };
          }
          if (sql.startsWith("SELECT state FROM therapist_schedule_reservations WHERE job_id=?")) {
            const row = rows.get(values[0]);
            return { toArray: () => row ? [{ state: row.state }] : [] };
          }
          if (sql.startsWith("SELECT job_id, state FROM therapist_schedule_reservations")) {
            const [jobId, endAt, startAt] = values;
            const conflict = [...rows.values()].find((row) => row.job_id !== jobId && ["HELD", "ACTIVE", "BLOCKED"].includes(row.state) && (row.state === "BLOCKED" || (row.start_at < endAt && row.end_at > startAt)));
            return { toArray: () => conflict ? [{ job_id: conflict.job_id, state: conflict.state }] : [] };
          }
          if (sql.startsWith("INSERT INTO therapist_schedule_reservations")) {
            const [jobId, startAt, endAt, createdAt, updatedAt] = values;
            rows.set(jobId, { job_id: jobId, start_at: startAt, end_at: endAt, state: "HELD", created_at: createdAt, updated_at: updatedAt });
            return { toArray: () => [] };
          }
          if (sql.startsWith("UPDATE therapist_schedule_reservations SET state='ACTIVE'")) {
            const [endAt, updatedAt, jobId] = values;
            const row = rows.get(jobId);
            if (row) Object.assign(row, { state: "ACTIVE", start_at: 0, end_at: endAt, updated_at: updatedAt });
            return { toArray: () => [] };
          }
          if (sql.startsWith("UPDATE therapist_schedule_reservations SET state='HELD'")) {
            const [startAt, endAt, updatedAt, jobId] = values;
            const row = rows.get(jobId);
            if (row?.state === "ACTIVE") Object.assign(row, { state: "HELD", start_at: startAt, end_at: endAt, updated_at: updatedAt });
            return { toArray: () => [] };
          }
          if (sql.startsWith("UPDATE therapist_schedule_reservations SET state='RELEASED'")) {
            const [updatedAt, jobId] = values;
            const row = rows.get(jobId);
            if (row && row.state !== "RELEASED") Object.assign(row, { state: "RELEASED", updated_at: updatedAt });
            return { toArray: () => [] };
          }
          if (sql.startsWith("SELECT job_id, start_at, end_at, state, created_at, updated_at FROM therapist_schedule_reservations")) {
            return { toArray: () => [...rows.values()].sort((a, b) => a.job_id.localeCompare(b.job_id)).map((row) => ({ ...row })) };
          }
          throw new Error(`Unsupported SQL in schedule test: ${sql}`);
        },
      },
    },
    blockConcurrencyWhile(callback) { callback(); },
  };
  const Coordinator = createMmsTherapistScheduleCoordinator(TestDurableObject);
  return { coordinator: new Coordinator(ctx, {}) };
}

test("therapist schedule allows adjacent appointments and rejects overlapping windows", () => {
  const { coordinator } = createSchedule();
  const first = coordinator.reserve("mmsjob_a", 10_000, 20_000, [], 1);
  const adjacent = coordinator.reserve("mmsjob_b", 20_000, 30_000, [], 2);
  const overlap = coordinator.reserve("mmsjob_c", 19_999, 25_000, [], 3);

  assert.equal(first.state, "RESERVED");
  assert.equal(adjacent.state, "RESERVED");
  assert.equal(overlap.state, "OVERLAP");
});

test("concurrent requests for overlapping jobs leave exactly one reservation", async () => {
  const { coordinator } = createSchedule();
  const results = await Promise.all([
    Promise.resolve().then(() => coordinator.reserve("mmsjob_a", 10_000, 20_000, [], 1)),
    Promise.resolve().then(() => coordinator.reserve("mmsjob_b", 15_000, 25_000, [], 1)),
  ]);

  assert.deepEqual(results.map((item) => item.state).sort(), ["OVERLAP", "RESERVED"]);
  assert.equal(coordinator.snapshot().filter((item) => item.state === "HELD").length, 1);
});

test("retries are idempotent, preserve the original interval, and release is repeatable", () => {
  const { coordinator } = createSchedule();
  assert.equal(coordinator.reserve("mmsjob_a", 10_000, 20_000, [], 1).replay, false);
  assert.equal(coordinator.reserve("mmsjob_a", 10_000, 20_000, [], 2).replay, true);
  assert.equal(coordinator.reserve("mmsjob_a", 11_000, 21_000, [], 3).state, "JOB_WINDOW_CONFLICT");
  assert.equal(coordinator.release("mmsjob_a", 4).state, "RELEASED");
  assert.equal(coordinator.release("mmsjob_a", 5).state, "RELEASED");
  assert.equal(coordinator.reserve("mmsjob_b", 10_000, 20_000, [], 6).state, "RESERVED");
  assert.equal(coordinator.reserve("mmsjob_a", 10_000, 20_000, [], 7).released, true);
});

test("legacy active appointments seed conflicts and unknown windows fail closed", () => {
  const { coordinator } = createSchedule();
  const active = [{ job_id: "mmsjob_existing", start_at: 10_000, end_at: 20_000 }];
  assert.equal(coordinator.reserve("mmsjob_overlap", 15_000, 25_000, active, 1).state, "OVERLAP");
  assert.equal(coordinator.reserve("mmsjob_after", 20_000, 30_000, active, 2).state, "RESERVED");
});

test("legacy active jobs with unknown times block reservation until an explicit release", () => {
  const { coordinator } = createSchedule();
  const active = [{ job_id: "mmsjob_legacy_unknown" }];
  assert.equal(coordinator.reserve("mmsjob_unknown", 40_000, 50_000, active, 1).state, "SCHEDULE_UNKNOWN");
  coordinator.release("mmsjob_legacy_unknown", 2);
  assert.equal(coordinator.reserve("mmsjob_after_release", 40_000, 50_000, active, 3).state, "RESERVED");
});

test("expired legacy appointments do not block new work and missing requested windows are rejected", () => {
  const { coordinator } = createSchedule();
  const old = [{ job_id: "mmsjob_old", start_at: 1_000, end_at: 5_000 }];
  assert.equal(coordinator.reserve("mmsjob_new", 10_000, 20_000, old, 8_000).state, "RESERVED");
  assert.equal(coordinator.reserve("mmsjob_invalid", 20_000, 20_000, [], 8_000).state, "INVALID_WINDOW");
});

test("an in-progress service blocks later jobs until the completion or cancellation release", () => {
  const { coordinator } = createSchedule();
  assert.equal(coordinator.reserve("mmsjob_active", 10_000, 20_000, [], 1).state, "RESERVED");
  assert.equal(coordinator.markInProgress("mmsjob_active", 2).state, "ACTIVE");
  assert.equal(coordinator.reserve("mmsjob_later", 25_000, 30_000, [], 3).state, "OVERLAP");
  assert.equal(coordinator.reserve("mmsjob_earlier", 1_000, 5_000, [], 3).state, "OVERLAP");
  assert.equal(coordinator.restoreScheduledWindow("mmsjob_active", 10_000, 20_000, 4).state, "HELD");
  assert.equal(coordinator.reserve("mmsjob_later", 25_000, 30_000, [], 5).state, "RESERVED");
  coordinator.markInProgress("mmsjob_later", 6);
  coordinator.release("mmsjob_later", 7);
  assert.equal(coordinator.reserve("mmsjob_after_completion", 25_000, 30_000, [], 8).state, "RESERVED");
});
