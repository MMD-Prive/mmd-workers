// Read only fields already attached to this canonical Model, after the admin gate.
const MIME=new Set(['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif','video/mp4','video/webm','video/quicktime']);
const HEADERS={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow','cross-origin-resource-policy':'same-origin','x-mmd-route-owner':'admin-worker'};
const denied=()=>new Response(null,{status:404,headers:HEADERS});
const keyValid=key=>typeof key==='string' && key.length>0 && key.length<=1024 && !key.startsWith('/') && !/[\x00-\x1f]|(^|\/)\.\.(\/|$)|:\/\//.test(key);
function attachmentUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname.endsWith('.airtableusercontent.com')?u.href:'';}catch{return '';}}
function attachments(record){return Array.isArray(record.fields?.profile_photo)?record.fields.profile_photo:[];}
export function projectLegacyModelMedia(record,env={}) {
 const f=record.fields||{},audience=f.can_work_private && !f.can_work_public?'private':'public';
 const items=attachments(record).filter(a=>/^att[a-zA-Z0-9]+$/.test(a.id||'')&&MIME.has(a.type)&&Number(a.size)>0&&attachmentUrl(a.url)).map(a=>({asset_record_id:a.id,media_id:'',kind:a.type.startsWith('video/')?'clip':'photo',audience,status:'source_only',role:'profile_attachment',preview_available:true}));
 if(keyValid(f.primary_image_key)&&env.MMD_MODEL_ASSETS?.get)items.push({asset_record_id:'legacy',media_id:'',kind:'photo',audience,status:'source_only',role:'legacy_cover',preview_available:true});
 return items;
}
export async function readLegacyModelMedia(request,env,record,assetId) {
 const range=request.headers.get('range');if(range&&!/^bytes=\d*-\d*$/.test(range))return denied();
 if(assetId==='legacy') {
  const key=record.fields?.primary_image_key,bucket=env.MMD_MODEL_ASSETS;if(!keyValid(key)||!bucket?.get)return denied();
  const method=request.method==='HEAD'?'head':'get';if(!bucket[method])return denied();
  const object=await bucket[method](key,...(range&&method==='get'?[{range:request.headers}]:[]));
  if(!object||!MIME.has(object.httpMetadata?.contentType)||!object.size||(object.customMetadata?.model_record_id&&object.customMetadata.model_record_id!==record.id)){await object?.body?.cancel?.();return denied();}
  const headers={...HEADERS,'content-type':object.httpMetadata.contentType,'content-disposition':'inline','accept-ranges':'bytes','content-length':String(object.range?.length||object.size)};
  if(object.range)headers['content-range']=`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`;
  return new Response(method==='head'?null:object.body,{status:object.range?206:200,headers});
 }
 const found=attachments(record).filter(a=>a.id===assetId);if(found.length!==1)return denied();const a=found[0],url=attachmentUrl(a.url);
 if(!url||!MIME.has(a.type)||!Number(a.size))return denied();
 if(request.method==='HEAD')return new Response(null,{headers:{...HEADERS,'content-type':a.type,'content-length':String(a.size)}});
 const r=await fetch(url,{headers:range?{range}:{},redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!r.ok||r.headers.get('content-type')?.split(';')[0]!==a.type){await r.body?.cancel();return denied();}
 const headers={...HEADERS,'content-type':a.type,'content-disposition':'inline','accept-ranges':'bytes'};
 for(const name of ['content-length','content-range'])if(r.headers.has(name))headers[name]=r.headers.get(name);
 return new Response(r.body,{status:r.status,headers});
}
