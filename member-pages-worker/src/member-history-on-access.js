import { scheduleMemberHistoryRecoveryForSessionToken } from "./member-history-recovery.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const ACCESS_DEDUPE_TTL_SECONDS = 5 * 60;
const ACCESS_MARKER_PREFIX = "history-recovery:on-access:v1:";

export function isMemberHistoryOnAccessPath(requestOrUrl) {
  let url;
  try {
    url = requestOrUrl instanceof URL
      ? requestOrUrl
      : new URL(requestOrUrl instanceof Request ? requestOrUrl.url : String(requestOrUrl));
  } catch {
    return false;
  }
  const path = url.pathname.replace(/\/{2,}/g, "/");
  return path.startsWith("/api/member/app/")
    || path === "/member/api/liff/profile"
    || path === "/member/api/liff/profile/";
}

export async function ensureMemberHistoryRecoveryOnAccess(
  request,
  env = {},
  ctx,
  { scheduler = scheduleMemberHistoryRecoveryForSessionToken } = {},
) {
  if (!(request instanceof Request) || !isMemberHistoryOnAccessPath(request)) return false;
  if (!env.LIFF_IDENTITY_KV?.get || !env.LIFF_IDENTITY_KV?.put) return false;

  const token = requestCookieValue(request, SESSION_COOKIE);
  if (!token) return false;

  const markerKey = `${ACCESS_MARKER_PREFIX}${await sha24(token)}`;
  const existing = await env.LIFF_IDENTITY_KV.get(markerKey).catch(() => null);
  if (existing) return false;

  await env.LIFF_IDENTITY_KV.put(markerKey, "1", { expirationTtl: ACCESS_DEDUPE_TTL_SECONDS });
  const scheduled = await scheduler(token, env, ctx, "member_app_access");
  if (scheduled) return true;

  if (env.LIFF_IDENTITY_KV?.delete) await env.LIFF_IDENTITY_KV.delete(markerKey).catch(() => {});
  return false;
}

function requestCookieValue(request, name) {
  const raw = String(request.headers.get("cookie") || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0 || part.slice(0, index).trim() !== name) continue;
    return safeToken(part.slice(index + 1).trim());
  }
  return "";
}

function safeToken(value) {
  const token = String(value || "").trim();
  return token.length > 0 && token.length <= 8192 && /^[A-Za-z0-9._~-]+$/.test(token) ? token : "";
}

async function sha24(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

export const __test = Object.freeze({
  requestCookieValue,
  safeToken,
  sha24,
  ACCESS_DEDUPE_TTL_SECONDS,
});
