// Signed internal Model directory media reader. Folder authority is resolved by the caller.
const DRIVE='https://www.googleapis.com/drive/v3/files';
const ID=/^[A-Za-z0-9_-]{10,180}$/;
const TYPES=new Set(['image/jpeg','image/png','image/webp','image/avif','image/heic','image/heif','video/mp4','video/webm','video/quicktime']);
const FOLDER='application/vnd.google-apps.folder';
const HEADERS={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow','cross-origin-resource-policy':'same-origin','x-mmd-route-owner':'admin-worker'};
const fail=(code,status=503)=>{throw Object.assign(new Error(code),{status,code});};
function client(token) { return async(suffix,headers={})=>{const r=await fetch(DRIVE+suffix,{headers:{authorization:'Bearer '+token,...headers},redirect:'manual',signal:AbortSignal.timeout(20000)});if(!r.ok)fail('drive_media_unavailable',r.status===404?404:503);return r;}; }
async function metadata(read,id) {return (await read('/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields=id,mimeType,parents,trashed,size')).json();}
export async function listModelFolderMedia(accessToken,folder,audience,coverOnly=false) {
  const read=client(accessToken);
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
export async function readModelFolderMedia(request,accessToken,folder,fileId) {
  if(!ID.test(fileId))fail('file_not_found',404);
  const read=client(accessToken),file=await metadata(read,fileId);
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

