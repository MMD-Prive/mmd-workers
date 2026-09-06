import worker from "./studio-telegram-worker.js";
import dashboardWorker from "./dashboard-worker.js";
import coreWorker, { MODEL_SCHEMA_PATCH_V1_ROUTES, isAuthed as isCoreAdminAuthed } from "./index.js";
import {
  APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON,
  APPROVED_ADMIN_LOGIN_FAVICON,
  ADMIN_LOGIN_SESSION_PATH,
  APPROVED_ADMIN_LOGIN_HERO,
  APPROVED_ADMIN_LOGIN_LOGO,
  renderApprovedAdminLogin,
} from "./admin-login-page.js";
import { handleKenjiKnowledgeRequest, isKenjiKnowledgeRequest } from "./kenji-knowledge-runtime.js";
import { handleLineOfcConsoleBackfill, isLineOfcConsoleBackfillRequest } from "./line-ofc-console-backfill.js";
export { KenjiKnowledgeCoordinator } from "./kenji-knowledge-airtable-adapter.js";
export { ModelActivationCoordinator } from "./model-first-time-activation.js";
export { ModelLocationCoordinator } from "./model-location-runtime.js";
export { LineOfcConsoleBackfillCoordinator } from "./line-ofc-console-backfill.js";
import { handleKenjiPublicKnowledgeRequest, isKenjiPublicKnowledgeRequest } from "./kenji-public-knowledge-runtime.js";
import { handleMmsAdminRequest, isMmsAdminRequest } from "./mms-admin-runtime.js";
import {
  handleKenjiModelAccessRpc,
  KENJI_MODEL_ACCESS_RPC_PATH,
} from "./kenji-model-access-rpc.js";
import {
  handleKenjiModelAdminRequest,
  isKenjiModelAdminRequest,
} from "./kenji-model-admin-adapter.js";
import { handleKenjiControlRequest, isKenjiControlRequest } from "./kenji-control-endpoints.js";
import {
  handleKenjiControlAction,
  handleKenjiRuntimeStatusRpc,
  isKenjiControlActionRequest,
  isKenjiRuntimeStatusRpcRequest,
} from "./kenji-control-actions.js";
import {
  handlePaymentEntitlementApproval,
  isPaymentEntitlementApprovalRequest,
} from "./payment-entitlement-approval.js";
import {
  handlePaymentReviewRequest,
  isPaymentReviewRequest,
} from "./payment-review-runtime.js";
import {
  handlePublicModelApplicationReviewRequest,
  isPublicModelApplicationReviewRequest,
} from "./public-model-application-review.js";
import { createCredentialBoundAdminSession, getCredentialBoundAdminLoginCredential, readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { activateMmsPartner, authenticateMmsPartner, recoverMmsPartner } from "./mms-partner-auth-store.js";

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
const ADMIN_GATE_SESSION_COOKIE = "mmd_admin_gate_v1";
const ADMIN_GATE_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_GATE_SHARED_COOKIE_DOMAIN = "mmdbkk.com";
const ADMIN_GATE_ALLOWED_BASE_URLS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
]);
const MMS_PARTNER_ROLE = "mms_partner";
const MMS_PARTNER_PAGE_PATH = "/internal/admin/mms";
const MMS_PARTNER_API_PREFIX = "/v1/admin/mms";

const ALLOWED_NEXT_PATHS = [
  "/internal/admin",
  "/internal/admin/control-room",
  "/internal/admin/customer-data",
  "/internal/admin/dashboard",
  "/internal/admin/model-applications",
  MMS_PARTNER_PAGE_PATH,
  "/internal/admin/payments",
  "/internal/admin/jobs/create-session",
  "/internal/admin/jobs/create-job",
  "/internal/admin/create-session",
  "/internal/admin/kenji",
  "/internal/admin/kenji-knowledge",
  "/internal/jobs/create-job",
];

export function normalizeNext(value) {
  return sanitizeNextPath(value);
}

