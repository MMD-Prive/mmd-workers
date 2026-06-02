const OWNER_HEADER = "x-mmd-sigil-owner";
const BUILD_HEADER = "x-mmd-sigil-build";
const UPSTREAM_HEADER = "x-mmd-sigil-upstream";
const OWNER = "sigil-worker";
const DEFAULT_BUILD = "SIGIL_ROUTE_MIGRATION_V1";
const DEFAULT_UPSTREAM_BASE_URL = "https://immigrate-worker.malemodel-bkk.workers.dev";
const DEFAULT_ADMIN_NEXT = "/sigil/admin/jobs/create-session";
const SIGIL_ADMIN_LOGIN_PATH = "/sigil/admin/login";
const SIGIL_ADMIN_LOGIN_SESSION_PATH = "/sigil/admin/login/session";
const SIGIL_ADMIN_LOGIN_UI_BUILD = "SIGIL_ADMIN_LOGIN_UI_V2";
const SIGIL_LOGO_URL = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp";
const SIGIL_LOGIN_BG_URL = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0802e10402165b8404527c_BPEWPRIVELogin.png";

const FIRST_WAVE_ROUTES = new Set<string>([
  "GET /sigil/admin/login",
  "POST /sigil/admin/login/session",
  "DELETE /sigil/admin/login/session",
  "POST /sigil/admin/verify-access-code",
  "GET /sigil/admin/control-room",
  "GET /sigil/admin/jobs/create-session",
  "GET /sigil/admin/jobs/create-job",
  "GET /sigil/api/invite/resolve",
  "POST /sigil/api/renewal/status",
  "POST /sigil/api/renewal/intake",
  "POST /sigil/api/jobs/customer-confirm",
]);

interface Env {
  IMMIGRATE_WORKER_BASE_URL?: string;
  SIGIL_ROUTE_MIGRATION_BUILD?: string;
}

type BodyParams = {
  hasToken: boolean;
  unsafeNext: string | null;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const build = env.SIGIL_ROUTE_MIGRATION_BUILD || DEFAULT_BUILD;
    const url = new URL(request.url);
    const upstreamBaseUrl = env.IMMIGRATE_WORKER_BASE_URL || DEFAULT_UPSTREAM_BASE_URL;

    if (!url.pathname.startsWith("/sigil/")) {
      return withSigilHeaders(new Response("Not found", { status: 404 }), build);
    }

    if (url.searchParams.has("token")) {
      return withSigilHeaders(
        json({ ok: false, error: "invalid_request", message: "Use t instead of token." }, 400),
        build,
      );
    }

    const nextParam = url.searchParams.get("next");
    if (nextParam !== null) {
      const safeNext = normalizeLocalNext(nextParam);
      if (!safeNext) {
        return withSigilHeaders(
          json({ ok: false, error: "invalid_next", message: "next must be a local path." }, 400),
          build,
        );
      } else if (safeNext !== nextParam) {
        url.searchParams.set("next", safeNext);
      }
    }

    const bodyParams = await inspectTokenLikeBodyParams(request);
    if (bodyParams.hasToken) {
      return withSigilHeaders(
        json({ ok: false, error: "invalid_request", message: "Use t instead of token." }, 400),
        build,
      );
    }
    if (bodyParams.unsafeNext) {
      return withSigilHeaders(
        json({ ok: false, error: "invalid_next", message: "next must be a local path." }, 400),
        build,
      );
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === SIGIL_ADMIN_LOGIN_PATH) {
      const loginResponse = request.method === "HEAD"
        ? new Response(null, { status: 200, headers: adminLoginHeaders() })
        : renderAdminLoginPage(url);
      const response = withSigilHeaders(loginResponse, build);
      response.headers.set("x-mmd-sigil-migration-wave", "first");
      return response;
    }

    const upstreamUrl = toUpstreamUrl(url, upstreamBaseUrl);
    const upstreamRequest = new Request(upstreamUrl.toString(), request);
    const upstream = await fetch(upstreamRequest);

    const response = withSigilHeaders(upstream, build, {
      publicOrigin: url.origin,
      upstreamOrigin: new URL(upstreamBaseUrl).origin,
    });
    response.headers.set(UPSTREAM_HEADER, "immigrate-worker");

    const routeKey = `${request.method.toUpperCase()} ${url.pathname}`;
    if (FIRST_WAVE_ROUTES.has(routeKey)) {
      response.headers.set("x-mmd-sigil-migration-wave", "first");
    }

    return response;
  },
};

