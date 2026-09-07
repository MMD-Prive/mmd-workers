import coreWorker from "./admin-login-hero-worker-core.js";
export * from "./admin-login-hero-worker-core.js";

const AI_OPS_CLIENT_SRC = "/v1/admin/ai-ops/client.js?v=1";
const AI_OPS_WORKER_PAGES = new Set([
  "/internal/admin/kenji",
  "/internal/admin/mms",
]);

export default {
  async fetch(request, env, ctx) {
    const response = await coreWorker.fetch(request, env, ctx);
    return injectAdminAiOpsPage(request, response);
  },
};

export async function injectAdminAiOpsPage(request, response) {
  if (!shouldInject(request, response)) return response;

  const html = await response.text();
  if (!/<\/body\s*>/i.test(html) || html.includes("data-mmd-ai-ops=\"v1\"")) {
    return rebuildResponse(response, html);
  }

  const script = `<script src="${AI_OPS_CLIENT_SRC}" defer data-mmd-ai-ops="v1"></script>`;
  const body = html.replace(/<\/body\s*>/i, `${script}</body>`);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-ai-ops-layer", "v1");
  relaxSelfOnlyCsp(headers);

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function shouldInject(request, response) {
  if (request.method.toUpperCase() !== "GET") return false;
  const path = normalizePath(new URL(request.url).pathname);
  if (!AI_OPS_WORKER_PAGES.has(path)) return false;
  if (!response || response.status < 200 || response.status >= 300) return false;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  return contentType.includes("text/html");
}

function rebuildResponse(response, body) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function relaxSelfOnlyCsp(headers) {
  let csp = String(headers.get("content-security-policy") || "").trim();
  if (!csp) return;
  csp = ensureSelfDirective(csp, "script-src");
  csp = ensureSelfDirective(csp, "connect-src");
  headers.set("content-security-policy", csp);
}

function ensureSelfDirective(csp, name) {
  const pattern = new RegExp(`(^|;)\\s*${name}\\s+([^;]*)`, "i");
  const match = csp.match(pattern);
  if (!match) return `${csp.replace(/;?\s*$/, "")}; ${name} 'self'`;
  if (/(^|\s)'self'(\s|$)/.test(match[2])) return csp;
  return csp.replace(pattern, `${match[1]} ${name} ${match[2].trim()} 'self'`);
}

function normalizePath(value = "") {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
