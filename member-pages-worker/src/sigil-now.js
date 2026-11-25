// SĪGIL NOW lives in an independent private R2 bucket. The public Webflow CMS
// never contains or serves this feed, and every cover request rechecks access.
const ROOT = "sigil-now/v1";
const INDEX = ROOT + "/index.json";
const GUARD_SCHEMA = "my_mmd_entitlement_resolver_v1";
const PRIVATE_ENVELOPES = new Set(["standard", "premium", "vip", "svip", "black_card"]);
const ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const TYPES = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" };
const MAX_INDEX = 65536;
const MAX_IMAGE = 5 * 1024 * 1024;
const HEADERS = { "cache-control": "private, no-store, max-age=0", vary: "Cookie", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cross-origin-resource-policy": "same-origin" };
const json = (body, status = 200) => Response.json(body, {status, headers: HEADERS});
const error = (code, status) => json({ok:false,error:{code}},status);
const clean = (value, max) => typeof value === "string" ? value.trim().slice(0,max) : "";

export function projectSigilNowAccess(snapshot) {
  if (snapshot?.source_status !== "verified" || snapshot?.schema_version !== GUARD_SCHEMA || snapshot?.fail_closed !== true) return "unavailable";
  if (snapshot.member_blocked !== false || snapshot.fast_trust?.active === true) return "denied";
  if (!PRIVATE_ENVELOPES.has(snapshot.access?.private_visibility_envelope) || snapshot.access?.new_model_reveals_allowed !== true) return "denied";
  return "allowed";
}

function validPost(item, now) {
  if (!item || item.published !== true || typeof item.id !== "string" || !ID.test(item.id)) return null;
  const title = clean(item.title,256), summary = clean(item.summary,800), publishedAt = clean(item.published_at,40);
  const time = Date.parse(publishedAt);
  if (!title || !Number.isFinite(time) || time > now) return null;
  const ext = clean(item.cover_extension,4);
  if (ext && !Object.hasOwn(TYPES,ext)) return null;
  return {id:item.id,title,summary,published_at:publishedAt,cover_extension:ext,image_alt:clean(item.image_alt,160)};
}

async function loadPublished(bucket, now = Date.now()) {
  const object = await bucket.get(INDEX);
  if (!object || !Number.isSafeInteger(object.size) || object.size > MAX_INDEX || object.size <= 0) throw Error("index_unavailable");
  const data = JSON.parse(await object.text());
  if (data?.schema !== "sigil_now_v1" || !Array.isArray(data.items) || data.items.length > 100) throw Error("index_invalid");
  const counts = new Map();
  for (const row of data.items) if (typeof row?.id === "string") counts.set(row.id,(counts.get(row.id)||0)+1);
  return data.items.map(row=>validPost(row,now)).filter(row=>row && counts.get(row.id) === 1)
    .sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));
}
const imageKey = item => ROOT + "/covers/" + item.id + "." + item.cover_extension;
const coverUrl = (path,id) => path + "?world=sigil&cover=" + encodeURIComponent(id);

export async function handleSigilNow(request,env,session,readEntitlement) {
  const target = new URL(request.url);
  const origin = request.headers.get("origin");
  if ((origin && origin !== target.origin) || request.headers.get("sec-fetch-site") === "cross-site") return error("REQUEST_NOT_ALLOWED",403);
  const params = target.searchParams;
  if (params.getAll("world").length !== 1 || params.get("world") !== "sigil" ||
      params.getAll("cover").length > 1 || params.getAll("limit").length > 1 ||
      [...params.keys()].some(key=>!["world","cover","limit"].includes(key)) ||
      (params.has("cover") && (params.has("limit") || !ID.test(params.get("cover"))))) return error("INVALID_SELECTOR",400);
  if (typeof readEntitlement !== "function") return error("PRIVATE_ACCESS_UNAVAILABLE",503);
  let access;
  try { access = projectSigilNowAccess(await readEntitlement(env,{line_user_id:session.lineUserId})); }
  catch { return error("PRIVATE_ACCESS_UNAVAILABLE",503); }
  if (access === "unavailable") return error("PRIVATE_ACCESS_UNAVAILABLE",503);
  if (access !== "allowed") return error("PRIVATE_ACCESS_REQUIRED",403);
  const bucket = env.SIGIL_NOW_PRIVATE_R2;
  if (!bucket?.get || typeof bucket.get !== "function") return error("PRIVATE_FEED_UNAVAILABLE",503);
  try {
    const published = await loadPublished(bucket);
    if (params.has("cover")) {
      const item = published.find(row=>row.id===params.get("cover") && row.cover_extension);
      if (!item) return error("COVER_UNAVAILABLE",404);
      const object = await bucket.get(imageKey(item));
      const type = TYPES[item.cover_extension];
      if (!object || !Number.isSafeInteger(object.size) || object.size <= 0 || object.size > MAX_IMAGE ||
          object.httpMetadata?.contentType !== type || !object.body) return error("COVER_UNAVAILABLE",404);
      return new Response(object.body,{headers:{...HEADERS,"content-type":type,"content-disposition":"inline"}});
    }
    const n=Number(params.get("limit") || 10),limit=Number.isInteger(n)?Math.max(1,Math.min(20,n)):10;
    const items = published.slice(0,limit).map(item=>({
      id:item.id,title:item.title,summary:item.summary,published_at:item.published_at,category:"SIGIL UPDATE",
      ...(item.cover_extension ? {image_url:coverUrl(target.pathname.replace(/\/$/,""),item.id),image_alt:item.image_alt} : {})
    }));
    return json({ok:true,items,source:"sigil_now_private",audience:"sigil",checked_at:new Date().toISOString()});
  } catch { return error("PRIVATE_FEED_UNAVAILABLE",503); }
}
