import legacyWorker from "./index.js";

const WORKER = "member-pages-worker";
const VERSION = "20260731-liff-identity-foundation-cookies";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const SESSION_TTL_SECONDS = 15 * 60;
const HALL_TOKEN_TTL_SECONDS = 5 * 60;
const VERIFY_TIMEOUT_MS = 5000;
const MEMBER_RESOLVER_TIMEOUT_MS = 5000;
const SESSION_COOKIE = "__Host-mmd_liff_session";
const HANDOFF_COOKIE = "__Host-mmd_liff_handoff";
const MEMBER_RESOLVER_PATH = "/__internal/member-status/resolve";
const MEMBER_RESOLVER_PURPOSE = "liff_identity_resolution";
const MEMBER_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";

const LEGACY_IDENTIFY_PATHS = new Set(["/member/api/liff/identify", "/member/api/liff/identify/"]);
const START_PATHS = new Set(["/member/api/liff/start", "/member/api/liff/start/"]);
const INTENT_PATHS = new Set(["/member/api/liff/intent", "/member/api/liff/intent/"]);
const STATUS_PATHS = new Set(["/member/api/liff/status", "/member/api/liff/status/"]);
const HALL_TOKEN_PATHS = new Set(["/member/api/liff/hall-token", "/member/api/liff/hall-token/"]);
const APPROVED_DESTINATIONS = new Set(["/hall", "/public/access", "/member/dashboard", "/member/membership"]);
const APPROVED_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const START_BODY_KEYS = new Set(["id_token", "intent"]);
const INTENT_BODY_KEYS = new Set(["intent"]);
const HALL_BODY_KEYS = new Set(["destination", "next", "route"]);
const BROWSER_IDENTITY_FIELDS = [
  "line_user_id",
  "lineUserId",
  "sub",
  "profile",
  "line_profile",
  "user",
  "member_id",
  "mmd_member_id",
  "tier",
  "points",
  "status",
  "membership_status",
  "payment_status",
  "private_access",
  "entitlements",
];

export default {
  async fetch(request, env = {}, ctx) {
    const path = normalizePath(new URL(request.url).pathname);
    if (request.method === "OPTIONS" && isLiffPrefix(path)) return new Response(null, { status: 204, headers: apiHeaders("POST,GET,OPTIONS") });
    if (LEGACY_IDENTIFY_PATHS.has(path)) return json({ ok: false, error: { code: "LEGACY_LIFF_IDENTITY_DISABLED", message: "Use the server-verified LIFF identity flow." } }, 410);
    if (START_PATHS.has(path)) return handleStart(request, env);
    if (INTENT_PATHS.has(path)) return handleIntent(request, env);
    if (STATUS_PATHS.has(path)) return handleStatus(request, env);
    if (HALL_TOKEN_PATHS.has(path)) return handleHallToken(request, env);
    if (path.startsWith("/member/api/liff/")) return json({ ok: false, error: { code: "LIFF_ROUTE_NOT_FOUND", message: "Unknown LIFF identity route." } }, 404);
    return legacyWorker.fetch(request, env, ctx);
  },
};

