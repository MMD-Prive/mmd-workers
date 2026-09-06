import currentWorker from "./my-mmd-lovable-app-front-gate.js";
export { KenjiModelIdempotency } from "./my-mmd-lovable-app-front-gate.js";

const STATUS_UI_MODE_HEADER = "x-mmd-liff-ui-mode";
const STATUS_UI_MODE = "auth-bridge-only";
const HARD_TIMEOUT_MS = 12_000;
const MANUAL_RETRY_WINDOW_MS = 120_000;
const SESSION_STATUS_ENDPOINT = "/member/api/liff/status";
const PENDING_WISH_COOKIE = "mmd_care_back_wish_link";
const PENDING_WISH_BRIDGE_PATH = "/my-mmd-assets/care-back-wish-link.js";
const PENDING_WISH_LINK_ENDPOINT = "/member/api/care-back/link-wish";

function normalizedPath(request) {
  return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
}

function isMyMmdPageRequest(request) {
  const path = normalizedPath(request);
  return path === "/my-mmd" || path === "/my-mmd/" || path.startsWith("/my-mmd/");
}

function pendingWishBridgeJavascript() {
  return `(() => {
  "use strict";
  const COOKIE = "${PENDING_WISH_COOKIE}";
  const ENDPOINT = "${PENDING_WISH_LINK_ENDPOINT}";
  const RELOAD_KEY = "mmd_care_back_wish_coupon_linked_v1";

  function tokenFromCookie() {
    for (const part of String(document.cookie || "").split(";")) {
      const item = part.trim();
      if (!item.startsWith(COOKIE + "=")) continue;
      const token = item.slice(COOKIE.length + 1);
      return /^pw_[A-Za-z0-9_-]{20,200}$/.test(token) ? token : "";
    }
    return "";
  }

  function clearCookie() {
    document.cookie = COOKIE + "=; Max-Age=0; Path=/; Secure; SameSite=Lax";
  }

  async function linkPendingWish() {
    const token = tokenFromCookie();
    if (!token) return;
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ wish_link_token: token }),
      });
    } catch {
      return;
    }

    if (response.status === 401) return;
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.ok === true && payload?.linked === true) {
      clearCookie();
      document.dispatchEvent(new CustomEvent("mmd:care-back:coupon-linked", {
        detail: {
          state: String(payload?.coupon?.state || ""),
          code: String(payload?.coupon?.code || ""),
          maxDiscountPercent: Number(payload?.coupon?.max_discount_percent || 0) || null,
        },
      }));
      try {
        if (window.sessionStorage.getItem(RELOAD_KEY) !== "1") {
          window.sessionStorage.setItem(RELOAD_KEY, "1");
          window.location.reload();
        }
      } catch {}
      return;
    }

    const code = String(payload?.error?.code || "");
    if (response.status === 400 || response.status === 404 || code.endsWith("CONFLICT")) clearCookie();
  }

  void linkPendingWish();
})();`;
}

function pendingWishBridgeResponse(request) {
  return new Response(request.method === "HEAD" ? null : pendingWishBridgeJavascript(), {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-content-type-options": "nosniff",
      "x-mmd-care-back-wish-bridge": "verified-coupon-v1",
    },
  });
}

async function applyPendingWishBridge(request, response) {
  if (request.method === "HEAD" || !response.ok || !isMyMmdPageRequest(request)) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;
  const html = await response.text();
  if (!html.includes("</body>") || html.includes(`src="${PENDING_WISH_BRIDGE_PATH}"`)) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const rewritten = html.replace("</body>", `<script src="${PENDING_WISH_BRIDGE_PATH}" defer></script></body>`);
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-care-back-wish-bridge", "verified-coupon-v1");
  return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
}

