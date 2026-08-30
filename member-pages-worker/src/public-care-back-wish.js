import { PUBLIC_JSON_BODY_MAX_BYTES, readBoundedJsonObject } from "./bounded-json.js";
import { getCareBackStore } from "./care-back-claim-store.js";

const CAMPAIGN_ID = "care_back";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const MAX_WISH = 600;
const PUBLIC_WISH_PATHS = new Set([
  "/member/api/care-back/public-wish",
  "/member/api/care-back/public-wish/",
]);
const LINK_WISH_PATHS = new Set([
  "/member/api/care-back/link-wish",
  "/member/api/care-back/link-wish/",
]);
const APPROVED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);
const PUBLIC_BODY_KEYS = new Set(["wish_text", "wish_option", "request_id", "language"]);
const LINK_BODY_KEYS = new Set(["wish_link_token"]);
const BROWSER_IDENTITY_FIELDS = new Set([
  "line_user_id", "lineUserId", "line_id", "sub", "profile", "user",
  "member_id", "member_ref", "mmd_member_id", "tier", "points", "status",
  "membership_status", "payment_status", "campaign_claim_id", "claim_id",
]);

export function isPublicCareBackWishPath(url) {
  const path = normalizePath(url.pathname);
  return PUBLIC_WISH_PATHS.has(path) || LINK_WISH_PATHS.has(path);
}

export async function handlePublicCareBackWishRoute(request, env = {}) {
  const path = normalizePath(new URL(request.url).pathname);
  if (request.method === "OPTIONS") {
    return isApprovedOrigin(request, env)
      ? withCors(request, new Response(null, { status: 204, headers: apiHeaders("POST,OPTIONS") }), env)
      : json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
  }
  if (PUBLIC_WISH_PATHS.has(path)) return withCors(request, await handlePublicWish(request, env), env);
  if (LINK_WISH_PATHS.has(path)) return withCors(request, await handleLinkWish(request, env), env);
  return json({ ok: false, error: { code: "NOT_FOUND", message: "Not found." } }, 404);
}

export async function handlePublicWish(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!String(env.LIFF_SESSION_SECRET || "").trim()) return unavailable("PUBLIC_WISH_SIGNING_NOT_CONFIGURED");

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  if (hasUnexpectedKeys(parsed.body, PUBLIC_BODY_KEYS) || hasBrowserIdentityClaims(parsed.body)) return browserIdentityRejected();
  const input = normalizePublicWishInput(parsed.body);
  if (!input.ok) return json({ ok: false, error: { code: input.code, message: input.message } }, 400);

  const store = getPublicWishStore(env);
  if (!store) return unavailable("PUBLIC_WISH_STORAGE_NOT_CONFIGURED");

  const linkToken = await publicWishLinkToken(env, input.requestId);
  const linkTokenHash = await keyedDigest(env, `public-wish-link:${linkToken}`);
  try {
    const wish = await store.createOrLoad({
      requestId: input.requestId,
      wishText: input.wishText,
      wishOption: input.wishOption,
      language: input.language,
      linkTokenHash,
      now: new Date().toISOString(),
    });
    if (wish.link_token_hash !== linkTokenHash) {
      return json({ ok: false, error: { code: "PUBLIC_WISH_IDEMPOTENCY_CONFLICT", message: "This request_id belongs to a different wish." } }, 409);
    }
    return json({
      ok: true,
      state: "completed",
      wish: { text: wish.wish_text, option: wish.wish_option, submitted_at: wish.submitted_at },
      wish_link_token: linkToken,
      benefits: { verification_required: true, coupon: false, membership_extension: false, points: false },
      final_display: {
        message: input.language === "en"
          ? "MMD has received your wish. LINE verification is only needed for CARE BACK benefits."
          : "MMD ได้รับคำอวยพรของคุณแล้วครับ การยืนยัน LINE ใช้เฉพาะสำหรับคูปอง วันสมาชิก และ Points",
        next_action: "optional_benefit_verification",
      },
      grants: noGrants(),
    }, 200);
  } catch (error) {
    return publicWishStorageError(error);
  }
}