export async function handleStart(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const body = await readJson(request);
  if (!body) return invalidInput();
  if (hasUnexpectedKeys(body, START_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();

  const idToken = exactToken(body.id_token);
  if (!idToken) return json({ ok: false, error: { code: "ID_TOKEN_REQUIRED", message: "id_token is required" } }, 400);

  const verified = await verifyLineIdToken(idToken, env);
  if (!verified.ok) return json({ ok: false, error: { code: verified.code, message: verified.message } }, verified.status);

  const identityKey = await keyedDigest(env, `identity:${verified.sub}`);
  const existing = await resolveExistingMember(env, verified.sub);
  if (!existing.ok) return json({ ok: false, error: { code: "MEMBER_RESOLUTION_FAILED", message: "Member identity could not be resolved safely." } }, 503);

  const pending = existing.exists ? null : await getOrCreatePendingIdentity(env, identityKey);
  const intent = normalizeIntent(body.intent);
  const continuity = cleanContinuity(new URL(request.url).searchParams.get("t"));
  const session = await issueSession(env, { identity_key: identityKey, member_exists: existing.exists, pending_identity_id: pending?.pending_identity_id || null, intent, continuity });

  return json({
    ok: true,
    data: {
      identity_state: existing.exists ? "existing_member" : "pending_identity",
      member_resolved: existing.exists,
      pending_identity: existing.exists ? false : { id: pending.pending_identity_id, state: "pending_identity" },
      expires_in: SESSION_TTL_SECONDS,
      grants: noGrants(),
    },
  }, 200, { cookies: [sessionCookie(session.token, SESSION_TTL_SECONDS)] });
}

export async function handleIntent(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const body = await readJson(request);
  if (!body) return invalidInput();
  if (hasUnexpectedKeys(body, INTENT_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();
  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  auth.session.intent = normalizeIntent(body.intent);
  await saveSession(env, auth.newHash, auth.session, SESSION_TTL_SECONDS);
  return json({ ok: true, data: safeSessionView(auth.session) }, 200, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] });
}

export async function handleStatus(request, env = {}) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  await saveSession(env, auth.newHash, auth.session, SESSION_TTL_SECONDS);
  return json({ ok: true, data: safeSessionView(auth.session) }, 200, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] });
}

