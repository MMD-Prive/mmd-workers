export const PRIVATE_MODEL_PAGE_PATH = "/sigil/apply";
export const PRIVATE_MODEL_APPLY_PATH = "/sigil/api/private-model/apply";
export const PRIVATE_MODEL_UPLOAD_URL_PATH = "/sigil/api/private-model/upload-url";
export const PRIVATE_MODEL_UPLOAD_FILE_PATH = "/sigil/api/private-model/upload-file";
export const PRIVATE_MODEL_RECEIVED_PATH = "/sigil/model/apply/private-model/received";
export const PRIVATE_MODEL_STATUS_PATH = "/sigil/apply/status";
export const PRIVATE_MODEL_SERVICE = "mmd_private_model_apply";
export const PRIVATE_MODEL_UPLOAD_SERVICE = "mmd_private_model_upload";

const LEGACY_APPLY_PATH = "/v1/private-model/apply";
const LEGACY_UPLOAD_URL_PATH = "/v1/private-model/upload-url";
const LEGACY_UPLOAD_FILE_PATH = "/v1/private-model/upload-file";
const APPLY_BODY_LIMIT = 64 * 1024;
const UPLOAD_META_BODY_LIMIT = 16 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = MAX_UPLOAD_BYTES;
const UPLOAD_TTL_SECONDS = 15 * 60;
const UPLOAD_SESSION_TTL_SECONDS = 60 * 60;
const UPLOAD_STATE_PREFIX = "sigil:private-model:upload:v1:";
const AIRTABLE_BASE_ID = "appsV1ILPRfIjkaYg";
const AIRTABLE_APPLICATION_TABLE_ID = "tblwUa8ySWln8OfaJ";
const AIRTABLE_UPLOAD_TABLE_ID = "tblEhg3dsFzPERpNQ";
const R2_BUCKET_NAME = "mmd-private-public-model-uploads";
const DEFAULT_API_BASE = "https://sigil-worker.malemodel-bkk.workers.dev";

