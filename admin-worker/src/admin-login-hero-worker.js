import worker from "./studio-telegram-worker.js";
import {
  ADMIN_LOGIN_SESSION_PATH,
  APPROVED_ADMIN_LOGIN_HERO,
  renderApprovedAdminLogin,
} from "./admin-login-page.js";
import { handleKenjiKnowledgeRequest, isKenjiKnowledgeRequest } from "./kenji-knowledge-runtime.js";

export const ADMIN_LOGIN_PAGE_PATH = "/internal/admin/login";
export { ADMIN_LOGIN_SESSION_PATH, APPROVED_ADMIN_LOGIN_HERO };

const ALLOWED_NEXT_PATHS = [
  "/internal/admin",
  "/internal/admin/control-room",
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

    if (isKenjiKnowledgeRequest(path, method)) {
      return handleKenjiKnowledgeRequest(request, env, ctx);
    }

    if (path === ADMIN_LOGIN_PAGE_PATH && (method === "GET" || method === "HEAD")) {
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
