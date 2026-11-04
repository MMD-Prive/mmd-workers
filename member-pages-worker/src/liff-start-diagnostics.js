// Fixed vocabulary only. Never accepts identity, credentials, URLs or error text.
export function createStartDiagnostics({ emit = value => console.info(value), now = Date.now } = {}) {
  const stages = new Set(['verify_token', 'resolve_member', 'pending_identity', 'issue_session', 'persist_gateway', 'save_session', 'remembered_login', 'safe_view']);
  const started = now();
  const ref = crypto.randomUUID();
  const elapsed = at => Math.min(300000, Math.max(0, Math.round(now() - at)));
  const log = (stage, outcome, duration_ms, status) => {
    try { emit({ event:'liff_start_timing', ref, stage, outcome, duration_ms, ...(Number.isInteger(status) && status >= 100 && status <= 599 ? {status} : {}) }); } catch {}
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
