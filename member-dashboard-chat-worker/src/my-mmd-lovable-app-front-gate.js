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
const HYPE_LOADING_URL = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a36fa9c99c7e95731eeca5d_HYPE.webp";
const HYPE_LOADING_PATH = `${MY_MMD_ASSET_PREFIX}hype.webp`;
const STATUS_HYPE_LOADING_URL = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a9be30ba79b9386ecdbe9ab_HYPE_NOW_LOADING_10FRAMES.gif";
const STATUS_HYPE_LOADING_PATH = `${MY_MMD_ASSET_PREFIX}hype-loading.gif`;

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
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>My MMD</title><style>html,body{margin:0;min-height:100%;background:#fbf9f5;color:#2b2723;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}main{min-height:100svh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(100%,420px);padding:24px;border:1px solid #ebe3d7;border-radius:24px;background:#fff;box-sizing:border-box;text-align:center}.hype{width:88px;height:88px;object-fit:contain;display:block;margin:0 auto 18px}.eyebrow{font-size:11px;letter-spacing:.16em;color:#a67f3c}.title{font-size:21px;font-weight:650;margin:10px 0 8px}.copy{font-size:14px;line-height:1.7;color:#7a7168}.btn{min-height:48px;margin-top:20px;border-radius:999px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:14px;background:#2b2723;color:#f6f1e8}</style></head><body><main><section class="card"><img class="hype" src="${HYPE_LOADING_PATH}" alt="HYPE"><div class="eyebrow">MMD PRIVÉ · MY MMD</div><div class="title">My MMD ยังเปิดไม่สำเร็จครับ</div><div class="copy">ระบบไม่แสดงข้อมูลสมาชิกที่ยังตรวจสอบไม่ได้ กรุณาลองเปิดอีกครั้ง ข้อมูลสมาชิกและสิทธิ์ยังคงอยู่ที่ระบบหลังบ้านตามเดิมครับ</div><a class="btn" href="/my-mmd/">ลองอีกครั้ง</a></section></main></body></html>`;
}

function myMmdLoadingSkin() {
  return `<style id="mmd-my-mmd-loading-skin">
#mmd-my-mmd-loader{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:24px;background:#fbf9f5;color:#2b2723;text-align:center;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}
html[data-mmd-boot-state="static"] #mmd-my-mmd-loader,html[data-mmd-boot-state="loading"] #mmd-my-mmd-loader{display:flex}
#mmd-my-mmd-loader img{width:96px;height:96px;object-fit:contain;animation:mmd-hype-spin 2.4s linear infinite}
#mmd-my-mmd-loader .k{margin-top:6px;color:#a67f3c;font-size:10px;font-weight:800;letter-spacing:.18em}
#mmd-my-mmd-loader .t{font-size:17px;font-weight:650}
#mmd-my-mmd-loader .n{font-size:12px;color:#7a7168}
@keyframes mmd-hype-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){#mmd-my-mmd-loader img{animation:none}}
</style>`;
}

function myMmdLoadingMarkup() {
  return `<div id="mmd-my-mmd-loader" role="status" aria-live="polite" aria-label="กำลังเปิด My MMD"><img src="${HYPE_LOADING_PATH}" alt=""><div class="k">MMD PRIVÉ · MY MMD</div><div class="t">กำลังเปิด My MMD…</div><div class="n">กำลังตรวจสอบ Member Session</div></div>`;
}

