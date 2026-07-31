import worker from "./model-liff-worker.js";

export const ADMIN_LOGIN_PAGE_PATH = "/internal/admin/login";
export const ADMIN_LOGIN_SESSION_PATH = "/internal/admin/login/session";
export const APPROVED_ADMIN_LOGIN_HERO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a39411cebd1da134af1ea82_Ewvon%20Chang%20Pepsi%20Max.webp";

const ALLOWED_NEXT_PATHS = [
  "/internal/admin",
  "/internal/admin/control-room",
  "/internal/admin/jobs/create-session",
  "/internal/admin/create-session",
  "/internal/admin/kenji-knowledge",
  "/internal/jobs/create-job",
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (path === ADMIN_LOGIN_PAGE_PATH && (method === "GET" || method === "HEAD")) {
      return renderAdminLogin(request, {
        next: normalizeNext(url.searchParams.get("next")),
      });
    }

    if (path === ADMIN_LOGIN_SESSION_PATH && method === "POST") {
      const formTextPromise = request.clone().text().catch(() => "");
      const response = await worker.fetch(request, env, ctx);
      const contentType = response.headers.get("content-type") || "";
      if (response.status >= 400 && contentType.includes("text/html")) {
        const form = new URLSearchParams(await formTextPromise);
        return renderAdminLogin(request, {
          status: response.status,
          error: "รหัสยังไม่ถูกต้องครับ ลองตรวจอีกครั้ง",
          next: normalizeNext(form.get("next")),
        });
      }
      return response;
    }

    return worker.fetch(request, env, ctx);
  },
};

