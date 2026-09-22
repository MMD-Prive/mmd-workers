import currentWorker from "./line-group-ingress-front-gate.js";
import { isMyMmdOrdersPage, proxyMyMmdOrdersPage } from "./my-mmd-orders-webflow-page.js";
export { KenjiModelIdempotency } from "./line-group-ingress-front-gate.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const MY_MMD_UI_PREFIX = "/my-mmd";
const MY_MMD_ASSET_PREFIX = "/my-mmd-assets/";
const LEGACY_MY_MMD_UI_PREFIX = "/member/my-mmd";
const MY_MMD_PRESENTATION_ORIGIN = "https://my-mmd-member-profile.lovable.app";
const MY_MMD_PRESENTATION_MODE = "lovable-full-app-20260905";
const MEMBER_LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const MY_MMD_ROUTE_SUFFIXES = ["membership", "points", "coupons", "history", "profile", "payments"];
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
  headers.set("x-mmd-ui-source", "lovable-full-app-proxy");
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
  if (suffix === "hype.webp") return new URL(HYPE_LOADING_URL);
  if (suffix === "hype-loading.gif") return new URL(STATUS_HYPE_LOADING_URL);

  const upstream = new URL(MY_MMD_PRESENTATION_ORIGIN);
  upstream.pathname = suffix === "favicon.ico" ? "/favicon.ico" : `/assets/${suffix}`;
  upstream.search = source.search;
  return upstream;
}

function publicExtensionSkin() {
  return `<style id="mmd-public-extension-v1-style">
#mmd-public-extension-v1{margin:14px 16px 0;padding:16px;border:1px solid rgba(188,154,92,.28);border-radius:18px;background:#fffaf1;color:#2b2723;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif;box-sizing:border-box}
#mmd-public-extension-v1[hidden]{display:none!important}
#mmd-public-extension-v1 .mmd-ext-k{font-size:10px;font-weight:800;letter-spacing:.14em;color:#a67f3c}
#mmd-public-extension-v1 h2{margin:6px 0 4px;font-size:16px;font-weight:700}
#mmd-public-extension-v1 p{margin:5px 0;font-size:12px;line-height:1.55;color:#756a5d}
#mmd-public-extension-v1 .mmd-ext-time{margin-top:10px;padding:10px 12px;border-radius:12px;background:#fff;font-size:13px}
#mmd-public-extension-v1 .mmd-ext-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
#mmd-public-extension-v1 button,#mmd-public-extension-v1 a{min-height:42px;border-radius:12px;border:1px solid #d7c49f;padding:10px 12px;font:inherit;font-size:12px;font-weight:700;box-sizing:border-box}
#mmd-public-extension-v1 button{background:#2b2723;color:#fff}
#mmd-public-extension-v1 button:disabled{opacity:.5}
#mmd-public-extension-v1 a{display:flex;align-items:center;justify-content:center;background:#c79d51;color:#fff;text-decoration:none}
#mmd-public-extension-v1 textarea{grid-column:1/-1;min-height:72px;width:100%;resize:vertical;border:1px solid #ddd0ba;border-radius:12px;padding:10px 12px;background:#fff;color:#2b2723;font:inherit;font-size:12px;box-sizing:border-box}
#mmd-public-extension-v1 .mmd-ext-wide{grid-column:1/-1}
#mmd-public-extension-v1 .mmd-ext-error{color:#a33}
</style>`;
}

function publicExtensionMarkup() {
  return `<section id="mmd-public-extension-v1" hidden aria-live="polite">
<div class="mmd-ext-k">ACTIVE SESSION · PUBLIC</div>
<h2>ต่อเวลา / เปลี่ยนแผน</h2>
<p>เวลาใหม่จะเป็นทางการเมื่อ Model อนุมัติ ชำระเงินได้รับการตรวจสอบ และ MMD ยืนยันแล้วเท่านั้น</p>
<div class="mmd-ext-time" data-ext-summary></div>
<div class="mmd-ext-actions" data-ext-actions></div>
<p class="mmd-ext-error" data-ext-error hidden></p>
</section>`;
}

