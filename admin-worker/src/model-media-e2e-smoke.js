import modelWorker from "./model-liff-worker.js";

export const MODEL_MEDIA_E2E_SMOKE_PATH = "/v1/admin/model-media/e2e-smoke";

const ALLOWED_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const COOKIE_NAME = "mmd_model_session_v1";
const SESSION_TTL_SECONDS = 180;
const PNG_FIXTURE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl5sAAAAASUVORK5CYII=";

export async function handleModelMediaE2ESmoke(request, env = {}, actor = null, delegatedWorker = modelWorker) {
  if (request.method.toUpperCase() !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const role = clean(actor?.role).toLowerCase();
  if (!actor || !["owner", "admin"].includes(role)) {
    return json({ ok: false, error: actor ? "forbidden" : "unauthorized" }, actor ? 403 : 401);
  }

  const url = new URL(request.url);
  const origin = clean(request.headers.get("origin"));
  if (!ALLOWED_ORIGINS.has(url.origin) || origin !== url.origin) {
    return json({ ok: false, error: "forbidden_origin" }, 403);
  }

  const body = await request.json().catch(() => null);
  const modelRecordId = clean(body?.model_record_id);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelRecordId)) {
    return json({ ok: false, error: "model_record_id_invalid" }, 400);
  }

  const token = await signModelSession({
    kind: "model_session",
    role: "model",
    model_record_id: modelRecordId,
    line_environment: "published",
    smoke: "model_media_e2e",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }, env);
  if (!token) return json({ ok: false, error: "model_session_signing_not_ready" }, 503);

  const cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  const headers = {
    cookie,
    origin,
    accept: "application/json",
  };

  let mediaId = "";
  let fileName = "";
  let modelName = "";
  let cleanupOk = false;
  let stage = "profile";

  try {
    const profileResponse = await delegatedWorker.fetch(new Request(`${url.origin}/v1/model/profile`, {
      method: "GET",
      headers,
    }), env);
    const profile = await profileResponse.clone().json().catch(() => ({}));
    if (!profileResponse.ok || profile?.ok !== true || !profile?.model) {
      throw smokeError("profile", profileResponse.status, profile?.error || "profile_read_failed");
    }
    modelName = clean(
      profile.model.display_name ||
      profile.model.working_name ||
      profile.model.name ||
      profile.model.model_code ||
      "Model",
    );

    // A previous failed smoke must never leave campaign/test media behind.
    // Remove only our uniquely-prefixed fixtures through the same authenticated
    // Model delete route before creating the next fixture.
    stage = "stale_cleanup";
    const staleRemoved = await cleanupStaleSmokeMedia(
      delegatedWorker,
      env,
      url.origin,
      cookie,
      origin,
    );

    stage = "upload";
    const fixtureBytes = decodeBase64(PNG_FIXTURE_BASE64);
    fileName = `mmd-model-media-e2e-${Date.now()}.png`;
    const form = new FormData();
    form.append("file", new Blob([fixtureBytes], { type: "image/png" }), fileName);
    form.append("media_type", "public_gallery");

    const uploadResponse = await delegatedWorker.fetch(new Request(`${url.origin}/v1/model/media/upload`, {
      method: "POST",
      headers: { cookie, origin, accept: "application/json" },
      body: form,
    }), env);
    const upload = await uploadResponse.clone().json().catch(() => ({}));
    mediaId = clean(upload?.media?.media_id);
    if (uploadResponse.status !== 201 || upload?.ok !== true || !/^media_[A-Za-z0-9-]+$/.test(mediaId)) {
      throw smokeError("upload", uploadResponse.status, upload?.error || "media_upload_failed");
    }
    if (clean(upload?.media?.file_name) !== fileName || clean(upload?.media?.file_type) !== "image/png") {
      throw smokeError("upload_projection", 502, "upload_projection_mismatch");
    }

    stage = "registry";
    const listResponse = await delegatedWorker.fetch(new Request(`${url.origin}/v1/model/media`, {
      method: "GET",
      headers,
    }), env);
    const list = await listResponse.clone().json().catch(() => ({}));
    const media = Array.isArray(list?.media) ? list.media : [];
    const exact = media.find((item) => item?.media_id === mediaId);
    if (!listResponse.ok || list?.ok !== true || !exact) {
      throw smokeError("registry", listResponse.status, list?.error || "media_registry_missing");
    }
    if (clean(exact.file_name) !== fileName || clean(exact.file_type) !== "image/png") {
      throw smokeError("registry_projection", 502, "media_registry_projection_mismatch");
    }

    stage = "r2_read";
    const fileResponse = await delegatedWorker.fetch(new Request(
      `${url.origin}/v1/model/media/${encodeURIComponent(mediaId)}/file`,
      { method: "GET", headers },
    ), env);
    if (!fileResponse.ok) {
      const payload = await fileResponse.clone().json().catch(() => ({}));
      throw smokeError("r2_read", fileResponse.status, payload?.error || "media_file_read_failed");
    }
    const contentType = clean(fileResponse.headers.get("content-type")).toLowerCase();
    const cacheControl = clean(fileResponse.headers.get("cache-control")).toLowerCase();
    const openedBytes = new Uint8Array(await fileResponse.arrayBuffer());
    if (contentType !== "image/png" || !cacheControl.includes("private") || !cacheControl.includes("no-store")) {
      throw smokeError("r2_headers", 502, "media_file_headers_invalid");
    }
    if (!bytesEqual(fixtureBytes, openedBytes)) {
      throw smokeError("r2_bytes", 502, "media_file_bytes_mismatch");
    }

    stage = "cleanup";
    cleanupOk = await cleanupMedia(delegatedWorker, env, url.origin, cookie, origin, mediaId);
    if (!cleanupOk) throw smokeError("cleanup", 502, "media_cleanup_failed");

    stage = "post_cleanup";
    const missingResponse = await delegatedWorker.fetch(new Request(
      `${url.origin}/v1/model/media/${encodeURIComponent(mediaId)}/file`,
      { method: "GET", headers },
    ), env);
    if (missingResponse.status !== 404) {
      throw smokeError("post_cleanup", 502, "media_cleanup_not_observed");
    }

    return json({
      ok: true,
      smoke: "model_media_authenticated_e2e",
      model: {
        model_record_id: modelRecordId,
        display_name: modelName || "Model",
      },
      upload: {
        media_id: mediaId,
        file_name: fileName,
        file_type: "image/png",
        file_size_bytes: fixtureBytes.byteLength,
      },
      checks: {
        model_session_authenticated: true,
        real_model_profile_read: true,
        r2_write: true,
        media_record_created: true,
        media_record_read_back: true,
        r2_file_opened: true,
        byte_match: true,
        cleanup_deleted_record_and_object: true,
        post_cleanup_404: true,
        stale_smoke_media_removed: staleRemoved,
      },
    }, 200);
  } catch (error) {
    if (mediaId && !cleanupOk) {
      cleanupOk = await cleanupMedia(delegatedWorker, env, url.origin, cookie, origin, mediaId).catch(() => false);
    }
    return json({
      ok: false,
      smoke: "model_media_authenticated_e2e",
      stage: clean(error?.stage) || stage,
      status: Number(error?.status) || 502,
      error: clean(error?.code) || "model_media_e2e_failed",
      cleanup_attempted: Boolean(mediaId),
      cleanup_ok: cleanupOk,
    }, Number(error?.status) >= 400 && Number(error?.status) <= 599 ? Number(error.status) : 502);
  }
}

