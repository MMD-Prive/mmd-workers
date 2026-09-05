import currentWorker from "./front-gate-index.js";
export { KenjiModelIdempotency } from "./front-gate-index.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const MY_MMD_UI_PREFIX = "/my-mmd";
const MY_MMD_ASSET_PREFIX = "/my-mmd-assets/";
const LEGACY_MY_MMD_UI_PREFIX = "/member/my-mmd";
const MY_MMD_PRESENTATION_ORIGIN = "https://my-mmd-member-profile.lovable.app";
const MY_MMD_SINGLE_FILE_PATH = "/my-mmd-shell.html";
const MY_MMD_SINGLE_FILE_MARKER = 'data-mmd-shell="lovable-single-file-v1"';
const MY_MMD_PRESENTATION_MODE = "single-file-incident-rollback-20260905";
const MEMBER_LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);

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

function presentationResponseHeaders(upstreamHeaders = new Headers(), { html = false, rewritten = false } = {}) {
  const headers = new Headers(upstreamHeaders);
  for (const name of ["content-length", "set-cookie", "reporting-endpoints", "report-to", "nel"]) headers.delete(name);
  if (rewritten) {
    for (const name of ["content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  }
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", "lovable-single-file-incident-rollback");
  headers.set("x-mmd-presentation-mode", MY_MMD_PRESENTATION_MODE);
  headers.set("x-mmd-presentation-owner", "lovable");
  headers.set("x-mmd-behavior-owner", "mmd-workers");
  headers.set("x-robots-tag", "noindex, nofollow");
  if (html) headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  return headers;
}

function recoveryHtml() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>My MMD</title><style>html,body{margin:0;min-height:100%;background:#fbf9f5;color:#2b2723;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}main{min-height:100svh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(100%,420px);padding:24px;border:1px solid #ebe3d7;border-radius:24px;background:#fff;box-sizing:border-box}.eyebrow{font-size:11px;letter-spacing:.16em;color:#a67f3c}.title{font-size:21px;font-weight:650;margin:10px 0 8px}.copy{font-size:14px;line-height:1.7;color:#7a7168}.btn{min-height:48px;margin-top:20px;border-radius:999px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:14px;background:#2b2723;color:#f6f1e8}</style></head><body><main><section class="card"><div class="eyebrow">MMD PRIVÉ · MY MMD</div><div class="title">My MMD ยังเปิดไม่สำเร็จครับ</div><div class="copy">ระบบไม่แสดงข้อมูลสมาชิกที่ยังตรวจสอบไม่ได้ กรุณาลองเปิดอีกครั้ง ข้อมูลสมาชิกและสิทธิ์ยังคงอยู่ที่ระบบหลังบ้านตามเดิมครับ</div><a class="btn" href="/my-mmd/">ลองอีกครั้ง</a></section></main></body></html>`;
}

function rewriteSingleFileShell(html) {
  return String(html || "")
    .replaceAll("/member/my-mmd", MY_MMD_UI_PREFIX)
    .replaceAll('href="/favicon.ico"', `href="${MY_MMD_ASSET_PREFIX}favicon.ico"`)
    .replaceAll("href='/favicon.ico'", `href='${MY_MMD_ASSET_PREFIX}favicon.ico'`);
}

async function proxySingleFileShell(request) {
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

  const upstreamUrl = new URL(MY_MMD_SINGLE_FILE_PATH, MY_MMD_PRESENTATION_ORIGIN);
  let upstream;
  try {
    upstream = await globalThis.fetch(new Request(upstreamUrl, {
      method: request.method,
      headers: presentationRequestHeaders(request),
      redirect: "follow",
    }));
  } catch (_) {
    return new Response(request.method === "HEAD" ? null : recoveryHtml(), {
      status: 502,
      headers: presentationResponseHeaders(new Headers({ "content-type": "text/html; charset=utf-8" }), { html: true }),
    });
  }

  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const headers = presentationResponseHeaders(upstream.headers, { html: true, rewritten: true });
  headers.set("content-type", "text/html; charset=utf-8");

  if (!upstream.ok || !contentType.includes("text/html")) {
    return new Response(request.method === "HEAD" ? null : recoveryHtml(), { status: 502, headers });
  }
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });

  const rawHtml = await upstream.text();
  if (!rawHtml.includes(MY_MMD_SINGLE_FILE_MARKER)) {
    return new Response(recoveryHtml(), { status: 502, headers });
  }

  return new Response(rewriteSingleFileShell(rawHtml), { status: 200, headers });
}

async function proxyLovableAsset(request) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const source = new URL(request.url);
  const suffix = source.pathname.slice(MY_MMD_ASSET_PREFIX.length);
  const upstreamUrl = new URL(MY_MMD_PRESENTATION_ORIGIN);
  upstreamUrl.pathname = suffix === "favicon.ico" ? "/favicon.ico" : `/assets/${suffix}`;
  upstreamUrl.search = source.search;
  let upstream;
  try {
    upstream = await globalThis.fetch(new Request(upstreamUrl, {
      method: request.method,
      headers: presentationRequestHeaders(request),
      redirect: "follow",
    }));
  } catch (_) {
    return new Response("My MMD asset unavailable", { status: 502, headers: { "cache-control": "no-store" } });
  }
  const headers = presentationResponseHeaders(upstream.headers);
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
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
    if (isMyMmdAssetPath(path)) return proxyLovableAsset(request);
    if (isMyMmdUiPath(path)) return proxySingleFileShell(request);

    // Identity, session, points, membership, entitlement, coupons, history,
    // CARE BACK and every authoritative calculation remain on MMD Workers.
    const response = await currentWorker.fetch(request, env, ctx);
    return rewriteStatusReturnTarget(request, response);
  },
};
