import worker from "./index";
import type { Env } from "./types";

const CANONICAL_ADMIN_LOGIN_PATH = "/internal/admin/login";
const LEGACY_ADMIN_LOGIN_PATHS = new Set([
  "/sigil/admin/login",
  "/sigil/internal/admin/login",
  "/admin/login",
]);

function isLegacyAdminLoginPath(pathname: string): boolean {
  return LEGACY_ADMIN_LOGIN_PATHS.has(pathname);
}

function redirectLegacyAdminLogin(url: URL): Response {
  const location = new URL(`${CANONICAL_ADMIN_LOGIN_PATH}${url.search}`, url.origin).toString();

  return new Response(null, {
    status: 308,
    headers: {
      location,
      "cache-control": "no-store",
      "x-mmd-admin-login-canonical": CANONICAL_ADMIN_LOGIN_PATH,
    },
  });
}

function legacyAdminLoginMethodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "legacy_admin_login_method_not_allowed",
      canonical_login: CANONICAL_ADMIN_LOGIN_PATH,
    }),
    {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-mmd-admin-login-canonical": CANONICAL_ADMIN_LOGIN_PATH,
      },
    },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (isLegacyAdminLoginPath(url.pathname)) {
      if (request.method === "GET" || request.method === "HEAD") {
        return redirectLegacyAdminLogin(url);
      }

      return legacyAdminLoginMethodNotAllowed();
    }

    return worker.fetch(request, env);
  },
};