const CONTACT_FIELDS = ["contact", "phone", "email", "line", "line_id", "telegram", "social_url", "instagram"];
const PHOTO_ROLES = new Set(["front_face", "half_body", "full_body", "lifestyle", "body_presentation", "other_photo"]);
const DOCUMENT_ROLES = new Set(["identity_document", "portfolio", "professional_certificate", "other_document"]);
const VIDEO_ROLES = new Set(["intro_video"]);
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DOCUMENT_MIME_TYPES = new Set(["application/pdf", ...PHOTO_MIME_TYPES]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const FORBIDDEN_FIELDS = new Set([
  "airtable_record_id",
  "application_id",
  "approval_status",
  "approved",
  "base64",
  "blob",
  "document_url",
  "file",
  "file_url",
  "files",
  "internal_notes",
  "object_key",
  "payload_hash",
  "permanent_file_url",
  "photo_url",
  "public_file_url",
  "r2_object_key",
  "record_id",
  "review_notes",
  "review_status",
  "status",
  "upload_status",
]);

const APPLICATION_FIELDS = Object.freeze({
  nickname: "fldUIqNSM6Z9dK8Tj",
  age: "fldSRAY0jIsd7Plq9",
  height: "fldGbBKCkWXwdAtFV",
  weight: "fldMcoQsTEGRl1eYa",
  occupation: "fldn14ahMblpFMdjQ",
  phone: "fldKt4hogB4x1R51b",
  lineId: "fldYi4U0m5j9IZbPT",
  instagram: "fldM9Gdb3dNpyzsdR",
  skills: "fldfoZLHO0ni5UO9o",
  strengths: "fldozBHoFYeWqt555",
  createdAtLegacy: "flddbmI6akcZSAPye",
  consent: "fldglLr49Qn1V16vI",
  telegram: "fldvMlJWxzumVThiq",
  applicationId: "fldE5jq01JlYtvSP7",
  applicationType: "fld3KMefCywUTNIoQ",
  handler: "fldEimjniWxflPnLz",
  payloadJson: "fldJ9ldETtMF2Qbqf",
  createdAt: "fld0WazjRPbdr3IGS",
  submittedAt: "fldRs4JdlxOdtlqp9",
  location: "fldz32ZjP0ptkHfRZ",
  intro: "fldLnSyhwpMVq6wPl",
  experience: "fldfBKS7TEZNV9yOT",
  privacyLevel: "fldj4qNE8ZfYqHsSN",
  email: "fldIoxRG37yTYnSqR",
  socialUrl: "fld7hlA4nQUfcz8gX",
  formVersion: "fldorknU7XdCVbrTN",
  consentAt: "fldr8KtcsLD6a1NCh",
  payloadHash: "fldqaQb5BMoCGF7XE",
  intakeStatus: "fldHk2h9Rf6g5UlZw",
  duplicateKey: "flddQezHdP6zdvQuZ",
  requestFingerprint: "fldcpQbNo9G0BAvlF",
  uploadSessionId: "fldg2EOpp5GEhHUdI",
  photoCount: "fldoEssk98FpMqsxo",
  bodyPhotoCount: "fldCrBc6G3BVrvrds",
  documentCount: "fldHFmaRBsfMKjfMO",
  uploadRefsJson: "fldWy3sWNyaR1uljc",
  status: "fldj2yV7EPyRn2Nu9",
  reviewStatus: "fldInXMklAz53CiCq",
  notes: "fld0C1aLDZO43i7fw",
});

const UPLOAD_FIELDS = Object.freeze({
  assetId: "fldSKeoWClypsbPNF",
  sessionId: "fldJBNWmTMk7HUFEE",
  uploadRef: "fld5IPDg3UjFZvINl",
  applicationId: "fldPCr17XtTGH52BZ",
  kind: "fldGmoadvfKK2NHJn",
  role: "fldHQSKvqJ7Vk7QQA",
  fileName: "fldMmJU6py2iMGCBC",
  contentType: "fldE0qlrPfZXzTjnp",
  fileSize: "fldBpa9ZuQV2QXxPS",
  bucket: "fldOy0nJXvYH1zzrL",
  objectKey: "fldGTJmeQkiSD4NEP",
  uploadStatus: "fldDhx8xsUUFB8D8N",
  reviewStatus: "fldJIwNkFsNKuhgp1",
  sourcePath: "fldpVrKSpFHDXBreQ",
  uploadedAt: "fldTbBcPuxCuL3PBH",
  expiresAt: "fld4FtFYVoHuF7j4h",
  payloadJson: "fldwuOKRqlaKGOkRJ",
  worker: "fld3CegYMcg4EtEnu",
});

const PRIVATE_PATHS = new Set([
  PRIVATE_MODEL_PAGE_PATH,
  `${PRIVATE_MODEL_PAGE_PATH}/`,
  PRIVATE_MODEL_APPLY_PATH,
  PRIVATE_MODEL_UPLOAD_URL_PATH,
  PRIVATE_MODEL_UPLOAD_FILE_PATH,
  PRIVATE_MODEL_RECEIVED_PATH,
  `${PRIVATE_MODEL_RECEIVED_PATH}/`,
  PRIVATE_MODEL_STATUS_PATH,
  `${PRIVATE_MODEL_STATUS_PATH}/`,
  LEGACY_APPLY_PATH,
  LEGACY_UPLOAD_URL_PATH,
  LEGACY_UPLOAD_FILE_PATH,
]);

export function isPrivateModelRequestPath(pathname = "") {
  return PRIVATE_PATHS.has(pathname);
}

export async function handlePrivateModelRequest(request, env = {}) {
  const url = new URL(request.url);
  const corsHeaders = corsFor(request, env);

  if ((url.pathname === PRIVATE_MODEL_PAGE_PATH || url.pathname === `${PRIVATE_MODEL_PAGE_PATH}/`) && ["GET", "HEAD"].includes(request.method)) {
    const response = html(renderApplyPage(env), 200, corsHeaders);
    response.headers.set("x-mmd-page", "sigil-private-model-apply");
    response.headers.set("x-mmd-route-owner", "sigil-worker");
    return request.method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
  }

  if ((url.pathname === PRIVATE_MODEL_RECEIVED_PATH || url.pathname === `${PRIVATE_MODEL_RECEIVED_PATH}/`) && ["GET", "HEAD"].includes(request.method)) {
    const response = html(renderReceivedPage(url.searchParams.get("application_id")), 200, corsHeaders);
    response.headers.set("x-mmd-page", "sigil-private-model-received");
    return request.method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
  }

  if ((url.pathname === PRIVATE_MODEL_STATUS_PATH || url.pathname === `${PRIVATE_MODEL_STATUS_PATH}/`) && ["GET", "HEAD"].includes(request.method)) {
    const response = html(renderStatusPage(url.searchParams.get("application_id")), 200, corsHeaders);
    response.headers.set("x-mmd-page", "sigil-private-model-status");
    return request.method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
  }

  if (request.method === "OPTIONS" && isPrivateModelApiPath(url.pathname)) {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!isPrivateModelApiPath(url.pathname)) return json({ ok: false, error: "not_found" }, 404, corsHeaders);
  if (!originAllowed(request, env)) return errorResponse("origin_not_allowed", 403, corsHeaders);

  if (isUploadFilePath(url.pathname)) {
    if (request.method !== "PUT") return methodNotAllowed(corsHeaders, "PUT, OPTIONS");
    return handleUploadPut(request, env, corsHeaders);
  }

  if (request.method !== "POST") return methodNotAllowed(corsHeaders, "POST, OPTIONS");
  const limit = isApplyPath(url.pathname) ? APPLY_BODY_LIMIT : UPLOAD_META_BODY_LIMIT;
  const parsed = await readJsonBody(request, limit);
  if (!parsed.ok) return errorResponse(parsed.error, parsed.status, corsHeaders);

  if (isApplyPath(url.pathname)) {
    const validation = validateApplicationPayload(parsed.value);
    if (!validation.ok) return invalidPayload(PRIVATE_MODEL_SERVICE, validation.fields, corsHeaders);
    if (!flagEnabled(env.PRIVATE_MODEL_ENABLED)) return readinessApply(corsHeaders);
    return handleProductionApply(request, parsed.value, env, corsHeaders);
  }

  const validation = validateUploadMetadata(parsed.value);
  if (!validation.ok) return invalidPayload(PRIVATE_MODEL_UPLOAD_SERVICE, validation.fields, corsHeaders);
  if (!flagEnabled(env.PRIVATE_MODEL_UPLOAD_ENABLED)) return readinessUpload(corsHeaders);
  return handleProductionUploadUrl(request, parsed.value, env, corsHeaders);
}

export async function probePrivateModelReadiness(env = {}) {
  const r2 = uploadBucket(env);
  const secret = signingSecret(env);
  const dependencies = {
    airtable: Boolean(env.AIRTABLE_API_TOKEN),
    kv: Boolean(env.SIGIL_BOARD_KV),
    coordinator: Boolean(env.PUBLIC_MODEL_COORDINATOR),
    r2: Boolean(r2),
    signing_secret: Boolean(secret),
  };
  const coreReady = dependencies.airtable && dependencies.kv && dependencies.coordinator;
  return {
    private_model_apply: flagEnabled(env.PRIVATE_MODEL_ENABLED) && coreReady,
    private_model_upload: flagEnabled(env.PRIVATE_MODEL_UPLOAD_ENABLED) && coreReady && dependencies.r2 && dependencies.signing_secret,
    dependencies,
  };
}

async function handleProductionApply(request, body, env, corsHeaders) {
  if (!env.AIRTABLE_API_TOKEN || !env.SIGIL_BOARD_KV || !env.PUBLIC_MODEL_COORDINATOR) {
    return unavailable("persistence_not_configured", PRIVATE_MODEL_SERVICE, corsHeaders);
  }

  let reservedUploads = [];
  let applicationId = "";
  try {
    const fingerprint = await requestFingerprint(request, env);
    if (await rateLimited(env, `private-model:apply:${fingerprint}`, 5, 60 * 60)) {
      return errorResponse("rate_limited", 429, corsHeaders);
    }

    const now = new Date().toISOString();
    const normalized = normalizeApplication(body);
    const payloadHash = await sha256Hex(stableJson(normalized));
    const duplicateKey = await sha256Hex(CONTACT_FIELDS.map((field) => normalizeContact(body[field])).filter(Boolean).sort().join("|"));
    const persistedApplication = await findApplicationByHash(env, payloadHash);
    const persistedApplicationId = boundedString(persistedApplication?.fields?.[APPLICATION_FIELDS.applicationId], 120);
    const proposedApplicationId = validRef(persistedApplicationId, "pma")
      ? persistedApplicationId
      : `pma_${compactUtcDate(new Date())}_${randomId(12)}`;
    const idempotencyScope = `private-model:idempotency:${payloadHash}`;
    const prepared = await coordinatorRequest(env, idempotencyScope, "/idempotency/prepare", { application_id: proposedApplicationId });
    applicationId = prepared.application_id;

    const uploads = await verifyUploads(body, env, applicationId);
    if (!uploads.ok) return invalidPayload(PRIVATE_MODEL_SERVICE, { upload_refs: uploads.error }, corsHeaders);
    reservedUploads = uploads.items;

    const fields = applicationAirtableFields(body, normalized, uploads.items, {
      applicationId,
      duplicateKey,
      fingerprint,
      now,
      payloadHash,
    });
    const committed = await coordinatorRequest(env, idempotencyScope, "/idempotency/commit", {
      application_id: applicationId,
      payload_hash: payloadHash,
      fields,
    });

    await attachUploads(env, uploads.items, applicationId);
    reservedUploads = [];
    return successResponse(request.url, applicationId, committed.duplicate, corsHeaders);
  } catch (error) {
    if (reservedUploads.length && applicationId) await releaseUploadReservations(env, reservedUploads, applicationId).catch(() => {});
    console.error(JSON.stringify({ event: "private_model_apply_failed", application_id: applicationId || null, error: safeError(error) }));
    return unavailable("persistence_failed", PRIVATE_MODEL_SERVICE, corsHeaders);
  }
}

async function handleProductionUploadUrl(request, body, env, corsHeaders) {
  const r2 = uploadBucket(env);
  const secret = signingSecret(env);
  if (!r2 || !env.SIGIL_BOARD_KV || !env.PUBLIC_MODEL_COORDINATOR || !secret || !env.AIRTABLE_API_TOKEN) {
    return unavailable("upload_not_configured", PRIVATE_MODEL_UPLOAD_SERVICE, corsHeaders);
  }

  try {
    const fingerprint = await requestFingerprint(request, env);
    if (await rateLimited(env, `private-model:upload:${fingerprint}`, 30, 60 * 60)) {
      return errorResponse("rate_limited", 429, corsHeaders);
    }

    const kind = normalizeToken(body.kind);
    const role = normalizeToken(body.role);
    const contentType = normalizeMime(body.content_type ?? body.contentType ?? body.mime_type);
    const fileSize = Number(body.file_size ?? body.fileSize);
    const fileName = boundedString(body.file_name ?? body.fileName, 240);
    const sessionId = validRef(body.upload_session_id, "pmu") ? body.upload_session_id : `pmu_${randomId(20)}`;
    const uploadRef = `pmu_ref_${randomId(24)}`;
    const expires = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS;
    const objectKey = objectKeyFor(sessionId, uploadRef, contentType);
    const signature = await uploadSignature(secret, { sessionId, uploadRef, expires, contentType, fileSize });
    const uploadUrl = new URL(PRIVATE_MODEL_UPLOAD_FILE_PATH, request.url);
    uploadUrl.searchParams.set("upload_session_id", sessionId);
    uploadUrl.searchParams.set("upload_ref", uploadRef);
    uploadUrl.searchParams.set("expires", String(expires));
    uploadUrl.searchParams.set("signature", signature);

    const metadata = {
      sessionId,
      uploadRef,
      kind,
      role,
      contentType,
      fileSize,
      fileName,
      objectKey,
      status: "issued",
      expires,
      sourcePath: boundedString(body.source_path || PRIVATE_MODEL_PAGE_PATH, 160),
    };
    await env.SIGIL_BOARD_KV.put(uploadStateKey(uploadRef), JSON.stringify(metadata), { expirationTtl: UPLOAD_SESSION_TTL_SECONDS });

    return json({
      ok: true,
      service: PRIVATE_MODEL_UPLOAD_SERVICE,
      mode: "upload_authorized",
      upload_session_id: sessionId,
      upload_ref: uploadRef,
      upload_url: uploadUrl.toString(),
      upload_method: "PUT",
      required_headers: { "content-type": contentType },
      expires_at: new Date(expires * 1000).toISOString(),
    }, 200, corsHeaders);
  } catch (error) {
    console.error(JSON.stringify({ event: "private_model_upload_authorization_failed", error: safeError(error) }));
    return unavailable("upload_authorization_failed", PRIVATE_MODEL_UPLOAD_SERVICE, corsHeaders);
  }
}

async function handleUploadPut(request, env, corsHeaders) {
  const r2 = uploadBucket(env);
  const secret = signingSecret(env);
  if (!flagEnabled(env.PRIVATE_MODEL_UPLOAD_ENABLED) || !r2 || !env.SIGIL_BOARD_KV || !env.PUBLIC_MODEL_COORDINATOR || !secret || !env.AIRTABLE_API_TOKEN) {
    return unavailable("upload_not_configured", PRIVATE_MODEL_UPLOAD_SERVICE, corsHeaders);
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("upload_session_id") || "";
  const uploadRef = url.searchParams.get("upload_ref") || "";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") || "";
  if (!validRef(sessionId, "pmu") || !validRef(uploadRef, "pmu_ref") || !Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
    return errorResponse("invalid_upload_authorization", 403, corsHeaders);
  }

  const metadata = parseObject(await env.SIGIL_BOARD_KV.get(uploadStateKey(uploadRef)));
  if (!metadata || metadata.sessionId !== sessionId || metadata.uploadRef !== uploadRef || !["issued", "uploaded"].includes(metadata.status) || metadata.expires !== expires) {
    return errorResponse("invalid_upload_authorization", 403, corsHeaders);
  }
  const expected = await uploadSignature(secret, metadata);
  if (!constantTimeEqual(signature, expected)) return errorResponse("invalid_upload_authorization", 403, corsHeaders);

  const contentType = normalizeMime(request.headers.get("content-type"));
  const contentLength = Number(request.headers.get("content-length"));
  if (contentType !== metadata.contentType || !Number.isFinite(contentLength) || contentLength !== metadata.fileSize || contentLength > maxUploadBytesFor(metadata.kind) || !request.body) {
    return errorResponse("upload_metadata_mismatch", 400, corsHeaders);
  }

  const uploadScope = `private-model:upload:${uploadRef}`;
  const claim = await coordinatorRequest(env, uploadScope, "/upload/claim", { expires });
  if (claim.state === "complete") {
    return json({ ok: true, service: PRIVATE_MODEL_UPLOAD_SERVICE, upload_ref: uploadRef, uploaded: true, duplicate: true }, 200, corsHeaders);
  }
  if (claim.state !== "acquired") return errorResponse("upload_in_progress", 409, corsHeaders);

  let persistedUpload = null;
  try {
    await r2.put(metadata.objectKey, request.body, {
      httpMetadata: { contentType: metadata.contentType },
      customMetadata: { upload_session_id: metadata.sessionId, upload_ref: metadata.uploadRef, kind: metadata.kind, role: metadata.role, application_type: "private_model" },
    });

    const uploadedAt = new Date().toISOString();
    persistedUpload = await findUploadByRef(env, uploadRef);
    if (!persistedUpload) {
      persistedUpload = await createAirtableRecord(env, AIRTABLE_UPLOAD_TABLE_ID, {
        [UPLOAD_FIELDS.assetId]: `pmua_${randomId(20)}`,
        [UPLOAD_FIELDS.sessionId]: metadata.sessionId,
        [UPLOAD_FIELDS.uploadRef]: metadata.uploadRef,
        [UPLOAD_FIELDS.kind]: metadata.kind,
        [UPLOAD_FIELDS.role]: metadata.role,
        [UPLOAD_FIELDS.fileName]: metadata.fileName,
        [UPLOAD_FIELDS.contentType]: metadata.contentType,
        [UPLOAD_FIELDS.fileSize]: metadata.fileSize,
        [UPLOAD_FIELDS.bucket]: R2_BUCKET_NAME,
        [UPLOAD_FIELDS.objectKey]: metadata.objectKey,
        [UPLOAD_FIELDS.uploadStatus]: "uploaded",
        [UPLOAD_FIELDS.reviewStatus]: "pending_review",
        [UPLOAD_FIELDS.sourcePath]: metadata.sourcePath,
        [UPLOAD_FIELDS.uploadedAt]: uploadedAt,
        [UPLOAD_FIELDS.expiresAt]: new Date(metadata.expires * 1000).toISOString(),
        [UPLOAD_FIELDS.payloadJson]: JSON.stringify({ application_type: "private_model", kind: metadata.kind, role: metadata.role, content_type: metadata.contentType, file_size_bytes: metadata.fileSize }),
        [UPLOAD_FIELDS.worker]: "sigil-worker",
      });
    }

    const next = { ...metadata, status: "uploaded", uploadedAt, airtableRecordId: persistedUpload.id };
    await env.SIGIL_BOARD_KV.put(uploadStateKey(uploadRef), JSON.stringify(next), { expirationTtl: UPLOAD_SESSION_TTL_SECONDS });
    await coordinatorRequest(env, uploadScope, "/upload/complete", {});
    return json({ ok: true, service: PRIVATE_MODEL_UPLOAD_SERVICE, upload_ref: uploadRef, uploaded: true }, 200, corsHeaders);
  } catch (error) {
    if (!persistedUpload) await r2.delete(metadata.objectKey).catch(() => {});
    await coordinatorRequest(env, uploadScope, "/upload/release", {}).catch(() => {});
    console.error(JSON.stringify({ event: "private_model_upload_failed", error: safeError(error) }));
    return unavailable("upload_persistence_failed", PRIVATE_MODEL_UPLOAD_SERVICE, corsHeaders);
  }
}

function validateApplicationPayload(body) {
  const fields = {};
  if (body.application_type !== undefined && body.application_type !== "private_model") fields.application_type = "must be private_model";
  const nickname = body.nickname ?? body.name;
  if (!nonEmptyString(nickname, 120)) fields.nickname = "required";
  if (body.consent !== true) fields.consent = "must be true";
  if (!CONTACT_FIELDS.some((field) => nonEmptyString(body[field], 500))) fields.contact = "one contact channel is required";
  if (body.form_version !== undefined && body.form_version !== "private-model-apply-v1") fields.form_version = "unsupported form version";
  const forbidden = findForbiddenField(body);
  if (forbidden) fields.forbidden_field = "contains server-controlled or raw upload field";
  const refs = validateUploadRefs(body);
  if (refs) fields.upload_refs = refs;
  return { ok: Object.keys(fields).length === 0, fields };
}

function validateUploadMetadata(body) {
  const fields = {};
  if (body.application_type !== "private_model") fields.application_type = "must be private_model";
  if (body.consent !== true) fields.consent = "must be true";
  const rawMime = body.content_type ?? body.contentType ?? body.mime_type;
  const rawSize = body.file_size ?? body.fileSize;
  const rawName = body.file_name ?? body.fileName;
  const kind = normalizeToken(body.kind);
  const role = normalizeToken(body.role);
  const mime = normalizeMime(rawMime);
  const size = typeof rawSize === "number" ? rawSize : Number.NaN;
  const name = boundedString(rawName, 240);
  if (!["photo", "document", "video"].includes(kind)) fields.kind = "unsupported kind";
  if (!roleAllowed(kind, role)) fields.role = "unsupported role for kind";
  if (!mimeAllowed(kind, mime)) fields.content_type = "unsupported content type for kind";
  if (!Number.isFinite(size) || size <= 0 || size > maxUploadBytesFor(kind)) fields.file_size = "must be positive and within the approved size limit";
  if (!name || /[/\\]/.test(name) || name === "." || name === "..") fields.file_name = "plain filename is required";
  if (findForbiddenField(body, new Set(["file_name"]))) fields.upload_payload = "contains unsupported upload field";
  return { ok: Object.keys(fields).length === 0, fields };
}

function validateUploadRefs(body) {
  const sessionId = body.upload_session_id;
  const refs = body.uploads ?? body.upload_refs ?? body.uploadRefs;
  if (sessionId === undefined && refs === undefined) return "";
  if (sessionId !== undefined && !validRef(sessionId, "pmu")) return "invalid upload_session_id";
  if (refs === undefined) return "";
  if (!Array.isArray(refs)) return "must be an array";
  if (refs.length > 12) return "too many upload refs";
  for (const item of refs) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return "contains invalid upload ref";
    const uploadRef = item.upload_ref ?? item.uploadRef;
    if (!validRef(uploadRef, "pmu_ref")) return "contains invalid upload_ref";
    if (!roleAllowed(normalizeToken(item.kind), normalizeToken(item.role))) return "contains unsupported kind or role";
    if (findForbiddenField(item)) return "contains unsupported upload field";
  }
  return "";
}

async function verifyUploads(body, env, applicationId) {
  const refs = body.uploads ?? body.upload_refs ?? body.uploadRefs ?? [];
  const required = flagEnabled(env.PRIVATE_MODEL_UPLOAD_REQUIRED);
  if (!refs.length) return required ? { ok: false, error: "at least one verified applicant photo is required" } : { ok: true, items: [] };
  const r2 = uploadBucket(env);
  if (!r2 || !env.SIGIL_BOARD_KV || !env.PUBLIC_MODEL_COORDINATOR) return { ok: false, error: "upload verification is not configured" };
  const sessionId = body.upload_session_id;
  const items = [];

  for (const ref of refs) {
    const uploadRef = ref.upload_ref ?? ref.uploadRef;
    const metadata = parseObject(await env.SIGIL_BOARD_KV.get(uploadStateKey(uploadRef)));
    if (!metadata || metadata.sessionId !== sessionId || metadata.uploadRef !== uploadRef || !["uploaded", "attached"].includes(metadata.status)) {
      return { ok: false, error: "contains unknown or incomplete upload_ref" };
    }
    if (metadata.status === "attached" && metadata.applicationId !== applicationId) return { ok: false, error: "contains upload_ref attached to another application" };
    if (metadata.kind !== normalizeToken(ref.kind) || metadata.role !== normalizeToken(ref.role)) return { ok: false, error: "contains mismatched upload metadata" };
    const object = await r2.head(metadata.objectKey);
    if (!object || object.size !== metadata.fileSize) return { ok: false, error: "contains missing upload object" };
    items.push(metadata);
  }

  if (required && !items.some((item) => item.kind === "photo")) return { ok: false, error: "at least one verified applicant photo is required" };
  const reserved = [];
  try {
    for (const item of items) {
      const result = await coordinatorRequest(env, `private-model:upload:${item.uploadRef}`, "/upload/reserve-attachment", {
        application_id: applicationId,
        bootstrap_status: item.status,
        bootstrap_application_id: item.applicationId,
      });
      if (!["reserved", "attached"].includes(result.state)) {
        await releaseUploadReservations(env, reserved, applicationId);
        return { ok: false, error: "contains upload_ref reserved by another application" };
      }
      reserved.push(item);
    }
  } catch (error) {
    await releaseUploadReservations(env, reserved, applicationId);
    throw error;
  }
  return { ok: true, items };
}

async function releaseUploadReservations(env, uploads, applicationId) {
  await Promise.allSettled(uploads.map((item) => coordinatorRequest(env, `private-model:upload:${item.uploadRef}`, "/upload/release-attachment", { application_id: applicationId })));
}

async function attachUploads(env, uploads, applicationId) {
  for (const item of uploads) {
    const next = { ...item, status: "attached", applicationId };
    if (item.airtableRecordId) {
      await updateAirtableRecord(env, AIRTABLE_UPLOAD_TABLE_ID, item.airtableRecordId, {
        [UPLOAD_FIELDS.applicationId]: applicationId,
        [UPLOAD_FIELDS.uploadStatus]: "attached",
      });
    }
    await env.SIGIL_BOARD_KV.put(uploadStateKey(item.uploadRef), JSON.stringify(next), { expirationTtl: 7 * 24 * 60 * 60 });
    await coordinatorRequest(env, `private-model:upload:${item.uploadRef}`, "/upload/complete-attachment", { application_id: applicationId });
  }
}

function applicationAirtableFields(body, normalized, uploads, context) {
  const fields = {
    [APPLICATION_FIELDS.nickname]: normalized.nickname,
    [APPLICATION_FIELDS.consent]: true,
    [APPLICATION_FIELDS.applicationId]: context.applicationId,
    [APPLICATION_FIELDS.applicationType]: "private_model",
    [APPLICATION_FIELDS.handler]: "TarT",
    [APPLICATION_FIELDS.createdAtLegacy]: context.now,
    [APPLICATION_FIELDS.createdAt]: context.now,
    [APPLICATION_FIELDS.submittedAt]: context.now,
    [APPLICATION_FIELDS.consentAt]: context.now,
    [APPLICATION_FIELDS.payloadHash]: context.payloadHash,
    [APPLICATION_FIELDS.intakeStatus]: "private_review_pending",
    [APPLICATION_FIELDS.status]: "New",
    [APPLICATION_FIELDS.reviewStatus]: "pending_review",
    [APPLICATION_FIELDS.duplicateKey]: context.duplicateKey,
    [APPLICATION_FIELDS.requestFingerprint]: context.fingerprint,
    [APPLICATION_FIELDS.formVersion]: normalized.form_version,
    [APPLICATION_FIELDS.payloadJson]: JSON.stringify(redactedPayload(normalized)),
    [APPLICATION_FIELDS.photoCount]: uploads.filter((item) => item.kind === "photo").length,
    [APPLICATION_FIELDS.bodyPhotoCount]: uploads.filter((item) => item.role === "body_presentation").length,
    [APPLICATION_FIELDS.documentCount]: uploads.filter((item) => item.kind === "document").length,
    [APPLICATION_FIELDS.uploadRefsJson]: JSON.stringify(uploads.map((item) => ({ upload_ref: item.uploadRef, kind: item.kind, role: item.role }))),
    [APPLICATION_FIELDS.notes]: buildNotes(body),
  };
  assign(fields, APPLICATION_FIELDS.age, numberOrUndefined(body.age, 18, 100));
  assign(fields, APPLICATION_FIELDS.height, numberOrUndefined(body.height_cm ?? body.height, 100, 250));
  assign(fields, APPLICATION_FIELDS.weight, numberOrUndefined(body.weight_kg ?? body.weight, 30, 300));
  assign(fields, APPLICATION_FIELDS.occupation, boundedString(body.occupation, 240));
  assign(fields, APPLICATION_FIELDS.phone, boundedString(body.phone, 120));
  assign(fields, APPLICATION_FIELDS.lineId, boundedString(body.line_id || body.line, 160));
  assign(fields, APPLICATION_FIELDS.instagram, boundedString(body.instagram, 500));
  assign(fields, APPLICATION_FIELDS.telegram, boundedString(body.telegram, 160));
  assign(fields, APPLICATION_FIELDS.email, boundedString(body.email, 320));
  assign(fields, APPLICATION_FIELDS.socialUrl, boundedString(body.social_url, 2000));
  assign(fields, APPLICATION_FIELDS.skills, boundedString(body.skills, 4000));
  assign(fields, APPLICATION_FIELDS.strengths, boundedString(body.strengths, 4000));
  assign(fields, APPLICATION_FIELDS.location, boundedString(body.location || body.city, 500));
  assign(fields, APPLICATION_FIELDS.intro, boundedString(body.intro || body.reason, 4000));
  assign(fields, APPLICATION_FIELDS.experience, boundedString(body.experience, 4000));
  assign(fields, APPLICATION_FIELDS.privacyLevel, boundedString(body.privacy_level || "private_review", 160));
  assignContactFallback(fields, body);
  if (uploads[0]) fields[APPLICATION_FIELDS.uploadSessionId] = uploads[0].sessionId;
  return fields;
}

function buildNotes(body) {
  const chunks = [
    "Source: /sigil/apply",
    "Lane: private_model",
    "Review owner: TarT",
  ];
  const reason = boundedString(body.reason, 1500);
  const note = boundedString(body.note, 2000);
  if (reason) chunks.push(`Reason: ${reason}`);
  if (note) chunks.push(`Applicant note: ${note}`);
  const genericContact = boundedString(body.contact, 500);
  if (genericContact) chunks.push(`Contact: ${genericContact}`);
  return chunks.join("\n").slice(0, 8000);
}

function assignContactFallback(fields, body) {
  const contact = boundedString(body.contact, 500);
  if (!contact) return;
  if (!fields[APPLICATION_FIELDS.email] && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    fields[APPLICATION_FIELDS.email] = contact;
    return;
  }
  if (!fields[APPLICATION_FIELDS.phone] && /^[+()\d\s.-]{7,40}$/.test(contact)) {
    fields[APPLICATION_FIELDS.phone] = contact;
    return;
  }
  if (!fields[APPLICATION_FIELDS.lineId]) fields[APPLICATION_FIELDS.lineId] = contact.slice(0, 160);
}

function normalizeApplication(body) {
  const output = {};
  for (const key of Object.keys(body).sort()) {
    if (["page_url", "submitted_at", "timezone", "user_agent", "language"].includes(key)) continue;
    output[key] = normalizeValue(body[key]);
  }
  output.application_type = "private_model";
  output.form_version = boundedString(body.form_version || "private-model-apply-v1", 80);
  output.nickname = boundedString(body.nickname || body.name, 120);
  return output;
}

function redactedPayload(normalized) {
  const hidden = new Set(CONTACT_FIELDS);
  return Object.fromEntries(Object.entries(normalized).filter(([key]) => !hidden.has(key)));
}

async function findApplicationByHash(env, payloadHash) {
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{payload_hash}="${payloadHash}"`,
    returnFieldsByFieldId: "true",
  });
  const data = await airtableRequest(env, `${AIRTABLE_APPLICATION_TABLE_ID}?${params}`);
  return data.records?.[0] || null;
}

async function findUploadByRef(env, uploadRef) {
  const escaped = uploadRef.replace(/'/g, "\\'");
  const params = new URLSearchParams({ maxRecords: "1", filterByFormula: `{upload_ref}='${escaped}'`, returnFieldsByFieldId: "true" });
  const data = await airtableRequest(env, `${AIRTABLE_UPLOAD_TABLE_ID}?${params}`);
  return data.records?.[0] || null;
}

async function createAirtableRecord(env, tableId, fields) {
  const data = await airtableRequest(env, `${tableId}?returnFieldsByFieldId=true`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  if (!data.records?.[0]) throw new Error("airtable_create_failed");
  return data.records[0];
}

async function updateAirtableRecord(env, tableId, recordId, fields) {
  return airtableRequest(env, `${tableId}/${encodeURIComponent(recordId)}?returnFieldsByFieldId=true`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: false }),
  });
}

async function airtableRequest(env, path, init = {}) {
  const fetcher = typeof env.AIRTABLE_FETCH === "function" ? env.AIRTABLE_FETCH : fetch;
  const response = await fetcher(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`airtable_http_${response.status}`);
  return response.json();
}

async function rateLimited(env, suffix, limit, windowSeconds) {
  const result = await coordinatorRequest(env, `rate:${suffix}`, "/rate-limit", { limit, window_seconds: windowSeconds });
  return result.limited === true;
}

async function coordinatorRequest(env, scope, path, body) {
  if (!env.PUBLIC_MODEL_COORDINATOR) throw new Error("model_coordinator_missing");
  const id = env.PUBLIC_MODEL_COORDINATOR.idFromName(scope);
  const response = await env.PUBLIC_MODEL_COORDINATOR.get(id).fetch(`https://public-model-coordinator${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`model_coordinator_${response.status}`);
  const result = await response.json();
  if (!result?.ok) throw new Error("model_coordinator_failed");
  return result;
}

async function requestFingerprint(request, env) {
  const input = [request.headers.get("cf-connecting-ip") || "unknown", request.headers.get("user-agent") || "", signingSecret(env) || "sigil-private-model"].join("|");
  return (await sha256Hex(input)).slice(0, 32);
}

async function uploadSignature(secret, metadata) {
  const data = [metadata.sessionId, metadata.uploadRef, metadata.expires, metadata.contentType, metadata.fileSize].join("\n");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(signature));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return bytesToHex(new Uint8Array(digest));
}

