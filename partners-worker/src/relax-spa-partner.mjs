import { renderRelaxSpaPage } from '../../admin-worker/src/relax-spa-page.js';
const PAGE = '/partner/dashboard/relax-spa';
const API = '/v1/partner/relax-spa/';
const reply = (code, status) => Response.json({ ok: false, error: { code } }, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
export function isRelaxSpaPartnerRequest(path) { return path === PAGE || path.startsWith(API); }
export async function handleRelaxSpaPartner(request, env, partnerRecordId) {
  const u = new URL(request.url);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(partnerRecordId || '')) return reply('PARTNER_REQUIRED', 403);
  if (u.pathname === PAGE) {
    if (!['GET', 'HEAD'].includes(request.method)) return reply('METHOD_NOT_ALLOWED', 405);
    return new Response(request.method === 'HEAD' ? null : renderRelaxSpaPage({ partner: true }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex,nofollow', 'x-content-type-options': 'nosniff' } });
  }
  const command = u.pathname.slice(API.length);
  if (!['snapshot', 'catalog', 'referrals'].includes(command)) return reply('PARTNER_FINANCE_FORBIDDEN', 403);
  if (request.method !== (command === 'referrals' ? 'POST' : 'GET')) return reply('METHOD_NOT_ALLOWED', 405);
  if (command === 'referrals' && request.headers.get('origin') !== u.origin) return reply('ORIGIN_NOT_ALLOWED', 403);
  if (command === 'referrals' && !request.headers.get('content-type')?.startsWith('application/json')) return reply('JSON_REQUIRED', 415);
  if (!env.MMS_WORKER?.fetch) return reply('MMS_SERVICE_UNAVAILABLE', 503);
  let body;
  if (request.method === 'POST') { body = await request.text(); if (body.length > 16_384) return reply('BODY_TOO_LARGE', 413); }
  try {
    return await env.MMS_WORKER.fetch(new Request('https://mms.internal/internal/mms/admin/relax-spa/' + command, { method: request.method,
      headers: { 'content-type': 'application/json', 'x-mms-spa-actor': 'partner:' + partnerRecordId, 'x-mms-spa-role': 'spa_partner' }, body }));
  } catch { return reply('MMS_SERVICE_UNAVAILABLE', 503); }
}
