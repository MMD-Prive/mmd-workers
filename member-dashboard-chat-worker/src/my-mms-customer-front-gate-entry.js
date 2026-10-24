import currentWorker from "./mms-line-front-gate.js";
import { maybeHandleTherapistWorkspace, THERAPIST_AI_LOGO_PATH } from "./mms-therapist-workspace.js";
import { isMmsMembershipRequest, isMmsMembershipOriginPassthrough, proxyMmsMembership } from './mms-membership-front-gate.js';
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
const CUSTOMER_MATCHING_PATH = "/male-massage/therapists";
const CUSTOMER_MATCHING_MODE_PARAM = "mms_customer_ai";

function isCustomerMatchingPageRequest(request) {
  const url = new URL(request.url);
  return url.pathname.replace(/\/$/, "") === CUSTOMER_MATCHING_PATH
    && ["true", "1"].includes(url.searchParams.get(CUSTOMER_MATCHING_MODE_PARAM));
}

// The Cloudflare callback route must end in * to match query strings. Keep
// unrelated public pages (and prefix lookalikes) on their original web origin.
export function isTherapistOriginPassthroughRequest(request) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  const prefix = "/male-massage/therapists";
  if (!path.startsWith(prefix)) return false;
  if ([prefix, `${prefix}/login`, `${prefix}/me`, `${prefix}/app`, THERAPIST_AI_LOGO_PATH].includes(path)) return false;
  if (path.startsWith(`${prefix}/api/auth/`) || path.startsWith(`${prefix}/api/app/`)) return false;
  if (path === `${prefix}/app/chat`) return false;
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
    if (isMmsMembershipRequest(request)) return proxyMmsMembership(request, env);
    if (isMmsMembershipOriginPassthrough(request)) return globalThis.fetch(request);
    // The bare path is the Therapist LIFF endpoint. Only the customer AI link
    // carries this discriminator, so direct loads/reloads reach the customer UI
    // without taking ownership away from Therapist login.
    if (isCustomerMatchingPageRequest(request)) return handleMyMmsCustomerUi(request, env);
    if (isTherapistOriginPassthroughRequest(request)) return globalThis.fetch(request);
    const therapistPage = await maybeHandleTherapistWorkspace(request, env);
    if (therapistPage) return therapistPage;
    if (MEDICAL_REQUEST_PATHS.has(new URL(request.url).pathname)) return proxyMedicalRequest(request, env);
    if (isMyMmsCustomerApiRequest(request)) return handleMyMmsCustomerApi(request, env);
    if (isMyMmsCustomerAssetRequest(request)) return handleMyMmsCustomerAsset(request, env);
    if (isMyMmsCustomerUiRequest(request)) return handleMyMmsCustomerUi(request, env);
    // The root wildcard is required for LINE query strings. All paths outside
    // the bounded app, membership and Therapist handlers keep their web origin.
    const path = new URL(request.url).pathname;
    if (path.startsWith("/male-massage") && !path.startsWith("/male-massage/therapists")) return globalThis.fetch(request);
    return currentWorker.fetch(request, env, ctx);
  },
};
