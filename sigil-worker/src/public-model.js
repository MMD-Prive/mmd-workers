export const PUBLIC_MODEL_APPLY_PATH = "/v1/public-model/apply";
export const PUBLIC_MODEL_UPLOAD_URL_PATH = "/v1/public-model/upload-url";
export const PUBLIC_MODEL_SERVICE = "mmd_public_model_apply";
export const PUBLIC_MODEL_UPLOAD_SERVICE = "mmd_public_model_upload_url";

const APPLY_BODY_LIMIT = 64 * 1024;
const UPLOAD_META_BODY_LIMIT = 16 * 1024;
export const PUBLIC_MODEL_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_TTL_SECONDS = 15 * 60;
const UPLOAD_SESSION_TTL_SECONDS = 60 * 60;
const UPLOAD_STATE_PREFIX = "sigil:public-model:upload:v1:";
const IDEMPOTENCY_LEASE_SECONDS = 60;
const AIRTABLE_BASE_ID = "appsV1ILPRfIjkaYg";
const AIRTABLE_APPLICATION_TABLE_ID = "tblwUa8ySWln8OfaJ";
const AIRTABLE_UPLOAD_TABLE_ID = "tblEhg3dsFzPERpNQ";
const R2_BUCKET_NAME = "mmd-private-public-model-uploads";

const CONTACT_FIELDS = ["phone", "email", "line", "line_id", "telegram", "social_url", "instagram"];
export const PUBLIC_MODEL_PHOTO_ROLES = new Set(["front_face", "half_body", "full_body", "lifestyle", "sport_activity", "body_presentation", "other_photo"]);
export const PUBLIC_MODEL_DOCUMENT_ROLES = new Set([
  "trainer_certificate",
  "medical_or_therapeutic_license",
  "massage_training_certificate",
  "scuba_instructor_certificate",
  "sport_health_certificate",
  "professional_certificate",
  "other_document",
]);
export const PUBLIC_MODEL_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const PUBLIC_MODEL_DOCUMENT_MIME_TYPES = new Set(["application/pdf", ...PUBLIC_MODEL_PHOTO_MIME_TYPES]);
export const PUBLIC_MODEL_ALLOWED_WORK_TYPES = new Set([
  "Modeling",
  "Public Events",
  "Brand Appearance",
  "Fitness / Body Profile",
  "Travel / On-location",
  "Conversation / Hosting",
  "Private Review Only",
]);
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
  workType: "fldw4Sl1wrjaQDmhQ",
  privacyLevel: "fldj4qNE8ZfYqHsSN",
  experienceMonths: "fldUTqTYad7NycPV6",
  experienceYears: "fldUkJUpIpcO9rhxm",
  workedIndependently: "flde2QwGs04HB39IO",
  previousAgency: "fldbGpw6wX8xVhjwR",
  safetyAcknowledgement: "fldPUIFChzJorCSGh",
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

export async function handlePublicModelRequest(request, env, corsHeaders) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (!originAllowed(request, env)) return errorResponse("origin_not_allowed", 403, corsHeaders);

  if (url.pathname === PUBLIC_MODEL_UPLOAD_URL_PATH && request.method === "PUT") {
    return handleUploadPut(request, env, corsHeaders);
  }
  if (request.method !== "POST") return methodNotAllowed(corsHeaders, url.pathname === PUBLIC_MODEL_UPLOAD_URL_PATH ? "POST, PUT, OPTIONS" : "POST, OPTIONS");

  const parsed = await readJsonBody(request, url.pathname === PUBLIC_MODEL_APPLY_PATH ? APPLY_BODY_LIMIT : UPLOAD_META_BODY_LIMIT);
  if (!parsed.ok) {
    const service = url.pathname === PUBLIC_MODEL_APPLY_PATH ? PUBLIC_MODEL_SERVICE : PUBLIC_MODEL_UPLOAD_SERVICE;
    return errorResponse(parsed.error, parsed.status, corsHeaders, parsed.fields, service);
  }

  if (url.pathname === PUBLIC_MODEL_APPLY_PATH) {
    const validation = validateApplicationPayload(parsed.value);
    if (!validation.ok) return invalidPayload(PUBLIC_MODEL_SERVICE, validation.fields, corsHeaders);
    if (!flagEnabled(env.PUBLIC_MODEL_ENABLED)) return readinessApply(corsHeaders);
    return handleProductionApply(request, parsed.value, env, corsHeaders);
  }

  const validation = validateUploadMetadata(parsed.value);
  if (!validation.ok) return invalidPayload(PUBLIC_MODEL_UPLOAD_SERVICE, validation.fields, corsHeaders);
  if (!flagEnabled(env.PUBLIC_MODEL_UPLOAD_ENABLED)) return readinessUpload(corsHeaders);
  return handleProductionUploadUrl(request, parsed.value, env, corsHeaders);
}

