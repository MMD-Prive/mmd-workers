export const TART_REVIEW_PATH = '/sigil/model/dashboard-assets/tart-review.png';

export async function tartReviewAssetResponse(request, env = {}) {
  const pathname = new URL(request.url).pathname;
  if (![TART_REVIEW_PATH,'/sigil/model/dashboard-assets/sigil-review-logo.png'].includes(pathname)) return null;
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, {status:405,headers:{allow:'GET, HEAD'}});
  }
  if (!env.ASSETS?.fetch) return new Response('TarT asset unavailable', {status:503});
  const url = new URL('/'+pathname.split('/').at(-1), request.url);
  // Decorative asset only: never forward a session or customer credential.
  const response = await env.ASSETS.fetch(new Request(url, {method:request.method}));
  if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png') {
    return new Response('TarT asset unavailable', {status:503});
  }
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options','nosniff');
  return new Response(request.method === 'HEAD' ? null : response.body, {status:200,headers});
}
