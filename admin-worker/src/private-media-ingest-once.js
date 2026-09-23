import { mediaRequest, planPrivateUpload, uploadPrivateMedia, readMedia } from '../../shared/private-media.mjs';

export const PRIVATE_MEDIA_INGEST_ONCE_PATH = '/v1/admin/private-media/ingest-once';
const CAPABILITY_TABLE = 'tbldR4n2KP5fF0Zxk';
const headers = {
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'x-robots-tag':'noindex, nofollow',
};
const json=(body,status=200)=>Response.json(body,{status,headers});

function clean(value,max=1000){return String(value==null?'':value).trim().slice(0,max);}
function escapeFormula(value){return String(value||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
async function sha256Hex(bytes){
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function tokenHash(token){
  return sha256Hex(new TextEncoder().encode(token));
}
async function patchCapability(env,id,fields){
  return mediaRequest(env, env.AIRTABLE_TABLE_PRIVATE_MEDIA_INGEST_CAPABILITIES || CAPABILITY_TABLE, `/${id}`, {
    method:'PATCH',
    body:JSON.stringify({fields,typecast:false}),
  });
}
async function findCapability(env,hash){
  const query=new URLSearchParams({filterByFormula:`{token_hash}='${escapeFormula(hash)}'`,maxRecords:'2'});
  const body=await mediaRequest(env, env.AIRTABLE_TABLE_PRIVATE_MEDIA_INGEST_CAPABILITIES || CAPABILITY_TABLE, `?${query}`);
  const rows=Array.isArray(body.records)?body.records:[];
  if(rows.length!==1)return null;
  return rows[0];
}

export function isPrivateMediaIngestOnceRequest(request){
  if(!(request instanceof Request))return false;
  const url=new URL(request.url);
  return request.method==='POST' && url.pathname.replace(/\/$/,'')===PRIVATE_MEDIA_INGEST_ONCE_PATH;
}

export async function handlePrivateMediaIngestOnce(request,env){
  if(!isPrivateMediaIngestOnceRequest(request))return json({ok:false,error:'not_found'},404);
  const url=new URL(request.url);
  if(!['https://mmdbkk.com','https://www.mmdbkk.com'].includes(url.origin))return json({ok:false,error:'forbidden_origin'},403);
  if(request.headers.has('cookie')||request.headers.has('authorization')||request.headers.has('x-confirm-key')){
    return json({ok:false,error:'ingest_capability_required'},403);
  }
  const rawToken=clean(request.headers.get('x-mmd-private-ingest-token'),500);
  if(!/^[A-Za-z0-9_-]{32,500}$/.test(rawToken))return json({ok:false,error:'ingest_token_required'},401);

  let capability=null;
  try{
    const hash=await tokenHash(rawToken);
    capability=await findCapability(env,hash);
    if(!capability)return json({ok:false,error:'ingest_capability_invalid'},401);
    const f=capability.fields||{};
    if(f.status!=='ready')return json({ok:false,error:'ingest_capability_not_ready'},409);
    const expiresAt=Date.parse(clean(f.expires_at,100));
    if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()){
      await patchCapability(env,capability.id,{status:'expired'});
      return json({ok:false,error:'ingest_capability_expired'},410);
    }

    const modelId=clean(f.model_record_id,100);
    const fileName=clean(f.file_name,240);
    const contentType=clean(f.content_type,120).toLowerCase();
    const expectedSize=Number(f.file_size_bytes);
    const expectedSha=clean(f.content_sha256,80).toLowerCase();
    if(!/^rec[A-Za-z0-9]+$/.test(modelId)||!fileName||!['image/jpeg','image/png','image/webp','video/mp4'].includes(contentType)||
      !Number.isSafeInteger(expectedSize)||expectedSize<1||!/^[a-f0-9]{64}$/.test(expectedSha)){
      return json({ok:false,error:'ingest_capability_corrupt'},409);
    }
    if(clean(request.headers.get('content-type'),120).toLowerCase().split(';')[0]!==contentType){
      return json({ok:false,error:'ingest_content_type_mismatch'},415);
    }

    const buffer=await request.arrayBuffer();
    if(buffer.byteLength!==expectedSize)return json({ok:false,error:'ingest_size_mismatch'},400);
    const actualSha=await sha256Hex(buffer);
    if(actualSha!==expectedSha)return json({ok:false,error:'ingest_hash_mismatch'},409);

    // Re-read immediately before claiming the one-use capability.
    const current=await findCapability(env,hash);
    if(!current||current.id!==capability.id||current.fields?.status!=='ready'){
      return json({ok:false,error:'ingest_capability_replayed'},409);
    }
    await patchCapability(env,capability.id,{status:'consuming'});

    try{
      const plan=await planPrivateUpload(env,modelId,{
        file_name:fileName,
        content_type:contentType,
        file_size_bytes:expectedSize,
      });
      const uploadRequest=new Request('https://private-media-ingest.internal/upload',{
        method:'POST',
        headers:{'content-type':contentType},
        body:buffer,
      });
      const result=await uploadPrivateMedia(uploadRequest,env,modelId,plan.asset_id,{
        requestedBy:'owner:one-time-private-ingest',
      });
      const media=await readMedia(env,plan.asset_id);
      await patchCapability(env,capability.id,{
        status:'consumed',
        consumed_at:new Date().toISOString(),
        media_asset_record_id:media.id,
        failure_reason:'',
      });
      return json({
        ok:result.ok===true,
        status:result.status,
        media_asset_id:media.id,
        review_required:true,
        source:'one_time_private_ingest',
      });
    }catch(error){
      await patchCapability(env,capability.id,{
        status:'failed',
        failure_reason:clean(error?.code||error?.message||'ingest_failed',160),
      }).catch(()=>{});
      throw error;
    }
  }catch(error){
    return json({ok:false,error:error?.code||'private_media_ingest_unavailable'},error?.status||503);
  }
}