function hardTimeoutGate(nonce) {
  return `<script nonce="${nonce}" id="mmd-status-hard-timeout-gate">
(() => {
  const HARD_TIMEOUT_MS = ${HARD_TIMEOUT_MS};
  const MANUAL_RETRY_WINDOW_MS = ${MANUAL_RETRY_WINDOW_MS};
  const RETRY_KEY = "mmd_status_manual_retry_at_v1";
  const actions = document.getElementById("actions");
  if (!actions) return;

  const recentManualRetry = () => {
    try {
      const value = Number(window.sessionStorage.getItem(RETRY_KEY) || 0);
      return Number.isFinite(value) && value > 0 && (Date.now() - value) < MANUAL_RETRY_WINDOW_MS;
    } catch {
      return false;
    }
  };

  const recordManualRetry = () => {
    try { window.sessionStorage.setItem(RETRY_KEY, String(Date.now())); } catch {}
  };

  const timer = window.setTimeout(() => {
    const body = document.body;
    if (!body || actions.childElementCount > 0) return;

    body.classList.add("mmd-status-recovery");
    const retryAlreadyUsed = recentManualRetry();

    const message = document.getElementById("message");
    if (message) {
      message.textContent = retryAlreadyUsed
        ? "การตรวจสอบรอบนี้ยังไม่สำเร็จครับ ระบบจะไม่วนยืนยันซ้ำเอง กลับ My MMD เพื่อดูสถานะล่าสุดได้เลย"
        : "ยังยืนยัน LINE Session ไม่สำเร็จครับ ตรวจสถานะอีกครั้งได้หนึ่งรอบ หรือกลับ My MMD ก่อน";
    }

    const veil = document.getElementById("mmd-status-bridge-veil");
    if (veil) {
      veil.setAttribute("role", "alert");
      veil.setAttribute("aria-label", "ยังยืนยัน LINE Session ไม่สำเร็จ");
    }

    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "กลับ My MMD";
    back.addEventListener("click", () => window.location.replace("/my-mmd/"));

    if (retryAlreadyUsed) {
      actions.replaceChildren(back);
      return;
    }

    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "ตรวจสถานะอีกครั้ง";
    retry.addEventListener("click", () => {
      if (recentManualRetry()) return;
      retry.disabled = true;
      recordManualRetry();
      window.location.reload();
    });

    actions.replaceChildren(retry, back);
  }, HARD_TIMEOUT_MS);

  new MutationObserver(() => {
    if (actions.childElementCount > 0) window.clearTimeout(timer);
  }).observe(actions, { childList: true });
})();
</script>`;
}

function rewriteSessionVerificationBridge(html) {
  let output = String(html || "");

  // The auth bridge must verify that the signed LINE session exists, not that a
  // canonical Member row already exists. New and legacy-only customers are
  // valid My MMD lifecycle states and must be allowed through after LINE auth.
  output = output.replace(
    /const profileEndpoint = ["']\/member\/api\/liff\/profile["'];/,
    `const statusEndpoint = "${SESSION_STATUS_ENDPOINT}";`,
  );
  output = output.replace(/fetch\(profileEndpoint,/g, "fetch(statusEndpoint,");
  output = output.replaceAll("Member Session", "LINE Session");
  return output;
}

async function applyBoundedStatusRecovery(request, response) {
  if (request.method === "HEAD" || !response.ok) return response;
  if (response.headers.get(STATUS_UI_MODE_HEADER) !== STATUS_UI_MODE) return response;

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const html = rewriteSessionVerificationBridge(await response.text());
  if (html.includes('id="mmd-status-hard-timeout-gate"')) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const nonceMatch = html.match(/<script\b[^>]*\bnonce=["']([^"']+)["']/i);
  if (!nonceMatch || !html.includes("</body>")) {
    const headers = new Headers(response.headers);
    for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
    headers.set("x-mmd-liff-session-check", "status-v1");
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const rewritten = html.replace("</body>", `${hardTimeoutGate(nonceMatch[1])}</body>`);
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-liff-recovery-gate", "hard-timeout-v2-one-retry");
  headers.set("x-mmd-liff-hard-timeout-ms", String(HARD_TIMEOUT_MS));
  headers.set("x-mmd-liff-manual-retry-window-ms", String(MANUAL_RETRY_WINDOW_MS));
  headers.set("x-mmd-liff-session-check", "status-v1");

  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env = {}, ctx) {
    if (normalizedPath(request) === PENDING_WISH_BRIDGE_PATH) return pendingWishBridgeResponse(request);
    let response = await currentWorker.fetch(request, env, ctx);
    response = await applyPendingWishBridge(request, response);
    return applyBoundedStatusRecovery(request, response);
  },
};
