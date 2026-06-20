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
export const MEMBER_PAGES_UPSTREAM = "https://member-pages-worker.malemodel-bkk.workers.dev";
export const ADMIN_WORKER_UPSTREAM = "https://admin-worker.malemodel-bkk.workers.dev";
export const FRONT_GATE = "mmd-redirect-worker";
export const FRONT_VERSION = "20260620T000000Z";
export const ROUTE_HOP_HEADER = "x-mmd-route-hop";
export const MAX_ROUTE_HOPS = 2;

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

export const ROUTE_REGISTRY = [
  {
    id: "line-webhook",
    owner: "line-webhook-netlify",
    mode: "upstream-bridge",
    status: "production",
    exactPaths: ["/webhook/line", "/webhooks/line"],
  },
  {
    id: "member-dashboard",
    owner: "immigrate-worker",
    mode: "protected-pass-through",
    status: "locked-production",
    exactPaths: ["/member/dashboard"],
  },
  {
    id: "member-membership",
    owner: "member-pages-worker",
    mode: "protected-pass-through",
    status: "not-ready-to-publish",
    exactPaths: ["/member/membership"],
  },
  {
    id: "member-payments",
    owner: "admin-worker",
    mode: "protected-pass-through",
    status: "production",
    exactPaths: ["/member/payments"],
  },
  {
    id: "sigil-admin",
    owner: "sigil-admin-worker",
    mode: "protected-pass-through",
    status: "production",
    prefixes: ["/sigil/admin"],
  },
  {
    id: "sigil-booking",
    owner: "sigil-model-search-worker",
    mode: "planned-protected-pass-through",
    status: "planned",
    exactPaths: ["/sigil/booking"],
  },
  {
    id: "hall",
    owner: "mmd-redirect-worker",
    mode: "route-recovery-shell",
    status: "temporary",
    exactPaths: ["/hall"],
  },
  {
    id: "model-console",
    owner: "mmd-redirect-worker",
    mode: "route-recovery-shell",
    status: "temporary",
    exactPaths: ["/model/console"],
  },
  {
    id: "member-static",
    owner: "mmd-redirect-worker",
    mode: "controlled-member-fallback",
    status: "temporary",
    prefixes: ["/member/"],
    skipKnownLegacyRedirects: true,
  },
];

export const PASS_THROUGH_ROUTE = {
  id: "canonical-pass-through",
  owner: "origin",
  mode: "terminal-pass-through",
  status: "public",
};

export const NEVER_TOUCH_ROUTE = {
  id: "never-touch-pass-through",
  owner: "origin",
  mode: "terminal-pass-through",
  status: "protected",
};

export const UNMANAGED_HOST_ROUTE = {
  id: "unmanaged-host-pass-through",
  owner: "origin",
  mode: "terminal-pass-through",
  status: "external-host",
};

export const REDIRECT_ROUTE = {
  id: "canonical-redirect",
  owner: "mmd-redirect-worker",
  mode: "terminal-redirect",
  status: "managed",
};

export const UNSAFE_METHOD_ROUTE = {
  id: "unsafe-method-pass-through",
  owner: "origin",
  mode: "terminal-pass-through",
  status: "unsafe-method",
};

export const LOOP_BLOCKED_ROUTE = {
  id: "route-loop-blocked",
  owner: "mmd-redirect-worker",
  mode: "terminal-error",
  status: "loop-blocked",
};

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

export function getRouteHop(request) {
  const hop = Number.parseInt(request.headers.get(ROUTE_HOP_HEADER) || "0", 10);
  return Number.isFinite(hop) && hop > 0 ? hop : 0;
}

function routeMatches(route, url) {
  const normalized = normalizePath(url.pathname).toLowerCase();
  if (route.skipKnownLegacyRedirects && isKnownLegacyMemberRedirect(url)) return false;
  if (route.exactPaths?.includes(normalized)) return true;
  return Boolean(
    route.prefixes?.some((prefix) => {
      const normalizedPrefix = normalizePath(prefix).toLowerCase();
      return normalized === normalizedPrefix || normalized.startsWith(`${normalizedPrefix}/`);
    }),
  );
}

export function resolveRouteOwner(url) {
  return ROUTE_REGISTRY.find((route) => routeMatches(route, url)) || null;
}