export class PublicModelCoordinator {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json().catch(() => null) : null;
    if (url.pathname === "/health") return Response.json({ ok: true });
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });

    if (url.pathname === "/rate-limit") {
      const limit = Number(body.limit);
      const windowSeconds = Number(body.window_seconds);
      if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
        return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
      }
      const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
      const count = await this.state.storage.transaction(async (transaction) => {
        const stored = await transaction.get("rate");
        const current = stored?.bucket === bucket ? Number(stored.count) || 0 : 0;
        const next = current + 1;
        await transaction.put("rate", { bucket, count: next });
        return next;
      });
      return Response.json({ ok: true, limited: count > limit });
    }

    if (url.pathname === "/idempotency/begin") {
      const applicationId = boundedString(body.application_id, 120);
      if (!validRef(applicationId, "pma")) return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
      const now = Date.now();
      const result = await this.state.storage.transaction(async (transaction) => {
        const current = await transaction.get("idempotency");
        if (current?.status === "complete") return { state: "complete", application_id: current.applicationId };
        if (current?.status === "pending" && now - current.updatedAt < IDEMPOTENCY_LEASE_SECONDS * 1000) {
          return { state: "pending", application_id: current.applicationId };
        }
        const next = { status: "pending", applicationId, updatedAt: now };
        await transaction.put("idempotency", next);
        return { state: "acquired", application_id: applicationId };
      });
      return Response.json({ ok: true, ...result });
    }

    if (url.pathname === "/idempotency/complete") {
      const applicationId = boundedString(body.application_id, 120);
      if (!validRef(applicationId, "pma")) return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
      await this.state.storage.put("idempotency", { status: "complete", applicationId, updatedAt: Date.now() });
      return Response.json({ ok: true });
    }

    if (url.pathname === "/idempotency/release") {
      const applicationId = boundedString(body.application_id, 120);
      await this.state.storage.transaction(async (transaction) => {
        const current = await transaction.get("idempotency");
        if (current?.status === "pending" && current.applicationId === applicationId) await transaction.delete("idempotency");
      });
      return Response.json({ ok: true });
    }

    if (url.pathname === "/upload/claim") {
      const expires = Number(body.expires);
      const now = Math.floor(Date.now() / 1000);
      const result = await this.state.storage.transaction(async (transaction) => {
        const current = await transaction.get("upload");
        if (current?.status === "complete") return { state: "complete" };
        if (current?.status === "claimed" && current.expires >= now) return { state: "claimed" };
        await transaction.put("upload", { status: "claimed", expires });
        return { state: "acquired" };
      });
      return Response.json({ ok: true, ...result });
    }

    if (url.pathname === "/upload/complete") {
      await this.state.storage.put("upload", { status: "complete", completedAt: Date.now() });
      return Response.json({ ok: true });
    }

    if (url.pathname === "/upload/release") {
      await this.state.storage.delete("upload");
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}

export async function probePublicModelReadiness(env) {
  const applyEnabled = flagEnabled(env?.PUBLIC_MODEL_ENABLED);
  const uploadEnabled = flagEnabled(env?.PUBLIC_MODEL_UPLOAD_ENABLED);
  const dependencies = {
    airtable: false,
    kv: false,
    coordinator: false,
    r2: false,
    signing_secret: Boolean(env?.PUBLIC_MODEL_UPLOAD_SIGNING_SECRET),
  };

  if (!applyEnabled && !uploadEnabled) {
    return { public_model_apply: false, public_model_upload: false, dependencies };
  }

  const probes = await Promise.allSettled([
    probeAirtable(env),
    probeKv(env),
    probeCoordinator(env),
    uploadEnabled ? probeR2(env) : Promise.resolve(false),
  ]);
  dependencies.airtable = probes[0].status === "fulfilled" && probes[0].value === true;
  dependencies.kv = probes[1].status === "fulfilled" && probes[1].value === true;
  dependencies.coordinator = probes[2].status === "fulfilled" && probes[2].value === true;
  dependencies.r2 = probes[3].status === "fulfilled" && probes[3].value === true;

  const coreReady = dependencies.airtable && dependencies.kv && dependencies.coordinator;
  return {
    public_model_apply: applyEnabled && coreReady,
    public_model_upload: uploadEnabled && coreReady && dependencies.r2 && dependencies.signing_secret,
    dependencies,
  };
}

