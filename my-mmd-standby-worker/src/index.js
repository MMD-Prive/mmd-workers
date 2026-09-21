const WORKER_NAME = "my-mmd-standby-worker";
const VERSION = "2026.09.21-v1";

const BACKUP_UI_PREFIX = "/my-mmd-backup";
const BACKUP_HEALTH_PATH = "/my-mmd-backup/health";
const BACKUP_LIFF_SHELL_PATHS = new Set(["/member/liff-backup", "/member/liff-backup/"]);
const BACKUP_LIFF_API_PREFIX = "/member/api/liff-backup/";
const BACKUP_MEMBER_APP_PREFIX = "/api/member-backup/app/";
const BACKUP_PAYMENTS_PATHS = new Set(["/v1/member-backup/payments", "/v1/member-backup/payments/"]);

const CANONICAL_LIFF_SHELL_PATH = "/member/liff";
const CANONICAL_LIFF_API_PREFIX = "/member/api/liff/";
const CANONICAL_MEMBER_APP_PREFIX = "/api/member/app/";
const CANONICAL_PAYMENTS_PATH = "/v1/member/payments";
const PRIMARY_LIFF_ID = "2010862595-yT4DCEMc";
const LIFF_ID_PATTERN = /^\d{10,20}-[A-Za-z0-9_-]{4,120}$/;

const UI_VIEWS = Object.freeze({
  "": "profile",
  "/": "profile",
  "/profile": "profile",
  "/membership": "package",
  "/points": "points",
  "/history": "history",
  "/coupons": "coupons",
});

function normalizedPath(request) {
  return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
      "x-content-type-options": "nosniff",
      "x-mmd-worker": WORKER_NAME,
      "x-mmd-route-owner": WORKER_NAME,
      "x-mmd-standby": "warm",
      "x-mmd-standby-version": VERSION,
      ...extraHeaders,
    },
  });
}

function configuredLiffId(env = {}) {
  const value = String(env.LINE_LIFF_BACKUP_ID || "").trim();
  return LIFF_ID_PATTERN.test(value) ? value : "";
}

function serviceUnavailable(code, message) {
  return json({ ok: false, error: { code, message } }, 503);
}

function standbyHeaders(upstreamHeaders = new Headers(), { rewritten = false } = {}) {
  const headers = new Headers(upstreamHeaders);
  if (rewritten) {
    for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) {
      headers.delete(name);
    }
  }
  headers.set("cache-control", "no-store, private, max-age=0");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-upstream-service", "member-pages-worker");
  headers.set("x-mmd-standby", "warm");
  headers.set("x-mmd-standby-version", VERSION);
  headers.set("x-mmd-standby-authority", "canonical-shared");
  return headers;
}

function backupUiRedirect(request) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    return new Response(null, {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "cache-control": "no-store",
        "x-mmd-worker": WORKER_NAME,
        "x-mmd-route-owner": WORKER_NAME,
      },
    });
  }

  const source = new URL(request.url);
  const suffix = source.pathname.slice(BACKUP_UI_PREFIX.length).replace(/\/+$/, "") || "";
  const view = UI_VIEWS[suffix];
  if (!view) return json({ ok: false, error: { code: "STANDBY_ROUTE_NOT_FOUND" } }, 404);

  const target = new URL(request.url);
  target.pathname = "/member/liff-backup";
  target.search = "";
  target.searchParams.set("intent", "status");
  target.searchParams.set("view", view);
  for (const key of ["lang", "locale"]) {
    const value = String(source.searchParams.get(key) || "").trim();
    if (value) target.searchParams.set(key, value.slice(0, 12));
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: target.toString(),
      "cache-control": "no-store, private, max-age=0",
      "x-mmd-worker": WORKER_NAME,
      "x-mmd-route-owner": WORKER_NAME,
      "x-mmd-standby": "warm",
    },
  });
}