export async function handleHallToken(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const body = await readJson(request);
  if (!body) return invalidInput();
  if (hasUnexpectedKeys(body, HALL_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();
  const destination = normalizeDestination(body.destination || body.next || body.route);
  if (!destination) return json({ ok: false, error: { code: "DESTINATION_NOT_ALLOWED", message: "Destination is not approved." } }, 400);
  const auth = await authenticateSession(request, env, { consume: true });
  if (!auth.ok) return auth.response;

  const rawHandoff = randomToken(32);
  const handoffHash = await keyedDigest(env, `handoff:${rawHandoff}`);
  const handoff = {
    identity_key: auth.session.identity_key,
    session_id: auth.session.session_id,
    destination,
    continuity: auth.session.continuity || null,
    intent: auth.session.intent || "member_status",
    created_at: Date.now(),
    expires_at: Date.now() + HALL_TOKEN_TTL_SECONDS * 1000,
    one_time: true,
  };
  await env.LIFF_IDENTITY_KV.put(`liff:handoff:${handoffHash}`, JSON.stringify(handoff), { expirationTtl: HALL_TOKEN_TTL_SECONDS });
  return json({ ok: true, data: { redirect_to: destination, expires_in: HALL_TOKEN_TTL_SECONDS } }, 200, {
    cookies: [clearCookie(SESSION_COOKIE), handoffCookie(rawHandoff, HALL_TOKEN_TTL_SECONDS)],
  });
}

async function verifyLineIdToken(idToken, env) {
  const channelId = String(env.LINE_LOGIN_CHANNEL_ID || "").trim();
  if (!channelId) return { ok: false, status: 503, code: "LINE_CHANNEL_NOT_CONFIGURED", message: "LINE verification is not configured." };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.LIFF_VERIFY_TIMEOUT_MS || VERIFY_TIMEOUT_MS));
  try {
    const response = await fetch(env.LINE_ID_TOKEN_VERIFY_URL || LINE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== "object") return { ok: false, status: 401, code: "LINE_ID_TOKEN_INVALID", message: "LINE identity verification failed." };
    const sub = String(payload.sub || "").trim();
    const aud = String(payload.aud || "").trim();
    const exp = Number(payload.exp || 0);
    if (!sub || aud !== channelId || !Number.isFinite(exp) || exp * 1000 <= Date.now()) return { ok: false, status: 401, code: "LINE_ID_TOKEN_INVALID", message: "LINE identity verification failed." };
    return { ok: true, sub };
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, status: 504, code: "LINE_VERIFY_TIMEOUT", message: "LINE identity verification timed out." };
    return { ok: false, status: 502, code: "LINE_VERIFY_FAILED", message: "LINE identity verification failed." };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveExistingMember(env, lineUserId) {
  const resolver = env.MEMBER_STATUS_RESOLVER;
  const resolverSecret = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  if (!resolver?.fetch || resolverSecret.length < 32) return { ok: false, exists: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.LIFF_MEMBER_RESOLVER_TIMEOUT_MS || MEMBER_RESOLVER_TIMEOUT_MS));
  try {
    const response = await resolver.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_RESOLVER_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MEMBER_RESOLVER_SECRET_HEADER]: resolverSecret,
      },
      body: JSON.stringify({ line_user_id: lineUserId, purpose: MEMBER_RESOLVER_PURPOSE }),
      signal: controller.signal,
    }));
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok === false) return { ok: false, exists: false };
    const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
    if (typeof data.member_exists !== "boolean") return { ok: false, exists: false };
    return { ok: true, exists: data.member_exists };
  } catch {
    return { ok: false, exists: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function getOrCreatePendingIdentity(env, identityKey) {
  const key = `liff:pending:${identityKey}`;
  const existing = await env.LIFF_IDENTITY_KV.get(key, "json");
  if (existing?.pending_identity_id) return existing;
  const record = { pending_identity_id: `pid_${identityKey.slice(0, 18)}`, state: "pending_identity", created_at: new Date().toISOString() };
  await env.LIFF_IDENTITY_KV.put(key, JSON.stringify(record));
  return record;
}

async function issueSession(env, data) {
  const token = randomToken(32);
  const hash = await keyedDigest(env, `session:${token}`);
  const now = Date.now();
  const session = { ...data, session_id: crypto.randomUUID(), issued_at: now, expires_at: now + SESSION_TTL_SECONDS * 1000, rotation: 0 };
  await saveSession(env, hash, session, SESSION_TTL_SECONDS);
  return { token };
}

async function authenticateAndRotate(request, env) {
  const auth = await authenticateSession(request, env, { consume: true });
  if (!auth.ok) return auth;
  const newToken = randomToken(32);
  const newHash = await keyedDigest(env, `session:${newToken}`);
  auth.session.rotation = Number(auth.session.rotation || 0) + 1;
  auth.session.expires_at = Date.now() + SESSION_TTL_SECONDS * 1000;
  return { ok: true, session: auth.session, newToken, newHash };
}

async function authenticateSession(request, env, { consume = false } = {}) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return authFailure("LIFF_SESSION_REQUIRED", "Authenticated LIFF session required.");
  const hash = await keyedDigest(env, `session:${token}`);
  const key = `liff:session:${hash}`;
  const session = await env.LIFF_IDENTITY_KV.get(key, "json");
  if (!session || Number(session.expires_at || 0) <= Date.now()) {
    if (session) await env.LIFF_IDENTITY_KV.delete(key);
    return authFailure("LIFF_SESSION_INVALID", "LIFF session is invalid or expired.");
  }
  if (consume) await env.LIFF_IDENTITY_KV.delete(key);
  return { ok: true, session };
}

async function saveSession(env, hash, session, ttl) {
  await env.LIFF_IDENTITY_KV.put(`liff:session:${hash}`, JSON.stringify(session), { expirationTtl: ttl });
}

function safeSessionView(session) {
  return {
    identity_state: session.member_exists ? "existing_member" : "pending_identity",
    member_resolved: Boolean(session.member_exists),
    pending_identity: session.member_exists ? false : { id: session.pending_identity_id, state: "pending_identity" },
    intent: session.intent || "member_status",
    expires_in: SESSION_TTL_SECONDS,
    grants: noGrants(),
  };
}

function requireSameOrigin(request) {
  const origin = request.headers.get("origin") || "";
  if (!origin || !APPROVED_ORIGINS.has(origin)) return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
  return null;
}

function normalizeDestination(value) {
  try {
    const input = String(value || "").trim();
    if (!input || /[\u0000-\u001f\u007f]/.test(input)) return "";
    if (input.includes("\\") || input.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(input)) return "";
    if (!input.startsWith("/") || input[1] === "/") return "";
    if (input.includes("?") || input.includes("#") || input.includes("%")) return "";
    const decoded = decodeURIComponent(input);
    if (decoded !== input || decoded.includes("\\") || decoded.includes("..") || decoded.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return "";
    const path = normalizePath(decoded).replace(/\/$/, "") || "/";
    return APPROVED_DESTINATIONS.has(path) ? path : "";
  } catch {
    return "";
  }
}

function sessionCookie(value, maxAge) { return hostCookie(SESSION_COOKIE, value, maxAge); }
function handoffCookie(value, maxAge) { return hostCookie(HANDOFF_COOKIE, value, maxAge); }
function hostCookie(name, value, maxAge) { return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`; }
function clearCookie(name) { return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`; }
function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return exactToken(rest.join("="));
  }
  return "";
}

