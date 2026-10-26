import bookingWorker, { sanitizeModelForBooking } from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const MODEL_SEARCH_PATH = "/sigil/api/models/search";
const MODEL_MEDIA_PREFIX = "/sigil/api/models/media/";
const MEDIA_SOURCE = "mmd_model_media_assets";
const MEDIA_ID = /^media_(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i;
const PUBLIC_MEDIA_TYPES = new Set(["profile_photo", "public_gallery", "intro_video"]);
const SEARCH_FIELDS = [
  "model_id", "model_record_id", "model_key", "unique_key", "display_name", "working_name", "nickname",
  "height_cm", "weight_kg", "body_type", "skin_tone", "preview_approved", "scope", "access_folder",
  "duration_options", "private_service_level", "private_work_capabilities", "work_lane", "booking_discovery",
  "sales_control", "offer",
];

export default {
  async fetch(request, env, ctx) {
    const path = normalizePath(new URL(request.url).pathname);
    const method = request.method.toUpperCase();
    if (path.startsWith(MODEL_MEDIA_PREFIX)) {
      const origin = request.headers.get("origin");
      if (origin && !allowedOrigin(origin, env)) return mediaCors(json({ ok: false, error: "forbidden_origin" }, 403), request, env);
      if (method === "OPTIONS") return mediaCors(new Response(null, { status: 204 }), request, env);
      if (!["GET", "HEAD"].includes(method)) return mediaCors(json({ ok: false, error: "method_not_allowed" }, 405), request, env);
      let response;
      try {
        response = await servePublicModelMedia(request, env, decodeURIComponent(path.slice(MODEL_MEDIA_PREFIX.length)));
      } catch {
        response = json({ ok: false, error: "media_not_found" }, 404);
      }
      return mediaCors(response, request, env);
    }

    const response = await bookingWorker.fetch(request, env, ctx);
    if (!["GET", "POST"].includes(method) || path !== MODEL_SEARCH_PATH || !response.ok) return response;
    const original = await response.json().catch(() => null);
    if (!original || original.ok !== true) return jsonWithHeaders(original, response);
    const hydrated = await hydrateModelAssetPolicy(env, original).catch(() => projectModelsWithoutMedia(original));
    return jsonWithHeaders(hydrated, response);
  },
};

function jsonWithHeaders(payload, response) {
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status: response.status, headers });
}

export async function hydrateModelAssetPolicy(env, payload) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return projectModelsWithoutMedia(payload);
  const models = collectModels(payload);
  if (!models.length) return payload;

  // The search result is already audience-filtered. Re-read canonical Model
  // state before attaching public media; never grant public access from a name.
  const eligible = new Map();
  for (const model of models) {
    const id = clean(model.model_id || model.model_record_id);
    if (!id || model.scope === "private" || eligible.has(id)) continue;
    const record = await fetchModelRecord(env, id).catch(() => null);
    eligible.set(id, isPublicModelRecord(record));
  }
  const publicModels = models.filter((model) => model.scope !== "private" && eligible.get(clean(model.model_id || model.model_record_id)));
  const mediaByModel = await fetchPublicModelMedia(env, publicModels).catch(() => new Map());
  const project = (model) => projectModelMedia(model, model.scope === "private" ? undefined : mediaByModel.get(clean(model.model_id || model.model_record_id)));
  const next = { ...payload, asset_policy: "approved_media_registry_v1" };
  if (payload.model) next.model = project(payload.model);
  if (Array.isArray(payload.items)) next.items = payload.items.map(project);
  return next;
}

function projectModelsWithoutMedia(payload) {
  const next = { ...payload, asset_policy: "approved_media_registry_v1" };
  if (payload.model) next.model = projectModelMedia(payload.model);
  if (Array.isArray(payload.items)) next.items = payload.items.map((model) => projectModelMedia(model));
  return next;
}

