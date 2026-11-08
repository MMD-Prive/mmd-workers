import { ROUTES, findReviewRoute } from "./catalog.mjs";
import { loginPage, catalogPage, reviewPage, errorPage } from "./ui.mjs";

// Isolated workers.dev host ONLY. This Worker never claims a mmdbkk.com route.
export const REVIEW_HOST = "mmd-owner-review-gallery.malemodel-bkk.workers.dev";
export const SESSION_COOKIE = "__Host-mmd_owner_review";
export const SESSION_TTL_SECONDS = 20 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
const CODE_MIN_LENGTH = 24;
const VALID_STATES = new Set(["ready", "empty", "loading", "error", "locked"]);
const CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

function response(request, content, status = 200, type = "text/html; charset=utf-8", extra = {}) {
  return new Response(request.method === "HEAD" ? null : content, {
    status,
    headers: {
      "content-type": type,
      "cache-control": "private, no-store, no-cache, max-age=0",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "content-security-policy": CSP,
      "vary": "Cookie",
      ...extra,
    }
  });
}
function json(request, body, status = 200) {
  return response(request, JSON.stringify(body), status, "application/json; charset=utf-8");
}
function fail(request, status, title, message) {
  return response(request, errorPage(title, message), status);
}
function configured(env) {
  return /^[a-f0-9]{64}$/.test(String(env?.OWNER_REVIEW_CODE_SHA256 || "")) &&
    String(env?.OWNER_REVIEW_SESSION_HMAC_KEY || "").length >= 32;
}
function toBytes(text) { return new TextEncoder().encode(text); }
function toBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function constantTimeHexMatch(expected, actual) {
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(actual)) return false;
  let diff = 0;
  for (let i = 0; i < 64; i += 1) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}
async function hashText(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", toBytes(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
async function hmac(env, message) {
  const key = await crypto.subtle.importKey("raw", toBytes(env.OWNER_REVIEW_SESSION_HMAC_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, toBytes(message))));
}
async function createSession(env, now) {
  const expiration = now + SESSION_TTL_MS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const part = "v1." + expiration + "." + nonce;
  const signature = await hmac(env, REVIEW_HOST + ":" + part);
  return part + "." + signature;
}
function singleCookie(cookieHeader) {
  const values = String(cookieHeader || "").split(";").map(v => v.trim()).filter(v => v.startsWith(SESSION_COOKIE + "="));
  return values.length === 1 ? values[0].slice(SESSION_COOKIE.length + 1) : "";
}
async function authorized(request, env, now) {
  const token = singleCookie(request.headers.get("cookie"));
  const parts = /^v1\.(\d{13})\.([a-zA-Z0-9_-]{22})\.([a-zA-Z0-9_-]{43})$/.exec(token);
  if (!parts) return false;
  const exp = Number(parts[1]);
  if (exp <= now || exp > now + SESSION_TTL_MS) return false;
  const part = "v1." + parts[1] + "." + parts[2];
  const key = await crypto.subtle.importKey("raw", toBytes(env.OWNER_REVIEW_SESSION_HMAC_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let signatureBytes;
  try {
    const padded = parts[3].replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
    signatureBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { return false; }
  return crypto.subtle.verify("HMAC", key, signatureBytes, toBytes(REVIEW_HOST + ":" + part));
}
function cookieValue(value, age = SESSION_TTL_SECONDS) {
  return SESSION_COOKIE + "=" + value + "; Path=/; Max-Age=" + age + "; Secure; HttpOnly; SameSite=Strict";
}
function safeSameOriginPost(request, url) {
  return request.headers.get("origin") === url.origin;
}
async function unlock(request, url, env, now) {
  if (!safeSameOriginPost(request, url)) return json(request, { ok: false, error: "origin_rejected" }, 403);
  if (!String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return fail(request, 415, "ส่งรหัสไม่สำเร็จ", "กรุณาใช้ฟอร์มเข้าระบบตรวจงาน");
  }
  if (Number(request.headers.get("content-length") || 0) > 4096) return json(request, { ok: false, error: "body_too_large" }, 413);
  const raw = await request.text();
  if (raw.length > 4096) return json(request, { ok: false, error: "body_too_large" }, 413);
  const data = new URLSearchParams(raw);
  const codes = data.getAll("code");
  const code = codes.length === 1 ? codes[0] : "";
  if (code.length < CODE_MIN_LENGTH || code.length > 256) {
    return fail(request, 401, "ตรวจรหัสอีกครั้ง", "รหัสสำหรับ Preview นี้ไม่ถูกต้อง กรุณาใช้รหัสล่าสุดที่ได้รับจากเจ้าของระบบ");
  }
  if (!constantTimeHexMatch(env.OWNER_REVIEW_CODE_SHA256, await hashText(code))) {
    return fail(request, 401, "ตรวจรหัสอีกครั้ง", "รหัสสำหรับ Preview นี้ไม่ถูกต้อง กรุณาใช้รหัสล่าสุดที่ได้รับจากเจ้าของระบบ");
  }
  const session = await createSession(env, now);
  return response(request, "", 303, "text/plain; charset=utf-8", {
    location: "/",
    "set-cookie": cookieValue(session)
  });
}
function viewPath(pathname) {
  const match = /^\/view\/([a-z0-9-]+)$/.exec(pathname);
  return match ? match[1] : null;
}
export function createOwnerReviewGalleryWorker(clock = () => Date.now()) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.hostname !== REVIEW_HOST || url.port || url.protocol !== "https:") {
        return json(request, { ok: false, error: "host_not_allowed" }, 404);
      }
      const method = request.method.toUpperCase();
      const now = clock();
      if (url.pathname === "/healthz" && (method === "GET" || method === "HEAD")) {
        return json(request, {
          ok: true, mode: "synthetic_visual_review_only",
          production_authority: false, live_data: false,
          route_candidates: ROUTES.length, configured: configured(env)
        });
      }
      // Fail closed: never serve review screens with missing/short secrets.
      if (!configured(env)) return fail(request, 503, "Preview ยังไม่เปิดใช้งาน", "ผู้ดูแลต้องตั้งค่ารหัสและคีย์แยกสำหรับ Worker นี้ก่อน");
      if (url.pathname === "/unlock" && method === "POST") return unlock(request, url, env, now);
      if (url.pathname === "/logout" && method === "POST") {
        if (!safeSameOriginPost(request, url)) return json(request, { ok: false, error: "origin_rejected" }, 403);
        return response(request, "", 303, "text/plain; charset=utf-8", {
          location: "/", "set-cookie": cookieValue("", 0)
        });
      }
      if (method !== "GET" && method !== "HEAD") {
        return json(request, { ok: false, error: "read_only", reason: "mock_preview_has_no_mutations" }, 405);
      }
      if (!(await authorized(request, env, now))) return response(request, loginPage());
      if (url.pathname === "/" || url.pathname === "/index.html") return response(request, catalogPage());
      if (url.pathname === "/catalog.json") {
        return json(request, { mode: "illustrative_only", routes: ROUTES });
      }
      const id = viewPath(url.pathname);
      const route = id && findReviewRoute(id);
      if (!route) return fail(request, 404, "ไม่พบหน้าตัวอย่าง", "กรุณาเลือกหน้าจากรายการตรวจงาน");
      const state = url.searchParams.get("state") || "ready";
      if (!VALID_STATES.has(state)) return json(request, { ok: false, error: "unknown_preview_state" }, 400);
      return response(request, reviewPage(route, state));
    }
  };
}
export default createOwnerReviewGalleryWorker();
