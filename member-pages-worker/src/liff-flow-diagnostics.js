// Browser diagnostics use the existing same-origin endpoint, never the session lane.
export function createFlowDiagnosticSender(request) {
  let sent = 0;
  return value => {
    if (sent >= 80 || !value || typeof value.event !== 'string' || !/^loader\.(start|history|updates)\.(requested|headers|body_complete|settled|timeout|signal_abort|stale|reset|hidden|visible)$/.test(value.event)) return;
    const durationMs = value.durationMs, pending = value.pending;
    if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 300000 || !Number.isInteger(pending) || pending < 0 || pending > 1000) return;
    sent++;
    try {
      Promise.resolve(request('/member/api/liff/client-diag', {
        method:'POST', credentials:'same-origin', cache:'no-store', keepalive:true,
        headers:{'content-type':'application/json'},
        body:JSON.stringify({stage:value.event, duration_ms:durationMs, pending}),
      })).catch(() => {});
    } catch {}
  };
}
