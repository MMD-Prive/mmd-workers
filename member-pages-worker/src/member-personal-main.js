import {personalMain, PERSONAL_MAINS} from '../../shared/personal-main-catalog.mjs';
const PATH='/api/member/app/personal-main';
const headers={'cache-control':'private, no-store',vary:'Cookie','x-content-type-options':'nosniff'};
export const isPersonalMainRequest=request=>new URL(request.url).pathname.replace(/\/$/,'')===PATH;
const verified=session=>session?.memberExists===true && /^[A-Za-z0-9_-]{3,160}$/.test(session.memberId||'') && !!session.lineUserId
  && (!session.memberProfile?.member_id || session.memberProfile.member_id===session.memberId)
  && ['active','grace','expired'].includes(session.memberProfile?.membership_status);
async function preferenceKey(session){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([session.memberId,session.lineUserId])));
  return 'personal-main:v1:'+Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function readPersonalMain(env,session){
  if(!verified(session))return null;
  if(!env.LIFF_IDENTITY_KV?.get)throw Error('preference_unavailable');
  const value=await env.LIFF_IDENTITY_KV.get(await preferenceKey(session),'json');
  return value?.schema===1 ? personalMain(value.id) : null;
}
export async function handlePersonalMain(request,env,readSession){
  const respond=(body,status=200)=>Response.json(body,{status,headers});
  const url=new URL(request.url);
  if(!['GET','PUT'].includes(request.method))return respond({ok:false,error:'method_not_allowed'},405);
  if(url.search)return respond({ok:false,error:'browser_identity_rejected'},400);
  if(request.method==='PUT' && (!['https://mmdbkk.com','https://www.mmdbkk.com'].includes(url.origin) || request.headers.get('origin')!==url.origin))return respond({ok:false,error:'origin_not_allowed'},403);
  try {
    const session=await readSession(request,env);
    if(!verified(session))return respond({ok:false,error:'member_session_required'},401);
    if(request.method==='GET')return respond({ok:true,selected:await readPersonalMain(env,session),choices:PERSONAL_MAINS,authority:'member-pages-worker'});
    if(!request.headers.get('content-type')?.startsWith('application/json'))return respond({ok:false,error:'json_required'},415);
    const reader=request.body?.getReader();
    if(!reader)return respond({ok:false,error:'invalid_preference'},400);
    let raw='',size=0;const decoder=new TextDecoder();
    try {
      while(true){
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>128){await reader.cancel();return respond({ok:false,error:'invalid_preference'},400);}
        raw+=decoder.decode(value,{stream:true});
      }
      raw+=decoder.decode();
    } finally {reader.releaseLock();}
    let body;try{body=JSON.parse(raw);}catch{return respond({ok:false,error:'invalid_preference'},400);}
    if(!body || Object.keys(body).length!==1 || !personalMain(body.id))return respond({ok:false,error:'invalid_preference'},400);
    if(!env.LIFF_IDENTITY_KV?.put)throw Error('preference_unavailable');
    await env.LIFF_IDENTITY_KV.put(await preferenceKey(session),JSON.stringify({schema:1,id:body.id}));
    return respond({ok:true,selected:personalMain(body.id),authority:'member-pages-worker'});
  } catch{return respond({ok:false,error:'preference_unavailable'},503);}
}
