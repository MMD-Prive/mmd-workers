import { readBoundedJsonObject } from './bounded-json.js';
import { readMemberAppSession } from './member-app-api-runtime.js';
import { resolveCanonicalClientForLine } from './member-app-client-history.js';

export const MEMBER_BOOKING_BASE = '/member/api/liff/booking';
const DENIED = new Set(['blocked','suspended','revoked','pending_review','under_review']);
export function isMemberBookingPath(request) { return new URL(request.url).pathname.startsWith(MEMBER_BOOKING_BASE + '/'); }
export async function handleMemberBooking(request, env, deps = {}) {
  const url = new URL(request.url), action = url.pathname.slice(MEMBER_BOOKING_BASE.length + 1);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ok:false,error:'same_origin_required'},403);
  if (!['https://mmdbkk.com','https://www.mmdbkk.com'].includes(url.origin)) return reply({ok:false,error:'origin_not_allowed'},403);
  if (!['context','search','requests'].includes(action)) return reply({ok:false,error:'not_found'},404);
  if (!['GET','POST'].includes(request.method) || ['context','search'].includes(action) && request.method !== 'GET') return reply({ok:false},405);
  if (action === 'requests' && request.method === 'POST' && origin !== url.origin) return reply({ok:false,error:'same_origin_required'},403);
  const session = await (deps.readSession || readMemberAppSession)(request,env).catch(()=>null);
  if (!session?.lineUserId || !session.memberId || session.memberExists !== true || session.readGraceOnly === true) return reply({ok:false,error:'session_required'},401);
  const profile = session.memberProfile || {};
  if ([profile.membership_status,profile.status,profile.customer_360?.member?.membership_status].some(s=>DENIED.has(String(s||'').toLowerCase()))) return reply({ok:false,error:'member_unavailable'},403);
  const client = await (deps.resolveClient || resolveCanonicalClientForLine)(env,session.lineUserId).catch(()=>null);
  if (!client?.id) return reply({ok:false,error:'client_unresolved'},409);
  const owner = await digest('my-mmd-booking-owner-v1:' + client.id + ':' + session.memberId);
  if (!env.SIGIL_BOOKING_WORKER?.fetch || String(env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES || '').length < 32) return reply({ok:false,error:'booking_unavailable'},503);
  const call = async (operation, data = {}) => {
    const response = await env.SIGIL_BOOKING_WORKER.fetch(new Request('https://sigil-booking.internal/__internal/member-booking',{
      method:'POST',headers:{'content-type':'application/json','x-mmd-member-booking-secret':env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES, cookie:request.headers.get('cookie') || ''},
      body:JSON.stringify({operation,owner,member_id:session.memberId,...data}), signal:AbortSignal.timeout(10000)
    }));
    return response;
  };
  try {
    if (action === 'context') return safeResponse(await call('context'));
    if (action === 'search') {
      if ([...url.searchParams.keys()].some(k=>!['q','scope'].includes(k))) return reply({ok:false,error:'search_invalid'},400);
      const q = (url.searchParams.get('q') || '').trim();
      if (q.length > 80) return reply({ok:false,error:'search_invalid'},400);
      const scope=url.searchParams.get('scope') || 'public';
      if (!['public','private'].includes(scope)) return reply({ok:false,error:'scope_invalid'},400);
      return safeResponse(await call('search',{q,scope}));
    }
    if (request.method === 'GET') {
      if ([...url.searchParams.keys()].some(k=>k!=='request_id') || url.searchParams.getAll('request_id').length>1) return reply({ok:false,error:'browser_authority_rejected'},400);
      const id=url.searchParams.get('request_id');
      if(id&&!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) return reply({ok:false,error:'invalid_request'},400);
      return safeResponse(await call('list',id?{reference:'mmdreq_'+await digest(owner+':'+id)}:{}));
    }
    if (url.search) return reply({ok:false,error:'browser_authority_rejected'},400);
    const parsed=await readBoundedJsonObject(request,8192);
    if (!parsed.ok) return reply({ok:false,error:parsed.code},parsed.status);
    const input=parsed.value;
    const allowed = ['request_id','model_id','date','time','area','note','scope'];
    if (!input || !['public','private'].includes(input.scope || 'public') || Array.isArray(input) || Object.keys(input).some(k=>!allowed.includes(k)) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.request_id || '')
      || !/^rec[A-Za-z0-9]{14,24}$/.test(input.model_id || '') || !validDate(input.date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.time || '')
      || typeof input.area !== 'string' || !input.area.trim() || input.area.length>120 || input.note != null && (typeof input.note!=='string'||input.note.length>700)) return reply({ok:false,error:'invalid_request',outcome:'not_started'},400);
    // A stable key is opaque correlation only. The account comes from the session.
    const payload={model_id:input.model_id,date:input.date,time:input.time,area:input.area.trim(),note:input.note || '',scope:input.scope || 'public'};
    const reference='mmdreq_'+await digest(owner+':'+input.request_id);
    if (!env.MEMBER_BOOKING_COORDINATOR?.idFromName || !env.MEMBER_BOOKING_COORDINATOR?.get) return reply({ok:false,error:'booking_submission_not_ready',outcome:'not_started'},503);
    const stub=env.MEMBER_BOOKING_COORDINATOR.get(env.MEMBER_BOOKING_COORDINATOR.idFromName(reference));
    return safeResponse(await stub.fetch(new Request('https://coordinator/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({owner,reference,member_id:session.memberId,payload,cookie:request.headers.get('cookie') || ''})})));
  } catch {return reply({ok:false,error:'booking_unavailable'},503);}
}
function validDate(value) {if(!/^\d{4}-\d{2}-\d{2}$/.test(value || ''))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value&&value>=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});}
export async function digest(value) {return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function reply(body,status=200){return Response.json(body,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});}
async function safeResponse(response){const body=await response.json().catch(()=>null);return body&&typeof body==='object'?reply(body,response.status):reply({ok:false,error:'booking_unavailable'},502);}