async function probeAirtable(env) {
  if (!env?.AIRTABLE_API_TOKEN) return false;
  await airtableRequest(env, `${AIRTABLE_APPLICATION_TABLE_ID}?maxRecords=1&pageSize=1&returnFieldsByFieldId=true`);
  return true;
}

async function probeKv(env) {
  if (!env?.SIGIL_BOARD_KV) return false;
  await env.SIGIL_BOARD_KV.get("sigil:public-model:health:v1");
  return true;
}

async function probeCoordinator(env) {
  if (!env?.PUBLIC_MODEL_COORDINATOR) return false;
  const result = await coordinatorRequest(env, "health", "/health", {});
  return result.ok === true;
}

async function probeR2(env) {
  if (!env?.PUBLIC_MODEL_UPLOADS_R2) return false;
  await env.PUBLIC_MODEL_UPLOADS_R2.list({ limit: 1, prefix: "public-model/v1/" });
  return true;
}

async function handleProductionApply(request, body, env, corsHeaders) {
  if (!env.AIRTABLE_API_TOKEN) return unavailable("persistence_not_configured", PUBLIC_MODEL_SERVICE, corsHeaders);
  if (!env.SIGIL_BOARD_KV || !env.PUBLIC_MODEL_COORDINATOR) return unavailable("persistence_not_configured", PUBLIC_MODEL_SERVICE, corsHeaders);

  let reservation;
  let airtableCreated = false;
  let idempotencyScope = "";
  try {
    const fingerprint = await requestFingerprint(request, env);
    const limited = await rateLimited(env, `apply:${fingerprint}`, 5, 60 * 60);
    if (limited) return errorResponse("rate_limited", 429, corsHeaders);

    const now = new Date().toISOString();
    const normalized = normalizeApplication(body);
    const payloadHash = await sha256Hex(stableJson(normalized));
    const duplicateKey = await sha256Hex(CONTACT_FIELDS.map((field) => normalizeContact(body[field])).filter(Boolean).sort().join("|"));
    const proposedApplicationId = `pma_${compactUtcDate(new Date())}_${randomId(12)}`;
    idempotencyScope = `idempotency:${payloadHash}`;
    reservation = await coordinatorRequest(env, idempotencyScope, "/idempotency/begin", { application_id: proposedApplicationId });
    let applicationId = reservation.application_id;
    let duplicate = reservation.state === "complete";

    if (reservation.state === "pending") {
      const existing = await findApplicationByHash(env, payloadHash);
      if (!existing) return errorResponse("request_in_progress", 409, corsHeaders);
      applicationId = existing.fields?.[APPLICATION_FIELDS.applicationId];
      if (!validRef(applicationId, "pma")) throw new Error("invalid_existing_application_id");
      duplicate = true;
    } else if (reservation.state === "complete") {
      const existing = await findApplicationByHash(env, payloadHash);
      if (existing?.fields?.[APPLICATION_FIELDS.applicationId]) applicationId = existing.fields[APPLICATION_FIELDS.applicationId];
    } else {
      const existing = await findApplicationByHash(env, payloadHash);
      if (existing) {
        applicationId = existing.fields?.[APPLICATION_FIELDS.applicationId];
        if (!validRef(applicationId, "pma")) throw new Error("invalid_existing_application_id");
        duplicate = true;
      }
    }

    const uploads = await verifyUploads(body, env, applicationId);
    if (!uploads.ok) {
      if (reservation.state === "acquired") await coordinatorRequest(env, idempotencyScope, "/idempotency/release", { application_id: applicationId });
      return invalidPayload(PUBLIC_MODEL_SERVICE, { upload_refs: uploads.error }, corsHeaders);
    }

    if (reservation.state === "acquired" && !duplicate) {
      const fields = applicationAirtableFields(body, normalized, uploads.items, {
        applicationId,
        duplicateKey,
        fingerprint,
        now,
        payloadHash,
      });
      await createAirtableRecord(env, AIRTABLE_APPLICATION_TABLE_ID, fields);
      airtableCreated = true;
    }

    await attachUploads(env, uploads.items, applicationId);
    await coordinatorRequest(env, idempotencyScope, "/idempotency/complete", { application_id: applicationId });
    return successResponse(applicationId, duplicate, corsHeaders);
  } catch (error) {
    if (reservation?.state === "acquired" && !airtableCreated) {
      await coordinatorRequest(env, idempotencyScope, "/idempotency/release", { application_id: reservation.application_id }).catch(() => {});
    }
    console.error(JSON.stringify({ event: "public_model_apply_failed", error: safeError(error) }));
    return unavailable("persistence_failed", PUBLIC_MODEL_SERVICE, corsHeaders);
  }
}

