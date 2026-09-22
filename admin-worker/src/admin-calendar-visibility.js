import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { calendarPageResponse as basePageResponse, calendarApiResponse, calendarJsonResponse } from './admin-calendar-runtime-v2.js';

export { calendarApiResponse, calendarJsonResponse };
const ROLES = new Set(['owner', 'admin', 'super_admin', 'superadmin']);
// Cal versions are endpoint-specific. GET /v2/event-types/{id} requires 2024-06-14.
// This read-only probe must not reuse the booking-creation API version.
const CAL_EVENT_TYPE_API_VERSION = '2024-06-14';
const CAL_SYNC_HEALTH_URL = 'https://cal-sync.internal/health';
const CAL_SYNC_PUBLIC_FALLBACK = 'https://cal-sync-worker.malemodel-bkk.workers.dev/health';
const CALENDAR_PRESENTATION_URL = 'https://mmdprive.webflow.io/internal/admin/calendar';
const CALENDAR_OWNER_UI_VERSION = 'calendar-owner-ui-v3-20260922';
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
  try {
    // Keep outbound reads standards-minimal. Production proved that forwarding a
    // synthetic AbortSignal/redirect:error into this Worker runtime can fail with
    // TypeError before an HTTP response exists. Diagnostics are read-only and are
    // never used as authorization or payment truth.
    const response = await fetcher(url, { method:'GET', headers });
    return { status:response.status, ok:response.ok, data:await response.json().catch(() => null), error_name:null };
  } catch (error) {
    return { status:0, ok:false, data:null, error_name:clean(error?.name, 80) || 'Error' };
  }
}

function serviceBindingFetcher(binding) {
  if (!binding || typeof binding.fetch !== 'function') return null;
  return (url, init = {}) => binding.fetch(new Request(url, {
    method:init.method || 'GET',
    headers:init.headers || {},
  }));
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
      authorization:'Bearer ' + key, 'cal-api-version':CAL_EVENT_TYPE_API_VERSION, accept:'application/json',
    }, fetcher) : null,
    readBridgeHealth(env, fetcher),
  ]);
  const apiReady = api?.ok === true && api.data?.status === 'success' && Number(api.data?.data?.id) === eventTypeId;
  const bridgeReady = bridge.ok === true && bridge.data?.service === 'cal-sync-worker' && bridge.data?.ok === true;
  const bridgeMode = bridgeReady && ['shadow','active'].includes(bridge.data?.mode) ? bridge.data.mode : 'unknown';
  return {
    checked_at:new Date().toISOString(),
    outbound:{ configured:Boolean(key), api_verified:apiReady, api_version:CAL_EVENT_TYPE_API_VERSION, event_type_id:eventTypeId || null,
      status:!key?'missing_cal_api_key':!eventTypeId?'invalid_event_type':apiReady?'read_verified':[401,403].includes(api?.status)?'credential_rejected':'read_unavailable',
      http_status:api?.status || 0, error_name:api?.error_name || null,
      booking_creation_verified:false },
    inbound:{ reachable:bridgeReady, transport:serviceFetchTransport(env), mode:bridgeMode,
      http_status:bridge?.status || 0, error_name:bridge?.error_name || null,
      webhook_secret_configured:bridgeReady && bridge.data?.webhook_secret_configured === true,
      api_key_configured:bridgeReady && bridge.data?.api_key_configured === true,
      mapping_ledger_configured:bridgeReady && bridge.data?.mapping_ledger_configured === true,
      internal_hold_write_enabled:bridgeReady && bridge.data?.internal_hold?.write_enabled === true,
      internal_hold_coordinator_configured:bridgeReady && bridge.data?.internal_hold?.coordinator_configured === true,
      internal_hold_event_type_id:bridgeReady ? Number(bridge.data?.internal_hold?.event_type_id || 0) || null : null,
      internal_hold_writer:bridgeReady ? clean(bridge.data?.internal_hold?.writer, 80) || null : null },
    mutations_attempted:false,
  };
}

function serviceFetchTransport(env = {}) {
  return serviceBindingFetcher(env.CAL_SYNC_WORKER) ? 'service_binding' : 'public_fallback';
}

