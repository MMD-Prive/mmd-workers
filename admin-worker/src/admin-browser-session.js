const COOKIE_NAME = "mmd_admin_gate_v1";
const TTL_MS = 8 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);

export async function hasValidAdminBrowserSession(request, env = {}) {
  const raw = parseCookieMap(request).get(COOKIE_NAME);
  if (!raw) return false;

  try {
    const decoded = decodeURIComponent(raw);
    const [payloadPart, signaturePart] = decoded.split(".");
    if (!payloadPart || !signaturePart) return false;

    const expected = await signPayload(payloadPart, env);
    if (!expected || !(await constantTimeEqual(signaturePart, expected))) return false;

    const session = JSON.parse(base64UrlDecode(payloadPart));
    if (!session || typeof session !== "object" || Array.isArray(session)) return false;
    if (session.version !== 2 || session.scope !== "internal_admin") return false;
    if (!session.host || !ALLOWED_ORIGINS.has(session.host)) return false;
    if (session.host !== new URL(request.url).origin) return false;
    if (!Number.isFinite(session.iat) || !Number.isFinite(session.exp)) return false;

    const now = Date.now();
    if (session.iat > now || session.exp <= now || session.exp - session.iat > TTL_MS) return false;
    if (!session.nonce || typeof session.nonce !== "string") return false;
    return true;
  } catch {
    return false;
  }
}

async function signPayload(payload, env) {
  const secret = signingSecret(env);
  if (!secret) return "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function signingSecret(env = {}) {
  const dedicated = clean(env.ADMIN_LOGIN_CREDENTIAL);
  const adminBearer = clean(env.ADMIN_BEARER);
  const credential = dedicated || adminBearer;
  if (!credential) return "";

  const sessionSecret = clean(env.ADMIN_SESSION_SECRET);
  if (sessionSecret) return `${sessionSecret}.${credential}`;
  if (!dedicated && adminBearer) return adminBearer;
  return "";
}

function parseCookieMap(request) {
  const map = new Map();
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("")
  );
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left || ""));
  const b = new TextEncoder().encode(String(right || ""));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function clean(value) {
  return String(value ?? "").trim();
}