function renderAdminLoginPage(url: URL): Response {
  const next = normalizeLocalNext(url.searchParams.get("next") || "") || DEFAULT_ADMIN_NEXT;
  const t = url.searchParams.get("t") || "";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>SIGIL Admin Gate</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body {
      background: #050302;
      color: #f7ead0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    button, input { font: inherit; letter-spacing: 0; }
    .sag2-shell {
      min-height: 100svh;
      position: relative;
      display: grid;
      place-items: center;
      padding: clamp(18px, 4vw, 44px);
      overflow: hidden;
      isolation: isolate;
      background:
        linear-gradient(90deg, rgba(5, 3, 2, 0.92), rgba(5, 3, 2, 0.58) 48%, rgba(5, 3, 2, 0.9)),
        linear-gradient(180deg, rgba(5, 3, 2, 0.38), rgba(5, 3, 2, 0.96)),
        url("${SIGIL_LOGIN_BG_URL}") center / cover no-repeat,
        #050302;
    }
    /* TODO: Replace this with the final dark SIGIL control-room background asset if BPEWPRIVELogin.png is not the intended canonical dark BG. */
    .sag2-shell::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      background:
        linear-gradient(120deg, rgba(3, 2, 1, 0.96), rgba(21, 12, 3, 0.64) 45%, rgba(3, 2, 1, 0.94)),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 96px);
      pointer-events: none;
    }
    .sag2-frame {
      width: min(1120px, 100%);
      min-height: min(720px, calc(100svh - 36px));
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
      gap: clamp(18px, 4vw, 54px);
      align-items: center;
    }
    .sag2-copy {
      min-width: 0;
      display: grid;
      gap: 20px;
      padding: clamp(8px, 2vw, 24px) 0;
    }
    .sag2-logo {
      width: min(220px, 52vw);
      height: auto;
      display: block;
      filter: drop-shadow(0 18px 34px rgba(0, 0, 0, 0.42));
    }
    .sag2-kicker,
    .sag2-canary,
    .sag2-meta span,
    .sag2-footnote {
      margin: 0;
      color: rgba(246, 213, 150, 0.7);
      font-size: 0.72rem;
      line-height: 1.35;
      font-weight: 850;
      text-transform: uppercase;
    }
    .sag2-title {
      max-width: 760px;
      margin: 0;
      color: #fff8e8;
      font-size: clamp(3rem, 8vw, 7rem);
      line-height: 0.92;
      font-weight: 900;
      letter-spacing: 0;
      text-wrap: balance;
      text-shadow: 0 28px 80px rgba(0, 0, 0, 0.52);
    }
    .sag2-copy p:not(.sag2-kicker) {
      max-width: 620px;
      margin: 0;
      color: rgba(255, 244, 222, 0.75);
      font-size: clamp(1rem, 1.45vw, 1.16rem);
      line-height: 1.7;
    }
    .sag2-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 6px;
    }
    .sag2-meta span {
      min-height: 32px;
      display: inline-grid;
      place-items: center;
      padding: 7px 10px;
      border: 1px solid rgba(242, 196, 106, 0.24);
      border-radius: 8px;
      background: rgba(9, 6, 4, 0.42);
      color: rgba(255, 231, 184, 0.78);
    }
    .sag2-panel {
      width: 100%;
      align-self: center;
      border: 1px solid rgba(246, 201, 116, 0.26);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(33, 24, 14, 0.66), rgba(8, 6, 4, 0.78));
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.54), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
      overflow: hidden;
    }
    .sag2-panel-inner {
      display: grid;
      gap: 18px;
      padding: clamp(22px, 4vw, 34px);
    }
    .sag2-canary {
      width: fit-content;
      padding: 7px 9px;
      border: 1px solid rgba(246, 201, 116, 0.28);
      border-radius: 8px;
      color: rgba(255, 226, 166, 0.86);
      background: rgba(0, 0, 0, 0.24);
    }
    .sag2-panel h2 {
      margin: 0;
      color: #fff5dc;
      font-size: clamp(1.42rem, 3vw, 2.08rem);
      line-height: 1.08;
      font-weight: 900;
      letter-spacing: 0;
    }
    .sag2-panel p {
      margin: 0;
      color: rgba(255, 241, 213, 0.68);
      font-size: 0.95rem;
      line-height: 1.58;
    }
    .sag2-form {
      display: grid;
      gap: 14px;
      padding-top: 4px;
    }
    .sag2-field {
      display: grid;
      gap: 8px;
    }
    .sag2-field span {
      color: rgba(255, 238, 203, 0.84);
      font-size: 0.82rem;
      line-height: 1.3;
      font-weight: 820;
    }
    .sag2-input {
      width: 100%;
      min-height: 52px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 13px 14px;
      color: #fff8e8;
      background: rgba(0, 0, 0, 0.32);
      outline: none;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .sag2-input:focus {
      border-color: rgba(246, 201, 116, 0.72);
      box-shadow: 0 0 0 3px rgba(246, 201, 116, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .sag2-button {
      min-height: 56px;
      border: 1px solid rgba(255, 228, 168, 0.8);
      border-radius: 8px;
      display: grid;
      place-items: center;
      padding: 13px 16px;
      cursor: pointer;
      color: #160f06;
      background: linear-gradient(135deg, #ffe1a0, #d29a45 54%, #94601f);
      font-weight: 900;
      box-shadow: 0 16px 40px rgba(184, 119, 38, 0.24);
    }
    .sag2-button[disabled] {
      cursor: not-allowed;
      opacity: 0.62;
    }
    .sag2-status {
      min-height: 22px;
      color: rgba(255, 226, 166, 0.78);
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .sag2-status[data-tone="error"] { color: #ffb5aa; }
    .sag2-status[data-tone="success"] { color: #b5e8bf; }
    .sag2-footnote {
      text-transform: none;
      color: rgba(255, 237, 202, 0.46);
      font-weight: 720;
    }
    @media (max-width: 860px) {
      .sag2-shell {
        align-items: start;
        padding: 16px;
        overflow: auto;
      }
      .sag2-frame {
        min-height: auto;
        grid-template-columns: 1fr;
        gap: 22px;
      }
      .sag2-copy {
        padding-top: 8px;
      }
      .sag2-title {
        font-size: clamp(2.6rem, 15vw, 4.4rem);
      }
      .sag2-panel {
        align-self: start;
      }
    }
    @media (max-width: 420px) {
      .sag2-shell { padding: 10px; }
      .sag2-panel-inner { padding: 18px; }
      .sag2-title { font-size: 2.5rem; }
      .sag2-input, .sag2-button { min-height: 50px; }
    }
  </style>
</head>
<body>
  <main class="sag2-shell" data-sigil-admin-gate-v2>
    <section class="sag2-frame" aria-label="SIGIL admin login">
      <div class="sag2-copy">
        <img class="sag2-logo" src="${SIGIL_LOGO_URL}" alt="SIGIL">
        <p class="sag2-kicker">Private Control Room</p>
        <h1 class="sag2-title">SIGIL Admin Gate</h1>
        <p>Secure operator entry for SIGIL sessions, renewal handling, invite review, and protected control-room work.</p>
        <div class="sag2-meta" aria-label="Route status">
          <span>sigil-worker</span>
          <span>SIGIL_ROUTE_MIGRATION_V1</span>
          <span>Admin Session Required</span>
        </div>
      </div>

      <section class="sag2-panel" aria-label="Admin authorization panel">
        <div class="sag2-panel-inner">
          <p class="sag2-canary">${SIGIL_ADMIN_LOGIN_UI_BUILD}</p>
          <div>
            <h2>Authorized operators only.</h2>
            <p>Sign in with your SIGIL admin identity. Session verification stays protected server-side.</p>
          </div>

          <form class="sag2-form" method="post" action="${SIGIL_ADMIN_LOGIN_SESSION_PATH}" data-sigil-admin-login-form>
            <input type="hidden" name="next" value="${escapeHtml(next)}">
            <input type="hidden" name="t" value="${escapeHtml(t)}">
            <label class="sag2-field">
              <span>Admin identity</span>
              <input class="sag2-input" name="identity" type="text" autocomplete="username" required autofocus>
            </label>
            <label class="sag2-field">
              <span>Password</span>
              <input class="sag2-input" name="password" type="password" autocomplete="current-password" required>
            </label>
            <button class="sag2-button" type="submit">Enter Control Room</button>
            <div class="sag2-status" role="status" aria-live="polite" data-sigil-admin-status></div>
          </form>

          <p class="sag2-footnote">Credential verification is handled server-side.</p>
        </div>
      </section>
    </section>
  </main>

  <script>
    (() => {
      const form = document.querySelector("[data-sigil-admin-login-form]");
      const status = document.querySelector("[data-sigil-admin-status]");
      const button = form?.querySelector("button[type='submit']");
      if (!form || !status || !button) return;

      const setStatus = (message, tone = "") => {
        status.textContent = message;
        status.dataset.tone = tone;
      };

      const localNext = (value) => {
        try {
          const parsed = new URL(value || ${JSON.stringify(DEFAULT_ADMIN_NEXT)}, location.origin);
          if (parsed.origin !== location.origin) return ${JSON.stringify(DEFAULT_ADMIN_NEXT)};
          if (!parsed.pathname.startsWith("/")) return ${JSON.stringify(DEFAULT_ADMIN_NEXT)};
          return parsed.pathname + parsed.search + parsed.hash;
        } catch {
          return ${JSON.stringify(DEFAULT_ADMIN_NEXT)};
        }
      };

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        const identity = String(data.get("identity") || "").trim();
        const password = String(data.get("password") || "");
        const next = localNext(String(data.get("next") || ""));
        if (!identity || !password) {
          setStatus("Enter your identity and password.", "error");
          return;
        }

        button.disabled = true;
        button.textContent = "Checking...";
        setStatus("Verifying secure session...");

        try {
          const response = await fetch(form.action, {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ identity, password, accessCode: password, next }),
          });

          if (response.redirected) {
            const responseUrl = new URL(response.url, location.origin);
            if (responseUrl.pathname === ${JSON.stringify(SIGIL_ADMIN_LOGIN_PATH)}) {
              setStatus("Access denied. Check your credentials and try again.", "error");
              return;
            }
            setStatus("Authorized. Opening control room.", "success");
            location.replace(response.url);
            return;
          }

          if (response.ok) {
            const payload = await response.clone().json().catch(() => null);
            if (!payload?.ok) {
              setStatus("Access denied. Check your credentials and try again.", "error");
              return;
            }
            const redirectTo = localNext(payload?.data?.redirect_to || next);
            setStatus("Authorized. Opening control room.", "success");
            location.replace(redirectTo);
            return;
          }

          setStatus("Access denied. Check your credentials and try again.", "error");
        } catch {
          setStatus("Unable to reach the admin gate right now.", "error");
        } finally {
          button.disabled = false;
          button.textContent = "Enter Control Room";
        }
      });
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: adminLoginHeaders(),
  });
}

function adminLoginHeaders(): Headers {
  return new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-mmd-sigil-login-ui": SIGIL_ADMIN_LOGIN_UI_BUILD,
  });
}

