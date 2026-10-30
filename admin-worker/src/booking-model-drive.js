// Owner/admin Booking preview only. Never used by customer media routes.
import { libraryDriveToken } from './compcard-library-sources.js';
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
  const path='/__internal/model-drive/resolve',body=JSON.stringify({drive_folder_id:folder});
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
  const data=await r.json().catch(()=>null);
  if(!r.ok||!data?.ok||data.item?.drive_folder_id!==folder)fail('model_folder_unavailable',r.status>=500?503:409);
  const scope=String(record.fields.folder_scope_key||'');
  if(scope && scope!==data.item.folder_scope_key)fail('model_folder_scope_conflict',409);
  return {folder,audience:data.item.lane==='public'?'public':'private'};
}
async function client(env) {
  const oauth=env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const token=await libraryDriveToken(oauth?{...env,GOOGLE_SERVICE_ACCOUNT_JSON:undefined}:env),http=env.GOOGLE_DRIVE_HTTP?.fetch?.bind(env.GOOGLE_DRIVE_HTTP)||fetch.bind(globalThis);
  return async (suffix,headers={})=>{const r=await http(DRIVE+suffix,{headers:{authorization:'Bearer '+token,...headers},redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok && r.status!==206)fail('drive_media_unavailable',r.status===404?404:503);return r;};
}
async function metadata(read,id) {return (await read('/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields=id,mimeType,parents,trashed,size')).json();}
export async function listBookingDriveMedia(env,modelId,coverOnly=false) {
  const {folder,audience}=await canonical(env,modelId),read=await client(env);
  const queue=[{id:folder,depth:0}],visited=new Set(),items=[];let partial=false;
  while(queue.length && visited.size<40 && items.length<500) {
    const current=queue.shift();if(visited.has(current.id))continue;visited.add(current.id);
    const meta=await metadata(read,current.id);if(meta.trashed||meta.mimeType!==FOLDER|| (current.id!==folder && meta.parents?.length!==1))continue;
    let cursor='',pages=0;const seen=new Set();
    do {
      const q=new URLSearchParams({q:`'${current.id}' in parents and trashed=false`,pageSize:'100',fields:'files(id,mimeType,parents,trashed,size),nextPageToken',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});if(cursor)q.set('pageToken',cursor);
      const page=await (await read('?'+q)).json();if(!Array.isArray(page.files))fail('drive_inventory_unavailable');
      for(const f of page.files) {
        if(!ID.test(f.id)||f.trashed||f.parents?.length!==1||f.parents[0]!==current.id)continue;
        if(f.mimeType===FOLDER) {if(current.depth<4)queue.push({id:f.id,depth:current.depth+1});else partial=true;}
        else if(TYPES.has(f.mimeType)) {items.push({file_id:f.id,kind:f.mimeType.startsWith('video/')?'clip':'photo',audience,status:'source_only',preview_available:true}); if(coverOnly && !f.mimeType.startsWith('video/'))return {ok:true,items:[items.at(-1)],partial:false};}
      }
      cursor=page.nextPageToken||'';pages++;
      if(cursor && seen.has(cursor))fail('drive_inventory_incomplete');if(cursor)seen.add(cursor);
      if(items.length>=500||pages>=20){if(cursor)partial=true;break;}
    } while(cursor);
  }
  return {ok:true,items:items.slice(0,500),partial:partial||queue.length>0||items.length>500};
}
export async function readBookingDriveMedia(request,env,modelId,fileId) {
  if(!ID.test(fileId))fail('file_not_found',404);
  const {folder}=await canonical(env,modelId),read=await client(env),file=await metadata(read,fileId);
  if(file.trashed||!TYPES.has(file.mimeType)||!Number(file.size))fail('file_not_found',404);
  let current=file;const seen=new Set();let linked=false;
  for(let depth=0;depth<12;depth++) {
    if(current.id===folder){linked=true;break;}
    if(current.trashed||seen.has(current.id)||current.parents?.length!==1)break;
    seen.add(current.id);current=await metadata(read,current.parents[0]);if(current.mimeType!==FOLDER)break;
  }
  if(!linked)fail('file_not_linked',404);
  if(request.method==='HEAD')return new Response(null,{headers:{...HEADERS,'content-type':file.mimeType,'content-length':String(file.size)}});
  const range=request.headers.get('range');if(range&&!/^bytes=\d*-\d*$/.test(range))fail('invalid_range',416);
  const r=await read('/'+encodeURIComponent(fileId)+'?alt=media&supportsAllDrives=true',range?{range}:{});
  if(r.headers.get('content-type')?.split(';')[0]!==file.mimeType){await r.body?.cancel();fail('file_type_changed',409);}
  const headers={...HEADERS,'content-type':file.mimeType,'content-disposition':'inline','accept-ranges':'bytes'};
  for(const key of ['content-length','content-range'])if(r.headers.has(key))headers[key]=r.headers.get(key);
  return new Response(r.body,{status:r.status,headers});
}

export async function readBookingDriveCover(request,env,modelId) { const inventory=await listBookingDriveMedia(env,modelId,true);const photo=inventory.items.find(i=>i.kind==="photo");if(!photo)fail("photo_not_found",404);return readBookingDriveMedia(request,env,modelId,photo.file_id); }
