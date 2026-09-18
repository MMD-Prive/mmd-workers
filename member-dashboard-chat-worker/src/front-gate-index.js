import worker from "./index.js";
import { observeKenjiLineWebhook } from "./kenji-ai-worker-line-bridge.mjs";
export { KenjiModelIdempotency } from "./index.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const MEMBER_APP_API_PREFIX = "/api/member/app/";
const THERAPIST_AUTH_PREFIX = "/male-massage/therapists/api/auth/";
const MEMBER_LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const MY_MMD_UI_PREFIX = "/member/my-mmd";
const MY_MMD_ASSET_PREFIX = "/member/my-mmd-assets/";
const MY_MMD_PRESENTATION_ORIGIN = "https://my-mmd-member-profile.lovable.app";
const MEMBER_LIFF_ID = "2010862595-yT4DCEMc";
// LINE MINI App permanent links append only the extra path/query after the LIFF URL.
// Never place /member/liff inside liff.state: the configured Endpoint URL already owns
// /member/liff and LINE would otherwise produce /member/liff/member/liff.
const MY_MMD_LINE_VERIFY_URL = `https://miniapp.line.me/${MEMBER_LIFF_ID}/?intent=status`;
const BROKEN_MY_MMD_LINE_VERIFY_URLS = [
  `https://miniapp.line.me/${MEMBER_LIFF_ID}?liff.state=%2Fmember%2Fliff%3Fintent%3Dstatus`,
  `https://miniapp.line.me/${MEMBER_LIFF_ID}/?liff.state=%2Fmember%2Fliff%3Fintent%3Dstatus`,
];
const PUBLIC_CARE_BACK_PATHS = new Set([
  "/member/api/care-back/public-wish",
  "/member/api/care-back/public-wish/",
  "/member/api/care-back/link-wish",
  "/member/api/care-back/link-wish/",
]);
const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
const MY_MMD_ROUTE_SUFFIXES = ["membership", "points", "coupons", "history", "profile"];

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
    },
  });
}

