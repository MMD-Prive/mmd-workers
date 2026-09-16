import dashboardWorker from "./dashboard-worker.js";

const EXCHANGE_PATH = "/v1/model/liff/exchange";
const CURRENT_PATH = "/v1/model/session/current";
const ACTION_PATH = "/v1/model/session/action";
const PROFILE_PATH = "/v1/model/profile";
const MEDIA_PATH = "/v1/model/media";
const MEDIA_UPLOAD_PATH = "/v1/model/media/upload";
const COOKIE_NAME = "mmd_model_session_v1";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const MODELS_TABLE_DEFAULT = "Models";
const MEDIA_TABLE_DEFAULT = "tblrpQXhHnbTU9RhW";
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const MODEL_LANGUAGE_ALLOWLIST = new Set(["thai", "english"]);
const MODEL_AVAILABILITY_ALLOWLIST = new Set(["available", "busy", "vacation"]);
const MODEL_MEDIA_UPLOAD_TYPES = new Set(["profile_photo", "public_gallery"]);
const MODEL_MEDIA_PUBLIC_SELF_MANAGED_TYPES = new Set(["profile_photo", "public_gallery", "intro_video"]);
const MODEL_MEDIA_PER_APPROVAL_TYPES = new Set(["private_gallery", "flash_preview"]);
const MODEL_IMAGE_MIME_ALLOWLIST = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ACTIVE_SESSION_STATES = new Set([
  "confirmed",
  "accepted",
  "en_route",
  "traveling",
  "nearby",
  "arrived",
  "met_customer",
  "final_payment_pending",
  "final_payment_confirmed",
  "work_started",
  "work_finished",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS" && isModelLiffPath(path)) {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (path === EXCHANGE_PATH) {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, request, env);
      return handleExchange(request, env);
    }

    if (path === PROFILE_PATH) {
      if (method === "GET") return handleProfileRead(request, env);
      if (method === "PATCH") return handleProfileUpdate(request, env);
      return json({ ok: false, error: "method_not_allowed" }, 405, request, env);
    }

    if (path === MEDIA_PATH) {
      if (method === "GET") return handleMediaList(request, env);
      return json({ ok: false, error: "method_not_allowed" }, 405, request, env);
    }

    if (path === MEDIA_UPLOAD_PATH) {
      if (method === "POST") return handleMediaUpload(request, env);
      return json({ ok: false, error: "method_not_allowed" }, 405, request, env);
    }

    const mediaRoute = parseMediaRoute(path);
    if (mediaRoute) {
      if (mediaRoute.action === "file" && method === "GET") return handleMediaFile(request, env, mediaRoute.mediaId);
      if (mediaRoute.action === "set-main" && method === "POST") return handleMediaSetMain(request, env, mediaRoute.mediaId);
      if (mediaRoute.action === "delete" && method === "DELETE") return handleMediaDelete(request, env, mediaRoute.mediaId);
      return json({ ok: false, error: "method_not_allowed" }, 405, request, env);
    }

    if (path === ACTION_PATH && method === "POST") {
      const body = await request.clone().json().catch(() => ({}));
      if (normalizeWord(body?.action) === "send_eta") return handleSendEta(request, env, ctx, body);
    }

    if (path === CURRENT_PATH || path === ACTION_PATH) {
      const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
      if (token && !url.searchParams.get("t")) {
        url.searchParams.set("t", token);
        request = new Request(url.toString(), request);
      }
    }

    return dashboardWorker.fetch(request, env, ctx);
  },
};

export function resolveLineChannelId(env = {}, environment = "") {
  const value = String(environment || "").trim().toLowerCase();
  if (value === "developing" || value === "development" || value === "dev") {
    return String(env.LINE_MINIAPP_DEV_CHANNEL_ID || "2010864852").trim();
  }
  if (value === "review") {
    return String(env.LINE_MINIAPP_REVIEW_CHANNEL_ID || "2010864853").trim();
  }
  return String(env.LINE_MINIAPP_PUBLISHED_CHANNEL_ID || "2010864854").trim();
}

