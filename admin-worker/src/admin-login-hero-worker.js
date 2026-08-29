import worker from "./studio-telegram-worker.js";
import dashboardWorker from "./dashboard-worker.js";
import coreWorker, { MODEL_SCHEMA_PATCH_V1_ROUTES } from "./index.js";
import {
  APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON,
  APPROVED_ADMIN_LOGIN_FAVICON,
  ADMIN_LOGIN_SESSION_PATH,
  APPROVED_ADMIN_LOGIN_HERO,
  APPROVED_ADMIN_LOGIN_LOGO,
  renderApprovedAdminLogin,
} from "./admin-login-page.js";
import { handleKenjiKnowledgeRequest, isKenjiKnowledgeRequest } from "./kenji-knowledge-runtime.js";
import { handleKenjiPublicKnowledgeRequest, isKenjiPublicKnowledgeRequest } from "./kenji-public-knowledge-runtime.js";
import { handleMmsAdminRequest, isMmsAdminRequest } from "./mms-admin-runtime.js";

export const ADMIN_LOGIN_PAGE_PATH = "/internal/admin/login";
export const SIGIL_ADMIN_LOGIN_PAGE_PATH = "/sigil/internal/admin/login";
export const ADMIN_DASHBOARD_API_PATH = "/v1/admin/dashboard";
export {
  ADMIN_LOGIN_SESSION_PATH,
  APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON,
  APPROVED_ADMIN_LOGIN_FAVICON,
  APPROVED_ADMIN_LOGIN_HERO,
  APPROVED_ADMIN_LOGIN_LOGO,
};

const MODEL_SCHEMA_PATCH_V1_ROUTE_SET = new Set(Object.values(MODEL_SCHEMA_PATCH_V1_ROUTES));
const ADMIN_LOGIN_DEBUG_PATH = "/internal/admin/login/debug";
const ADMIN_GATE_SESSION_COOKIE = "mmd_admin_gate_v1";
const ADMIN_GATE_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_LOGIN_DEBUG_BUILD_MARKER = "admin-login-credential-debug-v1-2026-08-29";
const ADMIN_LOGIN_CREDENTIAL_MISMATCH_MESSAGE = "รหัสยังไม่ถูกต้องครับ ลองตรวจอีกครั้ง";
const ADMIN_LOGIN_SECRET_NOT_READY_MESSAGE = "Admin login secret is not ready.";
const ADMIN_SESSION_SECRET_NOT_READY_MESSAGE = "Admin session secret is not ready.";
const ADMIN_ORIGIN_FAILED_MESSAGE = "Admin origin check failed.";
const ADMIN_GATE_ALLOWED_BASE_URLS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);

const ALLOWED_NEXT_PATHS = [
  "/internal/admin",
  "/internal/admin/control-room",
  "/internal/admin/dashboard",
  "/internal/admin/mms",
  "/internal/admin/jobs/create-session",
  "/internal/admin/jobs/create-job",
  "/internal/admin/create-session",
  "/internal/admin/kenji-knowledge",
  "/internal/jobs/create-job",
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    // Model Console V16 schema-patch routes live in the legacy core runtime,
    // but admin-worker's active entrypoint is this composed worker. Forward only
    // the exact additive route set so the patch remains reachable without
    // broadening admin-worker ownership over /v1/model/*.
    if (MODEL_SCHEMA_PATCH_V1_ROUTE_SET.has(path)) {
      return coreWorker.fetch(request, env, ctx);
    }

    if (path === ADMIN_LOGIN_DEBUG_PATH) {
      if (method === "GET" || method === "POST") return handleCredentialBoundAdminLoginDebug(request, env);
      return strictJson(request, env, { ok: false, error: "method_not_allowed" }, 405);
    }

    if (path === ADMIN_LOGIN_SESSION_PATH && method === "POST") {
      return handleCredentialBoundAdminLogin(request, env);
    }

    if (path === ADMIN_LOGIN_SESSION_PATH && method === "DELETE") {
      return handleCredentialBoundAdminLogout(request);
    }

    const strictGate = await applyCredentialBoundAdminGate(request, env, path, method);
    if (strictGate.response) return strictGate.response;
    request = strictGate.request || request;

    if (isMmsAdminRequest(path)) {
      return handleMmsAdminRequest(request, env, ctx);
    }

    // Per-side MMD Console read API. The dashboard worker is read-only,
    // uses the canonical admin auth helper, and loads operational Airtable data.
    if (path === ADMIN_DASHBOARD_API_PATH) {
      return dashboardWorker.fetch(request, env, ctx);
    }

    if (isKenjiPublicKnowledgeRequest(path, method)) {
      return handleKenjiPublicKnowledgeRequest(request, env, ctx);
    }

    if (isKenjiKnowledgeRequest(path, method)) {
      return handleKenjiKnowledgeRequest(request, env, ctx);
    }

    if (
      (path === ADMIN_LOGIN_PAGE_PATH || path === SIGIL_ADMIN_LOGIN_PAGE_PATH) &&
      (method === "GET" || method === "HEAD")
    ) {
      return renderAdminLogin(request, {
        next: normalizeNext(url.searchParams.get("next")),
      });
    }

    return worker.fetch(request, env, ctx);
  },
};

