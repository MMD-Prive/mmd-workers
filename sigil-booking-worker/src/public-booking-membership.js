import { currentPrivateAccess } from './current-private-access.js';
import { resolveBookingViewer } from './customer-discovery-policy.js';
const PAID = new Set(['public_member','elite','private_standard','private_premium','vip','svip','black_card']);
export function paidPublicMembership(snapshot) {
  return snapshot?.schema_version === 'my_mmd_entitlement_resolver_v1' && !snapshot.member_blocked
    && snapshot.access?.public_service_access === true
    && Array.isArray(snapshot.capability_state?.active)
    && snapshot.capability_state.active.some(value => PAID.has(value));
}
export async function authorizePublicBooking(request, env) {
  const viewer = await resolveBookingViewer(request, env);
  if (!viewer.ok) return viewer;
  try {
    const id = await memberRecordId(env, viewer.memberId);
    if (!id) return {ok:false,error:'membership_status_unavailable',status:503};
    const access = await currentPrivateAccess(request, env, id, viewer.memberRef, {throwOnUnavailable:true});
    if (!paidPublicMembership(access.snapshot) || access.viewerRef !== viewer.memberRef) return {ok:false,error:'public_membership_required',status:403};
    return {ok:true,snapshot:access.snapshot,viewer,memberRecordId:id};
  } catch { return {ok:false,error:'membership_status_unavailable',status:503}; }
}
async function memberRecordId(env, memberId) {
  const synthetic = /^mmd_rec_(rec[A-Za-z0-9]{14,24})$/.exec(memberId);
  if (synthetic) return synthetic[1]; // currentPrivateAccess re-reads and binds its business ID hash.
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw Error('unavailable');
  const table = env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || 'Members';
  // Only member_id exists in the current schema. Do not OR guessed aliases.
  const qs = new URLSearchParams({filterByFormula:'{member_id}='+JSON.stringify(memberId),maxRecords:'2'});
  const res = await fetch('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+encodeURIComponent(table)+'?'+qs,{headers:{authorization:'Bearer '+env.AIRTABLE_API_KEY},signal:AbortSignal.timeout(5000)});
  if (!res.ok) throw Error('unavailable');
  const data = await res.json();
  return Array.isArray(data.records) && data.records.length === 1 && !data.offset && /^rec[A-Za-z0-9]{14,24}$/.test(data.records[0].id) ? data.records[0].id : '';
}