function withFrontGateHeaders(response, route = null) {
  const headers = new Headers(response.headers);
  headers.set("x-mmd-front-gate", FRONT_GATE);
  headers.set("x-mmd-front-version", FRONT_VERSION);
  if (route) {
    headers.set("x-mmd-route-id", route.id);
    headers.set("x-mmd-route-owner", route.owner);
    headers.set("x-mmd-route-mode", route.mode);
    headers.set("x-mmd-route-status", route.status);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildLoopBlockedResponse(request) {
  return withFrontGateHeaders(
    new Response(request.method.toUpperCase() === "HEAD" ? null : "MMD route loop blocked", {
      status: 508,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-mmd-route-error": "loop-blocked",
      },
    }),
    LOOP_BLOCKED_ROUTE,
  );
}

function createRoutedRequest(request, targetUrl = request.url, init = {}) {
  const headers = new Headers(request.headers);
  headers.set(ROUTE_HOP_HEADER, String(getRouteHop(request) + 1));
  const routedInit = { ...init, headers };
  const routedRequest = new Request(request, routedInit);
  if (String(targetUrl) === request.url) return routedRequest;
  return new Request(String(targetUrl), routedRequest);
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

async function fetchPassThrough(request, route = PASS_THROUGH_ROUTE) {
  const url = new URL(request.url);
  const response = await fetch(createRoutedRequest(request, request.url, { redirect: "follow" }));
  return withFrontGateHeaders(await maybeInjectConfirmPaymentBridge(request, response, url), route);
}

function isLineWebhookPath(url) {
  return LINE_WEBHOOK_PATHS.has(url.pathname.toLowerCase());
}

async function fetchLineWebhook(request, env = {}, url, route) {
  const upstream = String(env?.LINE_WEBHOOK_UPSTREAM_URL || "").trim();
  if (!upstream) {
    return fetchPassThrough(request, route);
  }
  const target = new URL(upstream);
  target.search = url.search;
  return withFrontGateHeaders(await fetch(createRoutedRequest(request, target.toString())), route);
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
  return isMemberDashboardPath(url);
}

async function fetchMemberFrontend(request, env, url, route) {
  if (env?.IMMIGRATE_WORKER?.fetch) {
    return withFrontGateHeaders(await env.IMMIGRATE_WORKER.fetch(createRoutedRequest(request)), route);
  }
  const target = new URL(MEMBER_DASHBOARD_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(createRoutedRequest(request, target.toString())), route);
}

async function fetchMemberPage(request, env, url, route) {
  if (env?.MEMBER_PAGES_WORKER?.fetch) {
    return withFrontGateHeaders(await env.MEMBER_PAGES_WORKER.fetch(createRoutedRequest(request)), route);
  }
  const target = new URL(MEMBER_PAGES_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(createRoutedRequest(request, target.toString())), route);
}

async function fetchAdminMemberPage(request, env, url, route) {
  if (env?.ADMIN_WORKER?.fetch) {
    return withFrontGateHeaders(await env.ADMIN_WORKER.fetch(createRoutedRequest(request)), route);
  }
  const target = new URL(ADMIN_WORKER_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(createRoutedRequest(request, target.toString())), route);
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
    const route = resolveRouteOwner(url);

    if (getRouteHop(request) >= MAX_ROUTE_HOPS) {
      return buildLoopBlockedResponse(request);
    }
    if (route?.id === "line-webhook" || isLineWebhookPath(url)) {
      return fetchLineWebhook(request, env, url, route || ROUTE_REGISTRY[0]);
    }
    if (!isSafePageRequest(request)) {
      return fetchPassThrough(request, UNSAFE_METHOD_ROUTE);
    }
    if (route?.id === "member-dashboard" || isMemberFrontendPath(url)) {
      return fetchMemberFrontend(request, env, url, route || ROUTE_REGISTRY[1]);
    }
    if (route?.id === "member-membership" || isMemberMembershipPath(url)) {
      return fetchMemberPage(request, env, url, route || ROUTE_REGISTRY[2]);
    }
    if (route?.id === "member-payments" || isMemberPaymentsPath(url)) {
      return fetchAdminMemberPage(request, env, url, route || ROUTE_REGISTRY[3]);
    }
    if (route?.id === "hall" || isHallPath(url)) {
      return withFrontGateHeaders(renderHallRecovery(request), route || ROUTE_REGISTRY[6]);
    }
    if (route?.id === "model-console" || isModelConsolePath(url)) {
      return withFrontGateHeaders(renderModelConsoleRecovery(request), route || ROUTE_REGISTRY[7]);
    }
    if (route?.id === "member-static" || (isMemberPath(url) && !isKnownLegacyMemberRedirect(url))) {
      return withFrontGateHeaders(renderMemberStaticRecovery(request), route || ROUTE_REGISTRY[8]);
    }
    if (route?.id === "sigil-admin" || route?.id === "sigil-booking") {
      return fetchPassThrough(request, route);
    }
    if (shouldNeverTouch(url)) {
      return fetchPassThrough(request, NEVER_TOUCH_ROUTE);
    }
    if (!REDIRECT_HOSTS.has(url.hostname)) {
      return fetchPassThrough(request, UNMANAGED_HOST_ROUTE);
    }
    const mappedPath = findMappedPath(url.pathname);
    const target = buildTargetUrl(url, mappedPath);
    const needsRedirect =
      url.protocol !== CANONICAL_PROTOCOL ||
      url.hostname !== CANONICAL_HOST ||
      url.pathname !== mappedPath;
    if (!needsRedirect || target.toString() === url.toString()) {
      return fetchPassThrough(request, PASS_THROUGH_ROUTE);
    }
    return withFrontGateHeaders(Response.redirect(target.toString(), 301), REDIRECT_ROUTE);
  },
};
