import { handleShortlist, requireOwner, securityHeaders } from './index.js';
import { renderOwnerPage } from './owner-page.js';

const OWNER_PAGE = '/internal/admin/model-selections';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    let response;
    if (path === OWNER_PAGE) {
      try {
        await requireOwner(request, env);
        if (!['GET', 'HEAD'].includes(request.method)) {
          response = Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: securityHeaders });
        } else {
          const nonce = crypto.randomUUID();
          response = new Response(request.method === 'HEAD' ? null : renderOwnerPage(nonce), {
            headers: {
              ...securityHeaders,
              'content-type': 'text/html; charset=utf-8',
              'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
            },
          });
        }
      } catch (error) {
        if (error.status === 401 && ['GET', 'HEAD'].includes(request.method)) {
          response = new Response(null, { status: 303, headers: { ...securityHeaders, location: '/internal/admin/login?next=' + encodeURIComponent(OWNER_PAGE) } });
        } else {
          response = Response.json({ ok: false, error: error.code || 'owner_page_unavailable' }, { status: error.status || 503, headers: securityHeaders });
        }
      }
    } else response = await handleShortlist(request, env);
    if (/^[a-f0-9]{40}$/.test(env.BUILD_SHA || '')) response.headers.set('x-mmd-build', env.BUILD_SHA);
    return response;
  },
};
