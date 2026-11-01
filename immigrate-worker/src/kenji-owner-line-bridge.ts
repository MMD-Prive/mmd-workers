import type { Env } from './types';
import { ownerLinePanel } from '../../admin-worker/src/kenji-owner-line-unlock.js';

export const KENJI_OWNER_PAGE = '/internal/ceo/kenji-control';
const PUBLIC_HOSTS = new Set(['mmdbkk.com', 'www.mmdbkk.com']);

function hasOwnerControls(state: unknown): boolean {
  if (!state || typeof state !== 'object' || !('ok' in state) || state.ok !== true
    || !('controls' in state) || !state.controls || typeof state.controls !== 'object') return false;
  const controls = state.controls as Record<string, unknown>;
  return ['line_oa_auto_reply', 'model_keyword_auto_reply', 'all_kenji_mutations'].every(scope => {
    const control = controls[scope];
    return control !== null && typeof control === 'object'
      && 'enabled' in control && typeof control.enabled === 'boolean'
      && 'version' in control && typeof control.version === 'number'
      && Number.isSafeInteger(control.version) && control.version >= 0;
  });
}

// Called only after the existing CEO gate. Admin remains the authority for
// signed Owner identity, scoped actions, versions, idempotency and audit.
export async function bridgeKenjiOwnerPage(request: Request, env: Env, page: () => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  const stateRequest = url.searchParams.get('kenji_line_unlock_state') === '1';
  const headers = {
    'cache-control': 'private, no-store',
    vary: 'Cookie',
    'x-mmd-ceo-route-owner': 'immigrate-worker',
    'x-mmd-kenji-owner-bridge': 'admin-service-v1',
  };
  if (!PUBLIC_HOSTS.has(url.hostname)) return Response.json({ ok: false, error: 'host_not_allowed' }, { status: 403, headers });
  if (url.pathname.replace(/\/+$/, '') !== KENJI_OWNER_PAGE || !['GET', 'HEAD'].includes(request.method))
    return Response.json({ ok: false, error: 'method_or_path_not_allowed' }, { status: 405, headers: { ...headers, allow: 'GET, HEAD' } });
  if (!env.ADMIN_WORKER?.fetch) return Response.json({ ok: false, error: 'admin_worker_binding_unavailable' }, { status: 503, headers });
  url.pathname = KENJI_OWNER_PAGE;
  url.searchParams.set('kenji_line_unlock_state', '1');
  const forwardedHeaders = new Headers();
  for (const name of ['cookie', 'accept', 'accept-language']) {
    const value = request.headers.get(name);
    if (value) forwardedHeaders.set(name, value);
  }
  try {
    // Admin owns Owner authorization and state, not the Webflow CEO page.
    // Never forward browser auth/role/service headers, version overrides, or a
    // public workers.dev fallback. The browser POST still uses the existing API.
    const upstream = await env.ADMIN_WORKER.fetch(new Request(url.toString(), {
      method: 'GET', headers: forwardedHeaders, redirect: 'manual', signal: AbortSignal.timeout(10000),
    }));
    // Preserve existing non-owner access to the presentation, without a button.
    if (!stateRequest && upstream.status === 403) return page();
    if (upstream.ok) {
      const state = await upstream.clone().json();
      if (!hasOwnerControls(state)) throw new Error('owner_state_unavailable');
      if (!stateRequest) {
        const original = await page();
        if (request.method === 'HEAD' || !original.ok || !original.headers.get('content-type')?.includes('text/html')) return original;
        const decorated = new HTMLRewriter().on('body', { element(element) { element.prepend(ownerLinePanel(), { html: true }); } }).transform(original);
        const result = new Response(decorated.body, decorated);
        for (const [name, value] of Object.entries(headers)) result.headers.set(name, value);
        result.headers.delete('etag'); result.headers.delete('content-length');
        return result;
      }
    }
    const responseHeaders = new Headers(upstream.headers);
    for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
    responseHeaders.delete('etag');
    responseHeaders.delete('content-length');
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status, statusText: upstream.statusText, headers: responseHeaders,
    });
  } catch {
    return Response.json({ ok: false, error: 'admin_worker_unavailable' }, { status: 503, headers });
  }
}
