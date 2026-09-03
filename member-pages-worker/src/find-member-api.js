import { PUBLIC_JSON_BODY_MAX_BYTES, readBoundedJsonObject } from "./bounded-json.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const SESSION_TTL_SECONDS = 15 * 60;
const FIND_REQUEST_PATHS = new Set([
  "/member/api/liff/requests",
  "/member/api/liff/requests/",
]);
const FIND_MODEL_SEARCH_PATHS = new Set([
  "/member/api/liff/find/models/search",
  "/member/api/liff/find/models/search/",
]);
const APPROVED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);
const REQUEST_BODY_KEYS = new Set([
  "service_intent",
  "model_preference",
  "request_note",
  "preferred_date",
  "preferred_time",
  "area",
  "duration",
  "source",
  "promo",
  "code",
]);
const BROWSER_IDENTITY_FIELDS = new Set([
  "line_user_id",
  "lineUserId",
  "line_id",
  "line_display_name",
  "lineDisplayName",
  "line_picture_url",
  "linePictureUrl",
  "sub",
  "profile",
  "line_profile",
  "user",
  "member_id",
  "member_ref",
  "mmd_member_id",
  "tier",
  "points",
  "status",
  "membership_status",
  "payment_status",
  "private_access",
  "entitlements",
  "source_channel",
  "entry_token_hash",
  "liff_session_id",
  "amount",
  "amount_thb",
]);
const INTENTS = new Set(["travel", "private", "recommend", "other"]);
const DURATIONS = new Set(["short", "half_day", "full_day", "unsure"]);
const DURATION_LABELS = {
  short: "ประมาณ 1–3 ชั่วโมง",
  half_day: "ประมาณ 4–6 ชั่วโมง",
  full_day: "ประมาณ 6 ชั่วโมงขึ้นไป",
  unsure: "ยังไม่แน่ใจ",
};
const INTENT_LABELS = {
  travel: "ไปกิน / เที่ยวด้วยกัน",
  private: "Private Request",
  recommend: "ให้ MMD ช่วยแนะนำ",
  other: "อื่น ๆ",
};

export function isFindMemberApiPath(url) {
  const path = normalizePath(url?.pathname || url || "/");
  return FIND_REQUEST_PATHS.has(path) || FIND_MODEL_SEARCH_PATHS.has(path);
}

export async function handleFindMemberApi(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);

  if (request.method === "OPTIONS") {
    if (!isApprovedOrigin(request)) return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
    return withCors(request, new Response(null, { status: 204, headers: apiHeaders("GET,POST,OPTIONS") }));
  }

  if (FIND_REQUEST_PATHS.has(path)) return withCors(request, await handleCreateRequest(request, env));
  if (FIND_MODEL_SEARCH_PATHS.has(path)) return withCors(request, await handleModelSearch(request, env));
  return json({ ok: false, error: { code: "FIND_ROUTE_NOT_FOUND", message: "Unknown Find Your MMD route." } }, 404);
}

