// Fixed vocabulary only. Never accepts identity, credentials, URLs or error text.
// Persistence is deliberately independent of whole-Worker console collection.
export function createStartDiagnostics({ emit = value => console.info(value), now = Date.now, kv, ctx } = {}) {
  const stages = new Set(['verify_token', 'resolve_member', 'pending_identity', 'issue_session', 'persist_gateway', 'save_session', 'remembered_login', 'safe_view']);
  const started = now();
  const ref = crypto.randomUUID();
  let sequence = 0;
  const elapsed = at => Math.min(300000, Math.max(0, Math.round(now() - at)));
  const log = (stage, outcome, duration_ms, status) => {
    const row = { event:'liff_start_timing', ref, stage, outcome, duration_ms, ...(Number.isInteger(status) && status >= 100 && status <= 599 ? {status} : {}) };
    try { emit({...row}); } catch {}
    // Unique keys avoid KV same-key write limits and out-of-order overwrites.
    // No untracked background I/O if an entry wrapper drops ExecutionContext.
    if (sequence >= 24 || typeof kv?.put !== 'function' || typeof ctx?.waitUntil !== 'function') return;
    const index = sequence++;
    const observed_at = now();
    try {
      ctx.waitUntil(Promise.resolve().then(() => kv.put(
        `liff_start_timing:${started}:${ref}:${index}`,
        JSON.stringify({...row, observed_at}), {expirationTtl: 60 * 60 * 48},
      )).catch(() => {}));
    } catch {} // Diagnostics must never change authentication or its response.
  };
  return {
    async step(stage, operation) {
      if (!stages.has(stage)) throw new Error('invalid_diagnostic_stage');
      const at = now(); log(stage, 'begin', 0);
      try { const value = await operation(); log(stage, 'returned', elapsed(at)); return value; }
      catch (error) { log(stage, 'threw', elapsed(at)); throw error; }
    },
    disconnected() { log('request', 'aborted', elapsed(started)); },
    complete(status) { log('request', 'complete', elapsed(started), status); },
    failed() { log('request', 'threw', elapsed(started)); },
  };
}
