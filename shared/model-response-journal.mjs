import { normalizeModelDecline } from './model-decline-options.mjs';
import {snapshotAuthority} from './model-response-session.mjs';
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x=>x.toString(16).padStart(2,'0')).join('');
const fail = code => ({ok:false,receipt:{schema:'mmd_model_response_v1',outcome:'rejected',code}});
// The authority must revalidate the authenticated actor, exact Session and original
// offer revision on every call, including replay. No production adapter is installed.
export async function recordModelResponse({bucket,authorize,apply,input,now=Date.now()}) {
  if(!bucket?.get || !bucket?.put || typeof authorize!=='function' || typeof apply!=='function') return fail('response_journal_unavailable');
  if(!input || !['accept_job','decline_job'].includes(input.action) || !/^[a-zA-Z0-9_-]{16,128}$/.test(input.operation_id||'')) return fail('response_invalid');
  let auth;try{auth=snapshotAuthority(await authorize(input));}catch{return fail('response_authority_unavailable');}
  if(auth?.ok!==true || !auth.model_id || !auth.session_id || !auth.offer_revision || !auth.binding || auth.session_id!==input.session_id) return fail('response_not_authorized');
  if(input.offer_revision!==auth.offer_revision) return fail('offer_revision_changed');
  const proposal=input.action==='decline_job'?normalizeModelDecline(input,now):null;
  // Expiry is checked for new operations below; valid historical replay must not
  // become invalid merely because a proposed time has since elapsed.
  const payload={action:input.action,reason:input.reason??'',availability_options:input.availability_options??[]};
  if(input.action==='accept_job' && (input.reason!=null || input.availability_options!=null)) return fail('response_invalid');
  const identity=JSON.stringify([auth.model_id,auth.session_id,auth.offer_revision]);
  const id=await digest(identity),key='model-responses/v1/'+id+'.json';
  const fingerprint=await digest(JSON.stringify([auth.offer_revision,auth.binding,payload]));
  const read=async()=>{const object=await bucket.get(key);if(!object)return null;return object.json();};
  const receipt=(outcome,code)=>({schema:'mmd_model_response_v1',operation_id:input.operation_id,outcome,code});
  const replay=record=>{
    if(record.fingerprint!==fingerprint)return fail('response_operation_conflict');
    return record.outcome==='success'?{ok:true,receipt:record.receipt,...(record.session?{session:record.session}:{})}:{ok:false,receipt:receipt('unknown','check_status_before_retry')};
  };
  try {
    const existing=await read();if(existing)return replay(existing);
    if(auth.allowed!==true)return fail('response_not_allowed');
    if(proposal&&!proposal.ok)return fail('decline_options_invalid');
    const record={schema:'mmd_model_response_journal_v1',fingerprint,outcome:'unknown',created_at:now,
      action:input.action,proposal:proposal?{reason:input.reason||'',options:proposal.options}:null};
    const claim=await bucket.put(key,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'}});
    if(claim===null){const current=await read();return current?replay(current):{ok:false,receipt:receipt('unknown','check_status_before_retry')};}
    // Persist the proposal and operation claim before the authoritative write.
    // A timeout/crash after this point never triggers a second apply automatically.
    let applied;try{applied=await apply({action:input.action,session_id:auth.session_id,offer_revision:auth.offer_revision,operation_id:input.operation_id});}catch{return{ok:false,receipt:receipt('unknown','check_status_before_retry')};}
    if(applied?.ok!==true)return{ok:false,receipt:receipt('unknown','check_status_before_retry')};
    const done={...record,outcome:'success',receipt:receipt('success','saved'),...(applied.session?{session:applied.session}:{})};
    const saved=await bucket.put(key,JSON.stringify(done),{onlyIf:{etagMatches:claim.etag}});
    if(saved===null)return{ok:false,receipt:receipt('unknown','check_status_before_retry')};
    return{ok:true,receipt:done.receipt,...(done.session?{session:done.session}:{})};
  }catch{return{ok:false,receipt:receipt('unknown','response_storage_unavailable')};}
}
