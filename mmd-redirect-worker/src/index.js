/**
 * MMD public front-door route guard.
 *
 * Keeps canonical redirects small and lets the member-facing routes be served
 * by immigrate-worker without falling through to Webflow, payment, or JSON API
 * auth responses.
 */

export const CANONICAL_HOST = "mmdbkk.com";
export const CANONICAL_PROTOCOL = "https:";

export const REDIRECT_HOSTS = new Set([
  "www.mmdbkk.com",
  "mmdbkk.com",
  "mmdprive.com",
  "www.mmdprive.com",
  "malemodel-bkk.workers.dev",
]);

export const NEVER_TOUCH_HOSTS = new Set(["sigil.mmdbkk.com"]);

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

export const MEMBER_FRONTEND_PATHS = new Set([
  "/member/dashboard",
  "/member/dashboard/",
  "/member/membership",
  "/member/membership/",
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
  { from: "/old-academy/", to: "/academy/" },
  { from: "/old-trust/", to: "/trust/" },
];

export function isSafePageRequest(request) {
  const method = request.method.toUpperCase();
  return method === "GET" || method === "HEAD";
}

export function normalizePath(pathname) {
  let path = pathname || "/";
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/g, "");
  return path || "/";
}

export function isMemberFrontendPath(url) {
  return MEMBER_FRONTEND_PATHS.has(url.pathname.toLowerCase());
}

export function shouldNeverTouch(url) {
  if (NEVER_TOUCH_HOSTS.has(url.hostname)) return true;

  const pathname = url.pathname.toLowerCase();
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

export async function fetchMemberFrontend(request, env, url) {
  if (env?.IMMIGRATE_WORKER?.fetch) {
    return env.IMMIGRATE_WORKER.fetch(request);
  }

  const target = new URL("https://immigrate-worker.malemodel-bkk.workers.dev");
  target.pathname = url.pathname;
  target.search = url.search;
  return fetch(new Request(target.toString(), request));
}

export function findMappedPath(pathname) {
  const normalized = normalizePath(pathname);
  const key = normalized.toLowerCase();

  if (EXACT_PATH_REDIRECTS[key]) return EXACT_PATH_REDIRECTS[key];

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

    if (!isSafePageRequest(request)) {
      return fetch(request);
    }

    if (isMemberFrontendPath(url)) {
      return fetchMemberFrontend(request, env, url);
    }

    if (shouldNeverTouch(url)) {
      return fetch(request);
    }

    if (!REDIRECT_HOSTS.has(url.hostname)) {
      return fetch(request);
    }

    const mappedPath = findMappedPath(url.pathname);
    const target = buildTargetUrl(url, mappedPath);
    const needsRedirect =
      url.protocol !== CANONICAL_PROTOCOL ||
      url.hostname !== CANONICAL_HOST ||
      url.pathname !== mappedPath;

    if (!needsRedirect || target.toString() === url.toString()) {
      return fetch(request);
    }

    return Response.redirect(target.toString(), 301);
  },
};