async function readJsonBody(request, limit) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { ok: false, error: "unsupported_content_type", status: 415 };
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) return { ok: false, error: "payload_too_large", status: 413 };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit) return { ok: false, error: "payload_too_large", status: 413 };
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "invalid_json", status: 400 };
    return { ok: true, value };
  } catch {
    return { ok: false, error: "invalid_json", status: 400 };
  }
}

function findForbiddenField(value, allowed = new Set()) {
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    for (const [key, item] of Object.entries(current)) {
      const normalized = normalizeFieldName(key);
      if (!allowed.has(normalized) && FORBIDDEN_FIELDS.has(normalized)) return normalized;
      if (typeof item === "string" && /^(data:|blob:)/i.test(item.trim())) return normalized;
      if (item && typeof item === "object") stack.push(item);
    }
  }
  return "";
}

function originAllowed(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  return allowed.includes(origin);
}

function corsFor(request, env) {
  const headers = new Headers({
    "access-control-allow-methods": "GET, HEAD, POST, PUT, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
  });
  const origin = request.headers.get("origin");
  if (origin && originAllowed(request, env)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return headers;
}

function roleAllowed(kind, role) {
  return kind === "photo"
    ? PHOTO_ROLES.has(role)
    : kind === "document"
      ? DOCUMENT_ROLES.has(role)
      : kind === "video"
        ? VIDEO_ROLES.has(role)
        : false;
}

function mimeAllowed(kind, mime) {
  return kind === "photo"
    ? PHOTO_MIME_TYPES.has(mime)
    : kind === "document"
      ? DOCUMENT_MIME_TYPES.has(mime)
      : kind === "video"
        ? VIDEO_MIME_TYPES.has(mime)
        : false;
}

function maxUploadBytesFor(kind) {
  return kind === "video" ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
}

function objectKeyFor(sessionId, uploadRef, contentType) {
  const now = new Date();
  const ext = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  }[contentType] || "bin";
  return `private-model/v1/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${sessionId}/${uploadRef}.${ext}`;
}