function publicExtensionScript() {
  return `<script id="mmd-public-extension-v1-script">
(() => {
  if (window.__MMD_PUBLIC_EXTENSION_V1__) return;
  window.__MMD_PUBLIC_EXTENSION_V1__ = true;
  const root = document.getElementById("mmd-public-extension-v1");
  if (!root) return;
  const summary = root.querySelector("[data-ext-summary]");
  const actions = root.querySelector("[data-ext-actions]");
  const error = root.querySelector("[data-ext-error]");
  let timer = null;
  const terminal = new Set(["model_declined","mmd_confirmed","review_required","cancelled"]);
  const statusCopy = {
    requested:"ส่งให้ Model แล้ว · รอการตอบรับ",
    model_approved:"Model อนุมัติแล้ว · MMD กำลังเตรียมยอด",
    payment_required:"พร้อมชำระเงินเพิ่ม",
    payment_pending:"ได้รับรายการชำระแล้ว · รอตรวจสอบ",
    payment_verified:"ชำระเงินตรวจสอบแล้ว · กำลังยืนยันเวลาใหม่",
    mmd_confirmed:"MMD ยืนยันเวลาใหม่แล้ว",
    review_required:"MMD กำลังตรวจรายละเอียดนี้",
    model_declined:"Model ไม่สะดวกต่อเวลานี้",
    cancelled:"คำขอนี้ถูกยกเลิก"
  };
  const fmtTime = value => {
    const d = new Date(String(value || ""));
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Bangkok"}).format(d);
  };
  const fmtMoney = value => {
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(n) + " บาท" : "";
  };
  const safePayUrl = value => {
    try {
      const u = new URL(String(value || ""));
      const keys = [...u.searchParams.keys()];
      return u.protocol === "https:" && u.hostname === "mmdbkk.com" && u.pathname === "/pay/checkout" &&
        keys.length === 1 && keys[0] === "t" && !!u.searchParams.get("t") ? u.toString() : "";
    } catch { return ""; }
  };
  const request = async (path, options = {}) => {
    const res = await fetch(path,{credentials:"same-origin",cache:"no-store",headers:{accept:"application/json",...(options.body?{"content-type":"application/json"}:{})},...options});
    const body = await res.json().catch(()=>null);
    if (!res.ok || !body || body.ok !== true) throw new Error(String(body?.error?.code || "extension_unavailable"));
    return body;
  };
  const setError = text => {
    error.textContent = text || "";
    error.hidden = !text;
  };
  const submit = async (sessionId, body, button) => {
    setError("");
    [...actions.querySelectorAll("button")].forEach(x=>x.disabled=true);
    try {
      await request("/api/member/app/session/extension/request",{method:"POST",body:JSON.stringify({session_id:sessionId,...body})});
      await load();
    } catch {
      setError("ตอนนี้ยังส่งคำขอไม่ได้ กรุณาลองอีกครั้ง");
      [...actions.querySelectorAll("button")].forEach(x=>x.disabled=false);
    }
  };
  const render = data => {
    const session = data?.session || null;
    const ext = data?.extension || null;
    if (!session && !ext) {
      root.hidden = true;
      if (timer) clearTimeout(timer);
      return;
    }
    root.hidden = false;
    summary.replaceChildren();
    actions.replaceChildren();
    setError("");

    const end = document.createElement("div");
    end.innerHTML = "<strong>เวลาจบที่ MMD ยืนยัน</strong><br>" + fmtTime(ext?.confirmed_end_at || session?.official_end_at);
    summary.append(end);

    if (ext) {
      const state = document.createElement("p");
      state.textContent = statusCopy[ext.status] || "กำลังตรวจสอบ";
      summary.append(state);
      if (ext.requested_end_at && ext.status !== "mmd_confirmed") {
        const requested = document.createElement("p");
        requested.textContent = "เวลาที่ขอ: " + fmtTime(ext.requested_end_at) + (ext.customer_amount_thb ? " · " + fmtMoney(ext.customer_amount_thb) : "");
        summary.append(requested);
      }
      const pay = safePayUrl(ext.customer_payment_url);
      if (ext.status === "payment_required" && pay) {
        const a = document.createElement("a");
        a.href = pay;
        a.className = "mmd-ext-wide";
        a.textContent = "ชำระ Extension ↗";
        actions.append(a);
      }
    }

    if (data?.can_request === true && session?.session_id) {
      for (const [label, minutes] of [["+30 นาที",30],["+1 ชั่วโมง",60],["+2 ชั่วโมง",120],["+3 ชั่วโมง",180]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.addEventListener("click",()=>submit(session.session_id,{request_kind:"extend_time",requested_minutes:minutes},b));
        actions.append(b);
      }
      const textarea = document.createElement("textarea");
      textarea.maxLength = 600;
      textarea.placeholder = "เปลี่ยนแผน เช่น Dinner → Bar หรือเปลี่ยนกิจกรรม";
      const change = document.createElement("button");
      change.type = "button";
      change.className = "mmd-ext-wide";
      change.textContent = "CHANGE PLAN · ส่งให้ MMD ตรวจ";
      change.addEventListener("click",()=>{
        const note = textarea.value.trim();
        if (!note) return textarea.focus();
        submit(session.session_id,{request_kind:"change_plan",note},change);
      });
      actions.append(textarea,change);
    }

    if (timer) clearTimeout(timer);
    if (ext && !terminal.has(String(ext.status || ""))) timer = setTimeout(load,25000);
  };
  async function load() {
    try { render(await request("/api/member/app/session/extension")); }
    catch { root.hidden = true; if (timer) clearTimeout(timer); }
  }
  load();
})();
</script>`;
}

