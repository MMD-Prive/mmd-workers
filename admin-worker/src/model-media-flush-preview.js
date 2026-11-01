import { stageMedia, storage, readBytes, reviewQueue, PREFIX, hash } from './new-model-production.mjs';
// Owner-triggered private staging and review intake. Never publishes media.
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { isOwnerActor } from "./owner-my-mmd-recovery-diagnostic.js";
import { libraryDriveToken } from "./compcard-library-sources.js";

export const MODEL_MEDIA_FLUSH_PREVIEW_PATH = "/v1/admin/model-media/flush-preview";
export const MODEL_MEDIA_SOURCE_EMAIL = "malemodel.bkk@gmail.com";
export const MODEL_MEDIA_SOURCE_ROOTS = Object.freeze([
  { key: "standard", label: "01 · Standard", lane: "catalogue", id: "1xKuBP9TFNXtT93rP7VUMhKlgmKPWYLm7" },
  { key: "premium", label: "02 · Premium", lane: "catalogue", id: "1vkOuwdLXc0jAOHmg9UWEIhkT5apUsVOH" },
  { key: "ems", label: "03 · EMs", lane: "catalogue", id: "146uQLhgyul_1dmEayC5JqOmL9OivQ5KD" },
  { key: "gws", label: "04 · GWs", lane: "catalogue", id: "1y3CjdMIj_BvLTpJY-9YIaLBZZUgTE_Pl" },
  { key: "travel", label: "05 · Travel", lane: "catalogue", id: "1I_qK-6opK7KKF4iF7Pg2ZZaM6JcXsYxj" },
  { key: "extreme", label: "06 · Extreme", lane: "catalogue", id: "1-naIuYuuwWtXQT4SIysFAUQpjMzVv-0c" },
  { key: "farang", label: "07 · Farang", lane: "catalogue", id: "1QNEEdwIokYxooXOf5IdW-GS75V5_Z5si" },
  { key: "up_country", label: "08 · Up Country", lane: "catalogue", id: "1VaX4eAgbOMJrizmB4h1p6_RN2SAvANhL" },
  { key: "new_entry", label: "New Entry · New Release", lane: "mmd_now", id: "1pULVWINaICROMQ3ozBvPh5SG1N5RH2Db" },
  { key: "mmd_recommend", label: "MMD Recommend", lane: "mmd_now", id: "1LJdpoVJzuw2xgPFEZa4A0bKwRKXmRcw9" },
  { key: "hot_cha", label: "Hot Cha", lane: "mmd_now", id: "1kzEAekqrtbjd4SDa-SyzKv4kCYbI8sRe" },
]);

// Synthetic fixture root remains available only through explicit test dependencies.
export const MODEL_MEDIA_TEST_ROOT = Object.freeze({key:"nmp_test",label:"NMP-TEST-20261101",lane:"catalogue",id:"1ylEy2w18qTfYWWY2iJYtEPT7HtFpCDyH"});
let flushAuthCache = null;
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const PROD_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const MEDIA_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4"]);
const HIDDEN_FOLDER = /^(?:review|hidden|archive|rejected|pending|draft|private\s*(?:pic|clip|video)|reference)(?:\b|[\s_-])/i;
const LIMITS = Object.freeze({ maxFolders: 4096, maxDepth: 16, maxPages: 1000, maxMedia: 10000 });
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

export function isModelMediaFlushPreviewRequest(request) {
  try { return new URL(request.url).pathname.replace(/\/+$/, "") === MODEL_MEDIA_FLUSH_PREVIEW_PATH; }
  catch { return false; }
}

const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const owner = email => String(email || "").trim().toLowerCase() === MODEL_MEDIA_SOURCE_EMAIL;