export function normalizeLineEnvironment(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["developing", "development", "dev"].includes(normalized)) return "developing";
  if (normalized === "review") return "review";
  return "published";
}

export function parseCookieHeader(header = "") {
  const result = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

export function normalizeModelProfilePatch(input = {}) {
  const patch = {};
  const errors = [];

  if (Object.prototype.hasOwnProperty.call(input, "height_cm")) {
    const value = Number(input.height_cm);
    if (!Number.isFinite(value) || value < 130 || value > 230) errors.push("height_cm_invalid");
    else patch.height_cm = Math.round(value);
  }

  if (Object.prototype.hasOwnProperty.call(input, "weight_kg")) {
    const value = Number(input.weight_kg);
    if (!Number.isFinite(value) || value < 35 || value > 200) errors.push("weight_kg_invalid");
    else patch.weight_kg = Math.round(value);
  }

  if (Object.prototype.hasOwnProperty.call(input, "languages")) {
    if (!Array.isArray(input.languages)) errors.push("languages_invalid");
    else {
      const languages = unique(input.languages.map((value) => clean(value).toLowerCase()).filter(Boolean));
      if (languages.some((value) => !MODEL_LANGUAGE_ALLOWLIST.has(value))) errors.push("languages_invalid");
      else patch.languages = languages;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "skills_summary")) {
    const value = clean(input.skills_summary);
    if (value.length > 1200) errors.push("skills_summary_too_long");
    else patch.skills_summary = value;
  }

  if (Object.prototype.hasOwnProperty.call(input, "experience_summary")) {
    const value = clean(input.experience_summary);
    if (value.length > 1600) errors.push("experience_summary_too_long");
    else patch.experience_summary = value;
  }

  if (Object.prototype.hasOwnProperty.call(input, "available_now")) {
    if (typeof input.available_now !== "boolean") errors.push("available_now_invalid");
    else patch.available_now = input.available_now;
  }

  if (Object.prototype.hasOwnProperty.call(input, "availability_status")) {
    const value = clean(input.availability_status).toLowerCase();
    if (!MODEL_AVAILABILITY_ALLOWLIST.has(value)) errors.push("availability_status_invalid");
    else patch.availability_status = value;
  }

  if (patch.availability_status && patch.availability_status !== "available") patch.available_now = false;
  return { ok: errors.length === 0, patch, errors };
}

export function normalizeModelMediaType(value = "") {
  const normalized = clean(value).toLowerCase();
  return MODEL_MEDIA_UPLOAD_TYPES.has(normalized) ? normalized : "";
}

export function modelMediaPolicy(fields = {}) {
  const mediaType = normalizeWord(fields.media_type);
  const role = normalizeWord(fields.asset_role);
  const visibility = normalizeWord(fields.media_visibility);

  if (MODEL_MEDIA_PER_APPROVAL_TYPES.has(mediaType)) {
    return { self_managed: false, requires_per_approval: true, policy: "per_approved_private" };
  }

  if (/private|flash|sensitive/.test(role)) {
    return { self_managed: false, requires_per_approval: true, policy: "per_approved_private" };
  }

  if (
    MODEL_MEDIA_PUBLIC_SELF_MANAGED_TYPES.has(mediaType) &&
    ["private", "private_candidate", "private_active", "flash", "flash_preview"].includes(visibility)
  ) {
    return { self_managed: false, requires_per_approval: true, policy: "per_approved_private" };
  }

  if (MODEL_MEDIA_PUBLIC_SELF_MANAGED_TYPES.has(mediaType)) {
    // #597 stored ordinary public candidates as private_pending_review. The new
    // owner policy supersedes that legacy staging marker for these public types.
    return { self_managed: true, requires_per_approval: false, policy: "model_self_managed_public" };
  }

  return { self_managed: false, requires_per_approval: true, policy: "per_approved_private" };
}

export function normalizeEtaMinutes(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 240 ? number : 0;
}

function isModelLiffPath(path) {
  return path === EXCHANGE_PATH || path === CURRENT_PATH || path === ACTION_PATH || path === PROFILE_PATH || path === MEDIA_PATH || path === MEDIA_UPLOAD_PATH || path.startsWith(`${MEDIA_PATH}/`);
}

async function handleExchange(request, env) {
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const body = await request.json().catch(() => ({}));
  const idToken = String(body?.idToken || body?.id_token || "").trim();
  const environment = normalizeLineEnvironment(body?.environment);
  if (!idToken) return json({ ok: false, error: "id_token_required" }, 400, request, env);

  const channelId = resolveLineChannelId(env, environment);
  const lineIdentity = await verifyLineIdToken(idToken, channelId);
  if (!lineIdentity.ok) return json({ ok: false, error: lineIdentity.error }, lineIdentity.status, request, env);

  const model = await findModelByLineUserId(env, lineIdentity.profile.sub);
  if (!model.ok) return json({ ok: false, error: model.error }, model.status, request, env);

  const sessionResult = await findActiveSessionForModel(env, model.record);
  if (!sessionResult.ok && sessionResult.status !== 404) {
    return json({ ok: false, error: sessionResult.error }, sessionResult.status, request, env);
  }
  const session = sessionResult.ok ? sessionResult : null;

  const ttlSeconds = clampInt(env.MODEL_LIFF_SESSION_TTL_SECONDS, 300, 28800, 3600);
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = {
    kind: "model_session",
    role: "model",
    session_id: session?.sessionId || undefined,
    payment_ref: session?.paymentRef || undefined,
    model_record_id: model.record.id,
    model_name: model.displayName,
    line_user_id: lineIdentity.profile.sub,
    line_environment: environment,
    exp: expiresAtSeconds,
  };
  const token = await signPayload(payload, env);
  if (!token) return json({ ok: false, error: "signing_not_ready" }, 503, request, env);

  const response = json({
    ok: true,
    environment,
    expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
    model: {
      id: model.record.id,
      code: model.code,
      display_name: model.displayName,
    },
    session: session ? {
      session_id: session.sessionId,
      state: session.state,
    } : null,
  }, 200, request, env);
  response.headers.append("set-cookie", serializeSessionCookie(token, ttlSeconds, request, env));
  return response;
}

async function handleProfileRead(request, env) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);

  const model = await airtableGetRecord(env, modelsTable(env), auth.payload.model_record_id);
  if (!model.ok) return json({ ok: false, error: model.status === 404 ? "model_not_found" : "model_lookup_unavailable" }, model.status, request, env);
  if (!isActiveModel(model.record.fields || {}, env)) return json({ ok: false, error: "model_not_active" }, 403, request, env);

  const profile = safeModelProfile(model.record);
  const main = await findOwnedMainMedia(env, auth.payload.model_record_id);
  if (main?.media_id) profile.current_profile_image_url = `${MEDIA_PATH}/${encodeURIComponent(main.media_id)}/file`;
  return json({ ok: true, model: profile }, 200, request, env);
}

