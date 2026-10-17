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
    return await env.MMS_MEMBER_WORKER.fetch(request);
  } catch {
    return Response.json({ ok: false, error: { code: 'MMS_MEMBERSHIP_UNAVAILABLE' } }, {
      status: 503, headers: { 'cache-control': 'private, no-store' },
    });
  }
}
