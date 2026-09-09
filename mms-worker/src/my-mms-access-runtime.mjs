const AIRTABLE_API = "https://api.airtable.com/v0";
const INTERNAL_HOST = "mms.internal";
const SELF_ACCESS_PATH = "/male-massage/therapists/api/app/access";
const ADMIN_ACCESS_RE = /^\/internal\/mms\/admin\/therapists\/([A-Za-z0-9_-]{4,80})\/my-mms-access$/;
const APP_ROUTE = "/male-massage/therapists/app";
const SESSION_COOKIE = "__Secure-mms_therapist_session";
const SESSION_ROLE = "mms_therapist";
const SESSION_VERSION = 1;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MY_MMS_VALUES = new Set(["Locked", "Approved", "Revoked"]);

export function isMyMmsAccessRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === SELF_ACCESS_PATH || ADMIN_ACCESS_RE.test(path);
}

export async function maybeHandleMyMmsAccess(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (!isMyMmsAccessRequest(path)) return null;

  try {
    if (path === SELF_ACCESS_PATH) {
      if (request.method === "OPTIONS") {
        requireTrustedOrigin(request, env);
        return new Response(null, { status: 204, headers: responseHeaders(request, env) });
      }
      if (request.method !== "GET") return methodNotAllowed("GET", request, env);
      const therapist = await requireCurrentTherapist(request, env);
      return json({ ok: true, data: safeAccessProjection(therapist) }, 200, request, env);
    }

    const adminMatch = path.match(ADMIN_ACCESS_RE);
    if (adminMatch) {
      await requireInternalRequest(request, env);
      if (request.method !== "PATCH") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
      return json(await patchAdminAccess(request, env, adminMatch[1]));
    }

    return null;
  } catch (error) {
    if (error instanceof MyMmsAccessError) {
      return json({ ok: false, error: { code: error.code } }, error.status, request, env);
    }
    return json({ ok: false, error: { code: "MY_MMS_ACCESS_UNAVAILABLE" } }, 503, request, env);
  }
}

export async function requireMyMmsApprovedTherapist(request, env = {}) {
  const therapist = await requireCurrentTherapist(request, env);
  if (normalizeAccess(therapist.fields?.["MY MMS Access"]) !== "Approved") {
    throw accessError(403, "MY_MMS_ACCESS_REQUIRED");
  }
  return therapist;
}

async function patchAdminAccess(request, env, therapistId) {
  const body = await readJson(request);
  const allowed = new Set(["access", "review_note", "approved_by"]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw accessError(400, "UNKNOWN_FIELD");
  }

  const requested = clean(body.access, 20);
  const normalized = requested ? `${requested[0].toUpperCase()}${requested.slice(1).toLowerCase()}` : "";
  if (!MY_MMS_VALUES.has(normalized)) throw accessError(400, "MY_MMS_ACCESS_INVALID");

  const record = await findUniqueTherapist(env, therapistId);
  if (!record) throw accessError(404, "THERAPIST_NOT_FOUND");

  const now = new Date().toISOString();
  const fields = {
    "MY MMS Access": normalized,
    "MY MMS Review Note": clean(body.review_note, 4000) || null,
  };

  if (normalized === "Approved") {
    fields["MY MMS Approved At"] = now;
    fields["MY MMS Approved By"] = clean(body.approved_by, 160) || "internal/admin/mms";
  }

  const updated = await updateTherapist(env, record.id, fields);
  return {
    ok: true,
    therapist: adminAccessProjection(updated),
  };
}

async function requireCurrentTherapist(request, env) {
  requireRuntimeConfig(env);
  const cookie = readCookie(request.headers.get("Cookie") || "", SESSION_COOKIE);
  if (!cookie) throw accessError(401, "THERAPIST_SESSION_REQUIRED");
  const session = await verifySessionToken(cookie, env);
  const record = await findUniqueTherapist(env, session.therapist_id);
  if (!record) throw accessError(401, "THERAPIST_SESSION_INVALID");
  assertTherapistCanAuthenticate(record);
  return record;
}

function assertTherapistCanAuthenticate(record) {
  const fields = record?.fields || {};
  const therapistId = clean(fields["Therapist ID"], 80);
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(therapistId)) throw accessError(403, "THERAPIST_ACCESS_DENIED");
  if (clean(fields.Status, 40) !== "Active") throw accessError(403, "THERAPIST_ACCESS_DENIED");
  if (clean(fields["Therapist Auth Status"], 40) !== "Active") throw accessError(403, "THERAPIST_ACCESS_DENIED");
  if (!clean(fields["LINE Subject Hash"], 200)) throw accessError(403, "THERAPIST_ACCESS_DENIED");
}

function safeAccessProjection(record) {
  const fields = record?.fields || {};
  const access = normalizeAccess(fields["MY MMS Access"]);
  return {
    therapist_id: clean(fields["Therapist ID"], 80),
    access: access.toLowerCase(),
    can_open: access === "Approved",
    app_route: access === "Approved" ? APP_ROUTE : null,
    approved_at: access === "Approved" ? clean(fields["MY MMS Approved At"], 80) || null : null,
  };
}

function adminAccessProjection(record) {
  const fields = record?.fields || {};
  const access = normalizeAccess(fields["MY MMS Access"]);
  return {
    therapist_id: clean(fields["Therapist ID"], 80),
    display_name: clean(fields["Display Name"], 120),
    my_mms_access: access.toLowerCase(),
    my_mms_can_open: access === "Approved",
    my_mms_approved_at: clean(fields["MY MMS Approved At"], 80) || null,
    my_mms_approved_by: clean(fields["MY MMS Approved By"], 160) || null,
    my_mms_review_note: clean(fields["MY MMS Review Note"], 4000) || "",
  };
}