function rewriteMyMmdHtml(html) {
  let output = String(html || "");

  // Lovable owns presentation only. Remove editor-only chrome from the same-origin customer shell.
  output = output.replace(/<aside\b[^>]*id=["']lovable-badge["'][\s\S]*?<\/aside>/gi, "");
  output = output.replace(/<script\b[^>]*src=["']\/~flock\.js["'][\s\S]*?<\/script>/gi, "");

  // Keep executable/style assets on mmdbkk.com so module/CORS behavior remains same-origin.
  output = output.replaceAll("/assets/", MY_MMD_ASSET_PREFIX);
  output = output.replaceAll("/favicon.ico", `${MY_MMD_ASSET_PREFIX}favicon.ico`);

  // Lovable SSR renders root-relative app links. Before hydration, keep them inside /my-mmd/*.
  output = output.replace(/href=["']\/["']/g, `href="${MY_MMD_UI_PREFIX}/"`);
  for (const suffix of MY_MMD_ROUTE_SUFFIXES) {
    output = output.replace(new RegExp(`href=["']\\/${suffix}(?:\\/)?["']`, "g"), `href="${MY_MMD_UI_PREFIX}/${suffix}"`);
  }
  if (!output.includes('id="mmd-public-extension-v1"')) {
    if (output.includes("</head>")) output = output.replace("</head>", publicExtensionSkin() + "</head>");
    if (output.includes("<body>")) output = output.replace("<body>", "<body>" + publicExtensionMarkup());
    if (output.includes("</body>")) output = output.replace("</body>", publicExtensionScript() + "</body>");
  }
  return output;
}

function rewriteMyMmdJavascript(source) {
  return String(source || "")
    .replace(/(["'`])\/assets\//g, `$1${MY_MMD_ASSET_PREFIX}`)
    .replace(/(["'`])assets\//g, `$1my-mmd-assets/`);
}

function rewriteMyMmdStylesheet(source) {
  return String(source || "").replaceAll("/assets/", MY_MMD_ASSET_PREFIX);
}

async function proxyLovablePage(request) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD", "cache-control": "no-store", "x-mmd-worker": WORKER_NAME },
    });
  }

  const upstreamUrl = presentationUrlForPage(request);
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
  const isHtml = contentType.includes("text/html");
  const headers = presentationResponseHeaders(upstream.headers, { html: isHtml, rewritten: isHtml });

  if (!upstream.ok && isHtml) {
    return new Response(request.method === "HEAD" ? null : recoveryHtml(), {
      status: 502,
      headers: presentationResponseHeaders(new Headers({ "content-type": "text/html; charset=utf-8" }), { html: true }),
    });
  }
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
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function proxyLovableAsset(request) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const upstreamUrl = presentationUrlForAsset(request);
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

  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isJavascript = contentType.includes("javascript") || upstreamUrl.pathname.endsWith(".js");
  const isStylesheet = contentType.includes("text/css") || upstreamUrl.pathname.endsWith(".css");
  const headers = presentationResponseHeaders(upstream.headers, { rewritten: isJavascript || isStylesheet });

  if (request.method === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (isJavascript) {
    return new Response(rewriteMyMmdJavascript(await upstream.text()), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  if (isStylesheet) {
    return new Response(rewriteMyMmdStylesheet(await upstream.text()), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
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

function liffAuthBridgeTarget(request) {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase().replace(/\/{2,}/g, "/");
  if (!MEMBER_LIFF_SHELL_PATHS.has(path)) return "";

  const stateParams = liffStateSearchParams(url);
  const intent = String(
    url.searchParams.get("intent")
      || url.searchParams.get("liff_intent")
      || stateParams.get("intent")
      || stateParams.get("liff_intent")
      || "",
  ).trim().toLowerCase();
  const campaign = String(url.searchParams.get("campaign") || stateParams.get("campaign") || "").trim().toLowerCase();

  if (campaign) return "";
  if (!intent || intent === "unknown" || intent === "status") return "/my-mmd/";
  if (intent === "continue_payment") return "/my-mmd/payments";
  return "";
}

function statusBridgeSkin() {
  return `<style id="mmd-status-bridge-skin">
html,body{background:#000!important}
#mmd-status-bridge-veil{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;padding:24px;background:#000;color:#f6f1e8;text-align:center;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}
#mmd-status-bridge-veil img{display:block;width:min(72vw,280px);height:auto;max-height:52svh;object-fit:contain;filter:drop-shadow(0 18px 42px rgba(203,163,84,.16))}
#mmd-status-bridge-veil .k{margin-top:10px;color:#caa45e;font-size:10px;font-weight:800;letter-spacing:.18em}
#mmd-status-bridge-veil .t{margin-top:2px;color:#f6f1e8;font-size:16px;font-weight:650}
body #message{display:none!important}
body.mmd-status-recovery #mmd-status-bridge-veil .t{display:none!important}
body.mmd-status-recovery #message{display:block!important;position:fixed!important;z-index:2147483002!important;left:24px!important;right:24px!important;top:calc(50% + 154px)!important;margin:0!important;color:#d8d0c5!important;font-size:13px!important;line-height:1.55!important;text-align:center!important}
body #actions{position:fixed!important;z-index:2147483003!important;left:50%!important;top:calc(50% + 216px)!important;transform:translateX(-50%)!important;width:min(calc(100% - 48px),360px)!important;margin:0!important;display:grid!important;gap:10px!important}
body #actions:empty{display:none!important}
body #actions button{min-height:46px!important;border:1px solid #8f743e!important;border-radius:999px!important;background:#111!important;color:#f6f1e8!important;text-align:center!important;padding:12px 16px!important}
</style>`;
}

function statusBridgeMarkup() {
  return `<div id="mmd-status-bridge-veil" role="status" aria-live="polite" aria-label="กำลังยืนยันสมาชิก"><img src="${STATUS_HYPE_LOADING_PATH}" alt="HYPE loading"><div class="k">MMD PRIVÉ · MY MMD</div><div class="t">กำลังยืนยันสมาชิก…</div></div>`;
}

function statusBridgeRecoveryObserver(nonce) {
  return `<script nonce="${nonce}" id="mmd-status-bridge-recovery-observer">
(() => {
  const body = document.body;
  const actions = document.getElementById("actions");
  if (!body || !actions) return;
  const syncRecoveryState = () => {
    body.classList.toggle("mmd-status-recovery", actions.childElementCount > 0);
  };
  syncRecoveryState();
  new MutationObserver(syncRecoveryState).observe(actions, { childList: true });
})();
</script>`;
}

function injectStatusBridgeSkin(html) {
  let output = String(html || "");
  const nonceMatch = output.match(/<script\b[^>]*\bnonce=["']([^"']+)["']/i);
  if (!output.includes('id="mmd-status-bridge-skin"') && output.includes("</head>")) {
    output = output.replace("</head>", `${statusBridgeSkin()}</head>`);
  }
  if (!output.includes('id="mmd-status-bridge-veil"') && output.includes("<body>")) {
    output = output.replace("<body>", `<body>${statusBridgeMarkup()}`);
  }
  if (nonceMatch && !output.includes('id="mmd-status-bridge-recovery-observer"') && output.includes("</body>")) {
    output = output.replace("</body>", `${statusBridgeRecoveryObserver(nonceMatch[1])}</body>`);
  }
  return output;
}

async function rewriteStatusReturnTarget(request, response) {
  const target = liffAuthBridgeTarget(request);
  if (!target || request.method === "HEAD" || !response.ok) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const canonical = html
    .replace('const target = "/member/my-mmd";', `const target = ${JSON.stringify(target)};`)
    .replace('const target = "/member/payments";', `const target = ${JSON.stringify(target)};`);
  const rewritten = injectStatusBridgeSkin(canonical);

  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-liff-return-target", target);
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
    if (isMyMmdOrdersPage(request)) return proxyMyMmdOrdersPage(request);
    if (isMyMmdAssetPath(path)) return proxyLovableAsset(request);
    if (isMyMmdUiPath(path)) return proxyLovablePage(request);

    // Identity, session, points, membership, entitlement, coupons, history,
    // CARE BACK and every authoritative calculation remain on MMD Workers.
    // For intent=status, LIFF is only a verification bridge; /my-mmd/ is the
    // single customer-facing dashboard surface.
    const response = await currentWorker.fetch(request, env, ctx);
    return rewriteStatusReturnTarget(request, response);
  },
};