async function handleProfileUpdate(request, env) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400, request, env);
  const normalized = normalizeModelProfilePatch(body);
  if (!normalized.ok) return json({ ok: false, error: "validation_failed", fields: normalized.errors }, 400, request, env);
  if (!Object.keys(normalized.patch).length) return json({ ok: false, error: "no_supported_fields" }, 400, request, env);

  const updated = await airtableUpdateRecord(env, modelsTable(env), auth.payload.model_record_id, normalized.patch, true);
  if (!updated.ok) return json({ ok: false, error: "profile_update_failed" }, updated.status, request, env);
  const profile = safeModelProfile(updated.record);
  const main = await findOwnedMainMedia(env, auth.payload.model_record_id);
  if (main?.media_id) profile.current_profile_image_url = `${MEDIA_PATH}/${encodeURIComponent(main.media_id)}/file`;
  return json({ ok: true, model: profile }, 200, request, env);
}

async function handleMediaList(request, env) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);

  const table = mediaTable(env);
  const formula = `FIND("${escapeFormula(auth.payload.model_record_id)}", ARRAYJOIN({Model}))`;
  const result = await airtableList(env, table, formula, 100);
  if (!result.ok) return json({ ok: false, error: "media_lookup_unavailable" }, 503, request, env);
  const media = result.records.map((record) => safeMediaRecord(record));
  return json({ ok: true, media }, 200, request, env);
}

