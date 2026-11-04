import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { renderSocialMediaPage } from './social-media-page.js';

export const SOCIAL_MEDIA_PATH = '/internal/admin/social-media';
const ORIGINS = new Set(['https://mmdbkk.com', 'https://www.mmdbkk.com']);
const HEADERS = { 'cache-control': 'private, no-store', vary: 'Cookie', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow', 'x-mmd-route-owner': 'admin-worker' };
export function isSocialMediaRequest(request) {
  return new URL(request.url).pathname.replace(/\/+$/, '') === SOCIAL_MEDIA_PATH;
}
export async function handleSocialMedia(request, env) {
  const url = new URL(request.url);
  if (!isSocialMediaRequest(request)) return new Response(null, { status: 404, headers: HEADERS });
  if (!ORIGINS.has(url.origin) || (request.headers.has('origin') && request.headers.get('origin') !== url.origin)) return new Response(null, { status: 403, headers: HEADERS });
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return new Response(null, { status: 303, headers: { ...HEADERS, location: '/internal/admin/login?next=' + encodeURIComponent(SOCIAL_MEDIA_PATH) } });
  if (!['owner', 'admin'].includes(actor.role)) return new Response(null, { status: 403, headers: HEADERS });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...HEADERS, allow: 'GET, HEAD' } });
  const nonce = crypto.randomUUID();
  return new Response(request.method === 'HEAD' ? null : renderSocialMediaPage(nonce), { headers: { ...HEADERS, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
}