export function renderAdminLogin(request, { status = 200, error = "", next = "/internal/admin/control-room" } = {}) {
  const safeNext = normalizeNext(next);
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#08070a">
  <title>MMD Privé · Internal Login</title>
  <style>
    :root{color-scheme:dark;--bg:#08070a;--panel:#14111a;--line:rgba(225,193,121,.2);--text:#f5eee4;--muted:rgba(245,238,228,.62);--gold:#d8b86d;--danger:#efa0a7}
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:var(--bg)}
    body{min-height:100svh;padding:14px;color:var(--text);font-family:Inter,"Noto Sans Thai",system-ui,sans-serif;background:radial-gradient(circle at 9% 0,rgba(216,184,109,.11),transparent 28%),linear-gradient(135deg,#08070a,#0d0a10 55%,#070609)}
    .shell{width:min(100%,1440px);min-height:calc(100svh - 28px);margin:auto;display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);gap:14px;padding:14px;border:1px solid rgba(255,255,255,.07);border-radius:30px;background:rgba(15,13,18,.78);box-shadow:0 28px 90px rgba(0,0,0,.42)}
    .copy,.visual{min-width:0;border:1px solid var(--line);border-radius:24px;overflow:hidden}
    .copy{display:flex;flex-direction:column;padding:clamp(24px,4vw,54px);background:linear-gradient(180deg,rgba(28,23,35,.96),rgba(18,15,23,.96))}
    .kicker{margin:0;color:var(--gold);font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}
    h1{margin:32px 0 0;font:400 clamp(48px,6.3vw,94px)/.9 Georgia,"Times New Roman",serif;letter-spacing:-.055em}
    h1 span{display:block;margin-top:10px;color:#efd897;font-size:.48em;line-height:1.02}
    .lead{max-width:620px;margin:24px 0 0;color:var(--muted);font-size:14px;line-height:1.75}
    .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}
    .chips span{padding:8px 11px;border:1px solid var(--line);border-radius:999px;color:#e7cf96;font-size:9px;font-weight:700}
    form{display:grid;gap:15px;margin-top:auto;padding-top:38px}
    label{display:grid;gap:9px;color:var(--gold);font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
    .field{display:grid;grid-template-columns:1fr auto;border:1px solid var(--line);border-radius:15px;background:#07070a;overflow:hidden}
    input{width:100%;min-height:58px;padding:0 16px;border:0;outline:0;background:transparent;color:var(--text);font:inherit}
    .toggle{min-width:74px;border:0;border-left:1px solid var(--line);background:transparent;color:#e6cf98;font-size:11px;font-weight:800;cursor:pointer}
    .error{min-height:20px;margin:0;color:var(--danger);font-size:11px}
    .submit{min-height:52px;border:1px solid rgba(238,209,145,.46);border-radius:14px;background:linear-gradient(90deg,#9e7b3f,#d7b76d);color:#17110a;font-size:11px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;cursor:pointer}
    .note{margin:0;color:var(--muted);font-size:9px;line-height:1.5}
    .visual{position:relative;min-height:720px;background:#050505}
    .visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center center;background:#050505}
    .visual:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(7,6,9,.2),transparent 25%),linear-gradient(180deg,transparent 72%,rgba(5,5,6,.32))}
    .badge{position:absolute;z-index:2;right:18px;top:18px;padding:9px 12px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(8,7,10,.55);backdrop-filter:blur(14px);color:rgba(245,238,228,.72);font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
    @media(max-width:900px){body{padding:0}.shell{min-height:100svh;grid-template-columns:1fr;margin:0;padding:10px;border-radius:0}.visual{order:-1;min-height:46svh}.visual img{object-fit:contain}.copy{padding:24px}.copy form{padding-top:28px}h1{margin-top:22px;font-size:52px}}
    @media(max-width:520px){.shell{gap:10px}.visual{min-height:40svh;border-radius:20px}.copy{border-radius:20px}h1{font-size:44px}.lead{font-size:12px}.chips{display:none}}
  </style>
</head>
<body>
  <main class="shell" data-mmd-page="admin-login-approved-hero">
    <section class="copy">
      <p class="kicker">Invite-only admin access</p>
      <h1>Create your<span>control-room identity.</span></h1>
      <p class="lead">เข้าสู่พื้นที่ดูแลงานภายในด้วยรหัสที่ได้รับอนุมัติครับ ระบบจะตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ก่อนพาไปหน้าถัดไป</p>
      <div class="chips"><span>Approved access</span><span>Secure session</span><span>Private operator gate</span></div>
      <form method="post" action="${ADMIN_LOGIN_SESSION_PATH}" autocomplete="on">
        <input type="hidden" name="next" value="${escapeAttribute(safeNext)}">
        <label>Access code
          <span class="field"><input id="adminCredential" name="credential" type="password" required autocomplete="current-password" autofocus><button class="toggle" type="button" aria-controls="adminCredential" aria-pressed="false">SHOW</button></span>
        </label>
        <p class="error" role="alert">${escapeHtml(error)}</p>
        <button class="submit" type="submit">Enter Control Room</button>
        <p class="note">ระบบจะไม่เก็บรหัสไว้ในหน้าเว็บ และ session ที่อนุมัติจะถูกออกเป็น Secure HttpOnly cookie เท่านั้น</p>
      </form>
    </section>
    <aside class="visual" aria-label="Chang and Ewvon in the MMD internal administration environment">
      <img src="${APPROVED_ADMIN_LOGIN_HERO}" alt="Ewvon and Chang in MMD internal administration environment" width="1600" height="1200" fetchpriority="high">
      <span class="badge">SIGIL · INTERNAL</span>
    </aside>
  </main>
  <script>document.querySelector('.toggle')?.addEventListener('click',function(){const i=document.getElementById('adminCredential');const show=i.type==='password';i.type=show?'text':'password';this.textContent=show?'HIDE':'SHOW';this.setAttribute('aria-pressed',String(show));});</script>
</body>
</html>`;

  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    status,
    headers: {
      "cache-control": "no-store, private, max-age=0",
      "content-security-policy": "default-src 'none'; img-src https://cdn.prod.website-files.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-mmd-page": "admin-login-approved-hero",
      "x-mmd-route-owner": "admin-worker",
    },
  });
}

export function normalizeNext(value = "") {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("..")) return "/internal/admin/control-room";
  let parsed;
  try {
    parsed = new URL(raw, "https://mmdbkk.com");
  } catch {
    return "/internal/admin/control-room";
  }
  const allowed = ALLOWED_NEXT_PATHS.some((path) => parsed.pathname === path || (path === "/internal/admin/control-room" && parsed.pathname.startsWith(`${path}/`)));
  if (!allowed) return "/internal/admin/control-room";
  for (const key of parsed.searchParams.keys()) {
    if (/token|secret|password|credential|cookie|authorization|bearer|confirm_key/i.test(key)) return "/internal/admin/control-room";
  }
  return `${parsed.pathname}${parsed.search}`;
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function escapeAttribute(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