export async function handleLinkWish(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!env.LIFF_IDENTITY_KV || !String(env.LIFF_SESSION_SECRET || "").trim()) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  if (hasUnexpectedKeys(parsed.body, LINK_BODY_KEYS) || hasBrowserIdentityClaims(parsed.body)) return browserIdentityRejected();
  const linkToken = exactToken(parsed.body.wish_link_token, 256);
  if (!linkToken) return json({ ok: false, error: { code: "PUBLIC_WISH_LINK_TOKEN_INVALID", message: "A valid wish link token is required." } }, 400);

  const session = await authenticateSession(request, env);
  if (!session.ok) return session.response;
  const data = session.session;
  if (!data.member_exists || !data.member_id || !data.identity_key) {
    return json({ ok: false, error: { code: "CARE_BACK_MEMBER_REQUIRED", message: "Verified member identity is required for CARE BACK benefits." } }, 409);
  }
  const claimRecordId = validAirtableRecordId(data.campaign_claim_record_id);
  const claimId = exactToken(data.campaign_claim_id, 80);
  if (!claimId || !claimRecordId) {
    return json({ ok: false, error: { code: "CARE_BACK_CLAIM_REQUIRED", message: "CARE BACK claim verification must finish before benefits can be linked." } }, 409);
  }

  const store = getPublicWishStore(env);
  const careBackStore = getCareBackStore(env);
  if (!store || !careBackStore) return unavailable("CARE_BACK_STORAGE_NOT_CONFIGURED");
  const linkTokenHash = await keyedDigest(env, `public-wish-link:${linkToken}`);
  const verifiedCustomerRefHash = await keyedDigest(env, `wish-customer:${data.identity_key}`);
  try {
    const wish = await store.linkToClaim({
      linkTokenHash,
      claimId,
      claimRecordId,
      verifiedCustomerRefHash,
      now: new Date().toISOString(),
    });
    const claim = await careBackStore.openOrResume({
      identityHash: data.identity_key,
      memberId: data.member_id,
      memberProfile: data.member_profile,
      wishSubmitted: true,
    });
    return json({
      ok: true,
      linked: true,
      state: "completed",
      wish: { text: wish.wish_text, submitted_at: wish.submitted_at },
      benefits: { verification_required: false, evaluation_started: true },
      claim: safeClaimSummary(claim),
      grants: noGrants(),
    }, 200);
  } catch (error) {
    return publicWishStorageError(error);
  }
}

function getPublicWishStore(env) {
  if (env.PUBLIC_CARE_BACK_WISH_STORE
    && typeof env.PUBLIC_CARE_BACK_WISH_STORE.createOrLoad === "function"
    && typeof env.PUBLIC_CARE_BACK_WISH_STORE.linkToClaim === "function") return env.PUBLIC_CARE_BACK_WISH_STORE;
  if (!String(env.AIRTABLE_API_KEY || "").trim() || !String(env.AIRTABLE_BASE_ID || "").trim()) return null;
  return new AirtablePublicWishStore(env);
}

class AirtablePublicWishStore {
  constructor(env) { this.env = env; }

  async createOrLoad(input) {
    const replay = await this.findByRequestId(input.requestId);
    if (replay) return replay;
    const wishId = `wish_${crypto.randomUUID().replace(/-/g, "")}`;
    const fields = {
      wish_id: wishId,
      campaign_id: CAMPAIGN_ID,
      verified_customer_ref_hash: input.linkTokenHash,
      wish_text: input.wishText || undefined,
      wish_option: input.wishOption || undefined,
      wish_status: "completed",
      idempotency_key: input.requestId,
      submitted_at: input.now,
      completed_at: input.now,
      public_display_text: input.language === "en" ? "MMD has received your birthday wish." : "MMD ได้รับคำอวยพรของคุณแล้วครับ",
      source: "public_web",
      source_path: "/promotion/6-years-care-back/wish",
      language: input.language,
      display_version: "care_back_public_v1",
      payload_json: JSON.stringify({ schema_version: 2, campaign_id: CAMPAIGN_ID, wish_kind: "public_unlinked" }),
      created_at: input.now,
      updated_at: input.now,
    };
    return sanitizePublicWish(await this.write("POST", { body: { fields: compactFields(fields), typecast: false } }));
  }