async function handleMediaUpload(request, env) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.put !== "function") {
    return json({ ok: false, error: "media_storage_unavailable" }, 503, request, env);
  }

  const contentType = clean(request.headers.get("content-type"));
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return json({ ok: false, error: "multipart_required" }, 415, request, env);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "invalid_multipart" }, 400, request, env);
  }
  const file = form.get("file");
  const rawMediaType = normalizeWord(form.get("media_type"));
  if (MODEL_MEDIA_PER_APPROVAL_TYPES.has(rawMediaType)) {
    return json({ ok: false, error: "per_approval_required", policy: "per_approved_private" }, 403, request, env);
  }
  const mediaType = normalizeModelMediaType(rawMediaType);
  if (!mediaType) return json({ ok: false, error: "media_type_invalid" }, 400, request, env);
  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    return json({ ok: false, error: "file_required" }, 400, request, env);
  }

  const mime = clean(file.type).toLowerCase();
  const size = Number(file.size || 0);
  if (!MODEL_IMAGE_MIME_ALLOWLIST.has(mime)) return json({ ok: false, error: "file_type_not_allowed" }, 415, request, env);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_MEDIA_BYTES) return json({ ok: false, error: "file_size_invalid", max_bytes: MAX_MEDIA_BYTES }, 413, request, env);

  const mediaId = `media_${crypto.randomUUID().replace(/-/g, "")}`;
  const ext = imageExtension(mime);
  const objectKey = `models/${auth.payload.model_record_id}/${mediaType}/${mediaId}.${ext}`;
  const uploadedAt = new Date().toISOString();

  try {
    await env.MMD_MODEL_ASSETS.put(objectKey, file.stream(), {
      httpMetadata: { contentType: mime },
      customMetadata: {
        media_id: mediaId,
        model_record_id: auth.payload.model_record_id,
        media_type: mediaType,
        policy: "model_self_managed_public",
      },
    });
  } catch {
    return json({ ok: false, error: "media_storage_write_failed" }, 503, request, env);
  }

  const mediaFields = {
    media_id: mediaId,
    Model: [auth.payload.model_record_id],
    media_type: mediaType,
    media_visibility: "public_candidate",
    asset_role: mediaType === "profile_photo" ? "profile_candidate" : "gallery_candidate",
    review_status: "active",
    public_safe: true,
    private_safe: false,
    flash_safe: false,
    file_name: clean(file.name).slice(0, 180) || `${mediaId}.${ext}`,
    file_type: mime,
    file_size_bytes: size,
    r2_bucket: "mmd-models",
    private_original_key: objectKey,
    uploaded_at: uploadedAt,
  };

  const created = await airtableCreateRecord(env, mediaTable(env), mediaFields, true);
  if (!created.ok) {
    await env.MMD_MODEL_ASSETS.delete(objectKey).catch(() => {});
    return json({ ok: false, error: "media_registry_write_failed" }, created.status, request, env);
  }

  return json({
    ok: true,
    media: safeMediaRecord(created.record),
    policy: "model_self_managed_public",
    review_required: false,
  }, 201, request, env);
}

async function handleMediaFile(request, env, mediaId) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.get !== "function") return json({ ok: false, error: "media_storage_unavailable" }, 503, request, env);

  const media = await findOwnedMedia(env, auth.payload.model_record_id, mediaId);
  if (!media.ok) return json({ ok: false, error: media.error }, media.status, request, env);
  const key = clean(media.record.fields?.private_original_key);
  if (!key) return json({ ok: false, error: "media_object_missing" }, 404, request, env);

  const object = await env.MMD_MODEL_ASSETS.get(key).catch(() => null);
  if (!object) return json({ ok: false, error: "media_object_missing" }, 404, request, env);
  const headers = corsHeaders(request, env);
  headers.set("content-type", clean(media.record.fields?.file_type) || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("cache-control", "private, no-store");
  headers.set("content-disposition", "inline");
  return new Response(object.body, { status: 200, headers });
}