function calendarPresentationHeaders(request) {
  const headers = new Headers();
  if (request instanceof Request) {
    for (const name of ['accept','accept-language','user-agent']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
  }
  return headers;
}

function injectCalendarOwnerUi(html) {
  if (!clean(html) || html.includes('id="' + CALENDAR_OWNER_UI_VERSION + '"')) return html;

  const css = String.raw`<style id="${CALENDAR_OWNER_UI_VERSION}">
html,body{background:#09090c!important}
#mmd-admin-latest{display:none!important}
.mcal{display:grid!important;grid-template-columns:224px minmax(0,1fr)!important;min-height:100vh!important;background:radial-gradient(circle at 88% 0,rgba(215,184,114,.07),transparent 28%),#09090c!important}
.mcal__rail{position:sticky!important;inset:auto!important;top:0!important;width:auto!important;height:100vh!important;min-height:100vh!important;padding:22px 16px!important;background:rgba(7,7,10,.97)!important;border-right:1px solid rgba(255,255,255,.08)!important;z-index:12!important}
.mcal__main{margin-left:0!important;min-width:0!important;max-width:none!important;padding:28px clamp(20px,2.7vw,44px) 48px!important}
.mcal__top{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:22px!important}
.mcal__eyebrow{margin:0 0 8px!important;letter-spacing:.16em!important}
.mcal__title{margin:0!important;font-size:clamp(44px,4.6vw,68px)!important;line-height:.94!important;letter-spacing:-.045em!important}
.mcal__sub{max-width:760px!important;margin:12px 0 0!important;font-size:13px!important;line-height:1.65!important;color:rgba(247,242,234,.66)!important}
.mcal__actions{display:flex!important;justify-content:flex-end!important;align-items:center!important;flex-wrap:wrap!important;gap:8px!important}
.mcal__action{min-height:40px!important;padding:0 15px!important;font-size:9px!important}
.mcal__statusbar{display:flex!important;flex-wrap:wrap!important;gap:8px!important;margin-top:20px!important;padding:0!important;border:0!important;background:transparent!important}
.mcal__status{display:flex!important;align-items:center!important;gap:7px!important;min-height:34px!important;padding:0 11px!important;border:1px solid rgba(255,255,255,.09)!important;border-radius:999px!important;background:rgba(255,255,255,.018)!important}
.mcal__statuslabel,.mcal__statusvalue{font-size:8px!important;line-height:1!important}
.mcal__metrics{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;margin-top:14px!important}
.mcal__metric{min-height:118px!important;padding:17px 18px!important;border-radius:17px!important;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.018))!important}
.mcal__metricvalue{font-size:34px!important;line-height:1!important;margin-top:16px!important}
.mcal__metricsub{margin-top:10px!important;opacity:.68!important}
.mcal__datebar{position:sticky!important;top:10px!important;z-index:9!important;margin-top:12px!important;padding:9px 10px!important;border:1px solid rgba(255,255,255,.09)!important;border-radius:16px!important;background:rgba(15,14,19,.9)!important;backdrop-filter:blur(18px)!important;-webkit-backdrop-filter:blur(18px)!important}
.mcal__tabs{margin-top:10px!important;gap:7px!important}
.mcal__tab{min-height:38px!important;padding:0 13px!important;font-size:8px!important}
.mcal__notice{display:none!important}
.mcal__workspace{grid-template-columns:minmax(0,1.65fr) minmax(280px,.55fr)!important;gap:12px!important;margin-top:12px!important}
.mcal__panel{border-radius:17px!important;background:rgba(18,17,23,.86)!important}
.mcal-live-card{border-radius:13px!important;background:rgba(255,255,255,.022)!important}
.mcal__availability{margin-top:12px!important}
.mcal__footer{margin-top:18px!important;padding-bottom:8px!important}
[data-mmd-calendar-legacy-banner="hidden"]{display:none!important}
@media(max-width:991px){
  .mcal{display:block!important}
  .mcal__rail{position:relative!important;top:auto!important;width:auto!important;height:auto!important;min-height:0!important;padding:14px 18px!important}
  .mcal__main{padding:22px!important}
  .mcal__metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .mcal__workspace{grid-template-columns:1fr!important}
}
@media(max-width:767px){
  .mcal__rail{display:none!important}
  .mcal__main{padding:18px 13px 88px!important}
  .mcal__top{grid-template-columns:1fr!important;gap:14px!important}
  .mcal__title{font-size:48px!important}
  .mcal__actions{justify-content:flex-start!important}
  .mcal__statusbar{margin-top:16px!important}
  .mcal__metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .mcal__metric{min-height:104px!important;padding:15px!important}
  .mcal__metricvalue{font-size:30px!important;margin-top:13px!important}
  .mcal__datebar{top:8px!important}
}
</style>`;

  const runtime = String.raw`<script id="${CALENDAR_OWNER_UI_VERSION}-runtime">
(()=>{
  const boot=()=>{
    const root=document.querySelector('.mcal');
    if(!root)return;
    root.setAttribute('data-owner-ui','v3');

    const normalise=value=>String(value||'').replace(/\s+/g,' ').trim();
    const production=!/\.webflow\.io$/i.test(location.hostname);

    if(production){
      const notice=root.querySelector('.mcal__notice');
      if(notice)notice.hidden=true;
    }

    const legacy=[...document.querySelectorAll('body *')]
      .map(el=>({el,text:normalise(el.textContent)}))
      .filter(x=>x.text.length>80&&x.text.length<1400&&/SMOKE PASS/i.test(x.text)&&/(Model Confirm|Confirmed Session|live-write|source of truth)/i.test(x.text))
      .sort((a,b)=>a.text.length-b.text.length)[0];
    if(legacy?.el&&!legacy.el.classList.contains('mcal')){
      legacy.el.setAttribute('data-mmd-calendar-legacy-banner','hidden');
      legacy.el.hidden=true;
    }

    const eyebrow=root.querySelector('.mcal__eyebrow');
    const sub=root.querySelector('.mcal__sub');
    if(eyebrow)eyebrow.textContent='MMD · SCHEDULING';
    if(sub)sub.textContent='ดูคิว งานที่ยืนยันแล้ว งานรอมัดจำ และเวลาว่างของทีมจากหน้าจอเดียว';

    const labels=['งานวันนี้','รอมัดจำ','คิวชน','งานยาว'];
    const subs=['งานที่อยู่ในปฏิทิน','Model confirmed · รอรับเงิน','ต้องตรวจเวลา','5+ ชม. / ข้ามวัน'];
    root.querySelectorAll('.mcal__metriclabel').forEach((el,i)=>{if(labels[i])el.textContent=labels[i]});
    root.querySelectorAll('.mcal__metricsub').forEach((el,i)=>{if(subs[i])el.textContent=subs[i]});

    const live=[...root.querySelectorAll('.mcal__action')].find(el=>/Refresh Live Data|Calendar ใช้งานจริง/i.test(el.textContent||''));
    if(live&&production)live.textContent='โหลดข้อมูลใหม่';

    const reconcile=[...root.querySelectorAll('.mcal__action')].find(el=>/Reconcile Cal/i.test(el.textContent||''));
    if(reconcile){
      reconcile.textContent='ซิงก์ Cal';
      reconcile.title='ตรวจและเติม Cal mapping ที่ขาด โดยไม่เปลี่ยน Money Truth';
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
</script>`;

  let output = html;
  if (output.includes('</head>')) output = output.replace('</head>', css + '</head>');
  else output = css + output;
  if (output.includes('</body>')) output = output.replace('</body>', runtime + '</body>');
  else output += runtime;
  return output;
}

function injectCalendarConnectionState(html, connection) {
  const state = `<script type="application/json" id="calendar-connection-state">${JSON.stringify(connection).replace(/</g,'\\u003c')}</script>`;
  if (html.includes('id="calendar-connection-state"')) {
    return html.replace(/<script type="application\/json" id="calendar-connection-state">[\s\S]*?<\/script>/, state);
  }
  if (html.includes('</body>')) return html.replace('</body>', state + '</body>');
  return html + state;
}

async function readCalendarPresentation(request) {
  const response = await fetch(new Request(CALENDAR_PRESENTATION_URL, {
    method:'GET',
    headers:calendarPresentationHeaders(request),
    redirect:'follow',
  }));
  if (!response.ok) throw new Error('calendar_presentation_unavailable');
  const html = await response.text();
  if (!html.includes('class="mcal') || !html.includes('__MMD_CALENDAR_WEBFLOW_V2__')) {
    throw new Error('calendar_presentation_contract_changed');
  }
  return { html, headers:new Headers(response.headers) };
}

export async function calendarPageResponse(request, env = {}, selectedDate = '') {
  const connection = await inspectCalendarConnection(env);
  let html = '';
  let headers;
  let presentation = 'webflow';

  try {
    const upstream = await readCalendarPresentation(request);
    html = upstream.html;
    headers = upstream.headers;
  } catch {
    const fallback = basePageResponse();
    html = await fallback.text();
    headers = new Headers(fallback.headers);
    presentation = 'fallback';
    const date = calendarDate(selectedDate);
    if (date) {
      html = html.replace(
        "let d=new Date(),view='today',data=null;",
        `let d=new Date('${date}T12:00:00+07:00'),view='today',data=null;`,
      );
    }
  }

  html = injectCalendarOwnerUi(html);
  html = injectCalendarConnectionState(html, connection);
  for (const name of ['content-length','set-cookie','content-encoding','etag','last-modified','report-to','nel']) headers.delete(name);
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','no-store, private');
  headers.set('x-robots-tag','noindex, nofollow');
  headers.set('x-mmd-route-owner','admin-worker');
  headers.set('x-mmd-calendar-surface', presentation === 'webflow' ? 'admin-worker-webflow-v2' : 'admin-worker-fallback-v1');
  headers.set('x-mmd-calendar-presentation', presentation);
  return new Response(html,{status:200,headers});
}
