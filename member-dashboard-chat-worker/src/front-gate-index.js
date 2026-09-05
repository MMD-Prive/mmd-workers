import { buildLineWebhookResponse } from "./line-webhook.js";
import { publishRichMenu } from "./rich-menu-publisher.js";
import { KenjiModelIdempotency } from "./kenji-model-idempotency.js";
import { handleKenjiModelAccess } from "./kenji-model-access.js";
import { createKenjiAiWorkerLineBridge } from "./kenji-ai-worker-line-bridge.mjs";

export { KenjiModelIdempotency };

const WORKER_NAME = "member-dashboard-chat-worker";
const MY_MMD_UI_PREFIX = "/member/my-mmd";
const MY_MMD_ASSET_PREFIX = "/member/my-mmd-assets/";
const MY_MMD_PRESENTATION_ORIGIN = "https://my-mmd-member-profile.lovable.app";
const MEMBER_LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const MY_MMD_ROUTE_SUFFIXES = ["profile", "membership", "points", "coupons", "history"];
const MY_MMD_LINE_VERIFY_URL = "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status";
const BROKEN_MY_MMD_LINE_VERIFY_URLS = [
  "https://miniapp.line.me/2010862595-yT4DCEMc?liff.state=%2Fmember%2Fliff%3Fintent%3Dstatus",
  "https://miniapp.line.me/2010862595-yT4DCEMc/?liff.state=%2Fmember%2Fliff%3Fintent%3Dstatus",
];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function normalizedPath(request) {
  return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
}

async function forwardMemberPages(request, env) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) {
    return json({ ok: false, error: { code: "MEMBER_PAGES_UPSTREAM_NOT_CONFIGURED", message: "Member access is unavailable." } }, 503);
  }
  const upstreamResponse = await env.MEMBER_PAGES_WORKER.fetch(new Request(request.url, request));
  const headers = new Headers(upstreamResponse.headers);
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-upstream-service", "member-pages-worker");
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

async function forwardMmsTherapistAuth(request, env) {
  if (!env.MMS_WORKER?.fetch) {
    return json({ ok: false, error: { code: "MMS_THERAPIST_AUTH_UPSTREAM_NOT_CONFIGURED", message: "Therapist access is unavailable." } }, 503);
  }

  const upstreamResponse = await env.MMS_WORKER.fetch(new Request(request.url, request));
  const headers = new Headers(upstreamResponse.headers);
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-upstream-service", "mms-worker");
  headers.set("cache-control", "no-store, private, max-age=0");
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

function isStatusLiffShellRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase().replace(/\/{2,}/g, "/");
  if (!MEMBER_LIFF_SHELL_PATHS.has(path)) return false;
  const intent = String(url.searchParams.get("intent") || url.searchParams.get("liff_intent") || "").trim().toLowerCase();
  const campaign = String(url.searchParams.get("campaign") || "").trim().toLowerCase();
  return intent === "status" && !campaign;
}

function injectStatusReturnBridge(html) {
  const source = String(html || "");
  const nonceMatch = source.match(/<script\b[^>]*\bnonce=["']([^"']+)["']/i);
  if (!nonceMatch || !source.includes("</body>")) return source;

  const nonce = nonceMatch[1];
  const bridge = `<script nonce="${nonce}">
(() => {
  const target = "/member/my-mmd";
  const profileEndpoint = "/member/api/liff/profile";
  const maxAttempts = 20;
  let attempts = 0;
  let finished = false;
  let retryTimer = 0;

  function setRecoveryState(active) {
    document.body?.classList.toggle("mmd-status-recovery", active === true);
  }

  function setShellMessage(text) {
    const message = document.getElementById("message");
    if (message) message.textContent = text;
  }

  function clearShellActions() {
    setRecoveryState(false);
    const actions = document.getElementById("actions");
    if (actions) actions.replaceChildren();
    return actions;
  }

  function renderRecovery() {
    if (finished) return;
    finished = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    setRecoveryState(true);
    setShellMessage("ยังยืนยัน Member Session ไม่สำเร็จครับ ลองอีกครั้งได้เลย หรือกลับ My MMD ก่อน");

    const actions = document.getElementById("actions");
    if (!actions) return;
    actions.replaceChildren();

    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "ลองยืนยันอีกครั้ง";
    retry.addEventListener("click", () => {
      attempts = 0;
      finished = false;
      clearShellActions();
      setShellMessage("กำลังตรวจสอบ Member Session อีกครั้งครับ");
      retryTimer = window.setTimeout(verifyAndReturn, 250);
    });

    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "กลับ My MMD";
    back.addEventListener("click", () => window.location.replace(target));

    actions.append(retry, back);
  }

  async function verifyAndReturn() {
    if (finished) return;
    setRecoveryState(false);
    attempts += 1;
    setShellMessage(attempts === 1 ? "กำลังตรวจสอบ Member Session ครับ" : "กำลังตรวจสอบ Member Session อีกครั้งครับ");
    try {
      const response = await fetch(profileEndpoint, {
        method: "GET",
        credentials: "same-origin",
        headers: { "accept": "application/json" }
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload && payload.ok === true) {
        finished = true;
        if (retryTimer) window.clearTimeout(retryTimer);
        window.location.replace(target);
        return;
      }
    } catch (_) {}

    if (finished) return;
    if (attempts < maxAttempts) {
      retryTimer = window.setTimeout(verifyAndReturn, 650);
      return;
    }
    renderRecovery();
  }

  retryTimer = window.setTimeout(verifyAndReturn, 250);
})();
</script>`;

  return source.replace("</body>", `${bridge}</body>`);
}

