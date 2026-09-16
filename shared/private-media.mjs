// Private originals never share the public model bucket or a browser authority.
export const PRIVATE_MEDIA_BUCKET = "mmd-private-model-media";
export const PRIVATE_UPLOAD_TTL_MS = 30 * 60 * 1000;
const MIME = new Map([["image/jpeg", ["jpg", 15 * 1024 ** 2]], ["image/png", ["png", 15 * 1024 ** 2]], ["image/webp", ["webp", 15 * 1024 ** 2]], ["video/mp4", ["mp4", 25 * 1024 ** 2]]]);
export function mediaError(code, status = 409) { return Object.assign(new Error(code), { code, status }); }
export function mediaTable(env) { return env.AIRTABLE_TABLE_MODEL_MEDIA_ASSETS || env.AIRTABLE_TABLE_MODEL_MEDIA || "tblrpQXhHnbTU9RhW"; }
export function privateBucket(env) {
  if (!env.PRIVATE_MODEL_MEDIA?.head || !env.PRIVATE_MODEL_MEDIA?.get) throw mediaError("private_media_storage_unavailable", 503);
  return env.PRIVATE_MODEL_MEDIA;
}
export function mediaKind(mime) { return mime === "video/mp4" ? "private_clip" : MIME.has(mime) ? "private_pic" : ""; }
export function ownedBy(fields, modelId) { return Array.isArray(fields.Model) && fields.Model.length === 1 && fields.Model[0] === modelId; }
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
  if (body.records?.length !== 1) throw mediaError("private_media_not_found", 404);
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
export async function planPrivateUpload(env, modelId, input) {
  if (!privateBucket(env).put) throw mediaError("private_media_storage_unavailable", 503);
  if (!/^rec[a-zA-Z0-9]+$/.test(modelId || "")) throw mediaError("model_identity_required", 403);
  const mime = String(input.content_type || "").toLowerCase();
  const spec = MIME.get(mime), size = input.file_size_bytes;
  if (!spec || !Number.isSafeInteger(size) || size <= 0 || size > spec[1]) throw mediaError("private_media_file_invalid", 400);
  const id = `media_${crypto.randomUUID()}`, now = new Date().toISOString();
  const fields = {
    media_id: id, Model: [modelId], media_type: "flash_preview", media_visibility: "private_candidate", asset_role: "flash_preview",
    review_status: "pending_upload", public_safe: false, private_safe: false, flash_safe: false,
    file_name: String(input.file_name || `private.${spec[0]}`).replace(/[\x00-\x1f/\\]/g, "_").slice(0, 160),
    file_type: mime, file_size_bytes: size, r2_bucket: PRIVATE_MEDIA_BUCKET,
    private_original_key: `private-model-media/${modelId}/${id}.${spec[0]}`, uploaded_at: now,
  };
  const created = await mediaRequest(env, mediaTable(env), "", { method: "POST", body: JSON.stringify({ fields, typecast: false }) });
  if (!created.id) throw mediaError("media_registry_unavailable", 503);
  return { ok: true, asset_id: id, kind: mediaKind(mime), status: "pending_upload", expires_at: new Date(Date.parse(now) + PRIVATE_UPLOAD_TTL_MS).toISOString(), upload_endpoint: `/v1/model/media/private-upload?asset_id=${encodeURIComponent(id)}`, review_required: true };
}
export async function completePrivateMetadata(env, record, modelId) {
  const f = record.fields || {};
  if (!ownedBy(f, modelId)) throw mediaError("media_owner_mismatch", 403);
  if (f.review_status !== "pending_upload") throw mediaError("media_upload_state_conflict");
  await assertPrivateObject(env, record);
  // The immutable object exists before either review metadata write. A failure
  // leaves the asset unapproved and never exposes the original to a customer.
  await mediaRequest(env, env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS || "MMD — Model Review Requests", "", {
    method: "POST", body: JSON.stringify({ fields: {
      request_id: `private_upload_${f.media_id}`, Model: [modelId], request_type: "media", request_status: "pending_review",
      requested_by: `model:${modelId}`, requested_at: new Date().toISOString(), linked_media_assets: [record.id],
      payload_json: JSON.stringify({ private_media: true, media_id: f.media_id, preview_kind: mediaKind(f.file_type), requires_per_approval: true }),
    }, typecast: false }),
  });
  await mediaRequest(env, mediaTable(env), `/${record.id}`, { method: "PATCH", body: JSON.stringify({ fields: { review_status: "pending_review", public_safe: false, private_safe: false, flash_safe: false }, typecast: false }) });
  return { ok: true, asset_id: f.media_id, status: "pending_review", review_required: true };
}
export async function uploadPrivateMedia(request, env, modelId, assetId) {
  const record = await readMedia(env, assetId), f = record.fields || {};
  if (!ownedBy(f, modelId)) throw mediaError("media_owner_mismatch", 403);
  if (f.review_status !== "pending_upload") throw mediaError("media_upload_state_conflict");
  const plannedAt = Date.parse(f.uploaded_at);
  if (!Number.isFinite(plannedAt) || plannedAt > Date.now() || plannedAt + PRIVATE_UPLOAD_TTL_MS <= Date.now()) throw mediaError("upload_plan_expired", 410);
  const spec = MIME.get(f.file_type);
  if (!spec || !Number.isSafeInteger(f.file_size_bytes) || f.file_size_bytes < 1 || f.file_size_bytes > spec[1] || request.headers.get("content-type") !== f.file_type) throw mediaError("upload_plan_mismatch", 400);
  const key = privateKey(f), bucket = privateBucket(env);
  if (await bucket.head(key)) return completePrivateMetadata(env, record, modelId);
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
  const stored = await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: f.file_type, cacheControl: "private, no-store" }, customMetadata: { media_id: assetId, model_record_id: modelId, sha256 } });
  if (!stored) throw mediaError("media_already_uploaded");
  return completePrivateMetadata(env, record, modelId);
}
