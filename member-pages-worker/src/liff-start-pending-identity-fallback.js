const LIFF_START_PATH = "/member/api/liff/start";
const RESOLUTION_FAILURE_CODE = "MEMBER_RESOLUTION_FAILED";
const FALLBACK_HEADER = "x-mmd-liff-start-fallback";
const FALLBACK_VALUE = "pending-identity-v1";

export function isRecoverableLiffStartResolutionFailure(request, response, payload) {
  if (!(request instanceof Request) || !(response instanceof Response)) return false;
  let path = "";
  try { path = new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/"); } catch { return false; }
  return request.method === "POST"
    && path === LIFF_START_PATH
    && response.status === 503
    && payload?.ok === false
    && payload?.error?.code === RESOLUTION_FAILURE_CODE;
}

export function withPendingIdentityOnlyResolver(env = {}) {
  const fallbackResolver = {
    async fetch() {
      return new Response(JSON.stringify({
        ok: true,
        data: {
          member_exists: false,
          member_id: null,
          profile: null,
          resolution: "pending_identity",
          grants: {
            membership: false,
            points: false,
            payment_status: false,
            private_access: false,
          },
        },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-mmd-member-resolution-fallback": FALLBACK_VALUE,
        },
      });
    },
  };
  return Object.assign({}, env, { MEMBER_STATUS_RESOLVER: fallbackResolver });
}

export async function recoverVerifiedLiffStartAsPendingIdentity({
  request,
  response,
  payload,
  worker,
  env,
  ctx,
} = {}) {
  if (!isRecoverableLiffStartResolutionFailure(request, response, payload)) return response;
  if (!worker?.fetch) return response;

  // The first start request already reached MEMBER_RESOLUTION_FAILED, which is
  // emitted only after LINE ID-token verification. The retry still runs the
  // complete start handler and therefore verifies the LINE token again. Only
  // the unavailable member resolver is replaced with an explicit no-member
  // result so a host-only LIFF session can be issued without granting access.
  let retry;
  try {
    retry = await worker.fetch(request.clone(), withPendingIdentityOnlyResolver(env), ctx);
  } catch {
    return response;
  }
  if (!(retry instanceof Response) || !retry.ok) return response;

  const contentType = String(retry.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const retryPayload = await retry.clone().json().catch(() => null);
  const data = retryPayload?.data;
  const grants = data?.grants && typeof data.grants === "object" ? data.grants : {};
  const anyGrant = Object.values(grants).some((value) => value === true);
  if (
    retryPayload?.ok !== true
    || data?.pending_identity !== true
    || data?.member_resolved === true
    || anyGrant
  ) {
    return response;
  }

  const headers = new Headers(retry.headers);
  headers.set(FALLBACK_HEADER, FALLBACK_VALUE);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  return new Response(retry.body, {
    status: retry.status,
    statusText: retry.statusText,
    headers,
  });
}
