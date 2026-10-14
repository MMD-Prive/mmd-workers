import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { renderRelaxSpaPage } from './relax-spa-page.js';
const PAGE = '/internal/admin/mms/relax-spa';
const API = '/v1/admin/mms/relax-spa';
const COMMANDS = new Set(['snapshot', 'catalog', 'agreement-preview', 'referrals', 'referral-decision', 'agreements', 'drafts', 'quotes', 'services', 'receipts', 'refunds', 'settlements', 'payouts', 'expenses', 'close']);
const json = (code, status) => Response.json({ ok: false, error: { code } }, { status, headers: { 'cache-control': 'no-store' } });
export function isRelaxSpaAdminRequest(path) { return path === PAGE || path === API || path.startsWith(API + '/'); }
export async function handleRelaxSpaAdmin(request, env = {}) {
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
  // Never accept browser-provided actor/role headers, including the legacy bearer.
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor || !['owner', 'mms_partner'].includes(actor.role)) return json('SPA_SESSION_REQUIRED', 401);
  if (path === PAGE) {
    if (!['GET', 'HEAD'].includes(request.method)) return json('METHOD_NOT_ALLOWED', 405);
    return new Response(request.method === 'HEAD' ? null : renderRelaxSpaPage(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' } });
  }
  const command = path.slice(API.length + 1);
  if (!COMMANDS.has(command)) return json('NOT_FOUND', 404);
  if (request.method !== (['snapshot', 'catalog'].includes(command) ? 'GET' : 'POST')) return json('METHOD_NOT_ALLOWED', 405);
  if (actor.role !== 'owner' && !['snapshot', 'catalog', 'referrals'].includes(command)) return json('OWNER_REQUIRED', 403);
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return json('ORIGIN_NOT_ALLOWED', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json('JSON_REQUIRED', 415);
  }
  if (!env.MMS_WORKER?.fetch) return json('MMS_SERVICE_UNAVAILABLE', 503);
  let body;
  if (request.method === 'POST') { body = await request.text(); if (body.length > 16_384) return json('BODY_TOO_LARGE', 413); }
  try {
    return await env.MMS_WORKER.fetch(new Request('https://mms.internal/internal/mms/admin/relax-spa/' + command, {
      method: request.method, headers: { 'content-type': 'application/json', 'x-mms-spa-actor': actor.id, 'x-mms-spa-role': actor.role }, body,
    }));
  } catch { return json('MMS_SERVICE_UNAVAILABLE', 503); }
}
