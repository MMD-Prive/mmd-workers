// Owner/admin Booking preview only. Never used by customer media routes.
const DRIVE='https://www.googleapis.com/drive/v3/files';
const ID=/^[A-Za-z0-9_-]{10,180}$/;
const TYPES=new Set(['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif','video/mp4','video/webm','video/quicktime']);
const FOLDER='application/vnd.google-apps.folder';
const HEADERS={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow','cross-origin-resource-policy':'same-origin','x-mmd-route-owner':'admin-worker'};
const fail=(code,status=503)=>{throw Object.assign(new Error(code),{status,code});};
export function bookingDriveFolder(fields={}) {
  const values=[fields.drive_folder_id];
  for(const key of ['unique_key','folder_scope_key']) { const match=String(fields[key]||'').match(/^(?:(?:public|private|exclusive):)?drive:([A-Za-z0-9_-]{10,180})$/); if(match)values.push(match[1]); }
  if(fields.drive_folder_url) { try {const u=new URL(fields.drive_folder_url);if(u.hostname==='drive.google.com')values.push(u.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/)?.[1]||u.searchParams.get('id'));}catch{} }
  const ids=[...new Set(values.filter(v=>typeof v==='string' && v.trim()).map(v=>v.trim()))];
  return ids.length===1 && ID.test(ids[0]) ? ids[0] : '';
}
async function canonical(env,modelId) {
  if(!/^rec[a-zA-Z0-9]+$/.test(modelId))fail('model_not_found',404);
  const base='https://api.airtable.com/v0/'+encodeURIComponent(env.AIRTABLE_BASE_ID)+'/'+encodeURIComponent(env.AIRTABLE_TABLE_MODELS_ID||env.AIRTABLE_TABLE_MODELS||'Models');
  const read=async suffix=>{const r=await fetch(base+suffix,{headers:{authorization:'Bearer '+env.AIRTABLE_API_KEY},signal:AbortSignal.timeout(20000)});if(!r.ok)fail('model_source_unavailable');return r.json();};
  const record=await read('/'+modelId),folder=bookingDriveFolder(record.fields);
  if(record.id!==modelId||!folder)fail('model_folder_unlinked',404);
  const q=new URLSearchParams({pageSize:'100',filterByFormula:`OR({drive_folder_id}="${folder}",{unique_key}="drive:${folder}",{folder_scope_key}="public:drive:${folder}",{folder_scope_key}="private:drive:${folder}",{folder_scope_key}="exclusive:drive:${folder}")`});
  const matches=await read('?'+q);
  if(matches.offset||!Array.isArray(matches.records)||matches.records.length!==1||matches.records[0].id!==modelId)fail('model_folder_conflict',409);
  // Recheck ancestry using the existing signed Model directory, never a browser URL.
  const r=await directory(env,'/__internal/model-drive/resolve',{drive_folder_id:folder});
  const data=await r.json().catch(()=>null);
  if(!r.ok||!data?.ok||data.item?.drive_folder_id!==folder)fail('model_folder_unavailable',r.status>=500?503:409);
  const scope=String(record.fields.folder_scope_key||'');
  if(scope && scope!==data.item.folder_scope_key)fail('model_folder_scope_conflict',409);
  return {folder,audience:data.item.lane==='public'?'public':'private'};
}
async function directory(env,path,payload) {
  const body=JSON.stringify(payload);
  let r;
  if(env.MODEL_DRIVE_DIRECTORY?.fetch) r=await env.MODEL_DRIVE_DIRECTORY.fetch(new Request('https://model-drive-directory.internal'+path,{method:'POST',headers:{'content-type':'application/json'},body}));
  else {
    const ts=String(Math.floor(Date.now()/1000)),enc=new TextEncoder();
    const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
    const hash=hex(await crypto.subtle.digest('SHA-256',enc.encode(body)));
    const key=await crypto.subtle.importKey('raw',enc.encode(env.MODEL_DRIVE_DIRECTORY_SECRET||env.AIRTABLE_API_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const sig=hex(await crypto.subtle.sign('HMAC',key,enc.encode(`${ts}\nPOST\n${path}\n\n${hash}`)));
    r=await fetch('https://member-pages-worker.malemodel-bkk.workers.dev'+path,{method:'POST',headers:{'content-type':'application/json','x-mmd-model-drive-ts':ts,'x-mmd-model-drive-signature':sig},body,redirect:'manual',signal:AbortSignal.timeout(20000)});
  }
  return r;
}
export async function listBookingDriveMedia(env,modelId,coverOnly=false) {
  const {folder}=await canonical(env,modelId);
  const r=await directory(env,'/__internal/model-drive/admin-media-list',{drive_folder_id:folder,cover_only:coverOnly});
  const data=await r.json().catch(()=>null);if(!r.ok || data?.ok!==true || !Array.isArray(data.items))fail('drive_media_unavailable',r.status===404?404:503);return data;
}
export async function readBookingDriveMedia(request,env,modelId,fileId) {
  if(!ID.test(fileId))fail('file_not_found',404);
  const {folder}=await canonical(env,modelId);
  const r=await directory(env,'/__internal/model-drive/admin-media-file',{drive_folder_id:folder,file_id:fileId,head:request.method==='HEAD',range:request.headers.get('range')||''});
  if(!r.ok)fail('drive_media_unavailable',[404,409,416].includes(r.status)?r.status:503);
  const headers=new Headers(HEADERS);for(const key of ['content-type','content-length','content-range','accept-ranges'])if(r.headers.has(key))headers.set(key,r.headers.get(key));headers.set('content-disposition','inline');
  return new Response(request.method==='HEAD'?null:r.body,{status:r.status,headers});
}
export async function readBookingDriveCover(request,env,modelId) {const d=await listBookingDriveMedia(env,modelId,true);const photo=d.items.find(i=>i.kind==='photo');if(!photo)fail('photo_not_found',404);return readBookingDriveMedia(request,env,modelId,photo.file_id);}
