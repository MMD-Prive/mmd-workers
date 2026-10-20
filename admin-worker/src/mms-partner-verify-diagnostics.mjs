// No tokens, identities, IPs, URLs, headers, claim/account IDs or exception text.
// Browser observations are explicitly untrusted and never authorize anything.
export const DIAGNOSTIC_LIMIT = 200;
const TTL=24*60*60*1000;
export const DIAGNOSTIC_STAGES=Object.freeze(['client_openid_unavailable','client_openid_consent_required','client_version_unavailable','client_return_detected','client_return_no_intent','client_return_shop_conflict','client_restored_page','client_update_required','client_ready','client_login_redirect','client_logged_in','client_token_missing','client_request_failed','client_status_failed','client_sdk_failed','client_claim_saved','request_received','status_received','line_verified','store_reached','account_read','account_write','account_saved','claim_read','claim_write','claim_saved','store_failed','request_failed','status_failed','diagnostic_self_test']);
export const DIAGNOSTIC_CODES=Object.freeze(['LINE_OPENID_SCOPE_MISSING','LINE_OPENID_CONSENT_REQUIRED','LINE_SESSION_INCOMPLETE','OK','UNEXPECTED','NETWORK_ERROR','SDK_ERROR','RATE_LIMITED','LINE_TOKEN_REQUIRED','LINE_TOKEN_INVALID','CONSENT_REQUIRED','ORIGIN_DENIED','FIELDS_INVALID','REGISTRY_UNAVAILABLE','REGISTRY_WRITE_UNAVAILABLE','REGISTRY_CONFLICT','REGISTRY_INCOMPLETE','SHOP_IDENTITY_CONFLICT','SHOP_BLOCKED','PARTNER_STORE_UNAVAILABLE','ACCOUNT_DENIED','CLAIM_CONFLICT','IDENTITY_REQUIRED','DIAGNOSTICS_UNAVAILABLE']);
export const diagnosticCode=value=>DIAGNOSTIC_CODES.includes(value)?value:'UNEXPECTED';
const validShop=shop=>shop==='kalima'||shop==='relax';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
function safeEvent(value,shop,now){
  if(!value||value.shop!==shop||!DIAGNOSTIC_STAGES.includes(value.stage)||!DIAGNOSTIC_CODES.includes(value.code))return null;
  const at=Date.parse(value.at);if(!Number.isFinite(at)||at>now||now-at>TTL)return null;
  return {at:new Date(at).toISOString(),shop,stage:value.stage,code:value.code};
}
export async function diagnosticStore(request,storage){
  const action=new URL(request.url).pathname;
  if(request.method!=='POST'||!['/mms-line/diagnostics/read','/mms-line/diagnostics/append'].includes(action))return reply({ok:false,error:'FIELDS_INVALID'},400);
  if(!storage?.get||!storage?.put)return reply({ok:false,error:'DIAGNOSTICS_UNAVAILABLE'},503);
  let b;try{b=await request.json();}catch{return reply({ok:false,error:'FIELDS_INVALID'},400);}
  if(!b||!validShop(b.shop)||Object.keys(b).some(k=>!['shop','stage','code'].includes(k)))return reply({ok:false,error:'FIELDS_INVALID'},400);
  const now=Date.now(),key='verify-diagnostics:'+b.shop;
  const stored=await storage.get(key),events=(Array.isArray(stored)?stored:[]).map(x=>safeEvent(x,b.shop,now)).filter(Boolean);
  if(action.endsWith('/read'))return reply({ok:true,shop_key:b.shop,events,limit:DIAGNOSTIC_LIMIT,retention_hours:24});
  if(!DIAGNOSTIC_STAGES.includes(b.stage)||!DIAGNOSTIC_CODES.includes(b.code))return reply({ok:false,error:'FIELDS_INVALID'},400);
  if(b.stage.startsWith('client_')&&events.filter(e=>e.stage.startsWith('client_')&&now-Date.parse(e.at)<60000).length>=30)return reply({ok:false,error:'RATE_LIMITED'},429);
  events.push({at:new Date(now).toISOString(),shop:b.shop,stage:b.stage,code:b.code});
  await storage.put(key,events.slice(-DIAGNOSTIC_LIMIT));
  return reply({ok:true});
}
async function invoke(env,shop,action,extra={}){
  if(!validShop(shop)||!env.MMS_PARTNER_AUTH?.get)throw Error('DIAGNOSTICS_UNAVAILABLE');
  const stub=env.MMS_PARTNER_AUTH.get(env.MMS_PARTNER_AUTH.idFromName('mms-verify-diagnostics:v1:'+shop));
  return stub.fetch(new Request('https://mms-partner-auth.internal/mms-line/diagnostics/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shop,...extra})}));
}
export async function recordDiagnostic(env,shop,stage,code='OK'){
  if(!validShop(shop)||!DIAGNOSTIC_STAGES.includes(stage))return false;
  try{return (await invoke(env,shop,'append',{stage,code:diagnosticCode(code)})).ok;}catch{return false;}
}
export async function readDiagnostics(env,shop){try{return await invoke(env,shop,'read');}catch{return reply({ok:false,error:'DIAGNOSTICS_UNAVAILABLE'},503);}}