export function renderAdminLogin(request, { status = 200, error = "", next = "/internal/admin/control-room" } = {}) {
  return renderApprovedAdminLogin(request, {
    status,
    error,
    next: normalizeNext(next),
  });
}

async function handleCredentialBoundAdminLogin(request, env) {
  const requestOrigin = new URL(request.url).origin;
  if (!isAdminLoginOriginOk(request)) {
    return renderAdminLogin(request, { status: 403, error: ADMIN_ORIGIN_FAILED_MESSAGE });
  }

  if (!isAdminLoginFormContentType(request)) {
    return renderAdminLogin(request, { status: 400, error: ADMIN_LOGIN_CREDENTIAL_MISMATCH_MESSAGE });
  }

  let form;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return renderAdminLogin(request, { status: 400, error: ADMIN_LOGIN_CREDENTIAL_MISMATCH_MESSAGE });
  }

  const credential = clean(form.get("credential"));
  const activeCredential = getCredentialBoundLoginCredential(env);
  if (!activeCredential) {
    return renderAdminLogin(request, {
      status: 503,
      error: ADMIN_LOGIN_SECRET_NOT_READY_MESSAGE,
      next: normalizeNext(form.get("next")),
    });
  }
  if (!credential || !(await constantTimeEqual(credential, activeCredential))) {
    return renderAdminLogin(request, {
      status: 401,
      error: ADMIN_LOGIN_CREDENTIAL_MISMATCH_MESSAGE,
      next: normalizeNext(form.get("next")),
    });
  }

  if (!getCredentialBoundSessionSecret(env)) {
    return renderAdminLogin(request, {
      status: 503,
      error: ADMIN_SESSION_SECRET_NOT_READY_MESSAGE,
      next: normalizeNext(form.get("next")),
    });
  }

  const now = Date.now();
  const session = {
    version: 2,
    scope: "internal_admin",
    host: requestOrigin,
    iat: now,
    exp: now + ADMIN_GATE_TTL_MS,
    nonce: crypto.randomUUID(),
    auth_method: "login",
  };
  const cookie = await makeCredentialBoundAdminCookie(session, env);
  if (!cookie) {
    return renderAdminLogin(request, {
      status: 503,
      error: ADMIN_SESSION_SECRET_NOT_READY_MESSAGE,
      next: normalizeNext(form.get("next")),
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store, private",
      Location: normalizeNext(form.get("next")),
      "Set-Cookie": cookie,
    },
  });
}

async function handleCredentialBoundAdminLoginDebug(request, env) {
  const contentTypeOk = isAdminLoginFormContentType(request);
  const body = buildCredentialBoundAdminLoginDebugMetadata(request, env);

  if (request.method.toUpperCase() === "POST") {
    let input = "";
    if (contentTypeOk) {
      try {
        input = new URLSearchParams(await request.text()).get("credential") || "";
      } catch {
        input = "";
      }
    }
    const trimmedInput = clean(input);
    const envCredential = getCredentialBoundLoginCredential(env);
    body.input_length = String(input || "").length;
    body.input_trimmed_length = trimmedInput.length;
    body.env_credential_length = envCredential.length;
    body.credential_match = Boolean(
      trimmedInput &&
      envCredential &&
      (await constantTimeEqual(trimmedInput, envCredential))
    );
    body.origin_ok = isAdminLoginOriginOk(request);
    body.content_type_ok = contentTypeOk;
  }

  return strictJson(request, env, body);
}

