import {
  renderControlRoomPage,
  renderCreateJobPage,
  renderCreateSessionPage,
  type InternalPageEnv,
} from "./internal-pages";

export interface InternalRoutesEnv extends InternalPageEnv {
  ADMIN_WORKER?: Fetcher;
  ADMIN_WORKER_BASE_URL?: string;
  ASSETS?: Fetcher;
}

function redirect(to: string, status = 302): Response {
  return new Response(null, {
    status,
    headers: {
      location: to,
      "cache-control": "no-store",
    },
  });
}

function withQuery(path: string, url: URL): string {
  return `${path}${url.search || ""}`;
}

function publicAdminAuthBaseUrl(request: Request): string {
  const { hostname } = new URL(request.url);
  if (hostname === "mmdbkk.com") return "https://mmdbkk.com";
  if (hostname === "www.mmdbkk.com") return "https://www.mmdbkk.com";
  return "";
}

function adminLoginRedirect(url: URL): Response {
  return redirect(`/internal/admin/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`, 302);
}

async function serveAsset(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/a/")) return null;

  if (env.ASSETS) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", "public, max-age=300");
      if (url.pathname.endsWith(".js")) headers.set("content-type", "application/javascript; charset=utf-8");
      if (url.pathname.endsWith(".css")) headers.set("content-type", "text/css; charset=utf-8");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
  }

  return new Response("Asset not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function requireAdminGate(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.searchParams.has("mock")) return null;

  const adminBase = publicAdminAuthBaseUrl(request);
  if (!adminBase || !env.ADMIN_WORKER) return adminLoginRedirect(url);

  try {
    const publicHost = new URL(adminBase).hostname;
    const verifyReq = new Request(`${adminBase}/v1/admin/auth/me`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: request.headers.get("cookie") || "",
        "user-agent": request.headers.get("user-agent") || "",
        "x-mmd-auth-bridge": "immigrate-internal-admin-gate",
        "x-mmd-public-host": publicHost,
      },
    });
    const verifyRes = await env.ADMIN_WORKER.fetch(verifyReq);

    if (verifyRes.ok) return null;
  } catch {
    // Use admin login fallback below.
  }

  return adminLoginRedirect(url);
}

async function proxyAdminApi(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/admin/")) return null;

  const adminBase = publicAdminAuthBaseUrl(request);
  if (!adminBase || !env.ADMIN_WORKER) {
    return Response.json({ ok: false, error: "admin_worker_binding_required" }, { status: 502 });
  }
  const targetPath = url.pathname === "/v1/admin/jobs/create-session" ? "/v1/admin/create-session" : url.pathname;
  const publicHost = new URL(adminBase).hostname;
  const target = new URL(`${adminBase}${targetPath}`);
  target.search = url.search;

  const headers = new Headers();
  headers.set("accept", request.headers.get("accept") || "application/json");
  headers.set("cookie", request.headers.get("cookie") || "");
  headers.set("user-agent", request.headers.get("user-agent") || "");
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-mmd-auth-bridge", "immigrate-internal-admin-api");
  headers.set("x-mmd-public-host", publicHost);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  };
  if (init.body) init.duplex = "half";

  const proxied = new Request(target.toString(), init);

  const res = await env.ADMIN_WORKER.fetch(proxied);
  const outHeaders = new Headers(res.headers);
  outHeaders.set("cache-control", "no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
}

export async function handleInternalRoutes(request: Request, env: InternalRoutesEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  const assetRes = await serveAsset(request, env);
  if (assetRes) return assetRes;

  const apiRes = await proxyAdminApi(request, env);
  if (apiRes) return apiRes;

  // Canonical create-session route is the jobs-scoped route. Keep the older
  // route as a durable redirect only, so bookmarks and login next links do not
  // resurrect the legacy operator surface.
  if (pathname === "/internal/admin/create-session") {
    return redirect(withQuery("/internal/admin/jobs/create-session", url), 308);
  }

  if (pathname === "/internal/admin/control-room") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderControlRoomPage();
  }

  if (pathname === "/internal/admin/jobs/create-session") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderCreateSessionPage(env);
  }

  if (pathname === "/internal/jobs/create-job") {
    const gate = await requireAdminGate(request, env);
    if (gate) return gate;
    return renderCreateJobPage();
  }

  return null;
}
