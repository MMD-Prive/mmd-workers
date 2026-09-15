import * as runtime from "./member-app-api-runtime.js";
export * from "./member-app-api-runtime.js";
import {
  memberAppRecoveryCare,
  memberAppRecoveryCoupons,
  readCareBackPhase1RecoveryForRequest,
} from "./care-back-phase1-recovery.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const CARE_PATHS = new Set(["/api/member/app/care", "/api/member/app/care/"]);
const COUPON_PATHS = new Set(["/api/member/app/coupons", "/api/member/app/coupons/"]);
const WISH_TABLE_DEFAULT = "tblvMJjYXy29mgDLb";

function cookieValue(request, name) {
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readWishIdentitySnapshot(request, env = {}) {
  const secret = String(env.LIFF_SESSION_SECRET || "");
  const token = cookieValue(request, SESSION_COOKIE);
  if (!env.LIFF_IDENTITY_KV?.get || secret.length < 32 || !token) return null;
  try {
    const sessionHash = await hmacHex(secret, `session:${token}`);
    const session = await env.LIFF_IDENTITY_KV.get(`liff:session:${sessionHash}`, "json");
    if (!session || Number(session.expires_at || 0) <= Date.now()) return null;
    const identityKey = String(session.identity_key || "").trim().toLowerCase();
    const memberId = String(session.member_id || "").trim();
    if (session.member_exists !== true || !memberId || !/^[a-f0-9]{64}$/.test(identityKey)) return null;
    return { identityKey, memberId };
  } catch { return null; }
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function sanitizeLinkedWishFields(fields, expectedHash) {
  if (!fields || typeof fields !== "object") return null;
  if (String(fields.campaign_id || "") !== "care_back" || String(fields.source || "") !== "line_liff" || String(fields.wish_status || "") !== "completed") return null;
  if (String(fields.verified_customer_ref_hash || "").trim().toLowerCase() !== expectedHash) return null;
  const text = String(fields.wish_text || "").replace(/\r\n?/g, "\n").trim().slice(0, 600);
  const option = String(fields.wish_option || "").trim().slice(0, 120);
  const submittedAt = String(fields.submitted_at || "").trim();
  if (!text && !option) return null;
  if (!Date.parse(submittedAt)) return null;
  return { text: text || null, option: option || null, submittedAt: new Date(submittedAt).toISOString(), status: "completed" };
}

async function readLatestLinkedWish(env, identityKey) {
  const apiKey = String(env.AIRTABLE_API_KEY || "").trim();
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  const secret = String(env.LIFF_SESSION_SECRET || "");
  if (!apiKey || !baseId || secret.length < 32 || !/^[a-f0-9]{64}$/.test(identityKey)) return null;
  const expectedHash = await hmacHex(secret, `wish-customer:${identityKey}`);
  const table = String(env.AIRTABLE_TABLE_CARE_BACK_BIRTHDAY_WISHES || WISH_TABLE_DEFAULT).trim();
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", `AND({campaign_id}='care_back',{source}='line_liff',{wish_status}='completed',{verified_customer_ref_hash}=${formulaString(expectedHash)})`);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("sort[0][field]", "submitted_at");
  url.searchParams.set("sort[0][direction]", "desc");
  try {
    const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    const fields = response.ok && Array.isArray(payload?.records) ? payload.records[0]?.fields : null;
    return sanitizeLinkedWishFields(fields, expectedHash);
  } catch { return null; }
}

function isCareRead(request) {
  if (!(request instanceof Request) || request.method !== "GET") return false;
  try { return CARE_PATHS.has(new URL(request.url).pathname.toLowerCase()); } catch { return false; }
}

function isCouponRead(request) {
  if (!(request instanceof Request) || request.method !== "GET") return false;
  try { return COUPON_PATHS.has(new URL(request.url).pathname.toLowerCase()); } catch { return false; }
}

function recoveryResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-member-app-api": "v1",
      "x-mmd-care-back-recovery": "phase1-v1",
    },
  });
}

async function tryRecoveryMemberAppResponse(request, env) {
  if (!isCareRead(request) && !isCouponRead(request)) return null;
  try {
    const recovery = await readCareBackPhase1RecoveryForRequest(request, env);
    if (!recovery) return null;
    if (isCouponRead(request)) return recoveryResponse(memberAppRecoveryCoupons(recovery));
    return recoveryResponse(memberAppRecoveryCare(recovery));
  } catch (error) {
    console.warn({
      event: "care_back_phase1_recovery_member_app_failed",
      failure_class: String(error?.code || error?.message || "unknown").slice(0, 80),
    });
    return null;
  }
}

export async function handleMemberAppApi(request, env = {}, delegate) {
  const recoveryResponseOverride = await tryRecoveryMemberAppResponse(request, env);
  if (recoveryResponseOverride) return recoveryResponseOverride;

  if (!isCareRead(request)) return runtime.handleMemberAppApi(request, env, delegate);
  const snapshot = await readWishIdentitySnapshot(request, env);
  const response = await runtime.handleMemberAppApi(request, env, delegate);
  if (!response.ok || !snapshot) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response;
  const wish = await readLatestLinkedWish(env, snapshot.identityKey);
  if (!wish) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-care-back-wish-readback", "linked-v1");
  return new Response(JSON.stringify({ ...payload, wish }), { status: response.status, statusText: response.statusText, headers });
}

export const MEMBER_APP_WISH_READBACK_INTERNALS = Object.freeze({
  hmacHex,
  sanitizeLinkedWishFields,
  readWishIdentitySnapshot,
  readLatestLinkedWish,
  isCareRead,
  isCouponRead,
  tryRecoveryMemberAppResponse,
});
