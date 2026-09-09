import { handleMemberProfile } from "./liff-identity-foundation.js";

const PATHS = new Set(["/member/api/mms/prebookings", "/member/api/liff/mms/prebookings"]);

export function isMmsMemberPrebookingReadPath(urlOrPath = "") {
  const path = normalizePath(typeof urlOrPath === "string" ? urlOrPath : urlOrPath?.pathname);
  return PATHS.has(path);
}

export async function handleMmsMemberPrebookingRead(request, env = {}) {
  if (request.method !== "GET") return methodNotAllowed("GET");

  const profileResponse = await handleMemberProfile(request, env);
  if (!profileResponse.ok) return profileResponse;

  const profilePayload = await profileResponse.json().catch(() => null);
  const memberRef = verifiedMemberRef(profilePayload);
  if (!memberRef) {
    return responseWithProfileHeaders(profileResponse, {
      ok: false,
      error: { code: "MMS_MEMBER_REQUIRED", message: "Verified MMD membership is required." },
    }, 403);
  }
  if (!env.MMS_WORKER?.fetch) {
    return responseWithProfileHeaders(profileResponse, {
      ok: false,
      error: { code: "MMS_UPSTREAM_NOT_CONFIGURED", message: "MMS service is temporarily unavailable." },
    }, 503);
  }

  try {
    const upstream = await env.MMS_WORKER.fetch(new Request(
      `https://mms.internal/internal/mms/member/prebookings?member_ref=${encodeURIComponent(memberRef)}`,
      { method: "GET", headers: { accept: "application/json" } },
    ));
    const payload = await upstream.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return responseWithProfileHeaders(profileResponse, {
        ok: false,
        error: { code: "MMS_UPSTREAM_INVALID", message: "MMS service returned an invalid response." },
      }, 502);
    }
    return responseWithProfileHeaders(profileResponse, payload, upstream.status);
  } catch {
    return responseWithProfileHeaders(profileResponse, {
      ok: false,
      error: { code: "MMS_UPSTREAM_UNAVAILABLE", message: "MMS service is temporarily unavailable." },
    }, 502);
  }
}

function verifiedMemberRef(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const nested = data?.customer_360?.member?.member_id;
  const value = String(data.member_id || nested || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$/.test(value) ? value : "";
}

function responseWithProfileHeaders(profileResponse, payload, status) {
  const headers = new Headers(profileResponse.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.delete("content-length");
  return new Response(JSON.stringify(payload), { status, headers });
}

function normalizePath(path = "") {
  const clean = String(path || "/").replace(/\/{2,}/g, "/");
  return clean.length > 1 ? clean.replace(/\/+$/g, "") : clean;
}
function methodNotAllowed(allow) {
  return new Response(null, { status: 405, headers: { allow } });
}
