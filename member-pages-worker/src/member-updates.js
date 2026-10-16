// Published editorial projection only; no shared cache can retain withdrawn posts.
const COLLECTION = '6ad1c108b1deb34b49019a10';
const PATHS = new Set(['/api/v1/member/updates/list', '/api/member/app/updates']);
const HEADERS = {'cache-control':'private, no-store, max-age=0',vary:'Cookie','x-content-type-options':'nosniff'};
export const isMemberUpdatesRequest = request => PATHS.has(new URL(request.url).pathname.replace(/\/$/, ''));
function url(value, image = false) {
  try { const u = new URL(String(value || ''), 'https://mmdbkk.com');
    if (!value || u.username || u.password || u.protocol !== 'https:') return null;
    const allowed = image ? ['mmdbkk.com','www.mmdbkk.com','cdn.prod.website-files.com','uploads-ssl.webflow.com'] : ['mmdbkk.com','www.mmdbkk.com'];
    return allowed.includes(u.hostname) ? u.href : null;
  } catch { return null; }
}
export function projectPublishedUpdates(live, staged, limit) {
  const approved = new Set(staged.filter(x => x.isDraft === false && x.isArchived === false && x.lastPublished).map(x => x.id));
  return live.filter(x => approved.has(x.id) && x.isDraft === false && x.isArchived === false && x.lastPublished)
    .sort((a,b)=>Date.parse(b.lastPublished)-Date.parse(a.lastPublished)).slice(0,limit).map(x=>{
      const f=x.fieldData || {}; const target=url(f['button-link']); const label=String(f['button-label'] || '').trim().slice(0,100);
      return {id:x.id,title:String(f.name || '').slice(0,256),summary:String(f['short-summary'] || '').slice(0,800),image_url:url(f['cover-image']?.url,true),image_alt:String(f['cover-image']?.alt || '').slice(0,160),published_at:x.lastPublished,...(target && label ? {cta:{label,url:target}} : {})};
    }).filter(x=>x.title.trim());
}
async function boundedJson(response) {
  if (!response.ok) { await response.body?.cancel(); throw Error('cms_unavailable'); }
  const reader=response.body.getReader(); let size=0; const chunks=[];
  try { while(true){ const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>2000000)throw Error('cms_too_large');chunks.push(value); } }
  catch(e){await reader.cancel();throw e;}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
async function list(env, live) {
  let offset=0;const items=[];
  for(let page=0;page<10;page++){
    const endpoint=`https://api.webflow.com/v2/collections/${COLLECTION}/items${live?'/live':''}?limit=100&offset=${offset}`;
    const request=new Request(endpoint,{headers:{Authorization:`Bearer ${env.WEBFLOW_CMS_TOKEN}`,accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
    const response=env.WEBFLOW_CMS_HTTP?.fetch ? await env.WEBFLOW_CMS_HTTP.fetch(request) : await fetch(request);
    const data=await boundedJson(response);if(!Array.isArray(data.items)||!Number.isInteger(data.pagination?.total))throw Error('cms_malformed');
    items.push(...data.items);offset+=data.items.length;if(offset>=data.pagination.total)return items;if(!data.items.length)break;
  }throw Error('cms_incomplete');
}
export async function handleMemberUpdates(request, env, readSession) {
  const respond=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
  if(request.method!=='GET')return respond({ok:false,error:{code:'METHOD_NOT_ALLOWED'}},405);
  const session=await readSession(request,env);
  if(!session?.lineUserId || session.memberExists!==true || !session.memberId)return respond({ok:false,error:{code:'MEMBER_SESSION_REQUIRED'}},401);
  if(!env.WEBFLOW_CMS_TOKEN)return respond({ok:false,error:{code:'CMS_NOT_CONFIGURED'}},503);
  try {
    const [live,staged]=await Promise.all([list(env,true),list(env,false)]);
    const n=Number(new URL(request.url).searchParams.get('limit') || 10);const limit=Number.isInteger(n)?Math.max(1,Math.min(20,n)):10;
    return respond({ok:true,items:projectPublishedUpdates(live,staged,limit),source:'webflow_mmd_now',checked_at:new Date().toISOString()});
  } catch { return respond({ok:false,error:{code:'CMS_UNAVAILABLE'}},503); }
}
