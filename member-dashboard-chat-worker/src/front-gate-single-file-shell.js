import currentWorker from "./front-gate-index.js";
export { KenjiModelIdempotency } from "./front-gate-index.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const MY_MMD_UI_PREFIX = "/member/my-mmd";
const MY_MMD_PRESENTATION_ORIGIN = "https://my-mmd-member-profile.lovable.app";
const MY_MMD_SINGLE_FILE_PATH = "/my-mmd-shell.html";
const SHELL_MARKER = 'data-mmd-shell="lovable-single-file-v1"';

function isMyMmdUiPath(path) {
  return path === MY_MMD_UI_PREFIX || path === `${MY_MMD_UI_PREFIX}/` || path.startsWith(`${MY_MMD_UI_PREFIX}/`);
}

function presentationRequestHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "if-none-match", "if-modified-since", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function shellHeaders(upstreamHeaders = new Headers()) {
  const headers = new Headers(upstreamHeaders);
  for (const name of [
    "content-length",
    "content-encoding",
    "etag",
    "last-modified",
    "content-md5",
    "set-cookie",
    "reporting-endpoints",
    "report-to",
    "nel",
  ]) headers.delete(name);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", "lovable-single-file-shell");
  headers.set("x-mmd-presentation-mode", "single-file-v1");
  headers.set("x-robots-tag", "noindex, nofollow");
  return headers;
}

function recoveryHtml() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>My MMD</title><style>html,body{margin:0;min-height:100%;background:#f3eeea;color:#332b27;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}main{min-height:100svh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(100%,420px);padding:24px;border:1px solid rgba(80,55,42,.16);border-radius:24px;background:rgba(255,255,255,.72);box-sizing:border-box}.eyebrow{font-size:11px;letter-spacing:.16em;color:#765e4e}.title{font-size:22px;font-weight:650;margin:10px 0 8px}.copy{font-size:14px;line-height:1.7;color:#746b65}.actions{display:grid;gap:10px;margin-top:20px}.btn{min-height:48px;border-radius:999px;border:1px solid rgba(80,55,42,.18);display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:14px;color:#332b27;background:#fff}.primary{background:#5c2028;color:#fff;border-color:#5c2028}</style></head><body><main><section class="card"><div class="eyebrow">MMD PRIVÉ · MY MMD</div><div class="title">My MMD ยังเปิดไม่สำเร็จครับ</div><div class="copy">หน้าสมาชิกยังโหลด presentation ไม่ครบ ข้อมูลสมาชิกและสิทธิ์ไม่ได้ถูกเดาหรือสร้างขึ้นใหม่ ลองเปิดอีกครั้งได้เลยครับ</div><div class="actions"><a class="btn primary" href="/member/my-mmd">ลองอีกครั้ง</a><a class="btn" href="/hall">กลับ MMD Hall</a></div></section></main></body></html>`;
}

async function proxySingleFileShell(request) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD", "cache-control": "no-store", "x-mmd-worker": WORKER_NAME },
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
      headers: shellHeaders(),
    });
  }

  const headers = shellHeaders(upstream.headers);
  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  if (!upstream.ok || !contentType.includes("text/html")) {
    return new Response(request.method === "HEAD" ? null : recoveryHtml(), {
      status: 502,
      headers,
    });
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  const html = await upstream.text();
  if (!html.includes(SHELL_MARKER)) {
    return new Response(recoveryHtml(), { status: 502, headers });
  }

  return new Response(html, { status: 200, headers });
}

export default {
  async fetch(request, env = {}, ctx) {
    const path = new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
    if (isMyMmdUiPath(path)) return proxySingleFileShell(request);
    return currentWorker.fetch(request, env, ctx);
  },
};
