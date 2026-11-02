import { resolveDiscoveryViewer } from './customer-discovery-policy.js';
import { currentPrivateContext } from './current-private-access.js';
const PATH='/__internal/member-booking';
const OWNER=/^[a-f0-9]{64}$/;
const REF=/^mmdreq_[a-f0-9]{64}$/;
export function isMemberBookingService(request){return new URL(request.url).pathname===PATH;}
export async function handleMemberBookingService(request,env,delegate){
 const secret=String(env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES || '');
 if(request.method!=='POST'||secret.length<32||request.headers.get('x-mmd-member-booking-secret')!==secret)return json({ok:false},401);
 const input=await request.json().catch(()=>null);
 if(!input||!OWNER.test(input.owner||'')||!['context','search','list','submit'].includes(input.operation))return json({ok:false},400);
 const viewer=await resolveDiscoveryViewer(request,env);
 if(!viewer||viewer!==await hash('mmd-discovery-member-v1:'+input.member_id))return json({ok:false,error:'session_required'},401);
 let intakeStarted=false;
 const reject=(code,status=422)=>json({ok:false,error:code,outcome:'not_started',request_ref:input.reference},status);
 try{
  const scope=input.operation==='search' ? input.scope || 'public' : input.payload?.scope || 'public';
  if(!['public','private'].includes(scope))return reject('scope_invalid',400);
  const privateContext=input.operation==='context'||scope==='private'
    ? await currentPrivateContext(request,env,input.member_id,viewer) : null;
  if(input.operation==='context')return json({ok:true,scopes:privateContext?.allowedFolders.length?['public','private']:['public']});
  if(scope==='private'&&!privateContext?.allowedFolders.length)return reject('private_requires_current_entitlement',403);
  const context=privateContext?.memberRecordId?{memberRecordId:privateContext.memberRecordId,memberId:input.member_id}:null;
  const search=async(q='')=>{
   const selected=/^rec[A-Za-z0-9]{14,24}$/.test(q)?q:'';
   const res=await delegate(new Request('https://sigil-booking.internal/sigil/api/models/search?scope='+scope+'&q='+encodeURIComponent(selected?'':q),{headers:{cookie:request.headers.get('cookie')||''}}),{...context,...(selected?{selectedModelId:selected}:{})});
   const body=await res.json().catch(()=>null);
   const authorized=res.ok&&body?.ok===true&&body.visibility_enforced===true&&body.blocked!==true&&(scope!=='public'||body.discovery_scope==='public');
   if(!authorized||!Array.isArray(body.items))throw Error('search_unavailable');
   return body.items.filter(i=>i.scope===scope&&(!selected||i.model_id===selected)&&/^rec[A-Za-z0-9]{14,24}$/.test(i.model_id||''));
  };
  if(input.operation==='search'){
   const items=await search(String(input.q||'').slice(0,80));
   return json({ok:true,scope,items:items.slice(0,50).map(i=>({model_id:i.model_id,scope,display_name:String(i.display_name||i.working_name||'Model').slice(0,80),media_id:scope==='public'&&/^media_[a-zA-Z0-9_-]{8,100}$/.test(i.primary_media_id||'')?i.primary_media_id:null}))});
  }
  if(input.operation==='list'){
   const rows=await read(env,`FIND('${input.owner}',{resolver_payload_json}&'')>0`);
   if(REF.test(input.reference||'')&&!rows.some(row=>String(row.fields?.booking_ref||row.fields?.['Request ID']||'')===input.reference)){
    const exact=await read(env,`{booking_ref}='${input.reference}'`);
    if(exact.length===1)rows.push(exact[0]);
   }
   const items=[];
   for(const row of rows){
    const f=row.fields||{},meta=parse(f.resolver_payload_json).my_mmd_owner,ref=String(f.booking_ref||f['Request ID']||'');
    if(!REF.test(ref)||meta?.owner!==input.owner||!await validMarker(secret,ref,meta)||meta.state!=='submitted')continue;
    items.push({request_ref:ref,status:requestStatus(f['Request Status']||f.request_status),scope:meta.scope,date:String(f['Preferred Date']||''),time:String(f['Preferred Time']||''),model_name:'นายแบบที่เลือก'});
   }
   return json({ok:true,items,...(REF.test(input.reference||'')?{active_request_ref:input.reference}:{})});
  }
  if(!REF.test(input.reference||'')||!input.payload||!/^rec[A-Za-z0-9]{14,24}$/.test(input.payload.model_id||''))return reject('invalid_request',400);
  const fingerprint=await hash(JSON.stringify(input.payload));
  const existing=await read(env,`{booking_ref}='${input.reference}'`);
  if(existing.length){
   const meta=parse(existing[0].fields?.resolver_payload_json).my_mmd_owner;
   if(existing.length!==1||meta?.owner!==input.owner||!await validMarker(secret,input.reference,meta)||meta.fingerprint!==fingerprint)return json({ok:false,error:'request_conflict'},409);
   if(meta.state==='submitted')return json({ok:true,request_ref:input.reference,idempotent:true});
   return json({ok:false,error:'submission_outcome_pending'},409);
  }
  const model=(await search(input.payload.model_id)).find(i=>i.model_id===input.payload.model_id);
  if(!model)return reject('selected_model_unavailable');
  const meta={schema:'member_booking_owner_v2',owner:input.owner,scope,fingerprint,state:'submitted'};
  meta.signature=await sign(secret,markerValue(input.reference,meta));
  intakeStarted=true;
  const res=await delegate(new Request('https://sigil-booking.internal/sigil/api/booking/intake',{
   method:'POST',headers:{'content-type':'application/json',cookie:request.headers.get('cookie')||''},body:JSON.stringify({
    booking_ref:input.reference,source:'my_mmd_member_booking',source_path:'/member/liff',lane:scope,model_scope:scope,
    selected_model_id:model.model_id,resolved_model_key:model.model_id,selected_model_name:model.display_name,
    preferred_date:input.payload.date,preferred_time:input.payload.time,city:input.payload.area,
    client_notes:input.payload.note,search_mode:'booking',line_or_member_id:input.member_id
   })
  }),{...context,ownerMetadata:meta});
  const body=await res.json().catch(()=>null);
  if(!res.ok||body?.ok!==true||body.booking_ref!==input.reference)return json({ok:false,error:'submission_outcome_pending'},409);
  return json({ok:true,request_ref:input.reference,status:'request_pending_admin_review'},201);
 }catch{return json({ok:false,error:'booking_unavailable',...(input.operation==='submit'&&!intakeStarted?{outcome:'not_started',request_ref:input.reference}:{})},503);}
}
function markerValue(ref,m){return [m.schema,m.owner,ref,m.scope,m.fingerprint].join(':');}
async function validMarker(secret,ref,m){return m?.schema==='member_booking_owner_v2'&&['public','private'].includes(m.scope)&&OWNER.test(m.fingerprint||'')&&m.signature===await sign(secret,markerValue(ref,m));}
export function requestStatus(value){
 const status=String(value||'').trim().toLowerCase().replace(/[ -]+/g,'_');
 if(['draft','requested','submitted','pending','pending_review','request_pending_admin_review'].includes(status))return 'request_pending_admin_review';
 if(['reviewing','under_review','review_required','processing'].includes(status))return 'under_review';
 if(['confirmed','approved','accepted'].includes(status))return 'request_accepted';
 if(['cancelled','canceled','rejected','declined'].includes(status))return 'cancelled';
 if(['closed','completed','resolved'].includes(status))return 'closed';
 return 'checking';
}
// Existing browser endpoints must not overwrite a member-owned request by guessing its ref.
export async function protectMemberBookingReference(request,env){
 const body=await request.clone().json().catch(()=>null);
 const ref=String(body?.booking_ref||body?.request_id||'').trim();
 if(body?.resolver_payload_json?.my_mmd_owner)return json({ok:false,error:'browser_authority_rejected'},400);
 if(!REF.test(ref))return null;
 try {const rows=await read(env,`{booking_ref}='${ref}'`);if(rows.length)return json({ok:false,error:'member_owned_request'},403);}
 catch{return json({ok:false,error:'booking_unavailable'},503);}
 return null;
}
async function read(env,formula){
 if(!env.AIRTABLE_API_KEY||!env.AIRTABLE_BASE_ID)throw Error('unavailable');
 const table=env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID||env.AIRTABLE_TABLE_BOOKING_REQUESTS||'SIGIL Booking Requests';
 const url=new URL('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+encodeURIComponent(table));url.searchParams.set('filterByFormula',formula);url.searchParams.set('maxRecords','50');url.searchParams.set('sort[0][field]','Created At');url.searchParams.set('sort[0][direction]','desc');
 const res=await fetch(url,{headers:{authorization:'Bearer '+env.AIRTABLE_API_KEY},signal:AbortSignal.timeout(8000)});
 const body=await res.json();if(!res.ok||!Array.isArray(body.records))throw Error('unavailable');return body.records;
}
function parse(value){try{return JSON.parse(value||'{}');}catch{return {};}}
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function sign(secret,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
function json(body,status=200){return Response.json(body,{status,headers:{'cache-control':'private, no-store'}});}
