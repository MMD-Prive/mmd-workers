const LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const LIFF_INTENTS = new Set(["signup", "renew", "status", "promo", "hall", "continue_payment", "unknown"]);
const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

export function isLiffMemberShellPath(url) {
  return LIFF_SHELL_PATHS.has(url.pathname.toLowerCase());
}

export function handleLiffMemberShell(request, env = {}) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: shellHeaders({ allow: "GET, HEAD" }),
    });
  }

  const url = new URL(request.url);
  const config = {
    liffId: publicLiffId(env),
    intent: normalizeIntent(url.searchParams.get("intent") || url.searchParams.get("liff_intent")),
    promoCode: normalizePromoCode(url.searchParams.get("promo_code") || url.searchParams.get("code")),
    startEndpoint: "/member/api/liff/start",
  };
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = renderShell(config, nonce);
  const headers = shellHeaders({
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'self'; script-src 'self' https://static.line-scdn.net 'nonce-${nonce}'; connect-src 'self' https://api.line.me https://access.line.me; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; object-src 'none'`,
  });
  return new Response(method === "HEAD" ? null : html, { status: 200, headers });
}

function renderShell(config, nonce) {
  const safeConfig = jsonForInlineScript(config);
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>MMD Privé</title>
  <style>
    :root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090909;color:#f5f2eb}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% -10%,#2b241d 0,#111 35%,#070707 72%);display:grid;place-items:center;padding:24px}
    main{width:min(100%,520px);padding:32px 24px;border:1px solid rgba(212,181,123,.22);border-radius:28px;background:rgba(16,16,16,.88);box-shadow:0 28px 80px rgba(0,0,0,.45)}
    .mark{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#d7bd8a}.title{margin:10px 0 8px;font-size:30px;line-height:1.08;font-weight:650}.sub{margin:0;color:#aaa29a;font-size:14px;line-height:1.55}
    #message{white-space:pre-line;margin:30px 0 0;font-size:18px;line-height:1.65}.actions{display:grid;gap:10px;margin-top:24px}.actions:empty{display:none}
    button{width:100%;border:1px solid rgba(216,189,137,.28);border-radius:16px;padding:14px 16px;background:#171511;color:#f7f3eb;font:inherit;text-align:left;cursor:pointer}button:disabled{opacity:.55;cursor:default}
    .status{margin-top:22px;color:#7f7972;font-size:12px;line-height:1.5}.hidden{display:none}
  </style>
</head>
<body>
<main>
  <div class="mark">MMD Privé · Member Access</div>
  <h1 class="title">Private Member Gateway</h1>
  <p class="sub">LINE identity is checked securely before member information is shown.</p>
  <div id="message" role="status" aria-live="polite">กำลังเปิดการเชื่อมต่อกับ MMD ครับ</div>
  <div id="actions" class="actions" aria-label="ตัวเลือก"></div>
  <div id="status" class="status">Secure same-site session · mmdbkk.com</div>
</main>
<script src="${LIFF_SDK_URL}"></script>
<script nonce="${nonce}">
(() => {
  "use strict";
  const CONFIG = ${safeConfig};
  const message = document.getElementById("message");
  const actions = document.getElementById("actions");
  const allowedIntentIds = new Set(["signup", "renew", "status"]);
  let busy = false;

  function show(text) {
    message.textContent = String(text || "ไม่สามารถดำเนินการต่อได้ครับ กรุณากลับมาเปิดผ่าน LINE ของ MMD อีกครั้ง");
  }

  function setBusy(value) {
    busy = Boolean(value);
    for (const button of actions.querySelectorAll("button")) button.disabled = busy;
  }

  async function call(endpoint, body) {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") throw new Error("invalid_response");
    if (!response.ok || payload.ok !== true) {
      if (payload.data) render(payload.data);
      else show("ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง");
      return null;
    }
    render(payload.data || {});
    return payload.data || {};
  }

  function render(data) {
    const screen = data && typeof data.screen === "object" ? data.screen : {};
    show(screen.copy || "กำลังตรวจสอบข้อมูลให้ครับ");
    actions.replaceChildren();
    const serverActions = Array.isArray(screen.actions) ? screen.actions : [];
    for (const action of serverActions) {
      const id = String(action && action.id || "");
      const endpoint = String(action && action.endpoint || "");
      const label = String(action && action.label || "");
      if (!label || endpoint !== "/member/api/liff/intent" || !allowedIntentIds.has(id)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", async () => {
        if (busy) return;
        setBusy(true);
        try { await call(endpoint, { liff_intent: id }); }
        catch { show("ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง"); }
        finally { setBusy(false); }
      });
      actions.append(button);
    }
  }

  async function boot() {
    if (!CONFIG.liffId || !window.liff) {
      show("ช่องทางนี้ยังไม่พร้อมใช้งานครับ กรุณากลับมาเปิดผ่าน LINE ของ MMD อีกครั้ง");
      return;
    }
    try {
      await window.liff.init({ liffId: CONFIG.liffId });
      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = window.liff.getIDToken();
      if (!idToken) {
        show("ไม่สามารถยืนยัน LINE ได้ในตอนนี้ครับ กรุณาเปิดใหม่ผ่าน LINE ของ MMD");
        return;
      }
      const body = { id_token: idToken, liff_intent: CONFIG.intent };
      if (CONFIG.promoCode) body.promo_code = CONFIG.promoCode;
      await call(CONFIG.startEndpoint, body);
    } catch {
      show("ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง");
    }
  }

  boot();
})();
</script>
</body>
</html>`;
}

function publicLiffId(env) {
  const value = String(env.LINE_LIFF_ID || env.LIFF_ID || "").trim();
  return value.length <= 160 && /^[A-Za-z0-9_-]+$/.test(value) ? value : "";
}

function normalizeIntent(value) {
  const intent = String(value || "unknown").trim().toLowerCase();
  return LIFF_INTENTS.has(intent) ? intent : "unknown";
}

function normalizePromoCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(code) ? code : "";
}

function jsonForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function shellHeaders(extra = {}) {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    ...extra,
  };
}
