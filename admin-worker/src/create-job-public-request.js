import { validMarker } from '../../shared/member-booking-marker.mjs';
import { readPublicBookingDetails } from '../../shared/member-public-booking.mjs';
import { isOwnerActor } from './owner-my-mmd-recovery-diagnostic.js';

export const PUBLIC_REQUEST_PATH = '/internal/admin/jobs/create-job/public-request';
const reply = (body, status = 200) => Response.json(body, {status, headers:{'cache-control':'no-store'}});

export async function readCreateJobPublicRequest(request, env, actor) {
  if (!isOwnerActor(actor)) return reply({ok:false,error:'owner_required'},403);
  const params = new URL(request.url).searchParams;
  const ref = params.get('ref');
  const client = params.get('client_id');
  if ((ref && !/^mmdreq_[a-f0-9]{64}$/.test(ref)) || !/^rec[A-Za-z0-9]{14,30}$/.test(client || '')) {
    return reply({ok:false,error:'กรุณาระบุรหัสคำขอเต็มและเลือกลูกค้า'},400);
  }
  const secret = env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES;
  if (typeof secret !== 'string' || secret.length < 32) return reply({ok:false,error:'booking_verification_unavailable'},503);
  try {
    const table = env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || env.AIRTABLE_TABLE_BOOKING_REQUESTS || 'SIGIL Booking Requests';
    const url = new URL('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+encodeURIComponent(table));
    url.searchParams.set('filterByFormula',ref ? "{booking_ref}='"+ref+"'" : "AND({lane}='public',FIND('"+client+"',{resolver_payload_json}&''))");
    url.searchParams.set('maxRecords',ref ? '2' : '50');
    url.searchParams.set('sort[0][field]','Created At');
    url.searchParams.set('sort[0][direction]','desc');
    const response = await fetch(url,{headers:{authorization:'Bearer '+env.AIRTABLE_API_KEY},signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw Error();
    const {records} = await response.json();
    const items=[];
    for(const row of records){
    const f=row?.fields;
    let meta;
    try {
      meta = JSON.parse(f?.resolver_payload_json || '{}')?.my_mmd_owner;
    } catch {
      continue;
    }
    if (/^mmdreq_[a-f0-9]{64}$/.test(f?.booking_ref) && (!ref || (records.length===1 && f.booking_ref===ref)) && f.lane === 'public' && meta?.scope === 'public' &&
        meta.state === 'submitted' && meta.client_id === client && f.line_or_member_id &&
        await validMarker(secret, f.booking_ref, meta)) {
      const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode('my-mmd-booking-owner-v1:'+client+':'+f.line_or_member_id));
      const owner = Array.from(new Uint8Array(digest), byte=>byte.toString(16).padStart(2,'0')).join('');
      const details = readPublicBookingDetails(meta.publicDetails || {});
      if (meta.owner === owner && details?.public_format) items.push({ref:f.booking_ref,work_type:details.public_format,
        duration_minutes:details.duration_minutes,budget_thb:details.budget_thb,model_name:f['Selected Model Name'] || ''});
    }
    }
    if (!ref) return reply({ok:true,items});
    if (items.length===1) return reply({ok:true,...items[0]});
    return reply({ok:false,error:'ไม่พบคำขอ Public ที่มีหมวดงานของลูกค้าที่เลือก'},404);
  } catch { return reply({ok:false,error:'ยังอ่านคำขอไม่ได้'},503); }
}
