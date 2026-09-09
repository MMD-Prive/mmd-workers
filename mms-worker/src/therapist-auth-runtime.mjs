const AIRTABLE_API = "https://api.airtable.com/v0";
const LINE_VERIFY_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify";
const LINE_ISSUER = "https://access.line.me";

const AUTH_PREFIX = "/male-massage/therapists/api/auth";
const AUTH_LINE_PATH = `${AUTH_PREFIX}/line`;
const AUTH_ME_PATH = `${AUTH_PREFIX}/me`;
const AUTH_LOGOUT_PATH = `${AUTH_PREFIX}/logout`;

const SESSION_COOKIE = "__Secure-mms_therapist_session";
const SESSION_ROLE = "mms_therapist";
const SESSION_VERSION = 1;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_BODY_CHARS = 20_000;

const THERAPIST_FIELDS = [
  "Therapist ID",
  "Display Name",
  "Availability Status",
  "Status",
  "Therapist Auth Status",
  "LINE Subject Hash",
  "Therapist Access Invite Hash",
  "Therapist Access Invite Expires At",
  "Therapist Access Linked At",
  "Therapist Access Last Login At",
];

export function isMmsTherapistAuthRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === AUTH_LINE_PATH || path === AUTH_ME_PATH || path === AUTH_LOGOUT_PATH;
}

export async function handleMmsTherapistAuthRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = String(request.method || "GET").toUpperCase();

  if (!isMmsTherapistAuthRequest(path)) {
    return authJson({ ok: false, error: { code: "NOT_FOUND" } }, 404, request, env);
  }

  if (method === "OPTIONS") {
    requireTrustedOrigin(request, env);
    return new Response(null, { status: 204, headers: responseHeaders(request, env) });
  }

  if (path === AUTH_LOGOUT_PATH) {
    if (method !== "POST") return methodNotAllowed("POST", request, env);
    requireTrustedOrigin(request, env);
    return new Response(null, {
      status: 204,
      headers: {
        ...responseHeaders(request, env),
        "Set-Cookie": clearSessionCookie(),
      },
    });
  }

  requireAuthEnabled(env);

  if (path === AUTH_LINE_PATH) {
    if (method !== "POST") return methodNotAllowed("POST", request, env);
    requireTrustedOrigin(request, env);
    return loginWithLine(request, env);
  }

  if (path === AUTH_ME_PATH) {
    if (method !== "GET") return methodNotAllowed("GET", request, env);
    return currentTherapist(request, env);
  }

  return authJson({ ok: false, error: { code: "NOT_FOUND" } }, 404, request, env);
}

export function therapistAuthErrorResponse(error, request, env = {}) {
  if (error instanceof TherapistAuthError) {
    return authJson({ ok: false, error: { code: error.code } }, error.status, request, env);
  }
  return authJson({ ok: false, error: { code: "THERAPIST_AUTH_UNAVAILABLE" } }, 503, request, env);
}

async function loginWithLine(request, env) {
  requireRuntimeConfig(env);
  const body = await readJson(request);
  const idToken = cleanToken(body.id_token, 12_000);
  const inviteToken = cleanToken(body.invite_token, 1_024, true);
  if (!idToken) throw authError(400, "ID_TOKEN_REQUIRED");

  const verified = await verifyLineIdToken(idToken, env);
  const subjectHash = await lineSubjectHash(verified.sub, env);

  let therapist = await findUniqueTherapist(env, "LINE Subject Hash", subjectHash);
  const now = new Date();

  if (!therapist) {
    if (!inviteToken) throw authError(403, "THERAPIST_LINK_REQUIRED");
    therapist = await claimTherapistInvite(env, inviteToken, subjectHash, now);
  } else {
    assertTherapistCanAuthenticate(therapist);
    therapist = await updateTherapist(env, therapist.id, {
      "Therapist Access Last Login At": now.toISOString(),
    });
  }

  assertTherapistCanAuthenticate(therapist);
  const therapistId = clean(therapist.fields?.["Therapist ID"], 80);
  const sessionToken = await createSessionToken({ therapist_id: therapistId }, env, now);

  return authJson({
    ok: true,
    data: safeAuthProfile(therapist),
  }, 200, request, env, {
    "Set-Cookie": sessionCookie(sessionToken),
  });
}

