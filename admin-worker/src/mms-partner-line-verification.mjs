// MMS Partner identity intake. Shop access is a separate Owner decision.
import { diagnosticStore, recordDiagnostic, readDiagnostics, DIAGNOSTIC_STAGES, DIAGNOSTIC_CODES } from './mms-partner-verify-diagnostics.mjs';
export const ROOT = '/v1/admin/mms/partner-line';
export const OWNER_PAGE = '/internal/admin/mms/partner-line';
export const CHANNEL = '2012099469';
export const LIFF = '2012099469-JG2eCuvf';
export const VERIFY_RUNTIME = 'verify-openid-20261020-3';
export const SHOPS = Object.freeze({
  kalima: { id: 'recZJM2QjUKAVT12h', name: 'Kalima Massage' },
  relax: { id: 'recohHKPImiHV9GGJ', name: 'Relax Spa by 9' },
});
const TABLES = { shops:'tbl09N5ug8rmEQCyi', accounts:'tbliSftcsqqTt78mG', claims:'tblnXtbI7jj9DbKex', grants:'tblVlfHwFyZrtmXmV' };
const BASE = 'appsV1ILPRfIjkaYg';
const ORIGINS = ['https://www.mmdbkk.com','https://mmdbkk.com'];
const fail = (code,status=400) => { throw Object.assign(new Error(code),{code,status}); };
export const json = (data,status=200) => Response.json(data,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
export async function sha(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join(''); }
const escapeFormula = value => String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
function shopFor(key) { if (!Object.hasOwn(SHOPS,key)) fail('SHOP_INVALID'); return SHOPS[key]; }
export async function airtable(env,table,suffix='',init={}) {
  const token=env.AIRTABLE_API_KEY || env.AIRTABLE_PAT || env.AIRTABLE_TOKEN;
  if (!token || (env.AIRTABLE_BASE_ID && env.AIRTABLE_BASE_ID!==BASE)) fail('REGISTRY_UNAVAILABLE',503);
  const r=await fetch(`https://api.airtable.com/v0/${BASE}/${TABLES[table]}${suffix}`,{...init,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},signal:AbortSignal.timeout(10000)});
  const data=await r.json();
  if (!r.ok) fail('REGISTRY_WRITE_UNAVAILABLE',503);
  return data;
}
export async function findRows(env,table,field,value) {
  const q=new URLSearchParams({pageSize:'100',maxRecords:'100',filterByFormula:`{${field}}='${escapeFormula(value)}'`});
  const r=await airtable(env,table,'?'+q); if(r.offset) fail('REGISTRY_INCOMPLETE',503); return r.records || [];
}
async function unique(env,table,field,value) { const rows=await findRows(env,table,field,value); if(rows.length>1)fail('REGISTRY_CONFLICT',409); return rows[0] || null; }
async function write(env,table,fields,id) { return airtable(env,table,id?'/'+id:'',{method:id?'PATCH':'POST',body:JSON.stringify({fields,typecast:false})}); }
async function readShop(env,key) { const shop=shopFor(key); const r=await airtable(env,'shops','/'+shop.id); if(r.fields?.['Shop Name']!==shop.name)fail('SHOP_IDENTITY_CONFLICT',409); if(r.fields?.['Identity Status']==='Blocked')fail('SHOP_BLOCKED',403);return r; }
function projectClaim(row) { const f=row.fields; const entry=Object.entries(SHOPS).find(([,s])=>s.id===f['Shop Registry Key']);if(!entry)fail('SHOP_IDENTITY_CONFLICT',409); return {claim_id:f['Claim ID'],shop_key:entry[0],shop_name:entry[1].name,account_key:f['Target Partner Account Key'],status:f['Claim Status'],submitted_at:f['Submitted At (ISO-8601)']}; }
export async function verifyLine(idToken,verifyFetch=fetch) {
  if(typeof idToken!=='string'||idToken.length<20||idToken.length>8192)fail('LINE_TOKEN_REQUIRED',401);
  const r=await verifyFetch('https://api.line.me/oauth2/v2.1/verify',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id_token:idToken,client_id:CHANNEL}),signal:AbortSignal.timeout(10000)});
  const p=await r.json();
  if(!r.ok||String(p.aud)!==CHANNEL||p.iss!=='https://access.line.me'||!/^U[a-f0-9]{32}$/i.test(p.sub||'')||!Number.isFinite(p.exp)||p.exp*1000<=Date.now())fail('LINE_TOKEN_INVALID',401);
  return sha(p.sub);
}
async function bodyOf(request,allowed) {
  if(request.headers.get('origin')!==new URL(request.url).origin || !ORIGINS.includes(new URL(request.url).origin))fail('ORIGIN_DENIED',403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail('JSON_REQUIRED',415);
  const reader=request.body?.getReader(); if(!reader)fail('BODY_REQUIRED');let size=0,parts=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12000){await reader.cancel();fail('BODY_TOO_LARGE',413);}parts.push(value);}
  const all=new Uint8Array(size);let at=0;for(const part of parts){all.set(part,at);at+=part.length;}
  let b;try{b=JSON.parse(new TextDecoder().decode(all));}catch{fail('JSON_INVALID');}
  if(!b||Array.isArray(b)||typeof b!=='object'||Object.keys(b).some(k=>!allowed.includes(k)))fail('FIELDS_INVALID');return b;
}
async function callStore(env,hash,command,body) {
  if(!/^[a-f0-9]{64}$/.test(hash)||!env.MMS_PARTNER_AUTH)fail('PARTNER_STORE_UNAVAILABLE',503);
  const stub=env.MMS_PARTNER_AUTH.get(env.MMS_PARTNER_AUTH.idFromName('mms-line-verification:v1:'+hash));
  return stub.fetch(new Request('https://mms-partner-auth.internal/mms-line/'+command,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,line_hash:hash})}));
}
// Invoked only on the private Durable Object binding. Each LINE identity is
// serialized across both shops; Airtable remains the visible review authority.
export async function handleStore(request,env,storage) {
  if(new URL(request.url).pathname.startsWith('/mms-line/diagnostics/'))return diagnosticStore(request,storage);
  let diagnosticShop=null,diagnosticStage='store_reached',enrolling=false,checkingStatus=false;
  try {
    const command=new URL(request.url).pathname.split('/').at(-1), b=await request.json();
    if(!/^[a-f0-9]{64}$/.test(b.line_hash||''))fail('IDENTITY_REQUIRED',401);
    const shop=shopFor(b.shop_key);diagnosticShop=b.shop_key;enrolling=command==='enroll';checkingStatus=command==='status';
    if(enrolling)await recordDiagnostic(env,diagnosticShop,'store_reached');
    const shopRow=await readShop(env,b.shop_key);
    const accountKey='mms_line_'+b.line_hash.slice(0,32);
    const claimId='mmsclaim_'+(await sha(b.line_hash+':'+shop.id)).slice(0,32);
    if(command==='enroll') {
      diagnosticStage='account_read';await recordDiagnostic(env,diagnosticShop,diagnosticStage);
      let account=await unique(env,'accounts','Partner Account Key',accountKey);
      if(account && (account.fields['LINE Subject SHA-256']!==b.line_hash || ['Blocked','Suspended'].includes(account.fields['Account Status'])))fail('ACCOUNT_DENIED',403);
      diagnosticStage='account_write';
      if(!account)account=await write(env,'accounts',{'Partner Account Key':accountKey,'Login Account Reference':'LINE MMS Partner','Account Status':'Pending verification','Authority Source':'LINE ID token verified server-side; Owner review required','LINE Link Status':'Pending Owner Review','LINE Subject SHA-256':b.line_hash});
      await recordDiagnostic(env,diagnosticShop,'account_saved');diagnosticStage='claim_read';
      let claim=await unique(env,'claims','Claim ID',claimId);
      diagnosticStage='claim_write';
      if(!claim) claim=await write(env,'claims',{'Claim ID':claimId,'Shop Registry Key':shop.id,'Target Partner Account Key':accountKey,'Role':'mms_partner','LINE Subject SHA-256':b.line_hash,'LINE Channel ID':CHANNEL,'Claim Status':'Pending Owner Review','Submitted At (ISO-8601)':new Date().toISOString(),'Shop (linked)':[shop.id],'Partner Account (linked)':[account.id]});
      if(claim.fields['Shop Registry Key']!==shop.id||claim.fields['LINE Subject SHA-256']!==b.line_hash)fail('CLAIM_CONFLICT',409);
      await recordDiagnostic(env,diagnosticShop,'claim_saved');
      return json({ok:true,claim:projectClaim(claim)});
    }
    if(command==='status') {
      const claim=await unique(env,'claims','Claim ID',claimId);
      if(!claim)return json({ok:true,claim:null});
      if(claim.fields['LINE Subject SHA-256']!==b.line_hash||claim.fields['Shop Registry Key']!==shop.id)fail('CLAIM_CONFLICT',409);
      const grant=await unique(env,'grants','Grant ID','mmsgrant_'+claimId.slice(9));
      const account=await unique(env,'accounts','Partner Account Key',accountKey);
      const active=Boolean(claim.fields['Claim Status']==='Approved'&&claim.fields.Role==='mms_partner'&&account?.fields['Account Status']==='Active'&&account.fields['LINE Link Status']==='Verified'&&account.fields['LINE Subject SHA-256']===b.line_hash&&grant?.fields['Grant Status']==='Active'&&grant.fields.Role==='mms_partner'&&grant.fields['Source Claim ID']===claimId&&grant.fields['Shop Registry Key']===shop.id&&grant.fields['Partner Account Key']===accountKey&&grant.fields['LINE Subject SHA-256']===b.line_hash&&shopRow.fields['Identity Status']==='Verified'&&shopRow.fields['Canonical Shop ID']);
      return json({ok:true,claim:projectClaim(claim),access:active?'approved_for_this_shop':'not_granted'});
    }
    if(command==='review') {
      if(!b.owner_id||!['approve','reject'].includes(b.decision))fail('REVIEW_INVALID');
      const claim=await unique(env,'claims','Claim ID',b.claim_id);
      if(!claim||claim.fields['Claim ID']!==claimId||claim.fields['Shop Registry Key']!==shop.id||claim.fields['LINE Subject SHA-256']!==b.line_hash)fail('SHOP_SCOPE_DENIED',403);
      if(claim.fields['Claim Status']!=='Pending Owner Review')fail('CLAIM_ALREADY_REVIEWED',409);
      const at=new Date().toISOString(), note=String(b.note||'').trim().slice(0,1000);
      if(b.decision==='reject') {await write(env,'claims',{'Claim Status':'Rejected','Reviewed By':b.owner_id,'Reviewed At (ISO-8601)':at,'Decision Note':note},claim.id);return json({ok:true,status:'rejected',shop_key:b.shop_key});}
      // A blank canonical ID is intentional in the existing registry. Never
      // manufacture it from a display name, slug, theme or the other shop.
      if(shopRow.fields['Identity Status']!=='Verified'||!String(shopRow.fields['Canonical Shop ID']||'').trim())fail('SHOP_IDENTITY_REVIEW_REQUIRED',409);
      const other=await readShop(env,b.shop_key==='kalima'?'relax':'kalima');
      if(other.fields['Canonical Shop ID']===shopRow.fields['Canonical Shop ID'])fail('SHOP_CANONICAL_COLLISION',409);
      const account=await unique(env,'accounts','Partner Account Key',accountKey);
      if(!account||account.fields['LINE Subject SHA-256']!==b.line_hash||['Blocked','Suspended'].includes(account.fields['Account Status']))fail('ACCOUNT_DENIED',403);
      const grantId='mmsgrant_'+claimId.slice(9);
      const existing=await unique(env,'grants','Grant ID',grantId);
      if(existing&&(existing.fields['Shop Registry Key']!==shop.id||existing.fields['Partner Account Key']!==accountKey||existing.fields['LINE Subject SHA-256']!==b.line_hash))fail('GRANT_CONFLICT',409);
      // Approval is last. Partial network failures cannot create usable access;
      // status requires the approved claim AND exact active account/shop grant.
      await write(env,'grants',{'Grant ID':grantId,'Shop Registry Key':shop.id,'Partner Account Key':accountKey,'LINE Subject SHA-256':b.line_hash,'Role':'mms_partner','Grant Status':'Active','Source Claim ID':claimId,'Granted By':b.owner_id,'Granted At (ISO-8601)':at,'Source Claim (linked)':[claim.id],'Shop (linked)':[shop.id],'Partner Account (linked)':[account.id]},existing?.id);
      await write(env,'accounts',{'Account Status':'Active','LINE Link Status':'Verified','Verified By':b.owner_id,'Verified At (ISO-8601)':at},account.id);
      await write(env,'claims',{'Claim Status':'Approved','Reviewed By':b.owner_id,'Reviewed At (ISO-8601)':at,'Decision Note':note},claim.id);
      return json({ok:true,status:'approved',shop_key:b.shop_key});
    }
    fail('NOT_FOUND',404);
  } catch(e){ if(enrolling||checkingStatus)await recordDiagnostic(env,diagnosticShop,enrolling?diagnosticStage:'status_failed',e.code||'UNEXPECTED');return json({ok:false,error:e.code||'VERIFICATION_UNAVAILABLE'},e.status||503); }
}
export async function handleVerification(request,env,{readOwner,appJs,ownerHtml}={}) {
  const u=new URL(request.url), path=u.pathname.replace(/\/$/,'');
  if(!path.startsWith(ROOT+'/')&&path!==OWNER_PAGE)return null;
  let diagnosticShop=null,diagnosticAction=null;
  try {
    if(!ORIGINS.includes(u.origin))fail('HOST_DENIED',403);
    if(path===ROOT+'/app.js'&&request.method==='GET')return new Response(appJs,{headers:{'content-type':'application/javascript;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
    if(path===ROOT+'/config'&&request.method==='GET') {
      await Promise.all(Object.keys(SHOPS).map(key=>readShop(env,key)));
      return json({ok:true,registry_ready:true,liff_id:LIFF,verify_runtime:VERIFY_RUNTIME,shops:Object.entries(SHOPS).map(([key,s])=>({key,name:s.name}))});
    }
    if(path===ROOT+'/event'&&request.method==='POST'){
      const b=await bodyOf(request,['shop_key','stage','code']);shopFor(b.shop_key);
      if(!DIAGNOSTIC_STAGES.includes(b.stage)||!b.stage.startsWith('client_')||!DIAGNOSTIC_CODES.includes(b.code))fail('FIELDS_INVALID');
      const saved=await recordDiagnostic(env,b.shop_key,b.stage,b.code);
      return json({ok:saved},saved?200:503);
    }
    if([ROOT+'/request',ROOT+'/status'].includes(path)&&request.method==='POST') {
      const b=await bodyOf(request,['id_token','shop_key','consent']);shopFor(b.shop_key);
      diagnosticShop=b.shop_key;diagnosticAction=path.endsWith('/request')?'request':'status';
      await recordDiagnostic(env,diagnosticShop,diagnosticAction+'_received');
      if(path.endsWith('/request')&&b.consent!==true)fail('CONSENT_REQUIRED');
      const hash=await verifyLine(b.id_token);
      if(diagnosticAction==='request')await recordDiagnostic(env,diagnosticShop,'line_verified');
      return await callStore(env,hash,path.endsWith('/request')?'enroll':'status',{shop_key:b.shop_key});
    }
    const actor=await readOwner(request,env);
    if(!actor&&path===OWNER_PAGE&&request.method==='GET')return Response.redirect(u.origin+'/internal/admin/login?next='+encodeURIComponent(OWNER_PAGE),303);
    if(!actor||actor.role!=='owner')fail('OWNER_REQUIRED',actor?403:401);
    if(path===ROOT+'/diagnostics'&&request.method==='GET'){const key=u.searchParams.get('shop');shopFor(key);return readDiagnostics(env,key);}
    if(path===ROOT+'/diagnostics/check'&&request.method==='POST'){
      const b=await bodyOf(request,['shop_key']);shopFor(b.shop_key);
      const saved=await recordDiagnostic(env,b.shop_key,'diagnostic_self_test');
      return json({ok:saved},saved?200:503);
    }
    if([ROOT+'/owner',OWNER_PAGE].includes(path)&&request.method==='GET')return new Response(ownerHtml,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-frame-options':'DENY'}});
    if(path===ROOT+'/requests'&&request.method==='GET') {
      const key=u.searchParams.get('shop'), shop=shopFor(key), row=await readShop(env,key);
      const claims=await findRows(env,'claims','Shop Registry Key',shop.id);
      if(claims.some(c=>c.fields['Shop Registry Key']!==shop.id))fail('SHOP_SCOPE_DENIED',403);
      return json({ok:true,shop_key:key,shop_name:shop.name,identity_verified:row.fields['Identity Status']==='Verified'&&Boolean(row.fields['Canonical Shop ID']),claims:claims.map(projectClaim)});
    }
    if(path===ROOT+'/review'&&request.method==='POST') {
      const b=await bodyOf(request,['shop_key','claim_id','decision','note']);const shop=shopFor(b.shop_key);
      if(!/^mmsclaim_[a-f0-9]{32}$/.test(b.claim_id||''))fail('CLAIM_INVALID');
      const claim=await unique(env,'claims','Claim ID',b.claim_id);
      if(!claim||claim.fields['Shop Registry Key']!==shop.id)fail('SHOP_SCOPE_DENIED',403);
      return await callStore(env,claim.fields['LINE Subject SHA-256'],'review',{...b,owner_id:actor.id});
    }
    fail('NOT_FOUND',404);
  }catch(e){if(diagnosticAction)await recordDiagnostic(env,diagnosticShop,diagnosticAction+'_failed',e.code||'UNEXPECTED');return json({ok:false,error:e.code||'VERIFICATION_UNAVAILABLE'},e.status||503);}
}