async function handleProductionUploadUrl(request, body, env, corsHeaders) {
  if (!env.PUBLIC_MODEL_UPLOADS_R2 || !env.SIGIL_BOARD_KV || !env.PUBLIC_MODEL_COORDINATOR || !env.PUBLIC_MODEL_UPLOAD_SIGNING_SECRET || !env.AIRTABLE_API_TOKEN) {
    return unavailable("upload_not_configured", PUBLIC_MODEL_UPLOAD_SERVICE, corsHeaders);
  }
  try {
    const fingerprint = await requestFingerprint(request, env);
    if (await rateLimited(env, `upload:${fingerprint}`, 30, 60 * 60)) {
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
    const signature = await uploadSignature(env, { sessionId, uploadRef, expires, contentType, fileSize });
    const uploadUrl = new URL(PUBLIC_MODEL_UPLOAD_URL_PATH, request.url);
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
      sourcePath: boundedString(body.source_path || "/apply/public-model", 160),
    };
    await env.SIGIL_BOARD_KV.put(uploadStateKey(uploadRef), JSON.stringify(metadata), { expirationTtl: UPLOAD_SESSION_TTL_SECONDS });

    return json({
      ok: true,
      service: PUBLIC_MODEL_UPLOAD_SERVICE,
      mode: "upload_authorized",
      upload_session_id: sessionId,
      upload_ref: uploadRef,
      upload_url: uploadUrl.toString(),
      upload_method: "PUT",
      required_headers: { "content-type": contentType },
      expires_at: new Date(expires * 1000).toISOString(),
    }, 200, corsHeaders);
  } catch (error) {
    console.error(JSON.stringify({ event: "public_model_upload_authorization_failed", error: safeError(error) }));
    return unavailable("upload_authorization_failed", PUBLIC_MODEL_UPLOAD_SERVICE, corsHeaders);
  }
}