async function currentTherapist(request, env) {
  requireRuntimeConfig(env);
  const cookie = readCookie(request.headers.get("Cookie") || "", SESSION_COOKIE);
  if (!cookie) throw authError(401, "THERAPIST_SESSION_REQUIRED");

  const session = await verifySessionToken(cookie, env);
  const therapist = await findUniqueTherapist(env, "Therapist ID", session.therapist_id);
  if (!therapist) throw authError(401, "THERAPIST_SESSION_INVALID");
  assertTherapistCanAuthenticate(therapist);

  return authJson({ ok: true, data: safeAuthProfile(therapist) }, 200, request, env);
}

async function claimTherapistInvite(env, inviteToken, subjectHash, now) {
  const inviteHash = await sha256Hex(inviteToken);
  const record = await findUniqueTherapist(env, "Therapist Access Invite Hash", inviteHash);
  if (!record) throw authError(403, "THERAPIST_ACCESS_DENIED");

  const fields = record.fields || {};
  if (clean(fields.Status, 40) !== "Active") throw authError(403, "THERAPIST_ACCESS_DENIED");
  if (clean(fields["Therapist Auth Status"], 40) !== "Unlinked") throw authError(403, "THERAPIST_ACCESS_DENIED");
  if (clean(fields["LINE Subject Hash"], 200)) throw authError(403, "THERAPIST_ACCESS_DENIED");

  const expiresAt = Date.parse(clean(fields["Therapist Access Invite Expires At"], 80));
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw authError(403, "THERAPIST_ACCESS_DENIED");
  }

  return updateTherapist(env, record.id, {
    "LINE Subject Hash": subjectHash,
    "Therapist Auth Status": "Active",
    "Therapist Access Linked At": now.toISOString(),
    "Therapist Access Last Login At": now.toISOString(),
    "Therapist Access Invite Hash": null,
    "Therapist Access Invite Expires At": null,
  });
}

function assertTherapistCanAuthenticate(record) {
  const fields = record?.fields || {};
  const therapistId = clean(fields["Therapist ID"], 80);
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(therapistId)) throw authError(403, "THERAPIST_ACCESS_DENIED");
  if (clean(fields.Status, 40) !== "Active") throw authError(403, "THERAPIST_ACCESS_DENIED");
  if (clean(fields["Therapist Auth Status"], 40) !== "Active") throw authError(403, "THERAPIST_ACCESS_DENIED");
  if (!clean(fields["LINE Subject Hash"], 200)) throw authError(403, "THERAPIST_ACCESS_DENIED");
}

function safeAuthProfile(record) {
  const fields = record?.fields || {};
  return {
    therapist_id: clean(fields["Therapist ID"], 80),
    display_name: clean(fields["Display Name"], 120),
    availability_status: clean(fields["Availability Status"], 40) || "Unavailable",
    role: SESSION_ROLE,
    next_route: "/male-massage/therapists/me",
  };
}

