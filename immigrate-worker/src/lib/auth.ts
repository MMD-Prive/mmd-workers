import type { Env } from "../types";

export type WriteAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; code: string; message: string };

export function readInternalToken(request: Request): string {
  const headerToken = (request.headers.get("x-internal-token") || "").trim();
  if (headerToken) return headerToken;

  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

export function readConfirmKey(request: Request): string {
  return (request.headers.get("x-confirm-key") || "").trim();
}

export function isAuthorized(request: Request, env: Env): boolean {
  const expected = String(env.INTERNAL_TOKEN || "").trim();
  if (!expected) return false;
  return readInternalToken(request) === expected;
}

export function authorizeWriteRequest(request: Request, env: Env): WriteAuthResult {
  const expectedInternalToken = String(env.INTERNAL_TOKEN || "").trim();
  const expectedConfirmKey = String(env.CONFIRM_KEY || "").trim();
  const internalToken = readInternalToken(request);
  const confirmKey = readConfirmKey(request);

  if (!expectedInternalToken && !expectedConfirmKey) {
    return {
      ok: false,
      status: 403,
      code: "WRITE_AUTH_NOT_CONFIGURED",
      message: "Write authentication is not configured.",
    };
  }

  if (!internalToken && !confirmKey) {
    return {
      ok: false,
      status: 401,
      code: "WRITE_AUTH_MISSING",
      message: "Write authentication is required.",
    };
  }

  if (expectedInternalToken && internalToken === expectedInternalToken) return { ok: true };
  if (expectedConfirmKey && confirmKey === expectedConfirmKey) return { ok: true };

  return {
    ok: false,
    status: 403,
    code: "WRITE_AUTH_INVALID",
    message: "Write authentication is invalid.",
  };
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

  const cookies = parseCookies(request);
  if (cookies.get("mmd_admin_gate_v1") === "1") return true;

  const credentials = readBasicCredentials(request);
  if (!credentials) return false;

  const expectedPassword = String(env.BROWSER_GATE_PASSWORD || env.INTERNAL_TOKEN || "").trim();
  if (!expectedPassword) return false;

  const expectedUsername = String(env.BROWSER_GATE_USERNAME || "").trim();
  if (expectedUsername && credentials.username !== expectedUsername) return false;

  return credentials.password === expectedPassword;
}