async function handleUploadPut(request, env, corsHeaders) {
  if (!flagEnabled(env.PUBLIC_MODEL_UPLOAD_ENABLED) || !env.PUBLIC_MODEL_UPLOADS_R2 || !env.SIGIL_BOARD_KV || !env.PUBLIC_MODEL_COORDINATOR || !env.PUBLIC_MODEL_UPLOAD_SIGNING_SECRET || !env.AIRTABLE_API_TOKEN) {
    return unavailable("upload_not_configured", PUBLIC_MODEL_UPLOAD_SERVICE, corsHeaders);
  }
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("upload_session_id") || "";
  const uploadRef = url.searchParams.get("upload_ref") || "";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("signature") || "";
  if (!validRef(sessionId, "pmu") || !validRef(uploadRef, "pmu_ref") || !Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
    return errorResponse("invalid_upload_authorization", 403, corsHeaders);
  }

  const raw = await env.SIGIL_BOARD_KV.get(uploadStateKey(uploadRef));
  const metadata = parseObject(raw);
  if (!metadata || metadata.sessionId !== sessionId || metadata.uploadRef !== uploadRef || !["issued", "uploaded"].includes(metadata.status) || metadata.expires !== expires) {
    return errorResponse("invalid_upload_authorization", 403, corsHeaders);
  }
  const expected = await uploadSignature(env, metadata);
  if (!constantTimeEqual(signature, expected)) return errorResponse("invalid_upload_authorization", 403, corsHeaders);

  const contentType = normalizeMime(request.headers.get("content-type"));
  const contentLength = Number(request.headers.get("content-length"));
  if (contentType !== metadata.contentType || !Number.isFinite(contentLength) || contentLength !== metadata.fileSize || contentLength > PUBLIC_MODEL_MAX_UPLOAD_BYTES || !request.body) {
    return errorResponse("upload_metadata_mismatch", 400, corsHeaders);
  }

  const uploadScope = `upload:${uploadRef}`;
  const claim = await coordinatorRequest(env, uploadScope, "/upload/claim", { expires });
  if (claim.state === "complete") {
    return json({ ok: true, service: PUBLIC_MODEL_UPLOAD_SERVICE, upload_ref: uploadRef, uploaded: true, duplicate: true }, 200, corsHeaders);
  }
  if (claim.state !== "acquired") return errorResponse("upload_in_progress", 409, corsHeaders);

  let persistedUpload = null;
  try {
    await env.PUBLIC_MODEL_UPLOADS_R2.put(metadata.objectKey, request.body, {
      httpMetadata: { contentType: metadata.contentType },
      customMetadata: { upload_session_id: metadata.sessionId, upload_ref: metadata.uploadRef, kind: metadata.kind, role: metadata.role },
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
        [UPLOAD_FIELDS.payloadJson]: JSON.stringify({ kind: metadata.kind, role: metadata.role, content_type: metadata.contentType, file_size_bytes: metadata.fileSize }),
        [UPLOAD_FIELDS.worker]: "sigil-worker",
      });
    }
    const next = { ...metadata, status: "uploaded", uploadedAt, airtableRecordId: persistedUpload.id };
    await env.SIGIL_BOARD_KV.put(uploadStateKey(uploadRef), JSON.stringify(next), { expirationTtl: UPLOAD_SESSION_TTL_SECONDS });
    await coordinatorRequest(env, uploadScope, "/upload/complete", {});
    return json({ ok: true, service: PUBLIC_MODEL_UPLOAD_SERVICE, upload_ref: uploadRef, uploaded: true }, 200, corsHeaders);
  } catch (error) {
    if (!persistedUpload) await env.PUBLIC_MODEL_UPLOADS_R2.delete(metadata.objectKey);
    await coordinatorRequest(env, uploadScope, "/upload/release", {}).catch(() => {});
    console.error(JSON.stringify({ event: "public_model_upload_airtable_failed", error: safeError(error) }));
    return errorResponse("upload_persistence_failed", 503, corsHeaders);
  }
}

function validateApplicationPayload(body) {
  const fields = {};
  if (body.application_type !== undefined && body.application_type !== "public_model") fields.application_type = "must be public_model";
  if (!nonEmptyString(body.nickname, 120)) fields.nickname = "required";
  if (body.consent !== true) fields.consent = "must be true";
  for (const field of CONTACT_FIELDS) {
    if (body[field] !== undefined && body[field] !== null && body[field] !== "" && !nonEmptyString(body[field], 500)) fields[field] = "must be a nonempty string";
  }
  if (!CONTACT_FIELDS.some((field) => nonEmptyString(body[field], 500))) fields.contact = "one contact channel is required";
  if (body.form_version !== undefined && body.form_version !== "public-model-apply-v8") fields.form_version = "unsupported form version";
  if (nonEmptyString(body.company, 200)) fields.company = "must be empty";
  const workTypes = body.work_types ?? body.interested_work_types ?? body.workTypes;
  const workTypeError = validateWorkTypes(workTypes);
  if (workTypeError) fields.work_types = workTypeError;
  const forbidden = findForbiddenField(body);
  if (forbidden) fields.forbidden_field = "contains server-controlled or raw upload field";
  const refs = validateUploadRefs(body);
  if (refs) fields.upload_refs = refs;
  return { ok: Object.keys(fields).length === 0, fields };
}

