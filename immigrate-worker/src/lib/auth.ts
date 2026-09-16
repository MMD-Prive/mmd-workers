import type { Env } from "../types";

const ADMIN_GATE_COOKIE = "mmd_admin_gate_v1";
const ADMIN_SESSION_SCOPE = "internal_admin";
const ADMIN_SESSION_VERSION = 2;
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_SESSION_ALLOWED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);

export function readInternalToken(request: Request): string {
  const headerToken = (request.headers.get("x-internal-token") || "").trim();
  if (headerToken) return headerToken;

  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export function isAuthorized(request: Request, env: Env): boolean {
  const expected = String(env.INTERNAL_TOKEN || "").trim();
  if (expected && readInternalToken(request) === expected) return true;

  return hasValidAdminGateCookie(request);
}

type BasicCredentials = {
  username: string;
  password: string;
};

function parseCookies(request: Request): Map<string, string> {
  const raw = request.headers.get("cookie") || "";
  const map = new Map<string, string>();

  for (const part of raw.split(";")) {
    const [name, ...rest] = part.split("=");
    const key = name.trim();
    if (!key) continue;
    map.set(key, rest.join("=").trim());
  }

  return map;
}

function hasValidAdminGateCookie(request: Request): boolean {
  const token = (parseCookies(request).get(ADMIN_GATE_COOKIE) || "").trim();
  if (!token) return false;

  // Legacy immigrate-worker gate used a simple value. Keep it for old sessions.
  if (token === "1") return true;

  // Canonical admin-worker now issues mmd_admin_gate_v1 as payload.signature.
  // Immigrate routes are browser-only surfaces, so accept only well-formed,
  // same-origin, unexpired internal_admin v2 sessions here. The admin-worker
  // remains the cookie issuer; this bridge prevents valid admin sessions from
  // bouncing back to /internal/admin/login.
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))) as {
      version?: number;
      id?: string;
      scope?: string;
      host?: string;
      iat?: number;
      exp?: number;
      nonce?: string;
    };
    const now = Date.now();
    const requestOrigin = new URL(request.url).origin;

    if (!payload || payload.version !== ADMIN_SESSION_VERSION) return false;
    if (payload.scope !== ADMIN_SESSION_SCOPE) return false;
    if (!payload.id || !payload.nonce) return false;
    if (!payload.host || payload.host !== requestOrigin) return false;
    if (!ADMIN_SESSION_ALLOWED_ORIGINS.has(payload.host)) return false;
    if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return false;
    if ((payload.iat as number) > now || (payload.exp as number) <= now) return false;
    if ((payload.exp as number) - (payload.iat as number) > ADMIN_SESSION_TTL_MS) return false;

    return true;
  } catch {
    return false;
  }
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function readBasicCredentials(request: Request): BasicCredentials | null {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Basic\s+(.+)$/i);
  if (!match) return null;

  try {
    const decoded = atob(match[1]);
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function isBrowserGateAuthorized(request: Request, env: Env): boolean {
  if (isAuthorized(request, env)) return true;

  const credentials = readBasicCredentials(request);
  if (!credentials) return false;

  const expectedPassword = String(env.BROWSER_GATE_PASSWORD || env.INTERNAL_TOKEN || "").trim();
  if (!expectedPassword) return false;

  const expectedUsername = String(env.BROWSER_GATE_USERNAME || "").trim();
  if (expectedUsername && credentials.username !== expectedUsername) return false;

  return credentials.password === expectedPassword;
}
