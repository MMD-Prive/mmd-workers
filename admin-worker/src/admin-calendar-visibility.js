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
const CALENDAR_MODEL_PHOTO_PATH = '/v1/admin/calendar/model-photo';
const CALENDAR_THERAPIST_PHOTO_PATH = '/v1/admin/calendar/therapist-photo';
const MODELS_TABLE_ID = 'tblI4B0bI446vp9GX';
const MODEL_FIELD = Object.freeze({
  name:'fldShiT60bmCxFxRu',
  profilePhoto:'fldXWXqa3bnAgxN4Y',
  driveFolderId:'fldcWVb2LDRxrQDmT',
  primaryImageKey:'fldv23n7zYXKfM4z6',
  publicImageUrl:'fldC94pnSJxBsyAqS',
});

const clean = value => String(value ?? '').trim();
const escapeHtml = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// /v1/admin/auth/me intentionally projects authentication, not actor id/role.
// Use the same credential-bound signature verifier as the canonical login owner.
export async function readCalendarOwnerActor(request, env) {
  const actor = await readCredentialBoundAdminActor(request, env);
  return actor && ROLES.has(clean(actor.role).toLowerCase()) ? actor : null;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(clean(value));
    return url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
}

function firstAttachmentUrl(value) {
  if (!Array.isArray(value) || !value.length) return '';
  return safeHttpsUrl(value[0]?.url || value[0]?.thumbnails?.large?.url || value[0]?.thumbnails?.full?.url);
}

function imageContentType(key, object) {
  const type = clean(object?.httpMetadata?.contentType).toLowerCase();
  if (/^image\/(?:jpeg|png|webp|gif|avif)$/.test(type)) return type;
  const lower = clean(key).toLowerCase();
  if (/\.jpe?g$/.test(lower)) return 'image/jpeg';
  if (/\.png$/.test(lower)) return 'image/png';
  if (/\.webp$/.test(lower)) return 'image/webp';
  if (/\.gif$/.test(lower)) return 'image/gif';
  if (/\.avif$/.test(lower)) return 'image/avif';
  return '';
}

