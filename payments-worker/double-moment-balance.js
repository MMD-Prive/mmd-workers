import {doubleMomentAdapters as db} from './double-moment-purchase-v1.js';
import {formulaValue} from './lib/payment-primitives.js';
export const creditError=(message,status=503)=>Object.assign(new Error(message),{status});
export function sessionCreditIdentity(session){
 const f=session?.fields||{};
 const read=(id,name)=>{if(f[id]!==undefined&&f[name]!==undefined&&JSON.stringify(f[id])!==JSON.stringify(f[name]))throw creditError('credit_session_fields_conflict');return f[id]??f[name];};
 const client=read('fld6P6if0vDZCeV0C','Client'),job=read('fldHw5HdDDdkHXMhG','job_id'),sid=read('fldLTq2kZbyRv22IA','session_id');
 if(!Array.isArray(client)||client.length!==1||!/^rec[A-Za-z0-9]{14}$/.test(client[0])||typeof job!=='string'||!/^[-\w]{1,120}$/.test(job)||typeof sid!=='string'||!/^[-\w]{1,220}$/.test(sid))throw creditError('credit_session_identity_unconfirmed');
 return {client_record_id:client[0],job_id:job,session_id:sid};
}
export async function readCreditSession(env,sessionId){
 if(typeof sessionId!=='string'||!/^[-\w]{1,220}$/.test(sessionId))throw creditError('invalid_session',400);
 const url=new URL('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+encodeURIComponent(env.AIRTABLE_TABLE_SESSIONS||'tblC98mKWbzmPuNzX'));
 url.searchParams.set('filterByFormula',`{session_id}='${formulaValue(sessionId)}'`);url.searchParams.set('maxRecords','2');url.searchParams.set('returnFieldsByFieldId','true');
 const d=await db.airtableFetch(env,url,{method:'GET'});
 if(!Array.isArray(d.records)||d.records.length!==1||d.offset)throw creditError('credit_session_not_unique');
 const s=d.records[0];if(sessionCreditIdentity(s).session_id!==sessionId)throw creditError('credit_session_identity_unconfirmed');return s;
}
export async function creditActorRequest(env,identity,action,extra={}){
 const ns=env.DOUBLE_MOMENT_COORDINATOR,token=action==='final-intent'?env.AUTH_SERVICE_ADMIN_TO_PAYMENTS:env.AUTH_SERVICE_MEMBER_TO_PAYMENTS;
 if(!ns?.get||!token)throw creditError('credit_authority_unavailable');
 const r=await ns.get(ns.idFromName(identity.client_record_id)).fetch(new Request('https://double-moment-coordinator.internal/run',{method:'POST',headers:{'content-type':'application/json','x-internal-token':token},body:JSON.stringify({...identity,...extra,action})}));
 const d=await r.json().catch(()=>null);if(!r.ok||d?.ok!==true)throw creditError(/^[a-zA-Z0-9_]+$/.test(d?.error||'')?d.error:'credit_authority_unavailable',[400,403,409,422].includes(r.status)?r.status:503);return d;
}
export async function readSessionCreditBalance(env,session,onStage){
 const identity=sessionCreditIdentity(session);
 onStage?.("credit_coordinator");
 const d=env.DOUBLE_MOMENT_CREDIT_READER?await env.DOUBLE_MOMENT_CREDIT_READER(session):await creditActorRequest(env,identity,'credit-balance');
 if(d?.ok!==true||d.session_id!==identity.session_id||d.client_record_id!==identity.client_record_id||d.job_id!==identity.job_id||typeof d.paid_credit_thb!=='number'||typeof d.bonus_credit_thb!=='number'||![d.paid_credit_thb,d.bonus_credit_thb].every(n=>Number.isInteger(n)&&n>=0)||![0,10000].includes(d.paid_credit_thb)||d.bonus_credit_thb!==(d.paid_credit_thb?3500:0))throw creditError('credit_authority_unavailable');
 return d;
}
export function sessionNeedsCreditRead(env,session){
 const f=session?.fields||{};
 const lanes=['fldzYGziqLqTQaoaK','model_work_lane','fldxo2T68yebcpGkw','session_type_raw','fldr4t9Cz58oCU96A','Session Type','fldjK3U9bghnj7xUe','job_type'].map(k=>String(f[k]?.name??f[k]??'').trim().toLowerCase()).filter(Boolean);
 const excluded=lanes.some(v=>/mms|massage|membership|renewal|shop|historical/.test(v));
 const mmd=lanes.some(v=>['pn','vip','svip','public','private','public_model','private_model'].includes(v));
 if(excluded&&mmd)throw creditError('credit_session_lane_conflict');
 if(excluded)return false;
 // Unlinked historical cash-only records retain their existing path. Any MMD
 // job linkage or configured credit authority requires a positive read.
 return !!env.DOUBLE_MOMENT_COORDINATOR||Object.hasOwn(f,'job_id')||Object.hasOwn(f,'fldHw5HdDDdkHXMhG');
}
