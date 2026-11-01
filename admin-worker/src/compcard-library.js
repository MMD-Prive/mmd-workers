import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { bucket, boundedBytes, clean, fail, importEntry, listEntries, readEntry, updateEntry, project, PREFIX, digest, checkFile, normalizeName } from "./compcard-library-store.js";
import { driveRoots, listDriveSource, readDriveSource, listJobBoardSource, readJobBoardSource } from "./compcard-library-sources.js";
import { renderCompcardLibrary } from "./compcard-library-page.js";

export const PAGE = "/internal/admin/compcards";
export const API = "/v1/admin/compcards";
const ORIGINS = new Set(["https://mmdbkk.com","https://www.mmdbkk.com"]);
const HEADERS = {"cache-control":"private, no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow","x-mmd-route-owner":"admin-worker"};
const json = (body,status=200) => Response.json(body,{status,headers:HEADERS});
export function isCompcardLibraryRequest(request) {
  const p=new URL(request.url).pathname.replace(/\/+$/,"");
  return p===PAGE || p===API || p.startsWith(API+"/");
}
export async function handleCompcardLibrary(request,env={}) {
  const url=new URL(request.url),p=url.pathname.replace(/\/+$/,"");
  try {
    if(!ORIGINS.has(url.origin) || (request.headers.has("origin") && request.headers.get("origin")!==url.origin))fail("forbidden_origin",403);
    if(request.headers.has("authorization") || request.headers.has("x-confirm-key"))fail("browser_admin_session_required",403);
    const actor=await readCredentialBoundAdminActor(request,env);
    if(!actor) {
      if(p===PAGE && request.method==="GET")return new Response(null,{status:303,headers:{...HEADERS,location:"/internal/admin/login?next="+encodeURIComponent(PAGE)}});
      fail("unauthorized",401);
    }
    if(!["owner","admin"].includes(actor.role))fail("admin_required",403);
    if(!["GET","HEAD","POST","PATCH"].includes(request.method))fail("method_not_allowed",405);
    if(["POST","PATCH"].includes(request.method) && request.headers.get("origin")!==url.origin)fail("write_origin_required",403);
    if(p===PAGE) {
      if(!["GET","HEAD"].includes(request.method))fail("method_not_allowed",405);
      const nonce=crypto.randomUUID();
      return new Response(request.method==="HEAD"?null:renderCompcardLibrary(nonce),{headers:{...HEADERS,"content-type":"text/html; charset=utf-8","content-security-policy":`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`}});
    }
    if(request.method==="HEAD")return new Response(null,{headers:HEADERS});
    if(request.method==="GET") {
      if(p===API)return json({ok:true,...await listEntries(env,url.searchParams)});
      if(p===API+"/config")return json({ok:true,drive_roots:driveRoots(env),job_board_available:Boolean(env.JOB_BOARD_COMPCARDS?.get)});
      if(p===API+"/drive")return json({ok:true,...await listDriveSource(env,url.searchParams)});
      if(p===API+"/job-board")return json({ok:true,...await listJobBoardSource(env,url.searchParams)});
      if(p===API+"/models")return json({ok:true,items:await findModels(env,url.searchParams.get("q"))});
      if(p===API+"/job-board/file")return fileResponse(await readJobBoardSource(env,url.searchParams));
      if(p===API+"/drive/file")return fileResponse(await readDriveSource(env,url.searchParams.get("file_id")));
      const match=p.match(/^\/v1\/admin\/compcards\/([a-f0-9]{32})(?:\/(file|history))?$/);
      if(match) {
        const {item,etag}=await readEntry(env,match[1]);
        if(match[2]==="file") {
          const expected=PREFIX+"blobs/"+item.sha256+"."+({"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"}[item.content_type]);
          if(item.blob_key!==expected)fail("stored_record_invalid",503);
          const object=await bucket(env).get(expected);
          if(!object || object.size!==item.bytes || object.customMetadata?.sha256!==item.sha256 || object.httpMetadata?.contentType!==item.content_type)fail("file_unavailable",503);
          return fileResponse({body:object.body,content_type:item.content_type});
        }
        if(match[2]==="history") {
          const list=await bucket(env).list({prefix:PREFIX+"history/"+item.id+"/",limit:50,...(url.searchParams.get("cursor")?{cursor:url.searchParams.get("cursor")}:{})});
          const rows=await Promise.all(list.objects.map(async o=>{const raw=await bucket(env).get(o.key);return raw?project(await raw.json(),o.etag):null;}));
          return json({ok:true,items:rows.filter(Boolean),next_cursor:list.truncated?list.cursor:null});
        }
        return json({ok:true,item:project(item,etag)});
      }
    }
    if(request.method==="POST" && p===API+"/upload") {
      let name; try{name=decodeURIComponent(request.headers.get("x-compcard-filename")||"");}catch{fail("file_name_invalid");}
      name=clean(name,240); if(!name)fail("file_name_required");
      const bytes=await boundedBytes(request.body),mime=(request.headers.get("content-type")||"").split(";")[0];
      checkFile(bytes,mime);
      const result=await importEntry(env,{bytes,content_type:mime,name:name.replace(/\.[^.]+$/, ""),original_name:name,source:{provider:"owner_upload",ref:"upload:"+await digest(bytes)}},actor);
      return json({ok:true,...result},result.duplicate?200:201);
    }
    if(request.method==="POST" && p===API+"/import") {
      const input=await readJson(request);
      const file=input.provider==="google_drive"?await readDriveSource(env,input.file_id)
        :input.provider==="job_board"?await readJobBoardSource(env,new URLSearchParams({job_id:input.job_id,application_ref:input.application_ref,slot:String(input.slot)})):fail("source_invalid");
      const result=await importEntry(env,file,actor);
      return json({ok:true,...result},result.duplicate?200:201);
    }
    if(request.method==="PATCH" && /^\/v1\/admin\/compcards\/[a-f0-9]{32}$/.test(p)) {
      const input=await readJson(request);
      const model=input.model_id?await getModel(env,input.model_id):null;
      return json({ok:true,item:await updateEntry(env,p.split("/").pop(),input,actor,model)});
    }
    fail("not_found",404);
  } catch(e) {return json({ok:false,error:e.code||"compcard_library_unavailable"},e.status||503);}
}
async function readJson(request) {
  if((request.headers.get("content-type")||"").split(";")[0]!=="application/json")fail("json_required",415);
  try{const b=JSON.parse(new TextDecoder().decode(await boundedBytes(request.body,16000)));if(!b||Array.isArray(b)||typeof b!=="object")fail("invalid_json");return b;}
  catch(e){if(e.code)throw e;fail("invalid_json");}
}
function fileResponse(file) {
  return new Response(file.body||file.bytes,{headers:{...HEADERS,"content-type":file.content_type,"content-disposition":file.content_type==="application/pdf"?"attachment; filename=compcard.pdf":"inline","content-security-policy":"default-src 'none'; sandbox"}});
}
async function modelRequest(env,suffix) {
  if(!env.AIRTABLE_API_KEY||!env.AIRTABLE_BASE_ID)fail("model_registry_unavailable",503);
  const table=env.AIRTABLE_TABLE_MODELS_ID||env.AIRTABLE_TABLE_MODELS||"Models";
  const r=await (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP)||fetch)(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}${suffix}`,{headers:{authorization:"Bearer "+env.AIRTABLE_API_KEY},signal:AbortSignal.timeout(20000)});
  if(!r.ok)fail(r.status===404?"model_not_found":"model_registry_unavailable",r.status===404?404:503);
  return r.json();
}
const numeric=v=>v!==null&&v!==""&&v!==undefined&&Number.isFinite(Number(v))?Number(v):null;
function modelView(r) {
  const f=r.fields||{};
  return {id:r.id,name:clean(f.working_name||f.nickname),code:clean(f.unique_key),height_cm:numeric(f.height_cm),weight_kg:numeric(f.weight_kg),status:clean(f.status),orientation:clean(f.orientation_label),work_format:clean(f.private_work_format),snapshot_at:new Date().toISOString()};
}
async function getModel(env,id) {
  if(!/^rec[A-Za-z0-9]{14}$/.test(id))fail("model_id_invalid");
  const r=await modelRequest(env,"/"+id);if(r.id!==id)fail("model_not_found",404);return modelView(r);
}
export async function findModels(env,value) {
  const q=clean(value,100);if(!q)return [];
  const needle=JSON.stringify(q.toLowerCase()),params=new URLSearchParams({pageSize:"25",filterByFormula:`OR(FIND(${needle},LOWER({working_name})),FIND(${needle},LOWER({nickname})),FIND(${needle},LOWER({unique_key})))`});
  const r=await modelRequest(env,"?"+params);if(!Array.isArray(r.records))fail("model_registry_unavailable",503);
  return r.records.map(modelView).map(m=>({...m,exact_name_match:normalizeName(m.name)===normalizeName(q)}));
}
