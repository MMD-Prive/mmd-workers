import coreWorker from "./canonical-admin-login-core";
import { renderProtocolCenterPage } from "./protocol-center-owner-ui";
import type { Env } from "./types";

const PROTOCOL_PATHS = new Set([
  "/internal/admin/control-room/protocol",
  "/internal/admin/protocol",
]);
const CONTROL_ROOM_PATH = "/internal/admin/control-room";
const ADMIN_LOGIN_PATH = "/internal/admin/login";
const MODEL_SEARCH_PATH = "/v1/admin/models/search";
const INTERNAL_SIGIL_FAVICON =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0ea3f9421cae9dd223f50b_SIGIL%20only%20logo.webp";

function normalizePath(value: string): string {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function protocolMethodNotAllowed(): Response {
  return Response.json(
    { ok: false, error: "protocol_method_not_allowed" },
    {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "cache-control": "no-store",
      },
    },
  );
}

async function requireProtocolAdminGate(request: Request, env: Env): Promise<Response | null> {
  const probeUrl = new URL(request.url);
  probeUrl.pathname = CONTROL_ROOM_PATH;
  const probe = await coreWorker.fetch(
    new Request(probeUrl.toString(), {
      method: "GET",
      headers: request.headers,
      redirect: "manual",
    }),
    env,
  );

  if (probe.ok && (probe.headers.get("content-type") || "").includes("text/html")) {
    return null;
  }

  const login = new URL(ADMIN_LOGIN_PATH, request.url);
  login.searchParams.set("next", new URL(request.url).pathname + new URL(request.url).search);
  return new Response(null, {
    status: 302,
    headers: {
      location: login.toString(),
      "cache-control": "no-store",
      "x-mmd-admin-login-canonical": ADMIN_LOGIN_PATH,
    },
  });
}

function applyItemsCompatibility(target: Record<string, unknown>): boolean {
  const items = target.items;
  if (!Array.isArray(items)) return false;

  let changed = false;
  if (!Array.isArray(target.models)) {
    target.models = items;
    changed = true;
  }
  if (!Array.isArray(target.records)) {
    target.records = items;
    changed = true;
  }
  return changed;
}

async function decorateModelSearchResponse(response: Response): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) {
    return response;
  }

  try {
    const data = (await response.clone().json()) as Record<string, unknown>;
    let changed = applyItemsCompatibility(data);
    if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
      changed = applyItemsCompatibility(data.data as Record<string, unknown>) || changed;
    }
    if (!changed) return response;

    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    headers.set("x-mmd-model-search-compat", "items-to-models-v1");
    return new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
}

async function decorateInternalHtmlResponse(path: string, response: Response): Promise<Response> {
  if (!path.startsWith("/internal/")) return response;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;
  if (!response.body) return response;

  const html = await response.text();
  const icons = [
    `<link rel="icon" type="image/webp" href="${INTERNAL_SIGIL_FAVICON}">`,
    `<link rel="shortcut icon" type="image/webp" href="${INTERNAL_SIGIL_FAVICON}">`,
    `<link rel="apple-touch-icon" href="${INTERNAL_SIGIL_FAVICON}">`,
  ].join("");
  const withoutExistingIcons = html
    .replace(/<link\b[^>]*\brel=["'](?:shortcut\s+)?icon["'][^>]*>/gi, "")
    .replace(/<link\b[^>]*\brel=["']apple-touch-icon["'][^>]*>/gi, "");
  const rewritten = withoutExistingIcons.includes("</head>")
    ? withoutExistingIcons.replace("</head>", `${icons}</head>`)
    : withoutExistingIcons;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("x-mmd-internal-favicon", "sigil-only-logo-v1");

  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (PROTOCOL_PATHS.has(path)) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return protocolMethodNotAllowed();
      }
      const gate = await requireProtocolAdminGate(request, env);
      if (gate) return gate;
      const response = renderProtocolCenterPage({ headOnly: request.method === "HEAD" });
      return request.method === "GET" ? decorateInternalHtmlResponse(path, response) : response;
    }

    const response = await coreWorker.fetch(request, env);
    if (request.method === "GET" && path === MODEL_SEARCH_PATH) {
      return decorateModelSearchResponse(response);
    }
    if (request.method === "GET") {
      return decorateInternalHtmlResponse(path, response);
    }
    return response;
  },
};