function hasFoundationBindings(env) { return Boolean(env.LIFF_IDENTITY_KV && env.MEMBER_STATUS_RESOLVER?.fetch && hasMemberResolverSecret(env) && env.LINE_LOGIN_CHANNEL_ID && env.LIFF_SESSION_SECRET); }
function hasMemberResolverSecret(env) { return String(env.MEMBER_STATUS_RESOLVER_SECRET || "").length >= 32; }
function isLiffPrefix(path) { return path === "/member/api/liff" || path.startsWith("/member/api/liff/"); }
function hasBrowserIdentityClaims(body) { return BROWSER_IDENTITY_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(body, key)); }
function hasUnexpectedKeys(body, allowed) { return Object.keys(body || {}).some((key) => !allowed.has(key)); }
function normalizeIntent(value) { const intent = String(value || "member_status").trim().toLowerCase(); return new Set(["member_status", "dashboard", "booking_request", "public_access", "hall"]).has(intent) ? intent : "member_status"; }
function cleanContinuity(value) { const token = String(value || "").trim(); return token && token.length <= 2048 && /^[A-Za-z0-9._~-]+$/.test(token) ? token : null; }
function exactToken(value) { const token = String(value || "").trim(); return token && token.length <= 8192 && /^[A-Za-z0-9._~-]+$/.test(token) ? token : ""; }
function noGrants() { return { membership: false, points: false, payment_status: false, private_access: false }; }

async function keyedDigest(env, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(env.LIFF_SESSION_SECRET)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function randomToken(bytes = 32) { const out = new Uint8Array(bytes); crypto.getRandomValues(out); return [...out].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) return null;
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body : null;
}
function normalizePath(pathname) { return pathname.toLowerCase().replace(/\/{2,}/g, "/"); }
function invalidInput() { return json({ ok: false, error: { code: "INVALID_INPUT", message: "A valid JSON object is required." } }, 400); }
function browserIdentityRejected() { return json({ ok: false, error: { code: "BROWSER_IDENTITY_REJECTED", message: "Browser-supplied identity fields are not accepted." } }, 400); }
function unavailable(code) { return json({ ok: false, error: { code, message: "LIFF identity foundation is not configured." } }, 503); }
function methodNotAllowed(methods) { return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `${methods} required` } }, 405, { headers: { allow: methods } }); }
function authFailure(code, message) { return { ok: false, response: json({ ok: false, error: { code, message } }, 401, { cookies: [clearCookie(SESSION_COOKIE)] }) }; }
function apiHeaders(methods = "POST,GET,OPTIONS") {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "access-control-allow-origin": "https://mmdbkk.com",
    "access-control-allow-methods": methods,
    "access-control-allow-headers": "content-type",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-mmd-worker": WORKER,
    "x-mmd-version": VERSION,
  };
}
function json(body, status = 200, options = {}) {
  const headers = new Headers({ ...apiHeaders(), ...(options.headers || {}) });
  for (const cookie of options.cookies || []) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
