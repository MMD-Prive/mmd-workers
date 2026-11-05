// Server configuration only. Never accept this policy from a browser/request body.
const deny=(code,status)=>{throw Object.assign(new Error(code),{status});};
export function doubleMomentTestAccess(env,identity,canonical=null,now=Date.now()) {
 const raw=env.DOUBLE_MOMENT_TEST_ACCESS_JSON;
 if(raw===undefined && env.DOUBLE_MOMENT_TEST_MODE===undefined)return null;
 if(env.DOUBLE_MOMENT_TEST_MODE!=='true')deny('TEST_ACCESS_DISABLED',403);
 let p;try{p=JSON.parse(raw);}catch{deny('test_access_configuration_invalid',503);}
 if(!p||!/^[-a-zA-Z0-9_]{1,80}$/.test(p.test_id||'')||!/^rec[a-zA-Z0-9]{14}$/.test(p.client_record_id||'')||!/^U[0-9a-f]{32}$/i.test(p.line_user_id||'')||!p.member_id||!p.round_id||!p.invitation_id||p.max_purchases!==1||p.amount_thb!==20000||!Number.isFinite(Date.parse(p.starts_at))||!Number.isFinite(Date.parse(p.ends_at))||Date.parse(p.ends_at)<=Date.parse(p.starts_at))deny('test_access_configuration_invalid',503);
 if(now<Date.parse(p.starts_at)||now>=Date.parse(p.ends_at))deny('TEST_ACCESS_OUTSIDE_WINDOW',403);
 if(identity.line_user_id!==p.line_user_id||identity.member_id!==p.member_id)deny('TEST_ACCOUNT_NOT_ALLOWED',403);
 if(canonical&&(canonical.client_record_id!==p.client_record_id||canonical.member_id!==p.member_id||canonical.round_id!==p.round_id||canonical.invitation_id!==p.invitation_id))deny('TEST_INVITATION_NOT_ALLOWED',403);
 return p;
}

// Only the exact configured test Client+round is affected. Existing non-test
// checkout links and payment/credit reconciliation do not use this gate.
export async function doubleMomentTestDeadline(env,sessionId,now=Date.now()) {
 if(!/^dm_dm2_[a-f0-9]{24}$/.test(sessionId||''))return null;
 const key='dm-test-deadline:'+sessionId;
 const stored=await env.PAY_SESSIONS_KV?.get(key);
 let deadline=stored===null||stored===undefined?null:Number(stored);
 if(deadline!==null&&(!Number.isInteger(deadline)||deadline<=0))deny('test_deadline_record_invalid',503);
 if(env.DOUBLE_MOMENT_TEST_ACCESS_JSON!==undefined||env.DOUBLE_MOMENT_TEST_MODE!==undefined){
  let p;try{p=JSON.parse(env.DOUBLE_MOMENT_TEST_ACCESS_JSON);}catch{deny('test_access_configuration_invalid',503);}
  const validated=doubleMomentTestAccess({...env,DOUBLE_MOMENT_TEST_MODE:'true'},p,null,Date.parse(p?.starts_at));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('promo_double_moment_sep2026:'+validated.client_record_id+':'+validated.round_id));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(sessionId==='dm_dm2_'+hash.slice(0,24)){
   deadline=Math.min(deadline??Infinity,Math.floor(Date.parse(validated.ends_at)/1000));
   if(!env.PAY_SESSIONS_KV)deny('test_deadline_store_unavailable',503);
   // Retain the earliest deadline without TTL: removing/rotating test config
   // must not reactivate a link already bound to a closed test window.
   if(String(deadline)!==stored)await env.PAY_SESSIONS_KV.put(key,String(deadline));
   if(now<Date.parse(validated.starts_at))deny('confirmation_token_not_yet_valid',401);
  }
 }
 if(deadline!==null&&Math.floor(now/1000)>=deadline)deny('confirmation_token_expired',401);
 return deadline;
}
