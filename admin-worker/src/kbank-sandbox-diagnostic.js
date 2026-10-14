// Called only after the diagnostic page's credential-bound admin and Origin gates.
export const KBANK_SANDBOX_MODE = 'kbank_sandbox_oauth';
export const KBANK_STATUS_MODE = 'kbank_sandbox_status';
const PATH = '/v1/internal/payments/kbank/sandbox/smoke';
const BANK_RESPONSE_MEDIA_TYPES = new Set(['json', 'html', 'text', 'other', 'missing']);
const BANK_RESPONSE_BODY_SHAPES = new Set(['json_object', 'json_array', 'json_scalar', 'empty', 'non_json', 'size_limited']);
const BANK_ERROR_SHAPES = new Set(['oauth_error', 'kbank_error_code', 'gateway_fault_detail', 'none']);
const reply = (body, status = 200) => Response.json({
  environment: 'sandbox', transfers_enabled: false, ...body,
}, { status, headers: { 'Cache-Control': 'no-store' } });

export async function requestKbankSandboxDiagnostic(env, readiness = false) {
  const token = String(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS || '').trim();
  if (!token || typeof env.PAYMENTS_WORKER?.fetch !== 'function') {
    return reply({ ok: false, error: !token ? 'sandbox_service_token_missing' : 'sandbox_binding_missing' }, 503);
  }
  try {
    // Fixed service binding and path: no public HTTP fallback or caller-supplied URL.
    const response = await env.PAYMENTS_WORKER.fetch(new Request('https://sigil.mmdbkk.com' + (readiness ? PATH.replace('/smoke', '/status') : PATH), {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { 'x-internal-token': token, Accept: 'application/json' },
    }));
    const data = await response.json().catch(() => null);
    const failure = (error, status = 502) => reply({ ok: false, error, upstream_status: response.status }, status);
    if (!data) return failure('sandbox_non_json_response');
    if (readiness && response.status === 200 && data.environment === 'sandbox' && data.ok === true && data.bank_called === false && data.transfers_enabled === false) {
      const keys = ['enabled', 'consumer_id_present', 'consumer_secret_present', 'coordinator_present'];
      if (!keys.every(key => typeof data.checks?.[key] === 'boolean')) return failure('unexpected_sandbox_response');
      const checks = Object.fromEntries(keys.map(key => [key, data.checks[key]]));
      const c = data.cooldown;
      const valid = c?.known === true && Number.isInteger(c.retry_after_seconds) && c.retry_after_seconds >= 0 && c.retry_after_seconds <= 1800 &&
        [c.last_attempt_at,c.next_attempt_at].every(x=>x === null || (Number.isSafeInteger(x) && x > 0)) && [true,false,null].includes(c.last_success);
      const cooldown = valid ? { known:true, retry_after_seconds:c.retry_after_seconds, last_attempt_at:c.last_attempt_at, next_attempt_at:c.next_attempt_at, last_success:c.last_success } : { known:false };
      return reply({ ok: true, ready: Object.values(checks).every(Boolean) && valid && cooldown.retry_after_seconds === 0, checks, cooldown, bank_called: false });
    }
    if (readiness && response.ok) return failure('unexpected_sandbox_response');
    if (response.status === 200 && data?.environment === 'sandbox' && data.ok === true &&
        data.oauth === 'connected' && data.transfers_enabled === false &&
        typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) && data.expires_in > 0) {
      return reply({ ok: true, oauth: 'connected', expires_in: data.expires_in });
    }
    const expectedStatuses = {
      sandbox_status_unavailable: 503, service_auth_required: 401, sandbox_disabled: 503, sandbox_not_configured: 503,
      oauth_smoke_cooldown: 429, kbank_oauth_failed: 502, kbank_oauth_unavailable: 502,
    };
    const error = data?.error;
    if (data?.environment !== 'sandbox' || data?.ok !== false ||
        !Object.hasOwn(expectedStatuses, error) || response.status !== expectedStatuses[error]) {
      return failure(response.status === 404 ? 'sandbox_endpoint_missing' : 'unexpected_sandbox_response');
    }
    const safe = { ok: false, error, upstream_status: response.status };
    if (error === 'kbank_oauth_failed' && Number.isInteger(data.upstream_status) && data.upstream_status >= 100 && data.upstream_status <= 599) {
      safe.bank_http_status = data.upstream_status;
      const allowed = new Set(['invalid_client', 'unauthorized_client', 'invalid_request', 'invalid_grant', 'unsupported_grant_type', 'invalid_scope', 'server_error', 'temporarily_unavailable']);
      if (typeof data.oauth_error === 'string' && allowed.has(data.oauth_error)) safe.oauth_error = data.oauth_error;
      if (BANK_RESPONSE_MEDIA_TYPES.has(data.bank_response_media_type)) safe.bank_response_media_type = data.bank_response_media_type;
      if (BANK_RESPONSE_BODY_SHAPES.has(data.bank_response_body_shape)) safe.bank_response_body_shape = data.bank_response_body_shape;
      if (BANK_ERROR_SHAPES.has(data.bank_error_shape)) safe.bank_error_shape = data.bank_error_shape;
      if (typeof data.bank_error_code_recognized === 'boolean') safe.bank_error_code_recognized = data.bank_error_code_recognized;
    }
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

