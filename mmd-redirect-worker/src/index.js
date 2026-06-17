/**
 * MMD Permanent Redirect Guard
 * Purpose:
 * - Canonicalize host/protocol
 * - Preserve every path and query string, including ?t=
 * - Redirect legacy paths permanently
 * - Avoid redirect loops
 * - Do NOT touch API/payment/webhook/admin endpoints
 */

export const CANONICAL_HOST = "mmdbkk.com";
export const CANONICAL_PROTOCOL = "https:";
export const CONFIRM_PAYMENT_PATH = "/confirm/payment-confirmation";
export const MEMBER_DASHBOARD_UPSTREAM = "https://immigrate-worker.malemodel-bkk.workers.dev";
export const ADMIN_WORKER_UPSTREAM = "https://admin-worker.malemodel-bkk.workers.dev";
export const FRONT_GATE = "mmd-redirect-worker";
export const FRONT_VERSION = "20260617T060000Z";

export const REDIRECT_HOSTS = new Set([
  "www.mmdbkk.com",
  "mmdbkk.com",
  "mmdprive.com",
  "www.mmdprive.com",
  "malemodel-bkk.workers.dev",
]);

export const NEVER_TOUCH_HOSTS = new Set(["sigil.mmdbkk.com"]);

export const LINE_WEBHOOK_PATHS = new Set([
  "/webhooks/line",
  "/webhooks/line/",
  "/webhook/line",
  "/webhook/line/",
]);

export const NEVER_TOUCH_PREFIXES = [
  "/api/",
  "/webhook/",
  "/webhooks/",
  "/pay/",
  "/payments/",
  "/payment/",
  "/payment-webhook/",
  "/admin/",
  "/sigil/",
  "/cdn-cgi/",
  "/assets/",
  "/static/",
  "/uploads/",
];

export const NEVER_REDIRECT_EXACT_PATHS = new Set([
  "/member/dashboard",
  "/member/dashboard/",
  "/member/membership",
  "/member/membership/",
  "/member/payments",
  "/member/payments/",
  "/hall",
  "/hall/",
  "/model/console",
  "/model/console/",
]);

export const EXACT_PATH_REDIRECTS = {
  "/inme": "/trust/inme",
  "/login": "/trust/inme",
  "/member": "/membership/benefits",
  "/member/membership/benefits": "/pay/membership",
  "/members": "/trust/inme",
  "/membership": "/membership/benefits",
  "/renew": "/trust/inme",
  "/renewal": "/trust/inme",
  "/trust": "/trust/inme",
};

export const FOLDER_REDIRECTS = [
  {
    from: "/old-academy/",
    to: "/academy/",
  },
  {
    from: "/old-trust/",
    to: "/trust/",
  },
];

export function isSafePageRequest(request) {
  const method = request.method.toUpperCase();
  return method === "GET" || method === "HEAD";
}

export function normalizePath(pathname) {
  let path = pathname || "/";
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) {
    path = path.replace(/\/+$/g, "");
  }
  return path || "/";
}

export function shouldNeverTouch(url) {
  if (NEVER_TOUCH_HOSTS.has(url.hostname)) return true;
  const pathname = url.pathname.toLowerCase();
  if (NEVER_REDIRECT_EXACT_PATHS.has(pathname)) return true;
  return NEVER_TOUCH_PREFIXES.some((prefix) => {
    return pathname === prefix.slice(0, -1) || pathname.startsWith(prefix);
  });
}

export function buildTargetUrl(originalUrl, nextPathname) {
  const target = new URL(originalUrl.toString());
  target.protocol = CANONICAL_PROTOCOL;
  target.hostname = CANONICAL_HOST;
  target.pathname = nextPathname;
  return target;
}

function withFrontGateHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-mmd-front-gate", FRONT_GATE);
  headers.set("x-mmd-front-version", FRONT_VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isConfirmPaymentPage(url) {
  return url.pathname === CONFIRM_PAYMENT_PATH || url.pathname === `${CONFIRM_PAYMENT_PATH}/`;
}

function confirmPaymentDashboardBridgeScript() {
  return `<script id="mmd-confirm-dashboard-bridge">
(function(){
  if (window.__MMD_CONFIRM_DASHBOARD_BRIDGE__) return;
  window.__MMD_CONFIRM_DASHBOARD_BRIDGE__ = true;
  var originalFetch = window.fetch;
  if (typeof originalFetch !== "function") return;
  function getDashboardUrl(payload){
    var fromPayload = payload && (payload.dashboard_url || payload.dashboard_access && payload.dashboard_access.dashboard_url) || "";
    if (fromPayload) return fromPayload;
    var params = new URLSearchParams(window.location.search || "");
    var token = params.get("t") || "";
    if (token) return "/member/dashboard?t=" + encodeURIComponent(token);
    var root = document.getElementById("mmd-payment-confirmation");
    return root && root.getAttribute("data-dashboard-url") || "/sigil/member/account";
  }
  window.fetch = function(input, init){
    var requestUrl = "";
    try {
      requestUrl = typeof input === "string" ? input : input && input.url || "";
    } catch (_) {}
    var result = originalFetch.apply(this, arguments);
    if (!/(\\/v1\\/payments\\/notify(?:\\?|$)|\\/sigil\\/api\\/payments\\/manual-intake(?:\\?|$))/.test(requestUrl)) return result;
    return result.then(function(response){
      try {
        response.clone().json().then(function(payload){
          var dashboardUrl = getDashboardUrl(payload);
          if (!dashboardUrl) return;
          try {
            sessionStorage.setItem("mmd_pay_membership_confirm_state_v2026_04", JSON.stringify({
              status: "paid",
              dashboard_url: dashboardUrl,
              paid_at: new Date().toISOString()
            }));
          } catch (_) {}
          var link = document.getElementById("mmdrenew-dashboard-link");
          if (link) link.href = dashboardUrl;
          window.setTimeout(function(){
            window.location.href = dashboardUrl;
          }, 900);
        }).catch(function(){});
      } catch (_) {}
      return response;
    });
  };
})();
</script>`;
}

async function maybeInjectConfirmPaymentBridge(request, response, url) {
  if (request.method.toUpperCase() === "HEAD") return response;
  if (!isConfirmPaymentPage(url)) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return response;
  const html = await response.text();
  if (html.includes("mmd-confirm-dashboard-bridge")) {
    return new Response(html, response);
  }
  const script = confirmPaymentDashboardBridgeScript();
  const rewritten = html.includes("</body>")
    ? html.replace("</body>", `${script}</body>`)
    : `${html}${script}`;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchPassThrough(request) {
  const url = new URL(request.url);
  const response = await fetch(new Request(request, { redirect: "follow" }));
  return withFrontGateHeaders(await maybeInjectConfirmPaymentBridge(request, response, url));
}

function isLineWebhookPath(url) {
  return LINE_WEBHOOK_PATHS.has(url.pathname.toLowerCase());
}

async function fetchLineWebhook(request, env = {}, url) {
  const upstream = String(env?.LINE_WEBHOOK_UPSTREAM_URL || "").trim();
  if (!upstream) {
    return fetchPassThrough(request);
  }
  const target = new URL(upstream);
  target.search = url.search;
  const upstreamRequest = new Request(target.toString(), request);
  return withFrontGateHeaders(await fetch(upstreamRequest));
}

function isMemberDashboardPath(url) {
  const pathname = url.pathname.toLowerCase();
  return pathname === "/member/dashboard" || pathname === "/member/dashboard/";
}

function isMemberMembershipPath(url) {
  const pathname = url.pathname.toLowerCase();
  return pathname === "/member/membership" || pathname === "/member/membership/";
}

function isMemberPaymentsPath(url) {
  const pathname = url.pathname.toLowerCase();
  return pathname === "/member/payments" || pathname === "/member/payments/";
}

function isHallPath(url) {
  const pathname = url.pathname.toLowerCase();
  return pathname === "/hall" || pathname === "/hall/";
}

function isModelConsolePath(url) {
  const pathname = url.pathname.toLowerCase();
  return pathname === "/model/console" || pathname === "/model/console/";
}

function isMemberPath(url) {
  const pathname = url.pathname.toLowerCase();
  return pathname === "/member" || pathname === "/member/" || pathname.startsWith("/member/");
}

function isKnownLegacyMemberRedirect(url) {
  const pathname = normalizePath(url.pathname).toLowerCase();
  return Boolean(EXACT_PATH_REDIRECTS[pathname]);
}

function isMemberFrontendPath(url) {
  return isMemberDashboardPath(url) || isMemberMembershipPath(url);
}

async function fetchMemberFrontend(request, env, url) {
  if (env?.IMMIGRATE_WORKER?.fetch) {
    return withFrontGateHeaders(await env.IMMIGRATE_WORKER.fetch(request));
  }
  const target = new URL(MEMBER_DASHBOARD_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

async function fetchAdminMemberPage(request, env, url) {
  if (env?.ADMIN_WORKER?.fetch) {
    return withFrontGateHeaders(await env.ADMIN_WORKER.fetch(request));
  }
  const target = new URL(ADMIN_WORKER_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

function formatMemberPageHeading(pathname) {
  const slug = normalizePath(pathname).split("/").filter(Boolean).at(-1) || "";
  const words = slug
    .replace(/[^a-z0-9-]+/gi, "-")
    .split("-")
    .filter(Boolean)
    .slice(0, 6);
  if (!words.length) return "Member Page";
  return words
    .map((word) => {
      if (/^\d+$/.test(word) || word.length <= 2) return word.toUpperCase();
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function renderRouteRecoveryShell(request, page, title, heading, copy, links = []) {
  const url = new URL(request.url);
  const query = url.search || "";
  const renderedLinks = links
    .map((link, index) => {
      const href = `${link.href}${query}`;
      const className = index === 0 ? ` class="primary"` : "";
      return `<a${className} href="${href}">${link.label}</a>`;
    })
    .join("");
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; letter-spacing: 0; }
      html { min-height: 100%; background: #050403; }
      body { margin: 0; min-height: 100vh; padding: 22px; background: radial-gradient(circle at top left, #241907 0, #090705 36%, #050403 100%); color: #fff7e8; font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif; }
      main { width: min(780px, 100%); margin: 0 auto; padding: 28px 0 40px; display: block; }
      .brand { margin: 0 0 14px; color: #ffd784; font-size: 13px; font-weight: 900; line-height: 1.4; text-transform: uppercase; }
      h1 { margin: 0 0 16px; color: #ffffff; font-size: clamp(38px, 12vw, 76px); line-height: 1; overflow-wrap: anywhere; }
      p { margin: 0 0 16px; color: #fff1d5; font-size: 17px; line-height: 1.65; }
      .actions { margin-top: 14px; }
      a { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; margin: 8px 8px 0 0; padding: 0 16px; border: 1px solid #d8ad5a; border-radius: 999px; color: #fff7e8; background: #17110a; text-decoration: none; font-weight: 850; line-height: 1.2; }
      a.primary { color: #130d05; background: #ffd784; border-color: #ffd784; }
    </style>
  </head>
  <body>
    <main data-mmd-page-shell="${page}">
      <p class="brand">MMD Privé</p>
      <h1>${heading}</h1>
      <p>${copy}</p>
      <p class="actions">${renderedLinks}</p>
    </main>
  </body>
</html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "pragma": "no-cache",
      "expires": "0",
      "x-mmd-worker": "mmd-redirect-worker",
      "x-mmd-front-gate": FRONT_GATE,
      "x-mmd-front-version": FRONT_VERSION,
      "x-mmd-page": page,
      "x-mmd-temporary-route": "true",
    },
  });
}

function renderMemberStaticRecovery(request) {
  const heading = formatMemberPageHeading(new URL(request.url).pathname);
  return renderRouteRecoveryShell(
    request,
    "member-static",
    "MMD Privé | Member",
    heading,
    "หน้านี้อยู่ในพื้นที่สมาชิกของ MMD Privé และพร้อมเชื่อมต่อกับเนื้อหาหลักในขั้นต่อไป",
    [
      { label: "Enter Member Area", href: "/member/dashboard" },
      { label: "Membership", href: "/member/membership" },
    ],
  );
}

function renderHallRecovery(request) {
  return renderRouteRecoveryShell(
    request,
    "hall",
    "MMD Privé | Hall",
    "MMD Hall",
    "พื้นที่กลางสำหรับเข้าสู่ระบบสมาชิก ตรวจสถานะ และไปต่อยังเส้นทางที่เกี่ยวข้องของ MMD Privé",
    [
      { label: "Enter Member Area", href: "/member/dashboard" },
      { label: "Member Payments", href: "/member/payments" },
    ],
  );
}

function renderModelConsoleRecovery(request) {
  return renderRouteRecoveryShell(
    request,
    "model-console",
    "MMD Privé | Model Console",
    "Model Console",
    "พื้นที่สำหรับผู้ให้บริการตรวจสถานะงานและไปต่อยังขั้นตอนที่เกี่ยวข้องของ MMD Privé",
    [
      { label: "Continue", href: "/v1/model/session/dashboard" },
      { label: "Member Area", href: "/member/dashboard" },
    ],
  );
}

export function findMappedPath(pathname) {
  const normalized = normalizePath(pathname);
  const key = normalized.toLowerCase();
  if (EXACT_PATH_REDIRECTS[key]) {
    return EXACT_PATH_REDIRECTS[key];
  }
  for (const rule of FOLDER_REDIRECTS) {
    const fromLower = rule.from.toLowerCase();
    if (key.startsWith(fromLower)) {
      const rest = normalized.slice(rule.from.length);
      return `${rule.to}${rest}`.replace(/\/{2,}/g, "/");
    }
  }
  return normalized;
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (isLineWebhookPath(url)) {
      return fetchLineWebhook(request, env, url);
    }
    if (!isSafePageRequest(request)) {
      return withFrontGateHeaders(await fetch(request));
    }
    if (isMemberFrontendPath(url)) {
      return fetchMemberFrontend(request, env, url);
    }
    if (isMemberPaymentsPath(url)) {
      return fetchAdminMemberPage(request, env, url);
    }
    if (isHallPath(url)) {
      return renderHallRecovery(request);
    }
    if (isModelConsolePath(url)) {
      return renderModelConsoleRecovery(request);
    }
    if (isMemberPath(url) && !isKnownLegacyMemberRedirect(url)) {
      return renderMemberStaticRecovery(request);
    }
    if (shouldNeverTouch(url)) {
      return fetchPassThrough(request);
    }
    if (!REDIRECT_HOSTS.has(url.hostname)) {
      return fetchPassThrough(request);
    }
    const mappedPath = findMappedPath(url.pathname);
    const target = buildTargetUrl(url, mappedPath);
    const needsRedirect =
      url.protocol !== CANONICAL_PROTOCOL ||
      url.hostname !== CANONICAL_HOST ||
      url.pathname !== mappedPath;
    if (!needsRedirect || target.toString() === url.toString()) {
      return fetchPassThrough(request);
    }
    return withFrontGateHeaders(Response.redirect(target.toString(), 301));
  },
};
