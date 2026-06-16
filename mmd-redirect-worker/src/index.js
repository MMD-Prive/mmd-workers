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

// Domains that should redirect into the canonical site.
// Add/remove domains here only.
export const REDIRECT_HOSTS = new Set([
  "www.mmdbkk.com",
  "mmdbkk.com",
  "mmdprive.com",
  "www.mmdprive.com",
  "malemodel-bkk.workers.dev",
]);

// Subdomains or hosts that must never be redirected by this worker.
export const NEVER_TOUCH_HOSTS = new Set(["sigil.mmdbkk.com"]);

// These are not normal public pages.
// Do not redirect payment/API/webhook/admin traffic unless intentionally designed.
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

// Host-agnostic front-router protected pages owned by another Worker/source.
// These paths must pass through exactly, with query strings preserved, so the
// member dashboard cannot accidentally fall back to Webflow or legacy redirects
// on either mmdbkk.com or www.mmdbkk.com.
export const NEVER_REDIRECT_EXACT_PATHS = new Set([
  "/member/dashboard",
  "/member/dashboard/",
  "/member/membership",
  "/member/membership/",
  "/member/payments",
  "/member/payments/",
  "/hall",
  "/hall/",
]);

// Exact old-path to new-path redirects.
// Keep lowercase keys. The target can keep proper casing if needed.
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

// Folder-level redirects.
// Example: /old-academy/anything -> /academy/anything
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

  // Collapse duplicate slashes: /a//b -> /a/b
  path = path.replace(/\/{2,}/g, "/");

  // Remove trailing slash except root.
  // Example: /trust/inme/ -> /trust/inme
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
  // target.search is preserved automatically.
  return target;
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
  return maybeInjectConfirmPaymentBridge(request, response, url);
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

function isMemberFrontendPath(url) {
  return isMemberDashboardPath(url) || isMemberMembershipPath(url);
}

async function fetchMemberFrontend(request, env, url) {
  if (env?.IMMIGRATE_WORKER?.fetch) {
    return env.IMMIGRATE_WORKER.fetch(request);
  }

  const target = new URL(MEMBER_DASHBOARD_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return fetch(new Request(target.toString(), request));
}

async function fetchAdminMemberPage(request, env, url) {
  if (env?.ADMIN_WORKER?.fetch) {
    return env.ADMIN_WORKER.fetch(request);
  }

  const target = new URL(ADMIN_WORKER_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return fetch(new Request(target.toString(), request));
}

function renderTemporaryHallRecovery(request) {
  const url = new URL(request.url);
  const query = url.search || "";
  const dashboardHref = `/member/dashboard${query}`;
  const paymentsHref = `/member/payments${query}`;
  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Privé | Hall Temporary Recovery</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; letter-spacing: 0; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #050403; color: #fff4df; font-family: Inter, "Avenir Next", "Segoe UI", "Noto Sans Thai", Arial, sans-serif; }
      main { width: min(720px, 100%); display: grid; gap: 16px; }
      h1 { margin: 0; font-size: clamp(40px, 10vw, 82px); line-height: .9; }
      p { margin: 0; color: rgba(255,244,223,.72); line-height: 1.7; }
      a { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; margin: 8px 8px 0 0; padding: 0 14px; border: 1px solid rgba(230,189,103,.34); border-radius: 999px; color: #fff4df; background: rgba(255,255,255,.055); text-decoration: none; font-weight: 850; }
      a.primary { color: #160f07; background: linear-gradient(180deg,#ffe6a7,#bd862f); border-color: rgba(255,231,174,.72); }
    </style>
  </head>
  <body>
    <main data-mmd-temporary-hall-recovery>
      <p>Temporary route recovery</p>
      <h1>MMD Hall</h1>
      <p>หน้า Hall ยังไม่มี canonical renderer ใน member layer ตอนนี้ หน้านี้ป้องกัน fallback ระหว่างต่อ route owner ที่ถูกต้องครับ</p>
      <p><a class="primary" href="${dashboardHref}">Member Dashboard</a><a href="${paymentsHref}">Member Payments</a></p>
    </main>
  </body>
</html>`;

  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": "mmd-redirect-worker",
      "x-mmd-page": "hall-temporary-recovery",
      "x-mmd-temporary-route": "true",
    },
  });
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

    // Safety: never redirect non-page traffic.
    // This prevents breaking POST/payment/webhook/API flows.
    if (!isSafePageRequest(request)) {
      return fetch(request);
    }

    if (isMemberFrontendPath(url)) {
      return fetchMemberFrontend(request, env, url);
    }

    if (isMemberPaymentsPath(url)) {
      return fetchAdminMemberPage(request, env, url);
    }

    if (isHallPath(url)) {
      return renderTemporaryHallRecovery(request);
    }

    if (shouldNeverTouch(url)) {
      return fetchPassThrough(request);
    }

    // If this host is not managed by this redirect worker, pass through.
    if (!REDIRECT_HOSTS.has(url.hostname)) {
      return fetchPassThrough(request);
    }

    const mappedPath = findMappedPath(url.pathname);
    const target = buildTargetUrl(url, mappedPath);

    const needsRedirect =
      url.protocol !== CANONICAL_PROTOCOL ||
      url.hostname !== CANONICAL_HOST ||
      url.pathname !== mappedPath;

    // Prevent redirect loop.
    if (!needsRedirect || target.toString() === url.toString()) {
      return fetchPassThrough(request);
    }

    // 301 = permanent redirect for public pages.
    return Response.redirect(target.toString(), 301);
  },
};