export function renderAdminLogin(request, options = {}) {
  const url = new URL(request.url);
  const next = sanitizeNextPath(options.next || url.searchParams.get("next") || "");
  return renderApprovedAdminLogin(request, {
    ...options,
    next,
    error: options.error || "",
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();
    const paymentReviewRequest = isPaymentReviewRequest(path, method);

    // Model Console V16 schema-patch routes live in the legacy core runtime,
    // but admin-worker's active entrypoint is this composed worker. Forward only
    // the exact additive route set so the patch remains reachable without
    // broadening admin-worker ownership over /v1/model/*.
    if (MODEL_SCHEMA_PATCH_V1_ROUTE_SET.has(path)) {
      return coreWorker.fetch(request, env, ctx);
    }

    // Service-binding-only Kenji lookup. The handler also verifies the local
    // service hostname, caller marker, and shared internal bearer before it
    // reads membership or model data.
    if (path === KENJI_MODEL_ACCESS_RPC_PATH) {
      return handleKenjiModelAccessRpc(request, env);
    }

    // Service-binding-only runtime controls. This is intentionally handled
    // before the browser admin gate and performs its own strict service auth.
    if (isKenjiRuntimeStatusRpcRequest(path, method)) {
      return handleKenjiRuntimeStatusRpc(request, env);
    }

    if (path === ADMIN_LOGIN_SESSION_PATH && method === "POST") {
      return handleCredentialBoundAdminLogin(request, env);
    }

    if (path === ADMIN_LOGIN_SESSION_PATH && method === "DELETE") {
      return handleCredentialBoundAdminLogout(request);
    }

    // Payment Review is deliberately browser-session-only. Never let service
    // bearer/confirm credentials become an alternate browser path for money review.
    if (paymentReviewRequest && (request.headers.get("Authorization") || request.headers.get("X-Confirm-Key"))) {
      return strictJson(request, env, { ok: false, error: "browser_admin_session_required" }, 403);
    }
    if (paymentReviewRequest && method === "POST") {
      const origin = request.headers.get("Origin") || "";
      if (origin !== url.origin || !ADMIN_GATE_ALLOWED_BASE_URLS.has(origin)) {
        return strictJson(request, env, { ok: false, error: "forbidden_origin" }, 403);
      }
    }

    const strictGate = await applyCredentialBoundAdminGate(request, env, path, method);
    if (strictGate.response) return strictGate.response;
    request = strictGate.request || request;

    if (isPublicModelApplicationReviewRequest(path)) {
      return handlePublicModelApplicationReviewRequest(request, env, strictGate.actor);
    }

    if (paymentReviewRequest) {
      return handlePaymentReviewRequest(request, env, strictGate.actor);
    }

    if (isPaymentEntitlementApprovalRequest(path, method)) {
      return handlePaymentEntitlementApproval(request, env, strictGate.actor);
    }

    if (isKenjiControlActionRequest(path, method)) {
      return handleKenjiControlAction(request, env, strictGate.actor);
    }

    if (isLineOfcConsoleBackfillRequest(path, method)) {
      return handleLineOfcConsoleBackfill(request, env, strictGate.actor);
    }

    if (isMmsAdminRequest(path, method)) {
      return handleMmsAdminRequest(request, env);
    }

    if (isKenjiModelAdminRequest(path, method)) {
      return handleKenjiModelAdminRequest(request, env);
    }

    if (isKenjiControlRequest(path, method)) {
      return handleKenjiControlRequest(request, env);
    }

    if (isKenjiKnowledgeRequest(path, method)) {
      const knowledgeOptions = strictGate.actor
        ? { actor: strictGate.actor, isAuthed: () => true }
        : {};
      return handleKenjiKnowledgeRequest(request, env, knowledgeOptions);
    }

    if (isKenjiPublicKnowledgeRequest(path, method)) {
      return handleKenjiPublicKnowledgeRequest(request, env);
    }

    return worker.fetch(request, env, ctx);
  },
};

function normalizePath(pathname) {
  if (!pathname) return "/";
  const normalized = pathname.replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) return normalized.slice(0, -1);
  return normalized;
}

