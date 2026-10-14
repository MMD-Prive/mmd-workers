export const KBANK_SMOKE_PATH = '/v1/internal/payments/kbank/sandbox/smoke';
export const KBANK_STATUS_PATH = '/v1/internal/payments/kbank/sandbox/status';
const TOKEN_URL = 'https://openapi-sandbox.kasikornbank.com/v2/oauth/token';
const OAUTH_ERROR_CODES = new Set(['invalid_client', 'unauthorized_client', 'invalid_request', 'invalid_grant', 'unsupported_grant_type', 'invalid_scope', 'server_error', 'temporarily_unavailable']);
const MAX_BANK_RESPONSE_BYTES = 16 * 1024;
const BANK_RESPONSE_MEDIA_TYPES = new Set(['json', 'html', 'text', 'other', 'missing']);
const BANK_RESPONSE_BODY_SHAPES = new Set(['json_object', 'json_array', 'json_scalar', 'empty', 'non_json', 'size_limited']);
const BANK_ERROR_SHAPES = new Set(['oauth_error', 'kbank_error_code', 'gateway_fault_detail', 'none']);
export function safeOauthError(data) {
  const candidates = [data?.error, data?.ErrorCode, data?.fault?.detail?.errorcode];
  for (const code of candidates) {
    if (typeof code !== 'string') continue;
    if (OAUTH_ERROR_CODES.has(code)) return code;
    if (['oauth.v2.InvalidClientIdentifier', 'steps.oauth.v2.invalid_client', 'steps.oauth.v2.invalid_client-invalid_client_id'].includes(code)) return 'invalid_client';
  }
  return null;
}
function bankResponseMediaType(contentType) {
  if (contentType == null || !contentType.trim()) return 'missing';
  const mime = contentType.split(';', 1)[0].trim().toLowerCase();
  if (mime === 'application/json' || mime.endsWith('+json')) return 'json';
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html';
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}
function bankErrorShape(data) {
  const candidates = [
    [data?.error, 'oauth_error'],
    [data?.ErrorCode, 'kbank_error_code'],
    [data?.fault?.detail?.errorcode, 'gateway_fault_detail'],
  ];
  for (const [code, shape] of candidates) {
    if (typeof code === 'string' && safeOauthError({ error: code })) return shape;
  }
  for (const [code, shape] of candidates) if (typeof code === 'string') return shape;
  return 'none';
}
async function readBoundedBankBody(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  let truncated = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const remaining = MAX_BANK_RESPONSE_BYTES - length;
      if (value.byteLength > remaining) {
        if (remaining > 0) {
          chunks.push(value.subarray(0, remaining));
          length += remaining;
        }
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), truncated };
}
async function inspectBankResponse(response) {
  const mediaType = bankResponseMediaType(response.headers.get('content-type'));
  const body = await readBoundedBankBody(response);
  const text = typeof body === 'string' ? body : body.text;
  let data = null;
  let bodyShape = typeof body === 'string' || !body.truncated ? 'empty' : 'size_limited';
  if (text.trim()) {
    bodyShape = typeof body === 'string' || !body.truncated ? 'non_json' : 'size_limited';
    if (typeof body === 'string' || !body.truncated) {
      try {
        data = JSON.parse(text);
        bodyShape = data === null || typeof data !== 'object'
          ? 'json_scalar'
          : Array.isArray(data) ? 'json_array' : 'json_object';
      } catch { /* Keep malformed or capped bodies unclassified beyond safe shape metadata. */ }
    }
  }
  const errorShape = bankErrorShape(data);
  const oauthError = safeOauthError(data);
  return {
    data,
    bank_response_media_type: BANK_RESPONSE_MEDIA_TYPES.has(mediaType) ? mediaType : 'other',
    bank_response_body_shape: BANK_RESPONSE_BODY_SHAPES.has(bodyShape) ? bodyShape : 'non_json',
    bank_error_shape: BANK_ERROR_SHAPES.has(errorShape) ? errorShape : 'none',
    bank_error_code_recognized: oauthError !== null,
  };
}
const WINDOW_MS = 30 * 60 * 1000;
const reply = (data, status = 200) => Response.json({ environment: 'sandbox', ...data }, {
  status, headers: { 'cache-control': 'no-store, private' },
});

