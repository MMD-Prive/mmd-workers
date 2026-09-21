const SHARE_PATH = "/v1/docs/private-companion-share";
const ACTIVATE_PATH = SHARE_PATH + "/activate";
const READ_PATH = SHARE_PATH + "/read";
const TARGET_URL = "https://www.mmdbkk.com/docs/private-companion-bangkok?lang=zh";
const TTL_MS = 180_000;
const TOKEN_HASH = "729a60481881e653abff27e942d5bc752b97be90df396dc3b0c79757a8efc2cb";
const KV_PREFIX = "sigil:ephemeral-doc:v1:";

const encoder = new TextEncoder();

function headers(contentType = "text/html; charset=utf-8") {
  return {
    "content-type": contentType,
    "cache-control": "no-store, private, max-age=0, must-revalidate",
    "pragma": "no-cache",
    "expires": "0",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
    "x-content-type-options": "nosniff",
  };
}

function htmlPage(title, body, status = 200) {
  return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
<title>${title}</title>
<style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}
body{margin:0;min-height:100svh;display:grid;place-items:center;padding:22px;background:#080807;color:#f7f0e5}
main{width:min(100%,520px);padding:28px 22px;border:1px solid rgba(229,197,126,.22);border-radius:24px;background:linear-gradient(150deg,#171410,#0b0a09);box-shadow:0 26px 80px rgba(0,0,0,.35)}
small{display:block;color:#d9bb77;font-size:11px;font-weight:800;letter-spacing:.14em}
h1{margin:10px 0 0;font-size:34px;line-height:1.02;letter-spacing:-.04em}
p{margin:13px 0 0;color:#bcb4a9;font-size:14px;line-height:1.65}
button,a{margin-top:20px;min-height:48px;width:100%;border:0;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#f0d9a2;color:#17120d;font:inherit;font-size:14px;font-weight:800;text-decoration:none;cursor:pointer}
.note{font-size:12px;color:#807970}
</style>
</head>
<body><main>${body}</main></body>
</html>`, { status, headers: headers() });
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorize(url) {
  const token = String(url.searchParams.get("t") || "").trim();
  if (!token || token.length > 200) return null;
  const hash = await sha256Hex(token);
  if (hash !== TOKEN_HASH) return null;
  return { token, hash, key: KV_PREFIX + hash };
}

async function readState(env, key) {
  if (!env?.SIGIL_BOARD_KV?.get) return { unavailable: true };
  const raw = await env.SIGIL_BOARD_KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { invalid: true }; }
}

function isExpired(state, now = Date.now()) {
  return !state?.expires_at_ms || now >= Number(state.expires_at_ms);
}

function landing(token, state) {
  if (state && isExpired(state)) {
    return htmlPage("文件已过期", `
      <small>MMD PRIVÉ · PRIVATE DOCUMENT</small>
      <h1>此链接已过期</h1>
      <p>这份文件在首次打开后仅可查看 3 分钟。当前访问时间已经结束。</p>
      <p class="note">如需再次查看，请向 MMD 申请新的链接。</p>`, 410);
  }

  const alreadyOpen = Boolean(state?.activated_at_ms && !isExpired(state));
  const buttonText = alreadyOpen ? "继续查看文件" : "打开文件 · 开始 3 分钟";
  const note = alreadyOpen
    ? "倒计时已从首次打开时开始，重新进入不会重置时间。"
    : "点击后才开始计时。聊天软件的链接预览不会启动倒计时。";

  return htmlPage("Private Companion Bangkok", `
    <small>MMD PRIVÉ · PRIVATE COMPANION BANGKOK</small>
    <h1>私人文件</h1>
    <p>文件语言：简体中文<br>查看时间：首次打开后 3 分钟</p>
    <button id="openDoc" type="button">${buttonText}</button>
    <p class="note">${note}</p>
    <script>
    (() => {
      const button = document.getElementById("openDoc");
      if (!button) return;
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "正在打开…";
        try {
          const res = await fetch(${JSON.stringify(ACTIVATE_PATH)} + "?t=" + encodeURIComponent(${JSON.stringify(token)}), {
            method: "POST",
            credentials: "omit",
            cache: "no-store",
            headers: { "accept": "application/json" }
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.ok || !data.read_url) throw new Error("open_failed");
          location.replace(data.read_url);
        } catch {
          button.disabled = false;
          button.textContent = "请重新打开";
        }
      });
    })();
    </script>`);
}

function expiredResponse() {
  return htmlPage("文件已过期", `
    <small>MMD PRIVÉ · PRIVATE DOCUMENT</small>
    <h1>查看时间已结束</h1>
    <p>这份文件从首次打开开始可查看 3 分钟，现在链接已经失效。</p>
    <p class="note">重新加载或再次打开同一个链接不会重置时间。</p>`, 410);
}

function unavailableResponse() {
  return htmlPage("暂时无法打开", `
    <small>MMD PRIVÉ · PRIVATE DOCUMENT</small>
    <h1>暂时无法打开文件</h1>
    <p>访问状态暂时无法安全确认，请稍后重试。</p>`, 503);
}

function injectTimedShell(html, expiresAtMs) {
  const base = '<base href="https://www.mmdbkk.com/"><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet">';
  const guard = `
<style>
#mmd-ephemeral-clock{position:fixed;z-index:2147483647;right:10px;bottom:10px;padding:8px 11px;border:1px solid rgba(240,217,162,.28);border-radius:999px;background:rgba(7,7,7,.88);backdrop-filter:blur(14px);color:#f0d9a2;font:700 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC",sans-serif;letter-spacing:.04em;box-shadow:0 10px 30px rgba(0,0,0,.25)}
</style>
<div id="mmd-ephemeral-clock" aria-live="polite">03:00</div>
<script>
(() => {
  const expiresAt = ${Number(expiresAtMs)};
  const clock = document.getElementById("mmd-ephemeral-clock");
  function expire() {
    document.documentElement.innerHTML = '<head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>文件已过期</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#080807;color:#f7f0e5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Noto Sans SC,PingFang SC,sans-serif"><main style="max-width:500px;text-align:center"><div style="color:#d9bb77;font-size:12px;letter-spacing:.12em;font-weight:800">MMD PRIVÉ</div><h1 style="font-size:32px;margin:12px 0">查看时间已结束</h1><p style="color:#aaa198;line-height:1.6">此文件在首次打开后仅可查看 3 分钟。</p></main></body>';
  }
  function tick() {
    const left = expiresAt - Date.now();
    if (left <= 0) return expire();
    if (clock) {
      const sec = Math.ceil(left / 1000);
      const mm = String(Math.floor(sec / 60)).padStart(2, "0");
      const ss = String(sec % 60).padStart(2, "0");
      clock.textContent = mm + ":" + ss;
    }
    setTimeout(tick, Math.min(1000, Math.max(100, left)));
  }
  tick();
})();
</script>`;
  let out = String(html || "");
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, '<head$1>' + base);
  else out = base + out;
  if (/</body>/i.test(out)) out = out.replace(/</body>/i, guard + '</body>');
  else out += guard;
  return out;
}

async function handleRead(request, env, auth, state) {
  if (!state?.activated_at_ms) {
    const url = new URL(request.url);
    url.pathname = SHARE_PATH;
    return Response.redirect(url.toString(), 302);
  }
  if (isExpired(state)) return expiredResponse();

  const upstream = await fetch(TARGET_URL, {
    method: "GET",
    headers: { "user-agent": "MMD-SIGIL-Ephemeral-Document/1.0", "accept": "text/html" },
    redirect: "follow",
  });
  if (!upstream.ok) return unavailableResponse();

  const text = await upstream.text();
  const body = injectTimedShell(text, Number(state.expires_at_ms));
  const outHeaders = new Headers(headers());
  outHeaders.set("content-language", "zh-CN");
  outHeaders.set("x-mmd-ephemeral-document", "private-companion-bangkok");
  outHeaders.set("x-mmd-expires-at", new Date(Number(state.expires_at_ms)).toISOString());
  return new Response(body, { status: 200, headers: outHeaders });
}

export function isEphemeralPrivateCompanionPath(pathname) {
  return pathname === SHARE_PATH || pathname === ACTIVATE_PATH || pathname === READ_PATH;
}

export async function handleEphemeralPrivateCompanion(request, env) {
  const url = new URL(request.url);
  if (!isEphemeralPrivateCompanionPath(url.pathname)) return null;

  const auth = await authorize(url);
  if (!auth) return htmlPage("链接无效", `
    <small>MMD PRIVÉ · PRIVATE DOCUMENT</small>
    <h1>此链接无效</h1>
    <p>请确认你收到的是 MMD 提供的完整链接。</p>`, 404);

  if (!env?.SIGIL_BOARD_KV?.get || !env?.SIGIL_BOARD_KV?.put) return unavailableResponse();

  const state = await readState(env, auth.key);
  if (state?.unavailable || state?.invalid) return unavailableResponse();

  if (url.pathname === SHARE_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: headers("text/plain; charset=utf-8") });
    return landing(auth.token, state);
  }

  if (url.pathname === ACTIVATE_PATH) {
    if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: headers("application/json; charset=utf-8") });
    const now = Date.now();
    if (state && isExpired(state, now)) {
      return new Response(JSON.stringify({ ok: false, error: "expired" }), { status: 410, headers: headers("application/json; charset=utf-8") });
    }

    let active = state;
    if (!active?.activated_at_ms) {
      active = {
        version: 1,
        document: "private-companion-bangkok",
        language: "zh",
        ttl_seconds: TTL_MS / 1000,
        activated_at_ms: now,
        expires_at_ms: now + TTL_MS,
      };
      await env.SIGIL_BOARD_KV.put(auth.key, JSON.stringify(active));
    }

    const readUrl = new URL(request.url);
    readUrl.pathname = READ_PATH;
    readUrl.searchParams.set("lang", "zh");
    return new Response(JSON.stringify({
      ok: true,
      expires_at: new Date(Number(active.expires_at_ms)).toISOString(),
      read_url: readUrl.pathname + readUrl.search,
    }), { status: 200, headers: headers("application/json; charset=utf-8") });
  }

  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: headers("text/plain; charset=utf-8") });
  return handleRead(request, env, auth, state);
}

export const EPHEMERAL_PRIVATE_COMPANION = Object.freeze({
  share_path: SHARE_PATH,
  activate_path: ACTIVATE_PATH,
  read_path: READ_PATH,
  ttl_seconds: TTL_MS / 1000,
  language: "zh",
});
