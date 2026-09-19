import { unauthorized } from './errors.js';

const TRUSTED_SERVICE_CALLERS = new Set(['member-dashboard-chat-worker']);

export function withRequestContext(request) {
  return {
    requestId: request.headers.get('X-Request-Id') || crypto.randomUUID(),
    serviceName: request.headers.get('X-Service-Name') || 'unknown'
  };
}

function hasTrustedServiceBindingAuth(request) {
  const caller = String(request.headers.get('x-mmd-service-binding') || '').trim();
  const internal = String(request.headers.get('x-mmd-internal-call') || '').trim().toLowerCase();
  let hostname = '';
  try {
    hostname = new URL(request.url).hostname.toLowerCase();
  } catch (_) {
    return false;
  }

  return hostname === 'ai-worker.local'
    && internal === 'true'
    && TRUSTED_SERVICE_CALLERS.has(caller);
}

export function requireInternalAuth(request, env) {
  if (hasTrustedServiceBindingAuth(request)) return;

  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${env.INTERNAL_TOKEN}`;
  if (!env.INTERNAL_TOKEN || auth !== expected) {
    throw unauthorized('Missing or invalid internal token');
  }
}

export const AI_INTERNAL_AUTH_INTERNALS = Object.freeze({
  TRUSTED_SERVICE_CALLERS,
  hasTrustedServiceBindingAuth,
});