function rewriteSingleFileShell(html) {
  let output = String(html || "")
    .replaceAll("/member/my-mmd", MY_MMD_UI_PREFIX)
    .replaceAll('href="/favicon.ico"', `href="${MY_MMD_ASSET_PREFIX}favicon.ico"`)
    .replaceAll("href='/favicon.ico'", `href='${MY_MMD_ASSET_PREFIX}favicon.ico'`);

  if (!output.includes('id="mmd-my-mmd-loading-skin"') && output.includes("</head>")) {
    output = output.replace("</head>", `${myMmdLoadingSkin()}</head>`);
  }
  if (!output.includes('id="mmd-my-mmd-loader"') && output.includes("<body>")) {
    output = output.replace("<body>", `<body>${myMmdLoadingMarkup()}`);
  }
  return output;
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
  let upstreamUrl;
  if (suffix === "hype.webp") {
    upstreamUrl = new URL(HYPE_LOADING_URL);
  } else if (suffix === "hype-loading.gif") {
    upstreamUrl = new URL(STATUS_HYPE_LOADING_URL);
  } else {
    upstreamUrl = new URL(MY_MMD_PRESENTATION_ORIGIN);
    upstreamUrl.pathname = suffix === "favicon.ico" ? "/favicon.ico" : `/assets/${suffix}`;
    upstreamUrl.search = source.search;
  }
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

function liffStateSearchParams(url) {
  const raw = String(url.searchParams.get("liff.state") || url.searchParams.get("liff_state") || "").trim();
  if (!raw) return new URLSearchParams();

  let state = raw;
  try {
    state = decodeURIComponent(raw);
  } catch (_) {}

  const queryIndex = state.indexOf("?");
  if (queryIndex >= 0) return new URLSearchParams(state.slice(queryIndex + 1));
  if (state.startsWith("intent=") || state.startsWith("liff_intent=")) return new URLSearchParams(state);
  return new URLSearchParams();
}

function isStatusLiffShellRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase().replace(/\/{2,}/g, "/");
  if (!MEMBER_LIFF_SHELL_PATHS.has(path)) return false;

  const stateParams = liffStateSearchParams(url);
  const intent = String(
    url.searchParams.get("intent")
      || url.searchParams.get("liff_intent")
      || stateParams.get("intent")
      || stateParams.get("liff_intent")
      || "",
  ).trim().toLowerCase();
  const campaign = String(
    url.searchParams.get("campaign")
      || stateParams.get("campaign")
      || "",
  ).trim().toLowerCase();

  if (campaign) return false;
  if (!intent || intent === "unknown") return true;
  return intent === "status";
}

function statusBridgeSkin() {
  return `<style id="mmd-status-bridge-skin">
html,body{background:#000!important}
#mmd-status-bridge-veil{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;padding:24px;background:#000;color:#f6f1e8;text-align:center;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}
#mmd-status-bridge-veil img{display:block;width:min(72vw,280px);height:auto;max-height:52svh;object-fit:contain;filter:drop-shadow(0 18px 42px rgba(203,163,84,.16))}
#mmd-status-bridge-veil .k{margin-top:10px;color:#caa45e;font-size:10px;font-weight:800;letter-spacing:.18em}
#mmd-status-bridge-veil .t{margin-top:2px;color:#f6f1e8;font-size:16px;font-weight:650}
body #message{display:none!important}
body:has(#actions:not(:empty)) #mmd-status-bridge-veil .t{display:none!important}
body:has(#actions:not(:empty)) #message{display:block!important;position:fixed!important;z-index:2147483002!important;left:24px!important;right:24px!important;top:calc(50% + 154px)!important;margin:0!important;color:#d8d0c5!important;font-size:13px!important;line-height:1.55!important;text-align:center!important}
body #actions{position:fixed!important;z-index:2147483003!important;left:50%!important;top:calc(50% + 216px)!important;transform:translateX(-50%)!important;width:min(calc(100% - 48px),360px)!important;margin:0!important;display:grid!important;gap:10px!important}
body #actions:empty{display:none!important}
body #actions button{min-height:46px!important;border:1px solid #8f743e!important;border-radius:999px!important;background:#111!important;color:#f6f1e8!important;text-align:center!important;padding:12px 16px!important}
</style>`;
}

function statusBridgeMarkup() {
  return `<div id="mmd-status-bridge-veil" role="status" aria-live="polite" aria-label="กำลังยืนยันสมาชิก"><img src="${STATUS_HYPE_LOADING_PATH}" alt="HYPE loading"><div class="k">MMD PRIVÉ · MY MMD</div><div class="t">กำลังยืนยันสมาชิก…</div></div>`;
}

function injectStatusBridgeSkin(html) {
  let output = String(html || "");
  if (!output.includes('id="mmd-status-bridge-skin"') && output.includes("</head>")) {
    output = output.replace("</head>", `${statusBridgeSkin()}</head>`);
  }
  if (!output.includes('id="mmd-status-bridge-veil"') && output.includes("<body>")) {
    output = output.replace("<body>", `<body>${statusBridgeMarkup()}`);
  }
  return output;
}

async function rewriteStatusReturnTarget(request, response) {
  if (!isStatusLiffShellRequest(request) || request.method === "HEAD" || !response.ok) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const canonical = html.replace('const target = "/member/my-mmd";', 'const target = "/my-mmd/";');
  const rewritten = injectStatusBridgeSkin(canonical);

  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-liff-return-target", "/my-mmd/");
  headers.set("x-mmd-liff-ui-mode", "auth-bridge-only");
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
    // For intent=status, LIFF is only a verification bridge; /my-mmd/ is the
    // single customer-facing dashboard surface.
    const response = await currentWorker.fetch(request, env, ctx);
    return rewriteStatusReturnTarget(request, response);
  },
};