async function handleCreateRequest(request, env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  if (!isApprovedOrigin(request)) return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
  if (!hasSessionBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  if (!env.SIGIL_BOOKING_WORKER?.fetch) return unavailable("FIND_REQUEST_UPSTREAM_NOT_CONFIGURED");

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  if (hasUnexpectedKeys(parsed.body, REQUEST_BODY_KEYS) || hasBrowserIdentityClaims(parsed.body)) return browserIdentityRejected();

  const input = normalizeRequestInput(parsed.body);
  if (!input.ok) return json({ ok: false, error: { code: input.code, message: input.message } }, 400);

  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  const memberId = exactToken(auth.session.member_id, 160);
  if (!auth.session.member_exists || !memberId) {
    return commitError(env, auth, "FIND_MEMBER_REQUIRED", "Verified MMD membership is required.", 403);
  }

  const memberName = memberDisplayName(auth.session.member_profile);
  const bookingRef = `mmdreq_${compactUuid()}`;
  const sessionId = `mmdfind_${compactUuid()}`;

  const committed = await commitRotatedSession(env, auth);
  if (!committed.ok) return committed.response;
  const cookies = [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)];

  const resolved = await callSigilBooking(env, "/sigil/api/client/resolve", {
    method: "POST",
    body: {
      booking_ref: bookingRef,
      session_id: sessionId,
      client_nickname: memberName,
      line_or_member_id: memberId,
      source_path: "/find",
      page_path: "/find",
    },
  });
  if (!resolved.ok || resolved.payload?.ok !== true) {
    return json({ ok: false, error: { code: "FIND_MEMBER_RESOLVE_FAILED", message: "MMD ยังตรวจข้อมูลสมาชิกสำหรับคำขอนี้ไม่สำเร็จครับ" } }, upstreamStatus(resolved.status), { cookies });
  }

  const lane = input.service_intent === "private" ? "private" : "public";
  const jobClass = input.service_intent === "private" ? "private_review" : "travel";
  const details = requestDetails(input);
  const intake = await callSigilBooking(env, "/sigil/api/booking/intake", {
    method: "POST",
    body: {
      booking_ref: bookingRef,
      session_id: sessionId,
      request_status: "draft",
      source: "find_your_mmd",
      source_path: "/find",
      client_nickname: memberName,
      line_or_member_id: memberId,
      member_status: resolved.payload.member_status,
      access_scope: resolved.payload.access_scope,
      private_allowed: resolved.payload.can_search_private_models === true,
      lane,
      job_class: jobClass,
      model_scope: lane,
      model_search_query: input.model_preference,
      preference_text: [INTENT_LABELS[input.service_intent], input.model_preference].filter(Boolean).join(" · "),
      preferred_date: input.preferred_date,
      preferred_time: input.preferred_time,
      client_notes: details,
      details,
      city: input.area,
      duration: DURATION_LABELS[input.duration],
      next_url: "https://mmdbkk.com/member/requests",
    },
  });
  if (!intake.ok || intake.payload?.ok !== true) {
    return json({ ok: false, error: { code: "FIND_REQUEST_SAVE_FAILED", message: "MMD ยังบันทึกคำขอนี้ไม่สำเร็จครับ กรุณาลองอีกครั้ง" } }, upstreamStatus(intake.status), { cookies });
  }

  return json({
    ok: true,
    request_ref: bookingRef,
    request_id: bookingRef,
    status: "draft",
    next_action: "review",
  }, 201, { cookies });
}

async function handleModelSearch(request, env) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const origin = request.headers.get("origin") || "";
  if (origin && !isApprovedOrigin(request)) return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
  if (!hasSessionBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  if (!env.SIGIL_BOOKING_WORKER?.fetch) return unavailable("FIND_MODEL_SEARCH_UPSTREAM_NOT_CONFIGURED");

  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.session.member_exists || !exactToken(auth.session.member_id, 160)) {
    return commitError(env, auth, "FIND_MEMBER_REQUIRED", "Verified MMD membership is required.", 403);
  }

  const q = normalizeText(new URL(request.url).searchParams.get("q"), 80);
  if (q === null) return commitError(env, auth, "FIND_MODEL_QUERY_INVALID", "Model search query is invalid.", 400);
  if (!q || [...q].length < 2) return commitJson(env, auth, { ok: true, matched: false, items: [] }, 200);

  const committed = await commitRotatedSession(env, auth);
  if (!committed.ok) return committed.response;
  const cookies = [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)];
  const upstream = await callSigilBooking(env, `/sigil/api/models/search?q=${encodeURIComponent(q)}&scope=public`, { method: "GET" });
  if (!upstream.ok || upstream.payload?.ok !== true) {
    return json({ ok: false, error: { code: "FIND_MODEL_SEARCH_FAILED", message: "MMD ยังค้นหา Model ไม่สำเร็จครับ" } }, upstreamStatus(upstream.status), { cookies });
  }

  const items = Array.isArray(upstream.payload.items)
    ? upstream.payload.items.map(safeModelSummary).filter(Boolean).slice(0, 8)
    : [];
  return json({ ok: true, matched: items.length > 0, items }, 200, { cookies });
}

