import { MY_MMD_BANGKOK_BOARD_URL, MY_MMD_BRAND_LOGO_URL } from "./my-mmd-visual-assets.js";

const SOURCE_URL = "https://mmdprive.webflow.io/my-mmd-orders";
const CANONICAL_PATHS = new Set(["/my-mmd/orders", "/my-mmd/orders/"]);

export function isMyMmdOrdersPage(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return CANONICAL_PATHS.has(url.pathname.toLowerCase().replace(/\/{2,}/g, "/"))
    && ["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase());
}

export async function proxyMyMmdOrdersPage(request) {
  const method = String(request.method || "GET").toUpperCase();
  const upstream = new URL(SOURCE_URL);
  upstream.search = new URL(request.url).search;

  let response;
  try {
    response = await fetch(new Request(upstream, {
      method,
      headers: presentationHeaders(request),
      redirect: "follow",
    }));
  } catch {
    return recovery(method);
  }
  if (!response.ok) return recovery(method);

  const headers = new Headers(response.headers);
  for (const name of ["content-length", "set-cookie", "content-encoding", "etag", "last-modified", "report-to", "nel"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-mmd-route-owner", "member-dashboard-chat-worker");
  headers.set("x-mmd-ui-source", "webflow:my-mmd-orders");
  headers.set("x-mmd-behavior-owner", "member-pages-worker");
  if (method === "HEAD") return new Response(null, { status: 200, headers });
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    const source = await response.text();
    const board = `<style id="mmd-orders-board">html{background:#fffaf3}body{background:linear-gradient(180deg,rgba(255,250,243,.88),rgba(255,250,243,.97)),url("${MY_MMD_BANGKOK_BOARD_URL}") center top/cover fixed no-repeat!important;overflow-x:hidden}.mmd-orders-brand{display:block;width:52px;height:52px;object-fit:contain;margin:12px 20px}</style>`;
    const branded = /<img\b[^>]*alt=["']MMD Privé["']/i.test(source) ? source : source.replace(/<body\b([^>]*)>/i, `<body$1><img class="mmd-orders-brand" src="${MY_MMD_BRAND_LOGO_URL}" alt="MMD Privé">`);
    return new Response(branded.replace(/<\/head>/i, board + "</head>"), { status: 200, headers });
  }
  return new Response(response.body, { status: 200, headers });
}

function presentationHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function recovery(method) {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MY MMD Orders</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;background:linear-gradient(180deg,rgba(255,250,243,.78),rgba(255,250,243,.95)),url("${MY_MMD_BANGKOK_BOARD_URL}") center top/cover fixed no-repeat;color:#181511;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}main{width:min(100% - 40px,560px);margin:auto;padding:28px 0}.brand{display:block;width:60px;height:60px;object-fit:contain}.card{margin-top:clamp(44px,12vh,120px);padding:clamp(24px,7vw,40px);border:1px solid #e6ddd0;border-radius:24px;background:rgba(255,250,243,.95)}h1{font-size:22px}p{line-height:1.65}a{color:#6b2737}</style></head><body><main><img class="brand" src="${MY_MMD_BRAND_LOGO_URL}" alt="MMD Privé"><section class="card"><h1>รายการสั่งซื้อยังเปิดไม่สำเร็จ</h1><p>กรุณากลับ MY MMD แล้วลองอีกครั้ง</p><a href="/my-mmd/">กลับ MY MMD</a></section></main></body></html>`;
  return new Response(method === "HEAD" ? null : html, {
    status: 502,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}