async function handleMediaSetMain(request, env, mediaId) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const media = await findOwnedMedia(env, auth.payload.model_record_id, mediaId);
  if (!media.ok) return json({ ok: false, error: media.error }, media.status, request, env);
  const policy = modelMediaPolicy(media.record.fields || {});
  if (!policy.self_managed) return json({ ok: false, error: "per_approval_required", policy: policy.policy }, 403, request, env);

  const all = await listOwnedMedia(env, auth.payload.model_record_id);
  if (!all.ok) return json({ ok: false, error: "media_lookup_unavailable" }, 503, request, env);
  for (const record of all.records) {
    if (record.id === media.record.id) continue;
    if (normalizeWord(record.fields?.asset_role) !== "profile_main") continue;
    const otherPolicy = modelMediaPolicy(record.fields || {});
    if (!otherPolicy.self_managed) continue;
    await airtableUpdateRecord(env, mediaTable(env), record.id, {
      asset_role: normalizeWord(record.fields?.media_type) === "profile_photo" ? "profile_candidate" : "gallery_candidate",
    }, true);
  }

  const updated = await airtableUpdateRecord(env, mediaTable(env), media.record.id, {
    asset_role: "profile_main",
    review_status: "active",
    public_safe: true,
    media_visibility: "public_candidate",
  }, true);
  if (!updated.ok) return json({ ok: false, error: "media_registry_write_failed" }, updated.status, request, env);

  return json({
    ok: true,
    status: "active",
    media: safeMediaRecord(updated.record),
    policy: "model_self_managed_public",
    review_required: false,
  }, 200, request, env);
}

async function handleMediaDelete(request, env, mediaId) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const media = await findOwnedMedia(env, auth.payload.model_record_id, mediaId);
  if (!media.ok) return json({ ok: false, error: media.error }, media.status, request, env);
  const policy = modelMediaPolicy(media.record.fields || {});
  if (!policy.self_managed) return json({ ok: false, error: "per_approval_required", policy: policy.policy }, 403, request, env);

  const key = clean(media.record.fields?.private_original_key);
  const deleted = await airtableDeleteRecord(env, mediaTable(env), media.record.id);
  if (!deleted.ok) return json({ ok: false, error: "media_registry_delete_failed" }, deleted.status, request, env);
  if (key && env.MMD_MODEL_ASSETS && typeof env.MMD_MODEL_ASSETS.delete === "function") {
    await env.MMD_MODEL_ASSETS.delete(key).catch(() => {});
  }
  return json({ ok: true, media_id: mediaId, policy: "model_self_managed_public" }, 200, request, env);
}

async function handleSendEta(request, env, ctx, body) {
  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const etaMinutes = normalizeEtaMinutes(body?.eta_minutes);
  if (!etaMinutes) return json({ ok: false, error: "eta_minutes_invalid", min: 1, max: 240 }, 400, request, env);

  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  const currentUrl = new URL(CURRENT_PATH, request.url);
  currentUrl.searchParams.set("t", token);
  const currentRequest = new Request(currentUrl.toString(), { method: "GET", headers: request.headers });
  const currentResponse = await dashboardWorker.fetch(currentRequest, env, ctx);
  const current = await currentResponse.clone().json().catch(() => ({}));
  if (!currentResponse.ok) return json(current || { ok: false, error: "session_lookup_failed" }, currentResponse.status, request, env);

  const session = current?.session || {};
  const allowed = Array.isArray(session.allowed_actions) ? session.allowed_actions.map(normalizeWord) : [];
  if (!allowed.includes("send_eta")) return json({ ok: false, error: "invalid_transition" }, 409, request, env);
  const sessionId = clean(session.session_id || auth.payload.session_id);
  if (!sessionId) return json({ ok: false, error: "active_session_not_found" }, 404, request, env);

  if (!env.EVENTS_WORKER || typeof env.EVENTS_WORKER.fetch !== "function") {
    return json({ ok: false, error: "eta_service_not_ready" }, 503, request, env);
  }
  const serviceToken = clean(env.AUTH_SERVICE_ADMIN_TO_EVENTS || env.CONFIRM_KEY);
  if (!serviceToken) return json({ ok: false, error: "eta_service_auth_not_ready" }, 503, request, env);

  const upstream = await env.EVENTS_WORKER.fetch(new Request("https://events-worker.internal/__internal/model/session/eta", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Internal-Token": serviceToken },
    body: JSON.stringify({
      session_id: sessionId,
      eta_minutes: etaMinutes,
      model_record_id: auth.payload.model_record_id,
      source: "model_liff",
    }),
  }));
  const eta = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ ok: false, error: eta.error || "eta_update_failed", detail: eta }, upstream.status, request, env);

  return json({
    ok: true,
    session,
    eta: { owner: "events-worker", eta_minutes: etaMinutes, updated_at: eta.eta_updated_at || null },
  }, 200, request, env);
}

