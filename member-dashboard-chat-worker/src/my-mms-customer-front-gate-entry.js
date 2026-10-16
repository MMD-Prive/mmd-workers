import currentWorker from "./mms-line-front-gate.js";
import { maybeHandleTherapistWorkspace } from "./mms-therapist-workspace.js";
import {
  handleMyMmsCustomerApi,
  handleMyMmsCustomerAsset,
  handleMyMmsCustomerUi,
  isMyMmsCustomerApiRequest,
  isMyMmsCustomerAssetRequest,
  isMyMmsCustomerUiRequest,
} from "./my-mms-customer-app-front-gate.js";

export * from "./mms-line-front-gate.js";
export { KenjiShadowReceipt } from "./kenji-line-shadow-receipt.mjs";
export { SvipPhotoRevealModeAudit } from "./svip-photo-reveal-mode-audit.mjs";

const MEDICAL_REQUEST_PATHS = new Set(["/api/member/medical-request", "/api/member/medical-request/"]);

// The Cloudflare callback route must end in * to match query strings. Keep
// unrelated public pages (and prefix lookalikes) on their original web origin.
export function isTherapistOriginPassthroughRequest(request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  const prefix = "/male-massage/therapists";
  if (!path.startsWith(prefix)) return false;
  if ([prefix, `${prefix}/login`, `${prefix}/me`, `${prefix}/app`].includes(path)) return false;
  if (path.startsWith(`${prefix}/api/auth/`) || path.startsWith(`${prefix}/api/app/`)) return false;
  return true;
}

async function proxyMedicalRequest(request, env) {
  if (!env.MEMBER_PAGES_WORKER?.fetch) {
    return Response.json({ ok: false, error: { code: "LIFF_UPSTREAM_NOT_CONFIGURED" } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const upstream = await env.MEMBER_PAGES_WORKER.fetch(new Request(request.url, request));
  const headers = new Headers(upstream.headers);
  headers.set("x-mmd-worker", "member-dashboard-chat-worker");
  headers.set("x-mmd-route-owner", "member-dashboard-chat-worker");
  headers.set("x-mmd-upstream-service", "member-pages-worker");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export default {
  ...currentWorker,
  async fetch(request, env = {}, ctx) {
    if (isTherapistOriginPassthroughRequest(request)) return globalThis.fetch(request);
    const therapistPage = await maybeHandleTherapistWorkspace(request, env);
    if (therapistPage) return therapistPage;
    if (MEDICAL_REQUEST_PATHS.has(new URL(request.url).pathname)) return proxyMedicalRequest(request, env);
    if (isMyMmsCustomerApiRequest(request)) return handleMyMmsCustomerApi(request, env);
    if (isMyMmsCustomerAssetRequest(request)) return handleMyMmsCustomerAsset(request);
    if (isMyMmsCustomerUiRequest(request)) return handleMyMmsCustomerUi(request);
    return currentWorker.fetch(request, env, ctx);
  },
};
