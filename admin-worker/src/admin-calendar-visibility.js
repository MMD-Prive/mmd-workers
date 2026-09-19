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