async function cleanupStaleSmokeMedia(delegatedWorker, env, baseOrigin, cookie, origin) {
  const response = await delegatedWorker.fetch(new Request(`${baseOrigin}/v1/model/media`, {
    method: "GET",
    headers: { cookie, origin, accept: "application/json" },
  }), env);
  const body = await response.clone().json().catch(() => ({}));
  if (!response.ok || body?.ok !== true || !Array.isArray(body?.media)) {
    throw smokeError("stale_cleanup_list", response.status, body?.error || "media_list_failed");
  }

  const stale = body.media.filter((item) =>
    /^mmd-model-media-e2e-\d+\.png$/.test(clean(item?.file_name)) &&
    /^media_[A-Za-z0-9-]+$/.test(clean(item?.media_id))
  );
  for (const item of stale) {
    const deleted = await cleanupMedia(
      delegatedWorker,
      env,
      baseOrigin,
      cookie,
      origin,
      clean(item.media_id),
    );
    if (!deleted) throw smokeError("stale_cleanup_delete", 502, "stale_media_cleanup_failed");
  }
  return stale.length;
}

async function cleanupMedia(delegatedWorker, env, baseOrigin, cookie, origin, mediaId) {
  const response = await delegatedWorker.fetch(new Request(
    `${baseOrigin}/v1/model/media/${encodeURIComponent(mediaId)}`,
    {
      method: "DELETE",
      headers: { cookie, origin, accept: "application/json" },
    },
  ), env);
  const body = await response.clone().json().catch(() => ({}));
  return response.ok && body?.ok === true && body?.media_id === mediaId;
}

export async function signModelSession(payload, env = {}) {
  const secret = clean(env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) return "";
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacHex(encoded, secret);
  return `${encoded}.${signature}`;
}

function smokeError(stage, status, code) {
  const error = new Error(code);
  error.stage = stage;
  error.status = status;
  error.code = code;
  return error;
}

function decodeBase64(value) {
  const binary = atob(String(value));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function clean(value, max = 1000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
    },
  });
}
