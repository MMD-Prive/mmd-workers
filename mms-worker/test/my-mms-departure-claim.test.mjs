import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDepartureClaim } from "../src/my-mms-departure-claim.mjs";

const therapistId = "mmst_123";
const job = { state: "ACCEPTED", winner_therapist_id: therapistId };
const row = (result, overrides = {}) => ({
  therapist_id: therapistId,
  action: "depart",
  result_json: JSON.stringify(result),
  created_at: 1_000,
  ...overrides,
});

test("departure claim requires the accepted job winner", () => {
  assert.equal(evaluateDepartureClaim({ job: null, row: null, therapistId, now: 2_000 }).result.code, "JOB_NOT_INITIALIZED");
  assert.equal(evaluateDepartureClaim({ job: { ...job, winner_therapist_id: "another" }, row: null, therapistId, now: 2_000 }).result.code, "NOT_JOB_OWNER");
  assert.equal(evaluateDepartureClaim({ job: { ...job, state: "IN_PROGRESS" }, row: null, therapistId, now: 2_000 }).result.code, "JOB_NOT_ACCEPTED");
});

test("a duplicate while calculation is active is not allowed to claim again", () => {
  const result = evaluateDepartureClaim({ job, row: row({ state: "CHECKING", code: "DEPARTURE_IN_PROGRESS" }), therapistId, now: 2_000 });
  assert.deepEqual(result, { claimed: false, result: { state: "CHECKING", code: "DEPARTURE_IN_PROGRESS" } });
});

test("a completed departure replays its canonical ETA without a new claim", () => {
  const cached = { state: "EN_ROUTE", eta_minutes: 48, eta_label: "48 นาที" };
  const result = evaluateDepartureClaim({ job, row: row(cached), therapistId, now: 2_000 });
  assert.deepEqual(result, { claimed: false, result: cached });
});

test("failed and stale claims can retry, while a recent claim remains exclusive", () => {
  assert.equal(evaluateDepartureClaim({ job, row: row({ state: "CHECKING", code: "DEPARTURE_RETRYABLE" }), therapistId, now: 2_000 }).action, "refresh");
  assert.equal(evaluateDepartureClaim({ job, row: row({ state: "CHECKING", code: "DEPARTURE_IN_PROGRESS" }), therapistId, now: 62_000 }).action, "refresh");
  assert.equal(evaluateDepartureClaim({ job, row: row({ state: "CHECKING", code: "DEPARTURE_IN_PROGRESS" }), therapistId, now: 60_999 }).claimed, false);
});

test("idempotency conflicts cannot replay another Therapist action", () => {
  const result = evaluateDepartureClaim({ job, row: row({ state: "EN_ROUTE" }, { therapist_id: "another" }), therapistId, now: 2_000 });
  assert.equal(result.result.code, "IDEMPOTENCY_CONFLICT");
});
