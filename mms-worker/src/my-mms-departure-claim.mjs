const STALE_CLAIM_MS = 60_000;

/** Pure departure-claim policy shared by the Durable Object and focused tests. */
export function evaluateDepartureClaim({ job, row, therapistId, now }) {
  if (!job) return { claimed: false, result: { state: "CHECKING", code: "JOB_NOT_INITIALIZED" } };
  if (job.winner_therapist_id !== therapistId) return { claimed: false, result: { state: "CHECKING", code: "NOT_JOB_OWNER" } };
  if (job.state !== "ACCEPTED") return { claimed: false, result: { state: job.state, code: "JOB_NOT_ACCEPTED" } };
  if (!row) return { claimed: true, action: "create", result: null };
  if (row.therapist_id !== therapistId || row.action !== "depart") {
    return { claimed: false, result: { state: "CHECKING", code: "IDEMPOTENCY_CONFLICT" } };
  }

  let previous;
  try { previous = JSON.parse(row.result_json); } catch { previous = { state: "CHECKING", code: "IDEMPOTENCY_CORRUPT" }; }
  const stale = previous.code === "DEPARTURE_IN_PROGRESS" && now - Number(row.created_at) >= STALE_CLAIM_MS;
  if (previous.code === "DEPARTURE_RETRYABLE" || stale) {
    return { claimed: true, action: "refresh", result: null };
  }
  return { claimed: false, result: previous };
}