function validateUploadMetadata(body) {
  const fields = {};
  if (body.application_type !== "public_model") fields.application_type = "must be public_model";
  if (body.consent !== true) fields.consent = "must be true";
  const rawMime = body.content_type ?? body.contentType ?? body.mime_type;
  const rawSize = body.file_size ?? body.fileSize;
  const rawName = body.file_name ?? body.fileName;
  const kind = normalizeToken(body.kind);
  const role = normalizeToken(body.role);
  const mime = normalizeMime(rawMime);
  const size = typeof rawSize === "number" ? rawSize : Number.NaN;
  const name = boundedString(rawName, 240);
  if (typeof body.kind !== "string") fields.kind = "must be a string";
  if (typeof body.role !== "string") fields.role = "must be a string";
  if (typeof rawMime !== "string") fields.content_type = "must be a string";
  if (typeof rawName !== "string") fields.file_name = "must be a string";
  if (body.upload_session_id !== undefined && typeof body.upload_session_id !== "string") fields.upload_session_id = "must be a string";
  if (body.source_path !== undefined && typeof body.source_path !== "string") fields.source_path = "must be a string";
  if (!["photo", "document"].includes(kind)) fields.kind = "unsupported kind";
  if (!roleAllowed(kind, role)) fields.role = "unsupported role for kind";
  if (!mimeAllowed(kind, mime)) fields.content_type = "unsupported content type for kind";
  if (!Number.isFinite(size) || size <= 0 || size > PUBLIC_MODEL_MAX_UPLOAD_BYTES) fields.file_size = "must be positive and within the approved size limit";
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
    if (typeof uploadRef !== "string" || !validRef(uploadRef, "pmu_ref")) return "contains invalid upload_ref";
    if (typeof item.kind !== "string" || typeof item.role !== "string" || !roleAllowed(normalizeToken(item.kind), normalizeToken(item.role))) return "contains unsupported kind or role";
    if (findForbiddenField(item)) return "contains unsupported upload field";
  }
  return "";
}

function validateWorkTypes(value) {
  if (value === undefined || value === null || value === "") return "";
  if (!Array.isArray(value)) return "must be an array";
  if (value.length > 10) return "too many selected work types";
  for (const item of value) {
    if (typeof item !== "string" || !PUBLIC_MODEL_ALLOWED_WORK_TYPES.has(item.trim())) return "contains unsupported work type";
  }
  return "";
}

async function verifyUploads(body, env, applicationId) {
  const refs = body.uploads ?? body.upload_refs ?? body.uploadRefs ?? [];
  const required = flagEnabled(env.PUBLIC_MODEL_UPLOAD_REQUIRED);
  if (!refs.length) return required ? { ok: false, error: "at least 7 verified applicant photos are required" } : { ok: true, items: [] };
  if (!env.PUBLIC_MODEL_UPLOADS_R2 || !env.SIGIL_BOARD_KV) return { ok: false, error: "upload verification is not configured" };
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
    const object = await env.PUBLIC_MODEL_UPLOADS_R2.head(metadata.objectKey);
    if (!object || object.size !== metadata.fileSize || (object.httpMetadata?.contentType && object.httpMetadata.contentType !== metadata.contentType)) {
      return { ok: false, error: "contains missing upload object" };
    }
    items.push(metadata);
  }
  const photos = items.filter((item) => item.kind === "photo");
  const bodyPhotos = photos.filter((item) => item.role === "body_presentation");
  if (required && (photos.length < 7 || photos.length > 10)) return { ok: false, error: "requires 7 to 10 verified applicant photos" };
  if (bodyPhotos.length > 3) return { ok: false, error: "too many body presentation photos" };
  return { ok: true, items };
}

async function attachUploads(env, uploads, applicationId) {
  for (const item of uploads) {
    if (item.status === "attached" && item.applicationId !== applicationId) throw new Error("upload_ownership_mismatch");
    const next = { ...item, status: "attached", applicationId };
    if (item.airtableRecordId) {
      await updateAirtableRecord(env, AIRTABLE_UPLOAD_TABLE_ID, item.airtableRecordId, {
        [UPLOAD_FIELDS.applicationId]: applicationId,
        [UPLOAD_FIELDS.uploadStatus]: "attached",
      });
    }
    await env.SIGIL_BOARD_KV.put(uploadStateKey(item.uploadRef), JSON.stringify(next), { expirationTtl: 7 * 24 * 60 * 60 });
  }
}