async function maybeReturnStatusLiffToMyMmd(request, response) {
  if (!isStatusLiffShellRequest(request) || request.method === "HEAD" || !response.ok) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const rewritten = injectStatusReturnBridge(html);
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-liff-return-bridge", "my-mmd-status-v1");
  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isMyMmdUiPath(path) {
  return path === MY_MMD_UI_PREFIX || path === `${MY_MMD_UI_PREFIX}/` || path.startsWith(`${MY_MMD_UI_PREFIX}/`);
}

function isMyMmdAssetPath(path) {
  return path.startsWith(MY_MMD_ASSET_PREFIX);
}

function presentationRequestHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "if-none-match", "if-modified-since", "range", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function presentationUrlForPage(request) {
  const source = new URL(request.url);
  const suffix = source.pathname.slice(MY_MMD_UI_PREFIX.length);
  const upstream = new URL(MY_MMD_PRESENTATION_ORIGIN);
  upstream.pathname = suffix || "/";
  upstream.search = source.search;
  return upstream;
}

function presentationUrlForAsset(request) {
  const source = new URL(request.url);
  const suffix = source.pathname.slice(MY_MMD_ASSET_PREFIX.length);
  const upstream = new URL(MY_MMD_PRESENTATION_ORIGIN);
  upstream.pathname = suffix === "favicon.ico" ? "/favicon.ico" : `/assets/${suffix}`;
  upstream.search = source.search;
  return upstream;
}

function rewriteMyMmdHtml(html) {
  let output = String(html || "");

  output = output.replace(/<aside\b[^>]*id=["']lovable-badge["'][\s\S]*?<\/aside>/gi, "");
  output = output.replace(/<script\b[^>]*src=["']\/~flock\.js["'][\s\S]*?<\/script>/gi, "");
  output = output.replaceAll("/assets/", MY_MMD_ASSET_PREFIX);
  output = output.replaceAll("/favicon.ico", `${MY_MMD_ASSET_PREFIX}favicon.ico`);
  output = output.replace(/href=["']\/["']/g, `href="${MY_MMD_UI_PREFIX}"`);
  for (const suffix of MY_MMD_ROUTE_SUFFIXES) {
    output = output.replace(new RegExp(`href=["']\\/${suffix}(?:\\/)?["']`, "g"), `href="${MY_MMD_UI_PREFIX}/${suffix}"`);
  }
  return output;
}

function rewriteMyMmdJavascript(source) {
  let output = String(source || "")
    .replace(/(["'`])\/assets\//g, `$1${MY_MMD_ASSET_PREFIX}`)
    .replace(/(["'`])assets\//g, `$1member/my-mmd-assets/`);

  for (const broken of BROKEN_MY_MMD_LINE_VERIFY_URLS) {
    output = output.replaceAll(broken, MY_MMD_LINE_VERIFY_URL);
  }
  return output;
}

async function proxyPresentationPage(request) {
  const upstreamUrl = presentationUrlForPage(request);
  const upstream = await fetch(upstreamUrl, { headers: presentationRequestHeaders(request) });
  const headers = new Headers(upstream.headers);
  headers.delete("set-cookie");
  headers.delete("content-length");
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", "lovable-presentation-proxy");
  headers.set("x-robots-tag", "noindex, nofollow");
  const contentType = String(headers.get("content-type") || "").toLowerCase();
  if (request.method === "HEAD" || !contentType.includes("text/html")) {
    return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
  }
  const html = rewriteMyMmdHtml(await upstream.text());
  for (const name of ["content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  return new Response(html, { status: upstream.status, headers });
}

async function proxyPresentationAsset(request) {
  const upstreamUrl = presentationUrlForAsset(request);
  const upstream = await fetch(upstreamUrl, { headers: presentationRequestHeaders(request) });
  const headers = new Headers(upstream.headers);
  headers.delete("set-cookie");
  headers.delete("content-length");
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", "lovable-presentation-proxy");
  headers.set("x-robots-tag", "noindex, nofollow");
  const contentType = String(headers.get("content-type") || "").toLowerCase();
  const isJavascript = contentType.includes("javascript") || upstreamUrl.pathname.endsWith(".js");
  if (request.method === "HEAD" || !isJavascript) {
    return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
  }
  const source = rewriteMyMmdJavascript(await upstream.text());
  for (const name of ["content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  return new Response(source, { status: upstream.status, headers });
}

const handler = {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    const path = normalizedPath(request);

    if (path === "/health") return json({ ok: true, worker: WORKER_NAME });
    if (path === "/webhooks/line" && request.method === "GET") return json({ ok: true, worker: WORKER_NAME, route: "line_webhook" });
    if (path === "/webhooks/line" && request.method === "POST") return buildLineWebhookResponse(request, env, ctx);

    if (path.startsWith("/male-massage/therapists/api/auth/")) return forwardMmsTherapistAuth(request, env);

    if (path.startsWith("/member/api/") || path.startsWith("/api/member/")) return forwardMemberPages(request, env);
    if (MEMBER_LIFF_SHELL_PATHS.has(path)) {
      const response = await forwardMemberPages(request, env);
      return maybeReturnStatusLiffToMyMmd(request, response);
    }

    if (isMyMmdUiPath(path)) {
      if (!new Set(["GET", "HEAD"]).has(request.method)) return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
      return proxyPresentationPage(request);
    }
    if (isMyMmdAssetPath(path)) {
      if (!new Set(["GET", "HEAD"]).has(request.method)) return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
      return proxyPresentationAsset(request);
    }

    if (path === "/internal/rich-menu/publish") return publishRichMenu(request, env);
    if (path === "/internal/kenji/model-access") return handleKenjiModelAccess(request, env);
    if (path === "/internal/kenji/ai-worker-line") return createKenjiAiWorkerLineBridge(request, env);

    return json({ ok: false, error: { code: "NOT_FOUND", path: url.pathname } }, 404);
  },
};

export default handler;
