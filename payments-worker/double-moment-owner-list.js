import {doubleMomentAdapters as db} from './double-moment-purchase-v1.js';
import {formulaValue} from './lib/payment-primitives.js';
const fail=code=>{throw Object.assign(Error(code),{status:503});};
export async function readDoubleMomentOwnerClaims(env,body){
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['q','cursor'].includes(k))||typeof (body.q??'')!=='string'||(body.q||'').length>120||body.cursor&&!/^[A-Za-z0-9/_-]{1,500}$/.test(body.cursor))throw Object.assign(Error('invalid_claim_query'),{status:422});
 const url=new URL('https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+db.table(env,'claims'));
 const query=(body.q||'').trim();
 const match=query?`,FIND(LOWER('${formulaValue(query)}'),LOWER({matched_member_id}&' '&{claim_id}))`:'';
 url.searchParams.set('filterByFormula',`AND({campaign_id}='promo_double_moment_sep2026'${match})`);
 url.searchParams.set('pageSize','20');if(body.cursor)url.searchParams.set('offset',body.cursor);
 const data=await db.airtableFetch(env,url,{method:'GET'});
 if(!Array.isArray(data.records)||data.records.length>20||data.offset&&!/^[A-Za-z0-9/_-]{1,500}$/.test(data.offset))fail('claim_list_unavailable');
 const seen=new Set(),items=data.records.map(row=>{
  const f=row.fields||{};let meta;try{meta=JSON.parse(f.payload_json||'{}');}catch{fail('claim_list_unavailable');}
  if(f.campaign_id!=='promo_double_moment_sep2026'||!/^dm(?:2)?_[a-f0-9]{24}$/.test(f.claim_id||'')||!/^rec[A-Za-z0-9]{14}$/.test(f.matched_client_id||'')||seen.has(f.claim_id))fail('claim_list_unavailable');
  seen.add(f.claim_id);
  return {claim_id:f.claim_id,client_record_id:f.matched_client_id,member_id:typeof f.matched_member_id==='string'?f.matched_member_id:'',round_id:typeof meta.round_id==='string'?meta.round_id:'',policy_version:meta.policy?.policy_version||'v1',status:typeof f.claim_status==='string'?f.claim_status:'unknown',issued_at:meta.issued_at||f.applied_at||null,expires_at:meta.expires_at||null};
 });
 return {ok:true,items,next_cursor:data.offset||null};
}
