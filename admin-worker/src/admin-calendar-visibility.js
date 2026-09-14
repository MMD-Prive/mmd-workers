import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { calendarPageResponse as basePageResponse, calendarApiResponse, calendarJsonResponse } from './admin-calendar-runtime-v2.js';

export { calendarApiResponse, calendarJsonResponse };
const ROLES = new Set(['owner', 'admin', 'super_admin', 'superadmin']);
const CAL_API_VERSION = '2026-02-25';
const CAL_SYNC_HEALTH_URL = 'https://cal-sync.internal/health';
const CAL_SYNC_PUBLIC_FALLBACK = 'https://cal-sync-worker.malemodel-bkk.workers.dev/health';
const clean = value => String(value ?? '').trim();
const escapeHtml = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// /v1/admin/auth/me intentionally projects authentication, not actor id/role.
// Use the same credential-bound signature verifier as the canonical login owner.
export async function readCalendarOwnerActor(request, env) {
  const actor = await readCredentialBoundAdminActor(request, env);
  return actor && ROLES.has(clean(actor.role).toLowerCase()) ? actor : null;
}

export function calendarDate(value) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(raw + 'T12:00:00+07:00');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === raw ? raw : '';
}

async function readJson(url, headers, fetcher) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetcher(url, { method:'GET', headers, redirect:'error', signal:controller.signal });
    return { status:response.status, ok:response.ok, data:await response.json().catch(() => null) };
  } catch { return { status:0, ok:false, data:null }; }
  finally { clearTimeout(timeout); }
}

function serviceBindingFetcher(binding) {
  if (!binding || typeof binding.fetch !== 'function') return null;
  return (url, init = {}) => binding.fetch(new Request(url, init));
}

async function readBridgeHealth(env, fetcher) {
  const serviceFetch = serviceBindingFetcher(env.CAL_SYNC_WORKER);
  if (serviceFetch) return readJson(CAL_SYNC_HEALTH_URL, {accept:'application/json'}, serviceFetch);
  return readJson(CAL_SYNC_PUBLIC_FALLBACK, {accept:'application/json'}, fetcher);
}

/** Only call behind the owner gate. All probes are read-only; no booking is created. */
export async function inspectCalendarConnection(env = {}, fetcher = fetch) {
  const key = clean(env.CAL_API_KEY);
  const suppliedId = clean(env.CAL_INTERNAL_HOLD_EVENT_TYPE_ID || '7057823');
  const eventTypeId = /^\d{1,12}$/.test(suppliedId) ? Number(suppliedId) : 0;
  const [api, bridge] = await Promise.all([
    key && eventTypeId ? readJson('https://api.cal.com/v2/event-types/' + eventTypeId, {
      authorization:'Bearer ' + key, 'cal-api-version':CAL_API_VERSION, accept:'application/json',
    }, fetcher) : null,
    readBridgeHealth(env, fetcher),
  ]);
  const apiReady = api?.ok === true && api.data?.status === 'success' && Number(api.data?.data?.id) === eventTypeId;
  const bridgeReady = bridge.ok === true && bridge.data?.service === 'cal-sync-worker' && bridge.data?.ok === true;
  const bridgeMode = bridgeReady && ['shadow','active'].includes(bridge.data?.mode) ? bridge.data.mode : 'unknown';
  return {
    checked_at:new Date().toISOString(),
    outbound:{ configured:Boolean(key), api_verified:apiReady, api_version:CAL_API_VERSION, event_type_id:eventTypeId || null,
      status:!key?'missing_cal_api_key':!eventTypeId?'invalid_event_type':apiReady?'read_verified':[401,403].includes(api?.status)?'credential_rejected':'read_unavailable',
      booking_creation_verified:false },
    inbound:{ reachable:bridgeReady, transport:serviceFetchTransport(env), mode:bridgeMode,
      webhook_secret_configured:bridgeReady && bridge.data?.webhook_secret_configured === true,
      api_key_configured:bridgeReady && bridge.data?.api_key_configured === true,
      mapping_ledger_configured:bridgeReady && bridge.data?.mapping_ledger_configured === true },
    mutations_attempted:false,
  };
}

function serviceFetchTransport(env = {}) {
  return serviceBindingFetcher(env.CAL_SYNC_WORKER) ? 'service_binding' : 'public_fallback';
}