async function applyCredentialBoundAdminGate(request, env, path, method) {
  if (isGateBypassedAdminPath(path, method)) return { request };
  if (path === ADMIN_LOGIN_PAGE_PATH || path === SIGIL_ADMIN_LOGIN_PAGE_PATH) {
    if (method === "GET" || method === "HEAD") return { response: renderLoginGate(request, env) };
  }

  if (!isBrowserAdminPath(path)) return { request };

  const actor = await readAdminGateActor(request, env);
  if (actor) {
    if (actor.role === MMS_PARTNER_ROLE && !isMmsPartnerAllowedPath(path)) {
      if (method === "HEAD" || isApiAdminPath(path)) {
        return { response: strictJson(request, env, { ok: false, error: "mms_partner_scope_forbidden" }, 403) };
      }
      const origin = new URL(request.url).origin;
      return {
        response: new Response(null, {
          status: 303,
          headers: adminGateHeaders(request, env, {
            location: `${origin}${MMS_PARTNER_PAGE_PATH}`,
            "x-mmd-admin-gate": "mms-partner-scope",
          }),
        }),
      };
    }

    const headers = new Headers(request.headers);
    headers.set("x-mmd-admin-actor", actor.id || "per");
    headers.set("x-mmd-admin-role", actor.role || "admin");
    headers.set("x-mmd-admin-source", "credential-bound-session");
    return {
      request: new Request(request, { headers }),
      actor,
    };
  }

  if (method === "HEAD" || isApiAdminPath(path)) {
    return { response: strictJson(request, env, { ok: false, error: "unauthorized" }, 401) };
  }

  const url = new URL(request.url);
  const loginUrl = new URL(ADMIN_LOGIN_PAGE_PATH, url.origin);
  loginUrl.searchParams.set("next", sanitizeNextPath(`${path}${url.search}`));
  return {
    response: new Response(null, {
      status: 303,
      headers: adminGateHeaders(request, env, {
        location: loginUrl.toString(),
        "x-mmd-admin-gate": "credential-required",
      }),
    }),
  };
}

function isGateBypassedAdminPath(path, method) {
  if (path === ADMIN_LOGIN_SESSION_PATH) return true;
  if (path === ADMIN_DASHBOARD_API_PATH && (method === "GET" || method === "HEAD")) return true;
  return false;
}

function isMmsPartnerAllowedPath(path) {
  return path === MMS_PARTNER_PAGE_PATH || path === MMS_PARTNER_API_PREFIX || path.startsWith(`${MMS_PARTNER_API_PREFIX}/`);
}

function isBrowserAdminPath(path) {
  return path.startsWith("/internal/admin") || path.startsWith("/sigil/internal/admin") || path.startsWith("/v1/admin");
}

function isApiAdminPath(path) {
  return path.startsWith("/v1/admin") || path.startsWith("/studio/api") || path.includes("/api/");
}

function renderLoginGate(request, env) {
  const url = new URL(request.url);
  return renderAdminLogin(request, {
    next: url.searchParams.get("next") || "",
    error: url.searchParams.get("error") || "",
  });
}