async function verifyLineIdToken(idToken, env) {
  const expectedChannelId = clean(env.MMS_THERAPIST_LINE_CHANNEL_ID, 80);
  if (!expectedChannelId) throw authError(503, "THERAPIST_AUTH_NOT_CONFIGURED");

  const body = new URLSearchParams({
    id_token: idToken,
    client_id: expectedChannelId,
  });

  let response;
  try {
    response = await fetch(LINE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw authError(503, "LINE_VERIFY_UNAVAILABLE");
  }

  if (!response.ok) throw authError(401, "LINE_ID_TOKEN_INVALID");

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw authError(503, "LINE_VERIFY_UNAVAILABLE");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const subject = clean(payload?.sub, 160);
  const audience = clean(payload?.aud, 80);
  const issuer = clean(payload?.iss, 100);
  const exp = Number(payload?.exp);
  const iat = Number(payload?.iat);

  if (issuer !== LINE_ISSUER || audience !== expectedChannelId) throw authError(401, "LINE_ID_TOKEN_INVALID");
  if (!subject || /\s/.test(subject)) throw authError(401, "LINE_ID_TOKEN_INVALID");
  if (!Number.isFinite(exp) || exp <= nowSeconds) throw authError(401, "LINE_ID_TOKEN_INVALID");
  if (!Number.isFinite(iat) || iat > nowSeconds + 300) throw authError(401, "LINE_ID_TOKEN_INVALID");

  return { sub: subject };
}

async function lineSubjectHash(subject, env) {
  const channelId = clean(env.MMS_THERAPIST_LINE_CHANNEL_ID, 80);
  const pepper = String(env.MMS_THERAPIST_IDENTITY_PEPPER || "");
  if (pepper.length < 32) throw authError(503, "THERAPIST_AUTH_NOT_CONFIGURED");
  return hmacHex(pepper, `mms-therapist-line-v1\u0000${channelId}\u0000${subject}`);
}

async function createSessionToken({ therapist_id }, env, now = new Date()) {
  const secret = sessionSecret(env);
  const iat = Math.floor(now.getTime() / 1000);
  const payload = {
    v: SESSION_VERSION,
    role: SESSION_ROLE,
    therapist_id,
    iat,
    exp: iat + SESSION_TTL_SECONDS,
  };
  const encoded = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await hmacHex(secret, `mms-therapist-session-v1.${encoded}`);
  return `v1.${encoded}.${signature}`;
}

async function verifySessionToken(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw authError(401, "THERAPIST_SESSION_INVALID");
  const [, encoded, signature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[a-f0-9]{64}$/.test(signature)) {
    throw authError(401, "THERAPIST_SESSION_INVALID");
  }

  const expected = await hmacHex(sessionSecret(env), `mms-therapist-session-v1.${encoded}`);
  if (!constantTimeEqual(signature, expected)) throw authError(401, "THERAPIST_SESSION_INVALID");

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeText(encoded));
  } catch {
    throw authError(401, "THERAPIST_SESSION_INVALID");
  }

  const now = Math.floor(Date.now() / 1000);
  const therapistId = clean(payload?.therapist_id, 80);
  if (payload?.v !== SESSION_VERSION || payload?.role !== SESSION_ROLE) throw authError(401, "THERAPIST_SESSION_INVALID");
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(therapistId)) throw authError(401, "THERAPIST_SESSION_INVALID");
  if (!Number.isFinite(payload?.iat) || !Number.isFinite(payload?.exp)) throw authError(401, "THERAPIST_SESSION_INVALID");
  if (payload.exp <= now || payload.iat > now + 300 || payload.exp - payload.iat > SESSION_TTL_SECONDS) {
    throw authError(401, "THERAPIST_SESSION_INVALID");
  }

  return { therapist_id: therapistId, role: SESSION_ROLE };
}

function sessionSecret(env) {
  const secret = String(env.MMS_THERAPIST_SESSION_SECRET || "");
  if (secret.length < 32) throw authError(503, "THERAPIST_AUTH_NOT_CONFIGURED");
  return secret;
}

async function findUniqueTherapist(env, fieldName, value) {
  const table = tableId(env);
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{${fieldName}}=${formulaString(value)}`);
  for (const field of THERAPIST_FIELDS) url.searchParams.append("fields[]", field);

  const response = await airtableFetch(url, { method: "GET" }, env);
  const records = Array.isArray(response.records) ? response.records : [];
  if (records.length > 1) throw authError(503, "THERAPIST_IDENTITY_CONFLICT");
  return records[0] || null;
}

async function updateTherapist(env, recordId, fields) {
  if (!/^rec[A-Za-z0-9]{10,30}$/.test(String(recordId || ""))) {
    throw authError(503, "THERAPIST_AUTH_UNAVAILABLE");
  }
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableId(env))}/${encodeURIComponent(recordId)}`;
  return airtableFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  }, env);
}

