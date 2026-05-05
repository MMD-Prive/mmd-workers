import type { Env } from "../types";
import { redirect } from "../lib/response";
import { readInternalToken } from "../lib/auth";

export const SIGIL_ADMIN_ROOT = "/sigil/admin";
export const SIGIL_ADMIN_LOGIN_PATH = "/sigil/admin/login";
export const SIGIL_ADMIN_SETUP_PATH = "/sigil/admin/setup";
export const SIGIL_ADMIN_LOGOUT_PATH = "/sigil/admin/logout";
export const SIGIL_ADMIN_SUCCESS_PATH = "/sigil/admin/jobs/create-session";
export const INTERNAL_ADMIN_INVITE_CREATE_PATH = "/internal/admin/invites/create";

const AIRTABLE_API = "https://api.airtable.com/v0";
const SESSION_COOKIE = "mmd_sigil_admin_session";
const SETUP_COOKIE = "mmd_sigil_admin_setup";
const SESSION_TTL_SECONDS = 60 * 60 * 10;
const SETUP_TTL_SECONDS = 60 * 20;
const PASSWORD_HASH_ITERATIONS = 100_000;
const MAX_WORKER_PBKDF2_ITERATIONS = 100_000;
const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256";

type AirtableFields = Record<string, unknown>;

type AirtableRecord = {
  id: string;
  fields?: AirtableFields;
  createdTime?: string;
};

type InviteValidation =
  | {
      ok: true;
      invite: AirtableRecord;
      tokenHash: string;
      email: string;
      role: string;
      name: string;
    }
  | {
      ok: false;
      code: "invalid" | "expired" | "used" | "unavailable";
    };

export type SigilAdminSession = {
  adminUserRecordId: string;
  sessionRecordId: string;
  sessionTokenHash: string;
};

type SessionCookiePayload = {
  kind: "sigil_admin_session";
  admin_user_record_id: string;
  session_record_id: string;
  session_token: string;
  iat: number;
  exp: number;
};

type SetupCookiePayload = {
  kind: "sigil_admin_setup";
  invite_record_id: string;
  invite_token_hash: string;
  iat: number;
  exp: number;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown): string {
  return toStr(value).toLowerCase();
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function encoder(): TextEncoder {
  return new TextEncoder();
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBinary(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += String.fromCharCode(byte);
  return output;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(bytesToBinary(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder().encode(value)));
}

async function hmacSha256Bytes(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder().encode(value)));
}

function constantTimeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] || 0) ^ (right[index] || 0);
  }
  return diff === 0;
}

function constantTimeEqualString(left: string, right: string): boolean {
  return constantTimeEqualBytes(encoder().encode(left), encoder().encode(right));
}

function adminAuthSecret(env: Env): string {
  // Prefer a dedicated admin cookie signing secret; LINK_SIGNING_SECRET is a local/backward-compat fallback only.
  return toStr(env.ADMIN_SESSION_SECRET || env.LINK_SIGNING_SECRET);
}