function uploadStateKey(uploadRef) {
  return `${UPLOAD_STATE_PREFIX}${uploadRef}`;
}

function uploadBucket(env) {
  return env.PRIVATE_MODEL_UPLOADS_R2 || env.PUBLIC_MODEL_UPLOADS_R2 || null;
}

function signingSecret(env) {
  return boundedString(env.PRIVATE_MODEL_UPLOAD_SIGNING_SECRET || env.PUBLIC_MODEL_UPLOAD_SIGNING_SECRET, 500);
}

function isPrivateModelApiPath(pathname) {
  return isApplyPath(pathname) || isUploadUrlPath(pathname) || isUploadFilePath(pathname);
}

function isApplyPath(pathname) {
  return pathname === PRIVATE_MODEL_APPLY_PATH || pathname === LEGACY_APPLY_PATH;
}

function isUploadUrlPath(pathname) {
  return pathname === PRIVATE_MODEL_UPLOAD_URL_PATH || pathname === LEGACY_UPLOAD_URL_PATH;
}

function isUploadFilePath(pathname) {
  return pathname === PRIVATE_MODEL_UPLOAD_FILE_PATH || pathname === LEGACY_UPLOAD_FILE_PATH;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(normalizeValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().slice(0, 40).map((key) => [key, normalizeValue(value[key])]));
  if (typeof value === "string") return boundedString(value, 4000);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  return null;
}

