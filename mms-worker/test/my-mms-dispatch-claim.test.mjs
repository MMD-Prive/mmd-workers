import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { claimDispatchJobWinner } from "../src/my-mms-dispatch-claim.mjs";

function createDispatchStore() {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE dispatch_jobs (
    job_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    winner_therapist_id TEXT,
    accepted_at INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`);
  database.prepare("INSERT INTO dispatch_jobs (job_id, state, version, updated_at) VALUES (?, 'OFFERED', 1, 1)").run("mmsjob_one");
  return {
    database,
    sql: {
      exec(query, ...values) {
        const statement = database.prepare(query);
        if (statement.columns().length) return { toArray: () => statement.all(...values) };
        statement.run(...values);
        return { toArray: () => [] };
      },
    },
  };
}

test("simultaneous Therapists competing for one job produce exactly one winner", async () => {
  const { database, sql } = createDispatchStore();
  const winners = await Promise.all([
    Promise.resolve().then(() => claimDispatchJobWinner(sql, "mmsjob_one", "therapist_a", 10)),
    Promise.resolve().then(() => claimDispatchJobWinner(sql, "mmsjob_one", "therapist_b", 11)),
  ]);

  assert.equal(new Set(winners).size, 1);
  assert.ok(["therapist_a", "therapist_b"].includes(winners[0]));
  const stored = database.prepare("SELECT state, winner_therapist_id FROM dispatch_jobs WHERE job_id=?").get("mmsjob_one");
  assert.equal(stored.state, "ACCEPTED");
  assert.equal(stored.winner_therapist_id, winners[0]);
  database.close();
});
