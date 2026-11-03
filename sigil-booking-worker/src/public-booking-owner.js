// Internal ownership marker. Submitted contact/name never authorize a booking.
const schema='public_booking_owner_v1';
const clean=v=>typeof v==='string'?v.trim():'';
function key(env){const s=clean(env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES);if(s.length<32)throw Error('owner_unavailable');return s;}
const value=(ref,o)=>JSON.stringify([schema,ref,o.member_id,o.member_record_id,o.member_ref]);
async function sign(env,text){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key(env)),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function makePublicOwner(env,ref,authorization){const owner={schema,member_id:authorization.viewer.memberId,member_record_id:authorization.memberRecordId,member_ref:authorization.viewer.memberRef};return {...owner,signature:await sign(env,value(ref,owner))};}
export async function verifyPublicOwner(env,ref,owner){
 if(owner?.schema!==schema || !/^rec[A-Za-z0-9]{14,24}$/.test(owner.member_record_id||'') || !/^[a-f0-9]{64}$/.test(owner.member_ref||'') || !clean(owner.member_id) || !/^[a-f0-9]{64}$/.test(owner.signature||''))return false;
 const expected=await sign(env,value(ref,owner));let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^owner.signature.charCodeAt(i);return diff===0;
}
export async function preparePublicRequest(env,body,authorization){
 const ref=clean(body.booking_ref||body.request_id)||'book_'+crypto.randomUUID();
 if(ref.length>160 || (!body.booking_ref&&!body.request_id&&body.session_id))throw Object.assign(Error('booking_reference_required'),{status:400});
 const table=env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID||env.AIRTABLE_TABLE_BOOKING_REQUESTS||'SIGIL Booking Requests';
 const qs=new URLSearchParams({filterByFormula:'{booking_ref}='+JSON.stringify(ref),maxRecords:'2'});
 const res=await fetch('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+encodeURIComponent(table)+'?'+qs,{headers:{authorization:'Bearer '+env.AIRTABLE_API_KEY},signal:AbortSignal.timeout(5000)});
 if(!res.ok)throw Error('owner_unavailable');const data=await res.json();if(!Array.isArray(data.records)||data.records.length>1||data.offset)throw Error('owner_unavailable');
 if(data.records.length){let prior;try{prior=JSON.parse(data.records[0].fields?.resolver_payload_json||'{}').public_booking_owner;}catch{}
 if(!await verifyPublicOwner(env,ref,prior)||prior.member_id!==authorization.viewer.memberId||prior.member_ref!==authorization.viewer.memberRef)throw Object.assign(Error('booking_owner_conflict'),{status:403});}
 return {body:{...body,booking_ref:ref,line_or_member_id:authorization.viewer.memberId},owner:await makePublicOwner(env,ref,authorization)};
}

// A Private request must not be used to erase a Public request's ownership.
export async function protectPublicOwnerFromPrivateWrite(request,env) {
 const body=await request.clone().json().catch(()=>({}));
 if(clean(body.lane||body.model_scope).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')!=='private')return null;
 const ref=clean(body.booking_ref||body.request_id);if(!ref)return null;
 try {
  const table=env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID||env.AIRTABLE_TABLE_BOOKING_REQUESTS||'SIGIL Booking Requests';
  const qs=new URLSearchParams({filterByFormula:'{booking_ref}='+JSON.stringify(ref),maxRecords:'2'});
  const res=await fetch('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+encodeURIComponent(table)+'?'+qs,{headers:{authorization:'Bearer '+env.AIRTABLE_API_KEY},signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw Error('unavailable');const data=await res.json();if(!Array.isArray(data.records)||data.offset)throw Error('unavailable');
  for(const row of data.records){let parsed;try{parsed=JSON.parse(row.fields?.resolver_payload_json||'{}');}catch{throw Error('unavailable');}if(parsed.public_booking_owner)return Response.json({ok:false,error:'booking_owner_conflict'},{status:403});}
  return null;
 } catch {return Response.json({ok:false,error:'membership_status_unavailable'},{status:503});}
}