function buildCredentialBoundAdminLoginDebugMetadata(request, env) {
  const url = new URL(request.url);
  const loginCredential = getCredentialBoundLoginCredential(env);
  const sessionSecret = getCredentialBoundSessionSecret(env);
  const cookieMap = parseCookieMap(request);
  return {
    ok: true,
    worker: "admin-worker",
    route_owner: "admin-worker",
    build_marker: ADMIN_LOGIN_DEBUG_BUILD_MARKER,
    path: normalizePath(url.pathname),
    method: request.method.toUpperCase(),
    origin_seen: request.headers.get("Origin") || "",
    content_type_seen: request.headers.get("Content-Type") || "",
    has_ADMIN_LOGIN_CREDENTIAL: Boolean(loginCredential),
    admin_login_credential_trimmed_length: loginCredential.length,
    has_ADMIN_SESSION_SECRET: Boolean(sessionSecret),
    admin_session_secret_trimmed_length: sessionSecret.length,
    has_internal_bridge_token: Boolean(clean(env.INTERNAL_TOKEN || env.ADMIN_BEARER || env.CONFIRM_KEY)),
    cookie_present: cookieMap.has(ADMIN_GATE_SESSION_COOKIE),
    session_cookie_version_if_decodable: readCredentialBoundSessionCookieVersionIfDecodable(cookieMap),
  };
}

function readCredentialBoundSessionCookieVersionIfDecodable(cookieMap) {
  const raw = cookieMap.get(ADMIN_GATE_SESSION_COOKIE);
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const [payloadPart] = decoded.includes(".") ? decoded.split(".") : [decoded];
    if (!payloadPart) return null;
    const parsed = JSON.parse(base64UrlDecode(payloadPart));
    const version = Number(parsed?.version);
    return Number.isFinite(version) ? version : null;
  } catch {
    return null;
  }
}

function isAdminLoginOriginOk(request) {
  const origin = request.headers.get("Origin") || "";
  const requestOrigin = new URL(request.url).origin;
  return Boolean(origin && origin === requestOrigin && ADMIN_GATE_ALLOWED_BASE_URLS.has(requestOrigin));
}

