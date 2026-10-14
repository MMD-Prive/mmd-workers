// Called only after the diagnostic page's credential-bound admin and Origin gates.
export const KBANK_SANDBOX_MODE = 'kbank_sandbox_oauth';
const PATH = '/v1/internal/payments/kbank/sandbox/smoke';
const reply = (body, status = 200) => Response.json({
  environment: 'sandbox', transfers_enabled: false, ...body,
}, { status, headers: { 'Cache-Control': 'no-store' } });

export async function requestKbankSandboxDiagnostic(env) {
  const token = String(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS || '').trim();
  if (!token || typeof env.PAYMENTS_WORKER?.fetch !== 'function') {
    return reply({ ok: false, error: 'sandbox_transport_not_configured' }, 503);
  }
  try {
    // Fixed service binding and path: no public HTTP fallback or caller-supplied URL.
    const response = await env.PAYMENTS_WORKER.fetch(new Request('https://sigil.mmdbkk.com' + PATH, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { 'x-internal-token': token, Accept: 'application/json' },
    }));
    const data = await response.json().catch(() => null);
    if (response.status === 200 && data?.environment === 'sandbox' && data.ok === true &&
        data.oauth === 'connected' && data.transfers_enabled === false &&
        typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) && data.expires_in > 0) {
      return reply({ ok: true, oauth: 'connected', expires_in: data.expires_in });
    }
    const expectedStatuses = {
      service_auth_required: 401, sandbox_disabled: 503, sandbox_not_configured: 503,
      oauth_smoke_cooldown: 429, kbank_oauth_failed: 502, kbank_oauth_unavailable: 502,
    };
    const error = data?.error;
    if (data?.environment !== 'sandbox' || data?.ok !== false ||
        !Object.hasOwn(expectedStatuses, error) || response.status !== expectedStatuses[error]) {
      return reply({ ok: false, error: 'unexpected_sandbox_response' }, 502);
    }
    const safe = { ok: false, error };
    if (error === 'oauth_smoke_cooldown') {
      if (Number.isInteger(data.retry_after_seconds) && data.retry_after_seconds > 0 && data.retry_after_seconds <= 1800) {
        safe.retry_after_seconds = data.retry_after_seconds;
      }
      safe.last_success = data.last_success === true;
    }
    return reply(safe, response.status === 401 ? 502 : response.status);
  } catch {
    return reply({ ok: false, error: 'sandbox_transport_unavailable' }, 503);
  }
}
