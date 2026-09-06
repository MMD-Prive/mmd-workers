import currentWorker from "./my-mmd-lovable-app-front-gate.js";
export { KenjiModelIdempotency } from "./my-mmd-lovable-app-front-gate.js";

const STATUS_UI_MODE_HEADER = "x-mmd-liff-ui-mode";
const STATUS_UI_MODE = "auth-bridge-only";
const HARD_TIMEOUT_MS = 12_000;
const MANUAL_RETRY_WINDOW_MS = 120_000;

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
        : "ยังยืนยันข้อมูลสมาชิกไม่ได้ครับ ตรวจสถานะอีกครั้งได้หนึ่งรอบ หรือกลับ My MMD ก่อน";
    }

    const veil = document.getElementById("mmd-status-bridge-veil");
    if (veil) {
      veil.setAttribute("role", "alert");
      veil.setAttribute("aria-label", "ยังยืนยันข้อมูลสมาชิกไม่ได้");
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

async function applyBoundedStatusRecovery(request, response) {
  if (request.method === "HEAD" || !response.ok) return response;
  if (response.headers.get(STATUS_UI_MODE_HEADER) !== STATUS_UI_MODE) return response;

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  if (html.includes('id="mmd-status-hard-timeout-gate"')) return response;

  const nonceMatch = html.match(/<script\b[^>]*\bnonce=["']([^"']+)["']/i);
  if (!nonceMatch || !html.includes("</body>")) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const rewritten = html.replace("</body>", `${hardTimeoutGate(nonceMatch[1])}</body>`);
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-liff-recovery-gate", "hard-timeout-v2-one-retry");
  headers.set("x-mmd-liff-hard-timeout-ms", String(HARD_TIMEOUT_MS));
  headers.set("x-mmd-liff-manual-retry-window-ms", String(MANUAL_RETRY_WINDOW_MS));

  return new Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env = {}, ctx) {
    const response = await currentWorker.fetch(request, env, ctx);
    return applyBoundedStatusRecovery(request, response);
  },
};