async function airtableFetch(url, init, env) {
  const token = String(env.AIRTABLE_API_TOKEN || "");
  if (!token || !clean(env.AIRTABLE_BASE_ID, 80)) throw authError(503, "THERAPIST_AUTH_NOT_CONFIGURED");

  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
  } catch {
    throw authError(503, "THERAPIST_AUTH_UNAVAILABLE");
  }

  if (!response.ok) throw authError(503, "THERAPIST_AUTH_UNAVAILABLE");
  try {
    return await response.json();
  } catch {
    throw authError(503, "THERAPIST_AUTH_UNAVAILABLE");
  }
}

function tableId(env) {
  const id = clean(env.AIRTABLE_THERAPISTS_TABLE_ID, 80);
  if (!/^tbl[A-Za-z0-9]{10,30}$/.test(id)) throw authError(503, "THERAPIST_AUTH_NOT_CONFIGURED");
  return id;
}

function requireRuntimeConfig(env) {
  if (!clean(env.MMS_THERAPIST_LINE_CHANNEL_ID, 80)) throw authError(503, "THERAPIST_AUTH_NOT_CONFIGURED");
  if (String(env.MMS_THERAPIST_SESSION_SECRET || "").length < 32) throw authError(503, "THERAPIST_AUTH_NOT_CONFIGURED");
  if (String(env.MMS_THERAPIST_IDENTITY_PEPPER || "").length < 32) throw authError(503, "THERAPIST_AUTH_NOT_CONFIGURED");
  if (!String(env.AIRTABLE_API_TOKEN || "") || !clean(env.AIRTABLE_BASE_ID, 80) || !tableId(env)) {
    throw authError(503, "THERAPIST_AUTH_NOT_CONFIGURED");
  }
}

function requireAuthEnabled(env) {
  if (String(env.MMS_THERAPIST_AUTH_ENABLED || "").toLowerCase() !== "true") {
    throw authError(503, "THERAPIST_AUTH_NOT_ENABLED");
  }
}

function requireTrustedOrigin(request, env) {
  const origin = clean(request.headers.get("Origin"), 300);
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (!origin || !allowed.has(origin)) throw authError(403, "ORIGIN_NOT_ALLOWED");
}

async function readJson(request) {
  let text;
  try {
    text = await request.text();
  } catch {
    throw authError(400, "BAD_REQUEST");
  }
  if (!text || text.length > MAX_BODY_CHARS) throw authError(400, "BAD_REQUEST");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bad");
    return value;
  } catch {
    throw authError(400, "BAD_REQUEST");
  }
}

function cleanToken(value, max, optional = false) {
  if (value === undefined || value === null || value === "") return optional ? "" : "";
  if (typeof value !== "string") throw authError(400, "BAD_REQUEST");
  const token = value.trim();
  if (!token || token.length > max || /\s/.test(token)) throw authError(400, "BAD_REQUEST");
  return token;
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return part.slice(index + 1).trim();
  }
  return "";
}

function sessionCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/male-massage/therapists; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/male-massage/therapists; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function responseHeaders(request, env) {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  const origin = clean(request?.headers?.get?.("Origin"), 300);
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (origin && allowed.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    headers.Vary = "Origin";
  }
  return headers;
}

function authJson(payload, status, request, env, extraHeaders = {}) {
  return Response.json(payload, {
    status,
    headers: {
      ...responseHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function methodNotAllowed(allow, request, env) {
  return authJson({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, request, env, { Allow: allow });
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function normalizePath(pathname = "") {
  const path = String(pathname || "").trim() || "/";
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function clean(value, max = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, max);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return bytesToHex(digest);
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value))));
  return bytesToHex(signature);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncodeText(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeText(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

class TherapistAuthError extends Error {
  constructor(status, code) {
    super(code);
    this.name = "TherapistAuthError";
    this.status = status;
    this.code = code;
  }
}

function authError(status, code) {
  return new TherapistAuthError(status, code);
}

export const therapistAuthContract = Object.freeze({
  paths: Object.freeze({ line: AUTH_LINE_PATH, me: AUTH_ME_PATH, logout: AUTH_LOGOUT_PATH }),
  session: Object.freeze({ role: SESSION_ROLE, cookie: SESSION_COOKIE, ttl_seconds: SESSION_TTL_SECONDS }),
  required_therapist_fields: Object.freeze([...THERAPIST_FIELDS]),
});
