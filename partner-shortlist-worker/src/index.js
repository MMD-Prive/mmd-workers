// Job-scoped sharing only. The existing owner media/library APIs remain private.
export const OWNER_API = "/v1/admin/model-selections";
export const PARTNER_API = "/v1/partner/model-selections";
export const PREFIX = "partner-shortlists/v1/";
const ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const ID = /^[a-f0-9]{32}$/;
const RECORD = /^rec[A-Za-z0-9]{14}$/;
const MIME = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
const MAX_PHOTO = 10 * 1024 * 1024;
const MAX_IMPORT = 60 * 1024 * 1024;
const MAX_PREVIEW = 2 * 1024 * 1024;
export const securityHeaders = {
  "cache-control": "private, no-store", "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow, noarchive",
  "cross-origin-resource-policy": "same-origin", "x-mmd-route-owner": "partner-shortlist-worker",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
};
const json = (body, status = 200) => Response.json(body, { status, headers: securityHeaders });
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const keyFor = id => PREFIX + "records/" + id + ".json";
const mediaKey = (id, photoId) => PREFIX + "media/" + id + "/" + photoId;
const previewKey = (id, photoId) => PREFIX + "previews/" + id + "/" + photoId;
const now = () => new Date().toISOString();
const randomId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, "0")).join("");
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function hash(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
}
function text(value, max, required = false) {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail("invalid_text");
  const result = value.trim();
  if (required && !result) fail("required_text");
  return result;
}
function boundedNumber(value, min, max, nullable = false) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail("invalid_number");
  return value;
}
function expiry(value) {
  const date = Date.parse(value);
  if (typeof value !== "string" || !Number.isFinite(date) || date <= Date.now() || date > Date.now() + 30 * 86400000) fail("invalid_expiry");
  return new Date(date).toISOString();
}
function brief(value) {
  if (!object(value)) fail("invalid_brief");
  const date = text(value.date, 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + "T12:00:00Z")) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) fail("invalid_date");
  const time = text(value.time, 5);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail("invalid_time");
  return { date, time, location: text(value.location, 160), duration: text(value.duration, 80),
    budget: boundedNumber(value.budget, 1, 1000000), spec: text(value.spec, 500),
    format: text(value.format, 40), extra: text(value.extra, 1000) };
}
function ownerOnly(value) {
  if (!object(value)) fail("invalid_owner_details");
  return { payoutCap: boundedNumber(value.payoutCap, 0, 1000000, true) };
}
function display(value) {
  if (!object(value)) fail("invalid_display");
  const status = value.status || "pending";
  if (!["pending", "available", "unavailable"].includes(status)) fail("invalid_availability");
  // Only explicit display input is shared; nothing is inferred from upstream data.
  return { name: text(value.name, 80, true), code: text(value.code, 40), height: boundedNumber(value.height, 100, 230, true),
    weight: boundedNumber(value.weight, 30, 250, true), format: text(value.format, 40), status, caption: text(value.caption, 300) };
}
function store(env) {
  if (!env.SHORTLIST_STORE?.get || !env.SHORTLIST_STORE?.put || !env.SHORTLIST_STORE?.list) fail("storage_unavailable", 503);
  return env.SHORTLIST_STORE;
}
async function bytes(stream, limit) {
  if (!stream) fail("body_required");
  const reader = stream.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.length;
      if (length > limit) { await reader.cancel(); fail("body_too_large", 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const part of chunks) { result.set(part, offset); offset += part.length; }
  return result;
}
async function body(request) {
  if ((request.headers.get("content-type") || "").split(";")[0].trim() !== "application/json") fail("json_required", 415);
  const raw = await bytes(request.body, 32768);
  let value; try { value = JSON.parse(new TextDecoder().decode(raw)); } catch { fail("invalid_json"); }
  if (!object(value)) fail("invalid_json");
  return value;
}
function checkOrigin(request) {
  const origin = new URL(request.url).origin;
  if (!ORIGINS.has(origin) || (request.headers.has("origin") && request.headers.get("origin") !== origin)) fail("forbidden_origin", 403);
  if (["POST", "PATCH", "DELETE"].includes(request.method) && request.headers.get("origin") !== origin) fail("write_origin_required", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") fail("forbidden_origin", 403);
}
async function adminFetch(request, env, path, cookie) {
  if (!env.ADMIN?.fetch) fail("owner_auth_unavailable", 503);
  return env.ADMIN.fetch(new Request(new URL(path, request.url), {
    method: "GET", headers: { cookie, accept: "application/json, image/jpeg, image/png, image/webp" }, redirect: "manual", signal: AbortSignal.timeout(20000),
  }));
}
export async function requireOwner(request, env) {
  checkOrigin(request);
  if (request.headers.has("authorization") || request.headers.has("x-confirm-key")) fail("browser_admin_session_required", 403);
  const cookies = (request.headers.get("cookie") || "").split(";").map(x => x.trim())
    .filter(x => /^mmd_admin_gate_v1=[A-Za-z0-9_.-]{20,4096}$/.test(x));
  if (!cookies.length) fail("unauthorized", 401);
  const cookie = cookies.join("; ");
  const response = await adminFetch(request, env, "/v1/admin/compcards/config", cookie);
  if (response.status === 401 || response.status === 403) fail("unauthorized", response.status);
  if (response.status !== 200 || !(response.headers.get("content-type") || "").includes("application/json")) fail("owner_auth_unavailable", 503);
  let config; try { config = await response.json(); } catch { fail("owner_auth_unavailable", 503); }
  if (config?.ok !== true || !Array.isArray(config.drive_roots)) fail("owner_auth_unavailable", 503);
  return cookie;
}
async function read(env, id) {
  if (!ID.test(id || "")) fail("not_found", 404);
  const record = await store(env).get(keyFor(id));
  if (!record) fail("not_found", 404);
  const value = await record.json();
  if (value.schema !== "partner_shortlist_v1" || value.id !== id || !Number.isSafeInteger(value.revision) || !Array.isArray(value.models)
    || !Array.isArray(value.receipts) || !/^[a-f0-9]{64}$/.test(value.tokenHash) || !Number.isFinite(Date.parse(value.expiresAt))
    || !["active", "revoked"].includes(value.state)) fail("record_unavailable", 503);
  return { value, etag: record.etag };
}
function compareRevision(value, input) {
  if (!Number.isSafeInteger(input.revision) || input.revision !== value.revision) fail("revision_conflict", 409);
}
async function save(env, entry, next) {
  next = { ...next, revision: entry.value.revision + 1, updatedAt: now() };
  const saved = await store(env).put(keyFor(next.id), JSON.stringify(next), {
    onlyIf: { etagMatches: entry.etag }, httpMetadata: { contentType: "application/json" },
  });
  if (!saved) fail("revision_conflict", 409);
  return next;
}
function shareUrl(request, id, token) {
  return new URL("/partner/model-selection", request.url).href + "#s=" + id + "&t=" + token;
}
function ownerView(value) {
  return { id: value.id, title: value.title, revision: value.revision, state: value.state,
    expiresAt: value.expiresAt, createdAt: value.createdAt, updatedAt: value.updatedAt,
    brief: value.brief, ownerOnly: value.ownerOnly, selection: value.selection,
    models: value.models.map(model => ({ id: model.id, canonicalModelId: model.canonicalModelId, historyReviewedAt: model.historyReviewedAt, ...model.display,
      photos: model.photos.map(photo => ({ id: photo.id, source: photo.source, assetId: photo.assetId,
        shareAllowed: photo.shareAllowed, downloadAllowed: photo.downloadAllowed, bytes: photo.bytes,
        contentType: photo.contentType, previewPath: OWNER_API + "/" + value.id + "/media/" + photo.id })) })) };
}
function partnerView(value) {
  const selected = value.selection;
  const currentModels = new Set(value.models.map(model => model.id));
  const currentPhotos = new Set(value.models.flatMap(model => model.photos.filter(photo => photo.shareAllowed === true).map(photo => photo.id)));
  const validSelection = selected && selected.modelIds.every(id => currentModels.has(id)) && selected.photoIds.every(id => currentPhotos.has(id));
  return { ok: true, jobId: value.id, title: value.title, revision: value.revision,
    expiresAt: value.expiresAt, brief: brief(value.brief), selection: validSelection ? {
      receiptId: selected.receiptId, modelIds: selected.modelIds, photoIds: selected.photoIds,
      note: selected.note, submittedAt: selected.submittedAt,
    } : null,
    models: value.models.map(model => ({ id: model.id, ...display(model.display), photos: model.photos
      .filter(photo => photo.shareAllowed === true).map(photo => ({ id: photo.id, downloadAllowed: photo.downloadAllowed === true,
        previewPath: PARTNER_API + "/" + value.id + "/media/" + photo.id,
        ...(photo.downloadAllowed === true ? { downloadPath: PARTNER_API + "/" + value.id + "/media/" + photo.id + "/download" } : {}) })) })) };
}
async function partnerEntry(request, env, id) {
  const bearer = request.headers.get("authorization") || "";
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer)) fail("invalid_link", 401);
  const entry = await read(env, id);
  const tokenHash = await hash(bearer.slice(7));
  if (tokenHash !== entry.value.tokenHash) fail("invalid_link", 401);
  if (entry.value.state !== "active" || Date.parse(entry.value.expiresAt) <= Date.now()) fail("link_closed", 410);
  return entry;
}
async function media(request, env, value, photoId, download, isOwner) {
  let photo;
  for (const model of value.models) photo ||= model.photos.find(item => item.id === photoId);
  if (!photo || (!isOwner && photo.shareAllowed !== true)) fail("not_found", 404);
  if (!isOwner && download && photo.downloadAllowed !== true) fail("download_not_allowed", 403);
  const original = isOwner || download, variant = original ? photo : photo.preview;
  if (!original && (!variant || variant.contentType !== "image/webp" || !Number.isSafeInteger(variant.bytes)
    || variant.bytes <= 0 || variant.bytes > MAX_PREVIEW || !/^[a-f0-9]{64}$/.test(variant.sha256))) fail("preview_unavailable", 503);
  const object = await store(env).get((original ? mediaKey : previewKey)(value.id, photoId));
  let responseBody;
  if (variant?.storageEncoding === "base64") {
    responseBody = await readManagedBase64Media(object, variant, original ? MAX_PHOTO : MAX_PREVIEW);
  } else {
    // Existing browser imports retain their exact binary metadata checks.
    if (!object || object.size !== variant.bytes || object.httpMetadata?.contentType !== variant.contentType ||
      object.customMetadata?.sha256 !== variant.sha256 || object.customMetadata?.shortlist_id !== value.id ||
      (!original && object.customMetadata?.variant !== "preview")) fail("media_unavailable", 503);
    responseBody = object.body;
  }
  // No redirect or public R2/Drive URL ever leaves this boundary.
  // Partner previews never fall back to the original, even if a preview is missing.
  return new Response(request.method === "HEAD" ? null : responseBody, { headers: { ...securityHeaders,
    "content-type": variant.contentType, "content-length": String(variant.bytes),
    "content-disposition": (download ? "attachment" : "inline") + '; filename="model-photo.' + MIME.get(variant.contentType) + '"',
  } });
}
// Only private records created by authenticated owner-management tooling may
// explicitly select this transport. Browser imports remain binary. Verify the
// decoded bytes themselves because that management transport lacks R2 metadata.
async function readManagedBase64Media(object, variant, limit) {
  if (!MIME.has(variant.contentType) || !Number.isSafeInteger(variant.bytes) || variant.bytes <= 0 || variant.bytes > limit
    || !/^[a-f0-9]{64}$/.test(variant.sha256)) fail("media_unavailable", 503);
  const encodedLength = 4 * Math.ceil(variant.bytes / 3);
  if (!object || object.size !== encodedLength || object.httpMetadata?.contentType !== "application/x-mmd-base64") fail("media_unavailable", 503);
  try {
    const encodedBytes = await bytes(object.body, encodedLength);
    if (encodedBytes.length !== encodedLength) fail("media_unavailable", 503);
    const encoded = new TextDecoder("utf-8", { fatal: true }).decode(encodedBytes);
    // atob alone accepts whitespace and non-canonical pad bits. Round-tripping
    // enforces the exact padded RFC 4648 representation, without normalization.
    const binary = atob(encoded);
    if (binary.length !== variant.bytes || btoa(binary) !== encoded) fail("media_unavailable", 503);
    const decoded = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) decoded[i] = binary.charCodeAt(i);
    checkImage(decoded, variant.contentType);
    if (await hash(decoded) !== variant.sha256) fail("media_unavailable", 503);
    return decoded;
  } catch { fail("media_unavailable", 503); }
}
function checkImage(data, mime) {
  const head = new TextDecoder("latin1").decode(data.slice(0, 12));
  const valid = mime === "image/jpeg" ? data[0] === 255 && data[1] === 216 && data[2] === 255
    : mime === "image/png" ? [137,80,78,71,13,10,26,10].every((n,i) => data[i] === n)
    : mime === "image/webp" && head.startsWith("RIFF") && head.slice(8,12) === "WEBP";
  if (!valid) fail("unsupported_photo", 415);
}
async function makePreview(env, data) {
  if (!env.IMAGES?.input) fail("preview_unavailable", 503);
  try {
    const output = await env.IMAGES.input(new Response(data).body)
      .transform({ width: 720, height: 960, fit: "scale-down" })
      .output({ format: "image/webp", quality: 80, anim: false });
    const response = output.response();
    if (response.status !== 200 || (response.headers.get("content-type") || "").split(";")[0].trim() !== "image/webp") {
      await response.body?.cancel(); fail("preview_unavailable", 503);
    }
    const previewData = await bytes(response.body, MAX_PREVIEW);
    checkImage(previewData, "image/webp");
    return { data: previewData, metadata: { contentType: "image/webp", bytes: previewData.length, sha256: await hash(previewData), maxWidth: 720, maxHeight: 960, fit: "scale-down" } };
  } catch { fail("preview_unavailable", 503); }
}
async function importModel(request, env, cookie, entry, input) {
  compareRevision(entry.value, input);
  if (input.historyReviewed !== true) fail("history_review_required");
  if (!RECORD.test(input.canonicalModelId || "")) fail("invalid_model_source");
  const shown = display(input.display);
  if (!Array.isArray(input.photos) || !input.photos.length || input.photos.length > 12) fail("invalid_photos");
  const old = entry.value.models.find(model => model.canonicalModelId === input.canonicalModelId);
  if (!old && entry.value.models.length >= 30) fail("too_many_models");
  const unique = new Set(), specs = input.photos.map(photo => {
    if (!object(photo) || photo.shareAllowed !== true || typeof photo.downloadAllowed !== "boolean") fail("photo_permission_required");
    const source = photo.source, assetId = text(photo.assetId, 180, true);
    if (source === "media" ? !/^(?:(?:rec|att)[A-Za-z0-9]+|legacy)$/.test(assetId)
      : source === "drive" ? !/^[A-Za-z0-9_-]{10,180}$/.test(assetId) : true) fail("invalid_photo_source");
    if (unique.has(source + ":" + assetId)) fail("duplicate_photo");
    unique.add(source + ":" + assetId); return { source, assetId, downloadAllowed: photo.downloadAllowed };
  });
  if (!env.IMAGES?.input) fail("preview_unavailable", 503);
  // Authenticated upstream validates model/photo association and Drive ancestry.
  const photos = []; let total = 0;
  for (const spec of specs) {
    const path = "/v1/admin/booking-models/" + input.canonicalModelId + "/" + (spec.source === "drive" ? "drive" : "media") + "/" + spec.assetId;
    const response = await adminFetch(request, env, path, cookie);
    if (response.status !== 200) fail("photo_source_unavailable", response.status === 404 ? 404 : 503);
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!MIME.has(contentType)) { await response.body?.cancel(); fail("unsupported_photo", 415); }
    const data = await bytes(response.body, Math.min(MAX_PHOTO, MAX_IMPORT - total)); total += data.length;
    checkImage(data, contentType);
    const preview = await makePreview(env, data);
    const sha256 = await hash(data), id = randomId();
    const saved = await store(env).put(mediaKey(entry.value.id, id), data, {
      onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType },
      customMetadata: { sha256, shortlist_id: entry.value.id },
    });
    if (!saved) fail("media_store_conflict", 409);
    const previewSaved = await store(env).put(previewKey(entry.value.id, id), preview.data, {
      onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: preview.metadata.contentType },
      customMetadata: { sha256: preview.metadata.sha256, shortlist_id: entry.value.id, variant: "preview" },
    });
    if (!previewSaved) fail("media_store_conflict", 409);
    photos.push({ id, ...spec, shareAllowed: true, contentType, bytes: data.length, sha256, preview: preview.metadata, approvedAt: now() });
  }
  const model = { id: old?.id || randomId(), canonicalModelId: input.canonicalModelId, historyReviewedAt: now(), display: shown, photos };
  const models = old ? entry.value.models.map(item => item.id === old.id ? model : item) : [...entry.value.models, model];
  const selection = old && entry.value.selection?.modelIds.includes(old.id) ? null : entry.value.selection;
  return save(env, entry, { ...entry.value, models, selection });
}
// Reusable by authenticated deployment tooling; this is not an HTTP seed route.
export async function buildRecord(input) {
  if (!object(input)) fail("invalid_input");
  const id = randomId(), token = randomToken(), createdAt = now();
  const record = { schema: "partner_shortlist_v1", id, revision: 1, state: "active", title: text(input.title, 100, true),
    brief: brief(input.brief), ownerOnly: ownerOnly(input.ownerOnly || {}), expiresAt: expiry(input.expiresAt),
    models: [], selection: null, receipts: [], tokenHash: await hash(token), createdAt, updatedAt: createdAt };
  return { record, token };
}
async function ownerRoute(request, env, parts) {
  const cookie = await requireOwner(request, env), method = request.method;
  if (!parts.length) {
    if (method === "GET" || method === "HEAD") {
      const cursor = new URL(request.url).searchParams.get("cursor");
      if (cursor && (cursor.length > 2000 || /[\u0000-\u001f]/.test(cursor))) fail("invalid_cursor");
      const list = await store(env).list({ prefix: PREFIX + "records/", limit: 30, ...(cursor ? { cursor } : {}) });
      const entries = await Promise.all(list.objects.map(item => store(env).get(item.key)));
      const values = await Promise.all(entries.filter(Boolean).map(item => item.json()));
      return json({ ok: true, items: values.filter(value => value.schema === "partner_shortlist_v1").map(ownerView), nextCursor: list.truncated ? list.cursor : null });
    }
    if (method !== "POST") fail("method_not_allowed", 405);
    const { record: value, token } = await buildRecord(await body(request));
    const saved = await store(env).put(keyFor(value.id), JSON.stringify(value), { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
    if (!saved) fail("create_conflict", 409);
    return json({ ok: true, item: ownerView(value), url: shareUrl(request, value.id, token) }, 201);
  }
  const entry = await read(env, parts[0]), value = entry.value;
  if (parts[1] === "media" && parts.length === 3 && ID.test(parts[2]) && ["GET", "HEAD"].includes(method)) return media(request, env, value, parts[2], false, true);
  if (parts.length === 1 && ["GET", "HEAD"].includes(method)) return json({ ok: true, item: ownerView(value) });
  if (parts.length === 1 && method === "PATCH") {
    const input = await body(request); compareRevision(value, input); const next = { ...value };
    if (own(input, "title")) next.title = text(input.title, 100, true);
    if (own(input, "brief")) next.brief = brief(input.brief);
    if (own(input, "ownerOnly")) next.ownerOnly = ownerOnly(input.ownerOnly);
    if (own(input, "expiresAt")) next.expiresAt = expiry(input.expiresAt);
    if (own(input, "state")) {
      if (!["active", "revoked"].includes(input.state)) fail("invalid_state");
      if (input.state === "active" && value.state !== "active") fail("rotate_to_reopen", 409);
      next.state = input.state;
    }
    return json({ ok: true, item: ownerView(await save(env, entry, next)) });
  }
  if (parts[1] === "rotate" && parts.length === 2 && method === "POST") {
    const input = await body(request); compareRevision(value, input);
    if (Date.parse(value.expiresAt) <= Date.now()) fail("update_expiry_first", 409);
    const token = randomToken(), next = await save(env, entry, { ...value, state: "active", tokenHash: await hash(token) });
    return json({ ok: true, item: ownerView(next), url: shareUrl(request, value.id, token) });
  }
  if (parts[1] === "models" && parts.length === 2 && method === "POST") return json({ ok: true, item: ownerView(await importModel(request, env, cookie, entry, await body(request))) });
  if (parts[1] === "models" && parts.length === 3 && ID.test(parts[2]) && method === "DELETE") {
    const input = await body(request); compareRevision(value, input);
    if (!value.models.some(model => model.id === parts[2])) fail("not_found", 404);
    const selection = value.selection?.modelIds.includes(parts[2]) ? null : value.selection;
    return json({ ok: true, item: ownerView(await save(env, entry, { ...value, models: value.models.filter(model => model.id !== parts[2]), selection })) });
  }
  fail("not_found", 404);
}
function idList(value, max) {
  if (!Array.isArray(value) || value.length > max || value.some(id => typeof id !== "string" || !ID.test(id)) || new Set(value).size !== value.length) fail("invalid_selection");
  return value;
}
async function partnerRoute(request, env, parts) {
  if (!parts.length) fail("not_found", 404);
  const entry = await partnerEntry(request, env, parts[0]), value = entry.value, method = request.method;
  if (parts[1] === "view" && parts.length === 2 && ["GET", "HEAD"].includes(method)) return json(partnerView(value));
  if (parts[1] === "media" && ID.test(parts[2] || "") && (parts.length === 3 || (parts.length === 4 && parts[3] === "download")) && ["GET", "HEAD"].includes(method)) return media(request, env, value, parts[2], parts[3] === "download", false);
  if (parts[1] === "brief" && parts.length === 2 && method === "POST") {
    const input = await body(request); compareRevision(value, input);
    const next = await save(env, entry, { ...value, brief: brief(input.brief) });
    return json({ ok: true, revision: next.revision, brief: next.brief });
  }
  if (parts[1] === "selection" && parts.length === 2 && method === "POST") {
    const input = await body(request), modelIds = idList(input.modelIds, 30), photoIds = idList(input.photoIds || [], 360), note = text(input.note, 1000);
    const idempotencyKey = text(input.idempotencyKey, 100, true);
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey) || !modelIds.length) fail("invalid_selection");
    const fingerprint = await hash(JSON.stringify({ modelIds, photoIds, note }));
    const old = value.receipts.find(receipt => receipt.key === idempotencyKey);
    if (old) {
      if (old.fingerprint !== fingerprint) fail("idempotency_conflict", 409);
      return json({ ok: true, receiptId: old.receiptId, revision: value.revision, duplicate: true });
    }
    compareRevision(value, input);
    if (value.receipts.length >= 100) fail("submission_limit", 429);
    const models = modelIds.map(id => value.models.find(model => model.id === id));
    if (models.some(model => !model || model.display.status === "unavailable")) fail("selection_not_available", 409);
    const permitted = new Set(models.flatMap(model => model.photos.filter(photo => photo.shareAllowed).map(photo => photo.id)));
    if (photoIds.some(id => !permitted.has(id))) fail("photo_not_in_selection", 403);
    const receiptId = randomId(), selection = { receiptId, modelIds, photoIds, note, submittedAt: now() };
    const next = await save(env, entry, { ...value, selection, receipts: [...value.receipts, { key: idempotencyKey, fingerprint, receiptId }] });
    return json({ ok: true, receiptId, revision: next.revision });
  }
  fail("not_found", 404);
}
export async function handleShortlist(request, env = {}) {
  try {
    checkOrigin(request);
    if (!["GET", "HEAD", "POST", "PATCH", "DELETE"].includes(request.method)) fail("method_not_allowed", 405);
    const url = new URL(request.url), path = url.pathname.replace(/\/+$/, "");
    // A token is accepted only in the Authorization header, never a query or cookie.
    if (url.searchParams.has("t") || url.searchParams.has("token")) fail("token_header_required", 400);
    let response;
    if (path === OWNER_API || path.startsWith(OWNER_API + "/")) response = await ownerRoute(request, env, path.slice(OWNER_API.length).split("/").filter(Boolean));
    else if (path.startsWith(PARTNER_API + "/")) response = await partnerRoute(request, env, path.slice(PARTNER_API.length).split("/").filter(Boolean));
    else fail("not_found", 404);
    return request.method === "HEAD" ? new Response(null, response) : response;
  } catch (error) {
    const response = json({ ok: false, error: error.code || "shortlist_unavailable" }, error.status || 503);
    return request.method === "HEAD" ? new Response(null, response) : response;
  }
}
export default { fetch: handleShortlist };
