import worker from "./studio-telegram-worker.js";
import dashboardWorker from "./dashboard-worker.js";
import coreWorker, { isAdminGateSessionAuthed, MODEL_SCHEMA_PATCH_V1_ROUTES } from "./index.js";
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
export const MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH = "/internal/admin";
export {
  ADMIN_LOGIN_SESSION_PATH,
  APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON,
  APPROVED_ADMIN_LOGIN_FAVICON,
  APPROVED_ADMIN_LOGIN_HERO,
  APPROVED_ADMIN_LOGIN_LOGO,
};

const MODEL_SCHEMA_PATCH_V1_ROUTE_SET = new Set(Object.values(MODEL_SCHEMA_PATCH_V1_ROUTES));

const ALLOWED_NEXT_PATHS = [
  "/internal/admin",
  "/internal/admin/control-room",
  "/internal/admin/dashboard",
  "/internal/admin/mms",
  "/internal/admin/jobs/create-session",
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

    if (path === ADMIN_LOGIN_SESSION_PATH && method === "POST") {
      const formTextPromise = request.clone().text().catch(() => "");
      const response = await worker.fetch(request, env, ctx);
      const contentType = response.headers.get("content-type") || "";
      if (response.status >= 400 && contentType.includes("text/html")) {
        const form = new URLSearchParams(await formTextPromise);
        return renderAdminLogin(request, {
          status: response.status,
          error: "รหัสยังไม่ถูกต้องครับ ลองตรวจอีกครั้ง",
          next: normalizeNext(form.get("next")),
        });
      }
      return response;
    }

    if (path === MEMBER_RESOLVER_DIAGNOSTIC_TRIGGER_PATH && method === "POST") {
      return handleMemberResolverDiagnosticTrigger(request, env, url);
    }

    return worker.fetch(request, env, ctx);
  },
};

async function handleMemberResolverDiagnosticTrigger(request, env, url) {
  const origin = request.headers.get("Origin") || "";
  if (
    origin !== url.origin ||
    url.search !== "" ||
    request.body !== null ||
    !(await isAdminGateSessionAuthed(request, env))
  ) {
    return new Response(null, { status: 404 });
  }

  try {
    const result = await env.MEMBER_PAGES_RESOLVER_DIAGNOSTIC?.runMemberResolverDiagnostic();
    if (result === "healthy_zero_match") return boundedDiagnosticResponse(result, 200);
  } catch {
    // Preserve the bounded result contract for every downstream failure.
  }
  return boundedDiagnosticResponse("generic_failure", 503);
}

function boundedDiagnosticResponse(result, status) {
  return new Response(result, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function renderAdminLogin(request, { status = 200, error = "", next = "/internal/admin/control-room" } = {}) {
  return renderApprovedAdminLogin(request, {
    status,
    error,
    next: normalizeNext(next),
  });
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

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