function normalizeRequestInput(body) {
  const serviceIntent = String(body.service_intent || "").trim().toLowerCase();
  if (!INTENTS.has(serviceIntent)) return invalid("FIND_SERVICE_INTENT_REQUIRED", "เลือกสิ่งที่ต้องการให้ MMD ช่วยก่อนครับ");

  const preferredDate = normalizeDate(body.preferred_date);
  if (!preferredDate) return invalid("FIND_DATE_INVALID", "วันที่ที่ต้องการไม่ถูกต้องครับ");
  const preferredTime = normalizeTime(body.preferred_time);
  if (!preferredTime) return invalid("FIND_TIME_INVALID", "เวลาที่ต้องการไม่ถูกต้องครับ");

  const area = normalizeText(body.area, 120);
  if (!area) return invalid("FIND_AREA_REQUIRED", "ใส่พื้นที่คร่าว ๆ ก่อนครับ");
  const duration = String(body.duration || "").trim().toLowerCase();
  if (!DURATIONS.has(duration)) return invalid("FIND_DURATION_REQUIRED", "เลือกระยะเวลาคร่าว ๆ ก่อนครับ");

  const modelPreference = normalizeText(body.model_preference, 80);
  const requestNote = normalizeText(body.request_note, 700);
  if (modelPreference === null || requestNote === null) return invalid("FIND_TEXT_INVALID", "รายละเอียดคำขอมีอักขระหรือความยาวที่ไม่รองรับครับ");

  return {
    ok: true,
    service_intent: serviceIntent,
    model_preference: modelPreference,
    request_note: requestNote,
    preferred_date: preferredDate,
    preferred_time: preferredTime,
    area,
    duration,
  };
}

function requestDetails(input) {
  return [
    `Request: ${INTENT_LABELS[input.service_intent]}`,
    input.area ? `Area: ${input.area}` : "",
    input.duration ? `Duration: ${DURATION_LABELS[input.duration]}` : "",
    input.model_preference ? `Model: ${input.model_preference}` : "",
    input.request_note ? `Note: ${input.request_note}` : "",
  ].filter(Boolean).join("\n").slice(0, 1200);
}

function safeModelSummary(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const displayName = normalizeText(item.display_name || item.working_name || item.nickname, 80);
  if (!displayName) return null;
  const coverUrl = safePublicImageUrl(item.cover_url || item.public_image_url);
  return {
    display_name: displayName,
    ...(coverUrl ? { cover_url: coverUrl } : {}),
  };
}

async function callSigilBooking(env, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = new Headers({ accept: "application/json" });
    const init = { method: options.method || "GET", headers, signal: controller.signal };
    if (options.body) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(options.body);
    }
    const response = await env.SIGIL_BOOKING_WORKER.fetch(new Request(`https://sigil-booking.internal${path}`, init));
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, status: 502, payload: null };
    }
    return { ok: response.ok && payload.ok === true, status: response.status, payload };
  } catch (error) {
    return { ok: false, status: error?.name === "AbortError" ? 504 : 502, payload: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticateAndRotate(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return authFailure("LIFF_SESSION_REQUIRED", "Authenticated LIFF session required.");
  const hash = await keyedDigest(env, `session:${token}`);
  const key = `liff:session:${hash}`;
  const session = await env.LIFF_IDENTITY_KV.get(key, "json");
  if (!session || Number(session.expires_at || 0) <= Date.now()) {
    if (session) await env.LIFF_IDENTITY_KV.delete(key);
    return authFailure("LIFF_SESSION_INVALID", "LIFF session is invalid or expired.");
  }
  const newToken = randomToken(32);
  const newHash = await keyedDigest(env, `session:${newToken}`);
  session.rotation = Number(session.rotation || 0) + 1;
  session.expires_at = Date.now() + SESSION_TTL_SECONDS * 1000;
  return { ok: true, session, key, newToken, newHash };
}

async function commitRotatedSession(env, auth) {
  try {
    await env.LIFF_IDENTITY_KV.put(`liff:session:${auth.newHash}`, JSON.stringify(auth.session), { expirationTtl: SESSION_TTL_SECONDS });
    await env.LIFF_IDENTITY_KV.delete(auth.key);
    return { ok: true };
  } catch {
    return { ok: false, response: unavailable("LIFF_GATEWAY_STORAGE_UNAVAILABLE") };
  }
}

async function commitJson(env, auth, payload, status) {
  const committed = await commitRotatedSession(env, auth);
  if (!committed.ok) return committed.response;
  return json(payload, status, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] });
}