function projectModelMedia(model, media) {
  if (!model || typeof model !== "object") return model;
  const customerSafe = Object.fromEntries(SEARCH_FIELDS.filter((key) => Object.hasOwn(model, key)).map((key) => [key, model[key]]));
  const assets = [media?.primary, ...(media?.clips || [])].filter(Boolean);
  const approved = [...new Map(assets.map((asset) => [asset.media_id, {
    media_id: asset.media_id,
    media_source: MEDIA_SOURCE,
    kind: asset.media_type === "intro_video" ? "clip" : "photo",
  }])).values()];
  const gallery = [...new Map((media?.photos || []).map((asset) => [asset.media_id, {
    media_id: asset.media_id,
    media_source: MEDIA_SOURCE,
    kind: "photo",
  }])).values()];
  return {
    ...customerSafe,
    source: approved.length || gallery.length ? MEDIA_SOURCE : "",
    asset_source: approved.length || gallery.length ? MEDIA_SOURCE : "",
    media_source: MEDIA_SOURCE,
    primary_media_id: approved.find((asset) => asset.kind === "photo")?.media_id || "",
    approved_media: approved,
    gallery_media: gallery,
  };
}

export async function fetchPublicModelMedia(env, models) {
  const ids = [...new Set(models.filter((model) => model.scope !== "private").map((model) => clean(model.model_id || model.model_record_id)).filter(Boolean))];
  const result = new Map(ids.map((id) => [id, { primary: null, photos: [], clips: [] }]));
  if (!ids.length) return result;
  // Linked-field formulas contain display names, not record IDs. Scan only the
  // approved registry subset, then join actual Model links by canonical ID.
  const rows = await airtableList(env, mediaTable(env), 'AND({public_safe}=TRUE(),OR({review_status}="approved",{review_status}="published",AND({media_type}="public_gallery",{review_status}="active")))', 5000);
  for (const row of rows) {
    const fields = row.fields || {};
    if (!isPublicMedia(fields)) continue;
    const group = result.get(linkedModelId(fields));
    if (!group) continue;
    const media = { media_id: clean(fields.media_id), media_type: clean(fields.media_type).toLowerCase(), asset_role: clean(fields.asset_role).toLowerCase() };
    if (media.asset_role === "profile_main" && media.media_type !== "intro_video" && isApprovedCover(fields) && !group.primary) group.primary = media;
    else if (media.media_type === "intro_video") group.clips.push(media);
    else if (media.media_type === "public_gallery") group.photos.push(media);
  }
  for (const group of result.values()) {
    group.photos = group.photos.slice(0, 12);
    group.clips = group.clips.slice(0, 5);
  }
  return result;
}

export function isPublicMedia(fields) {
  const type = clean(fields.media_type).toLowerCase();
  const modelId = linkedModelId(fields);
  const key = clean(fields.private_original_key);
  return MEDIA_ID.test(clean(fields.media_id))
    && PUBLIC_MEDIA_TYPES.has(type)
    && /^rec[a-zA-Z0-9]+$/.test(modelId)
    && fields.public_safe === true
    && fields.private_safe !== true && fields.flash_safe !== true
    && (isApprovedCover(fields) || (type === "public_gallery" && clean(fields.review_status).toLowerCase() === "active" && clean(fields.asset_role).toLowerCase() !== "profile_main") || (type === "intro_video" && ["approved", "published"].includes(clean(fields.review_status).toLowerCase())))
    && ["public", "public_candidate"].includes(clean(fields.media_visibility).toLowerCase())
    && !/private|flash|sensitive/.test(clean(fields.asset_role).toLowerCase())
    && fields.r2_bucket === "mmd-models"
    && key.startsWith(`models/${modelId}/`) && !key.includes("..")
    && (type === "intro_video" ? /^video\/(mp4|webm|quicktime)$/.test(clean(fields.file_type)) : /^image\/(jpeg|png|webp|avif)$/.test(clean(fields.file_type)));
}

function isApprovedCover(fields) {
  return ["approved", "published"].includes(clean(fields.review_status).toLowerCase());
}

function linkedModelId(fields) {
  const links = fields.Model;
  return Array.isArray(links) && links.length === 1 ? clean(typeof links[0] === "string" ? links[0] : links[0]?.id) : "";
}

function isPublicModelRecord(record) {
  return Boolean(record?.id && sanitizeModelForBooking(record, { scope: "public", privateAllowed: false, env: {} }));
}

