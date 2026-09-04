import {
  handleMmsTherapistAuthRequest,
  therapistAuthErrorResponse,
} from "./therapist-auth-runtime.mjs";

const GPS_VISIBILITY_PATH = "/male-massage/therapists/api/auth/gps-visibility";
const AUTH_ME_PATH = "/male-massage/therapists/api/auth/me";
const STORAGE_VERSION = 1;
const MAX_JSON_CHARS = 4_000;

export function isMmsTherapistGpsVisibilityRequest(pathname = "") {
  return normalizePath(pathname) === GPS_VISIBILITY_PATH;
}

export async function handleMmsTherapistGpsVisibilityRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = String(request.method || "GET").toUpperCase();

  if (path !== GPS_VISIBILITY_PATH) {
    return json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
  }

  if (method === "OPTIONS") {
    requireTrustedOrigin(request, env);
    return new Response(null, { status: 204, headers: responseHeaders() });
  }

  if (method !== "GET" && method !== "PUT") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { Allow: "GET,PUT" });
  }

  if (method === "PUT") requireTrustedOrigin(request, env);
  requireStorage(env);

  const auth = await authorizeTherapist(request, env);
  if (auth.response) return auth.response;

  const therapistId = clean(auth.data?.therapist_id, 80);
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(therapistId)) {
    return json({ ok: false, error: { code: "THERAPIST_SESSION_INVALID" } }, 401);
  }

  if (method === "GET") {
    const setting = await loadSetting(therapistId, env);
    return json({ ok: true, data: safeSetting(setting) }, 200);
  }

  const body = await readJson(request);
  if (typeof body.enabled !== "boolean") {
    return json({ ok: false, error: { code: "GPS_VISIBILITY_INVALID" } }, 400);
  }

  // This endpoint stores only the visibility preference. Coordinates are intentionally rejected.
  const forbidden = ["lat", "lng", "latitude", "longitude", "position", "coords"];
  if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    return json({ ok: false, error: { code: "GPS_COORDINATES_NOT_ACCEPTED" } }, 400);
  }

  const next = {
    version: STORAGE_VERSION,
    enabled: body.enabled,
    audience: "mms_operations",
    active_job_only: true,
    updated_at: new Date().toISOString(),
  };

  await saveSetting(therapistId, next, env);
  return json({ ok: true, data: safeSetting(next) }, 200);
}

export function therapistGpsVisibilityErrorResponse() {
  return json({ ok: false, error: { code: "THERAPIST_GPS_VISIBILITY_UNAVAILABLE" } }, 503);
}

async function authorizeTherapist(request, env) {
  const url = new URL(request.url);
  url.pathname = AUTH_ME_PATH;
  url.search = "";
  const authRequest = new Request(url.toString(), {
    method: "GET",
    headers: request.headers,
  });

  let response;
  try {
    response = await handleMmsTherapistAuthRequest(authRequest, env);
  } catch (error) {
    response = therapistAuthErrorResponse(error, authRequest, env);
  }

  if (!response.ok) return { response };

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { response: json({ ok: false, error: { code: "THERAPIST_GPS_VISIBILITY_UNAVAILABLE" } }, 503) };
  }

  if (!payload || payload.ok !== true || !payload.data) {
    return { response: json({ ok: false, error: { code: "THERAPIST_GPS_VISIBILITY_UNAVAILABLE" } }, 503) };
  }

  return { data: payload.data };
}

async function loadSetting(therapistId, env) {
  const object = await env.MMS_PRIVATE_UPLOADS.get(storageKey(therapistId));
  if (!object) return defaultSetting();
  try {
    const parsed = JSON.parse(await object.text());
    return {
      version: STORAGE_VERSION,
      enabled: parsed?.enabled === true,
      audience: "mms_operations",
      active_job_only: true,
      updated_at: clean(parsed?.updated_at, 80) || null,
    };
  } catch {
    throw new Error("GPS_VISIBILITY_STORAGE_CORRUPT");
  }
}

async function saveSetting(therapistId, setting, env) {
  await env.MMS_PRIVATE_UPLOADS.put(storageKey(therapistId), JSON.stringify(setting), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      therapist_id: therapistId,
      purpose: "working_gps_visibility_preference",
    },
  });
}

function defaultSetting() {
  return {
    version: STORAGE_VERSION,
    enabled: false,
    audience: "mms_operations",
    active_job_only: true,
    updated_at: null,
  };
}

function safeSetting(setting) {
  return {
    enabled: setting?.enabled === true,
    audience: "mms_operations",
    active_job_only: true,
    updated_at: setting?.updated_at || null,
  };
}

function requireStorage(env) {
  if (!env.MMS_PRIVATE_UPLOADS?.get || !env.MMS_PRIVATE_UPLOADS?.put) {
    throw new Error("MMS_PRIVATE_UPLOADS_NOT_CONFIGURED");
  }
}

function requireTrustedOrigin(request, env) {
  const origin = clean(request.headers.get("Origin"), 300);
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (!origin || !allowed.has(origin)) {
    const error = new Error("ORIGIN_NOT_ALLOWED");
    error.status = 403;
    error.code = "ORIGIN_NOT_ALLOWED";
    throw error;
  }
}

async function readJson(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    return {};
  }
  if (!text || text.length > MAX_JSON_CHARS) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function responseHeaders() {
  return {
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...responseHeaders(),
      ...extraHeaders,
    },
  });
}

function storageKey(therapistId) {
  return `therapist-profile/${therapistId}/gps-visibility.json`;
}

function normalizePath(pathname = "") {
  const path = String(pathname || "").trim() || "/";
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function clean(value, max = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, max);
}

export const therapistGpsVisibilityContract = Object.freeze({
  path: GPS_VISIBILITY_PATH,
  default_enabled: false,
  audience: "mms_operations",
  active_job_only: true,
  stores_coordinates: false,
});