async function signPayload(payload: Record<string, unknown>, env: Env): Promise<string> {
  const secret = adminAuthSecret(env);
  if (!secret) throw new Error("missing_admin_session_secret");
  const body = bytesToBase64Url(encoder().encode(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await hmacSha256Bytes(body, secret));
  return `${body}.${signature}`;
}

async function verifySignedPayload<T extends Record<string, unknown>>(
  value: string,
  env: Env,
): Promise<T | null> {
  const secret = adminAuthSecret(env);
  if (!secret) return null;

  const [body, signature] = value.split(".");
  if (!body || !signature) return null;

  const expected = bytesToBase64Url(await hmacSha256Bytes(body, secret));
  if (!constantTimeEqualString(signature, expected)) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as T;
    const exp = Number(parsed.exp || 0);
    if (!exp || exp <= nowSeconds()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(request: Request): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    out.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return out;
}

function cookieValue(request: Request, name: string): string {
  const value = parseCookies(request).get(name);
  return value ? decodeURIComponent(value) : "";
}

function buildCookie(name: string, value: string, maxAgeSeconds: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    "Path=/sigil/admin",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

function clearCookie(name: string): string {
  return buildCookie(name, "", 0);
}

function htmlResponse(html: string, init?: ResponseInit): Response {
  return new Response(html, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function renderShell(title: string, body: string): Response {
  return htmlResponse(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0a0a0a;
        color: #f5efe8;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(92vw, 420px);
        padding: 28px;
        border: 1px solid rgba(224, 196, 140, .24);
        border-radius: 8px;
        background: #111;
      }
      h1 { margin: 0 0 18px; font-size: 1.45rem; font-weight: 650; }
      form { display: grid; gap: 14px; }
      label { display: grid; gap: 7px; color: rgba(245,239,232,.74); font-size: .93rem; }
      input {
        width: 100%;
        min-height: 44px;
        padding: 10px 12px;
        border: 1px solid rgba(224,196,140,.28);
        border-radius: 6px;
        background: #090909;
        color: #fff;
        font: inherit;
      }
      button {
        min-height: 46px;
        border: 0;
        border-radius: 6px;
        background: #d4aa5f;
        color: #111;
        font: 700 .95rem/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
      }
      p { margin: 0; color: rgba(245,239,232,.7); line-height: 1.5; }
      .error { margin-bottom: 14px; color: #ffb8b8; }
      a { color: #f0c978; }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`);
}

function renderLoginPage(error = false, status = 200): Response {
  return responseWithStatus(renderShell(
    "SIGIL Admin Login",
    `<h1>SIGIL Admin</h1>
    ${error ? `<p class="error">Invalid username or password.</p>` : ""}
    <form method="post" action="${SIGIL_ADMIN_LOGIN_PATH}">
      <label>
        Username or email
        <input name="identity" type="text" autocomplete="username" required autofocus />
      </label>
      <label>
        Password
        <input name="password" type="password" autocomplete="current-password" required />
      </label>
      <button type="submit">Log in</button>
    </form>`,
  ), status);
}

function renderSetupPage(error = ""): Response {
  return renderShell(
    "SIGIL Admin Setup",
    `<h1>Create admin account</h1>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="${SIGIL_ADMIN_SETUP_PATH}">
      <label>
        Username
        <input name="username" type="text" autocomplete="username" required autofocus />
      </label>
      <label>
        Password
        <input name="password" type="password" autocomplete="new-password" required />
      </label>
      <label>
        Confirm password
        <input name="confirm_password" type="password" autocomplete="new-password" required />
      </label>
      <button type="submit">Create account</button>
    </form>`,
  );
}

function renderInviteErrorPage(): Response {
  return renderShell(
    "SIGIL Admin Setup",
    `<h1>Invite unavailable</h1><p>This admin invite is invalid, expired, or already used.</p>`,
  );
}

function responseWithStatus(response: Response, status: number): Response {
  return new Response(response.body, {
    status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formulaEscape(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function tableId(env: Env, key: "users" | "invites" | "otp" | "sessions" | "activity"): string {
  switch (key) {
    case "users":
      return toStr(env.AIRTABLE_TABLE_ADMIN_USERS) || "Admin Users";
    case "invites":
      return toStr(env.AIRTABLE_TABLE_ADMIN_INVITES) || "Admin Invites";
    case "otp":
      return toStr(env.AIRTABLE_TABLE_ADMIN_OTP_CHALLENGES) || "Admin OTP";
    case "sessions":
      return toStr(env.AIRTABLE_TABLE_ADMIN_SESSIONS) || "Admin Sessions";
    case "activity":
      return toStr(env.AIRTABLE_TABLE_ACTIVITY_LOGS) || "Activity Logs";
  }
}

function requireAirtable(env: Env): void {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new Error("missing_airtable_env");
  }
}

async function airtableRequest(
  env: Env,
  table: string,
  init: {
    method?: string;
    recordId?: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {},
): Promise<Record<string, unknown>> {
  requireAirtable(env);
  const suffix = init.recordId ? `/${encodeURIComponent(init.recordId)}` : "";
  const url = new URL(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${suffix}`);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    method: init.method || "GET",
    headers: {
      authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "content-type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const data = (() => {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  if (!response.ok) {
    const error = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : {};
    throw new Error(toStr(error.message) || `airtable_${response.status}`);
  }

  return data;
}

function parseRejectedFieldName(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    message.match(/Unknown field name:\s+\\"([^"]+)\\"/)?.[1] ||
    message.match(/Unknown field name:\s+"([^"]+)"/)?.[1] ||
    message.match(/Field "([^"]+)" cannot accept/)?.[1] ||
    message.match(/Cannot update field "([^"]+)"/)?.[1] ||
    ""
  );
}

function compactFields(fields: AirtableFields): AirtableFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""),
  );
}

async function airtableCreate(env: Env, table: string, fields: AirtableFields): Promise<AirtableRecord> {
  const candidate = compactFields(fields);
  while (Object.keys(candidate).length) {
    try {
      const result = await airtableRequest(env, table, {
        method: "POST",
        body: { fields: candidate, typecast: true },
      });
      return {
        id: toStr(result.id),
        fields: (result.fields && typeof result.fields === "object" ? result.fields : {}) as AirtableFields,
      };
    } catch (error) {
      const badField = parseRejectedFieldName(error);
      if (badField && badField in candidate) {
        delete candidate[badField];
        continue;
      }
      throw error;
    }
  }
  throw new Error("airtable_create_failed");
}

async function airtablePatch(
  env: Env,
  table: string,
  recordId: string,
  fields: AirtableFields,
): Promise<AirtableRecord> {
  const candidate = compactFields(fields);
  while (Object.keys(candidate).length) {
    try {
      const result = await airtableRequest(env, table, {
        method: "PATCH",
        recordId,
        body: { fields: candidate, typecast: true },
      });
      return {
        id: toStr(result.id) || recordId,
        fields: (result.fields && typeof result.fields === "object" ? result.fields : {}) as AirtableFields,
      };
    } catch (error) {
      const badField = parseRejectedFieldName(error);
      if (badField && badField in candidate) {
        delete candidate[badField];
        continue;
      }
      throw error;
    }
  }
  return { id: recordId, fields: {} };
}

async function findFirstByFormula(env: Env, table: string, formula: string): Promise<AirtableRecord | null> {
  const result = await airtableRequest(env, table, {
    query: {
      maxRecords: "1",
      filterByFormula: formula,
    },
  });
  const records = Array.isArray(result.records) ? result.records : [];
  const record = records[0] as AirtableRecord | undefined;
  return record?.id ? record : null;
}

function fieldString(fields: AirtableFields | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = fields?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function fieldNumber(fields: AirtableFields | undefined, keys: string[]): number {
  for (const key of keys) {
    const value = fields?.[key];
    const numberValue = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return 0;
}

function linkedRecordIds(fields: AirtableFields | undefined, keys: string[]): string[] {
  for (const key of keys) {
    const value = fields?.[key];
    if (Array.isArray(value)) return value.map(toStr).filter(Boolean);
  }
  return [];
}

function tokenHashMatches(storedHash: string, computedSha256Hex: string): boolean {
  const normalized = storedHash.replace(/^sha256:/i, "").trim().toLowerCase();
  return constantTimeEqualString(normalized, computedSha256Hex.toLowerCase());
}

function isInternalTokenAuthorized(request: Request, env: Env): boolean {
  const expected = toStr(env.INTERNAL_TOKEN);
  const provided = readInternalToken(request);
  return Boolean(expected && provided && constantTimeEqualString(provided, expected));
}

async function validateInviteByHash(env: Env, tokenHash: string): Promise<InviteValidation> {
  try {
    const table = tableId(env, "invites");
    const formula = `OR({Invite Token Hash}="${formulaEscape(tokenHash)}",{Invite Token Hash}="sha256:${formulaEscape(tokenHash)}")`;
    const invite = await findFirstByFormula(env, table, formula);
    if (!invite) return { ok: false, code: "invalid" };

    const fields = invite.fields || {};
    const storedHash = fieldString(fields, ["Invite Token Hash", "invite_token_hash"]);
    if (!storedHash || !tokenHashMatches(storedHash, tokenHash)) {
      return { ok: false, code: "invalid" };
    }

    const status = normalizeLower(fieldString(fields, ["Status", "status"]));
    if (status && status !== "pending") {
      return { ok: false, code: status === "used" ? "used" : "invalid" };
    }

    const expiresAt = Date.parse(fieldString(fields, ["Expires At", "expires_at"]));
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { ok: false, code: "expired" };
    }

    const email = normalizeLower(fieldString(fields, ["Email", "email"]));
    const role = normalizeLower(fieldString(fields, ["Role", "role"])) || "operator";
    if (!email || !["owner", "admin", "operator"].includes(role)) {
      return { ok: false, code: "invalid" };
    }

    return {
      ok: true,
      invite,
      tokenHash,
      email,
      role,
      name: fieldString(fields, ["Name", "name"]),
    };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

async function validateInviteToken(env: Env, token: string): Promise<InviteValidation> {
  const raw = toStr(token);
  if (!raw) return { ok: false, code: "invalid" };
  return validateInviteByHash(env, await sha256Hex(raw));
}

async function readValidSetupInvite(request: Request, env: Env): Promise<InviteValidation> {
  const cookie = cookieValue(request, SETUP_COOKIE);
  const payload = cookie ? await verifySignedPayload<SetupCookiePayload>(cookie, env) : null;
  if (!payload || payload.kind !== "sigil_admin_setup" || !payload.invite_token_hash) {
    return { ok: false, code: "invalid" };
  }

  const invite = await validateInviteByHash(env, toStr(payload.invite_token_hash));
  if (!invite.ok) return invite;
  if (payload.invite_record_id && invite.invite.id !== payload.invite_record_id) {
    return { ok: false, code: "invalid" };
  }
  return invite;
}

async function makeSetupCookie(env: Env, invite: InviteValidation & { ok: true }): Promise<string> {
  const now = nowSeconds();
  const value = await signPayload(
    {
      kind: "sigil_admin_setup",
      invite_record_id: invite.invite.id,
      invite_token_hash: invite.tokenHash,
      iat: now,
      exp: now + SETUP_TTL_SECONDS,
    } satisfies SetupCookiePayload,
    env,
  );
  return buildCookie(SETUP_COOKIE, value, SETUP_TTL_SECONDS);
}

async function readRequestBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    const parsed = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, toStr(value)]),
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    out[key] = typeof value === "string" ? value : "";
  }
  return out;
}

async function hashPasswordPbkdf2(password: string): Promise<string> {
  // Interim worker-compatible password hashing: pbkdf2-sha256 with a random salt.
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey("raw", encoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations: PASSWORD_HASH_ITERATIONS,
    },
    key,
    256,
  );
  return [
    PASSWORD_HASH_ALGORITHM,
    String(PASSWORD_HASH_ITERATIONS),
    bytesToBase64Url(salt),
    bytesToBase64Url(new Uint8Array(bits)),
  ].join("$");
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, iterationsRaw, saltRaw, hashRaw] = storedHash.split("$");
  if (algorithm !== PASSWORD_HASH_ALGORITHM || !iterationsRaw || !saltRaw || !hashRaw) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 100_000 || iterations > MAX_WORKER_PBKDF2_ITERATIONS) {
    return false;
  }

  const salt = base64UrlToBytes(saltRaw);
  const expected = base64UrlToBytes(hashRaw);
  const key = await crypto.subtle.importKey("raw", encoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations,
    },
    key,
    expected.length * 8,
  );
  return constantTimeEqualBytes(new Uint8Array(bits), expected);
}

async function findAdminUserByIdentity(env: Env, identity: string): Promise<AirtableRecord | null> {
  const normalized = normalizeLower(identity);
  if (!normalized) return null;
  const formula = `OR(LOWER({Username})="${formulaEscape(normalized)}",LOWER({Email})="${formulaEscape(normalized)}")`;
  return findFirstByFormula(env, tableId(env, "users"), formula);
}

async function activeOrInvitedOwnerExists(env: Env): Promise<boolean> {
  const activeOwner = await findFirstByFormula(
    env,
    tableId(env, "users"),
    `AND(LOWER({Role})="owner",OR(LOWER({Status})="active",LOWER({Status})="invited"))`,
  ).catch(() => null);
  if (activeOwner) return true;

  const pendingOwnerInvite = await findFirstByFormula(
    env,
    tableId(env, "invites"),
    `AND(LOWER({Role})="owner",LOWER({Status})="pending")`,
  ).catch(() => null);
  return Boolean(pendingOwnerInvite);
}

async function pendingInviteForEmailExists(env: Env, email: string): Promise<boolean> {
  const existing = await findFirstByFormula(
    env,
    tableId(env, "invites"),
    `AND(LOWER({Email})="${formulaEscape(email)}",LOWER({Status})="pending")`,
  ).catch(() => null);
  return Boolean(existing);
}

function buildSetupUrl(request: Request, env: Env, inviteToken: string): string {
  const base = toStr(env.SIGIL_BASE_URL || env.PUBLIC_WEB_BASE_URL) || new URL(request.url).origin;
  const url = new URL(SIGIL_ADMIN_SETUP_PATH, base);
  url.searchParams.set("t", inviteToken);
  return url.toString();
}

async function writeActivityLog(
  env: Env,
  input: {
    actorAdminId?: string;
    action: string;
    target?: string;
    request?: Request;
  },
): Promise<void> {
  try {
    await airtableCreate(env, tableId(env, "activity"), {
      "Actor Admin": input.actorAdminId ? [input.actorAdminId] : undefined,
      actor_admin: input.actorAdminId ? [input.actorAdminId] : undefined,
      Action: input.action,
      action: input.action,
      Target: input.target || "",
      target: input.target || "",
      IP: input.request ? clientIp(input.request) : "",
      ip: input.request ? clientIp(input.request) : "",
      "User Agent": input.request?.headers.get("user-agent") || "",
      user_agent: input.request?.headers.get("user-agent") || "",
      "Created At": nowIso(),
      created_at: nowIso(),
    });
  } catch {
    // Activity logging must never leak secrets or block auth completion.
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

async function handleSetupGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rawToken = toStr(url.searchParams.get("t"));
  const invite = rawToken ? await validateInviteToken(env, rawToken) : await readValidSetupInvite(request, env);
  if (!invite.ok) return renderInviteErrorPage();

  const response = renderSetupPage();
  response.headers.append("set-cookie", await makeSetupCookie(env, invite));
  return response;
}

async function handleSetupPost(request: Request, env: Env): Promise<Response> {
  const body = await readRequestBody(request);
  const username = normalizeLower(body.username);
  const password = toStr(body.password);
  const confirmPassword = toStr(body.confirm_password || body.confirmPassword);
  const invite = body.invite_token
    ? await validateInviteToken(env, body.invite_token)
    : await readValidSetupInvite(request, env);

  if (!invite.ok) return renderInviteErrorPage();
  if (!username || username.length < 3 || !/^[a-z0-9._-]+$/.test(username)) {
    return renderSetupPage("Choose a valid username.");
  }
  if (!password || password.length < 8 || password !== confirmPassword) {
    return renderSetupPage("Check the password fields and try again.");
  }

  const existing = await findAdminUserByIdentity(env, username) || await findAdminUserByIdentity(env, invite.email);
  if (existing) {
    return renderSetupPage("Unable to complete setup.");
  }

  const adminUserId = `admin_${crypto.randomUUID().replace(/-/g, "")}`;
  const passwordHash = await hashPasswordPbkdf2(password);
  const createdAt = nowIso();
  const user = await airtableCreate(env, tableId(env, "users"), {
    "Admin User ID": adminUserId,
    admin_user_id: adminUserId,
    Name: invite.name || username,
    name: invite.name || username,
    Email: invite.email,
    email: invite.email,
    Username: username,
    username,
    Role: invite.role,
    role: invite.role,
    Status: "active",
    status: "active",
    "Password Hash": passwordHash,
    password_hash: passwordHash,
    "Password Updated At": createdAt,
    password_updated_at: createdAt,
    "OTP Enabled": false,
    otp_enabled: false,
    "OTP Method": "none",
    otp_method: "none",
    "Created At": createdAt,
    created_at: createdAt,
    "Created By": "system/admin_invite",
    created_by: "system/admin_invite",
  });

  await airtablePatch(env, tableId(env, "invites"), invite.invite.id, {
    Status: "used",
    status: "used",
    "Used At": createdAt,
    used_at: createdAt,
    "Used By Admin User": user.id ? [user.id] : undefined,
    used_by_admin_user: user.id ? [user.id] : undefined,
  });

  await writeActivityLog(env, {
    actorAdminId: user.id,
    action: "admin_invite_used",
    target: invite.invite.id,
    request,
  });

  return redirect(SIGIL_ADMIN_LOGIN_PATH, 302, {
    "set-cookie": clearCookie(SETUP_COOKIE),
  });
}

async function handleLoginPost(request: Request, env: Env): Promise<Response> {
  const body = await readRequestBody(request);
  const identity = toStr(body.identity || body.username || body.email);
  const password = toStr(body.password);
  let user: AirtableRecord | null = null;

  try {
    user = identity ? await findAdminUserByIdentity(env, identity) : null;
    const fields = user?.fields || {};
    const status = normalizeLower(fieldString(fields, ["Status", "status"]));
    const passwordHash = fieldString(fields, ["Password Hash", "password_hash"]);
    const passwordOk = Boolean(passwordHash && password && await verifyPassword(password, passwordHash));

    if (!user || status !== "active" || !passwordOk) {
      if (user) {
        await airtablePatch(env, tableId(env, "users"), user.id, {
          "Failed Login Count": fieldNumber(fields, ["Failed Login Count", "failed_login_count"]) + 1,
          failed_login_count: fieldNumber(fields, ["Failed Login Count", "failed_login_count"]) + 1,
        }).catch(() => undefined);
      }
      await writeActivityLog(env, {
        actorAdminId: user?.id,
        action: "admin_login_failed",
        target: identity ? "admin_login" : "admin_login_missing_identity",
        request,
      });
      return renderLoginPage(true, 401);
    }

    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    const sessionToken = bytesToBase64Url(randomBytes(32));
    const sessionTokenHash = `sha256:${await sha256Hex(sessionToken)}`;
    const adminSessionId = `as_${crypto.randomUUID().replace(/-/g, "")}`;
    const session = await airtableCreate(env, tableId(env, "sessions"), {
      "Admin Session ID": adminSessionId,
      admin_session_id: adminSessionId,
      "Admin User": [user.id],
      admin_user: [user.id],
      "Session Token Hash": sessionTokenHash,
      session_token_hash: sessionTokenHash,
      Status: "active",
      status: "active",
      "Created At": createdAt,
      created_at: createdAt,
      "Expires At": expiresAt,
      expires_at: expiresAt,
      "Last Seen At": createdAt,
      last_seen_at: createdAt,
      "IP Address": clientIp(request),
      ip_address: clientIp(request),
      "User Agent": request.headers.get("user-agent") || "",
      user_agent: request.headers.get("user-agent") || "",
    });

    await airtablePatch(env, tableId(env, "users"), user.id, {
      "Last Login At": createdAt,
      last_login_at: createdAt,
      "Last Login IP": clientIp(request),
      last_login_ip: clientIp(request),
      "Failed Login Count": 0,
      failed_login_count: 0,
    });

    await writeActivityLog(env, {
      actorAdminId: user.id,
      action: "admin_login_success",
      target: user.id,
      request,
    });
    await writeActivityLog(env, {
      actorAdminId: user.id,
      action: "admin_session_created",
      target: session.id,
      request,
    });

    const now = nowSeconds();
    const cookie = await signPayload(
      {
        kind: "sigil_admin_session",
        admin_user_record_id: user.id,
        session_record_id: session.id,
        session_token: sessionToken,
        iat: now,
        exp: now + SESSION_TTL_SECONDS,
      } satisfies SessionCookiePayload,
      env,
    );

    return redirect(SIGIL_ADMIN_SUCCESS_PATH, 302, {
      "set-cookie": buildCookie(SESSION_COOKIE, cookie, SESSION_TTL_SECONDS),
    });
  } catch {
    await writeActivityLog(env, {
      actorAdminId: user?.id,
      action: "admin_login_failed",
      target: "admin_login",
      request,
    });
    return renderLoginPage(true, 401);
  }
}

async function revokeSessionFromCookie(request: Request, env: Env): Promise<void> {
  const session = await getValidSigilAdminSession(request, env);
  if (!session) return;

  await airtablePatch(env, tableId(env, "sessions"), session.sessionRecordId, {
    Status: "revoked",
    status: "revoked",
    "Revoked At": nowIso(),
    revoked_at: nowIso(),
    "Last Seen At": nowIso(),
    last_seen_at: nowIso(),
  }).catch(() => undefined);
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  await revokeSessionFromCookie(request, env);
  return redirect(SIGIL_ADMIN_LOGIN_PATH, 302, {
    "set-cookie": clearCookie(SESSION_COOKIE),
  });
}

export async function handleInternalAdminInviteCreateRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== INTERNAL_ADMIN_INVITE_CREATE_PATH) return null;

  if (request.method !== "POST") {
    return jsonResponse(
      { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } },
      { status: 405 },
    );
  }

  if (!isInternalTokenAuthorized(request, env)) {
    return jsonResponse(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 },
    );
  }

  const body = await readRequestBody(request);
  const email = normalizeLower(body.email);
  const requestedRole = normalizeLower(body.role || "owner");
  const role = ["owner", "admin", "operator"].includes(requestedRole) ? requestedRole : "";
  const expiresHours = Math.max(1, Math.min(Number(body.expires_hours || 24), 24 * 14));

  if (!email || !email.includes("@") || !role) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_INPUT", message: "Invalid invite request" } },
      { status: 400 },
    );
  }

  if (role === "owner" && await activeOrInvitedOwnerExists(env)) {
    return jsonResponse(
      { ok: false, error: { code: "OWNER_INVITE_ALREADY_EXISTS", message: "Owner invite already exists" } },
      { status: 409 },
    );
  }

  if (await pendingInviteForEmailExists(env, email)) {
    return jsonResponse(
      { ok: false, error: { code: "PENDING_INVITE_ALREADY_EXISTS", message: "Pending invite already exists" } },
      { status: 409 },
    );
  }

  const inviteToken = bytesToBase64Url(randomBytes(32));
  const inviteTokenHash = `sha256:${await sha256Hex(inviteToken)}`;
  const inviteId = `inv_${crypto.randomUUID().replace(/-/g, "")}`;
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();

  const invite = await airtableCreate(env, tableId(env, "invites"), {
    "Admin Invite ID": inviteId,
    admin_invite_id: inviteId,
    "Invite Token Hash": inviteTokenHash,
    invite_token_hash: inviteTokenHash,
    Email: email,
    email,
    Role: role,
    role,
    Status: "pending",
    status: "pending",
    "Expires At": expiresAt,
    expires_at: expiresAt,
    "Created At": createdAt,
    created_at: createdAt,
    "Created By": "system/internal_invite_create",
    created_by: "system/internal_invite_create",
  });

  await writeActivityLog(env, {
    action: "admin_invite_created",
    target: `${role}:${email}`,
    request,
  });

  return jsonResponse({
    ok: true,
    invite_id: invite.id,
    email,
    role,
    expires_at: expiresAt,
    setup_url: buildSetupUrl(request, env, inviteToken),
  });
}

export function isSigilAdminPath(pathname: string): boolean {
  return pathname === SIGIL_ADMIN_ROOT || pathname.startsWith(`${SIGIL_ADMIN_ROOT}/`);
}

export function isSigilAdminPublicAuthPath(pathname: string): boolean {
  return (
    pathname === SIGIL_ADMIN_LOGIN_PATH ||
    pathname === SIGIL_ADMIN_SETUP_PATH ||
    pathname === SIGIL_ADMIN_LOGOUT_PATH
  );
}

export async function handleSigilAdminAuthRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === SIGIL_ADMIN_SETUP_PATH && request.method === "GET") {
    return handleSetupGet(request, env);
  }
  if (url.pathname === SIGIL_ADMIN_SETUP_PATH && request.method === "POST") {
    return handleSetupPost(request, env);
  }
  if (url.pathname === SIGIL_ADMIN_LOGIN_PATH && (request.method === "GET" || request.method === "HEAD")) {
    return request.method === "HEAD" ? new Response(null, { status: 200 }) : renderLoginPage();
  }
  if (url.pathname === SIGIL_ADMIN_LOGIN_PATH && request.method === "POST") {
    return handleLoginPost(request, env);
  }
  if (url.pathname === SIGIL_ADMIN_LOGOUT_PATH && (request.method === "GET" || request.method === "POST")) {
    return handleLogout(request, env);
  }

  return null;
}

export function makeSigilAdminLoginRedirect(request: Request): Response {
  const url = new URL(request.url);
  const loginUrl = new URL(SIGIL_ADMIN_LOGIN_PATH, url.origin);
  const next = `${url.pathname}${url.search}`;
  if (next && next !== SIGIL_ADMIN_LOGIN_PATH) {
    loginUrl.searchParams.set("next", next);
  }
  return redirect(loginUrl.toString(), 302);
}

export async function getValidSigilAdminSession(
  request: Request,
  env: Env,
): Promise<SigilAdminSession | null> {
  const value = cookieValue(request, SESSION_COOKIE);
  if (!value) return null;

  const payload = await verifySignedPayload<SessionCookiePayload>(value, env);
  if (!payload || payload.kind !== "sigil_admin_session" || !payload.session_token) return null;

  const computedHash = await sha256Hex(toStr(payload.session_token));
  const sessionTokenHash = `sha256:${computedHash}`;
  const table = tableId(env, "sessions");
  const formula = `OR({Session Token Hash}="${formulaEscape(sessionTokenHash)}",{Session Token Hash}="${formulaEscape(computedHash)}")`;
  const session = await findFirstByFormula(env, table, formula).catch(() => null);
  if (!session) return null;

  if (payload.session_record_id && session.id !== payload.session_record_id) return null;

  const fields = session.fields || {};
  const storedHash = fieldString(fields, ["Session Token Hash", "session_token_hash"]);
  if (!storedHash || !tokenHashMatches(storedHash, computedHash)) return null;

  const status = normalizeLower(fieldString(fields, ["Status", "status"]));
  if (status !== "active") return null;

  const expiresAt = Date.parse(fieldString(fields, ["Expires At", "expires_at"]));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const adminUserLinks = linkedRecordIds(fields, ["Admin User", "admin_user"]);
  const adminUserRecordId = adminUserLinks[0] || toStr(payload.admin_user_record_id);
  if (!adminUserRecordId || (payload.admin_user_record_id && payload.admin_user_record_id !== adminUserRecordId)) {
    return null;
  }

  return {
    adminUserRecordId,
    sessionRecordId: session.id,
    sessionTokenHash,
  };
}

export function sigilAdminBrowserBootstrapScript(): string {
  return `<script>
(() => {
  window.__MMD_ADMIN_GATE__ = {
    logout() {
      location.replace(${JSON.stringify(SIGIL_ADMIN_LOGOUT_PATH)});
    },
    buildHeaders(extraHeaders) {
      return new Headers(extraHeaders || {});
    }
  };
})();
</script>`;
}
