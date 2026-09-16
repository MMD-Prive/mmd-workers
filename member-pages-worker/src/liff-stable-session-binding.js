import liffFoundation from "./liff-payment-binding.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const READ_GRACE_MS = 30_000;
const KV_GRACE_TTL_SECONDS = 60;
const MIN_KV_TTL_SECONDS = 60;
const MAX_SESSION_TTL_SECONDS = 15 * 60;

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function isRotatingSessionPath(request) {
  if (!(request instanceof Request)) return false;
  let path;
  try { path = normalizePath(new URL(request.url).pathname).toLowerCase(); } catch { return false; }
  if (path === "/member/api/liff/mms/history") return false;
  return path === "/api/member/dashboard" || path.startsWith("/member/api/liff/");
}

function cookieValue(request, name) {
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function responseCookieValue(response, name) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  for (const cookie of cookies) {
    const first = String(cookie || "").split(";", 1)[0];
    const index = first.indexOf("=");
    if (index <= 0 || first.slice(0, index) !== name) continue;
    return first.slice(index + 1).trim();
  }
  return "";
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sessionKey(env, token) {
  const secret = String(env.LIFF_SESSION_SECRET || "").trim();
  if (secret.length < 32 || !token) return "";
  return `liff:session:${await hmacHex(secret, `session:${token}`)}`;
}

async function readSnapshot(request, env) {
  if (!env.LIFF_IDENTITY_KV?.get || !isRotatingSessionPath(request)) return null;
  const token = cookieValue(request, SESSION_COOKIE);
  const key = await sessionKey(env, token);
  if (!key) return null;
  try {
    const session = await env.LIFF_IDENTITY_KV.get(key, "json");
    if (!session || typeof session !== "object" || Number(session.expires_at || 0) <= Date.now()) return null;
    if (session.read_grace_only === true && Number(session.read_grace_expires_at || 0) <= Date.now()) return null;
    return { token, key, session };
  } catch {
    return null;
  }
}

function staleWriteResponse() {
  return Response.json({
    ok: false,
    error: {
      code: "LIFF_SESSION_INVALID",
      message: "LIFF session was superseded. Refresh My MMD before continuing.",
    },
  }, {
    status: 401,
    headers: {
      "cache-control": "no-store",
      "set-cookie": `${SESSION_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`,
      "x-mmd-liff-session-overlap": "stale-write-rejected-v1",
    },
  });
}

async function scrubRotatedSession(env, token) {
  const key = await sessionKey(env, token);
  if (!key || !env.LIFF_IDENTITY_KV?.get || !env.LIFF_IDENTITY_KV?.put) return false;
  const session = await env.LIFF_IDENTITY_KV.get(key, "json").catch(() => null);
  if (!session || typeof session !== "object" || Number(session.expires_at || 0) <= Date.now()) return false;
  if (session.read_grace_only !== true && !session.read_grace_expires_at && !session.superseded_at) return true;
  const current = { ...session };
  delete current.read_grace_only;
  delete current.read_grace_expires_at;
  delete current.superseded_at;
  const remaining = Math.ceil((Number(current.expires_at || 0) - Date.now()) / 1000);
  const ttl = Math.max(MIN_KV_TTL_SECONDS, Math.min(MAX_SESSION_TTL_SECONDS, remaining));
  await env.LIFF_IDENTITY_KV.put(key, JSON.stringify(current), { expirationTtl: ttl });
  return true;
}

async function restoreReadGrace(env, snapshot) {
  if (!snapshot?.key || !snapshot?.session || !env.LIFF_IDENTITY_KV?.put) return false;
  const now = Date.now();
  const originalExpiry = Number(snapshot.session.expires_at || 0);
  if (!Number.isFinite(originalExpiry) || originalExpiry <= now) return false;
  const graceExpiry = Math.min(originalExpiry, now + READ_GRACE_MS);
  if (graceExpiry <= now) return false;
  const grace = {
    ...snapshot.session,
    read_grace_only: true,
    read_grace_expires_at: graceExpiry,
    superseded_at: now,
    expires_at: graceExpiry,
  };
  await env.LIFF_IDENTITY_KV.put(snapshot.key, JSON.stringify(grace), { expirationTtl: KV_GRACE_TTL_SECONDS });
  return true;
}

function withOverlapHeader(response, value) {
  if (!(response instanceof Response)) return response;
  const headers = new Headers(response.headers);
  headers.set("x-mmd-liff-session-overlap", value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  ...liffFoundation,
  async fetch(request, env = {}, ctx) {
    if (!isRotatingSessionPath(request)) return liffFoundation.fetch(request, env, ctx);

    const snapshot = await readSnapshot(request, env);
    if (snapshot?.session?.read_grace_only === true && request.method !== "GET") {
      return staleWriteResponse();
    }

    const response = await liffFoundation.fetch(request, env, ctx);
    if (request.method !== "GET" || !snapshot) return response;

    const rotatedToken = responseCookieValue(response, SESSION_COOKIE);
    if (!rotatedToken || rotatedToken === snapshot.token) return response;

    try {
      // If this GET arrived on a grace token, the foundation copied the grace
      // marker into the replacement session. Remove it from the newly-issued
      // current token before restoring the old token as a short read-only alias.
      await scrubRotatedSession(env, rotatedToken);
      await restoreReadGrace(env, snapshot);
      return withOverlapHeader(response, "read-only-30s-v1");
    } catch (error) {
      console.warn({
        event: "liff_read_overlap_restore_failed",
        failure_class: String(error?.message || error || "unknown").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80),
      });
      return response;
    }
  },
};

export const LIFF_STABLE_SESSION_INTERNALS = Object.freeze({
  READ_GRACE_MS,
  isRotatingSessionPath,
  readSnapshot,
  restoreReadGrace,
  scrubRotatedSession,
});