function isAdminLoginFormContentType(request) {
  const contentType = (request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  return contentType === "application/x-www-form-urlencoded";
}

function handleCredentialBoundAdminLogout(request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("Origin") || "";
  if (origin !== requestOrigin || !ADMIN_GATE_ALLOWED_BASE_URLS.has(requestOrigin)) {
    return strictJson(request, {}, { ok: false, error: "forbidden" }, 403);
  }
  return new Response(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store, private",
      Location: ADMIN_LOGIN_PAGE_PATH,
      "Set-Cookie": `${ADMIN_GATE_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

async function applyCredentialBoundAdminGate(request, env, path, method) {
  if (method === "OPTIONS" || !isCredentialBoundAdminPath(path)) return { request };
  if (hasServiceAuthHeader(request)) return { request };

  const session = await readCredentialBoundAdminSession(request, env);
  if (!isValidCredentialBoundAdminSession(session, request)) {
    return { response: strictJson(request, env, { ok: false, authenticated: false, error: "unauthorized" }, 401) };
  }

  const bypass = clean(env.INTERNAL_TOKEN || env.ADMIN_BEARER || env.CONFIRM_KEY);
  if (!bypass) {
    return { response: strictJson(request, env, { ok: false, authenticated: false, error: "admin_auth_bridge_not_ready" }, 503) };
  }

  return { request: withInternalAuthorization(request, bypass) };
}

function isCredentialBoundAdminPath(path) {
  return (
    path === ADMIN_DASHBOARD_API_PATH ||
    path === "/v1/internal/kenji/knowledge/published" ||
    path.startsWith("/v1/admin/") ||
    path.startsWith("/studio/api/")
  );
}

function hasServiceAuthHeader(request) {
  const auth = clean(request.headers.get("Authorization"));
  const confirm = clean(request.headers.get("X-Confirm-Key"));
  return Boolean(auth || confirm);
}

function withInternalAuthorization(request, token) {
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(request, { headers });
}

async function readCredentialBoundAdminSession(request, env) {
  const raw = parseCookieMap(request).get(ADMIN_GATE_SESSION_COOKIE);
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const [payloadPart, signaturePart] = decoded.split(".");
    if (!payloadPart || !signaturePart) return null;
    const expected = await signCredentialBoundPayload(payloadPart, env);
    if (!expected || !(await constantTimeEqual(signaturePart, expected))) return null;
    const parsed = JSON.parse(base64UrlDecode(payloadPart));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isValidCredentialBoundAdminSession(session, request) {
  if (!session || session.version !== 2) return false;
  if (session.scope !== "internal_admin") return false;
  if (!session.host || !ADMIN_GATE_ALLOWED_BASE_URLS.has(session.host)) return false;
  if (session.host !== new URL(request.url).origin) return false;
  if (!Number.isFinite(session.iat) || !Number.isFinite(session.exp)) return false;
  const now = Date.now();
  if (session.iat > now || session.exp <= now || session.exp - session.iat > ADMIN_GATE_TTL_MS) return false;
  if (!session.nonce || typeof session.nonce !== "string") return false;
  return true;
}

async function makeCredentialBoundAdminCookie(session, env) {
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = await signCredentialBoundPayload(payload, env);
  if (!signature) return "";
  const value = encodeURIComponent(`${payload}.${signature}`);
  return `${ADMIN_GATE_SESSION_COOKIE}=${value}; Path=/; Max-Age=${Math.floor(ADMIN_GATE_TTL_MS / 1000)}; HttpOnly; Secure; SameSite=Lax`;
}

async function signCredentialBoundPayload(payload, env) {
  const secret = getCredentialBoundSigningSecret(env);
  if (!secret) return "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function getCredentialBoundSigningSecret(env = {}) {
  const sessionSecret = getCredentialBoundSessionSecret(env);
  const loginCredential = getCredentialBoundLoginCredential(env);
  if (!sessionSecret || !loginCredential) return "";
  return `${sessionSecret}.${loginCredential}`;
}

function getCredentialBoundLoginCredential(env = {}) {
  return clean(env.ADMIN_LOGIN_CREDENTIAL);
}

function getCredentialBoundSessionSecret(env = {}) {
  return clean(env.ADMIN_SESSION_SECRET);
}

function parseCookieMap(request) {
  const map = new Map();
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.split("=");
    const key = clean(name);
    if (!key) continue;
    map.set(key, rest.join("=").trim());
  }
  return map;
}

function strictJson(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...Object.fromEntries(strictCorsHeaders(request, env)),
      "X-MMD-Route-Owner": "admin-worker",
      "X-MMD-Worker": "admin-worker",
    },
  });
}

function strictCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = clean(env.ALLOWED_ORIGINS)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const headers = new Headers({
    "Cache-Control": "no-store, private",
    "Content-Type": "application/json; charset=utf-8",
  });
  if (origin && (!allowed.length || allowed.includes(origin))) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  return headers;
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(clean(left))),
    crypto.subtle.digest("SHA-256", encoder.encode(clean(right))),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i += 1) difference |= aa[i] ^ bb[i];
  return difference === 0;
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function normalizeNext(value = "") {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("..")) return "/internal/admin/control-room";
  let parsed;
  try {
    parsed = new URL(raw, "https://mmdbkk.com");
  } catch {
    return "/internal/admin/control-room";
  }
  const allowed = ALLOWED_NEXT_PATHS.some((path) => parsed.pathname === path || (path === "/internal/admin/control-room" && parsed.pathname.startsWith(`${path}/`)));
  if (!allowed) return "/internal/admin/control-room";
  for (const key of parsed.searchParams.keys()) {
    if (/token|secret|password|credential|cookie|authorization|bearer|confirm_key/i.test(key)) return "/internal/admin/control-room";
  }
  return `${parsed.pathname}${parsed.search}`;
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
