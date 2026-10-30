import { bookingDriveFolder, listBookingDriveMedia, readBookingDriveMedia, readBookingDriveCover } from "./booking-model-drive.js";
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { renderBookingModelsPage } from "./booking-models-page.js";
import { sanitizeModelForBooking, customerModelExcluded } from "../../sigil-booking-worker/src/index.js";
import { loadBookingAdminMedia, readBookingAdminMedia } from "./booking-model-media.js";
import { inferCustomerModelFolder } from "../../sigil-booking-worker/src/customer-search-policy.js";
import { customerDiscoveryAllowed } from "../../sigil-booking-worker/src/customer-discovery-policy.js";

export const BOOKING_MODELS_PAGE = "/internal/admin/booking-models";
export const BOOKING_MODELS_API = "/v1/admin/booking-models";
const ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const RECORD_ID = /^rec[a-zA-Z0-9]+$/;
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "x-mmd-route-owner": "admin-worker" };
const json = (body, status = 200) => Response.json(body, { status, headers });
const text = value => String(value ?? "").trim();
const token = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const enabled = value => value === true || ["1", "true", "yes"].includes(text(value).toLowerCase());

export function isBookingModelsRequest(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  return path === BOOKING_MODELS_PAGE || path === BOOKING_MODELS_API || path.startsWith(BOOKING_MODELS_API + "/");
}

