// Private originals never share the public model bucket or a browser authority.
import { claimModelMediaSlot, commitModelMediaSlot, releaseModelMediaSlot } from "./model-media-slot-coordinator.mjs";

export const PRIVATE_MEDIA_BUCKET = "mmd-private-model-media";
export const PRIVATE_UPLOAD_TTL_MS = 30 * 60 * 1000;
export const PRIVATE_MEDIA_CONSENT_VERSION = "mmd-private-media-v1-20260927";
export const PRIVATE_MEDIA_PURPOSES = new Set(["sigil_private_profile", "private_teaser"]);
export const PRIVATE_MEDIA_MAX_PHOTOS = 2;
export const PRIVATE_MEDIA_MAX_CLIPS = 1;
const MIME = new Map([["image/jpeg", ["jpg", 25 * 1024 ** 2]], ["image/png", ["png", 25 * 1024 ** 2]], ["image/webp", ["webp", 25 * 1024 ** 2]], ["video/mp4", ["mp4", 25 * 1024 ** 2]]]);
export function mediaError(code, status = 409) { return Object.assign(new Error(code), { code, status }); }
export function mediaTable(env) { return env.AIRTABLE_TABLE_MODEL_MEDIA_ASSETS || env.AIRTABLE_TABLE_MODEL_MEDIA || "tblrpQXhHnbTU9RhW"; }
export function privateBucket(env) {
  if (!env.PRIVATE_MODEL_MEDIA?.head || !env.PRIVATE_MODEL_MEDIA?.get) throw mediaError("private_media_storage_unavailable", 503);
  return env.PRIVATE_MODEL_MEDIA;
}
export function mediaKind(mime) { return mime === "video/mp4" ? "private_clip" : MIME.has(mime) ? "private_pic" : ""; }
export function ownedBy(fields, modelId) { return Array.isArray(fields.Model) && fields.Model.length === 1 && fields.Model[0] === modelId; }
export function retainedPrivateMedia(fields = {}) {
  return ["private_gallery", "flash_preview"].includes(fields.media_type)
    && !["rejected", "deleted", "archived"].includes(String(fields.review_status || "").trim().toLowerCase());
}
export function privateKey(fields) {
  const model = fields.Model?.[0], id = fields.media_id, ext = MIME.get(fields.file_type)?.[0];
  if (!/^rec[a-zA-Z0-9]+$/.test(model || "") || !/^media_[a-zA-Z0-9-]+$/.test(id || "") || !ext) throw mediaError("private_media_metadata_invalid");
  const key = `private-model-media/${model}/${id}.${ext}`;
  if (fields.r2_bucket !== PRIVATE_MEDIA_BUCKET || fields.private_original_key !== key) throw mediaError("private_media_storage_mismatch");
  return key;
}
export async function mediaRequest(env, table, suffix = "", init = {}) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw mediaError("media_registry_unavailable", 503);
  const response = await (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP) || fetch)(new Request(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}${suffix}`, {
    ...init, headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, "content-type": "application/json" },
  }));
  if (!response.ok) throw mediaError("media_registry_unavailable", 503);
  return response.json();
}
export async function readMedia(env, assetId) {
  if (!/^media_[a-zA-Z0-9-]+$/.test(assetId || "")) throw mediaError("media_id_invalid", 400);
  const query = new URLSearchParams({ filterByFormula: `{media_id}='${assetId}'`, maxRecords: "2" });
  const body = await mediaRequest(env, mediaTable(env), `?${query}`);
  if (body.records?.length !== 1 || body.records[0]?.fields?.media_id !== assetId) throw mediaError("private_media_not_found", 404);
  return body.records[0];
}
export async function readMediaByRecord(env, recordId) {
  if (!/^rec[a-zA-Z0-9]+$/.test(recordId || "")) throw mediaError("media_record_required", 400);
  return mediaRequest(env, mediaTable(env), `/${recordId}`);
}
export async function assertPrivateObject(env, record, approved = false, expectedKind = "") {
  const f = record?.fields || {};
  if (!["private_gallery", "flash_preview"].includes(f.media_type)) throw mediaError("private_media_policy_invalid");
  if (approved && (f.review_status !== "approved" || f.private_safe !== true)) throw mediaError("private_media_not_approved", 403);
  const kind = mediaKind(f.file_type);
  if (!kind || (expectedKind && kind !== expectedKind)) throw mediaError("private_media_kind_mismatch");
  const key = privateKey(f);
  const object = await privateBucket(env).head(key);
  if (!object || object.size !== f.file_size_bytes || object.httpMetadata?.contentType !== f.file_type || object.customMetadata?.media_id !== f.media_id || object.customMetadata?.model_record_id !== f.Model[0] || !/^[a-f0-9]{64}$/.test(object.customMetadata?.sha256 || "")) throw mediaError("private_media_object_unverified", 503);
  return { key, kind, contentType: f.file_type, size: object.size, sha256: object.customMetadata.sha256 };
}
async function listOwnedPrivateMedia(env, modelId) {
  const records = [];
  let offset = "";
  do {
    const query = new URLSearchParams({ pageSize: "100" });
    for (const field of ["media_id", "Model", "media_type", "review_status", "file_type", "file_size_bytes", "file_name", "uploaded_at", "r2_bucket", "private_original_key"]) query.append("fields[]", field);
    if (offset) query.set("offset", offset);
    const body = await mediaRequest(env, mediaTable(env), `?${query}`);
    if (!Array.isArray(body.records)) throw mediaError("media_registry_unavailable", 503);
    records.push(...body.records.filter((record) => {
      const fields = record.fields || {};
      if (!ownedBy(fields, modelId) || !retainedPrivateMedia(fields)) return false;
      if (fields.review_status === "pending_upload") {
        const plannedAt = Date.parse(fields.uploaded_at);
        if (!Number.isFinite(plannedAt) || plannedAt + PRIVATE_UPLOAD_TTL_MS <= Date.now()) return false;
      }
      return true;
    }));
    offset = String(body.offset || "");
    if (records.length > 2000) throw mediaError("media_registry_unavailable", 503);
  } while (offset);
  return records;
}
export async function privateMediaCapacity(env, modelId, kind) {
  const records = await listOwnedPrivateMedia(env, modelId);
  const photoRecords = records.filter((record) => mediaKind(record.fields?.file_type) === "private_pic");
  const clipRecords = records.filter((record) => mediaKind(record.fields?.file_type) === "private_clip");
  const photos = photoRecords.length;
  const clips = clipRecords.length;
  if (kind === "private_pic" && photos >= PRIVATE_MEDIA_MAX_PHOTOS) throw mediaError("private_photo_limit_reached");
  if (kind === "private_clip" && clips >= PRIVATE_MEDIA_MAX_CLIPS) throw mediaError("private_clip_limit_reached");
  return { photos, clips, refs: (kind === "private_clip" ? clipRecords : photoRecords).map((record) => record.fields.media_id).filter(Boolean) };
}
export async function planPrivateUpload(env, modelId, input) {
  if (!privateBucket(env).put) throw mediaError("private_media_storage_unavailable", 503);
  if (!/^rec[a-zA-Z0-9]+$/.test(modelId || "")) throw mediaError("model_identity_required", 403);
  const mime = String(input.content_type || "").toLowerCase();
  const spec = MIME.get(mime), size = input.file_size_bytes;
  if (!spec || !Number.isSafeInteger(size) || size <= 0 || size > spec[1]) throw mediaError("private_media_file_invalid", 400);
  const purpose = String(input.purpose || "").trim();
  const consentVersion = String(input.consent_version || "").trim();
  const suppliedUploadRef = String(input.upload_ref || "").trim();
  const id = suppliedUploadRef || `media_${crypto.randomUUID().replace(/-/g, "")}`;
  if (!PRIVATE_MEDIA_PURPOSES.has(purpose)) throw mediaError("private_media_purpose_invalid", 400);
  if (consentVersion !== PRIVATE_MEDIA_CONSENT_VERSION) throw mediaError("private_media_consent_required", 400);
  if (suppliedUploadRef && !/^media_[a-f0-9]{32}$/.test(id)) throw mediaError("private_media_upload_ref_invalid", 400);
  const fileName = String(input.file_name || `private.${spec[0]}`).replace(/[\x00-\x1f/\\]/g, "_").slice(0, 160);
  const expectedMediaType = purpose === "sigil_private_profile" ? "private_gallery" : "flash_preview";
  const existing = await readMedia(env, id).catch((error) => {
    if (error?.code === "private_media_not_found") return null;
    throw error;
  });
  if (existing) {
    const f = existing.fields || {};
    if (!ownedBy(f, modelId)) throw mediaError("private_media_upload_ref_conflict", 409);
    if (f.file_type !== mime || f.file_size_bytes !== size || f.file_name !== fileName || f.media_type !== expectedMediaType) throw mediaError("private_media_upload_ref_conflict", 409);
    const slotInput = { model_record_id: modelId, lane: "private", kind: mediaKind(mime) === "private_clip" ? "clip" : "photo", upload_ref: id, authoritative_refs: [id] };
    const claimed = await claimModelMediaSlot(env, slotInput);
    if (!claimed.ok) throw mediaError(claimed.error || "media_slot_claim_failed", claimed.status || 503);
    if (f.review_status === "pending_review") {
      await assertPrivateObject(env, existing);
      const committed = await commitModelMediaSlot(env, slotInput);
      if (!committed.ok) throw mediaError(committed.error || "media_slot_commit_failed", committed.status || 503);
      return { ok: true, asset_id: id, upload_ref: id, kind: mediaKind(mime), status: "pending_review", duplicate: true, upload_complete: true, review_required: true };
    }
    if (f.review_status !== "pending_upload") throw mediaError("private_media_upload_ref_conflict", 409);
    const plannedAt = Date.parse(f.uploaded_at);
    if (!Number.isFinite(plannedAt) || plannedAt + PRIVATE_UPLOAD_TTL_MS <= Date.now()) throw mediaError("upload_plan_expired", 410);
    return { ok: true, asset_id: id, upload_ref: id, kind: mediaKind(mime), status: "pending_upload", duplicate: true, expires_at: new Date(plannedAt + PRIVATE_UPLOAD_TTL_MS).toISOString(), upload_endpoint: `/v1/model/media/private-upload?asset_id=${encodeURIComponent(id)}`, review_required: true };
  }
  const kind = mediaKind(mime);
  const capacity = await privateMediaCapacity(env, modelId, kind);
  const slotKind = kind === "private_clip" ? "clip" : "photo";
  const slotInput = { model_record_id: modelId, lane: "private", kind: slotKind, upload_ref: id, authoritative_refs: capacity.refs };
  const claimed = await claimModelMediaSlot(env, slotInput);
  if (!claimed.ok) throw mediaError(claimed.error || "media_slot_claim_failed", claimed.status || 503);
  const now = new Date().toISOString();
  const profileMedia = purpose === "sigil_private_profile";
  const fields = {
    media_id: id, Model: [modelId], media_type: profileMedia ? "private_gallery" : "flash_preview", media_visibility: "private_candidate", asset_role: profileMedia ? (kind === "private_clip" ? "private_intro_video_candidate" : "private_gallery_candidate") : "flash_preview",
    review_status: "pending_upload", public_safe: false, private_safe: false, flash_safe: false, teaser_safe: false,
    file_name: fileName,
    file_type: mime, file_size_bytes: size, r2_bucket: PRIVATE_MEDIA_BUCKET,
    private_original_key: `private-model-media/${modelId}/${id}.${spec[0]}`, uploaded_at: now,
  };
  let created;
  try {
    created = await mediaRequest(env, mediaTable(env), "", { method: "POST", body: JSON.stringify({ fields, typecast: false }) });
    if (!created.id) throw mediaError("media_registry_unavailable", 503);
  } catch (error) {
    await releaseModelMediaSlot(env, slotInput).catch(() => {});
    throw error;
  }
  return { ok: true, asset_id: id, upload_ref: id, kind, status: "pending_upload", expires_at: new Date(Date.parse(now) + PRIVATE_UPLOAD_TTL_MS).toISOString(), upload_endpoint: `/v1/model/media/private-upload?asset_id=${encodeURIComponent(id)}`, review_required: true };
}
export async function completePrivateMetadata(env, record, modelId, { requestedBy, purpose = "sigil_private_profile", consentVersion = PRIVATE_MEDIA_CONSENT_VERSION } = {}) {
  const f = record.fields || {};
  if (!ownedBy(f, modelId)) throw mediaError("media_owner_mismatch", 403);
  if (f.review_status !== "pending_upload") throw mediaError("media_upload_state_conflict");
  await assertPrivateObject(env, record);
  // The immutable object exists before either review metadata write. A failure
  // leaves the asset unapproved and never exposes the original to a customer.
  await mediaRequest(env, env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS || "MMD — Model Review Requests", "", {
    method: "POST", body: JSON.stringify({ fields: {
      request_id: `private_upload_${f.media_id}`, Model: [modelId], request_type: "media", request_status: "pending_review",
      requested_by: String(requestedBy || `model:${modelId}`).slice(0, 160), requested_at: new Date().toISOString(), linked_media_assets: [record.id],
      payload_json: JSON.stringify({ private_media: true, media_lane: "private", purpose, consent_version: consentVersion, upload_ref: f.media_id, media_id: f.media_id, preview_kind: mediaKind(f.file_type), requires_per_approval: true }),
    }, typecast: false }),
  });
  await mediaRequest(env, mediaTable(env), `/${record.id}`, { method: "PATCH", body: JSON.stringify({ fields: { review_status: "pending_review", public_safe: false, private_safe: false, flash_safe: false, teaser_safe: false }, typecast: false }) });
  const slotInput = { model_record_id: modelId, lane: "private", kind: mediaKind(f.file_type) === "private_clip" ? "clip" : "photo", upload_ref: f.media_id, authoritative_refs: [f.media_id] };
  const claimed = await claimModelMediaSlot(env, slotInput);
  if (!claimed.ok) throw mediaError(claimed.error || "media_slot_claim_failed", claimed.status || 503);
  const committed = await commitModelMediaSlot(env, slotInput);
  if (!committed.ok) throw mediaError(committed.error || "media_slot_commit_failed", committed.status || 503);
  return { ok: true, asset_id: f.media_id, status: "pending_review", review_required: true };
}
export async function uploadPrivateMedia(request, env, modelId, assetId, options = {}) {
  const record = await readMedia(env, assetId), f = record.fields || {};
  if (!ownedBy(f, modelId)) throw mediaError("media_owner_mismatch", 403);
  if (f.review_status === "pending_review") {
    await assertPrivateObject(env, record);
    const slotInput = { model_record_id: modelId, lane: "private", kind: mediaKind(f.file_type) === "private_clip" ? "clip" : "photo", upload_ref: f.media_id, authoritative_refs: [f.media_id] };
    const claimed = await claimModelMediaSlot(env, slotInput);
    if (!claimed.ok) throw mediaError(claimed.error || "media_slot_claim_failed", claimed.status || 503);
    const committed = await commitModelMediaSlot(env, slotInput);
    if (!committed.ok) throw mediaError(committed.error || "media_slot_commit_failed", committed.status || 503);
    return { ok: true, asset_id: f.media_id, status: "pending_review", duplicate: true, review_required: true };
  }
  if (f.review_status !== "pending_upload") throw mediaError("media_upload_state_conflict");
  const plannedAt = Date.parse(f.uploaded_at);
  if (!Number.isFinite(plannedAt) || plannedAt > Date.now() || plannedAt + PRIVATE_UPLOAD_TTL_MS <= Date.now()) {
    await releaseModelMediaSlot(env, { model_record_id: modelId, lane: "private", kind: mediaKind(f.file_type) === "private_clip" ? "clip" : "photo", upload_ref: f.media_id, authoritative_refs: [] }).catch(() => {});
    throw mediaError("upload_plan_expired", 410);
  }
  const spec = MIME.get(f.file_type);
  if (!spec || !Number.isSafeInteger(f.file_size_bytes) || f.file_size_bytes < 1 || f.file_size_bytes > spec[1] || request.headers.get("content-type") !== f.file_type) throw mediaError("upload_plan_mismatch", 400);
  const key = privateKey(f), bucket = privateBucket(env);
  if (await bucket.head(key)) return completePrivateMetadata(env, record, modelId, options);
  const reader = request.body?.getReader();
  if (!reader) throw mediaError("file_required", 400);
  const parts = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > f.file_size_bytes) { await reader.cancel(); throw mediaError("upload_size_mismatch", 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  if (length !== f.file_size_bytes) throw mediaError("upload_size_mismatch", 400);
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  const valid = f.file_type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : f.file_type === "image/png" ? [...bytes.slice(0, 8)].join(",") === "137,80,78,71,13,10,26,10"
    : f.file_type === "image/webp" ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
    : length >= 16 && ascii(4, 8) === "ftyp";
  if (!valid) throw mediaError("media_content_type_mismatch", 415);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  const stored = await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: f.file_type, cacheControl: "private, no-store" }, customMetadata: { media_id: assetId, upload_ref: assetId, model_record_id: modelId, media_lane: "private", media_kind: mediaKind(f.file_type), purpose: options.purpose || "sigil_private_profile", consent_version: options.consentVersion || PRIVATE_MEDIA_CONSENT_VERSION, sha256 } });
  if (!stored) throw mediaError("media_already_uploaded");
  return completePrivateMetadata(env, record, modelId, options);
}