export async function handleKbankSandbox(request, env) {
  const path = new URL(request.url).pathname;
  if (path !== KBANK_SMOKE_PATH && path !== KBANK_STATUS_PATH) return null;
  if (request.method !== 'POST') return reply({ ok: false, error: 'method_not_allowed' }, 405);
  const expected = env.AUTH_SERVICE_ADMIN_TO_PAYMENTS;
  const supplied = request.headers.get('x-internal-token') || request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!expected || !supplied || supplied !== expected) return reply({ ok: false, error: 'service_auth_required' }, 401);
  if (path === KBANK_STATUS_PATH) {
    const checks = { enabled: env.KBANK_SANDBOX_ENABLED === 'true', consumer_id_present: Boolean(env.KBANK_SANDBOX_CONSUMER_ID), consumer_secret_present: Boolean(env.KBANK_SANDBOX_CONSUMER_SECRET), coordinator_present: Boolean(env.KBANK_SANDBOX_COORDINATOR) };
    return reply({ ok: true, ready: Object.values(checks).every(Boolean), checks, bank_called: false, transfers_enabled: false });
  }
  if (env.KBANK_SANDBOX_ENABLED !== 'true') return reply({ ok: false, error: 'sandbox_disabled' }, 503);
  if (!env.KBANK_SANDBOX_CONSUMER_ID || !env.KBANK_SANDBOX_CONSUMER_SECRET || !env.KBANK_SANDBOX_COORDINATOR) {
    return reply({ ok: false, error: 'sandbox_not_configured' }, 503);
  }
  // One coordinator for all callers/isolates; never accept a destination or credentials from the request.
  const stub = env.KBANK_SANDBOX_COORDINATOR.get(env.KBANK_SANDBOX_COORDINATOR.idFromName('oauth-smoke-v1'));
  return stub.fetch(new Request('https://kbank-coordinator/smoke', { method: 'POST' }));
}

export class KbankSandboxCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.pending = null;
  }
  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/smoke') return reply({ ok: false, error: 'not_found' }, 404);
    if (this.env.KBANK_SANDBOX_ENABLED !== 'true') return reply({ ok: false, error: 'sandbox_disabled' }, 503);
    if (!this.env.KBANK_SANDBOX_CONSUMER_ID || !this.env.KBANK_SANDBOX_CONSUMER_SECRET) return reply({ ok: false, error: 'sandbox_not_configured' }, 503);
    if (!this.pending) this.pending = this.run().finally(() => { this.pending = null; });
    return (await this.pending).clone();
  }
  async run() {
    const now = Date.now();
    const previous = await this.state.storage.get('attempt');
    if (previous && now < previous.nextAttemptAt) {
      return reply({ ok: false, error: 'oauth_smoke_cooldown', retry_after_seconds: Math.ceil((previous.nextAttemptAt - now) / 1000), last_success: previous.success === true }, 429);
    }
    // Persist before network IO: restarts and upstream failures must not cause token request storms.
    await this.state.storage.put('attempt', { nextAttemptAt: now + WINDOW_MS, success: false });
    try {
      const bytes = new TextEncoder().encode(`${this.env.KBANK_SANDBOX_CONSUMER_ID}:${this.env.KBANK_SANDBOX_CONSUMER_SECRET}`);
      const basic = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
      const response = await fetch(TOKEN_URL, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
        headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded', 'x-test-mode': 'true', 'env-id': 'OAUTH2' },
        body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      });
      const inspection = await inspectBankResponse(response);
      const { data, bank_response_media_type, bank_response_body_shape, bank_error_shape, bank_error_code_recognized } = inspection;
      const expires = Number(data?.expires_in);
      if (!response.ok || typeof data?.access_token !== 'string' || !data.access_token || String(data.token_type).toLowerCase() !== 'bearer' || !Number.isFinite(expires) || expires <= 0) {
        const oauthError = safeOauthError(data);
        return reply({
          ok: false, error: 'kbank_oauth_failed', upstream_status: response.status,
          bank_response_media_type, bank_response_body_shape, bank_error_shape, bank_error_code_recognized,
          ...(oauthError ? { oauth_error: oauthError } : {}),
        }, 502);
      }
      // This smoke verifies credentials only. Discard the token; never log or return bank payloads.
      await this.state.storage.put('attempt', { nextAttemptAt: now + WINDOW_MS, success: true });
      return reply({ ok: true, oauth: 'connected', expires_in: expires, transfers_enabled: false });
    } catch {
      return reply({ ok: false, error: 'kbank_oauth_unavailable' }, 502);
    }
  }
}