function safeModelProfile(record) {
  const fields = record?.fields || {};
  const attachments = Array.isArray(fields.profile_photo) ? fields.profile_photo : [];
  return {
    id: record?.id || "",
    working_name: firstText(fields, ["working_name", "nickname", "display_name"]),
    height_cm: finiteOrNull(fields.height_cm),
    weight_kg: finiteOrNull(fields.weight_kg),
    languages: arrayText(fields.languages).map((value) => clean(value).toLowerCase()).filter((value) => MODEL_LANGUAGE_ALLOWLIST.has(value)),
    skills_summary: clean(fields.skills_summary),
    experience_summary: clean(fields.experience_summary),
    available_now: Boolean(fields.available_now),
    availability_status: clean(fields.availability_status) || "busy",
    minimum_rate_90m: finiteOrNull(fields.minimum_rate_90m),
    rate_editable: false,
    current_profile_image_url: safeHttpUrl(fields["Public Image URL"]) || safeAttachmentUrl(attachments[0]),
  };
}

function safeMediaRecord(record) {
  const fields = record?.fields || {};
  const mediaId = firstText(fields, ["media_id"]);
  const policy = modelMediaPolicy(fields);
  const reviewStatus = clean(fields.review_status) || (policy.self_managed ? "active" : "pending_review");
  return {
    media_id: mediaId,
    media_type: clean(fields.media_type),
    asset_role: clean(fields.asset_role),
    review_status: reviewStatus,
    file_name: clean(fields.file_name),
    file_type: clean(fields.file_type),
    file_size_bytes: finiteOrNull(fields.file_size_bytes),
    uploaded_at: clean(fields.uploaded_at),
    preview_url: mediaId ? `${MEDIA_PATH}/${encodeURIComponent(mediaId)}/file` : "",
    can_delete: policy.self_managed,
    can_request_main: policy.self_managed && Boolean(mediaId),
    self_managed: policy.self_managed,
    requires_per_approval: policy.requires_per_approval,
    policy: policy.policy,
    main_action: policy.self_managed ? "set_main" : "request_per_approval",
  };
}

async function findOwnedMainMedia(env, modelRecordId) {
  const formula = `AND(FIND("${escapeFormula(modelRecordId)}",ARRAYJOIN({Model})),{asset_role}="profile_main")`;
  const result = await airtableList(env, mediaTable(env), formula, 10);
  if (!result.ok) return null;
  const record = result.records.find((item) => modelMediaPolicy(item.fields || {}).self_managed);
  if (!record) return null;
  return { media_id: firstText(record.fields || {}, ["media_id"]) };
}

async function listOwnedMedia(env, modelRecordId) {
  const formula = `FIND("${escapeFormula(modelRecordId)}", ARRAYJOIN({Model}))`;
  return airtableList(env, mediaTable(env), formula, 100);
}

