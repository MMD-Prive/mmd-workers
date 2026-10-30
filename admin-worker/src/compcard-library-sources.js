import { ownerDriveAccessToken } from "./google-drive-owner-media.js";
import { boundedBytes, clean, fail, TYPES, digest, MAX_BYTES, checkFile, classification } from "./compcard-library-store.js";

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const DRIVE_ID = /^[A-Za-z0-9_-]{10,180}$/;
const SOURCE_ID = /^[A-Za-z0-9_-]{1,120}$/;
const authCache = new WeakMap();
const driveHttp = env => env.GOOGLE_DRIVE_HTTP?.fetch?.bind(env.GOOGLE_DRIVE_HTTP) || fetch.bind(globalThis);
export function driveRoots(env) {
  let roots;
  try { roots = JSON.parse(env.COMPCARD_DRIVE_ROOTS_JSON || "[]"); } catch { fail("drive_roots_not_configured",503); }
  if (!Array.isArray(roots) || roots.length > 10 || !roots.every(r=>DRIVE_ID.test(r.id) && clean(r.name))) fail("drive_roots_not_configured",503);
  return roots.map(r=>({id:r.id,name:clean(r.name),...classification(r.world,r.work_types)}));
}
async function driveJson(env, suffix) {
  let cached = authCache.get(env);
  if (!cached || cached.until < Date.now()) {
    cached = {token:await libraryDriveToken(env),until:Date.now()+50*60*1000}; authCache.set(env,cached);
  }
  const r = await driveHttp(env)(DRIVE + suffix,{headers:{authorization:"Bearer "+cached.token},redirect:"error",signal:AbortSignal.timeout(20000)});
  if (!r.ok) { if (r.status === 401) authCache.delete(env); fail(r.status === 404 ? "source_not_found" : "drive_access_unavailable",r.status === 404 ? 404 : 503); }
  return r.json();
}
async function libraryDriveToken(env) {
  if(env.GOOGLE_SERVICE_ACCOUNT_JSON)return ownerDriveAccessToken(env,driveHttp(env));
  if(!env.GOOGLE_DRIVE_CLIENT_ID||!env.GOOGLE_DRIVE_CLIENT_SECRET||!env.GOOGLE_DRIVE_REFRESH_TOKEN)fail("drive_credentials_not_configured",503);
  const http=driveHttp(env);
  const response=await http("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",client_id:env.GOOGLE_DRIVE_CLIENT_ID,client_secret:env.GOOGLE_DRIVE_CLIENT_SECRET,refresh_token:env.GOOGLE_DRIVE_REFRESH_TOKEN}),redirect:"error",signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.access_token)fail("drive_oauth_unavailable",503);
  const about=await http("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",{headers:{authorization:"Bearer "+data.access_token},redirect:"error",signal:AbortSignal.timeout(20000)});
  const identity=await about.json().catch(()=>null);
  const expected=String(env.COMPCARD_DRIVE_OWNER_EMAIL||"malemodel.bkk@gmail.com").trim().toLowerCase();
  if(!about.ok||String(identity?.user?.emailAddress||"").trim().toLowerCase()!==expected)fail("drive_account_mismatch",503);
  return data.access_token;
}
const metadata = (env,id) => driveJson(env,"/"+encodeURIComponent(id)+"?supportsAllDrives=true&fields=id,name,mimeType,parents,trashed,size,modifiedTime,version");
async function scopedFile(env,id) {
  if (!DRIVE_ID.test(id || "")) fail("drive_id_invalid");
  const roots = driveRoots(env); if (!roots.length) fail("drive_roots_not_configured",503);
  const file = await metadata(env,id); if (file.trashed) fail("source_not_found",404);
  let current = file; const path = [file.name], visited = new Set();
  for (let depth=0;depth<12;depth++) {
    const root = roots.find(r=>r.id===current.id);
    if (root) return {file,path:path.reverse().join(" / "),root};
    if (visited.has(current.id) || current.parents?.length !== 1) break;
    visited.add(current.id); current = await metadata(env,current.parents[0]);
    if (current.trashed || current.mimeType !== FOLDER) break;
    path.push(current.name);
  }
  fail("drive_file_outside_library",403);
}
export async function listDriveSource(env, query) {
  const roots = driveRoots(env), id = query.get("folder_id");
  if (!roots.length) fail("drive_roots_not_configured",503);
  if (!id) return {roots,files:[],next_cursor:null};
  const {file,path} = await scopedFile(env,id); if (file.mimeType !== FOLDER) fail("folder_required");
  const cursor = clean(query.get("cursor"),2000);
  const params = new URLSearchParams({q:`'${id}' in parents and trashed=false`,pageSize:"50",fields:"files(id,name,mimeType,size,modifiedTime),nextPageToken",supportsAllDrives:"true",includeItemsFromAllDrives:"true"});
  if (cursor) params.set("pageToken",cursor);
  const page = await driveJson(env,"?"+params);
  if (!Array.isArray(page.files) || (page.nextPageToken && page.nextPageToken === cursor)) fail("invalid_drive_page",503);
  return {roots,path,folder_id:id,files:page.files.filter(f=>f.mimeType===FOLDER || TYPES.has(f.mimeType)).map(f=>({id:f.id,name:f.name,folder:f.mimeType===FOLDER,content_type:f.mimeType,bytes:Number(f.size)||0,updated_at:f.modifiedTime||null})),next_cursor:page.nextPageToken||null};
}
export async function readDriveSource(env,id) {
  const {file,path,root} = await scopedFile(env,id);
  if (!TYPES.has(file.mimeType)) fail("file_type_not_supported",415);
  if (!Number(file.size) || Number(file.size)>MAX_BYTES) fail("file_too_large",413);
  const cached = authCache.get(env);
  const r = await driveHttp(env)(DRIVE+"/"+encodeURIComponent(id)+"?alt=media&supportsAllDrives=true",{headers:{authorization:"Bearer "+cached.token},redirect:"error",signal:AbortSignal.timeout(20000)});
  if (!r.ok) fail("drive_access_unavailable",503);
  const bytes = await boundedBytes(r.body);
  checkFile(bytes,file.mimeType);
  // The source may have changed during download; don't attach mixed metadata/bytes.
  const after = await metadata(env,id);
  if (after.version !== file.version || after.trashed || bytes.length !== Number(file.size)) fail("source_changed_reload",409);
  return {bytes,content_type:file.mimeType,name:file.name.replace(/\.[^.]+$/, ""),original_name:file.name,world:root.world,work_types:root.work_types,classification_source:"drive_root",source:{provider:"google_drive",ref:"drive:"+file.id,file_id:file.id,root_id:root.id,path,version:file.version||"",modified_at:file.modifiedTime||null}};
}
function jobBucket(env) {
  if (!env.JOB_BOARD_COMPCARDS?.get || !env.JOB_BOARD_COMPCARDS?.list) fail("job_board_storage_unavailable",503);
  return env.JOB_BOARD_COMPCARDS;
}
function validateRefs(job,app) { if (!SOURCE_ID.test(job||"") || !SOURCE_ID.test(app||"")) fail("job_board_reference_invalid"); }
async function readApplication(env,job,app) {
  validateRefs(job,app);
  const o=await jobBucket(env).get(`public-job-board/v2/applications/${job}/${app}.json`);
  if(!o) fail("source_not_found",404);
  const a=await o.json();
  if(a.schema!=="mmd_public_job_board_v2.application" || a.job_id!==job || a.application_ref!==app || a.submission_status!=="submitted") fail("source_not_found",404);
  return a;
}
export async function listJobBoardSource(env,query) {
  const cursor=clean(query.get("cursor"),2000);
  const page=await jobBucket(env).list({prefix:"public-job-board/v2/applications/",limit:30,...(cursor?{cursor}:{})});
  if(page.truncated && (!page.cursor || page.cursor===cursor)) fail("invalid_storage_cursor",503);
  const files=[];
  for(const o of page.objects) {
    const match=o.key.match(/^public-job-board\/v2\/applications\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\.json$/); if(!match)continue;
    const raw=await jobBucket(env).get(o.key); if(!raw)continue;
    const a=await raw.json();
    if(a.schema!=="mmd_public_job_board_v2.application" || a.submission_status!=="submitted" || a.job_id!==match[1] || a.application_ref!==match[2]) continue;
    for(const u of a.uploads||[]) {
      if(!TYPES.has(u.content_type)) continue;
      files.push({job_id:a.job_id,application_ref:a.application_ref,slot:u.slot,name:clean(a.applicant?.nickname)||a.application_ref,height_cm:a.applicant?.height_cm||null,weight_kg:a.applicant?.weight_kg||null,content_type:u.content_type,updated_at:a.updated_at,preview_url:`/v1/admin/compcards/job-board/file?job_id=${encodeURIComponent(a.job_id)}&application_ref=${encodeURIComponent(a.application_ref)}&slot=${u.slot}`});
    }
  }
  return {files,next_cursor:page.truncated?page.cursor:null};
}
export async function readJobBoardSource(env,query) {
  const job=query.get("job_id"),app=query.get("application_ref"),slot=Number(query.get("slot"));
  if(!Number.isInteger(slot)||slot<1||slot>12)fail("slot_invalid");
  const a=await readApplication(env,job,app),matches=(a.uploads||[]).filter(u=>u.slot===slot);
  if(matches.length!==1)fail("source_not_found",404); const u=matches[0];
  const expected=`public-job-board/v2/private-media/${job}/${app}/${slot}.${TYPES.get(u.content_type)}`;
  if(!TYPES.has(u.content_type)||u.key!==expected||!Number(u.bytes)||u.bytes>MAX_BYTES)fail("source_metadata_invalid",409);
  const o=await jobBucket(env).get(expected);
  if(!o||o.httpMetadata?.contentType!==u.content_type||o.customMetadata?.application_ref!==app||o.customMetadata?.job_id!==job||o.customMetadata?.sha256!==u.sha256)fail("source_metadata_invalid",409);
  const bytes=await boundedBytes(o.body);
  checkFile(bytes,u.content_type);
  if(bytes.length!==u.bytes || await digest(bytes)!==u.sha256)fail("source_changed_reload",409);
  return {bytes,content_type:u.content_type,name:clean(a.applicant?.nickname)||app,original_name:`${app}-${slot}.${TYPES.get(u.content_type)}`,height_cm:a.applicant?.height_cm||null,weight_kg:a.applicant?.weight_kg||null,metrics_source:"job_board_applicant",source:{provider:"job_board",ref:`job-board:${job}:${app}:${slot}`,job_id:job,application_ref:app,slot,modified_at:a.updated_at}};
}