  async linkToClaim(input) {
    const wish = await this.findByLinkTokenHash(input.linkTokenHash);
    if (!wish) throw new PublicWishError("PUBLIC_WISH_NOT_FOUND");
    if (wish.claim_record_id && wish.claim_record_id !== input.claimRecordId) throw new PublicWishError("PUBLIC_WISH_ALREADY_LINKED_CONFLICT");
    const record = await this.write("PATCH", {
      recordId: wish.record_id,
      body: { fields: {
        "Campaign Claim": [input.claimRecordId],
        verified_customer_ref_hash: input.verifiedCustomerRefHash,
        source: "line_liff",
        source_path: "/member/liff",
        display_version: "care_back_v1",
        payload_json: JSON.stringify({ schema_version: 2, campaign_id: CAMPAIGN_ID, claim_id: input.claimId, wish_kind: "verified_linked" }),
        updated_at: input.now,
      }, typecast: false },
    });
    return sanitizePublicWish(record);
  }

  async findByRequestId(requestId) {
    const records = await this.list(`AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{idempotency_key}=${formulaString(requestId)})`, 2);
    if (records.length > 1) throw new PublicWishError("PUBLIC_WISH_CONFLICT");
    return records.length ? sanitizePublicWish(records[0]) : null;
  }

  async findByLinkTokenHash(hash) {
    const records = await this.list(`AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{verified_customer_ref_hash}=${formulaString(hash)})`, 2);
    if (records.length > 1) throw new PublicWishError("PUBLIC_WISH_CONFLICT");
    return records.length ? sanitizePublicWish(records[0]) : null;
  }

  async list(filterByFormula, maxRecords) {
    const payload = await this.write("GET", { query: { filterByFormula, maxRecords } });
    return Array.isArray(payload?.records) ? payload.records : [];
  }