async function findOwnedMedia(env, modelRecordId, mediaId) {
  const cleanId = clean(mediaId);
  if (!cleanId || !/^media_[a-zA-Z0-9-]+$/.test(cleanId)) return { ok: false, status: 400, error: "media_id_invalid" };
  const formula = `AND({media_id}="${escapeFormula(cleanId)}",FIND("${escapeFormula(modelRecordId)}",ARRAYJOIN({Model})))`;
  const result = await airtableList(env, mediaTable(env), formula, 1);
  if (!result.ok) return { ok: false, status: 503, error: "media_lookup_unavailable" };
  if (!result.records[0]) return { ok: false, status: 404, error: "media_not_found" };
  return { ok: true, status: 200, record: result.records[0] };
}

function parseMediaRoute(path) {
  const prefix = `${MEDIA_PATH}/`;
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length).split("/").filter(Boolean);
  if (rest.length !== 2) return null;
  const mediaId = decodeURIComponent(rest[0]);
  const action = rest[1];
  if (!["file", "set-main", "delete"].includes(action)) return null;
  return { mediaId, action };
}

async function requireModelSession(request, env) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return { ok: false, status: 401, error: "model_session_required" };
  const verified = await verifySessionToken(token, env);
  if (!verified.ok) return verified;
  if (verified.payload.kind !== "model_session" || verified.payload.role !== "model" || !clean(verified.payload.model_record_id)) {
    return { ok: false, status: 403, error: "model_session_invalid" };
  }
  return verified;
}

async function verifySessionToken(token, env) {
  const value = clean(token);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { ok: false, status: 401, error: "model_session_invalid" };
  const encoded = value.slice(0, dot);
  const suppliedSignature = value.slice(dot + 1);
  const secret = clean(env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) return { ok: false, status: 503, error: "signing_not_ready" };
  const expectedSignature = await hmacHex(encoded, secret);
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) return { ok: false, status: 401, error: "model_session_invalid" };

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded));
  } catch {
    return { ok: false, status: 401, error: "model_session_invalid" };
  }
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return { ok: false, status: 401, error: "model_session_expired" };
  return { ok: true, status: 200, payload };
}

async function verifyLineIdToken(idToken, channelId) {
  const form = new URLSearchParams();
  form.set("id_token", idToken);
  form.set("client_id", channelId);
  let response;
  try {
    response = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch {
    return { ok: false, status: 503, error: "line_verify_unavailable" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.sub || String(data?.aud || "") !== channelId) {
    return { ok: false, status: 401, error: "invalid_line_id_token" };
  }
  return { ok: true, profile: data };
}

async function findModelByLineUserId(env, lineUserId) {
  const table = modelsTable(env);
  const lineFields = unique([
    env.AT_MODELS__LINE_USER_ID,
    "LINE User ID",
    "line_user_id",
    "line_id",
    "LINE ID",
  ].map(clean).filter(Boolean));

  for (const field of lineFields) {
    const result = await airtableList(env, table, `{${field}}="${escapeFormula(lineUserId)}"`, 1);
    if (result.schemaError) continue;
    if (!result.ok) return { ok: false, status: 503, error: "model_lookup_unavailable" };
    const record = result.records[0];
    if (!record) continue;
    if (!isActiveModel(record.fields || {}, env)) return { ok: false, status: 403, error: "model_not_active" };
    return {
      ok: true,
      record,
      code: firstText(record.fields, [env.AT_MODELS__MODEL_CODE, "model_code", "Model Code", "unique_key"]),
      displayName: firstText(record.fields, [env.AT_MODELS__DISPLAY_NAME, "working_name", "display_name", "Display Name", "nickname", "Nickname", "name", "Name"]) || "Model",
    };
  }
  return { ok: false, status: 403, error: "model_not_linked" };
}

function isActiveModel(fields, env) {
  const status = firstText(fields, [env.AT_MODELS__STATUS, "status", "Status", "model_status", "Model Status"]);
  if (!status) return true;
  return !/inactive|disabled|suspended|blocked|archived|rejected|offboard/i.test(status);
}

async function findActiveSessionForModel(env, modelRecord) {
  const table = String(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX").trim();
  const assignedField = String(env.AT_SESSIONS__MODEL_RECORD_ID || "Assigned Model").trim();
  const formula = `FIND("${escapeFormula(modelRecord.id)}", ARRAYJOIN({${assignedField}}))`;
  const result = await airtableList(env, table, formula, 20);
  if (!result.ok) return { ok: false, status: 503, error: "session_lookup_unavailable" };

  const sessionIdField = String(env.AT_SESSIONS__SESSION_ID || "session_id");
  const stateFields = unique([env.AT_SESSIONS__STATE, env.AT_SESSIONS__STATUS, "session_state", "status"].map(clean).filter(Boolean));
  const paymentField = String(env.AT_SESSIONS__PAYMENT_REF || "payment_ref");

  for (const record of result.records) {
    const state = firstText(record.fields || {}, stateFields).toLowerCase();
    if (state && !ACTIVE_SESSION_STATES.has(state)) continue;
    const sessionId = firstText(record.fields || {}, [sessionIdField]);
    if (!sessionId) continue;
    return {
      ok: true,
      record,
      sessionId,
      paymentRef: firstText(record.fields || {}, [paymentField]),
      state: state || "confirmed",
    };
  }
  return { ok: false, status: 404, error: "active_session_not_found" };
}

async function airtableList(env, table, formula, pageSize) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, records: [] };
  const params = new URLSearchParams();
  params.set("pageSize", String(pageSize || 10));
  if (formula) params.set("filterByFormula", formula);
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = JSON.stringify(data || {});
    return { ok: false, status: response.status, schemaError: response.status === 422 || /unknown field|invalid.*field/i.test(message), records: [] };
  }
  return { ok: true, status: 200, records: Array.isArray(data.records) ? data.records : [] };
}