function applicationAirtableFields(body, normalized, uploads, context) {
  const fields = {
    [APPLICATION_FIELDS.nickname]: normalized.nickname,
    [APPLICATION_FIELDS.consent]: true,
    [APPLICATION_FIELDS.applicationId]: context.applicationId,
    [APPLICATION_FIELDS.applicationType]: "public_model",
    [APPLICATION_FIELDS.handler]: "TarT",
    [APPLICATION_FIELDS.createdAtLegacy]: context.now,
    [APPLICATION_FIELDS.createdAt]: context.now,
    [APPLICATION_FIELDS.submittedAt]: context.now,
    [APPLICATION_FIELDS.consentAt]: context.now,
    [APPLICATION_FIELDS.payloadHash]: context.payloadHash,
    [APPLICATION_FIELDS.intakeStatus]: "private_review_pending",
    [APPLICATION_FIELDS.duplicateKey]: context.duplicateKey,
    [APPLICATION_FIELDS.requestFingerprint]: context.fingerprint,
    [APPLICATION_FIELDS.formVersion]: normalized.form_version,
    [APPLICATION_FIELDS.payloadJson]: JSON.stringify(redactedPayload(normalized)),
    [APPLICATION_FIELDS.photoCount]: uploads.filter((item) => item.kind === "photo").length,
    [APPLICATION_FIELDS.bodyPhotoCount]: uploads.filter((item) => item.role === "body_presentation").length,
    [APPLICATION_FIELDS.documentCount]: uploads.filter((item) => item.kind === "document").length,
    [APPLICATION_FIELDS.uploadRefsJson]: JSON.stringify(uploads.map((item) => ({ upload_ref: item.uploadRef, kind: item.kind, role: item.role }))),
  };
  assign(fields, APPLICATION_FIELDS.age, numberOrUndefined(body.age, 18, 100));
  assign(fields, APPLICATION_FIELDS.height, numberOrUndefined(body.height_cm ?? body.height, 100, 250));
  assign(fields, APPLICATION_FIELDS.weight, numberOrUndefined(body.weight_kg ?? body.weight, 30, 300));
  assign(fields, APPLICATION_FIELDS.occupation, boundedString(body.occupation_label || body.occupation || body.mmd_public_model_category_label, 240));
  assign(fields, APPLICATION_FIELDS.phone, boundedString(body.phone, 120));
  assign(fields, APPLICATION_FIELDS.lineId, boundedString(body.line_id || body.line, 160));
  assign(fields, APPLICATION_FIELDS.instagram, boundedString(body.instagram, 500));
  assign(fields, APPLICATION_FIELDS.telegram, boundedString(body.telegram, 160));
  assign(fields, APPLICATION_FIELDS.email, boundedString(body.email, 320));
  assign(fields, APPLICATION_FIELDS.socialUrl, boundedString(body.social_url || body.portfolio_links, 2000));
  assign(fields, APPLICATION_FIELDS.skills, boundedString(body.skills || body.custom_abilities, 4000));
  assign(fields, APPLICATION_FIELDS.strengths, boundedString(body.strengths, 4000));
  assign(fields, APPLICATION_FIELDS.location, boundedString(body.location, 500));
  assign(fields, APPLICATION_FIELDS.intro, boundedString(body.intro || body.story, 4000));
  assign(fields, APPLICATION_FIELDS.experience, boundedString(body.experience || body.occupation_detail, 4000));
  assign(fields, APPLICATION_FIELDS.workType, boundedString(body.service_job_preference || body.work_type, 500));
  assign(fields, APPLICATION_FIELDS.privacyLevel, boundedString(body.privacy_level, 160));
  assign(fields, APPLICATION_FIELDS.experienceMonths, numberOrUndefined(body.mmd_experience_months, 0, 11));
  assign(fields, APPLICATION_FIELDS.experienceYears, numberOrUndefined(body.mmd_experience_years, 0, 80));
  if (body.mmd_worked_independently_before !== undefined) fields[APPLICATION_FIELDS.workedIndependently] = body.mmd_worked_independently_before === true;
  assign(fields, APPLICATION_FIELDS.previousAgency, boundedString(body.mmd_previous_agency_or_venue, 500));
  if (body.mmd_safety_segment_acknowledgement !== undefined) fields[APPLICATION_FIELDS.safetyAcknowledgement] = body.mmd_safety_segment_acknowledgement === true;
  if (uploads[0]) fields[APPLICATION_FIELDS.uploadSessionId] = uploads[0].sessionId;
  return fields;
}