async function commitError(env, auth, code, message, status) {
  return commitJson(env, auth, { ok: false, error: { code, message } }, status);
}

async function keyedDigest(env, value) {
  const digest = await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(env) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(String(env.LIFF_SESSION_SECRET)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function compactUuid() { return crypto.randomUUID().replace(/-/g, ""); }
function memberDisplayName(profile = {}) {
  return normalizeText(profile?.customer_360?.member?.display_name || profile?.display_name || "สมาชิก MMD", 120) || "สมาชิก MMD";
}
function normalizeText(value, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value).replace(/\r\n?/g, "\n").trim();
  if (!text || [...text].length > maxLength || /[<>]/.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  return text;
}
function normalizeDate(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (text < localToday) return "";
  const max = new Date();
  max.setFullYear(max.getFullYear() + 2);
  const maxText = `${max.getFullYear()}-${String(max.getMonth() + 1).padStart(2, "0")}-${String(max.getDate()).padStart(2, "0")}`;
  return text <= maxText ? text : "";
}
function normalizeTime(value) {
  const text = String(value || "").trim();
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? text : "";
}
function exactToken(value, maxLength = 8192) {
  const text = String(value || "").trim();
  return text && text.length <= maxLength && /^[A-Za-z0-9._~-]+$/.test(text) ? text : "";
}
function safePublicImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    if (!host.endsWith("website-files.com") && !host.endsWith("webflow.com") && !host.endsWith("r2.dev") && !host.endsWith("mmdbkk.com")) return "";
    return url.toString().slice(0, 1000);
  } catch { return ""; }
}
function hasSessionBindings(env) { return Boolean(env.LIFF_IDENTITY_KV && String(env.LIFF_SESSION_SECRET || "").length >= 16); }
function hasBrowserIdentityClaims(body) { return Object.keys(body || {}).some((key) => BROWSER_IDENTITY_FIELDS.has(key)); }
function hasUnexpectedKeys(body, allowed) { return Object.keys(body || {}).some((key) => !allowed.has(key)); }
function normalizePath(pathname) { return String(pathname || "/").toLowerCase().replace(/\/{2,}/g, "/"); }
function cookieValue(request, name) { for (const part of (request.headers.get("cookie") || "").split(";")) { const [key, ...rest] = part.trim().split("="); if (key === name) return exactToken(rest.join("="), 8192); } return ""; }
function sessionCookie(value, maxAge) { return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`; }
function invalid(code, message) { return { ok: false, code, message }; }
function authFailure(code, message) { return { ok: false, response: json({ ok: false, error: { code, message } }, 401) }; }
function browserIdentityRejected() { return json({ ok: false, error: { code: "BROWSER_IDENTITY_REJECTED", message: "Browser-supplied identity fields are not accepted." } }, 400); }
function methodNotAllowed(method) { return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `${method} required` } }, 405, { allow: method }); }
function unavailable(code) { return json({ ok: false, error: { code, message: "MMD service is temporarily unavailable." } }, 503); }
function upstreamStatus(status) { return status === 504 ? 504 : status >= 400 && status <= 599 ? status : 502; }
function isApprovedOrigin(request) { return APPROVED_ORIGINS.has(request.headers.get("origin") || ""); }
function withCors(request, response) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin") || "";
  if (APPROVED_ORIGINS.has(origin)) headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function readJson(request) {
  const parsed = await readBoundedJsonObject(request, PUBLIC_JSON_BODY_MAX_BYTES);
  return parsed.ok ? { ok: true, body: parsed.value } : { ok: false, response: json({ ok: false, error: { code: parsed.code, message: parsed.message } }, parsed.status) };
}
function apiHeaders(methods = "GET,POST,OPTIONS") { return { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-methods": methods, "access-control-allow-headers": "content-type", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" }; }
function json(body, status = 200, options = {}) {
  const headers = new Headers(apiHeaders());
  if (options.allow) headers.set("allow", options.allow);
  for (const cookie of options.cookies || []) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
