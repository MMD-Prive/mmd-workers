const CLIENT_SCRIPT_PATH = "/member/liff-client-diag.js";
const CLIENT_DIAG_PATH = "/member/api/liff/client-diag";
const TRACE_TTL_SECONDS = 60 * 60 * 48;
const BOUNDARY_COOKIE = "mmd_liff_boundary";
const ALLOWED_STAGES = new Set([
  "diag_script_loaded",
  "sdk_present",
  "sdk_missing",
  "liff_init_called",
  "liff_init_ok",
  "liff_init_error",
  "logged_in_true",
  "logged_in_false",
  "liff_login_called",
  "id_token_called",
  "id_token_present",
  "id_token_absent",
  "runtime_error",
  "boot_alive",
]);

export function isLiffClientDiagnosticPath(url) {
  const path = url.pathname.toLowerCase();
  return path === CLIENT_SCRIPT_PATH || path === CLIENT_DIAG_PATH;
}

export async function handleLiffClientDiagnostic(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname.toLowerCase() === CLIENT_SCRIPT_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
    return new Response(request.method === "HEAD" ? null : CLIENT_SCRIPT, {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const boundaryId = boundaryFromCookie(request.headers.get("cookie"));
  if (!boundaryId) return new Response(null, { status: 204 });

  const stage = normalizeStage(await request.text());
  if (!stage) return new Response(null, { status: 204 });

  const snapshot = {
    boundary_id: boundaryId,
    stage,
    observed_at: new Date().toISOString(),
  };

  try {
    await env?.LIFF_IDENTITY_KV?.put?.(`liff_client_runtime:${boundaryId}:${Date.now()}`, JSON.stringify(snapshot), {
      expirationTtl: TRACE_TTL_SECONDS,
    });
    await env?.LIFF_IDENTITY_KV?.put?.(`liff_client_runtime_latest:${boundaryId}`, JSON.stringify(snapshot), {
      expirationTtl: TRACE_TTL_SECONDS,
    });
  } catch {
    // Diagnostic persistence must never break LIFF runtime.
  }
  console.info({ event: "liff_client_runtime", ...snapshot });
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function decorateLiffShellWithClientDiagnostic(response) {
  if (!(response instanceof Response) || response.status !== 200) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const sdkMarker = '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>';
  if (!html.includes(sdkMarker)) return new Response(html, cloneInit(response));
  const decorated = html.replace(sdkMarker, `<script src="${CLIENT_SCRIPT_PATH}"></script>\n${sdkMarker}`);
  return new Response(decorated, cloneInit(response));
}

function cloneInit(response) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return { status: response.status, statusText: response.statusText, headers };
}

function normalizeStage(value) {
  const stage = String(value || "").trim().toLowerCase();
  return ALLOWED_STAGES.has(stage) ? stage : "";
}

function boundaryFromCookie(header) {
  for (const part of String(header || "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== BOUNDARY_COOKIE) continue;
    const value = rest.join("=").toUpperCase();
    return /^LIFFGET-[A-F0-9]{12}$/.test(value) ? value : "";
  }
  return "";
}

const CLIENT_SCRIPT = String.raw`(() => {
  "use strict";
  const endpoint = "/member/api/liff/client-diag";
  const sent = new Set();
  const emit = (stage) => {
    if (sent.has(stage)) return;
    sent.add(stage);
    try {
      fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
        headers: { "content-type": "text/plain;charset=UTF-8" },
        body: stage,
      }).catch(() => {});
    } catch {}
  };

  emit("diag_script_loaded");
  addEventListener("error", () => emit("runtime_error"));
  addEventListener("unhandledrejection", () => emit("runtime_error"));

  let wrapped = false;
  const wrap = () => {
    if (wrapped || !window.liff) return Boolean(window.liff);
    wrapped = true;
    emit("sdk_present");
    const liff = window.liff;

    if (typeof liff.init === "function") {
      const original = liff.init.bind(liff);
      liff.init = async (...args) => {
        emit("liff_init_called");
        try {
          const result = await original(...args);
          emit("liff_init_ok");
          return result;
        } catch (error) {
          emit("liff_init_error");
          throw error;
        }
      };
    }

    if (typeof liff.isLoggedIn === "function") {
      const original = liff.isLoggedIn.bind(liff);
      liff.isLoggedIn = (...args) => {
        const result = original(...args);
        emit(result ? "logged_in_true" : "logged_in_false");
        return result;
      };
    }

    if (typeof liff.login === "function") {
      const original = liff.login.bind(liff);
      liff.login = (...args) => {
        emit("liff_login_called");
        return original(...args);
      };
    }

    if (typeof liff.getIDToken === "function") {
      const original = liff.getIDToken.bind(liff);
      liff.getIDToken = (...args) => {
        emit("id_token_called");
        const result = original(...args);
        emit(result ? "id_token_present" : "id_token_absent");
        return result;
      };
    }
    return true;
  };

  if (!wrap()) {
    const started = Date.now();
    const timer = setInterval(() => {
      if (wrap()) return clearInterval(timer);
      if (Date.now() - started >= 5000) {
        clearInterval(timer);
        emit("sdk_missing");
      }
    }, 50);
  }
  setTimeout(() => emit("boot_alive"), 2000);
})();`;
