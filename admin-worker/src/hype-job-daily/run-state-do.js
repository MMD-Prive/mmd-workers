// HypeJobDailyRunState: one Durable Object per run key `HYPE_JOB_DAILY:<YYYY-MM-DD>`.
// Stores only run bookkeeping: status, attempts, timestamps, parts sent, and a short error class.
// It never stores the digest body or any customer/model/payment data.
const RUN_KEY = "run";
export const RUN_STATUS = Object.freeze({ CLAIMED: "claimed", SENT: "sent", FAILED: "failed", LATE_MISSED: "late_missed" });
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function shortError(value) {
  return String(value ?? "").replace(/[^\w:.\-=/ ]/g, "").slice(0, 340);
}

// Pure transition functions so they are testable without a Durable Object runtime.
export function claimRun(record, { now, claimTimeoutMs, maxAttempts, key }) {
  if (!record) {
    return { decision: "proceed", record: { key, status: RUN_STATUS.CLAIMED, attempts: 1, claimed_at: now, updated_at: now, parts_sent: 0, last_error: "" } };
  }
  if (record.status === RUN_STATUS.SENT) return { decision: "already_sent", record };
  if (record.status === RUN_STATUS.LATE_MISSED) return { decision: "late_missed", record };
  if (record.status === RUN_STATUS.CLAIMED && now - Number(record.claimed_at || 0) < claimTimeoutMs) {
    return { decision: "in_progress", record };
  }
  // failed, or claimed but stale (process died mid-run): retryable while attempts remain.
  if (Number(record.attempts || 0) >= maxAttempts) {
    const next = { ...record, status: RUN_STATUS.FAILED, updated_at: now, last_error: record.last_error || "stale_claim_max_attempts" };
    return { decision: "max_attempts", record: next };
  }
  const next = { ...record, status: RUN_STATUS.CLAIMED, attempts: Number(record.attempts || 0) + 1, claimed_at: now, updated_at: now };
  return { decision: "proceed", record: next };
}

export function markRun(record, { status, now, error, partsSent }) {
  if (!record) return { ok: false, error: "run_not_claimed", record: null };
  if (record.status === RUN_STATUS.SENT) return { ok: true, record };
  const next = { ...record, status, updated_at: now };
  if (Number.isInteger(partsSent) && partsSent >= 0) next.parts_sent = partsSent;
  if (status === RUN_STATUS.SENT) { next.sent_at = now; next.last_error = ""; }
  if (status === RUN_STATUS.FAILED) next.last_error = shortError(error);
  return { ok: true, record: next };
}

export function finalizeMissed(record, { now }) {
  if (!record) return { changed: false, record: null };
  if (record.status === RUN_STATUS.SENT || record.status === RUN_STATUS.LATE_MISSED) return { changed: false, record };
  return { changed: true, record: { ...record, status: RUN_STATUS.LATE_MISSED, updated_at: now } };
}

// Only a FAILED run can be reset for an owner retry; everything else is left exactly as it is.
export function resetFailedRun(record, { now }) {
  if (!record || record.status !== RUN_STATUS.FAILED) return { changed: false, record };
  return { changed: true, record: { ...record, status: RUN_STATUS.FAILED, attempts: 0, updated_at: now } };
}

export class HypeJobDailyRunState {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
  }

  async fetch(request) {
    if (String(request.method || "GET").toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const path = new URL(request.url).pathname;
    const now = Number.isFinite(Number(body?.now)) ? Number(body.now) : Date.now();
    const current = (await this.storage.get(RUN_KEY)) || null;

    if (path === "/claim") {
      const key = String(body?.key || "").slice(0, 80);
      const result = claimRun(current, {
        now, key,
        claimTimeoutMs: Number(body?.claim_timeout_ms) || 30 * 60 * 1000,
        maxAttempts: Number(body?.max_attempts) || 3,
      });
      if (result.record !== current) await this.storage.put(RUN_KEY, result.record);
      return json({ ok: true, decision: result.decision, attempt: result.record.attempts, parts_sent: result.record.parts_sent || 0, status: result.record.status });
    }
    if (path === "/mark") {
      const status = body?.status === RUN_STATUS.SENT ? RUN_STATUS.SENT : body?.status === RUN_STATUS.FAILED ? RUN_STATUS.FAILED : "";
      if (!status) return json({ ok: false, error: "status_invalid" }, 400);
      const result = markRun(current, { status, now, error: body?.error, partsSent: body?.parts_sent });
      if (!result.ok) return json(result, 409);
      await this.storage.put(RUN_KEY, result.record);
      return json({ ok: true, status: result.record.status });
    }
    if (path === "/finalize-missed") {
      const result = finalizeMissed(current, { now });
      if (result.changed) await this.storage.put(RUN_KEY, result.record);
      return json({ ok: true, changed: result.changed, status: result.record?.status || null });
    }
    if (path === "/reset-failed") {
      const result = resetFailedRun(current, { now });
      if (result.changed) await this.storage.put(RUN_KEY, result.record);
      return json({ ok: true, changed: result.changed, status: result.record?.status || null });
    }
    if (path === "/state") return json({ ok: true, state: current });
    return json({ ok: false, error: "not_found" }, 404);
  }
}

// Store client over the DO binding. Tests can substitute an in-memory store with the same shape.
export function durableObjectStore(binding) {
  if (!binding?.idFromName || !binding?.get) return null;
  const call = async (key, path, body) => {
    const stub = binding.get(binding.idFromName(key));
    const response = await stub.fetch(new Request(`https://hype-job-daily.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, ...body }),
    }));
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) throw new Error(`run_state_${path.slice(1)}_${response.status}`);
    return data;
  };
  return {
    claim: (key, opts) => call(key, "/claim", opts),
    mark: (key, opts) => call(key, "/mark", opts),
    finalizeMissed: (key, opts) => call(key, "/finalize-missed", opts),
    resetFailed: (key, opts) => call(key, "/reset-failed", opts),
    state: async (key) => (await call(key, "/state", {})).state ?? null,
  };
}