async function googleJson(path, params, token, http) {
  const url = new URL(DRIVE_API + path);
  for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, String(value));
  const response = await http(url.toString(), {
    headers: { authorization: "Bearer " + token, accept: "application/json" },
    redirect: "manual", signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Object.assign(Error("drive_read_failed"),{code:"drive_http_"+response.status});
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") throw Error("drive_malformed");
  return data;
}

async function scanRoot(source, token, http, candidates = null, checkpoint = null, pageBudget = Infinity) {
  const base = await googleJson("/files/" + encodeURIComponent(source.id), {
    supportsAllDrives: "true", fields: "id,name,mimeType,trashed,owners(emailAddress)",
  }, token, http);
  if (base.id !== source.id || base.trashed || base.mimeType !== FOLDER ||
    !Array.isArray(base.owners) || !base.owners.some(item => owner(item.emailAddress))) {
    return { key: source.key, label: source.label, lane: source.lane, state: "source_unverified", complete: false };
  }

  const queue = checkpoint?.queue || [{ id: source.id, depth: 0, visibility: "review", ancestry: [source.id] }];
  const seenFolders = new Set(checkpoint?.seenFolders || []), seenFiles = new Set(checkpoint?.seenFiles || []);
  let {images=0,videos=0,excludedFolders=0,unverifiedOwner=0,complete=true}=checkpoint || {};
  let pagesRead=0;
  while (queue.length && seenFolders.size < LIMITS.maxFolders && images + videos < LIMITS.maxMedia) {
    const folder = queue.shift();
    if (!folder || (seenFolders.has(folder.id) && !folder.cursor)) continue;
    seenFolders.add(folder.id);
    let cursor = folder.cursor || "";
    for (let page = folder.page || 0; page < LIMITS.maxPages; page++) {
      const data = await googleJson("/files", {
        q: "'" + folder.id.replace(/'/g, "\\'") + "' in parents and trashed=false",
        fields: "nextPageToken,files(id,name,mimeType,parents,trashed,owners(emailAddress),size,version,modifiedTime)",
        pageSize: "100", includeItemsFromAllDrives: "true", supportsAllDrives: "true",
        ...(cursor ? { pageToken: cursor } : {}),
      }, token, http);
      if (!Array.isArray(data.files)) throw Error("drive_list_malformed");
      for (const file of data.files) {
        if (!file || !file.id || file.trashed || !Array.isArray(file.parents) || !file.parents.includes(folder.id)) {
          complete = false; continue;
        }
        if (!Array.isArray(file.owners) || !file.owners.some(item => owner(item.emailAddress))) {
          unverifiedOwner++; continue;
        }
        if (file.mimeType === FOLDER) {
          if (HIDDEN_FOLDER.test(String(file.name || "")) && !/^(review|hidden)(?:\b|[\s_-])/i.test(String(file.name || ""))) { excludedFolders++; continue; }
          if (folder.depth < LIMITS.maxDepth && !seenFolders.has(file.id)) queue.push({ id: file.id, depth: folder.depth + 1, visibility: folder.visibility === "hidden" || /^hidden(?:\b|[\s_-])/i.test(file.name) ? "hidden" : "review", ancestry: [...folder.ancestry, file.id] });
          else complete = false;
        } else if (MEDIA_MIMES.has(file.mimeType) && !seenFiles.has(file.id)) {
          seenFiles.add(file.id);
          // Do not treat files named Hidden/Review as publishable candidates.
          if (HIDDEN_FOLDER.test(String(file.name || "")) && !/^(review|hidden)(?:\b|[\s_-])/i.test(String(file.name || ""))) { excludedFolders++; continue; }
          if (candidates) candidates.push({root_id:source.id,category:source.key,lane:source.lane,file_id:file.id,version:String(file.version || ""),mimeType:file.mimeType,size:Number(file.size),visibility:folder.visibility === "hidden" || /^hidden(?:\b|[\s_-])/i.test(file.name) ? "hidden" : "review",ancestry:folder.ancestry});
          if (file.mimeType.startsWith("image/")) images++;
          else videos++;
        }
        if (images + videos >= LIMITS.maxMedia) { complete = false; break; }
      }
      pagesRead++;
      const next = String(data.nextPageToken || "");
      if (!next) break;
      if (next === cursor) throw Error("drive_pagination_loop");
      cursor = next;
      if (page === LIMITS.maxPages - 1) complete = false;
      else if(pagesRead>=pageBudget){queue.unshift({...folder,cursor:next,page:page+1});break;}
      if (images + videos >= LIMITS.maxMedia) break;
    }
    if(pagesRead>=pageBudget && queue.length && seenFolders.size<LIMITS.maxFolders && images+videos<LIMITS.maxMedia) return {key:source.key,label:source.label,lane:source.lane,state:"scanning",complete:false,_scan:{queue,seenFolders:[...seenFolders],seenFiles:[...seenFiles],images,videos,excludedFolders,unverifiedOwner,complete}};
  }
  if (queue.length || unverifiedOwner > 0) complete = false;
  return {
    key: source.key, label: source.label, lane: source.lane,
    state: complete ? "inventory_checked" : "incomplete_scan",
    complete, images, videos, excluded_folders: excludedFolders,
    unverified_owner_items: unverifiedOwner, folders_scanned: seenFolders.size,
  };
}

async function flushDriveToken(env) {
  const keys = ["FLUSH_GOOGLE_DRIVE_CLIENT_ID", "FLUSH_GOOGLE_DRIVE_CLIENT_SECRET", "FLUSH_GOOGLE_DRIVE_REFRESH_TOKEN"];
  if(keys.some(key=>env[key])&&!keys.every(key=>typeof env[key]==="string"&&env[key].trim()))throw Object.assign(Error("flush_oauth_configuration_incomplete"),{code:"drive_credentials_not_configured"});
  // The owning Worker clones its runtime env for each request. Cache only a verified
  // token string, keyed by a hash of this FLUSH credential configuration.
  const config=keys.some(key=>env[key])?keys.map(key=>env[key]):[env.GOOGLE_SERVICE_ACCOUNT_JSON,env.GOOGLE_DRIVE_CLIENT_ID,env.GOOGLE_DRIVE_CLIENT_SECRET,env.GOOGLE_DRIVE_REFRESH_TOKEN];
  const cacheKey=await hash(JSON.stringify([MODEL_MEDIA_SOURCE_EMAIL,...config]));
  const cached=flushAuthCache;if(cached?.key===cacheKey&&cached.until>Date.now())return cached.token;
  if (!keys.some(key => env[key])) {const token=await libraryDriveToken(env);flushAuthCache={key:cacheKey,token,until:Date.now()+45*60000};return token;}
  // Only this intake uses the dedicated read-only OAuth client. Shared credentials are preserved.
  const token=await libraryDriveToken({...env, GOOGLE_SERVICE_ACCOUNT_JSON:"", COMPCARD_DRIVE_OWNER_EMAIL:MODEL_MEDIA_SOURCE_EMAIL,
    GOOGLE_DRIVE_CLIENT_ID:env.FLUSH_GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET:env.FLUSH_GOOGLE_DRIVE_CLIENT_SECRET,
    GOOGLE_DRIVE_REFRESH_TOKEN:env.FLUSH_GOOGLE_DRIVE_REFRESH_TOKEN});
  flushAuthCache={key:cacheKey,token,until:Date.now()+45*60000};return token;
}

export async function handleModelMediaFlushPreview(request, env = {}, deps = {}) {
  if (!isModelMediaFlushPreviewRequest(request)) return respond({ ok: false, error: "not_found" }, 404);
  const url = new URL(request.url);
  if (!PROD_ORIGINS.has(url.origin) || request.headers.get("origin") !== url.origin ||
    request.headers.has("authorization") || request.headers.has("x-confirm-key")) {
    return respond({ ok: false, error: "same_origin_owner_session_required" }, 403);
  }
  if (request.method !== "POST") return respond({ ok: false, error: "method_not_allowed" }, 405);
  const actor = await (deps.readActor || readCredentialBoundAdminActor)(request, env);
  if (!isOwnerActor(actor)) return respond({ ok: false, error: "owner_required" }, 403);
  const input = await request.json().catch(() => null);
  if (!input || !["preview_all", "stage_all", "review_queue"].includes(input.action) || Object.keys(input).some(k => !["action", "run_id"].includes(k)) || (input.run_id && !/^[a-f0-9-]{36}$/.test(input.run_id))) {
    return respond({ ok: false, error: "preview_action_required" }, 400);
  }
  const sourceRoots = deps.sourceRoots || MODEL_MEDIA_SOURCE_ROOTS.filter(source => source.lane === "catalogue");
  if (input.action === "review_queue") {
    try { return respond({ok:true,...await reviewQueue(env, {allowedRootIds:sourceRoots.map(source=>source.id)})}); }
    catch { return respond({ok:false,error:"review_queue_unavailable"},503); }
  }
  // Never silently switch to a fallback Google account when OAuth is unavailable.
  if (env.COMPCARD_DRIVE_OWNER_EMAIL && !owner(env.COMPCARD_DRIVE_OWNER_EMAIL)) {
    return respond({ ok: false, error: "source_account_mismatch" }, 503);
  }
  const http = deps.http || env.GOOGLE_DRIVE_HTTP?.fetch?.bind(env.GOOGLE_DRIVE_HTTP) || fetch;
  let phase = "oauth";
  try {
    let verifiedToken;
    const getToken=async()=>{
      if(verifiedToken)return verifiedToken;
      phase="oauth";
      const token=await (deps.getAccessToken || flushDriveToken)(env);
      // The default helper validates the account before caching the token.
      if(deps.getAccessToken){const about=await googleJson("/about",{fields:"user(emailAddress)"},token,http);if(!owner(about.user?.emailAddress))throw Object.assign(Error("account_mismatch"),{code:"drive_account_mismatch"});}
      verifiedToken=token;phase="scan";return token;
    };
    phase="scan";
    if(input.action === "stage_all") {
      phase="staging_manifest";
      const runId=input.run_id || crypto.randomUUID(),key=PREFIX+"runs/"+runId+".json";
      if(!await storage(env).head(key))await storage(env).put(key,JSON.stringify({actor_id:actor.id,created_at:Date.now(),candidates:[],rows:[],scan_index:0,scan_state:null}),{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/json",cacheControl:"private, no-store"}});
      return await continueStaging(env,actor,runId,getToken,http,sourceRoots);
    }
    const token=await getToken();
    const rows=[];
    for(let i=0;i<sourceRoots.length;i+=2) rows.push(...await Promise.all(sourceRoots.slice(i,i+2).map(async source=>{
      try{return await scanRoot(source,token,http);}catch{return {key:source.key,label:source.label,lane:source.lane,state:"source_unavailable",complete:false};}
    })));
    return respond({
      ok: true, schema: "mmd.per_ai_ops.manual_media_flush_preview.v1",
      mode: "preview_only", source_account: MODEL_MEDIA_SOURCE_EMAIL,
      state: rows.every(row => row.complete) ? "inventory_checked" : "partial",
      catalogue: rows.filter(row => row.lane === "catalogue"),
      mmd_now: [
        ...rows.filter(row => row.lane === "mmd_now"),
      ],
      writes: { drive: false, r2: false, airtable: false, cms: false, website: false },
      next: "owner_review_and_canonical_model_matching_required_before_ingest",
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    let code = String(error?.code || "");
    if(code==="drive_http_401"){flushAuthCache=null;code="drive_oauth_unavailable";}
    const reason = /^(?:drive_(?:credentials_not_configured|oauth_unavailable|account_mismatch|transport_(?:redirect|timeout|receiver|network)_unavailable)|private_staging_unavailable|review_registry_unavailable)$/.test(code) ? code : "dependency_unavailable";
    return respond({ ok: false, error: reason, failed_phase: phase, reason, mode: input.action === "stage_all" ? "private_staging" : "preview_only", writes: input.action === "stage_all" ? "unknown" : false }, 503);
  }
}


async function continueStaging(env, actor, runId, getToken, http, sourceRoots) {
  const key=PREFIX+"runs/"+runId+".json", obj=await storage(env).get(key);
  if(!obj) return respond({ok:false,error:"staging_run_missing"},404);
  const run=await obj.json();
  if(run.actor_id!==actor.id || !Number.isFinite(run.created_at) || run.created_at+86400000<Date.now()) return respond({ok:false,error:"staging_run_expired_or_forbidden"},409);
  if(!Array.isArray(run.candidates)||run.candidates.some(c=>!sourceRoots.some(root=>root.id===c.root_id)))return respond({ok:false,error:"source_scope_required"},403);
  const save=()=>storage(env).put(key,JSON.stringify(run),{onlyIf:{etagMatches:obj.etag},httpMetadata:{contentType:"application/json",cacheControl:"private, no-store"}});
  const changed=()=>respond({ok:true,mode:"private_staging",run_id:runId,continue_required:true,state:"retrying",retry_after_ms:500,total_candidates:run.candidates.length,completed_count:run.next_index||0,publication:false,checked_at:new Date().toISOString()});
  if(Number.isInteger(run.scan_index) && run.scan_index<sourceRoots.length) {
    const source=sourceRoots[run.scan_index];
    // One Drive list page per request; persist cursors before continuing in the UI.
    const row=await scanRoot(source,await getToken(),http,run.candidates,run.scan_state,1);
    run.scan_state=row._scan || null;delete row._scan;
    run.rows[run.scan_index]=row;
    if(!run.scan_state)run.scan_index++;
    if(!await save())return changed();
    return respond({ok:true,mode:"private_staging",run_id:runId,continue_required:true,state:"scanning",total_candidates:run.candidates.length,completed_count:0,results:[],catalogue:run.rows.filter(r=>r.lane==="catalogue"),mmd_now:[],source_scan_complete:false,publication:false,checked_at:new Date().toISOString()});
  }
  const results=[];let remaining=false, attempted=0,visited=0,retryAfter=0;
  run.failures ||= [];
  for(let index=run.next_index || 0;index<run.candidates.length;index++) {
    if(visited++>=8){remaining=true;break;}
    const candidate=run.candidates[index];
    // Completed receipts make retries and repeated clicks idempotent.
    const id=await hash(JSON.stringify([candidate.root_id,candidate.file_id,candidate.version,candidate.visibility]));
    const receiptObj=await storage(env).get(PREFIX+"receipts/"+id+".json");
    if(receiptObj){const receipt=await receiptObj.json();const head=await storage(env).head(receipt.key);if(receipt.id===id&&head?.customMetadata?.sha256===receipt.sha256&&head?.customMetadata?.intake_id===(receipt.canonical_intake_id||id)){run.next_index=index+1;continue;}}
    if(attempted>=1){remaining=true;break;} attempted++;
    try {
      results.push(await stageMedia(env,candidate,actor,async c=>{
        if(!c.version)throw Error("source_version_missing");
        const token=await getToken(),deadline=AbortSignal.timeout(20000);
        const metadata=async id=>{const r=await http(DRIVE_API+"/files/"+encodeURIComponent(id)+"?fields=id,mimeType,size,version,parents,trashed,owners(emailAddress)",{headers:{authorization:"Bearer "+token},redirect:"manual",signal:deadline});if(!r.ok)throw Object.assign(Error("drive_read_failed"),{code:"drive_http_"+r.status});return r.json();};
        const all=await Promise.all([...c.ancestry.map(metadata),metadata(c.file_id)]);
        for(let i=0;i<c.ancestry.length;i++) {
          const f=all[i];
          if(f.id!==c.ancestry[i]||f.trashed||f.mimeType!==FOLDER||!f.owners?.some(x=>owner(x.emailAddress)) || (i>0&&!f.parents?.includes(c.ancestry[i-1])))throw Error("source_scope_changed");
        }
        const before=all.at(-1);
        const matches=f=>f.id===c.file_id&&!f.trashed&&String(f.version)===c.version&&f.mimeType===c.mimeType&&Number(f.size)===c.size&&f.parents?.includes(c.ancestry.at(-1))&&f.owners?.some(x=>owner(x.emailAddress));
        if(!matches(before))throw Error("source_changed");
        const response=await http(DRIVE_API+"/files/"+encodeURIComponent(c.file_id)+"?alt=media",{headers:{authorization:"Bearer "+token},redirect:"manual",signal:deadline});
        if(!response.ok)throw Object.assign(Error("drive_read_failed"),{code:"drive_http_"+response.status});
        const bytes=await readBytes(response,c.size,c.mimeType);
        if(!matches(await metadata(c.file_id)))throw Error("source_changed");
        return bytes;
      },{deferRegistry:true}));
    } catch(error) {
      if(error?.code==="drive_http_401")flushAuthCache=null;
      const retry=/^(?:drive_http_(?:401|429|5\d\d)|drive_.*unavailable|review_registry_unavailable|staging_claim_lost)$/.test(error?.code||"")||['AbortError','TimeoutError','TypeError'].includes(error?.name);
      results.push({id,state:retry?"retry_later":"failed_retry_required"});
    }
    const result=results.at(-1);
    if(["prepared_private","busy_or_recovery_required","retry_later"].includes(result?.state)){remaining=true;retryAfter=result.retry_after_ms || (result.state==='retry_later'?3000:0);break;}
    if(results.some(r=>r.id===id&&!["pending_review","already_staged"].includes(r.state))&&!run.failures.includes(id))run.failures.push(id);
    run.next_index=index+1;
  }
  if(!await save())return changed();
  const failures=run.failures.length>0;
  return respond({ok:true,mode:"private_staging",run_id:runId,continue_required:remaining,retry_after_ms:retryAfter,state:remaining?"staging":failures?"partial_failure":"pending_review",failed_count:run.failures.length,total_candidates:run.candidates.length,completed_count:run.next_index || 0,results,
    catalogue:run.rows.filter(r=>r.lane==="catalogue"),mmd_now:run.rows.filter(r=>r.lane==="mmd_now"),
    source_scan_complete:run.rows.every(r=>r.complete),publication:false,checked_at:new Date().toISOString()});
}
