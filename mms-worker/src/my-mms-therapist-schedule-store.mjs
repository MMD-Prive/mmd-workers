export function createMmsTherapistScheduleCoordinator(DurableObjectBase) {
  return class MmsTherapistScheduleCoordinator extends DurableObjectBase {
    constructor(ctx, env) {
      super(ctx, env);
      ctx.blockConcurrencyWhile(() => {
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS therapist_schedule_reservations (
            job_id TEXT PRIMARY KEY,
            start_at INTEGER,
            end_at INTEGER,
            state TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS therapist_schedule_window
            ON therapist_schedule_reservations(state, start_at, end_at);
        `);
      });
    }

    reserve(jobId, startAt, endAt, activeJobs, now) {
      const job = cleanJob(jobId, startAt, endAt);
      if (!job) return { state: "INVALID_WINDOW" };

      for (const active of Array.isArray(activeJobs) ? activeJobs : []) {
        const seeded = cleanActiveJob(active, now);
        if (!seeded || seeded.job_id === job.job_id) continue;
        this.ctx.storage.sql.exec(
          `INSERT OR IGNORE INTO therapist_schedule_reservations
            (job_id, start_at, end_at, state, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          seeded.job_id,
          seeded.start_at,
          seeded.end_at,
          seeded.state,
          now,
          now,
        );
      }

      const existing = this.ctx.storage.sql.exec(
        "SELECT job_id, start_at, end_at, state FROM therapist_schedule_reservations WHERE job_id=?",
        job.job_id,
      ).toArray()[0];
      if (existing) {
        if (existing.state === "RELEASED") return { state: "RESERVED", job_id: job.job_id, replay: true, released: true };
        if (existing.state === "BLOCKED") return { state: "SCHEDULE_UNKNOWN" };
        if (existing.state === "ACTIVE" && Number(existing.end_at) === Number.MAX_SAFE_INTEGER) {
          return { state: "RESERVED", job_id: job.job_id, replay: true, in_progress: true };
        }
        if (Number(existing.start_at) !== job.start_at || Number(existing.end_at) !== job.end_at) {
          return { state: "JOB_WINDOW_CONFLICT" };
        }
        return { state: "RESERVED", job_id: job.job_id, replay: true };
      }

      const conflict = this.ctx.storage.sql.exec(
        `SELECT job_id, state FROM therapist_schedule_reservations
         WHERE state IN ('HELD','ACTIVE','BLOCKED') AND job_id<>?
           AND (state='BLOCKED' OR (start_at < ? AND end_at > ?))
         LIMIT 1`,
        job.job_id,
        job.end_at,
        job.start_at,
      ).toArray()[0];
      if (conflict) return { state: conflict.state === "BLOCKED" ? "SCHEDULE_UNKNOWN" : "OVERLAP" };

      this.ctx.storage.sql.exec(
        `INSERT INTO therapist_schedule_reservations
          (job_id, start_at, end_at, state, created_at, updated_at)
         VALUES (?, ?, ?, 'HELD', ?, ?)`,
        job.job_id,
        job.start_at,
        job.end_at,
        now,
        now,
      );
      return { state: "RESERVED", job_id: job.job_id, replay: false };
    }

    markInProgress(jobId, now) {
      const id = String(jobId || "").trim();
      if (!id) return { state: "INVALID_JOB" };
      const row = this.ctx.storage.sql.exec(
        "SELECT state FROM therapist_schedule_reservations WHERE job_id=?",
        id,
      ).toArray()[0];
      if (!row || row.state === "RELEASED" || row.state === "BLOCKED") return { state: "RESERVATION_UNAVAILABLE" };
      this.ctx.storage.sql.exec(
        "UPDATE therapist_schedule_reservations SET state='ACTIVE', start_at=0, end_at=?, updated_at=? WHERE job_id=?",
        Number.MAX_SAFE_INTEGER,
        now,
        id,
      );
      return { state: "ACTIVE", job_id: id };
    }

    restoreScheduledWindow(jobId, startAt, endAt, now) {
      const job = cleanJob(jobId, startAt, endAt);
      if (!job) return { state: "INVALID_WINDOW" };
      this.ctx.storage.sql.exec(
        "UPDATE therapist_schedule_reservations SET state='HELD', start_at=?, end_at=?, updated_at=? WHERE job_id=? AND state='ACTIVE'",
        job.start_at,
        job.end_at,
        now,
        job.job_id,
      );
      return { state: "HELD", job_id: job.job_id };
    }

    release(jobId, now) {
      const id = String(jobId || "").trim();
      if (!id) return { state: "INVALID_JOB" };
      this.ctx.storage.sql.exec(
        "UPDATE therapist_schedule_reservations SET state='RELEASED', updated_at=? WHERE job_id=? AND state<>'RELEASED'",
        now,
        id,
      );
      return { state: "RELEASED", job_id: id };
    }

    snapshot() {
      return this.ctx.storage.sql.exec(
        "SELECT job_id, start_at, end_at, state, created_at, updated_at FROM therapist_schedule_reservations ORDER BY job_id",
      ).toArray();
    }
  };
}

function cleanJob(jobId, startAt, endAt) {
  const id = String(jobId || "").trim();
  const start = Number(startAt);
  const end = Number(endAt);
  if (!id || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return null;
  return { job_id: id, start_at: start, end_at: end };
}

function cleanActiveJob(value, now) {
  const id = String(value?.job_id || "").trim();
  if (!id) return null;
  const start = Number(value?.start_at);
  const end = Number(value?.end_at);
  if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && end > start) {
    if (end <= now) return null;
    return { job_id: id, start_at: start, end_at: end, state: "ACTIVE" };
  }
  return { job_id: id, start_at: null, end_at: null, state: "BLOCKED" };
}
