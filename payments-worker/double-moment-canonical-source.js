import {parseMarkedJson} from './confirmation-details.js';
import {doubleMomentAdapters as db} from './double-moment-purchase-v1.js';
import {formulaValue} from './lib/payment-primitives.js';
import {SOURCE_FIELDS as F} from './double-moment-source-fields.js';
const T={clients:'tblVv58TCbwh5j1fS',members:'tblgWc5VRon5o8Mhk',claims:'tblTH1LGJikBI0rly',jobs:'tbl0jxIjN8QYwGABX',sessions:'tblC98mKWbzmPuNzX'};
const CAMPAIGN='promo_double_moment_sep2026';
const value=(row,table,name)=>row?.fields?.[F[T[table]][name]];
const text=x=>typeof x==='object'?x?.name:String(x??'');
const err=code=>{throw Error(code)};
const term=(table,name,v)=>`{${F[T[table]][name]}}='${formulaValue(v)}'`;
async function one(env,table,formula){const url=new URL('https://api.airtable.com/v0/'+env.AIRTABLE_BASE_ID+'/'+T[table]);url.searchParams.set('returnFieldsByFieldId','true');url.searchParams.set('filterByFormula',formula);url.searchParams.set('maxRecords','2');for(const id of Object.values(F[T[table]]))url.searchParams.append('fields[]',id);const p=await db.airtableFetch(env,url,{method:'GET'});if(!Array.isArray(p.records)||p.offset||p.records.length>1)err('CANONICAL_SOURCE_AMBIGUOUS');return p.records[0]||null;}
async function approvalRead(env,client,action,args){
 if(env.DOUBLE_MOMENT_APPROVAL_STORE){return action==='invitation'?env.DOUBLE_MOMENT_APPROVAL_STORE.invitation(client,args.member_id):env.DOUBLE_MOMENT_APPROVAL_STORE.job(client,args.job_id,args.snapshot_hash);}
 if(!env.DOUBLE_MOMENT_COORDINATOR)return null;
 const stub=env.DOUBLE_MOMENT_COORDINATOR.get(env.DOUBLE_MOMENT_COORDINATOR.idFromName(client));
 const r=await stub.fetch(new Request('https://double-moment-coordinator.internal/run',{method:'POST',headers:{'content-type':'application/json','x-internal-token':env.AUTH_SERVICE_MEMBER_TO_PAYMENTS},body:JSON.stringify({action:'approval-read',kind:action,client_record_id:client,...args})}));
 const p=await r.json();if(!r.ok)err('APPROVAL_STATE_UNAVAILABLE');return p.data;
}
export async function canonicalEligibility(env,body){
 const client=await one(env,'clients',term('clients','line_user_id',body.line_user_id));
 if(!client||client.id!==body.client_record_id||value(client,'clients','line_user_id')!==body.line_user_id)err('CLIENT_SOURCE_MISMATCH');
 const member=await one(env,'members',term('members','member_id',body.member_id));
 const links=value(member,'members','Clients');
 if(!member||value(member,'members','member_id')!==body.member_id||!Array.isArray(links)||links.length!==1||links[0]!==client.id)err('MEMBER_CLIENT_LINK_UNPROVEN');
 const expiryNames=['Membership Expiry','Membership End Date','Expire At'];
 const dates=[...new Set(expiryNames.map(n=>value(member,'members',n)).filter(Boolean).map(String))];
 if(dates.length!==1)err('MEMBERSHIP_EXPIRY_UNPROVEN');
 const day=dates[0];const expiry=/^\d{4}-\d{2}-\d{2}$/.test(day)?day+'T23:59:59.999+07:00':day;
 const verified=['verified','approved'].includes(text(value(member,'members','Verification Status')).toLowerCase());
 const stored=await approvalRead(env,client.id,'invitation',{member_id:body.member_id});
 if(stored)return {line_user_id:body.line_user_id,client_record_id:client.id,member_id:body.member_id,campaign_id:CAMPAIGN,membership_status:verified?text(value(member,'members','Membership Status')).toLowerCase():'unverified',membership_expires_at:expiry,invitation_id:stored.approval_id,invitation_status:stored.status,round_id:stored.round_id,invitation_starts_at:stored.starts_at,invitation_expires_at:stored.expires_at,purchase_allowed:true};
 if(env.DOUBLE_MOMENT_APPROVAL_STORE||env.DOUBLE_MOMENT_COORDINATOR)return {line_user_id:body.line_user_id,client_record_id:client.id,member_id:body.member_id,campaign_id:CAMPAIGN,membership_status:verified?text(value(member,'members','Membership Status')).toLowerCase():'unverified',membership_expires_at:expiry,invitation_status:'not_approved',purchase_allowed:false};
 const invite=await one(env,'claims',`AND(${term('claims','campaign_id',CAMPAIGN)},${term('claims','matched_client_id',client.id)},${term('claims','matched_member_id',body.member_id)},${term('claims','review_status','approved')})`);
 let payload={};try{payload=JSON.parse(value(invite,'claims','payload_json')||'{}')}catch{err('INVITATION_PAYLOAD_INVALID')}
 const approved=!!invite&&value(invite,'claims','campaign_id')===CAMPAIGN&&value(invite,'claims','matched_client_id')===client.id&&value(invite,'claims','matched_member_id')===body.member_id&&text(value(invite,'claims','review_status')).toLowerCase()==='approved'&&text(value(invite,'claims','approved_by')).trim().length>0&&Number.isFinite(Date.parse(value(invite,'claims','approved_at')))&&Date.parse(value(invite,'claims','approved_at'))<=Date.now()&&payload.record_type==='double_moment_invitation';
 return {line_user_id:body.line_user_id,client_record_id:client.id,member_id:body.member_id,campaign_id:CAMPAIGN,membership_status:verified?text(value(member,'members','Membership Status')).toLowerCase():'unverified',membership_expires_at:expiry,invitation_id:approved?text(value(invite,'claims','claim_id')):'',invitation_status:approved?'approved':'not_found',round_id:approved?payload.round_id:'',invitation_starts_at:payload.starts_at,invitation_expires_at:payload.expires_at,purchase_allowed:approved&&payload.purchase_allowed===true};
}
export async function canonicalJobEvidence(env,body,forMutation=false){
 const job=await one(env,'jobs',term('jobs','job_id',body.job_id));
 const session=await one(env,'sessions',term('sessions','job_id',body.job_id));
 const owner=value(job,'jobs','Client (ลูกค้า)'),sessionOwner=value(session,'sessions','Client');
 if(!job||!session||value(job,'jobs','job_id')!==body.job_id||value(session,'sessions','job_id')!==body.job_id||!value(job,'jobs','session_id')||!Array.isArray(owner)||owner.length!==1||owner[0]!==body.client_record_id||!Array.isArray(sessionOwner)||sessionOwner.length!==1||sessionOwner[0]!==body.client_record_id||value(job,'jobs','session_id')!==value(session,'sessions','session_id'))err('JOB_SESSION_OWNER_UNPROVEN');
 const status=x=>text(x).toLowerCase().replace(/[ -]+/g,'_');
 if(!forMutation&&(!['confirmed','booked','in_progress','completed'].includes(status(value(job,'jobs','Job Status')))||!['confirmed','booked','in_progress','completed'].includes(status(value(session,'sessions','Session Status')))))err('JOB_NOT_IN_APPROVABLE_STATE');
 if(forMutation&&[value(job,'jobs','Job Status'),value(session,'sessions','Session Status')].some(x=>['cancelled','canceled','void','refunded','expired'].includes(status(x))))err('JOB_NOT_MUTABLE');
 const note=value(session,'sessions','note')||value(session,'sessions','notes')||'';
 const pricing=parseMarkedJson(note,'SIGIL Pricing v1'),promo=parseMarkedJson(note,'SIGIL Promo v1');
 if(!forMutation&&((pricing&&(pricing.discount_mode!=='none'||Number(pricing.discount_thb)>0))||promo?.source))err('JOB_HAS_OTHER_PROMOTION');
 const snapshot_hash=await db.sha256(JSON.stringify({job_id:job.id,job_fields:job.fields,session_id:session.id,session_fields:session.fields}));
 return {snapshot_hash,session_id:value(session,'sessions','session_id'),job_record_id:job.id,session_record_id:session.id};
}
export async function canonicalJob(env,body){
 const evidence=await canonicalJobEvidence(env,body);
 const approved=await approvalRead(env,body.client_record_id,'job',{job_id:body.job_id,snapshot_hash:evidence.snapshot_hash});
 if(approved)return approved;
 // Budget/Total Amount are not proven pre-discount service-only prices. The live
 // schema has no canonical no-stacking/Double Moment approval fields. Require
 // the owning pricing/discount authority; missing evidence never means false.
 if(!env.DOUBLE_MOMENT_JOB_POLICY_RESOLVER?.fetch)err('JOB_POLICY_AUTHORITY_NOT_CONFIGURED');
 const r=await env.DOUBLE_MOMENT_JOB_POLICY_RESOLVER.fetch(new Request('https://job-policy.internal/double-moment',{method:'POST',headers:{'content-type':'application/json','x-internal-token':env.AUTH_SERVICE_MEMBER_TO_PAYMENTS},body:JSON.stringify({...body,...evidence}),signal:AbortSignal.timeout(8000)}));
 const p=await r.json();if(!r.ok||p.authority!=='canonical_job_pricing_and_discounts'||p.ok!==true||p.data?.job_id!==body.job_id||p.data?.client_record_id!==body.client_record_id)err('JOB_POLICY_UNPROVEN');return p.data;
}
export function createCanonicalDoubleMomentAuthority(env){return {async fetch(request){try{const body=await request.json();const path=new URL(request.url).pathname;const data=path==='/eligibility'?await canonicalEligibility(env,body):path==='/job'?await canonicalJob(env,body):err('UNKNOWN_SOURCE_PATH');return Response.json({ok:true,authority:'double_moment_canonical_v2',data},{headers:{'cache-control':'no-store'}});}catch(error){return Response.json({ok:false,error:error.message},{status:503});}}};}