function normalizeContact(value) {
  return boundedString(value, 500).toLowerCase().replace(/\s+/g, "");
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeFieldName(value) {
  return normalizeToken(String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1_$2"));
}

function normalizeMime(value) {
  return String(value || "").trim().toLowerCase();
}

function nonEmptyString(value, maxLength) {
  return typeof value === "string" && Boolean(boundedString(value, maxLength));
}

function boundedString(value, maxLength) {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, maxLength) : "";
}

function numberOrUndefined(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

function assign(target, key, value) {
  if (value !== undefined && value !== "") target[key] = value;
}

function validRef(value, prefix) {
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{6,80}$`).test(String(value || ""));
}

function parseObject(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function randomId(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length * 0.75) + 2));
  return base64Url(bytes).slice(0, length);
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function compactUtcDate(date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("");
}

function flagEnabled(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function readinessApply(headers) {
  return json({ ok: false, error: "persistence_not_configured", service: PRIVATE_MODEL_SERVICE, mode: "readiness_only", accepted: false }, 503, headers);
}

function readinessUpload(headers) {
  return json({ ok: false, error: "upload_not_configured", service: PRIVATE_MODEL_UPLOAD_SERVICE, mode: "readiness_only", upload_enabled: false }, 503, headers);
}

function unavailable(error, service, headers) {
  return json({ ok: false, error, service, accepted: false }, 503, headers);
}

function invalidPayload(service, fields, headers) {
  return json({ ok: false, error: "invalid_payload", service, fields }, 400, headers);
}

function successResponse(requestUrl, applicationId, duplicate, headers) {
  const received = new URL(PRIVATE_MODEL_RECEIVED_PATH, requestUrl);
  received.searchParams.set("application_id", applicationId);
  const status = new URL(PRIVATE_MODEL_STATUS_PATH, requestUrl);
  status.searchParams.set("application_id", applicationId);
  return json({
    ok: true,
    service: PRIVATE_MODEL_SERVICE,
    mode: "intake_received",
    application_type: "private_model",
    application_id: applicationId,
    duplicate: Boolean(duplicate),
    status: "New",
    review_status: "pending_review",
    intake_status: "private_review_pending",
    handler: "TarT",
    storage: { persisted: true },
    received_url: received.toString(),
    status_url: status.toString(),
  }, 200, headers);
}

function errorResponse(error, status, headers, fields, service) {
  return json({ ok: false, error, ...(service ? { service } : {}), ...(fields ? { fields } : {}) }, status, headers);
}

function methodNotAllowed(headers, allow) {
  const output = new Headers(headers);
  output.set("allow", allow);
  return errorResponse("method_not_allowed", 405, output);
}

function json(body, status, headers) {
  const output = new Headers(headers);
  output.set("content-type", "application/json; charset=utf-8");
  output.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: output });
}

function html(body, status, headers) {
  const output = new Headers(headers);
  output.set("content-type", "text/html; charset=utf-8");
  output.set("cache-control", "no-store");
  output.set("x-content-type-options", "nosniff");
  return new Response(body, { status, headers: output });
}

function safeError(error) {
  return error instanceof Error ? error.message.slice(0, 200) : "unknown_error";
}

function renderApplyPage(env) {
  const apiBase = htmlEscape(boundedString(env.PRIVATE_MODEL_PUBLIC_API_BASE, 500) || DEFAULT_API_BASE);
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Private Model Application · MMD SIGIL</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090909;color:#f3efe7}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 75% 0,#241c1a 0,#0b0b0b 42%,#060606 100%);min-height:100vh}.wrap{max-width:760px;margin:auto;padding:44px 20px 72px}.eyebrow{letter-spacing:.18em;text-transform:uppercase;color:#bfae93;font-size:12px}.card{margin-top:20px;border:1px solid #302b27;border-radius:22px;padding:24px;background:rgba(18,18,18,.92);box-shadow:0 30px 80px rgba(0,0,0,.34)}h1{font-size:clamp(34px,8vw,64px);line-height:.96;margin:12px 0 14px}p{color:#bdb6aa;line-height:1.65}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.full{grid-column:1/-1}label{display:block;font-size:12px;color:#c8bdac;margin-bottom:7px}input,textarea{width:100%;border:1px solid #37312c;border-radius:12px;background:#0d0d0d;color:#fff;padding:13px 14px;font:inherit}textarea{min-height:118px;resize:vertical}.consent{display:flex;gap:10px;align-items:flex-start}.consent input{width:auto;margin-top:4px}.actions{display:flex;gap:10px;align-items:center;margin-top:18px}button{border:0;border-radius:999px;padding:13px 20px;font-weight:700;background:#f0e6d8;color:#17120e;cursor:pointer}button[disabled]{opacity:.5;cursor:wait}.status{font-size:13px;color:#c6b8a5;min-height:20px}.note{font-size:12px;color:#8f887e}@media(max-width:640px){.grid{grid-template-columns:1fr}.wrap{padding-top:28px}.card{padding:18px}}
</style></head><body><main class="wrap"><div class="eyebrow">MMD SIGIL · TarT Private Review</div><h1>Private Model Application</h1><p>ช่องทางนี้สำหรับผู้สมัครโมเดล Private เท่านั้น ข้อมูลจะเข้าสู่การตรวจสอบภายในของ MMD และอยู่ในสถานะ Waiting for review จนกว่าจะมีการพิจารณา</p>
<form id="apply" class="card"><div class="grid">
<div><label for="nickname">ชื่อเล่น / ชื่อที่ใช้สมัคร</label><input id="nickname" name="nickname" required maxlength="120"></div>
<div><label for="contact">LINE / Phone / Email / Social</label><input id="contact" name="contact" required maxlength="500"></div>
<div><label for="city">พื้นที่ / เมือง</label><input id="city" name="city" value="Bangkok" maxlength="200"></div>
<div><label for="age">อายุ</label><input id="age" name="age" inputmode="numeric" type="number" min="18" max="100"></div>
<div class="full"><label for="reason">เหตุผลที่ต้องการสมัคร Private Model</label><textarea id="reason" name="reason" maxlength="1500" required></textarea></div>
<div class="full"><label for="note">ข้อมูลเพิ่มเติม / ประสบการณ์ / เงื่อนไขที่อยากแจ้ง</label><textarea id="note" name="note" maxlength="2000"></textarea></div>
<div class="full"><label for="files">รูปสมัคร / Portfolio / เอกสาร (JPG, PNG, WEBP, PDF · สูงสุดไฟล์ละ 10MB)</label><input id="files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"><div class="note">ระบบจะอัปโหลดเข้า Private R2 ก่อนสร้างใบสมัคร</div></div>
<div class="full consent"><input id="consent" type="checkbox" required><label for="consent">ยินยอมให้ MMD ใช้ข้อมูลนี้เพื่อการคัดกรองและติดต่อเกี่ยวกับการสมัคร Private Model</label></div>
</div><div class="actions"><button id="submit" type="submit">Submit Private Application</button><div id="status" class="status" aria-live="polite"></div></div></form></main>
<script>
(() => {
  const API_BASE = ${JSON.stringify(apiBase)};
  const form = document.getElementById('apply');
  const submit = document.getElementById('submit');
  const status = document.getElementById('status');
  const photoRoles = ['front_face','half_body','full_body','lifestyle','other_photo'];
  async function api(path, init) {
    const response = await fetch(API_BASE + path, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'request_failed');
    return data;
  }
  async function uploadFiles(files) {
    let sessionId = '';
    const refs = [];
    let photoIndex = 0;
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) throw new Error('file_too_large');
      const kind = file.type === 'application/pdf' ? 'document' : 'photo';
      const role = kind === 'document' ? 'portfolio' : photoRoles[Math.min(photoIndex++, photoRoles.length - 1)];
      status.textContent = 'Uploading ' + file.name + '…';
      const ticket = await api('${PRIVATE_MODEL_UPLOAD_URL_PATH}', {
        method: 'POST', headers: {'content-type':'application/json'},
        body: JSON.stringify({ application_type:'private_model', consent:true, kind, role, file_name:file.name, content_type:file.type, file_size:file.size, upload_session_id:sessionId || undefined, source_path:'${PRIVATE_MODEL_PAGE_PATH}' })
      });
      sessionId = ticket.upload_session_id;
      const upload = await fetch(ticket.upload_url, { method:'PUT', headers:{'content-type':file.type}, body:file });
      const uploaded = await upload.json().catch(() => ({}));
      if (!upload.ok || !uploaded.ok) throw new Error(uploaded.error || 'upload_failed');
      refs.push({upload_ref:ticket.upload_ref, kind, role});
    }
    return {sessionId, refs};
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const files = Array.from(document.getElementById('files').files || []);
      const uploaded = await uploadFiles(files);
      status.textContent = 'Creating private application…';
      const payload = {
        application_type:'private_model', form_version:'private-model-apply-v1',
        nickname:document.getElementById('nickname').value.trim(),
        contact:document.getElementById('contact').value.trim(),
        city:document.getElementById('city').value.trim(),
        age:Number(document.getElementById('age').value) || undefined,
        reason:document.getElementById('reason').value.trim(),
        note:document.getElementById('note').value.trim(),
        consent:document.getElementById('consent').checked,
        upload_session_id:uploaded.sessionId || undefined,
        uploads:uploaded.refs
      };
      const result = await api('${PRIVATE_MODEL_APPLY_PATH}', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)});
      status.textContent = 'Received · ' + result.application_id;
      window.location.assign(result.received_url || result.status_url);
    } catch (error) {
      status.textContent = 'Submit failed: ' + (error && error.message ? error.message : 'unknown_error');
      submit.disabled = false;
    }
  });
})();
</script></body></html>`;
}

function renderReceivedPage(applicationId) {
  const id = validRef(applicationId, "pma") ? applicationId : "";
  return simpleStatePage("Application received", id, "Waiting for review", "TarT / MMD Private Review จะตรวจใบสมัครก่อนเข้าสู่ขั้นตอนถัดไป");
}

function renderStatusPage(applicationId) {
  const id = validRef(applicationId, "pma") ? applicationId : "";
  return simpleStatePage("Private Model status", id, "Waiting for review", "สถานะเริ่มต้นคือ pending review และไม่ได้หมายถึงการอนุมัติเป็นโมเดลแล้ว");
}

function simpleStatePage(title, applicationId, state, detail) {
  const ref = applicationId ? `<div class="ref">${htmlEscape(applicationId)}</div>` : "";
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)} · MMD SIGIL</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080808;color:#f4eee6;font-family:Inter,system-ui,sans-serif}.card{width:min(680px,calc(100% - 36px));border:1px solid #332d28;border-radius:22px;padding:28px;background:#111}.eyebrow{font-size:12px;letter-spacing:.18em;color:#b8a98f;text-transform:uppercase}h1{font-size:42px;margin:10px 0}.state{display:inline-block;padding:8px 12px;border:1px solid #51483e;border-radius:999px;color:#e8dac7}.ref{font-family:ui-monospace,monospace;color:#a99f92;margin:16px 0}p{color:#bdb5aa;line-height:1.7}a{color:#efe3d3}</style></head><body><main class="card"><div class="eyebrow">MMD SIGIL · Private Model</div><h1>${htmlEscape(title)}</h1><div class="state">${htmlEscape(state)}</div>${ref}<p>${htmlEscape(detail)}</p><p><a href="${PRIVATE_MODEL_PAGE_PATH}">Back to Private Model Application</a></p></main></body></html>`;
}

function htmlEscape(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export const privateModelTestInternals = {
  APPLICATION_FIELDS,
  UPLOAD_FIELDS,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  maxUploadBytesFor,
  validateApplicationPayload,
  validateUploadMetadata,
  normalizeApplication,
  applicationAirtableFields,
};