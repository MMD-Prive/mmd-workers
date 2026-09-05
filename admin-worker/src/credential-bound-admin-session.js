const COOKIE_NAME = "mmd_admin_gate_v1";
const SESSION_VERSION = 2;
const SESSION_SCOPE = "internal_admin";
const TTL_MS = 8 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);

export function getCredentialBoundAdminLoginCredential(env = {}) {
  const dedicated = clean(env.ADMIN_LOGIN_CREDENTIAL);
  if (dedicated) return dedicated;
  return clean(env.ADMIN_ACCESS_CODE || env.SIGIL_ADMIN_ACCESS_CODE || env.ADMIN_BEARER);
}

export async function createCredentialBoundAdminSession(request, actor, env = {}) {
  const host = new URL(request.url).origin;
  if (!ALLOWED_ORIGINS.has(host)) throw new Error("Admin session host is not allowed");

  const now = Date.now();
  const payload = {
    version: SESSION_VERSION,
    id: clean(actor?.id) || "per",
    role: clean(actor?.role) || "admin",
    auth_method: "credential",
    scope: SESSION_SCOPE,
    host,
    iat: now,
    exp: now + TTL_MS,
    nonce: crypto.randomUUID(),
  };
  const payloadPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSha256(resolveSessionSecret(env), payloadPart);
  return `${payloadPart}.${signature}`;
}

export async function readCredentialBoundAdminActor(request, env = {}) {
  const token = parseCookie(request.headers.get("Cookie") || "")[COOKIE_NAME];
  const [payloadPart, signature] = clean(token).split(".");
  if (!payloadPart || !signature) return null;

  let expected;
  try {
    expected = await hmacSha256(resolveSessionSecret(env), payloadPart);
  } catch {
    return null;
  }
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const actor = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
    const now = Date.now();
    if (!actor || actor.version !== SESSION_VERSION || actor.scope !== SESSION_SCOPE) return null;
    if (!actor.id || !actor.role || !actor.nonce || typeof actor.nonce !== "string") return null;
    if (!ALLOWED_ORIGINS.has(actor.host) || actor.host !== new URL(request.url).origin) return null;
    if (!Number.isFinite(actor.iat) || !Number.isFinite(actor.exp)) return null;
    if (actor.iat > now || actor.exp <= now || actor.exp - actor.iat > TTL_MS) return null;
    return actor;
  } catch {
    return null;
  }
}

function resolveSessionSecret(env = {}) {
  const sessionSecret = clean(env.ADMIN_SESSION_SECRET || env.SESSION_SECRET);
  const credential = getCredentialBoundAdminLoginCredential(env);
  if (sessionSecret && credential) return `${sessionSecret}.${credential}`;
  if (credential) return credential;
  throw new Error("Missing credential-bound admin session secret");
}

async function hmacSha256(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(result));
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function timingSafeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function parseCookie(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

function clean(value) {
  return String(value ?? "").trim();
}