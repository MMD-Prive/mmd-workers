import { getSessionCreatorStaticAsset } from "./session-creator-runtime/static-assets.js";

export const CREATE_JOB_WORKER_PATH = "/internal/admin/jobs/create-job";
const ASSET_PREFIX = `${CREATE_JOB_WORKER_PATH}/assets/`;

export function isCreateJobWorkerPageRequest(path, method = "GET") {
  if (method !== "GET" && method !== "HEAD") return false;
  const value = String(path || "");
  return value.replace(/\/+$/g, "") === CREATE_JOB_WORKER_PATH ||
    (value.startsWith(ASSET_PREFIX) && value.length > ASSET_PREFIX.length);
}

function withoutResponseCookies(headers) {
  const safe = new Headers(headers);
  for (const name of ["set-cookie", "content-length", "content-encoding", "cross-origin-opener-policy", "cross-origin-embedder-policy", "cross-origin-resource-policy"]) safe.delete(name);
  return safe;
}

function rewriteAssets(source) {
  return source.replace(/(^|[\s("'])\/assets\//g, `$1${ASSET_PREFIX}`);
}

function assetPath(path) {
  const relative = path.slice(ASSET_PREFIX.length);
  try {
    const parts = relative.split("/").map((part) => decodeURIComponent(part));
    if (!relative || parts.some((part) => !part || part === "." || part === ".." || part.includes("/") || part.includes("\\"))) return null;
    return `/assets/${parts.map((part) => encodeURIComponent(part)).join("/")}`;
  } catch {
    return null;
  }
}

export async function handleCreateJobWorkerPage(request, ctx = { waitUntil() {} }) {
  const incoming = new URL(request.url);
  if (!isCreateJobWorkerPageRequest(incoming.pathname, request.method)) return new Response("not_found", { status: 404 });

  if (incoming.pathname.startsWith(ASSET_PREFIX)) {
    const path = assetPath(incoming.pathname);
    const response = path ? getSessionCreatorStaticAsset(path) : null;
    if (!response) return new Response("not_found", { status: 404 });
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  }

  let app;
  try {
    app = await import("./session-creator-runtime/server/index.mjs");
  } catch {
    return new Response("session_creator_unavailable", { status: 503, headers: { "cache-control": "no-store" } });
  }

  let upstream;
  try {
    const pageUrl = new URL(incoming);
    pageUrl.pathname = CREATE_JOB_WORKER_PATH;
    const pageRequest = new Request(pageUrl, request);
    upstream = await app.default.fetch(pageRequest, {}, {
      waitUntil: typeof ctx?.waitUntil === "function" ? ctx.waitUntil.bind(ctx) : () => {},
    });
  } catch {
    return new Response("session_creator_unavailable", { status: 503, headers: { "cache-control": "no-store", "x-mmd-route-owner": "admin-worker-api-create-job" } });
  }

  const headers = withoutResponseCookies(upstream.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-route-owner", "admin-worker-api-create-job");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "same-origin");
  if (request.method !== "HEAD" && String(headers.get("content-type") || "").toLowerCase().includes("text/html")) {
    const html = await upstream.text();
    return new Response(rewriteAssets(html), { status: upstream.status, statusText: upstream.statusText, headers });
  }
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}