function normalizeAccess(value) {
  const cleanValue = clean(value, 20);
  return MY_MMS_VALUES.has(cleanValue) ? cleanValue : "Locked";
}

async function findUniqueTherapist(env, therapistId) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableId(env))}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{Therapist ID}=${formulaString(therapistId)}`);
  for (const field of [
    "Therapist ID",
    "Display Name",
    "Status",
    "Therapist Auth Status",
    "LINE Subject Hash",
    "MY MMS Access",
    "MY MMS Approved At",
    "MY MMS Approved By",
    "MY MMS Review Note",
  ]) url.searchParams.append("fields[]", field);

  const data = await airtableFetch(url, { method: "GET" }, env);
  const records = Array.isArray(data.records) ? data.records : [];
  if (records.length > 1) throw accessError(503, "THERAPIST_IDENTITY_CONFLICT");
  return records[0] || null;
}

async function updateTherapist(env, recordId, fields) {
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableId(env))}/${encodeURIComponent(recordId)}`;
  return airtableFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  }, env);
}

async function airtableFetch(url, init, env) {
  if (!String(env.AIRTABLE_API_TOKEN || "")) throw accessError(503, "MY_MMS_ACCESS_NOT_CONFIGURED");
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`, ...(init.headers || {}) },
    });
  } catch {
    throw accessError(503, "MY_MMS_ACCESS_UNAVAILABLE");
  }
  if (!response.ok) throw accessError(503, "MY_MMS_ACCESS_UNAVAILABLE");
  try { return await response.json(); }
  catch { throw accessError(503, "MY_MMS_ACCESS_UNAVAILABLE"); }
}

function tableId(env) {
  const id = clean(env.AIRTABLE_THERAPISTS_TABLE_ID, 80);
  if (!/^tbl[A-Za-z0-9]{10,30}$/.test(id)) throw accessError(503, "MY_MMS_ACCESS_NOT_CONFIGURED");
  return id;
}

function requireRuntimeConfig(env) {
  if (!clean(env.AIRTABLE_BASE_ID, 80) || !String(env.AIRTABLE_API_TOKEN || "") || !tableId(env)) {
    throw accessError(503, "MY_MMS_ACCESS_NOT_CONFIGURED");
  }
  sessionSecret(env);
}

async function requireInternalRequest(request, env) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (hostname !== String(env.MMS_INTERNAL_HOST || INTERNAL_HOST).toLowerCase()) throw accessError(404, "NOT_FOUND");
}

function requireTrustedOrigin(request, env) {
  const origin = clean(request.headers.get("Origin"), 300);
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (!origin || !allowed.has(origin)) throw accessError(403, "ORIGIN_NOT_ALLOWED");
}

async function verifySessionToken(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw accessError(401, "THERAPIST_SESSION_INVALID");
  const [, encoded, signature] = parts;
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[a-f0-9]{64}$/.test(signature)) throw accessError(401, "THERAPIST_SESSION_INVALID");
  const expected = await hmacHex(sessionSecret(env), `mms-therapist-session-v1.${encoded}`);
  if (!constantTimeEqual(signature, expected)) throw accessError(401, "THERAPIST_SESSION_INVALID");
  let payload;
  try { payload = JSON.parse(base64UrlDecodeText(encoded)); }
  catch { throw accessError(401, "THERAPIST_SESSION_INVALID"); }
  const now = Math.floor(Date.now() / 1000);
  const therapistId = clean(payload?.therapist_id, 80);
  if (payload?.v !== SESSION_VERSION || payload?.role !== SESSION_ROLE) throw accessError(401, "THERAPIST_SESSION_INVALID");
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(therapistId)) throw accessError(401, "THERAPIST_SESSION_INVALID");
  if (!Number.isFinite(payload?.iat) || !Number.isFinite(payload?.exp)) throw accessError(401, "THERAPIST_SESSION_INVALID");
  if (payload.exp <= now || payload.iat > now + 300 || payload.exp - payload.iat > SESSION_TTL_SECONDS) throw accessError(401, "THERAPIST_SESSION_INVALID");
  return { therapist_id: therapistId, role: SESSION_ROLE };
}

function sessionSecret(env) {
  const secret = String(env.MMS_THERAPIST_SESSION_SECRET || "");
  if (secret.length < 32) throw accessError(503, "MY_MMS_ACCESS_NOT_CONFIGURED");
  return secret;
}

async function readJson(request) {
  const type = String(request.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("application/json")) throw accessError(415, "JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 16 * 1024) throw accessError(413, "JSON_TOO_LARGE");
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bad");
    return value;
  } catch {
    throw accessError(400, "INVALID_JSON");
  }
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
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
    headers["Access-Control-Allow-Methods"] = "GET,OPTIONS";
    headers.Vary = "Origin";
  }
  return headers;
}

function json(payload, status = 200, request = null, env = {}) {
  return Response.json(payload, { status, headers: responseHeaders(request, env) });
}

function methodNotAllowed(allow, request, env) {
  return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, request, env);
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

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value))));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlDecodeText(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

class MyMmsAccessError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function accessError(status, code) {
  return new MyMmsAccessError(status, code);
}

export const myMmsAccessContract = Object.freeze({
  self_access_path: SELF_ACCESS_PATH,
  admin_access_pattern: "/internal/mms/admin/therapists/:therapist_id/my-mms-access",
  app_route: APP_ROUTE,
  states: Object.freeze(["locked", "approved", "revoked"]),
  fail_closed_default: "locked",
});
