import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { isOwnerActor } from './owner-my-mmd-recovery-diagnostic.js';
import { handleMemberCompleteness, MEMBER_COMPLETENESS_API } from './member-completeness.js';
import { buildAdminDashboard } from './dashboard-worker.js';
import { buildOwnerActionsQueue } from './owner-actions-queue.js';
import { listMmdNowItems } from '../../member-pages-worker/src/member-updates.js';

export const MY_MMD_OPERATIONS_PATH = '/v1/admin/my-mmd/operations';
// Reuse the existing exact admin-worker dashboard route; no new zone route is needed.
export const MY_MMD_OPERATIONS_DASHBOARD_URL = '/v1/admin/dashboard?view=my-mmd-operations';
export const isMyMmdOperationsRequest = request => {
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
  return path === MY_MMD_OPERATIONS_PATH || (path === '/v1/admin/dashboard' && url.searchParams.get('view') === 'my-mmd-operations');
};
const AIRTABLE_API = 'https://api.airtable.com/v0';
const DEFAULT_RENEWAL_TABLE = 'tblXjQFwo0A2cHseh';
const RENEWAL_REVIEW_STATES = new Set(['renewal_pending_review', 'pending_review', 'review_required', 'needs_review', 'review', 'materialized']);
const headers = { 'cache-control': 'private, no-store', vary: 'Cookie', 'x-content-type-options': 'nosniff' };

export function projectOperations({ dashboard, completeness, drafts, renewals, watch }) {
  const groups = [];
  const add = (id, title, href, rows, scope, available) => groups.push({ id, title, href, state: available ? 'resolved' : 'unavailable', count: available ? rows.length : null, items: available ? rows : [], scope });
  const paymentItems = Array.isArray(dashboard?.money) ? dashboard.money : [];
  add('payments', 'ตรวจการชำระเงิน', '/internal/admin/payments', paymentItems.map((row, i) => ({ id: `payment-${i}`, title: row.title, href: row.href })), 'bounded_loaded_records', dashboard?.debug?.payment_source === 'ok');
  add('identity', 'ข้อมูลสมาชิกที่ต้องตรวจ', '/internal/admin/my-mmd/completeness', (completeness?.rows || []).filter(row => row.reasons?.length).map(row => ({ id: row.record_id, title: row.category === 'identity_review' ? 'ตรวจการเชื่อมตัวตน' : 'ข้อมูลสมาชิกไม่ครบ', reasons: row.reasons, href: '/internal/admin/my-mmd/completeness' })), 'structural_only_not_entitlement_or_payment_truth', completeness?.ok === true);
  const hypeConnected = watch?.source_coverage?.some(source => source.source === 'hype' && source.state === 'connected') === true;
  add('coupons', 'คูปองรอตรวจ', '/internal/admin/control-room', (watch?.actions || []).filter(row => row.action_key === 'hype_coupon_manual_review_overdue').map(row => ({ id: row.action_key, title: row.title, href: row.href, affected_count: row.count })), 'overdue_watch_decision_classes_only_not_all_coupons', hypeConnected);
  // Read-only renewal intake status; never infers payment, entitlement, approval, or activation.
  add('renewals', 'ต่ออายุค้าง', '/internal/admin/membership-access', (renewals || []).map(row => ({
    id: row.id, title: row.title, href: '/internal/admin/membership-access', status: row.status,
  })), 'renewal_source_status_only_not_entitlement_or_payment_truth', Array.isArray(renewals));
  add('drafts', 'ข่าว MMD NOW ฉบับร่าง', 'https://mmdprive.design.webflow.com/', (drafts || []).map(row => ({ id: row.id, title: String(row.fieldData?.name || 'ข่าวฉบับร่าง').slice(0,256), href: 'https://mmdprive.design.webflow.com/' })), 'all_staged_cms_pages', Array.isArray(drafts));
  return { ok: true, schema: 'mmd_member_operations_v1', state: groups.every(group => group.state === 'resolved') ? 'resolved' : 'partial', checked_at: new Date().toISOString(), groups, mutation_allowed: false };
}

export async function handleMyMmdOperations(request, env, dependencies = {}) {
  const json = (body, status = 200) => Response.json(body, { status, headers });
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const actor = await (dependencies.readActor || readCredentialBoundAdminActor)(request, env);
  if (!isOwnerActor(actor)) return json({ ok: false, error: 'owner_required' }, 403);
  const url = new URL(request.url);
  const dashboardView = url.pathname === '/v1/admin/dashboard' && [...url.searchParams].length === 1 && url.searchParams.get('view') === 'my-mmd-operations';
  if (url.search && !dashboardView) return json({ ok: false, error: 'selectors_not_supported' }, 400);
  const readers = dependencies.readers || {
    dashboard: () => buildAdminDashboard(env, { ownerActor: actor }),
    completeness: async () => {
      const response = await handleMemberCompleteness(new Request(new URL(MEMBER_COMPLETENESS_API, request.url), { headers: request.headers }), env);
      if (!response.ok) throw Error(); return response.json();
    },
    renewals: () => listPendingRenewals(env),
    drafts: async () => {
      if (!env.WEBFLOW_CMS_TOKEN && typeof env.WEBFLOW_CMS_HTTP?.fetch !== 'function') throw Error('cms_not_configured');
      return (await listMmdNowItems(env, false)).filter(item => item.isDraft === true && item.isArchived === false);
    },
  };
  const results = await Promise.allSettled(['dashboard', 'completeness', 'renewals', 'drafts'].map(key => readers[key]()));
  const [dashboard, completeness, renewals, drafts] = results.map(result => result.status === 'fulfilled' ? result.value : null);
  const watch = dashboard?.owner_actions_source ? buildOwnerActionsQueue(dashboard.owner_actions_source) : null;
  return json(projectOperations({ dashboard, completeness, renewals, drafts, watch }));
}

export async function listPendingRenewals(env, limit = 50) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw Error('airtable_not_configured');
  const table = env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || DEFAULT_RENEWAL_TABLE;
  const url = new URL(AIRTABLE_API + '/' + env.AIRTABLE_BASE_ID + '/' + encodeURIComponent(table));
  url.searchParams.set('maxRecords', String(Math.max(1, Math.min(100, limit))));
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + env.AIRTABLE_API_KEY, accept: 'application/json' } });
  if (!response.ok) throw Error('renewal_source_unavailable');
  const data = await response.json();
  if (!Array.isArray(data.records)) throw Error('renewal_source_malformed');
  return data.records.filter(record => {
    const fields = record?.fields || {};
    return RENEWAL_REVIEW_STATES.has(String(fields.renewal_flow_status || fields.status || '').trim().toLowerCase());
  }).slice(0, limit).map(record => {
    const fields = record.fields || {};
    const session = String(fields.renewal_session_id || fields.payment_intent_session_id || record.id || '').trim().slice(0, 120);
    const status = String(fields.renewal_flow_status || fields.status || 'pending_review').trim().slice(0, 80);
    return { id: record.id, title: session ? 'ต่ออายุ ' + session : 'ต่ออายุรอตรวจ', status };
  });
}
