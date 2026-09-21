const DEFAULT_CATALOG_PREFIX = "Public Model/";
const DEFAULT_PUBLIC_ASSET_BASE = "https://models.mmdbkk.com";
const IMAGE_EXTENSION = /\.(?:avif|jpe?g|png|webp)$/i;
const PREFERRED_IMAGE = /(?:^|[-_. ])(?:card|cover|hero|main|primary|profile|01)(?:[-_. ]|$)/i;
const BLOCKED_SEGMENTS = new Set(["private", "evidence", "slips", "line-notes", "line_notes", "sigil", "internal"]);
const PUBLIC_CATALOG_PATH = "/sigil/api/models/search/public-catalog";

export function isPublicProfilesCatalogRequest(path, method = "GET") {
  return normalizePath(path) === PUBLIC_CATALOG_PATH && ["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase());
}

export async function handlePublicProfilesCatalogRequest(request, env) {
  const method = request.method.toUpperCase();
  const cors = corsHeaders(request, env);
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.list !== "function") {
    return json({ ok: false, error: "public_model_catalog_unavailable", items: [] }, 503, cors, method);
  }

  try {
    const prefixes = catalogPrefixes(env.PUBLIC_MODEL_CATALOG_PREFIXES || env.PUBLIC_MODEL_CATALOG_PREFIX || DEFAULT_CATALOG_PREFIX);
    const objects = [];
    for (const prefix of prefixes) objects.push(...await listPrefix(env.MMD_MODEL_ASSETS, prefix));
    const items = buildPublicCatalog(objects, {
      prefixes,
      publicAssetBase: env.MODEL_PUBLIC_ASSET_BASE_URL || DEFAULT_PUBLIC_ASSET_BASE,
    });
    return json({
      ok: true,
      source: "r2_public_model",
      folder: DEFAULT_CATALOG_PREFIX.replace(/\/$/, ""),
      count: items.length,
      items,
    }, 200, cors, method);
  } catch (error) {
    console.error(JSON.stringify({ worker: "sigil-booking-worker", route: PUBLIC_CATALOG_PATH, error: String(error?.message || error) }));
    return json({ ok: false, error: "public_model_catalog_unavailable", items: [] }, 503, cors, method);
  }
}

export function buildPublicCatalog(objects, { prefixes = [DEFAULT_CATALOG_PREFIX], publicAssetBase = DEFAULT_PUBLIC_ASSET_BASE } = {}) {
  const groups = new Map();
  const normalizedPrefixes = catalogPrefixes(prefixes);
  for (const object of Array.isArray(objects) ? objects : []) {
    const key = clean(object?.key).replace(/^\/+/, "");
    const prefix = normalizedPrefixes.find((candidate) => key.startsWith(candidate));
    if (!prefix || !IMAGE_EXTENSION.test(key) || !publicSafeKey(key)) continue;
    const relative = key.slice(prefix.length);
    const parts = relative.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const fileName = parts[parts.length - 1];
    const modelFolder = modelFolderFromParts(parts);
    if (!modelFolder || BLOCKED_SEGMENTS.has(modelFolder.toLowerCase())) continue;
    const slug = slugify(modelFolder);
    if (!slug) continue;
    const current = groups.get(slug) || { slug, display_name: displayName(modelFolder), photos: [] };
    const imageUrl = `${clean(publicAssetBase).replace(/\/+$/, "")}/${encodePath(key)}`;
    current.photos.push({ url: imageUrl, preferred: PREFERRED_IMAGE.test(fileName), key });
    groups.set(slug, current);
  }

  return [...groups.values()].map((group) => {
    group.photos.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.key.localeCompare(b.key));
    const photos = group.photos.slice(0, 6).map((photo) => photo.url);
    return {
      slug: group.slug,
      display_name: group.display_name,
      image_url: photos[0],
      photos,
      visibility: "public",
      source: "r2_public_model",
    };
  }).sort((a, b) => a.display_name.localeCompare(b.display_name, "en"));
}

async function listPrefix(bucket, prefix) {
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    objects.push(...(Array.isArray(page?.objects) ? page.objects : []));
    cursor = page?.truncated ? clean(page.cursor) : "";
  } while (cursor && objects.length < 5000);
  return objects.slice(0, 5000);
}

function modelFolderFromParts(parts) {
  const directories = parts.slice(0, -1);
  if (!directories.length) return "";
  const last = directories[directories.length - 1];
  if (["profile", "gallery", "compcard", "photos", "images"].includes(last.toLowerCase())) {
    return directories[directories.length - 2] || "";
  }
  return last;
}

function publicSafeKey(key) {
  if (!key || key.includes("\\") || key.includes("//") || /(^|\/)\.\.(?:\/|$)/.test(key)) return false;
  return !key.split("/").some((segment) => BLOCKED_SEGMENTS.has(segment.toLowerCase()));
}

function catalogPrefixes(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  const out = values.map((item) => clean(item).replace(/^\/+/, "")).filter(Boolean).map((item) => item.endsWith("/") ? item : `${item}/`);
  return [...new Set(out.length ? out : [DEFAULT_CATALOG_PREFIX])];
}

function displayName(value) {
  return clean(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function slugify(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ก-๙]+/g, "-").replace(/^-+|-+$/g, "");
}
function encodePath(value) { return value.split("/").map(encodeURIComponent).join("/"); }
function clean(value) { return String(value ?? "").trim(); }
function normalizePath(value) { const path = clean(value || "/").replace(/\/{2,}/g, "/"); return path.length > 1 ? path.replace(/\/+$/, "") : path; }

function corsHeaders(request, env) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=120, stale-while-revalidate=600",
    "access-control-allow-methods": "GET,HEAD,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "vary": "Origin",
  });
  const origin = request.headers.get("Origin") || "";
  const allowed = clean(env.ALLOWED_ORIGINS).split(",").map((item) => item.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(payload, status, headers, method) {
  return new Response(method === "HEAD" ? null : JSON.stringify(payload), { status, headers });
}