function normalizeApplication(body) {
  const output = {};
  for (const key of Object.keys(body).sort()) {
    if (["page_url", "submitted_at", "timezone", "user_agent", "language"].includes(key)) continue;
    output[key] = normalizeValue(body[key]);
  }
  output.application_type = "public_model";
  output.form_version = boundedString(body.form_version || "public-model-apply-v8", 80);
  output.nickname = boundedString(body.nickname, 120);
  return output;
}

function redactedPayload(normalized) {
  const hidden = new Set([...CONTACT_FIELDS, "mmd_identity_disclosure_preference", "orientation", "orientation_label"]);
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
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{upload_ref}='${escaped}'`,
    returnFieldsByFieldId: "true",
  });
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
  if (!env.PUBLIC_MODEL_COORDINATOR) throw new Error("public_model_coordinator_missing");
  const id = env.PUBLIC_MODEL_COORDINATOR.idFromName(scope);
  const response = await env.PUBLIC_MODEL_COORDINATOR.get(id).fetch(`https://public-model-coordinator${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`public_model_coordinator_${response.status}`);
  const result = await response.json();
  if (!result?.ok) throw new Error("public_model_coordinator_failed");
  return result;
}

async function requestFingerprint(request, env) {
  const input = [request.headers.get("cf-connecting-ip") || "unknown", request.headers.get("user-agent") || "", env.PUBLIC_MODEL_UPLOAD_SIGNING_SECRET || "sigil"].join("|");
  return (await sha256Hex(input)).slice(0, 32);
}

async function uploadSignature(env, metadata) {
  const data = [metadata.sessionId, metadata.uploadRef, metadata.expires, metadata.contentType, metadata.fileSize].join("\n");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.PUBLIC_MODEL_UPLOAD_SIGNING_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
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
  return String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
}

function roleAllowed(kind, role) {
  return kind === "photo" ? PUBLIC_MODEL_PHOTO_ROLES.has(role) : kind === "document" ? PUBLIC_MODEL_DOCUMENT_ROLES.has(role) : false;
}

function mimeAllowed(kind, mime) {
  return kind === "photo" ? PUBLIC_MODEL_PHOTO_MIME_TYPES.has(mime) : kind === "document" ? PUBLIC_MODEL_DOCUMENT_MIME_TYPES.has(mime) : false;
}

function objectKeyFor(sessionId, uploadRef, contentType) {
  const now = new Date();
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[contentType];
  return `public-model/v1/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${sessionId}/${uploadRef}.${ext}`;
}

function uploadStateKey(uploadRef) {
  return `${UPLOAD_STATE_PREFIX}${uploadRef}`;
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
  return json({
    ok: false,
    error: "persistence_not_configured",
    service: PUBLIC_MODEL_SERVICE,
    mode: "readiness_only",
    accepted: false,
    received: false,
    storage: { persisted: false, reason: "persistence_disabled" },
    board_card: { persisted: false, reason: "persistence_disabled" },
  }, 503, headers);
}

function readinessUpload(headers) {
  return json({ ok: false, error: "upload_not_configured", service: PUBLIC_MODEL_UPLOAD_SERVICE, mode: "readiness_only", upload_enabled: false }, 503, headers);
}

function unavailable(error, service, headers) {
  return json({ ok: false, error, service, accepted: false }, 503, headers);
}

function invalidPayload(service, fields, headers) {
  return json({ ok: false, error: "invalid_payload", service, fields }, 400, headers);
}

function successResponse(applicationId, duplicate, headers) {
  return json({
    ok: true,
    service: PUBLIC_MODEL_SERVICE,
    mode: "intake_received",
    application_id: applicationId,
    duplicate: Boolean(duplicate),
    storage: { persisted: true },
    board_card: { persisted: false },
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

function safeError(error) {
  return error instanceof Error ? error.message.slice(0, 200) : "unknown_error";
}

export const publicModelTestInternals = {
  AIRTABLE_APPLICATION_TABLE_ID,
  AIRTABLE_UPLOAD_TABLE_ID,
  APPLICATION_FIELDS,
  UPLOAD_FIELDS,
  MAX_UPLOAD_BYTES: PUBLIC_MODEL_MAX_UPLOAD_BYTES,
  validateApplicationPayload,
  validateUploadMetadata,
};
