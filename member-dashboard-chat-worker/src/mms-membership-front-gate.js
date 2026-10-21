const PAGE_PATHS = new Set(['/male-massage/member', '/male-massage/member/privacy']);
const API_PREFIX = '/api/mms/app/membership/';

export function isMmsMembershipRequest(request) {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  return PAGE_PATHS.has(path) || path.startsWith(API_PREFIX);
}

export function isMmsMembershipOriginPassthrough(request) {
  return new URL(request.url).pathname.startsWith('/male-massage/member') && !isMmsMembershipRequest(request);
}

export async function proxyMmsMembership(request, env) {
  if (!env.MMS_MEMBER_WORKER?.fetch) return Response.json({ ok: false, error: { code: 'MMS_MEMBERSHIP_UNAVAILABLE' } }, {
    status: 503, headers: { 'cache-control': 'private, no-store' },
  });
  try {
    // Preserve URL, Origin and stage-scoped cookies; never forward to a presentation host.
    const response = await env.MMS_MEMBER_WORKER.fetch(request);
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname.replace(/\/$/, '') !== '/male-massage/member'
      || !['', 'published'].includes(url.searchParams.get('stage') || '')
      || !response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
    // The existing LINE account page remains the identity authority. Its
    // registered-account section provides a same-host entry to the workspace.
    const html = (await response.text()).replace(
      'href="https://lin.ee/NkfXMu7">จองบริการกับทีม Male Massage</a>',
      'href="/male-massage">เปิด MY MMS →</a>',
    );
    const headers = new Headers(response.headers);
    for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name);
    headers.set('cache-control', 'private, no-store');
    return new Response(html, { status: response.status, headers });
  } catch {
    return Response.json({ ok: false, error: { code: 'MMS_MEMBERSHIP_UNAVAILABLE' } }, {
      status: 503, headers: { 'cache-control': 'private, no-store' },
    });
  }
}
