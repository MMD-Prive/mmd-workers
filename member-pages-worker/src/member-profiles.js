const PREFIX = "/member/api/liff/profiles";
const APPLICATIONS = "tblwUa8ySWln8OfaJ";
const ASSETS = "tblEhg3dsFzPERpNQ";
const F = {type:"fld3KMefCywUTNIoQ",review:"fldInXMklAz53CiCq",intake:"fldHk2h9Rf6g5UlZw",payload:"fldJ9ldETtMF2Qbqf",name:"fldUIqNSM6Z9dK8Tj",application:"fldE5jq01JlYtvSP7",model:"fldBPLNmVfbfjsNeN"};
const A = {id:"fldSKeoWClypsbPNF",application:"fldPCr17XtTGH52BZ",kind:"fldGmoadvfKK2NHJn",bucket:"fldOy0nJXvYH1zzrL",key:"fldGTJmeQkiSD4NEP",upload:"fldDhx8xsUUFB8D8N",review:"fldJIwNkFsNKuhgp1",type:"fldE0qlrPfZXzTjnp"};
const MEMBER_CAPABILITIES = new Set(["public_member","red_card","private_standard","private_premium","vip","svip","black_card"]);
const headers = {"cache-control":"private, no-store, max-age=0",vary:"Cookie","x-content-type-options":"nosniff","referrer-policy":"no-referrer","cross-origin-resource-policy":"same-origin"};
const text = value => String(value ?? "").trim();
const choice = value => text(value?.name || value);
const slug = value => text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ก-๙]+/g,"-").replace(/^-+|-+$/g,"");
function object(value) { try { const p = typeof value === "string" ? JSON.parse(value) : value; return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch { return {}; } }
function json(value,status=200) { return Response.json(value,{status,headers}); }
function error(code,status) { return json({ok:false,error:{code}},status); }

export function isMemberProfilesRequest(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/,"");
  return path === PREFIX || path.startsWith(`${PREFIX}/`);
}