export async function calendarPageResponse(env = {}, selectedDate = '') {
  const base = basePageResponse();
  let html = await base.text();
  const connection = await inspectCalendarConnection(env);
  const out = connection.outbound, incoming = connection.inbound;
  const outboundText = out.api_verified ? 'Cal API: อ่าน MMD Internal Hold ได้แล้ว' : out.status === 'missing_cal_api_key'
    ? 'ยังไม่มี CAL_API_KEY ใน admin-worker' : out.status === 'credential_rejected'
      ? 'Cal ปฏิเสธ credential ของ admin-worker' : 'ยังยืนยันการอ่าน MMD Internal Hold จาก Cal API ไม่ได้';
  const inboundText = !incoming.reachable ? 'ยังอ่านสถานะ cal-sync-worker ไม่ได้'
    : !incoming.webhook_secret_configured ? 'Webhook ยังไม่มี secret สำหรับตรวจลายเซ็น'
    : !incoming.mapping_ledger_configured ? 'Webhook พร้อมรับ แต่ Booking UID ledger ยังไม่พร้อม'
    : 'Webhook และ Booking UID ledger พร้อม · ' + incoming.mode + ' · ' + incoming.transport;
  const summary = out.api_verified && incoming.webhook_secret_configured && incoming.mapping_ledger_configured
    ? 'Cal · การเชื่อมต่อพร้อมตรวจรายการ' : 'Cal · ยังมีการตั้งค่าที่ต้องตรวจ';
  const panel = `<details class="panel cal-connection" open><summary>${escapeHtml(summary)}</summary><p>${escapeHtml(outboundText)}</p><p>${escapeHtml(inboundText)}</p><p class="muted">Internal Hold เกิดหลังนายแบบยืนยันคิว และรอมัดจำตามรายการจริง · การเชื่อม API ไม่เท่ากับมี Booking แล้ว และ Cal ไม่ยืนยันยอดชำระ</p><small>ตรวจเมื่อ ${escapeHtml(connection.checked_at)} · อ่านสถานะเท่านั้น</small></details><script type="application/json" id="calendar-connection-state">${JSON.stringify(connection).replace(/</g,'\\u003c')}</script>`;
  if (!html.includes('<section class="metrics"') || !html.includes("let d=new Date(),view='today',data=null;")) throw new Error('calendar_shell_contract_changed');
  html = html.replace('<section class="metrics"', panel + '<section class="metrics"');
  html = html.replace('CAL BRIDGE <b>SHADOW</b>', 'CAL BRIDGE <b>' + escapeHtml(incoming.mode.toUpperCase()) + '</b>');
  const date = calendarDate(selectedDate);
  if (date) html = html.replace("let d=new Date(),view='today',data=null;", `let d=new Date('${date}T12:00:00+07:00'),view='today',data=null;`);
  html = html.replace('</section><nav class="tabs">', `</section><form class="cal-date-form" action="/internal/admin/calendar" method="get"><label for="calendar-date">เลือกวันงาน</label><input id="calendar-date" name="date" type="date" value="${date}" required><button type="submit">แสดงงาน</button></form><nav class="tabs">`);
  html = html.replace('</head>', `<style>.app .cal-connection{margin-top:12px}.app .cal-connection summary{cursor:pointer;font-weight:700;font-size:14px;line-height:1.6}.app .cal-connection p{font-size:12px;line-height:1.7;margin:8px 0}.app .cal-connection small{font-size:11px;color:var(--m)}.app .cal-date-form{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}.app .cal-date-form input,.app .cal-date-form button{font:inherit;min-height:44px;background:var(--p);color:var(--t);border:1px solid var(--l);border-radius:10px;padding:8px 12px}.app .cal-date-form label{font-size:12px}.app .chip,.app .metric span,.app .metric small,.app .tag,.app .muted,.app .empty,.app .time span{font-size:12px;line-height:1.6}.app .tab,.app .action a,.app .action button,.app .date button{min-height:44px;font-size:12px}.app .event h3{font-size:14px}.app .event{overflow-wrap:anywhere}.app .mobile{font-size:12px}.app .main{min-width:0}.app .grid>*{min-width:0}</style></head>`);
  const headers = new Headers(base.headers);
  headers.set('x-mmd-calendar-surface','admin-worker-v1.2');
  return new Response(html,{status:200,headers});
}