function canonicalUrl(request) {
  const url = new URL(request.url);
  const path = normalizedPath(request);
  if (BACKUP_LIFF_SHELL_PATHS.has(path)) {
    url.pathname = CANONICAL_LIFF_SHELL_PATH;
    return url;
  }
  if (path.startsWith(BACKUP_LIFF_API_PREFIX)) {
    url.pathname = `${CANONICAL_LIFF_API_PREFIX}${path.slice(BACKUP_LIFF_API_PREFIX.length)}`;
    return url;
  }
  if (path.startsWith(BACKUP_MEMBER_APP_PREFIX)) {
    url.pathname = `${CANONICAL_MEMBER_APP_PREFIX}${path.slice(BACKUP_MEMBER_APP_PREFIX.length)}`;
    return url;
  }
  if (BACKUP_PAYMENTS_PATHS.has(path)) {
    url.pathname = CANONICAL_PAYMENTS_PATH;
    return url;
  }
  return null;
}

function membershipLaneMarkup() {
  return `<section class="card mmd-standby-membership" data-mmd-standby-membership>
    <span class="label">MEMBERSHIP</span>
    <h2>สมัครหรือต่ออายุสมาชิก</h2>
    <p class="sub">ระบบสำรองใช้ข้อมูลสมาชิกและการตรวจรับเงินชุดเดียวกับ MMD หลักครับ</p>
    <div class="mmd-standby-links">
      <a href="/pay/membership?source=line&amp;entry=standby">Public Membership · Member / Elite / Red Card</a>
      <a href="/sigil/member/membership?source=line&amp;intent=signup&amp;entry=standby">Private Membership · Standard / Premium</a>
      <a href="/sigil/member/membership?source=line&amp;intent=renew&amp;entry=standby">ต่ออายุ Private Membership</a>
    </div>
  </section>`;
}

function rewriteShell(html, liffId) {
  let output = String(html || "");
  if (!output.includes("</body>") || !output.includes('id="actions"')) return "";

  output = output
    .replaceAll(PRIMARY_LIFF_ID, liffId)
    .replace(/"liffId":"[^"]*"/, `"liffId":${JSON.stringify(liffId)}`)
    .replaceAll(CANONICAL_LIFF_API_PREFIX, BACKUP_LIFF_API_PREFIX)
    .replaceAll("/my-mmd/", "/my-mmd-backup/");

  if (!output.includes("data-mmd-standby-membership")) {
    const marker = '<div id="actions" class="actions" aria-label="ตัวเลือก"></div>';
    if (!output.includes(marker)) return "";
    output = output.replace(marker, `${marker}${membershipLaneMarkup()}`);
  }
  if (!output.includes(".mmd-standby-links")) {
    output = output.replace("</style>", `.mmd-standby-membership{margin-top:14px}.mmd-standby-membership h2{margin:8px 0 6px;font-size:18px}.mmd-standby-links{display:grid;gap:9px;margin-top:13px}.mmd-standby-links a{display:flex;min-height:46px;align-items:center;justify-content:center;padding:10px 14px;border:1px solid rgba(216,189,137,.3);border-radius:999px;color:#f2ddad;text-decoration:none;text-align:center;font-size:13px;line-height:1.35}.mmd-standby-links a:first-child{background:#f0d892;color:#181207;font-weight:800}</style>`);
  }
  output = output.replace("<main>", '<main data-mmd-standby="warm-v1">');
  return output;
}

function rewriteJsonBody(body, liffId) {
  let output = String(body || "")
    .replaceAll(CANONICAL_LIFF_API_PREFIX, BACKUP_LIFF_API_PREFIX)
    .replaceAll(CANONICAL_MEMBER_APP_PREFIX, BACKUP_MEMBER_APP_PREFIX);
  if (liffId) output = output.replaceAll(PRIMARY_LIFF_ID, liffId);
  return output;
}

function rewriteLocation(value, request, liffId) {
  if (!value) return "";
  let location;
  try { location = new URL(value, request.url); } catch { return value; }
  if (location.origin !== new URL(request.url).origin) return value;
  if (location.pathname === CANONICAL_LIFF_SHELL_PATH || location.pathname === `${CANONICAL_LIFF_SHELL_PATH}/`) {
    location.pathname = "/member/liff-backup";
  } else if (location.pathname.startsWith(CANONICAL_LIFF_API_PREFIX)) {
    location.pathname = `${BACKUP_LIFF_API_PREFIX}${location.pathname.slice(CANONICAL_LIFF_API_PREFIX.length)}`;
  } else if (location.pathname.startsWith(CANONICAL_MEMBER_APP_PREFIX)) {
    location.pathname = `${BACKUP_MEMBER_APP_PREFIX}${location.pathname.slice(CANONICAL_MEMBER_APP_PREFIX.length)}`;
  }
  if (liffId) location.href = location.href.replaceAll(PRIMARY_LIFF_ID, liffId);
  return location.toString();
}