async function servePublicModelMedia(request, env, mediaId) {
  if (!MEDIA_ID.test(mediaId) || !env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return json({ ok: false, error: "media_not_found" }, 404);
  const rows = await airtableList(env, mediaTable(env), `{media_id}=${formulaText(mediaId)}`, 2).catch(() => []);
  const fields = rows[0]?.fields || {};
  if (rows.length !== 1 || clean(fields.media_id) !== mediaId || !isPublicMedia(fields)) return json({ ok: false, error: "media_not_found" }, 404);
  const record = await fetchModelRecord(env, linkedModelId(fields)).catch(() => null);
  if (!isPublicModelRecord(record)) return json({ ok: false, error: "media_not_found" }, 404);

  const bucket = env.MMD_MODEL_ASSETS;
  const readMethod = request.method === "HEAD" ? "head" : "get";
  if (typeof bucket?.[readMethod] !== "function") return json({ ok: false, error: "media_storage_unavailable" }, 503);
  const size = Number(fields.file_size_bytes);
  if (!Number.isSafeInteger(size) || size <= 0) return json({ ok: false, error: "media_not_found" }, 404);
  let range;
  const rangeHeader = request.headers.get("range");
  if (rangeHeader && request.method !== "HEAD") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2] || 0));
    const end = match?.[1] && match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    range = { offset: start, length: end - start + 1 };
  }
  const object = await bucket[readMethod](clean(fields.private_original_key), ...(readMethod === "get" && range ? [{ range }] : []));
  if (!object || object.size !== size || object.httpMetadata?.contentType !== fields.file_type
    || object.customMetadata?.media_id !== mediaId || object.customMetadata?.model_record_id !== record.id
    || !/^[a-f0-9]{64}$/i.test(object.customMetadata?.sha256 || "")) {
    if (typeof object?.body?.cancel === "function") await object.body.cancel();
    return json({ ok: false, error: "media_not_found" }, 404);
  }
  const headers = new Headers({
    "content-type": fields.file_type,
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "accept-ranges": "bytes",
    "content-length": String(range?.length || size),
  });
  if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`);
  return new Response(request.method === "HEAD" ? null : object.body, { status: range ? 206 : 200, headers });
}

async function airtableList(env, table, formula, limit) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", String(Math.min(100, limit - records.length)));
    url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
    if (!response.ok) throw new Error("media_registry_unavailable");
    const payload = await response.json();
    records.push(...(Array.isArray(payload.records) ? payload.records : []));
    offset = payload.offset || "";
  } while (offset && records.length < limit);
  if (offset) throw new Error("media_registry_scan_limit");
  return records.slice(0, limit);
}

async function fetchModelRecord(env, recordId) {
  if (!/^rec[a-zA-Z0-9]+$/.test(recordId)) return null;
  const table = env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || "Models";
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  if (!response.ok) return null;
  const record = await response.json();
  return record?.id === recordId ? record : null;
}

function mediaCors(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");
  if (origin && allowedOrigin(origin, env)) headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET,HEAD,OPTIONS");
  headers.set("access-control-allow-headers", "Range");
  headers.set("access-control-expose-headers", "Content-Length,Content-Range,Accept-Ranges");
  // Revocation must reach the authorization gate on every request.
  headers.set("cache-control", "private, no-store");
  headers.set("cdn-cache-control", "no-store");
  headers.set("cloudflare-cdn-cache-control", "no-store");
  headers.set("x-mmd-route-owner", "sigil-booking-worker");
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
}

function allowedOrigin(origin, env) {
  return clean(env.ALLOWED_ORIGINS).split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
}
function mediaTable(env) { return env.AIRTABLE_TABLE_MODEL_MEDIA_ID || "tblrpQXhHnbTU9RhW"; }
function formulaText(value) { return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
function json(payload, status = 200) { return Response.json(payload, { status, headers: { "cache-control": "no-store" } }); }
function collectModels(payload) { return [payload.model, ...(Array.isArray(payload.items) ? payload.items : [])].filter((model) => model && typeof model === "object"); }
function normalizePath(pathname = "/") { return pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/"; }
function clean(value) { return String(value ?? "").trim(); }