  async write(method, { recordId = "", body, query } = {}) {
    const table = String(this.env.AIRTABLE_TABLE_CARE_BACK_BIRTHDAY_WISHES || "tblvMJjYXy29mgDLb").trim();
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(String(this.env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`);
    if (query?.filterByFormula) url.searchParams.set("filterByFormula", query.filterByFormula);
    if (query?.maxRecords) url.searchParams.set("maxRecords", String(query.maxRecords));
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.env.AIRTABLE_API_KEY}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== "object") throw new PublicWishError("PUBLIC_WISH_STORAGE_UNAVAILABLE");
    return payload;
  }
}

class PublicWishError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function sanitizePublicWish(record) {
  const fields = record?.fields || {};
  const claimLinks = Array.isArray(fields["Campaign Claim"]) ? fields["Campaign Claim"] : [];
  const wish = {
    record_id: validAirtableRecordId(record?.id),
    wish_id: String(fields.wish_id || ""),
    claim_record_id: claimLinks.length === 1 ? validAirtableRecordId(claimLinks[0]) : "",
    wish_text: String(fields.wish_text || "").slice(0, MAX_WISH),
    wish_option: String(fields.wish_option || "").slice(0, 120),
    wish_status: String(fields.wish_status || ""),
    idempotency_key: String(fields.idempotency_key || ""),
    link_token_hash: String(fields.verified_customer_ref_hash || "").toLowerCase(),
    submitted_at: String(fields.submitted_at || ""),
  };
  if (!wish.record_id || !/^wish_[a-f0-9]{32}$/i.test(wish.wish_id) || wish.wish_status !== "completed"
    || !/^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/.test(wish.idempotency_key)
    || !/^[a-f0-9]{64}$/.test(wish.link_token_hash) || !Date.parse(wish.submitted_at)) {
    throw new PublicWishError("PUBLIC_WISH_STORAGE_MALFORMED");
  }
  return wish;
}

async function authenticateSession(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return authFailure("LIFF_SESSION_REQUIRED", "Authenticated LIFF session required.");
  const hash = await keyedDigest(env, `session:${token}`);
  const session = await env.LIFF_IDENTITY_KV.get(`liff:session:${hash}`, "json");
  if (!session || Number(session.expires_at || 0) <= Date.now()) return authFailure("LIFF_SESSION_INVALID", "LIFF session is invalid or expired.");
  return { ok: true, session };
}

function normalizePublicWishInput(body) {
  const requestId = exactToken(body.request_id, 128);
  if (!requestId || requestId.length < 16) return { ok: false, code: "BIRTHDAY_WISH_REQUEST_ID_INVALID", message: "A bounded request_id is required." };
  const wishText = normalizeText(body.wish_text, MAX_WISH);
  const wishOption = normalizeText(body.wish_option, 120);
  if (wishText === null || wishOption === null) return { ok: false, code: "BIRTHDAY_WISH_CONTENT_INVALID", message: "Birthday Wish content is invalid." };
  if (!wishText && !wishOption) return { ok: false, code: "BIRTHDAY_WISH_CONTENT_REQUIRED", message: "Birthday Wish content is required." };
  const language = String(body.language || "th").toLowerCase();
  return { ok: true, requestId, wishText, wishOption, language: language.startsWith("en") ? "en" : "th" };
}

function normalizeText(value, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value).replace(/\r\n?/g, "\n").trim();
  if (!text || [...text].length > maxLength || /[<>]/.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  return text;
}

async function publicWishLinkToken(env, requestId) {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(`public-wish:${requestId}`));
  return `pw_${base64Url(new Uint8Array(signature))}`;
}

async function keyedDigest(env, value) {
  const digest = await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(env) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(String(env.LIFF_SESSION_SECRET)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeClaimSummary(claim = {}) {
  return {
    claim_reference: String(claim.claim_reference || "").slice(0, 64),
    claim_status: String(claim.claim_status || "").slice(0, 32),
    review_status: String(claim.review_status || "").slice(0, 32),
    coupon_state: String(claim.coupon_state || "verification_required").slice(0, 32),
    membership_benefit: claim.membership_benefit || null,
    points_policy: claim.points_policy || null,
    wish_submitted: Boolean(claim.wish_submitted),
  };
}

function requireSameOrigin(request, env) {
  return isApprovedOrigin(request, env) ? null : json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
}

function isApprovedOrigin(request, env) {
  const origin = request.headers.get("origin") || "";
  if (APPROVED_ORIGINS.has(origin)) return true;
  if (String(env.CARE_BACK_STAGING_MODE || "") !== "synthetic") return false;
  const url = new URL(request.url);
  return url.hostname.endsWith(".workers.dev") && origin === url.origin;
}

function withCors(request, response, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin") || "";
  if (isApprovedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function hasBrowserIdentityClaims(body) { return Object.keys(body || {}).some((key) => BROWSER_IDENTITY_FIELDS.has(key)); }
function hasUnexpectedKeys(body, allowed) { return Object.keys(body || {}).some((key) => !allowed.has(key)); }
function validAirtableRecordId(value) { const v = String(value || "").trim(); return /^rec[A-Za-z0-9]{14}$/.test(v) ? v : ""; }
function exactToken(value, maxLength) { const v = String(value || "").trim(); return v && v.length <= maxLength && /^[A-Za-z0-9._~-]+$/.test(v) ? v : ""; }
function compactFields(fields) { return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== "")); }
function formulaString(value) { return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function cookieValue(request, name) { for (const part of (request.headers.get("cookie") || "").split(";")) { const [key, ...rest] = part.trim().split("="); if (key === name) return exactToken(rest.join("="), 8192); } return ""; }
function normalizePath(pathname) { return pathname.toLowerCase().replace(/\/{2,}/g, "/"); }
function noGrants() { return { payment: false, membership: false, points: false, hall: false, black_card: false, svip: false, booking: false, access: false }; }
function browserIdentityRejected() { return json({ ok: false, error: { code: "BROWSER_IDENTITY_REJECTED", message: "Browser-supplied identity fields are not accepted." } }, 400); }
function unavailable(code) { return json({ ok: false, error: { code, message: "CARE BACK is temporarily unavailable." } }, 503); }
function authFailure(code, message) { return { ok: false, response: json({ ok: false, error: { code, message } }, 401) }; }
function methodNotAllowed(methods) { return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `${methods} required` } }, 405, { allow: methods }); }
function publicWishStorageError(error) { const code = error instanceof PublicWishError ? error.code : "PUBLIC_WISH_STORAGE_UNAVAILABLE"; return json({ ok: false, error: { code, message: "Birthday Wish is temporarily unavailable." } }, code.endsWith("CONFLICT") ? 409 : code.endsWith("INVALID") ? 400 : code === "PUBLIC_WISH_NOT_FOUND" ? 404 : 503); }
async function readJson(request) { const parsed = await readBoundedJsonObject(request, PUBLIC_JSON_BODY_MAX_BYTES); return parsed.ok ? { ok: true, body: parsed.value } : { ok: false, response: json({ ok: false, error: { code: parsed.code, message: parsed.message } }, parsed.status) }; }
function apiHeaders(methods = "POST,OPTIONS") { return { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-methods": methods, "access-control-allow-headers": "content-type", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" }; }
function json(body, status = 200, extraHeaders = {}) { return new Response(JSON.stringify(body), { status, headers: { ...apiHeaders(), ...extraHeaders } }); }
