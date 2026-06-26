import app from "./index";

type PartnerPublicPage = {
  page: string;
  webflowPath: string;
  injectFormBridge: boolean;
};

const WORKER_NAME = "partners-worker";
const PARTNER_ROUTE_VERSION = "20260626-partner-route-lock";
const WEBFLOW_ORIGIN = "https://mmdprive.webflow.io";
const WEBFLOW_FORM_SCRIPT_URL = "https://partners-worker.malemodel-bkk.workers.dev/webflow-sigil-partner-form.js";
const PARTNER_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);

const PUBLIC_PARTNER_PAGES: Record<string, PartnerPublicPage> = {
  "/partner": { page: "partner-gate", webflowPath: "/partner", injectFormBridge: false },
  "/partner/apply": { page: "partner-apply", webflowPath: "/partner/apply", injectFormBridge: true },
  "/partner/model": { page: "partner-model", webflowPath: "/partner/model", injectFormBridge: false },
  "/partner/model/preview": { page: "partner-model-preview", webflowPath: "/partner/model/preview", injectFormBridge: false },
  "/partner/form": { page: "partner-form", webflowPath: "/partner/form", injectFormBridge: true },
  "/partner/terms": { page: "partner-terms", webflowPath: "/partner/terms", injectFormBridge: false }
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const route = resolvePublicPartnerPage(url);
    const method = request.method.toUpperCase();

    if ((method === "GET" || method === "HEAD") && route) {
      return fetchPartnerWebflowPage(request, url, route);
    }

    return app.fetch(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;

function resolvePublicPartnerPage(url: URL): PartnerPublicPage | null {
  if (!PARTNER_HOSTS.has(url.hostname)) return null;
  return PUBLIC_PARTNER_PAGES[normalizePartnerPath(url.pathname)] || null;
}

function normalizePartnerPath(pathname: string): string {
  let path = String(pathname || "/").replace(/\/{2,}/g, "/").toLowerCase();
  if (path.length > 1) path = path.replace(/\/+$/g, "");
  return path || "/";
}

async function fetchPartnerWebflowPage(request: Request, url: URL, route: PartnerPublicPage): Promise<Response> {
  const upstreamUrl = new URL(route.webflowPath, WEBFLOW_ORIGIN);
  upstreamUrl.search = url.search;

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers: buildWebflowHeaders(request)
  });

  if (request.method.toUpperCase() === "HEAD") return withPartnerHeaders(upstreamResponse, route);

  const contentType = upstreamResponse.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return withPartnerHeaders(upstreamResponse, route);

  const source = await upstreamResponse.text();
  const html = route.injectFormBridge ? injectFormBridge(source) : source;
  const headers = new Headers(upstreamResponse.headers);

  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=60, stale-while-revalidate=300");
  addPartnerHeaders(headers, route);

  return new Response(html, { status: upstreamResponse.status, statusText: upstreamResponse.statusText, headers });
}

function buildWebflowHeaders(request: Request): Headers {
  const headers = new Headers();
  const accept = request.headers.get("accept");
  const acceptLanguage = request.headers.get("accept-language");
  const userAgent = request.headers.get("user-agent");

  headers.set("accept", accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);
  if (userAgent) headers.set("user-agent", userAgent);
  return headers;
}

function injectFormBridge(source: string): string {
  if (source.includes(WEBFLOW_FORM_SCRIPT_URL)) return source;

  const openTag = "<" + "script defer src=\"" + WEBFLOW_FORM_SCRIPT_URL + "\">";
  const closeTag = "</" + "script>";
  const bridgeTag = openTag + closeTag;
  const bodyClosePattern = new RegExp("<\\/body>", "i");

  if (bodyClosePattern.test(source)) return source.replace(bodyClosePattern, bridgeTag + "</body>");
  return source + bridgeTag;
}

function withPartnerHeaders(response: Response, route: PartnerPublicPage): Response {
  const headers = new Headers(response.headers);
  addPartnerHeaders(headers, route);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function addPartnerHeaders(headers: Headers, route: PartnerPublicPage): void {
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-page", route.page);
  headers.set("x-mmd-origin", WEBFLOW_ORIGIN + route.webflowPath);
  headers.set("x-mmd-partner-bridge", "edge");
  headers.set("x-mmd-front-gate", WORKER_NAME);
  headers.set("x-mmd-front-version", PARTNER_ROUTE_VERSION);
}
