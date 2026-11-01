// PER · AI OPS / FLUSH ALL MEDIA: owner-triggered, metadata-only preflight.
// This endpoint never downloads originals, writes R2/Airtable/CMS, or publishes media.
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
  { key: "hot_cha", label: "Hot Cha", lane: "mmd_now", id: "1kzEAekqrtbjd4SDa-SyzKv4kCYbI8sRe" },
]);

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const PROD_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const MEDIA_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4"]);
const HIDDEN_FOLDER = /^(?:review|hidden|archive|rejected|pending|draft|private\s*(?:pic|clip|video)|reference)(?:\b|[\s_-])/i;
const LIMITS = Object.freeze({ maxFolders: 24, maxDepth: 4, maxPages: 3, maxMedia: 500 });
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
  if (!response.ok) throw Error("drive_http_" + response.status);
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") throw Error("drive_malformed");
  return data;
}

async function scanRoot(source, token, http) {
  const base = await googleJson("/files/" + encodeURIComponent(source.id), {
    supportsAllDrives: "true", fields: "id,name,mimeType,trashed,owners(emailAddress)",
  }, token, http);
  if (base.id !== source.id || base.trashed || base.mimeType !== FOLDER ||
    !Array.isArray(base.owners) || !base.owners.some(item => owner(item.emailAddress))) {
    return { key: source.key, label: source.label, lane: source.lane, state: "source_unverified", complete: false };
  }

  const queue = [{ id: source.id, depth: 0 }];
  const seenFolders = new Set(), seenFiles = new Set();
  let images = 0, videos = 0, excludedFolders = 0, unverifiedOwner = 0, complete = true;
  while (queue.length && seenFolders.size < LIMITS.maxFolders && images + videos < LIMITS.maxMedia) {
    const folder = queue.shift();
    if (!folder || seenFolders.has(folder.id)) continue;
    seenFolders.add(folder.id);
    let cursor = "";
    for (let page = 0; page < LIMITS.maxPages; page++) {
      const data = await googleJson("/files", {
        q: "'" + folder.id.replace(/'/g, "\\'") + "' in parents and trashed=false",
        fields: "nextPageToken,files(id,name,mimeType,parents,trashed,owners(emailAddress))",
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
          if (HIDDEN_FOLDER.test(String(file.name || ""))) { excludedFolders++; continue; }
          if (folder.depth < LIMITS.maxDepth && !seenFolders.has(file.id)) queue.push({ id: file.id, depth: folder.depth + 1 });
          else complete = false;
        } else if (MEDIA_MIMES.has(file.mimeType) && !seenFiles.has(file.id)) {
          seenFiles.add(file.id);
          if (file.mimeType.startsWith("image/")) images++;
          else videos++;
        }
        if (images + videos >= LIMITS.maxMedia) { complete = false; break; }
      }
      const next = String(data.nextPageToken || "");
      if (!next) break;
      if (next === cursor) throw Error("drive_pagination_loop");
      cursor = next;
      if (page === LIMITS.maxPages - 1) complete = false;
      if (images + videos >= LIMITS.maxMedia) break;
    }
  }
  if (queue.length) complete = false;
  return {
    key: source.key, label: source.label, lane: source.lane,
    state: complete ? "inventory_checked" : "incomplete_scan",
    complete, images, videos, excluded_folders: excludedFolders,
    unverified_owner_items: unverifiedOwner, folders_scanned: seenFolders.size,
  };
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
  if (!input || input.action !== "preview_all" || Object.keys(input).some(k => k !== "action")) {
    return respond({ ok: false, error: "preview_action_required" }, 400);
  }
  // Never silently switch to a fallback Google account when OAuth is unavailable.
  if (env.COMPCARD_DRIVE_OWNER_EMAIL && !owner(env.COMPCARD_DRIVE_OWNER_EMAIL)) {
    return respond({ ok: false, error: "source_account_mismatch" }, 503);
  }
  const http = deps.http || env.GOOGLE_DRIVE_HTTP?.fetch?.bind(env.GOOGLE_DRIVE_HTTP) || fetch;
  try {
    const token = await (deps.getAccessToken || libraryDriveToken)(env);
    const about = await googleJson("/about", { fields: "user(emailAddress)" }, token, http);
    if (!owner(about.user?.emailAddress)) return respond({ ok: false, error: "source_account_mismatch" }, 503);

    const rows = [];
    // Small, bounded batches avoid a 10-source burst against Drive.
    for (let i = 0; i < MODEL_MEDIA_SOURCE_ROOTS.length; i += 2) {
      const part = await Promise.all(MODEL_MEDIA_SOURCE_ROOTS.slice(i, i + 2).map(async source => {
        try { return await scanRoot(source, token, http); }
        catch { return { key: source.key, label: source.label, lane: source.lane, state: "source_unavailable", complete: false }; }
      }));
      rows.push(...part);
    }
    return respond({
      ok: true, schema: "mmd.per_ai_ops.manual_media_flush_preview.v1",
      mode: "preview_only", source_account: MODEL_MEDIA_SOURCE_EMAIL,
      state: rows.every(row => row.complete) ? "inventory_checked" : "partial",
      catalogue: rows.filter(row => row.lane === "catalogue"),
      mmd_now: [
        ...rows.filter(row => row.lane === "mmd_now"),
        { key: "mmd_recommend", label: "MMD Recommend", source: "telegram_standard_topic", state: "topic_id_unresolved", complete: false },
      ],
      telegram: { standard_group_configured: true, mmd_recommended_topic: "unresolved", hot_call: "excluded_from_mmd_now" },
      writes: { drive: false, r2: false, airtable: false, cms: false, website: false },
      next: "owner_review_and_canonical_model_matching_required_before_ingest",
      checked_at: new Date().toISOString(),
    });
  } catch {
    return respond({ ok: false, error: "drive_source_unavailable", mode: "preview_only", writes: false }, 503);
  }
}