async function forwardMemberPages(request, env) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) {
    return json({ ok: false, error: { code: "MEMBER_PAGES_UPSTREAM_NOT_CONFIGURED", message: "Member service is unavailable." } }, 503);
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

  function setShellMessage(text) {
    const message = document.getElementById("message");
    if (message) message.textContent = text;
  }

  function clearShellActions() {
    const actions = document.getElementById("actions");
    if (actions) actions.replaceChildren();
    return actions;
  }

  function renderRecovery() {
    if (finished) return;
    finished = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    setShellMessage("ยังยืนยัน Member Session ไม่สำเร็จครับ ลองอีกครั้งได้เลย หรือกลับ My MMD ก่อน");

    const actions = clearShellActions();
    if (!actions) return;

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

  // Lovable remains the presentation source only. Remove its editor badge and
  // analytics bridge from the customer-facing same-origin shell.
  output = output.replace(/<aside\b[^>]*id=["']lovable-badge["'][\s\S]*?<\/aside>/gi, "");
  output = output.replace(/<script\b[^>]*src=["']\/~flock\.js["'][\s\S]*?<\/script>/gi, "");

  // Keep every executable/style asset on mmdbkk.com. ES modules from the
  // Lovable host do not expose CORS headers, so cross-origin module loading is
  // intentionally avoided.
  output = output.replaceAll("/assets/", MY_MMD_ASSET_PREFIX);
  output = output.replaceAll("/favicon.ico", `${MY_MMD_ASSET_PREFIX}favicon.ico`);

  // Lovable SSR renders root-based links. Rewrite the bounded app routes to
  // the canonical same-origin base before hydration takes over.
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

  // Defense in depth for a stale Lovable bundle that encoded the MMD endpoint
  // path inside liff.state. The MINI App URL must carry only additional path/query
  // information; LINE combines that with the configured /member/liff endpoint.
  for (const broken of BROKEN_MY_MMD_LINE_VERIFY_URLS) {
    output = output.replaceAll(broken, MY_MMD_LINE_VERIFY_URL);
  }
  return output;
}

function presentationResponseHeaders(upstreamHeaders, { html = false, rewritten = false } = {}) {
  const headers = new Headers(upstreamHeaders);
  for (const name of ["content-length", "set-cookie", "reporting-endpoints", "report-to", "nel"]) headers.delete(name);
  if (rewritten) {
    // The proxy changes HTML/JS bytes. Upstream representation metadata no
    // longer describes the emitted body and must not survive the rewrite.
    for (const name of ["content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  }
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", "lovable-presentation-proxy");
  headers.set("x-robots-tag", "noindex, nofollow");
  if (html) headers.set("cache-control", "no-store");
  return headers;
}

async function proxyMyMmdPresentation(request, { asset = false } = {}) {
  if (!new Set(["GET", "HEAD"]).has(request.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD", "cache-control": "no-store", "x-mmd-worker": WORKER_NAME },
    });
  }

  const upstreamUrl = asset ? presentationUrlForAsset(request) : presentationUrlForPage(request);
  const upstreamRequest = new Request(upstreamUrl, {
    method: request.method,
    headers: presentationRequestHeaders(request),
    redirect: "follow",
  });
  let upstream;
  try {
    upstream = await globalThis.fetch(upstreamRequest);
  } catch (_) {
    return new Response("My MMD is temporarily unavailable.", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-mmd-worker": WORKER_NAME,
        "x-mmd-route-owner": WORKER_NAME,
      },
    });
  }

  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isHtml = !asset && contentType.includes("text/html");
  const isJavascript = asset && (contentType.includes("javascript") || upstreamUrl.pathname.endsWith(".js"));
  const headers = presentationResponseHeaders(upstream.headers, {
    html: isHtml,
    rewritten: isHtml || isJavascript,
  });

  if (request.method === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (isHtml) {
    return new Response(rewriteMyMmdHtml(await upstream.text()), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  if (isJavascript) {
    return new Response(rewriteMyMmdJavascript(await upstream.text()), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

function recordBridgeTelemetry(result = {}) {
  console.log(JSON.stringify({
    kenji_ai_worker_bridge: "line_observation",
    enabled: result.enabled === true,
    events: Number(result.events) || 0,
    observed: Number(result.observed) || 0,
    succeeded: Number(result.succeeded) || 0,
    evidence_incomplete: Number(result.evidence_incomplete) || 0,
    ok: result.ok === true,
  }));
}

export default {
  async fetch(request, env = {}, ctx) {
    const path = new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
    if (path.startsWith(THERAPIST_AUTH_PREFIX)) return forwardMmsTherapistAuth(request, env);
    if (isMyMmdAssetPath(path)) return proxyMyMmdPresentation(request, { asset: true });
    if (isMyMmdUiPath(path)) return proxyMyMmdPresentation(request);
    if (PUBLIC_CARE_BACK_PATHS.has(path) || path.startsWith(MEMBER_APP_API_PREFIX)) {
      return forwardMemberPages(request, env);
    }

    const shouldObserveLine = request.method === "POST" && LINE_WEBHOOK_PATHS.has(path);
    const observerRequest = shouldObserveLine ? request.clone() : null;
    const response = await worker.fetch(request, env, ctx);

    // The core LINE handler owns signature verification. Observe only after it
    // accepts the signed webhook. This is a read-only shadow call and never
    // changes customer replies, payment truth, membership, points, or access.
    if (observerRequest && response.ok) {
      const observation = observeKenjiLineWebhook({ request: observerRequest, env })
        .then((result) => {
          recordBridgeTelemetry(result);
          return result;
        })
        .catch(() => {
          recordBridgeTelemetry({ ok: false, enabled: true, events: 0, observed: 0, succeeded: 0, evidence_incomplete: 0 });
        });
      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(observation);
      else await observation;
    }

    return maybeReturnStatusLiffToMyMmd(request, response);
  },
};