async function airtableGetRecord(env, table, recordId) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, status: 200, record: data };
}

async function airtableCreateRecord(env, table, fields, typecast = false) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503 };
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: data };
  return { ok: true, status: 201, record: data.records?.[0] || null };
}

async function airtableUpdateRecord(env, table, recordId, fields, typecast = false) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: data };
  return { ok: true, status: 200, record: data.records?.[0] || null };
}

async function airtableDeleteRecord(env, table, recordId) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table || !recordId) return { ok: false, status: 503 };
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, status: 200 };
}

async function signPayload(payload, env) {
  const secret = clean(env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) return "";
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacHex(encoded, secret);
  return `${encoded}.${signature}`;
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(a, b) {
  const left = clean(a);
  const right = clean(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function serializeSessionCookie(token, maxAge, request, env) {
  const crossSite = usesPartitionedDashboardCookie(request, env);
  const sameSite = crossSite ? "None; Partitioned" : "Lax";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/v1/model; HttpOnly; Secure; SameSite=${sameSite}`;
}

function usesPartitionedDashboardCookie(request, env) {
  const origin = clean(request.headers.get("origin"));
  const dashboardOrigin = clean(env.MODEL_DASHBOARD_ORIGIN);
  if (!origin || !dashboardOrigin || origin !== dashboardOrigin || !isAllowedOrigin(request, env)) return false;
  return origin !== new URL(request.url).origin;
}

function readCookie(header, name) {
  return parseCookieHeader(header)[name] || "";
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function normalizeWord(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
}

function firstText(fields, names) {
  for (const name of names) {
    if (!name) continue;
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) return clean(value[0]);
    if (value !== undefined && value !== null && clean(value)) return clean(value);
  }
  return "";
}

function arrayText(value) {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean);
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeHttpUrl(value) {
  const text = clean(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeAttachmentUrl(value) {
  if (!value || typeof value !== "object") return "";
  return safeHttpUrl(value.url || value.thumbnails?.large?.url || value.thumbnails?.full?.url || "");
}

function imageExtension(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  return "jpg";
}

function modelsTable(env) {
  return clean(env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT);
}

function mediaTable(env) {
  return clean(env.AIRTABLE_TABLE_MODEL_MEDIA || MEDIA_TABLE_DEFAULT);
}

function clean(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function isAllowedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return true;
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(clean).filter(Boolean));
  return allowed.has(origin);
}

function corsHeaders(request, env) {
  const origin = clean(request.headers.get("origin"));
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(payload, status, request, env) {
  const headers = corsHeaders(request, env);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}
