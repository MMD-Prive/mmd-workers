import currentWorker from "./front-gate-index.js";
export { KenjiModelIdempotency } from "./front-gate-index.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const MY_MMD_UI_PREFIX = "/my-mmd";
const MY_MMD_ASSET_PREFIX = "/my-mmd-assets/";
const LEGACY_MY_MMD_UI_PREFIX = "/member/my-mmd";
const MY_MMD_PRESENTATION_ORIGIN = "https://my-mmd-member-profile.lovable.app";
const MEMBER_LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const MEMBER_LIFF_ID = "2010862595-yT4DCEMc";
const MY_MMD_LINE_VERIFY_URL = `https://miniapp.line.me/${MEMBER_LIFF_ID}/?intent=status`;
const BROKEN_MY_MMD_LINE_VERIFY_URLS = [
  `https://miniapp.line.me/${MEMBER_LIFF_ID}?liff.state=%2Fmember%2Fliff%3Fintent%3Dstatus`,
  `https://miniapp.line.me/${MEMBER_LIFF_ID}/?liff.state=%2Fmember%2Fliff%3Fintent%3Dstatus`,
];
const MY_MMD_ROUTE_SUFFIXES = ["membership", "points", "coupons", "history", "profile"];

function normalizedPath(request) {
  return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
}

function isMyMmdUiPath(path) {
  return path === MY_MMD_UI_PREFIX || path === `${MY_MMD_UI_PREFIX}/` || path.startsWith(`${MY_MMD_UI_PREFIX}/`);
}

function isMyMmdAssetPath(path) {
  return path.startsWith(MY_MMD_ASSET_PREFIX);
}

function isLegacyMyMmdUiPath(path) {
  return path === LEGACY_MY_MMD_UI_PREFIX
    || path === `${LEGACY_MY_MMD_UI_PREFIX}/`
    || path.startsWith(`${LEGACY_MY_MMD_UI_PREFIX}/`);
}

function redirectLegacyMyMmd(request) {
  const source = new URL(request.url);
  const suffix = source.pathname.slice(LEGACY_MY_MMD_UI_PREFIX.length);
  const target = new URL(request.url);
  target.pathname = `${MY_MMD_UI_PREFIX}${suffix || "/"}`;
  return new Response(null, {
    status: 308,
    headers: {
      location: target.toString(),
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
      "x-mmd-route-owner": WORKER_NAME,
      "x-mmd-legacy-route": "member-my-mmd-to-my-mmd",
    },
  });
}

function presentationRequestHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "if-none-match", "if-modified-since", "range", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function presentationUrlForPage(request) {
  const source = new URL(request.url);
  const suffix = source.pathname.slice(MY_MMD_UI_PREFIX.length);
  const upstream = new URL(MY_MMD_PRESENTATION_ORIGIN);
  upstream.pathname = suffix || "/";
  upstream.search = source.search;
  return upstream;
}

function presentationUrlForAsset(request) {
  const source = new URL(request.url);
  const suffix = source.pathname.slice(MY_MMD_ASSET_PREFIX.length);
  const upstream = new URL(MY_MMD_PRESENTATION_ORIGIN);
  upstream.pathname = suffix === "favicon.ico" ? "/favicon.ico" : `/assets/${suffix}`;
  upstream.search = source.search;
  return upstream;
}

