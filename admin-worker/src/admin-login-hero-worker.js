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
export { KenjiKnowledgeCoordinator } from "./kenji-knowledge-airtable-adapter.js";
import { handleKenjiPublicKnowledgeRequest, isKenjiPublicKnowledgeRequest } from "./kenji-public-knowledge-runtime.js";
import { handleMmsAdminRequest, isMmsAdminRequest } from "./mms-admin-runtime.js";
import {
  handleKenjiModelAccessRpc,
  KENJI_MODEL_ACCESS_RPC_PATH,
} from "./kenji-model-access-rpc.js";

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
  "/internal/admin/kenji",
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

    // Service-binding-only Kenji lookup. The handler also verifies the local
    // service hostname, caller marker, and shared internal bearer before it
    // reads membership or model data.
    if (path === KENJI_MODEL_ACCESS_RPC_PATH) {
      return handleKenjiModelAccessRpc(request, env);
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
      return handleKenjiKnowledgeRequest(request, env, {
        actor: strictGate.actor,
      });
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
  const origin = request.headers.get("Origin") || "";
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin || !ADMIN_GATE_ALLOWED_BASE_URLS.has(requestOrigin)) {
    return renderAdminLogin(request, { status: 403, error: "รหัสยังไม่ถูกต้องครับ ลองตรวจอีกครั้ง" });
  }

  const contentType = (request.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return renderAdminLogin(request, { status: 400, error: "รหัสยังไม่ถูกต้องครับ ลองตรวจอีกครั้ง" });
  }

  let form;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return renderAdminLogin(request, { status: 400, error: "รหัสยังไม่ถูกต้องครับ ลองตรวจอีกครั้ง" });
  }

  const credential = clean(form.get("credential"));
  const activeCredential = clean(env.ADMIN_LOGIN_CREDENTIAL);
  if (!activeCredential || !credential || !(await constantTimeEqual(credential, activeCredential))) {
    return renderAdminLogin(request, {
      status: 401,
      error: "รหัสยังไม่ถูกต้องครับ ลองตรวจอีกครั้ง",
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
    actor_id: "boss-per",
    actor_role: "owner",
  };
  const cookie = await makeCredentialBoundAdminCookie(session, env);
  if (!cookie) {
    return renderAdminLogin(request, {
      status: 503,
      error: "รหัสยังไม่พร้อมครับ ลองใหม่อีกครั้ง",
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
  if (method === "OPTIONS" || !isCredentialBoundAdminPath(path)) return { request, actor: null };
  if (hasServiceAuthHeader(request)) {
    // Service credentials may submit Review/QA work, but can never Publish.
    return { request, actor: { id: "service-admin", role: "reviewer" } };
  }

  const session = await readCredentialBoundAdminSession(request, env);
  if (!isValidCredentialBoundAdminSession(session, request)) {
    if ((method === "GET" || method === "HEAD") && path === "/internal/admin/kenji") {
      const login = new URL(ADMIN_LOGIN_PAGE_PATH, request.url);
      login.searchParams.set("next", path);
      return { response: new Response(null, { status: 303, headers: { Location: login.pathname + login.search, "Cache-Control": "no-store" } }) };
    }
    return { response: strictJson(request, env, { ok: false, authenticated: false, error: "unauthorized" }, 401) };
  }

  const bypass = clean(env.INTERNAL_TOKEN || env.ADMIN_BEARER || env.CONFIRM_KEY);
  if (!bypass) {
    return { response: strictJson(request, env, { ok: false, authenticated: false, error: "admin_auth_bridge_not_ready" }, 503) };
  }

  return {
    request: withInternalAuthorization(request, bypass),
    actor: {
      id: clean(session.actor_id || "boss-per"),
      role: clean(session.actor_role || "owner"),
    },
  };
}

function isCredentialBoundAdminPath(path) {
  return (
    path === "/internal/admin/kenji" ||
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
  const sessionSecret = clean(env.ADMIN_SESSION_SECRET);
  const loginCredential = clean(env.ADMIN_LOGIN_CREDENTIAL);
  if (!sessionSecret || !loginCredential) return "";
  return `${sessionSecret}.${loginCredential}`;
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
    headers: strictCorsHeaders(request, env),
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
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key, Idempotency-Key");
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