// Dependencies are the same canonical session and entitlement readers used by
// the existing member runtime. No browser identity or tier is accepted here.
export async function handleMemberProfiles(request,env,{readSession,readEntitlement}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/,"");
  if (!isMemberProfilesRequest(request)) return error("NOT_FOUND",404);
  if (!["GET","HEAD"].includes(request.method)) return error("METHOD_NOT_ALLOWED",405);
  if (url.search || (request.headers.get("origin") && request.headers.get("origin") !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return error("REQUEST_NOT_ALLOWED",403);
  try {
    const identity = await readSession(request,env);
    if (!identity?.lineUserId) return error("MEMBER_SESSION_REQUIRED",401);
    const entitlement = await readEntitlement(env,{line_user_id:identity.lineUserId});
    if (entitlement?.source_status !== "verified" || entitlement?.fail_closed !== true) return error("MEMBER_STATUS_UNAVAILABLE",503);
    if (entitlement.member_blocked === true || !entitlement.capability_state?.active?.some(value=>MEMBER_CAPABILITIES.has(value))) return error("ACTIVE_MEMBERSHIP_REQUIRED",403);
    const profiles = await loadProfiles(env);
    if (path === PREFIX) {
      const visible = [];
      for (const profile of profiles) if (await loadAsset(env,profile)) visible.push(profile);
      const response = json({ok:true,items:visible.map(p=>({slug:p.slug,display_name:p.name,image_url:`${PREFIX}/${encodeURIComponent(p.slug)}/photo`,audience_visibility:"mmd_members"}))});
      return request.method === "HEAD" ? new Response(null,{headers:response.headers}) : response;
    }
    const match = new RegExp(`^${PREFIX}/([^/]+)/photo$`).exec(path);
    if (!match) return error("NOT_FOUND",404);
    const profile = profiles.find(p=>p.slug === decodeURIComponent(match[1]));
    if (!profile) return error("PROFILE_UNAVAILABLE",404);
    const asset = await loadAsset(env,profile);
    if (!asset) return error("PHOTO_UNAVAILABLE",404);
    if (!env.PUBLIC_MODEL_UPLOADS_R2?.get) return error("PHOTO_STORAGE_UNAVAILABLE",503);
    const image = await env.PUBLIC_MODEL_UPLOADS_R2.get(asset.key);
    if (!image) return error("PHOTO_UNAVAILABLE",404);
    return new Response(request.method === "HEAD" ? null : image.body,{headers:{...headers,"content-type":asset.type,"content-disposition":"inline"}});
  } catch { return error("MEMBER_PROFILES_UNAVAILABLE",503); }
}

async function list(env,table,fields,formula) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("registry_unavailable");
  const records = []; let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${table}`);
    url.searchParams.set("returnFieldsByFieldId","true");
    url.searchParams.set("pageSize","100");
    for (const field of fields) url.searchParams.append("fields[]",field);
    url.searchParams.set("filterByFormula",formula);
    if (offset) url.searchParams.set("offset",offset);
    const req = new Request(url,{headers:{Authorization:`Bearer ${env.AIRTABLE_API_KEY}`},signal:AbortSignal.timeout(10000)});
    const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
    if (!response.ok) throw new Error("registry_unavailable");
    const payload = await response.json();
    if (!Array.isArray(payload.records)) throw new Error("registry_unavailable");
    records.push(...payload.records); offset = text(payload.offset);
    if (offset && records.length >= 500) throw new Error("registry_incomplete");
  } while(offset);
  return records;
}

async function loadProfiles(env) {
  const records = await list(env,APPLICATIONS,Object.values(F),"{application_type}='public_model'");
  const result = [];
  for (const record of records) {
    const f = record.fields || {}; const payload = object(f[F.payload]); const grant = object(payload.mmd_member_profile);
    const models = Array.isArray(f[F.model]) ? f[F.model] : [];
    const linked = models.map(value=>text(value?.id || value));
    if (choice(f[F.type]) !== "public_model" || choice(f[F.review]) !== "accepted" || choice(f[F.intake]) !== "approved") continue;
    if (grant.approved !== true || grant.approved_by !== "per" || !Number.isFinite(Date.parse(grant.approved_at)) || grant.audience !== "mmd_members") continue;
    if (payload.consent !== true || linked.length !== 1 || linked[0] !== grant.canonical_model_id || !/^rec[a-zA-Z0-9]+$/.test(linked[0])) continue;
    if (!/^pmua_[A-Za-z0-9]+$/.test(grant.asset_id)) continue;
    const name = text(f[F.name]); const key = slug(name);
    if (!name || !key) continue;
    result.push({slug:key,name,application:text(f[F.application]),asset_id:grant.asset_id,payload});
  }
  // Duplicate working names never resolve to an arbitrary person's photo.
  return result.filter(p=>result.filter(other=>other.slug===p.slug).length===1);
}

async function loadAsset(env,profile) {
  const rows = await list(env,ASSETS,Object.values(A),`{asset_id}='${profile.asset_id}'`);
  if (rows.length !== 1) return null;
  const f = rows[0].fields || {}; const key = text(f[A.key]); const type = text(f[A.type]);
  if (text(f[A.id]) !== profile.asset_id || text(f[A.application]) !== profile.application || choice(f[A.kind]) !== "photo" || choice(f[A.review]) !== "approved" || choice(f[A.upload]) !== "attached") return null;
  if (text(f[A.bucket]) !== "mmd-private-public-model-uploads" || !["image/jpeg","image/png","image/webp"].includes(type)) return null;
  const session = text(profile.payload.upload_session_id);
  const uploads = Array.isArray(profile.payload.uploads) ? profile.payload.uploads : [];
  const match = /^public-model\/v1\/\d{4}\/\d{2}\/\d{2}\/(pmu_[A-Za-z0-9]+)\/(pmu_ref_[A-Za-z0-9]+)\.(jpg|png|webp)$/.exec(key);
  if (!match || match[1] !== session || !uploads.some(upload=>upload.kind === "photo" && upload.upload_ref === match[2])) return null;
  return {key,type};
}