async function handleCredentialBoundAdminLogin(request, env) {
  const originCheck = ensureAllowedOrigin(request);
  if (originCheck) return originCheck;

  let payload = {};
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
    } else {
      payload = await request.json();
    }
  } catch {
    return strictJson(request, env, { ok: false, error: "invalid_json" }, 400);
  }

  const action = String(payload.action || "owner_login").trim();
  const requestedNext = sanitizeNextPath(payload.next || "");
  const wantsJson = request.headers.get("x-mmd-login-fetch") === "1";

  if (action === "partner_signup") {
    const username = String(payload.username || "").trim();
    const password = String(payload.password || "");
    const invite = String(payload.invite_code || "").trim();
    const inviteSecret = String(env.MMS_PARTNER_ACCESS_CODE || "").trim();
    const adminSecret = getCredentialBoundAdminLoginCredential(env);
    if (!inviteSecret) return strictJson(request, env, { ok: false, error: "partner_activation_unavailable" }, 503);
    if (adminSecret && inviteSecret === adminSecret) {
      return strictJson(request, env, { ok: false, error: "mms_partner_credential_collision" }, 503);
    }
    if (!invite || invite !== inviteSecret) return strictJson(request, env, { ok: false, error: "partner_activation_failed" }, 401);
    const result = await activateMmsPartner(env, { username, password });
    if (!result.ok) return strictJson(request, env, { ok: false, error: result.error || "partner_activation_failed" }, result.status || 400);
    return strictJson(request, env, { ok: true, username: result.username, recovery_code: result.recovery_code }, 201);
  }

  if (action === "partner_recover") {
    const result = await recoverMmsPartner(env, {
      username: payload.username,
      recovery_code: payload.recovery_code,
      new_password: payload.new_password,
    });
    if (!result.ok) return strictJson(request, env, { ok: false, error: "partner_recovery_failed" }, result.status || 401);
    return strictJson(request, env, { ok: true, username: result.username, recovery_code: result.recovery_code }, 200);
  }

  let actor;
  let next;
  if (action === "partner_login") {
    const result = await authenticateMmsPartner(env, { username: payload.username, password: payload.password });
    if (!result.ok) {
      const status = result.status === 429 ? 429 : result.status >= 500 ? result.status : 401;
      return adminLoginFailure(request, env, MMS_PARTNER_PAGE_PATH, "partner_login_failed", "เข้าสู่ระบบไม่สำเร็จ", status, wantsJson);
    }
    actor = { id: result.actor_id || "mms-partner", role: MMS_PARTNER_ROLE, auth_method: "password" };
    next = MMS_PARTNER_PAGE_PATH;
  } else {
    const code = String(payload.access_code || payload.code || payload.credential || "").trim();
    if (!code) return adminLoginFailure(request, env, requestedNext, "missing_access_code", "กรุณาใส่รหัสสำหรับเข้าใช้งาน", 400, wantsJson);
    const adminSecret = getCredentialBoundAdminLoginCredential(env);
    if (!adminSecret) return adminLoginFailure(request, env, requestedNext, "admin_login_credential_missing", "ระบบรหัส Admin ยังไม่พร้อม", 503, wantsJson);
    const inviteSecret = String(env.MMS_PARTNER_ACCESS_CODE || "").trim();
    if (inviteSecret && inviteSecret === adminSecret) {
      return adminLoginFailure(request, env, requestedNext, "mms_partner_credential_collision", "รหัส Partner ต้องแยกจากรหัส Owner", 503, wantsJson);
    }
    if (code !== adminSecret) return adminLoginFailure(request, env, requestedNext, "invalid_access_code", "รหัสยังไม่ถูกต้อง", 401, wantsJson);
    actor = { id: "per", role: "admin", auth_method: "credential" };
    next = requestedNext;
  }

  if (String(env.ADMIN_LOGIN_CREDENTIAL || "").trim() && !String(env.ADMIN_SESSION_SECRET || env.SESSION_SECRET || "").trim()) {
    return adminLoginFailure(request, env, next, "admin_session_secret_missing", "ระบบ session Admin ยังไม่พร้อม", 503, wantsJson);
  }

  let cookie;
  try {
    cookie = await createCredentialBoundAdminSession(request, actor, env);
  } catch {
    return adminLoginFailure(request, env, next, "admin_session_unavailable", "ระบบ session Admin ยังไม่พร้อม", 503, wantsJson);
  }

  const headers = adminGateHeaders(request, env, {
    "set-cookie": adminSessionCookie(request, cookie, Math.floor(ADMIN_GATE_TTL_MS / 1000)),
    "x-mmd-admin-login": "session-created",
    "x-mmd-admin-role": actor.role,
    "x-mmd-admin-next": next,
  });
  if (wantsJson) {
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store, max-age=0");
    return new Response(JSON.stringify({ ok: true, next, role: actor.role }), { status: 200, headers });
  }
  headers.set("location", next);
  return new Response(null, { status: 303, headers });
}