function toUpstreamUrl(publicUrl: URL, upstreamBaseUrl: string): URL {
  const upstreamUrl = new URL(publicUrl.pathname + publicUrl.search, upstreamBaseUrl);
  return upstreamUrl;
}

function withSigilHeaders(
  response: Response,
  build: string,
  rewrite?: { publicOrigin: string; upstreamOrigin: string },
): Response {
  const headers = new Headers(response.headers);
  if (rewrite) {
    rewriteLocationHeader(headers, rewrite.upstreamOrigin, rewrite.publicOrigin);
  }
  headers.set(OWNER_HEADER, OWNER);
  headers.set(BUILD_HEADER, build);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function rewriteLocationHeader(headers: Headers, upstreamOrigin: string, publicOrigin: string): void {
  const location = headers.get("location");
  if (!location) return;

  try {
    const parsed = new URL(location, upstreamOrigin);
    if (parsed.origin !== upstreamOrigin) return;
    headers.set("location", `${publicOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    return;
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizeLocalNext(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//")) return null;

  try {
    const parsed = new URL(trimmed, "https://sigil.mmdbkk.com");
    if (parsed.origin !== "https://sigil.mmdbkk.com") return null;
    if (!parsed.pathname.startsWith("/")) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function inspectTokenLikeBodyParams(request: Request): Promise<BodyParams> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { hasToken: false, unsafeNext: null };
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await request.clone().text());
    return inspectParamEntries(form.entries());
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await request.clone().formData().catch(() => null);
    if (!form) return { hasToken: false, unsafeNext: null };
    return inspectParamEntries(form.entries());
  }

  if (contentType.includes("application/json")) {
    const data = await request.clone().json().catch(() => null);
    return inspectBodyValue(data);
  }

  return { hasToken: false, unsafeNext: null };
}

function inspectParamEntries(entries: Iterable<[string, unknown]>): BodyParams {
  let hasToken = false;
  let unsafeNext: string | null = null;

  for (const [key, rawValue] of entries) {
    if (key === "token") {
      hasToken = true;
    }
    if (key === "next" && typeof rawValue === "string" && !normalizeLocalNext(rawValue)) {
      unsafeNext = rawValue;
    }
  }

  return { hasToken, unsafeNext };
}

function inspectBodyValue(value: unknown): BodyParams {
  if (!value || typeof value !== "object") {
    return { hasToken: false, unsafeNext: null };
  }

  if (Array.isArray(value)) {
    return value.reduce<BodyParams>(
      (params, item) => mergeBodyParams(params, inspectBodyValue(item)),
      { hasToken: false, unsafeNext: null },
    );
  }

  const ownParams = inspectParamEntries(Object.entries(value as Record<string, unknown>));
  const nestedParams = Object.values(value as Record<string, unknown>).reduce<BodyParams>(
    (params, item) => mergeBodyParams(params, inspectBodyValue(item)),
    { hasToken: false, unsafeNext: null },
  );

  return mergeBodyParams(ownParams, nestedParams);
}

function mergeBodyParams(left: BodyParams, right: BodyParams): BodyParams {
  return {
    hasToken: left.hasToken || right.hasToken,
    unsafeNext: left.unsafeNext || right.unsafeNext,
  };
}