function rewriteMyMmdHtml(html) {
  let output = String(html || "");

  // Lovable owns presentation only. The customer shell never receives Lovable
  // editor/analytics overlays and never receives MMD session credentials.
  output = output.replace(/<aside\b[^>]*id=["']lovable-badge["'][\s\S]*?<\/aside>/gi, "");
  output = output.replace(/<script\b[^>]*src=["']\/~flock\.js["'][\s\S]*?<\/script>/gi, "");

  // Keep the entire module/style graph same-origin through the Worker.
  output = output.replaceAll("/assets/", MY_MMD_ASSET_PREFIX);
  output = output.replaceAll("/favicon.ico", `${MY_MMD_ASSET_PREFIX}favicon.ico`);

  // SSR may render root links before hydration. Mount them under the canonical app base.
  output = output.replace(/href=["']\/["']/g, `href="${MY_MMD_UI_PREFIX}/"`);
  for (const suffix of MY_MMD_ROUTE_SUFFIXES) {
    output = output.replace(
      new RegExp(`href=["']\\/${suffix}(?:\\/)?["']`, "g"),
      `href="${MY_MMD_UI_PREFIX}/${suffix}"`,
    );
  }

  // Defense in depth during migration from the former /member/my-mmd base.
  output = output.replaceAll("/member/my-mmd-assets/", MY_MMD_ASSET_PREFIX);
  output = output.replaceAll("/member/my-mmd", MY_MMD_UI_PREFIX);
  return output;
}

function rewriteMyMmdJavascript(source) {
  let output = String(source || "")
    .replace(/(["'`])\/assets\//g, `$1${MY_MMD_ASSET_PREFIX}`)
    .replace(/(["'`])assets\//g, `$1my-mmd-assets/`)
    .replaceAll("/member/my-mmd-assets/", MY_MMD_ASSET_PREFIX)
    .replaceAll("/member/my-mmd", MY_MMD_UI_PREFIX);

  for (const broken of BROKEN_MY_MMD_LINE_VERIFY_URLS) {
    output = output.replaceAll(broken, MY_MMD_LINE_VERIFY_URL);
  }
  return output;
}

function presentationResponseHeaders(upstreamHeaders, { html = false, rewritten = false } = {}) {
  const headers = new Headers(upstreamHeaders);
  for (const name of ["content-length", "set-cookie", "reporting-endpoints", "report-to", "nel"]) headers.delete(name);
  if (rewritten) {
    for (const name of ["content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  }
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", "lovable-app-proxy");
  headers.set("x-mmd-presentation-owner", "lovable");
  headers.set("x-mmd-behavior-owner", "mmd-workers");
  headers.set("x-robots-tag", "noindex, nofollow");
  if (html) headers.set("cache-control", "no-store");
  return headers;
}

async function proxyLovableApp(request, { asset = false } = {}) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "cache-control": "no-store",
        "x-mmd-worker": WORKER_NAME,
        "x-mmd-route-owner": WORKER_NAME,
      },
    });
  }

  const upstreamUrl = asset ? presentationUrlForAsset(request) : presentationUrlForPage(request);
  let upstream;
  try {
    upstream = await globalThis.fetch(new Request(upstreamUrl, {
      method: request.method,
      headers: presentationRequestHeaders(request),
      redirect: "follow",
    }));
  } catch (_) {
    return new Response("My MMD is temporarily unavailable.", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-mmd-worker": WORKER_NAME,
        "x-mmd-route-owner": WORKER_NAME,
      },
    });
  }

  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isHtml = !asset && contentType.includes("text/html");
  const isJavascript = asset && (contentType.includes("javascript") || upstreamUrl.pathname.endsWith(".js"));
  const headers = presentationResponseHeaders(upstream.headers, {
    html: isHtml,
    rewritten: isHtml || isJavascript,
  });

  if (request.method === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (isHtml) {
    return new Response(rewriteMyMmdHtml(await upstream.text()), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  if (isJavascript) {
    return new Response(rewriteMyMmdJavascript(await upstream.text()), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

function isStatusLiffShellRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase().replace(/\/{2,}/g, "/");
  if (!MEMBER_LIFF_SHELL_PATHS.has(path)) return false;
  const intent = String(url.searchParams.get("intent") || url.searchParams.get("liff_intent") || "").trim().toLowerCase();
  const campaign = String(url.searchParams.get("campaign") || "").trim().toLowerCase();
  return intent === "status" && !campaign;
}

async function rewriteStatusReturnTarget(request, response) {
  if (!isStatusLiffShellRequest(request) || request.method === "HEAD" || !response.ok) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const rewritten = html.replace('const target = "/member/my-mmd";', 'const target = "/my-mmd/";');
  if (rewritten === html) return new Response(html, response);

  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-liff-return-target", "/my-mmd/");
  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env = {}, ctx) {
    const path = normalizedPath(request);

    if (isLegacyMyMmdUiPath(path)) return redirectLegacyMyMmd(request);
    if (isMyMmdAssetPath(path)) return proxyLovableApp(request, { asset: true });
    if (isMyMmdUiPath(path)) return proxyLovableApp(request);

    // All behavior remains on the existing Worker stack: LIFF/session, points,
    // membership, entitlement, coupons, history, CARE BACK and /api/member/app/*.
    const response = await currentWorker.fetch(request, env, ctx);
    return rewriteStatusReturnTarget(request, response);
  },
};
