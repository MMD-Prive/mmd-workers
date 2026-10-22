import assert from "node:assert/strict";
import test from "node:test";
import { claimDispatchJobWinner } from "../src/my-mms-dispatch-claim.mjs";

function createDispatchStore() {
  const job = { job_id: "mmsjob_one", state: "OFFERED", winner_therapist_id: null, accepted_at: null, version: 1, updated_at: 1 };
  return { job, sql: { exec(query, ...values) {
    if (query.includes("UPDATE dispatch_jobs")) {
      const [therapistId, acceptedAt, updatedAt, jobId] = values;
      if (job.job_id === jobId && job.winner_therapist_id === null) {
        Object.assign(job, { state: "ACCEPTED", winner_therapist_id: therapistId, accepted_at: acceptedAt, version: job.version + 1, updated_at: updatedAt });
      }
      return { toArray: () => [] };
    }
    if (query.includes("SELECT winner_therapist_id FROM dispatch_jobs")) {
      const [jobId] = values;
      return { toArray: () => job.job_id === jobId ? [{ winner_therapist_id: job.winner_therapist_id }] : [] };
    }
    throw new Error(`Unsupported SQL in claim test: ${query}`);
  } } };
}

test("simultaneous Therapists competing for one job produce exactly one winner", async () => {
  const { job, sql } = createDispatchStore();
  const winners = await Promise.all([
    Promise.resolve().then(() => claimDispatchJobWinner(sql, "mmsjob_one", "therapist_a", 10)),
    Promise.resolve().then(() => claimDispatchJobWinner(sql, "mmsjob_one", "therapist_b", 11)),
  ]);

  assert.equal(new Set(winners).size, 1);
  assert.ok(["therapist_a", "therapist_b"].includes(winners[0]));
  assert.equal(job.state, "ACCEPTED");
  assert.equal(job.winner_therapist_id, winners[0]);
});