async function handleCredentialBoundAdminLogout(request) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "set-cookie": adminSessionCookie(request, "", 0),
  });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function adminLoginFailure(request, env, next, code, message, status, wantsJson) {
  if (wantsJson) return strictJson(request, env, { ok: false, error: code }, status);
  return renderAdminLogin(request, { next, error: message, status });
}

function adminSessionCookie(request, value, maxAge) {
  const hostname = new URL(request.url).hostname;
  const sharedDomain = hostname === "mmdbkk.com" || hostname === "www.mmdbkk.com"
    ? `; Domain=${ADMIN_GATE_SHARED_COOKIE_DOMAIN}`
    : "";
  return `${ADMIN_GATE_SESSION_COOKIE}=${value}; Path=/${sharedDomain}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function sanitizeNextPath(value) {
  const fallback = "/internal/admin/control-room";
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  let parsed;
  try {
    parsed = new URL(raw, "https://mmdbkk.com");
  } catch {
    return fallback;
  }
  if (!ADMIN_GATE_ALLOWED_BASE_URLS.has(parsed.origin)) return fallback;
  const candidate = normalizePath(parsed.pathname);
  if (!ALLOWED_NEXT_PATHS.includes(candidate)) return fallback;
  const blockedQueryKeys = new Set(["token", "access_token", "code", "credential", "access_code", "secret", "key", "session"]);
  for (const key of parsed.searchParams.keys()) {
    if (blockedQueryKeys.has(String(key || "").toLowerCase())) return fallback;
  }
  return `${candidate}${parsed.search || ""}${parsed.hash || ""}`;
}

function ensureAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const requestOrigin = new URL(request.url).origin;
  if (!ADMIN_GATE_ALLOWED_BASE_URLS.has(origin) || !ADMIN_GATE_ALLOWED_BASE_URLS.has(requestOrigin)) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden_origin" }), {
      status: 403,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, max-age=0",
      },
    });
  }
  return null;
}

async function readAdminGateActor(request, env) {
  return readCredentialBoundAdminActor(request, env);
}

async function signAdminActor(actor, env) {
  const secret = getAdminGateSecret(env);
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(actor)));
  const signature = await hmacSha256(secret, payload);
  return `${payload}.${signature}`;
}

async function verifyAdminActor(token, env) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = await hmacSha256(getAdminGateSecret(env), payload);
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    return null;
  }
}

function getAdminLoginCredential(env) {
  const dedicated = String(env.ADMIN_LOGIN_CREDENTIAL || "").trim();
  if (dedicated) return dedicated;
  return String(env.ADMIN_ACCESS_CODE || env.SIGIL_ADMIN_ACCESS_CODE || env.ADMIN_BEARER || "").trim();
}

function getAdminGateSecret(env) {
  const secret = String(
    env.ADMIN_SESSION_SECRET ||
      env.SESSION_SECRET ||
      env.ADMIN_LOGIN_CREDENTIAL ||
      env.ADMIN_ACCESS_CODE ||
      env.SIGIL_ADMIN_ACCESS_CODE ||
      env.ADMIN_BEARER ||
      ""
  ).trim();
  if (!secret) throw new Error("Missing admin gate secret");
  return secret;
}

async function hmacSha256(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function parseCookie(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

function strictJson(request, env, payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: adminGateHeaders(request, env, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      ...extraHeaders,
    }),
  });
}

function adminGateHeaders(request, env, extra = {}) {
  const headers = new Headers(extra);
  headers.set("x-mmd-admin-gate-version", "credential-bound-v1");
  return headers;
}
export { MmsPartnerAuthStore } from "./mms-partner-auth-store.js";