async function readCalendarModelPhotoRecord(env, modelId) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  const base = clean(env.AIRTABLE_BASE_ID) || 'appsV1ILPRfIjkaYg';
  if (!token) return null;
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${MODELS_TABLE_ID}/${encodeURIComponent(modelId)}`);
  url.searchParams.set('returnFieldsByFieldId','true');
  const response = await fetch(url, { headers:{authorization:`Bearer ${token}`,accept:'application/json'} });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function driveModelPhotoResponse(env, folderId, modelName='') {
  const binding = env.MODEL_DRIVE_DIRECTORY;
  if (!binding || typeof binding.fetch !== 'function') return null;
  let resolvedId = clean(folderId, 180);
  if (!resolvedId && modelName) {
    const search = new URL('https://model-drive-directory.internal/__internal/model-drive/search');
    search.searchParams.set('q', clean(modelName, 120));
    search.searchParams.set('lane','all');
    const result = await binding.fetch(new Request(search.toString(), { headers:{accept:'application/json'} }));
    const body = await result.json().catch(() => null);
    if (result.ok && Array.isArray(body?.items)) {
      const exact = body.items.filter(item => clean(item?.folder_name).toLowerCase() === clean(modelName).toLowerCase());
      if (exact.length === 1) resolvedId = clean(exact[0]?.drive_folder_id, 180);
    }
  }
  if (!resolvedId) return null;
  const target = new URL('https://model-drive-directory.internal/__internal/model-drive/photo');
  target.searchParams.set('drive_folder_id', resolvedId);
  const response = await binding.fetch(new Request(target.toString(), { headers:{accept:'image/avif,image/webp,image/png,image/jpeg'} }));
  return response.ok ? response : null;
}

export async function calendarModelPhotoResponse(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== CALENDAR_MODEL_PHOTO_PATH || request.method !== 'GET') {
    return new Response('Not Found', { status:404 });
  }
  const modelId = clean(url.searchParams.get('model_id'), 80);
  if (!/^rec[A-Za-z0-9]{14}$/.test(modelId)) return new Response('Bad Request', { status:400 });

  const record = await readCalendarModelPhotoRecord(env, modelId);
  if (!record?.id) return new Response('Not Found', { status:404 });
  const fields = record.fields || {};
  const primaryKey = clean(fields[MODEL_FIELD.primaryImageKey], 500);
  if (primaryKey && env.MMD_MODEL_ASSETS && typeof env.MMD_MODEL_ASSETS.get === 'function') {
    try {
      const object = await env.MMD_MODEL_ASSETS.get(primaryKey);
      const type = imageContentType(primaryKey, object);
      if (object && type) {
        return new Response(object.body, { status:200, headers:{
          'content-type':type,'cache-control':'no-store, private','content-disposition':'inline',
          'x-content-type-options':'nosniff','x-mmd-calendar-model-photo':'r2'
        }});
      }
    } catch {}
  }

  const direct = safeHttpsUrl(fields[MODEL_FIELD.publicImageUrl]) || firstAttachmentUrl(fields[MODEL_FIELD.profilePhoto]);
  if (direct) return Response.redirect(direct, 302);

  const drive = await driveModelPhotoResponse(env, fields[MODEL_FIELD.driveFolderId], fields[MODEL_FIELD.name]);
  if (drive) {
    const headers = new Headers(drive.headers);
    headers.set('cache-control','no-store, private');
    headers.set('x-mmd-calendar-model-photo','drive');
    return new Response(drive.body, { status:200, headers });
  }

  return new Response('Not Found', { status:404, headers:{'cache-control':'no-store, private'} });
}

async function readCalendarTherapistPhotoSource(env, therapistId) {
  const binding = env.MMS_WORKER;
  if (!binding || typeof binding.fetch !== 'function') return null;
  const snapshot = await binding.fetch(new Request('https://mms.internal/internal/mms/admin/snapshot', {
    method:'GET',
    headers:{accept:'application/json'},
  }));
  if (!snapshot.ok) return null;
  const body = await snapshot.json().catch(() => null);
  if (!body?.ok || !Array.isArray(body.therapists)) return null;
  return body.therapists.find(item => clean(item?.therapist_id, 80) === therapistId) || null;
}

export async function calendarTherapistPhotoResponse(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== CALENDAR_THERAPIST_PHOTO_PATH || request.method !== 'GET') {
    return new Response('Not Found', { status:404 });
  }
  const therapistId = clean(url.searchParams.get('therapist_id'), 80);
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(therapistId)) return new Response('Bad Request', { status:400 });

  const source = await readCalendarTherapistPhotoSource(env, therapistId);
  if (!source) return new Response('Not Found', { status:404, headers:{'cache-control':'no-store, private'} });

  const direct = safeHttpsUrl(source.public_photo_url);
  if (direct) return Response.redirect(direct, 302);

  const key = clean(source.profile_photo_r2_key, 500);
  if (!/^mms\/applications\/mmsapp_[a-f0-9]{24}\/profile_photo\//.test(key)) {
    return new Response('Not Found', { status:404, headers:{'cache-control':'no-store, private'} });
  }

  const binding = env.MMS_WORKER;
  const target = new URL('https://mms.internal/internal/mms/admin/file');
  target.searchParams.set('key', key);
  const response = await binding.fetch(new Request(target.toString(), {
    method:'GET',
    headers:{accept:'image/avif,image/webp,image/png,image/jpeg'},
  }));
  if (!response.ok || !response.body) {
    return new Response('Not Found', { status:404, headers:{'cache-control':'no-store, private'} });
  }

  const type = clean(response.headers.get('content-type'), 120);
  if (!/^image\/(?:jpeg|png|webp|gif|avif)$/i.test(type)) {
    return new Response('Unsupported Media Type', { status:415, headers:{'cache-control':'no-store, private'} });
  }
  return new Response(response.body, {
    status:200,
    headers:{
      'content-type':type,
      'cache-control':'no-store, private',
      'content-disposition':'inline',
      'x-content-type-options':'nosniff',
      'x-mmd-calendar-therapist-photo':'mms-private-r2',
    },
  });
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
.mcal__legend,.mcal__hours{display:none!important}
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
    const cleanInlineArtifacts=()=>{
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      const nodes=[];
      while(walker.nextNode())nodes.push(walker.currentNode);
      nodes.forEach(node=>{
        const before=String(node.nodeValue||'');
        if(/##INLINE\d+##/i.test(before))node.nodeValue=before.replace(/##INLINE\d+##/gi,'').trim();
      });
    };
    cleanInlineArtifacts();

    const tabs=[...root.querySelectorAll('.mcal__tab')];
    ['วันนี้','รอมัดจำ','ยืนยันแล้ว','นายแบบ','เช็กราคา'].forEach((label,i)=>{if(tabs[i])tabs[i].textContent=label});
    const workEyes=[...root.querySelectorAll('.mcal__workspace .mcal__eyebrow')];
    const workTitles=[...root.querySelectorAll('.mcal__workspace .mcal__paneltitle')];
    ['คิววันนี้','ต้องทำต่อ','งานยาว'].forEach((label,i)=>{if(workEyes[i])workEyes[i].textContent=label});
    ['ตารางงาน','รอมัดจำ','งานยาว / ข้ามคืน'].forEach((label,i)=>{if(workTitles[i])workTitles[i].textContent=label});
    const availability=root.querySelector('.mcal__availability');
    if(availability){
      const eye=availability.querySelector('.mcal__eyebrow');
      const title=availability.querySelector('.mcal__paneltitle');
      const note=availability.querySelector('.mcal__panelnote');
      if(eye)eye.textContent='เวลาว่าง';
      if(title)title.textContent='นายแบบ & Therapist';
      if(note)note.textContent='เริ่มงานได้ 24 ชม. · Booking Desk 10:00–24:00';
    }
    const todayButton=root.querySelector('.mcal__today');
    if(todayButton)todayButton.textContent='วันนี้';

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

function injectCalendarOwnerUiV5(html) {
  if (!clean(html) || html.includes('calendar-owner-ui-v5-20260922')) return html;
  const block = "<style id=\"calendar-owner-ui-v5-20260922\">\n.mcal[data-owner-ui=\"v5\"] .mcal__top,.mcal[data-owner-ui=\"v5\"] .mcal__statusbar,.mcal[data-owner-ui=\"v5\"] .mcal__metrics,.mcal[data-owner-ui=\"v5\"] .mcal__datebar,.mcal[data-owner-ui=\"v5\"] .mcal__tabs,.mcal[data-owner-ui=\"v5\"] .mcal__workspace,.mcal[data-owner-ui=\"v5\"] .mcal__availability,.mcal[data-owner-ui=\"v5\"] .mcal__footer{display:none!important}\n.mcal[data-owner-ui=\"v5\"] .mcal__main{padding:20px clamp(18px,2.4vw,34px) 44px!important}\n.calv5{max-width:1480px;margin:0 auto;color:#f5efe5;font-family:\"LINE Seed Sans TH\",\"Noto Sans Thai\",-apple-system,BlinkMacSystemFont,\"SF Pro Text\",sans-serif}.calv5 *{box-sizing:border-box}.calv5 button{font:inherit}\n.calv5__top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center}.calv5__brand small{display:block;color:#c9a95f;font-size:9px;font-weight:900;letter-spacing:.15em}.calv5__brand h1{margin:3px 0 0;font-size:32px;line-height:1;letter-spacing:-.035em}.calv5__brand p{margin:6px 0 0;color:#918b83;font-size:12px}\n.calv5__tools{display:flex;gap:7px}.calv5__btn{height:38px;padding:0 13px;border:1px solid #302d31;border-radius:10px;background:#111014;color:#d4cec6;font-size:10px;font-weight:850;cursor:pointer}.calv5__btn.is-primary{border-color:#7d6232;background:#e2c06e;color:#17130d}\n.calv5__datebar{display:grid;grid-template-columns:36px minmax(0,1fr) auto 36px;gap:7px;align-items:center;margin-top:13px;padding:8px;border:1px solid #29272d;border-radius:13px;background:#101014}.calv5__datebar button{height:36px;border:1px solid #302e34;border-radius:9px;background:#151419;color:#eee8df;cursor:pointer}.calv5__datecopy small{display:block;color:#a78950;font-size:9px;font-weight:800}.calv5__datecopy strong{display:block;margin-top:1px;font-size:15px}.calv5__today{padding:0 13px!important;font-size:10px;font-weight:800}\n.calv5__stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:8px}.calv5__stat{padding:10px 12px;border:1px solid #28262d;border-radius:12px;background:#111015}.calv5__stat span{display:block;color:#89837b;font-size:9px}.calv5__stat b{display:block;margin-top:3px;font-size:22px;line-height:1}.calv5__stat small{display:block;margin-top:4px;color:#6f6a65;font-size:8px}\n.calv5__filters{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.calv5__filter{height:33px;padding:0 11px;border:1px solid #302e34;border-radius:999px;background:#0f0e12;color:#8f8981;font-size:9px;font-weight:800;cursor:pointer}.calv5__filter.is-on{border-color:#b08f4f;background:#1b160d;color:#edcf86}\n.calv5__grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.45fr);gap:9px;margin-top:9px;align-items:start}.calv5__panel{border:1px solid #29272d;border-radius:13px;background:#111015;overflow:hidden}.calv5__panelhead{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 13px;border-bottom:1px solid #242229}.calv5__panelhead small{display:block;color:#a78950;font-size:8px;font-weight:900;letter-spacing:.1em}.calv5__panelhead h2{margin:3px 0 0;font-size:18px}.calv5__panelhead>span{color:#77716b;font-size:9px}\n.calv5__event{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 13px;border-bottom:1px solid #222027}.calv5__event:last-child{border-bottom:0}.calv5__time b{display:block;font-size:14px}.calv5__time small{display:block;margin-top:2px;color:#6f6963;font-size:9px}.calv5__who strong{display:block;font-size:13px}.calv5__who p{margin:3px 0 0;color:#8e8881;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.calv5__tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}.calv5__tag{padding:3px 6px;border:1px solid #323038;border-radius:999px;color:#817a72;font-size:8px}.calv5__tag.is-warn{border-color:#69532e;color:#d8b568}.calv5__tag.is-ok{border-color:#315744;color:#76c99b}.calv5__tag.is-bad{border-color:#663b42;color:#e38996}.calv5__money{text-align:right}.calv5__money b{display:block;font-size:12px}.calv5__money small{display:block;margin-top:2px;color:#716b65;font-size:8px}\n.calv5__empty{min-height:118px;display:grid;place-items:center;padding:18px;color:#716b65;font-size:11px;text-align:center}.calv5__actions{display:grid;gap:6px;padding:9px}.calv5__action{padding:9px 10px;border:1px solid #302e34;border-radius:9px;background:#0d0c10}.calv5__action b{display:block;font-size:11px}.calv5__action p{margin:4px 0 0;color:#817b74;font-size:9px;line-height:1.45}.calv5__action.is-bad{border-color:#573039}.calv5__action.is-warn{border-color:#584523}.calv5__ok{padding:17px;color:#759b83;font-size:11px;text-align:center}\n.calv5__availability{margin-top:9px}.calv5__availbar{display:flex;gap:5px;flex-wrap:wrap}.calv5__availchip{padding:5px 8px;border:1px solid #302e34;border-radius:999px;color:#8e8881;font-size:8px}.calv5__availchip b{color:#eee8df}.calv5__people{display:grid;grid-template-columns:repeat(auto-fill,minmax(142px,1fr));gap:8px;padding:10px}.calv5__person{position:relative;overflow:hidden;min-width:0;border:1px solid #29272d;border-radius:12px;background:#0d0c10}.calv5__personMedia{position:relative;aspect-ratio:4/5;background:linear-gradient(145deg,#18161b,#0b0a0d);overflow:hidden}.calv5__personMedia img{width:100%;height:100%;display:block;object-fit:cover;object-position:center top}.calv5__personFallback{position:absolute;inset:0;display:grid;place-items:center;color:#6c6253;font-size:34px;font-weight:800;background:radial-gradient(circle at 50% 25%,rgba(211,177,102,.13),transparent 46%),#0e0d11}.calv5__personFallback[hidden]{display:none}.calv5__personBody{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:9px 10px}.calv5__person strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.calv5__person small{display:block;margin-top:2px;color:#6e6963;font-size:8px}.calv5__state{font-size:8px;font-weight:900;white-space:nowrap}.calv5__state.is-ok{color:#79ce9e}.calv5__state.is-warn{color:#d8b568}.calv5__state.is-off{color:#de8993}.calv5__personActions{display:flex;gap:5px;padding:0 10px 10px}.calv5__personAction{min-height:30px;padding:0 9px;border:1px solid #37333b;border-radius:9px;background:#151319;color:#d5c8ae;font-size:8px;font-weight:800;cursor:pointer}.calv5__personAction.is-primary{border-color:#80642d;background:#d9bb72;color:#17130d}.calv5__personAction:disabled{opacity:.55;cursor:default}.calv5__personActionLink{display:grid;place-items:center;min-height:30px;padding:0 9px;border:1px solid #37333b;border-radius:9px;color:#b49a65;font-size:8px;font-weight:800;text-decoration:none}.calv5__toggle{margin:0 9px 9px;border:0;background:transparent;color:#b99b5a;font-size:9px;font-weight:800;cursor:pointer}.calv5__sys{margin-top:7px;color:#5f5a55;font-size:8px;text-align:right}\n@media(max-width:1050px){.calv5__people{grid-template-columns:repeat(auto-fill,minmax(132px,1fr))}}@media(max-width:900px){.calv5__grid{grid-template-columns:1fr}.calv5__top{grid-template-columns:1fr}.calv5__tools{justify-content:flex-start}}@media(max-width:767px){.mcal[data-owner-ui=\"v5\"] .mcal__main{padding:14px 11px 84px!important}.calv5__brand h1{font-size:28px}.calv5__tools{display:grid;grid-template-columns:1fr 1fr}.calv5__btn{width:100%}.calv5__stats{grid-template-columns:repeat(2,minmax(0,1fr))}.calv5__event{grid-template-columns:56px minmax(0,1fr)}.calv5__money{grid-column:2;text-align:left}.calv5__people{grid-template-columns:1fr}}\n</style>\n<script id=\"calendar-owner-ui-v5-20260922-runtime\">\n(()=>{const boot=()=>{const root=document.querySelector('.mcal'),main=root&&root.querySelector('.mcal__main');if(!root||!main||main.querySelector('.calv5'))return;root.setAttribute('data-owner-ui','v5');\nconst esc=v=>String(v==null?'':v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));const valid=v=>/^\\d{4}-\\d{2}-\\d{2}$/.test(String(v||''));const fmt=v=>new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'}).format(new Date(v+'T12:00:00+07:00'));const wd=v=>new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',weekday:'long'}).format(new Date(v+'T12:00:00+07:00'));const hm=v=>v?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'—';const money=v=>v==null?'—':new Intl.NumberFormat('th-TH',{maximumFractionDigits:0}).format(Number(v)||0)+' ฿';\nconst today=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+'-'+o.month+'-'+o.day};const shift=(d,n)=>{const x=new Date(d+'T12:00:00+07:00');x.setUTCDate(x.getUTCDate()+n);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(x)};\nlet selected=valid(new URLSearchParams(location.search).get('date'))?new URLSearchParams(location.search).get('date'):today(),view='all',data=null,showAll=false;\nmain.insertAdjacentHTML('beforeend','<section class=\"calv5\"><header class=\"calv5__top\"><div class=\"calv5__brand\"><small>MMD · CALENDAR</small><h1>วันนี้มีอะไรบ้าง</h1><p>ดูงาน รอมัดจำ คิวชน และเวลาว่างในจอเดียว</p></div><div class=\"calv5__tools\"><button class=\"calv5__btn\" data-cal-reload>โหลดใหม่</button><button class=\"calv5__btn is-primary\" data-cal-sync>ซิงก์ Cal</button></div></header><div class=\"calv5__datebar\"><button data-cal-prev>‹</button><div class=\"calv5__datecopy\"><small data-cal-weekday>—</small><strong data-cal-date>—</strong></div><button class=\"calv5__today\" data-cal-today>วันนี้</button><button data-cal-next>›</button></div><section class=\"calv5__stats\" data-cal-stats></section><nav class=\"calv5__filters\"><button class=\"calv5__filter is-on\" data-cal-view=\"all\">ทั้งหมด</button><button class=\"calv5__filter\" data-cal-view=\"holds\">รอมัดจำ</button><button class=\"calv5__filter\" data-cal-view=\"confirmed\">ยืนยันแล้ว</button><button class=\"calv5__filter\" data-cal-view=\"attention\">ต้องเช็ก</button></nav><section class=\"calv5__grid\"><section class=\"calv5__panel\"><header class=\"calv5__panelhead\"><div><small>ตารางงาน</small><h2 data-cal-title>คิววันนี้</h2></div><span data-cal-count>—</span></header><div data-cal-list></div></section><aside class=\"calv5__panel\"><header class=\"calv5__panelhead\"><div><small>สิ่งที่ต้องทำ</small><h2>ต้องทำต่อ</h2></div><span data-cal-action-count>—</span></header><div class=\"calv5__actions\" data-cal-actions></div></aside></section><section class=\"calv5__panel calv5__availability\"><header class=\"calv5__panelhead\"><div><small>ทีมวันนี้</small><h2>นายแบบ & Therapist</h2></div><div class=\"calv5__availbar\" data-cal-avail-summary></div></header><div class=\"calv5__people\" data-cal-people></div><button class=\"calv5__toggle\" data-cal-toggle-people hidden></button></section><div class=\"calv5__sys\" data-cal-system>กำลังโหลดข้อมูล…</div></section>');\nconst q=s=>main.querySelector(s),qa=s=>Array.from(main.querySelectorAll(s)),r={date:q('[data-cal-date]'),week:q('[data-cal-weekday]'),stats:q('[data-cal-stats]'),list:q('[data-cal-list]'),count:q('[data-cal-count]'),title:q('[data-cal-title]'),actions:q('[data-cal-actions]'),actionCount:q('[data-cal-action-count]'),avail:q('[data-cal-avail-summary]'),people:q('[data-cal-people]'),toggle:q('[data-cal-toggle-people]'),sys:q('[data-cal-system]')};\nfunction rows(){let a=Array.isArray(data&&data.items)?data.items:[];if(view==='holds')a=a.filter(x=>x.internal_hold);if(view==='confirmed')a=a.filter(x=>x.deposit&&x.deposit.verified);if(view==='attention')a=a.filter(x=>x.conflict||x.internal_hold||(x.pricing&&x.pricing.review_required)||!(x.cal&&x.cal.booking_uid));return a}\nfunction tags(x){let a=[];if(x.conflict)a.push('<span class=\"calv5__tag is-bad\">คิวชน</span>');if(x.internal_hold)a.push('<span class=\"calv5__tag is-warn\">รอมัดจำ</span>');if(x.deposit&&x.deposit.verified)a.push('<span class=\"calv5__tag is-ok\">รับเงินแล้ว</span>');if(x.pricing&&x.pricing.review_required)a.push('<span class=\"calv5__tag is-warn\">เช็กราคา</span>');if(!(x.cal&&x.cal.booking_uid))a.push('<span class=\"calv5__tag\">ยังไม่เชื่อม Cal</span>');return a.join('')}\nfunction renderStats(){const m=(data&&data.metrics)||{},a=[['งานวันนี้',m.sessions||0,'งานในวันที่เลือก'],['รอมัดจำ',m.holds||0,'Model confirm แล้ว'],['คิวชน',m.conflicts||0,'ต้องตรวจเวลา'],['ต้องเช็ก',m.pricing_review||0,'งานยาว / ข้ามคืน']];r.stats.innerHTML=a.map(x=>'<article class=\"calv5__stat\"><span>'+x[0]+'</span><b>'+x[1]+'</b><small>'+x[2]+'</small></article>').join('')}\nfunction renderList(){const a=rows();r.count.textContent=a.length+' รายการ';r.title.textContent=view==='holds'?'รอมัดจำ':view==='confirmed'?'ยืนยันแล้ว':view==='attention'?'รายการที่ต้องเช็ก':'คิววันนี้';r.list.innerHTML=a.length?a.map(x=>'<article class=\"calv5__event\"><div class=\"calv5__time\"><b>'+hm(x.start_at)+'</b><small>'+hm(x.end_at)+'</small></div><div class=\"calv5__who\"><strong>'+esc((x.model&&x.model.name)||'ยังไม่ระบุนายแบบ')+' · '+esc((x.client&&x.client.name)||'ยังไม่ระบุลูกค้า')+'</strong><p>'+esc(x.location||'ยังไม่ระบุสถานที่')+(x.service_type?' · '+esc(x.service_type):'')+'</p><div class=\"calv5__tags\">'+tags(x)+'</div></div><div class=\"calv5__money\"><b>'+money(x.pricing&&x.pricing.final_quote_thb)+'</b><small>'+esc((x.job&&x.job.job_id)||x.session_id||'')+'</small></div></article>').join(''):'<div class=\"calv5__empty\">วันนี้ยังไม่มีรายการในมุมมองนี้</div>'}\nfunction actionRows(){let a=[];(data&&data.items||[]).forEach(x=>{const who=((x.model&&x.model.name)||'นายแบบ')+' · '+hm(x.start_at);if(x.conflict)a.push(['is-bad','คิวชน · '+who,'มีเวลาทับกัน ต้องตรวจตารางก่อน']);if(x.internal_hold)a.push(['is-warn','รอมัดจำ · '+who,((x.client&&x.client.name)||'ลูกค้า')+' · '+((x.deposit&&x.deposit.verification_status)||'ยังไม่รับเงิน')]);if(x.pricing&&x.pricing.review_required)a.push(['is-warn','เช็กราคา · '+who,'งานยาว / ข้ามคืน ต้องมี final quote']);if(!(x.cal&&x.cal.booking_uid))a.push(['','ยังไม่เชื่อม Cal · '+who,'Session '+(x.session_id||'—')])});return a.slice(0,12)}\nfunction renderActions(){const a=actionRows();r.actionCount.textContent=a.length+' รายการ';r.actions.innerHTML=a.length?a.map(x=>'<article class=\"calv5__action '+x[0]+'\"><b>'+esc(x[1])+'</b><p>'+esc(x[2])+'</p></article>').join(''):'<div class=\"calv5__ok\">ไม่มีรายการที่ต้องทำต่อในวันนี้</div>'}\nfunction availabilityView(x){const s=String(x&&x.status||'').trim().toLowerCase(),snap=String(x&&x.snapshot_state||'').trim().toLowerCase();if(x&&x.kind==='MODEL'){if(snap==='excluded')return{bucket:'excluded',label:'ไม่นับในทีมใช้งาน'};if(s==='available_now')return{bucket:'ok',label:'ว่างตอนนี้'};if(s==='available_today')return{bucket:'ok',label:'ว่างวันนี้'};if(s==='available_soon')return{bucket:'warn',label:'ว่างเร็วๆ นี้'};if(s==='limited')return{bucket:'warn',label:'จำกัด'};if(s==='unavailable')return{bucket:'off',label:'ไม่ว่าง'};if(snap==='stale'||snap==='invalid_expiry')return{bucket:'unknown',label:'รอยืนยันใหม่'};if(snap==='identity_missing')return{bucket:'unknown',label:'ยังไม่ผูก Model'};if(snap==='source_unavailable')return{bucket:'unknown',label:'ระบบสถานะขัดข้อง'};return{bucket:'unknown',label:'รอยืนยัน'}}if(s==='available'||s==='active'||s==='ready')return{bucket:'ok',label:'พร้อม'};if(s==='limited'||s==='hold')return{bucket:'warn',label:'จำกัด'};if(['paused','off','inactive','disabled','unavailable'].includes(s))return{bucket:'off',label:'พัก'};return{bucket:'unknown',label:'รอยืนยัน'}}\nfunction availabilitySource(x){if(x&&x.kind==='MMS')return'Therapist';if(x&&x.confidence==='model_confirmed')return'Model App';if(x&&x.confidence==='operator_confirmed')return'Model Console';if(x&&x.confidence==='system_derived')return'System';return'Model'}\nfunction adoptionActions(x,v){if(x.kind!=='MODEL'||v.bucket!=='unknown')return'';if(x.snapshot_state==='identity_missing')return'<div class=\"calv5__personActions\"><a class=\"calv5__personActionLink\" href=\"/internal/ceo/models\">ผูก Model Key</a></div>';if(x.line_connected&&x.model_key)return'<div class=\"calv5__personActions\"><button class=\"calv5__personAction is-primary\" data-cal-remind data-model-key=\"'+esc(x.model_key)+'\">เตือน LINE</button></div>';if(x.record_id&&x.model_key)return'<div class=\"calv5__personActions\"><button class=\"calv5__personAction\" data-cal-activate data-model-record=\"'+esc(x.record_id)+'\">สร้าง LINE link</button></div>';return''}\nasync function remindModel(button){const key=button.getAttribute('data-model-key')||'',old=button.textContent;button.disabled=true;button.textContent='กำลังส่ง…';try{const response=await fetch('/v1/admin/calendar/availability-reminder',{method:'POST',credentials:'include',cache:'no-store',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({model_key:key})}),d=await response.json().catch(()=>null);if(response.status===429&&d&&d.error==='availability_reminder_cooldown'){button.textContent='เตือนแล้ววันนี้';return}if(response.status===409&&d&&d.error==='availability_already_fresh'){button.textContent='ยืนยันแล้ว';await load();return}if(!response.ok||!d||!d.ok)throw Error((d&&d.error)||'reminder_failed');button.textContent='เตือนแล้ว';setTimeout(()=>{button.disabled=false;button.textContent=old},2600)}catch(e){button.textContent=e&&e.message==='model_line_identity_required'?'ยังไม่มี LINE':'ส่งไม่สำเร็จ';setTimeout(()=>{button.disabled=false;button.textContent=old},2600)}}\nasync function createLineActivation(button){const id=button.getAttribute('data-model-record')||'',old=button.textContent;button.disabled=true;button.textContent='กำลังสร้าง…';try{const response=await fetch('/v1/admin/model/activation/issue',{method:'POST',credentials:'include',cache:'no-store',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({model_record_id:id,environment:'published',ttl_hours:24})}),d=await response.json().catch(()=>null);if(response.status===409&&d&&d.error==='model_already_linked'){button.textContent='LINE เชื่อมแล้ว';await load();return}if(!response.ok||!d||!d.ok||!d.activation_url)throw Error((d&&d.error)||'activation_failed');let copied=false;try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(d.activation_url);copied=true}}catch(_){}if(copied)button.textContent='คัดลอก LINE link แล้ว';else{window.prompt('คัดลอก LINE activation link สำหรับ Model',d.activation_url);button.textContent='สร้าง LINE link แล้ว'}setTimeout(()=>{button.disabled=false;button.textContent=old},4200)}catch(e){button.textContent='สร้าง link ไม่สำเร็จ';setTimeout(()=>{button.disabled=false;button.textContent=old},2600)}}\nfunction renderPeople(){const av=(data&&data.availability)||{},m=(av.models||[]).map(x=>({kind:'MODEL',name:x.name||x.model_id||'Model',id:x.model_id||'',record_id:x.record_id||'',model_key:x.model_key||'',line_connected:x.line_connected===true,status:x.availability_status||'unconfirmed',snapshot_state:x.snapshot_state||'missing',confidence:x.confidence||'',photo:x.record_id?'/v1/admin/calendar/model-photo?model_id='+encodeURIComponent(x.record_id):''})),t=(av.therapists||[]).map(x=>({kind:'MMS',name:x.display_name||x.therapist_id||'Therapist',id:x.therapist_id||'',status:x.availability_status||'Unknown',snapshot_state:'fresh',confidence:'',photo:x.therapist_id?'/v1/admin/calendar/therapist-photo?therapist_id='+encodeURIComponent(x.therapist_id):(x.public_photo_url||'')})),all=m.concat(t),c={ok:0,warn:0,off:0,unknown:0,excluded:0};all.forEach(x=>c[availabilityView(x).bucket]++);r.avail.innerHTML='<span class=\"calv5__availchip\">ว่าง / พร้อม <b>'+c.ok+'</b></span><span class=\"calv5__availchip\">จำกัด / เร็วๆ นี้ <b>'+c.warn+'</b></span><span class=\"calv5__availchip\">ไม่ว่าง / พัก <b>'+c.off+'</b></span><span class=\"calv5__availchip\">รอยืนยัน <b>'+c.unknown+'</b></span><span class=\"calv5__availchip\">ไม่นับในทีม <b>'+c.excluded+'</b></span>';const availabilityRank=x=>{const b=availabilityView(x).bucket;return b==='unknown'?0:b==='excluded'?1:2};const visible=showAll?all.slice().sort((a,b)=>availabilityRank(a)-availabilityRank(b)):all.filter(x=>{const b=availabilityView(x).bucket;return b!=='unknown'&&b!=='excluded'});r.people.innerHTML=visible.length?visible.slice(0,150).map(x=>{const v=availabilityView(x),cls=v.bucket==='ok'?'is-ok':v.bucket==='warn'?'is-warn':'is-off',initial=esc((x.name||'?').trim().charAt(0).toUpperCase()),media=x.photo?'<img data-cal-person-img src=\"'+esc(x.photo)+'\" alt=\"'+esc(x.name)+'\" loading=\"lazy\" decoding=\"async\"><span class=\"calv5__personFallback\" hidden>'+initial+'</span>':'<span class=\"calv5__personFallback\">'+initial+'</span>';return '<article class=\"calv5__person\"><div class=\"calv5__personMedia\">'+media+'</div><div class=\"calv5__personBody\"><div><strong>'+esc(x.name)+'</strong><small>'+availabilitySource(x)+(x.kind==='MODEL'&&v.bucket==='unknown'?' · '+(x.line_connected?'LINE พร้อม':'LINE ยังไม่เชื่อม'):'')+'</small></div><span class=\"calv5__state '+cls+'\">'+v.label+'</span></div>'+adoptionActions(x,v)+'</article>'}).join(''):'<div class=\"calv5__empty\">ยังไม่มีสถานะว่างที่ยืนยันและยังไม่หมดอายุ</div>';r.people.querySelectorAll('img[data-cal-person-img]').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;const fallback=img.nextElementSibling;if(fallback)fallback.hidden=false},{once:true}));r.people.querySelectorAll('[data-cal-remind]').forEach(button=>button.onclick=()=>remindModel(button));r.people.querySelectorAll('[data-cal-activate]').forEach(button=>button.onclick=()=>createLineActivation(button));r.toggle.hidden=!(c.unknown||c.excluded);if(!r.toggle.hidden)r.toggle.textContent=showAll?'ซ่อนรายการที่รอยืนยัน / ไม่นับในทีม':'ดูรายการที่รอยืนยัน · '+c.unknown+(c.excluded?' · ไม่นับในทีม '+c.excluded:'')}\nfunction render(){r.date.textContent=fmt(selected);r.week.textContent=(selected===today()?'วันนี้ · ':'')+wd(selected);renderStats();renderList();renderActions();renderPeople();const m=(data&&data.metrics)||{},av=(data&&data.availability)||{};r.sys.textContent='Cal linked '+Number(m.cal_linked||0)+'/'+Number(m.sessions||0)+' · Availability '+(av.model_source_status==='ok'?'SIGIL ready':av.model_source_status==='partial'?'SIGIL partial':'SIGIL check')+' · '+(av.therapist_source_status==='ok'?'MMS ready':'MMS check');const u=new URL(location.href);u.searchParams.set('date',selected);history.replaceState({},'',u.pathname+'?'+u.searchParams.toString())}\nasync function load(){r.sys.textContent='กำลังโหลดข้อมูล…';try{const x=await fetch('/v1/admin/calendar?date='+encodeURIComponent(selected),{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});if(x.status===401||x.status===403){location.href='/internal/admin/login?next='+encodeURIComponent('/internal/admin/calendar?date='+selected);return}const d=await x.json().catch(()=>null);if(!x.ok||!d||!d.ok)throw Error((d&&d.error)||'calendar_unavailable');data=d;render()}catch(e){r.list.innerHTML='<div class=\"calv5__empty\">Calendar โหลดไม่ได้ · '+esc(e.message||'read_failed')+'</div>';r.actions.innerHTML='<div class=\"calv5__ok\">ยังอ่านรายการที่ต้องทำไม่ได้</div>';r.sys.textContent='Calendar unavailable'}}\nq('[data-cal-prev]').onclick=()=>{selected=shift(selected,-1);load()};q('[data-cal-next]').onclick=()=>{selected=shift(selected,1);load()};q('[data-cal-today]').onclick=()=>{selected=today();load()};q('[data-cal-reload]').onclick=load;qa('[data-cal-view]').forEach(b=>b.onclick=()=>{qa('[data-cal-view]').forEach(x=>x.classList.remove('is-on'));b.classList.add('is-on');view=b.getAttribute('data-cal-view');renderList()});r.toggle.onclick=()=>{showAll=!showAll;renderPeople()};\nq('[data-cal-sync]').onclick=async e=>{const b=e.currentTarget,old=b.textContent;b.disabled=true;b.textContent='กำลังซิงก์…';try{const x=await fetch('/v1/admin/calendar/reconcile?horizon_days=60&limit=25',{method:'POST',credentials:'include',cache:'no-store',headers:{accept:'application/json'}}),d=await x.json().catch(()=>null);if(!x.ok||!d||!d.ok)throw Error((d&&d.error)||'reconcile_failed');b.textContent='ซิงก์แล้ว +'+Number((d.summary&&d.summary.created)||0);await load()}catch(_){b.textContent='ซิงก์ไม่สำเร็จ'}finally{setTimeout(()=>{b.disabled=false;b.textContent=old},1800)}};load()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()})();\n</script>";
  if (html.includes('</body>')) return html.replace('</body>', block + '</body>');
  return html + block;
}

// The calendar has two presentation paths: the published Webflow page and a
// worker fallback used when that upstream page is unavailable.  Keep mutable
// recovery actions fail-closed on the fallback by hiding its older generic
// controls and rendering this small, API-backed Phase 3 queue instead.
function injectCalendarRecoveryQueueV1(html) {
  if (!clean(html) || html.includes('calendar-owner-recovery-queue-v1-20260923')) return html;
  const block = `<style id="calendar-owner-recovery-queue-v1-20260923">