async function forwardCanonical(request, env, { shell = false } = {}) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) {
    return serviceUnavailable("STANDBY_UPSTREAM_NOT_CONFIGURED", "Member service is unavailable.");
  }
  const liffId = configuredLiffId(env);
  if (shell && !liffId) {
    return serviceUnavailable("STANDBY_LIFF_NOT_CONFIGURED", "Backup member verification is not configured.");
  }
  const upstreamUrl = canonicalUrl(request);
  if (!upstreamUrl) return json({ ok: false, error: { code: "STANDBY_ROUTE_NOT_FOUND" } }, 404);

  let upstream;
  try {
    upstream = await env.MEMBER_PAGES_WORKER.fetch(new Request(upstreamUrl.toString(), request));
  } catch {
    return serviceUnavailable("STANDBY_UPSTREAM_UNREACHABLE", "Member service is temporarily unavailable.");
  }

  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isHtml = contentType.includes("text/html");
  const isJson = contentType.includes("application/json");
  const rewritten = request.method !== "HEAD" && (isHtml || isJson);
  const headers = standbyHeaders(upstream.headers, { rewritten });
  const location = rewriteLocation(headers.get("location"), request, liffId);
  if (location) headers.set("location", location);

  if (request.method === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (isHtml) {
    const body = shell ? rewriteShell(await upstream.text(), liffId) : await upstream.text();
    if (shell && !body) {
      return serviceUnavailable("STANDBY_SHELL_CONTRACT_MISMATCH", "Backup member interface is temporarily unavailable.");
    }
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (isJson) {
    return new Response(rewriteJsonBody(await upstream.text(), liffId), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function health(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const liffConfigured = Boolean(configuredLiffId(env));
  if (!liffConfigured || !env.MEMBER_PAGES_WORKER?.fetch) {
    return json({
      ok: false,
      mode: "warm_standby",
      version: VERSION,
      checks: {
        liff_id: liffConfigured ? "configured" : "missing",
        member_pages: env.MEMBER_PAGES_WORKER?.fetch ? "configured" : "missing",
      },
    }, 503);
  }

  let status;
  try {
    status = await env.MEMBER_PAGES_WORKER.fetch(new Request("https://www.mmdbkk.com/member/api/liff/status", {
      method: "GET",
      headers: { accept: "application/json" },
    }));
  } catch {
    return json({ ok: false, mode: "warm_standby", version: VERSION, checks: { liff_id: "configured", member_pages: "unreachable" } }, 503);
  }

  const healthy = status.status === 401;
  const body = {
    ok: healthy,
    mode: "warm_standby",
    version: VERSION,
    authority: "member-pages-worker + canonical resolvers",
    checks: {
      liff_id: "configured",
      member_pages: healthy ? "reachable" : "unexpected_response",
      anonymous_session_boundary: String(status.status),
    },
  };
  return request.method === "HEAD"
    ? new Response(null, { status: healthy ? 200 : 503, headers: standbyHeaders() })
    : json(body, healthy ? 200 : 503);
}

export const STANDBY_INTERNALS = Object.freeze({
  BACKUP_LIFF_API_PREFIX,
  BACKUP_MEMBER_APP_PREFIX,
  configuredLiffId,
  rewriteJsonBody,
  rewriteShell,
});

export default {
  async fetch(request, env = {}) {
    const path = normalizedPath(request);
    if (path === BACKUP_HEALTH_PATH) return health(request, env);
    if (path === BACKUP_UI_PREFIX || path.startsWith(`${BACKUP_UI_PREFIX}/`)) return backupUiRedirect(request);
    if (BACKUP_LIFF_SHELL_PATHS.has(path)) return forwardCanonical(request, env, { shell: true });
    if (path.startsWith(BACKUP_LIFF_API_PREFIX) || path.startsWith(BACKUP_MEMBER_APP_PREFIX) || BACKUP_PAYMENTS_PATHS.has(path)) {
      return forwardCanonical(request, env);
    }
    return json({ ok: false, error: { code: "STANDBY_ROUTE_NOT_FOUND" } }, 404);
  },
};
