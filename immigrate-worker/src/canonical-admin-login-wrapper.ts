import worker from "./index";
import { renderCreateSessionFocusFlowV2 } from "./create-session-focus-flow-v2";
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

async function maybeRenderCreateSessionFocusFlow(request: Request, response: Response): Promise<Response> {
  if (request.method !== "GET") return response;
  const url = new URL(request.url);
  if (url.pathname !== CANONICAL_CREATE_SESSION_PATH) return response;

  // Preserve the current canonical admin gate. The focus UI is swapped in only
  // after the protected route has already returned an allowed HTML response.
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) {
    return response;
  }

  const focus = renderCreateSessionFocusFlowV2();
  const headers = new Headers(focus.headers);
  let html = await focus.text();

  // The custom-host Worker routes are intentionally exact/narrow. Do not add
  // cache-busting query strings to these two internal assets or the request can
  // fall through to the public Webflow origin instead of immigrate-worker.
  html = html
    .replace("/a/create-session.js?v=focus-flow-v2-core", "/a/create-session.js")
    .replace("/a/create-session-focus-flow-v2.js?v=2", "/a/create-session-focus-flow-v2.js")
    .replace(
      '<button class="ff2__ghost" type="button" data-op-check-session>Check Session</button>',
      '<button class="ff2__ghost" type="button" disabled aria-disabled="true">Session Verified</button>',
    )
    .replace(
      '<span class="ff2__connection" data-op-connection><i></i><span>Checking</span></span>',
      '<span class="ff2__connection is-ok" data-focus-server-gate="verified" style="color:var(--ok)"><i style="background:var(--ok);box-shadow:0 0 12px rgba(121,215,162,.55)"></i><span>Secure Session</span></span>',
    );

  headers.set("x-mmd-create-session-assets", "queryless-exact-routes");
  headers.set("x-mmd-create-session-gate-ui", "server-verified");

  return new Response(html, {
    status: focus.status,
    statusText: focus.statusText,
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
    return maybeRenderCreateSessionFocusFlow(request, canonicalResponse);
  },
};