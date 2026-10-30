// Called only after the Booking Model owner/admin session gate.
const ORIGIN = "https://api.airtable.com/v0/";
const text = value => String(value ?? "").trim();
const ID = /^rec[a-zA-Z0-9]+$/;
const MIME = new Set(["image/jpeg","image/png","image/webp","image/avif","image/heic","image/heif","video/mp4","video/webm","video/quicktime"]);
const HEADERS = {"cache-control":"private, no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-robots-tag":"noindex, nofollow","x-mmd-route-owner":"admin-worker","cross-origin-resource-policy":"same-origin"};

export async function loadBookingAdminMedia(env, modelIds) {
  const ids = new Set(modelIds.filter(id => ID.test(id)));
  const groups = new Map([...ids].map(id => [id, []]));
  if (!ids.size) return groups;
  let offset = "", scanned = 0;
  const seen = new Set();
  do {
    const query = new URLSearchParams({pageSize:"100"});
    if (offset) query.set("offset", offset);
    // No review/public_safe/visibility filter: this inventory is for the admin.
    const page = await read(env, "/" + encodeURIComponent(mediaTable(env)) + "?" + query);
    if (!Array.isArray(page.records)) throw new Error("media_registry_unavailable");
    scanned += page.records.length;
    for (const row of page.records) {
      const f = row.fields || {}, links = f.Model;
      if (!ID.test(row.id) || !Array.isArray(links) || links.length !== 1 || !ids.has(links[0])) continue;
      const storage = storageFor(env, f);
      groups.get(links[0]).push({
        asset_record_id: row.id, media_id: text(f.media_id),
        kind: text(f.file_type).toLowerCase().startsWith("video/") ? "clip" : "photo",
        audience: f.r2_bucket === "mmd-private-model-media" || ["private_gallery","flash_preview"].includes(f.media_type) ? "private" : "public",
        status: text(f.review_status).slice(0,80) || "unknown",
        role: text(f.asset_role).slice(0,80), uploaded_at: text(f.uploaded_at).slice(0,50),
        preview_available: Boolean(storage && typeof storage.bucket?.get === "function"),
      });
    }
    offset = text(page.offset);
    if (offset && (seen.has(offset) || scanned >= 5000)) throw new Error("media_registry_incomplete");
    if (offset) seen.add(offset);
  } while (offset);
  for (const items of groups.values()) items.sort((a,b) => Number(b.role === "profile_main") - Number(a.role === "profile_main") || (Date.parse(b.uploaded_at)||0) - (Date.parse(a.uploaded_at)||0) || a.asset_record_id.localeCompare(b.asset_record_id));
  return groups;
}

export async function readBookingAdminMedia(request, env, modelId, assetRecordId) {
  if (!ID.test(modelId) || !ID.test(assetRecordId)) return denied(404);
  const model = await read(env, "/" + encodeURIComponent(env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || "Models") + "/" + modelId);
  if (model.id !== modelId) return denied(404);
  const asset = await read(env, "/" + encodeURIComponent(mediaTable(env)) + "/" + assetRecordId);
  const f = asset.fields || {};
  if (asset.id !== assetRecordId || !Array.isArray(f.Model) || f.Model.length !== 1 || f.Model[0] !== modelId) return denied(404);
  const storage = storageFor(env, f);
  if (!storage) return denied(404);
  const method = request.method === "HEAD" ? "head" : "get";
  if (typeof storage.bucket?.[method] !== "function") return denied(503);
  const size = Number(f.file_size_bytes), rangeHeader = request.headers.get("range");
  let range;
  if (rangeHeader && method === "get") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2] || 0));
    const end = match?.[1] && match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return new Response(null,{status:416,headers:{...HEADERS,"content-range":"bytes */"+size}});
    range = {offset:start,length:end-start+1};
  }
  const object = await storage.bucket[method](storage.key, ...(range ? [{range}] : []));
  if (!object || object.size !== size || object.httpMetadata?.contentType !== storage.mime ||
      object.customMetadata?.media_id !== f.media_id || object.customMetadata?.model_record_id !== modelId ||
      !/^[a-f0-9]{64}$/i.test(object.customMetadata?.sha256 || "")) {
    if (typeof object?.body?.cancel === "function") await object.body.cancel();
    return denied(404);
  }
  const headers = {...HEADERS,"content-type":storage.mime,"content-disposition":"inline","accept-ranges":"bytes","content-length":String(range?.length || size)};
  if (range) headers["content-range"] = "bytes "+range.offset+"-"+(range.offset+range.length-1)+"/"+size;
  return new Response(method === "head" ? null : object.body,{status:range ? 206 : 200,headers});
}

function storageFor(env, f) {
  const mime = text(f.file_type).toLowerCase(), key = text(f.private_original_key);
  const size = Number(f.file_size_bytes);
  if (!MIME.has(mime) || !key || key.length > 1024 || key.startsWith("/") || /[\x00-\x1f]|(^|\/)\.\.(\/|$)|:\/\//.test(key) || !text(f.media_id) || !Number.isSafeInteger(size) || size <= 0) return null;
  const buckets = {"mmd-models":env.MMD_MODEL_ASSETS,"mmd-private-model-media":env.PRIVATE_MODEL_MEDIA,"mmd-private-public-model-uploads":env.PUBLIC_MODEL_UPLOADS_R2};
  const bucket = Object.hasOwn(buckets,f.r2_bucket) ? buckets[f.r2_bucket] : null;
  return bucket ? {bucket,key,mime} : null;
}
function mediaTable(env) {return env.AIRTABLE_TABLE_MODEL_MEDIA_ID || env.AIRTABLE_TABLE_MODEL_MEDIA_ASSETS || env.AIRTABLE_TABLE_MODEL_MEDIA || "tblrpQXhHnbTU9RhW";}
function denied(status) {return Response.json({ok:false,error:status === 503 ? "media_storage_unavailable" : "media_not_found"},{status,headers:HEADERS});}
async function read(env, path) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("missing_backend");
  const response = await fetch(ORIGIN + encodeURIComponent(env.AIRTABLE_BASE_ID) + path,{headers:{Authorization:"Bearer "+env.AIRTABLE_API_KEY},signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error("backend_unavailable");
  return response.json();
}