.calv5__people--recovery-authority .calv5__personActions{display:none!important}.calv5__recoveryQueue{margin-top:9px}.calv5__recoveryList{display:grid;gap:7px;padding:9px}.calv5__recoveryRow{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px;border:1px solid #302e34;border-radius:10px;background:#0d0c10}.calv5__recoveryRow strong{display:block;font-size:11px}.calv5__recoveryRow small{display:block;margin-top:3px;color:#817b74;font-size:9px}.calv5__recoveryRow button,.calv5__recoveryRow a{flex:0 0 auto;min-height:31px;padding:0 9px;border:1px solid #80642d;border-radius:9px;background:#d9bb72;color:#17130d;font:800 9px inherit;line-height:31px;text-decoration:none;cursor:pointer}.calv5__recoveryRow button:disabled{opacity:.55;cursor:default}
</style>
<script id="calendar-owner-recovery-queue-v1-20260923-runtime">
(()=>{const boot=()=>{const root=document.querySelector('.mcal'),host=root&&root.querySelector('.calv5');if(!root||!host||host.querySelector('[data-cal-recovery-queue]'))return;const people=host.querySelector('[data-cal-people]');if(people)people.classList.add('calv5__people--recovery-authority');const panel=document.createElement('section');panel.className='calv5__panel calv5__recoveryQueue';panel.setAttribute('data-cal-recovery-queue','');panel.innerHTML='<header class="calv5__panelhead"><div><small>AVAILABILITY RECOVERY</small><h2>รายการที่ต้องตามต่อ</h2></div><span data-cal-recovery-count>—</span></header><div class="calv5__recoveryList" data-cal-recovery-list>กำลังโหลด…</div>';const availability=host.querySelector('.calv5__availability');if(availability)availability.insertAdjacentElement('afterend',panel);else host.appendChild(panel);const list=panel.querySelector('[data-cal-recovery-list]'),count=panel.querySelector('[data-cal-recovery-count]'),date=()=>new URL(location.href).searchParams.get('date')||'';const labels={identity_recovery_required:'ผูก Model Key',line_link_required:'ออก LINE link',line_link_expired:'LINE link หมดอายุ',line_link_issued_waiting_for_connection:'รอเชื่อม LINE',availability_confirmation_required:'รอยืนยันสถานะ',reminder_sent_waiting_for_confirmation:'เตือนแล้ว · รอยืนยัน',reminder_follow_up_due:'ถึงเวลาตามผล',source_unavailable:'รอระบบสถานะ'};const actionable=new Set(['identity_recovery_required','line_link_required','line_link_expired','availability_confirmation_required','reminder_follow_up_due']);const run=async(row,button)=>{const stage=String(row.recovery_stage||'');if(stage==='identity_recovery_required'){location.href='/internal/ceo/models';return}button.disabled=true;const old=button.textContent;button.textContent='กำลังทำ…';try{const isLink=stage==='line_link_required'||stage==='line_link_expired';const response=await fetch(isLink?'/v1/admin/calendar/availability-activation':'/v1/admin/calendar/availability-reminder',{method:'POST',credentials:'include',cache:'no-store',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(isLink?{model_record_id:row.record_id,model_key:row.model_key}:{model_key:row.model_key})}),body=await response.json().catch(()=>null);if(!response.ok||!body||!body.ok)throw Error((body&&body.error)||'request_failed');if(isLink&&body.activation_url){try{await navigator.clipboard.writeText(body.activation_url);button.textContent='คัดลอก LINE link แล้ว'}catch(_){window.prompt('คัดลอก LINE activation link สำหรับ Model',body.activation_url);button.textContent='สร้าง LINE link แล้ว'}}else button.textContent='ส่งแล้ว';setTimeout(load,300)}catch(_){button.textContent='ทำรายการไม่สำเร็จ';setTimeout(()=>{button.disabled=false;button.textContent=old},2200)}};const render=rows=>{list.replaceChildren();const unresolved=rows.filter(row=>!['coverage_current','coverage_recovered','excluded'].includes(String(row.recovery_stage||'')));count.textContent=unresolved.length+' รายการ';if(!unresolved.length){list.textContent='ไม่มีรายการที่ต้องตามต่อ';return}for(const row of unresolved.slice(0,150)){const item=document.createElement('article'),copy=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('small'),stage=String(row.recovery_stage||'source_unavailable');item.className='calv5__recoveryRow';title.textContent=(row.name||row.model_id||'Model')+' · '+(labels[stage]||'รอตรวจสอบ');note.textContent=row.follow_up_at?'ติดตามหลัง '+row.follow_up_at:(stage==='source_unavailable'?'ยังไม่แสดง action จนอ่าน source ได้ครบ':'');copy.append(title,note);item.append(copy);if(actionable.has(stage)){if(stage==='identity_recovery_required'){const link=document.createElement('a');link.href='/internal/ceo/models';link.textContent='ผูก Model Key';item.append(link)}else{const button=document.createElement('button');button.type='button';button.textContent=stage==='reminder_follow_up_due'?'ติดตาม LINE':stage==='availability_confirmation_required'?'เตือน LINE':'สร้าง LINE link';button.addEventListener('click',()=>run(row,button));item.append(button)}}list.append(item)}};const load=async()=>{try{const response=await fetch('/v1/admin/calendar?date='+encodeURIComponent(date()),{credentials:'include',cache:'no-store',headers:{accept:'application/json'}}),body=await response.json();if(!response.ok||!body||!body.ok)throw Error('calendar_unavailable');render(Array.isArray(body.availability&&body.availability.models)?body.availability.models:[])}catch(_){list.textContent='ยังอ่าน recovery queue ไม่ได้';count.textContent='—'}};host.querySelectorAll('[data-cal-reload],[data-cal-prev],[data-cal-next],[data-cal-today]').forEach(button=>button.addEventListener('click',()=>setTimeout(load,300)));load()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()})();
</script>`;
  if (html.includes('</body>')) return html.replace('</body>', block + '</body>');
  return html + block;
}

function injectCalendarCoverageHealthV1(html) {
  if (!clean(html) || html.includes('calendar-coverage-health-v1-20260923')) return html;
  const block = `<style id="calendar-coverage-health-v1-20260923">
.calv5__coverageHealth{margin-top:9px}.calv5__coverageGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;padding:9px}.calv5__coverageMetric{padding:9px 10px;border:1px solid #302e34;border-radius:10px;background:#0d0c10}.calv5__coverageMetric span{display:block;color:#89837b;font-size:8px}.calv5__coverageMetric b{display:block;margin-top:4px;color:#f2ece3;font-size:17px}.calv5__coverageNote{padding:0 10px 11px;color:#817b74;font-size:9px;line-height:1.45}@media(max-width:767px){.calv5__coverageGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
<script id="calendar-coverage-health-v1-20260923-runtime">
(()=>{const boot=()=>{const root=document.querySelector('.mcal'),host=root&&root.querySelector('.calv5');if(!root||!host||host.querySelector('[data-cal-coverage-health]'))return;const panel=document.createElement('section');panel.className='calv5__panel calv5__coverageHealth';panel.setAttribute('data-cal-coverage-health','');panel.innerHTML='<header class="calv5__panelhead"><div><small>DAILY COVERAGE REVIEW</small><h2>สถานะทีมวันนี้</h2></div><span data-cal-coverage-status>—</span></header><div class="calv5__coverageGrid" data-cal-coverage-grid></div><div class="calv5__coverageNote" data-cal-coverage-note></div>';const availability=host.querySelector('.calv5__availability');if(availability)availability.insertAdjacentElement('beforebegin',panel);else host.appendChild(panel);const grid=panel.querySelector('[data-cal-coverage-grid]'),status=panel.querySelector('[data-cal-coverage-status]'),note=panel.querySelector('[data-cal-coverage-note]'),date=()=>new URL(location.href).searchParams.get('date')||'';const label={coverage_current:'ยืนยันล่าสุดครบ',owner_action_required:'มีรายการให้จัดการ',waiting_for_model:'รอ Model ยืนยัน',confirmation_pending:'รอยืนยันสถานะ',source_attention:'ตรวจ source ก่อน',no_canonical_models:'ยังไม่มี Model ที่ผูกแล้ว'};const render=health=>{if(!health||typeof health!=='object'){status.textContent='อ่านสถานะไม่ได้';grid.textContent='—';note.textContent='';return}status.textContent=label[health.review_status]||'รอตรวจสอบ';const rate=Number.isFinite(Number(health.fresh_coverage_percent))?String(health.fresh_coverage_percent)+'%':'—';const metrics=[['ยืนยันล่าสุด',String(health.fresh_models||0)+' / '+String(health.canonical_models||0)],['Coverage',rate],['ต้องทำต่อ',String(health.owner_action_required||0)],['รอตอบ',String(health.waiting_for_model||0)]];grid.innerHTML=metrics.map(item=>'<article class="calv5__coverageMetric"><span>'+item[0]+'</span><b>'+item[1]+'</b></article>').join('');const source=Number(health.source_unavailable_models||0),identity=Number(health.identity_missing||0),due=Number(health.follow_up_due||0),excluded=Number(health.excluded_models||0);note.textContent=(source?'มี '+source+' รายการที่ source อ่านไม่ครบ · ':'')+(identity?'มี '+identity+' รายการที่ยังไม่ผูก Model Key · ':'')+(due?'มี '+due+' รายการถึงเวลาตามผล · ':'')+(excluded?'มี '+excluded+' รายการที่ไม่นับในทีมใช้งาน · ':'')+'สรุปนี้อ่านจาก SIGIL snapshot และ recovery evidence เท่านั้น'};const load=async()=>{try{const response=await fetch('/v1/admin/calendar?date='+encodeURIComponent(date()),{credentials:'include',cache:'no-store',headers:{accept:'application/json'}}),body=await response.json();if(!response.ok||!body||!body.ok)throw Error('calendar_unavailable');render(body.availability&&body.availability.coverage_health)}catch(_){render(null)}};host.querySelectorAll('[data-cal-reload],[data-cal-prev],[data-cal-next],[data-cal-today]').forEach(button=>button.addEventListener('click',()=>setTimeout(load,300)));load()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()})();
</script>`;
  if (html.includes('</body>')) return html.replace('</body>', block + '</body>');
  return html + block;
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
  html = injectCalendarOwnerUiV5(html);
  html = injectCalendarRecoveryQueueV1(html);
  html = injectCalendarCoverageHealthV1(html);
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
