import worker from "./index";
import { renderOwnerCreateSessionPage, type OwnerCreateSessionEnv } from "./create-session-owner-ui";
import type { Env } from "./types";

const CANONICAL_ADMIN_LOGIN_PATH = "/internal/admin/login";
const CANONICAL_CREATE_SESSION_PATH = "/internal/admin/jobs/create-session";
const LEGACY_ADMIN_LOGIN_PATHS = new Set([
  "/sigil/admin/login",
  "/sigil/internal/admin/login",
  "/admin/login",
]);
const LEGACY_ADMIN_BROWSER_ROUTES = new Map([
  ["/sigil/admin", "/internal/admin/dashboard"],
  ["/sigil/admin/dashboard", "/internal/admin/dashboard"],
  ["/sigil/admin/control-room", "/internal/admin/control-room"],
]);

function isLegacyAdminLoginPath(pathname: string): boolean {
  return LEGACY_ADMIN_LOGIN_PATHS.has(pathname);
}

function redirectToCanonical(url: URL, canonicalPath: string, headerName: string): Response {
  const location = new URL(`${canonicalPath}${url.search}`, url.origin).toString();

  return new Response(null, {
    status: 308,
    headers: {
      location,
      "cache-control": "no-store",
      [headerName]: canonicalPath,
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

function legacyAdminBrowserMethodNotAllowed(canonicalPath: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "legacy_admin_browser_method_not_allowed",
      canonical_path: canonicalPath,
    }),
    {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-mmd-admin-canonical": canonicalPath,
      },
    },
  );
}

function rewriteLegacyAdminLoginRedirect(request: Request, response: Response): Response {
  if (response.status < 300 || response.status >= 400) return response;

  const rawLocation = response.headers.get("location");
  if (!rawLocation) return response;

  const requestUrl = new URL(request.url);
  const redirectUrl = new URL(rawLocation, requestUrl.origin);
  if (!isLegacyAdminLoginPath(redirectUrl.pathname) && redirectUrl.pathname !== CANONICAL_ADMIN_LOGIN_PATH) {
    return response;
  }

  redirectUrl.pathname = CANONICAL_ADMIN_LOGIN_PATH;

  const headers = new Headers(response.headers);
  headers.set("location", redirectUrl.toString());
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-admin-login-canonical", CANONICAL_ADMIN_LOGIN_PATH);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function maybeRestoreOwnerCreateSession(
  request: Request,
  env: Env,
  response: Response,
): Promise<Response> {
  if (request.method !== "GET") return response;
  const url = new URL(request.url);
  if (url.pathname !== CANONICAL_CREATE_SESSION_PATH) return response;

  // The canonical worker must approve the request first. A login redirect,
  // auth failure, or non-HTML response is preserved exactly and never replaced.
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) {
    return response;
  }

  const owner = await renderOwnerCreateSessionPage(request, env as unknown as OwnerCreateSessionEnv);
  if (!owner.ok || !(owner.headers.get("content-type") || "").includes("text/html")) return owner;

  // These Worker asset routes are exact. Keep the runtime script queryless so
  // it cannot fall through to the Webflow origin while preserving Owner v14 UI.
  const headers = new Headers(owner.headers);
  headers.set("x-mmd-create-session-authority", "canonical-backend");
  headers.set("x-mmd-create-session-assets", "queryless-exact-routes");
  headers.set("x-mmd-create-session-gate-ui", "server-verified");
  const html = (await owner.text()).replace(
    "/a/create-session.js?v=owner-v14-vnext2",
    "/a/create-session.js",
  );

  return new Response(html, {
    status: owner.status,
    statusText: owner.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (isLegacyAdminLoginPath(url.pathname)) {
      if (request.method === "GET" || request.method === "HEAD") {
        return redirectToCanonical(url, CANONICAL_ADMIN_LOGIN_PATH, "x-mmd-admin-login-canonical");
      }

      return legacyAdminLoginMethodNotAllowed();
    }

    const canonicalBrowserPath = LEGACY_ADMIN_BROWSER_ROUTES.get(url.pathname);
    if (canonicalBrowserPath) {
      if (request.method === "GET" || request.method === "HEAD") {
        return redirectToCanonical(url, canonicalBrowserPath, "x-mmd-admin-canonical");
      }

      return legacyAdminBrowserMethodNotAllowed(canonicalBrowserPath);
    }

    const response = await worker.fetch(request, env);
    const canonicalResponse = rewriteLegacyAdminLoginRedirect(request, response);
    return maybeRestoreOwnerCreateSession(request, env, canonicalResponse);
  },
};