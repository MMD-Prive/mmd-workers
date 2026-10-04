const SESSION_CREATOR_ORIGIN = "https://mmd-os.lovable.app";
const WORK_ASSET_PREFIX = "/internal/admin/work/assets/";

const SESSION_CREATOR_PAGES = new Set([
  "/internal/admin/work",
  "/internal/admin/jobs/all",
  "/internal/admin/jobs/create-job",
  "/internal/admin/jobs/job-board",
]);

function normalizedPath(path) {
  return String(path || "").replace(/\/+$/g, "") || "/";
}

export function isSessionCreatorPageRequest(path, method = "GET") {
  const verb = String(method || "GET").toUpperCase();
  return (verb === "GET" || verb === "HEAD") && SESSION_CREATOR_PAGES.has(normalizedPath(path));
}

export function isSessionCreatorAssetRequest(path, method = "GET") {
  const verb = String(method || "GET").toUpperCase();
  return (
    (verb === "GET" || verb === "HEAD") &&
    String(path || "").startsWith(WORK_ASSET_PREFIX) &&
    String(path || "").length > WORK_ASSET_PREFIX.length
  );
}

function upstreamRequestHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function rewritePageAssets(html) {
  const assetBase = `${WORK_ASSET_PREFIX}`;
  let output = html.replace(
    /\b(href|src)=(['"])\/assets\/([^'"]*)\2/gi,
    (_match, attribute, quote, path) => `${attribute}=${quote}${assetBase}${path}${quote}`,
  );
  output = output.replace(
    /<script\b(?=[^>]*\bsrc=['"]\/~flock\.js['"])[^>]*>\s*<\/script>/gi,
    "",
  );
  return output;
}

function rewriteAssetReferences(source) {
  return source.replace(/(^|[\s("'])\/assets\//g, `$1${WORK_ASSET_PREFIX}`);
}

function withoutSetCookie(headers) {
  const safe = new Headers(headers);
  safe.delete("set-cookie");
  safe.delete("content-length");
  safe.delete("content-encoding");
  safe.delete("cross-origin-opener-policy");
  safe.delete("cross-origin-embedder-policy");
  safe.delete("cross-origin-resource-policy");
  return safe;
}

export async function handleSessionCreatorPageRequest(request) {
  const incoming = new URL(request.url);
  const isAsset = isSessionCreatorAssetRequest(incoming.pathname, request.method);
  if (!isAsset && !isSessionCreatorPageRequest(incoming.pathname, request.method)) {
    return new Response("not_found", { status: 404 });
  }

  let upstreamPath;
  if (isAsset) {
    const relativeAssetPath = incoming.pathname.slice(WORK_ASSET_PREFIX.length);
    let safeAssetPath;
    try {
      const segments = relativeAssetPath.split("/").map((part) => decodeURIComponent(part));
      if (
        !relativeAssetPath ||
        segments.some((part) => part === "." || part === ".." || part.includes("/") || part.includes("\\"))
      ) {
        return new Response("not_found", { status: 404 });
      }
      safeAssetPath = segments.map((part) => encodeURIComponent(part)).join("/");
    } catch {
      return new Response("not_found", { status: 404 });
    }
    upstreamPath = `/assets/${safeAssetPath}`;
  } else {
    upstreamPath = normalizedPath(incoming.pathname);
  }

  const upstreamUrl = new URL(upstreamPath, SESSION_CREATOR_ORIGIN);
  upstreamUrl.search = incoming.search;
  const upstream = await fetch(new Request(upstreamUrl, {
    method: request.method,
    headers: upstreamRequestHeaders(request),
    redirect: "manual",
  }));

  const headers = withoutSetCookie(upstream.headers);
  if (isAsset) {
    headers.set("cache-control", "public, max-age=3600");
    const contentType = String(headers.get("content-type") || "").toLowerCase();
    if ((contentType.includes("javascript") || contentType.includes("ecmascript") || contentType.includes("text/css")) && request.method !== "HEAD") {
      const source = await upstream.text();
      return new Response(rewriteAssetReferences(source), {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    }
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  headers.set("cache-control", "no-store");
  headers.set("x-mmd-route-owner", "admin-worker-session-creator-pro");
  if (String(headers.get("content-type") || "").toLowerCase().includes("text/html") && request.method !== "HEAD") {
    const html = await upstream.text();
    return new Response(rewritePageAssets(html), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
