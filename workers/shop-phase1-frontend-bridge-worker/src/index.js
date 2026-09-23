import { SHOP_EDGE_RUNTIME } from "./runtime.js";

export const WORKER_NAME = "shop-phase1-frontend-bridge-worker";
export const RUNTIME_VERSION = "20260922-phase1-webflow-cutover-v1";
export const WEBFLOW_ORIGIN = "https://mmdprive.webflow.io";
const HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);
const PATHS = new Set(["/shop", "/mmd-shop"]);

export function normalizePath(pathname) {
  let path = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/g, "");
  return path || "/";
}

export function isBridgeRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return HOSTS.has(url.hostname.toLowerCase())
    && PATHS.has(normalizePath(url.pathname).toLowerCase())
    && ["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase());
}

function baseHeaders(response, path) {
  const headers = new Headers(response?.headers || {});
  headers.delete("content-length");
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-page", path === "/shop" ? "himai-shop" : "mmd-shop");
  headers.set("x-mmd-runtime-version", RUNTIME_VERSION);
  headers.set("x-mmd-origin", WEBFLOW_ORIGIN);
  headers.set("x-mmd-shop-phase1-edge", "compatibility-v1");
  return headers;
}

export function injectBridge(html, path) {
  if (html.includes('id="mmd-shop-phase1-edge-bridge"')) return html;
  const marker = '<meta name="mmd-shop-phase1-edge" content="' + RUNTIME_VERSION + '">';
  const script = '<script id="mmd-shop-phase1-edge-bridge">' + SHOP_EDGE_RUNTIME + '</script>';
  const payload = marker + "\n" + script;
  if (html.includes("</head>")) return html.replace("</head>", payload + "\n</head>");
  return payload + "\n" + html;
}

async function proxyWebflow(request) {
  const incoming = new URL(request.url);
  const path = normalizePath(incoming.pathname).toLowerCase();
  const upstream = new URL(WEBFLOW_ORIGIN + path);
  upstream.search = incoming.search;
  const response = await fetch(new Request(upstream.toString(), {
    method: "GET",
    headers: {
      accept: request.headers.get("accept") || "text/html,application/xhtml+xml",
      "accept-language": request.headers.get("accept-language") || "th,en;q=0.9",
      "user-agent": request.headers.get("user-agent") || WORKER_NAME,
    },
    redirect: "follow",
  }));
  if (!response.ok) {
    return new Response("Shop page is temporarily unavailable.", {
      status: 502,
      headers: baseHeaders(null, path),
    });
  }
  const headers = baseHeaders(response, path);
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (!type.includes("text/html")) {
    return new Response(request.method.toUpperCase() === "HEAD" ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  const html = injectBridge(await response.text(), path);
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, { status: 200, headers });
}

function reject(request) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname).toLowerCase();
  if (!HOSTS.has(url.hostname.toLowerCase()) || !PATHS.has(path)) {
    return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  return Response.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, {
    status: 405,
    headers: { allow: "GET, HEAD, OPTIONS" },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname).toLowerCase();
    if (request.method.toUpperCase() === "OPTIONS" && HOSTS.has(url.hostname.toLowerCase()) && PATHS.has(path)) {
      return new Response(null, { status: 204, headers: baseHeaders(null, path) });
    }
    if (!isBridgeRequest(request)) return reject(request);
    return proxyWebflow(request);
  },
};