export async function handleBookingModels(request, env = {}) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, "");
  if (!ORIGINS.has(url.origin) || (request.headers.has("origin") && request.headers.get("origin") !== url.origin)) return json({ ok: false, error: "forbidden_origin" }, 403);
  if (request.headers.has("authorization") || request.headers.has("x-confirm-key")) return json({ ok: false, error: "browser_admin_session_required" }, 403);
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) {
    if (path === BOOKING_MODELS_PAGE && request.method === "GET") return new Response(null, { status: 303, headers: { ...headers, location: "/internal/admin/login?next=" + encodeURIComponent(BOOKING_MODELS_PAGE) } });
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!["owner", "admin"].includes(actor.role)) return json({ ok: false, error: "admin_required" }, 403);
  if (!["GET", "HEAD"].includes(request.method)) return json({ ok: false, error: "method_not_allowed" }, 405);
  if (path === BOOKING_MODELS_PAGE) {
    const nonce = crypto.randomUUID();
    return new Response(request.method === "HEAD" ? null : renderBookingModelsPage(nonce), { headers: { ...headers, "content-type": "text/html; charset=utf-8", "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'` } });
  }
  try {
    const drive = path.match(/^\/v1\/admin\/booking-models\/(rec[a-zA-Z0-9]+)\/drive(?:\/([A-Za-z0-9_-]{10,180}))?$/);
    const driveCover=path.match(/^\/v1\/admin\/booking-models\/(rec[a-zA-Z0-9]+)\/drive-cover$/);
    if(drive || driveCover) {
      try {
        if(driveCover)return await readBookingDriveCover(request,env,driveCover[1]);
        if(drive[2])return await readBookingDriveMedia(request,env,drive[1],drive[2]);
        return json(await listBookingDriveMedia(env,drive[1]));
      }catch(error){const allowed=new Set(["model_source_unavailable","model_folder_unlinked","model_folder_conflict","model_folder_unavailable","model_folder_scope_conflict","drive_credentials_not_configured","drive_oauth_unavailable","drive_account_mismatch","drive_access_unavailable","drive_media_unavailable","drive_inventory_unavailable","drive_inventory_incomplete","file_not_found","file_not_linked","drive_transport_redirect_unavailable","drive_transport_timeout_unavailable","drive_transport_receiver_unavailable","drive_transport_network_unavailable","owner_drive_service_account_missing","owner_drive_service_account_invalid","owner_drive_oauth_failed"]);return json({ok:false,error:error.status===409?"model_folder_conflict":"drive_media_unavailable",reason:allowed.has(error.code)?error.code:"source_read_failed"},[404,409,416].includes(error.status)?error.status:503);}
    }
    const asset = path.match(/^\/v1\/admin\/booking-models\/(rec[a-zA-Z0-9]+)\/media\/(rec[a-zA-Z0-9]+)$/);
    if (asset) return await readBookingAdminMedia(request, env, asset[1], asset[2]);
    const cover = path.match(/^\/v1\/admin\/booking-models\/(rec[a-zA-Z0-9]+)\/cover$/);
    if (cover) return await readCover(request, env, cover[1], url.searchParams.get("media_id"));
    if (path !== BOOKING_MODELS_API) return json({ ok: false, error: "not_found" }, 404);
    if (request.method === "HEAD") return new Response(null, { headers });
    const query = readQuery(url);
    if (!query) return json({ ok: false, error: "invalid_search" }, 400);
    const rows = await loadModels(env, query);
    let media = new Map(), mediaStatus = "available";
    try { media = await loadBookingAdminMedia(env, rows.records.map(record => record.id)); }
    catch { mediaStatus = "unavailable"; }
    const items = rows.records.map(record => projectBookingModel(record, media.get(record.id) || [], mediaStatus, env))
      .filter(item => query.audience === "all" || (query.audience === "public" ? item.offers_public : item.offers_private))
      .filter(item => query.attention === "all" || (query.attention === "missing_cover" ? item.media_count === 0 && item.cover_status === "missing" : item.reasons.some(reason => ["inactive", "protected", "customer_restricted", "visibility_review"].includes(reason))));
    return json({ ok: true, items, next_cursor: rows.offset || null, media_status: mediaStatus, checks: "profile_only", source: "canonical_booking_models" });
  } catch { return json({ ok: false, error: "booking_models_unavailable" }, 503); }
}

function readQuery(url) {
  const q = text(url.searchParams.get("q"));
  const cursor = text(url.searchParams.get("cursor"));
  const audience = url.searchParams.get("audience") || "all", attention = url.searchParams.get("attention") || "all";
  if (q.length > 80 || /[\x00-\x1f]/.test(q) || cursor.length > 400 || (cursor && !/^[A-Za-z0-9/_=+-]+$/.test(cursor)) || !["all", "public", "private"].includes(audience) || !["all", "missing_cover", "policy_review"].includes(attention)) return null;
  return { q, cursor, audience, attention };
}

async function loadModels(env, query) {
  const params = new URLSearchParams({ pageSize: "20" });
  if (query.cursor) params.set("offset", query.cursor);
  if (query.q) {
    const needle = JSON.stringify(query.q.toLowerCase());
    params.set("filterByFormula", `OR(FIND(${needle},LOWER({working_name})),FIND(${needle},LOWER({nickname})),FIND(${needle},LOWER({unique_key})),LOWER(RECORD_ID())=${needle})`);
  }
  // A page can be empty after a diagnostic filter. Keep Airtable's cursor so
  // the UI can continue instead of reporting an incomplete result as final.
  const data = await airtable(env, "/" + encodeURIComponent(modelTable(env)) + "?" + params);
  if (!Array.isArray(data.records) || (data.offset && data.offset === query.cursor)) throw new Error("invalid_model_page");
  return { records: data.records, offset: data.offset };
}

export function projectBookingModel(record, assets = [], mediaStatus, env = {}) {
  const f = record.fields || {};
  const publicModel = sanitizeModelForBooking(record, { scope: "public", privateAllowed: false, env });
  const privateModel = sanitizeModelForBooking(record, { scope: "private", privateAllowed: true, allowedFolders: ["standard", "premium"], env });
  const offersPublic = enabled(f.can_work_public) || enabled(f["Public Search Enabled"]) || token(f.sales_layer).includes("public") || token(f.visibility) === "public";
  const offersPrivate = enabled(f.can_work_private) || token(f.sales_layer).includes("private") || Boolean(text(f.private_tier) || text(f.private_work_format));
  const reasons = [];
  if (!text(f.working_name || f.nickname)) reasons.push("no_name");
  const number = (value, min, max) => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Math.round(Number(value)) : null;
  const height = number(f.height_cm, 100, 230), weight = number(f.weight_kg, 30, 200);
  const body = ["lean", "athletic", "muscular", "slim", "soft"].includes(token(f.body_type)) ? token(f.body_type) : "";
  const skin = ["fair", "light", "medium", "tan", "deep"].includes(token(f.skin_tone)) ? token(f.skin_tone) : "";
  if (!height) reasons.push("missing_height");
  if (!weight) reasons.push("missing_weight");
  if (!body) reasons.push("missing_body");
  if (!skin) reasons.push("missing_skin");
  if (["inactive", "blocked", "archived", "hidden", "retired"].includes(token(f.status || f.availability_status))) reasons.push("inactive");
  if (customerModelExcluded(record.id) || ["vip", "black_card"].includes(token(f.approved_client_visibility)) || ["gws", "ems", "secretive", "exclusive"].includes(token(f.private_tier))) reasons.push("protected");
  if (!customerDiscoveryAllowed(f, "")) reasons.push("customer_restricted");
  if ((offersPublic && !publicModel) || (offersPrivate && !privateModel)) reasons.push("visibility_review");
  // Admin previews are independent of customer visibility and approval status.
  const photos = assets.filter(asset => asset.kind === "photo" && asset.preview_available);
  const cover = photos[0] || null;
  const driveLinked=Boolean(bookingDriveFolder(f));
  const coverStatus = mediaStatus === "unavailable" ? "unavailable" : cover ? "available" : assets.some(asset => asset.kind === "clip" && asset.preview_available) ? "clip_only" : assets.length ? "unavailable" : driveLinked ? "drive_linked" : "missing";
  if (coverStatus === "missing") reasons.push("missing_media");
  if (mediaStatus === "unavailable") reasons.push("cover_unavailable");
  if (offersPrivate) reasons.push("private_delivery_pending");
  return {
    model_id: text(record.id), name: text(f.working_name || f.nickname || f.display_name_compact), code: text(f.unique_key || f.canonical_slug || f.model_key),
    height_cm: height, weight_kg: weight, body_type: body, skin_tone: skin,
    offers_public: offersPublic, offers_private: offersPrivate,
    public_profile_allowed: Boolean(publicModel), private_profile_allowed: Boolean(privateModel),
    access_folder: offersPrivate ? inferCustomerModelFolder(f) : "", reasons: [...new Set(reasons)],
    drive_linked: driveLinked, cover_status: coverStatus, cover_media_id: cover?.media_id || "", cover_asset_id: cover?.asset_record_id || "", media_count: assets.length, media: assets,
  };
}

async function readCover(request, env, modelId, mediaId) {
  if (!text(mediaId) || !RECORD_ID.test(modelId)) return json({ ok: false, error: "not_found" }, 404);
  const groups = await loadBookingAdminMedia(env, [modelId]);
  const matches = (groups.get(modelId) || []).filter(asset => asset.media_id === mediaId);
  if (matches.length !== 1) return json({ ok: false, error: "not_found" }, 404);
  return readBookingAdminMedia(request, env, modelId, matches[0].asset_record_id);
}

function modelTable(env) { return env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || "Models"; }
async function airtable(env, path) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("missing_backend");
  const response = await fetch("https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + path, {
    headers: { Authorization: "Bearer " + env.AIRTABLE_API_KEY }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("backend_unavailable");
  return response.json();
}

