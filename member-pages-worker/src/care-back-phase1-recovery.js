import { resolveApprovedDiscount } from "./care-back-claim-store.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CAMPAIGN_ID = "6-years-care-back";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const RECOVERY_TABLE_DEFAULT = "MMD — CARE BACK Recovery Authorizations";
const PROMO_TABLE_DEFAULT = "MMD — Promo Codes";
const LINE_ID_RE = /^U[0-9a-f]{32}$/i;
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const RECOVERY_LIFF_PATHS = new Set([
  "/member/api/liff/care-back/claim",
  "/member/api/liff/care-back/state",
  "/member/api/liff/care-back/wallet",
]);

export async function readCareBackPhase1RecoveryForRequest(request, env = {}) {
  const session = await readSignedLineSession(request, env);
  if (!session?.lineUserId) return null;
  return readCareBackPhase1Recovery(env, session.lineUserId);
}

export async function readCareBackPhase1Recovery(env = {}, lineUserId = "") {
  const line = clean(lineUserId);
  if (!LINE_ID_RE.test(line) || !configured(env)) return null;
  const table = clean(env.AIRTABLE_TABLE_CARE_BACK_RECOVERY_AUTHORIZATIONS || RECOVERY_TABLE_DEFAULT);
  const formula = `AND({line_user_id}=${formulaString(line)},{campaign_id}=${formulaString(CAMPAIGN_ID)},{approval_status}=${formulaString("issued")},{wish_equivalent_completed}=TRUE())`;
  const authorizations = await list(env, table, formula, 2);
  if (!authorizations.length) return null;
  if (authorizations.length !== 1) throw recoveryError("CARE_BACK_RECOVERY_CONFLICT");

  const auth = authorizations[0];
  const fields = auth.fields || {};
  const code = clean(fields.coupon_code);
  if (!CODE_RE.test(code)) throw recoveryError("CARE_BACK_RECOVERY_CODE_INVALID");
  const linkedPromoIds = Array.isArray(fields["Promo Code"]) ? fields["Promo Code"].map(clean).filter(Boolean) : [];
  if (linkedPromoIds.length !== 1) throw recoveryError("CARE_BACK_RECOVERY_PROMO_CONFLICT");

  const promoTable = clean(env.AIRTABLE_TABLE_CARE_BACK_PROMO_CODES || env.AIRTABLE_TABLE_CARE_BACK_PROMO_CODES_ID || PROMO_TABLE_DEFAULT);
  const promo = await getRecord(env, promoTable, linkedPromoIds[0]);
  if (!promo?.id) throw recoveryError("CARE_BACK_RECOVERY_PROMO_MISSING");
  const promoFields = promo.fields || {};
  if (clean(promoFields.code) !== code || clean(promoFields.campaign_code) !== CAMPAIGN_ID) {
    throw recoveryError("CARE_BACK_RECOVERY_PROMO_CONFLICT");
  }

  return normalizeRecovery(auth, promo);
}

export async function approveCareBackPhase1RecoveryDiscount(env = {}, {
  lineUserId,
  modelLevel,
  jobFormat,
  publicModelPercent = null,
} = {}) {
  const recovery = await readCareBackPhase1Recovery(env, lineUserId);
  if (!recovery) return null;
  if (recovery.customer_state !== "ready") {
    throw recoveryError(`CARE_BACK_RECOVERY_${String(recovery.customer_state || "UNAVAILABLE").toUpperCase()}`);
  }
  const approved = resolveApprovedDiscount({ modelLevel, jobFormat, publicModelPercent });
  if (!approved) throw recoveryError("CARE_BACK_DISCOUNT_CONTEXT_UNRESOLVED");

  const promoTable = clean(env.AIRTABLE_TABLE_CARE_BACK_PROMO_CODES || env.AIRTABLE_TABLE_CARE_BACK_PROMO_CODES_ID || PROMO_TABLE_DEFAULT);
  const promo = await patchRecord(env, promoTable, recovery.promo_record_id, {
    model_level: clean(modelLevel),
    job_format: clean(jobFormat).toUpperCase(),
    approved_discount_percent: approved,
    benefit_type: "discount_percent",
  });
  const normalized = normalizeRecovery({ id: recovery.recovery_record_id, fields: recovery.authorization_fields }, promo);
  return { ...normalized, approved_discount_percent: approved };
}

export function isCareBackPhase1RecoveryLiffCandidate(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const path = normalizePath(url.pathname);
  return RECOVERY_LIFF_PATHS.has(path);
}

export async function handleCareBackPhase1RecoveryLiff(request, env = {}) {
  if (!isCareBackPhase1RecoveryLiffCandidate(request.url)) return null;
  const recovery = await readCareBackPhase1RecoveryForRequest(request, env);
  if (!recovery) return null;
  const path = normalizePath(new URL(request.url).pathname);
  if (path.endsWith("/wallet")) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return json({ ok: true, wallet: customerWallet(recovery), recovery: true });
  }
  if (path.endsWith("/state")) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return json({
      ok: true,
      data: {
        state: recovery.customer_state === "ready" ? "completed" : recovery.customer_state,
        recovery: true,
        wish_submitted: true,
        approved_discount_percent: recovery.approved_discount_percent,
        activated_at: recovery.activated_at,
        expires_at: recovery.expires_at,
      },
    });
  }
  if (path.endsWith("/claim")) {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return json({
      ok: true,
      data: {
        campaign_id: CAMPAIGN_ID,
        claim_status: "benefit_approved",
        coupon_state: recovery.customer_state,
        personal_code: recovery.code,
        code_status: recovery.code_status,
        activated_at: recovery.activated_at,
        expires_at: recovery.expires_at,
        approved_discount_percent: recovery.approved_discount_percent,
        wish_submitted: true,
        recovery: true,
      },
    });
  }
  return null;
}

export function memberAppRecoveryCoupons(recovery) {
  if (!recovery) return [];
  const state = recovery.customer_state === "ready"
    ? "issued"
    : recovery.customer_state === "used"
      ? "used"
      : recovery.customer_state === "expired"
        ? "expired"
        : "unavailable";
  return [{
    id: `care-back-recovery-${recovery.recovery_id}`,
    title: "CARE BACK",
    description: state === "issued" ? "คูปองกู้คืนจากช่วงที่ระบบส่งคำอวยพรขัดข้อง · ระบบจะตรวจสอบส่วนลดจริงเมื่อจอง" : null,
    state,
    approvedDiscountPercent: recovery.approved_discount_percent,
    issuedAt: recovery.activated_at,
    expiresAt: recovery.expires_at,
    reference: recovery.code,
    recovery: true,
  }];
}

export function memberAppRecoveryCare(recovery) {
  if (!recovery) return null;
  const payload = {
    stage: recovery.customer_state === "ready" ? "wish_saved" : recovery.customer_state === "used" ? "approved" : "unavailable",
    approvedDiscountPercent: recovery.approved_discount_percent,
    note: recovery.customer_state === "ready"
      ? "MMD กู้คืนสิทธิ์ CARE BACK จากคำอวยพร/การส่งคำอวยพรช่วงที่ระบบขัดข้องแล้ว"
      : null,
    recovery: true,
  };
  if (recovery.wish_text) {
    payload.wish = {
      text: recovery.wish_text,
      option: null,
      submittedAt: recovery.evidence_at || recovery.activated_at,
      status: "completed",
      recovery: true,
    };
  }
  return payload;
}

function normalizeRecovery(auth, promo) {
  const fields = auth.fields || {};
  const promoFields = promo.fields || {};
  const status = clean(promoFields.status).toLowerCase();
  const activatedAt = safeTimestamp(promoFields.activated_at || fields.activated_at);
  const expiresAt = safeTimestamp(promoFields.expires_at || fields.expires_at);
  const usedCount = Math.max(0, Number(promoFields.used_count || 0) || 0);
  const now = Date.now();
  const expiredByClock = Boolean(expiresAt && Date.parse(expiresAt) <= now);
  const customerState = usedCount >= 1 || status === "used"
    ? "used"
    : status === "expired" || expiredByClock
      ? "expired"
      : ["revoked", "invalid"].includes(status)
        ? status
        : status === "active" ? "ready" : "unavailable";
  const approved = Number(promoFields.approved_discount_percent);
  return {
    recovery_record_id: auth.id,
    recovery_id: clean(fields.recovery_id),
    line_user_id: clean(fields.line_user_id),
    display_name: clean(fields.display_name),
    evidence_kind: clean(fields.evidence_kind),
    evidence_at: safeTimestamp(fields.approved_at),
    wish_text: clean(fields.wish_text).slice(0, 600) || null,
    wish_equivalent_completed: fields.wish_equivalent_completed === true,
    code: clean(promoFields.code || fields.coupon_code),
    code_status: status,
    customer_state: customerState,
    activated_at: activatedAt,
    expires_at: expiresAt,
    approved_discount_percent: Number.isFinite(approved) && approved > 0 && approved <= 10 ? approved : null,
    promo_record_id: promo.id,
    authorization_fields: fields,
  };
}

function customerWallet(recovery) {
  return {
    status: recovery.customer_state,
    code: recovery.code,
    approved_discount_percent: recovery.approved_discount_percent,
    discount_percent: recovery.approved_discount_percent || 0,
    activated_at: recovery.activated_at,
    expires_at: recovery.expires_at,
    single_use: true,
    recovery: true,
  };
}

async function readSignedLineSession(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  const secret = clean(env.LIFF_SESSION_SECRET);
  if (!token || secret.length < 32 || !env.LIFF_IDENTITY_KV?.get) return null;
  try {
    const hash = await hmacHex(secret, `session:${token}`);
    const session = await env.LIFF_IDENTITY_KV.get(`liff:session:${hash}`, "json");
    if (!session || Number(session.expires_at || 0) <= Date.now()) return null;
    const lineUserId = clean(session.line_user_id);
    return LINE_ID_RE.test(lineUserId) ? { lineUserId } : null;
  } catch {
    return null;
  }
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cookieValue(request, name) {
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function configured(env) {
  return Boolean(clean(env.AIRTABLE_API_KEY) && clean(env.AIRTABLE_BASE_ID));
}

async function list(env, table, filterByFormula, maxRecords = 2) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", filterByFormula);
  url.searchParams.set("maxRecords", String(maxRecords));
  const response = await airtableFetch(env, url.toString());
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.records)) throw recoveryError("CARE_BACK_RECOVERY_STORAGE_UNAVAILABLE");
  return payload.records;
}

async function getRecord(env, table, recordId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(clean(recordId))) throw recoveryError("CARE_BACK_RECOVERY_STORAGE_MALFORMED");
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}/${encodeURIComponent(clean(recordId))}`;
  const response = await airtableFetch(env, url);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id || !payload?.fields) throw recoveryError("CARE_BACK_RECOVERY_STORAGE_UNAVAILABLE");
  return payload;
}

async function patchRecord(env, table, recordId, fields) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(clean(recordId))) throw recoveryError("CARE_BACK_RECOVERY_STORAGE_MALFORMED");
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}/${encodeURIComponent(clean(recordId))}`;
  const response = await airtableFetch(env, url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id || !payload?.fields) throw recoveryError("CARE_BACK_RECOVERY_STORAGE_UNAVAILABLE");
  return payload;
}

async function airtableFetch(env, url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("authorization", `Bearer ${clean(env.AIRTABLE_API_KEY)}`);
  headers.set("accept", "application/json");
  return env.AIRTABLE_HTTP?.fetch
    ? env.AIRTABLE_HTTP.fetch(new Request(url, { ...init, headers }))
    : fetch(url, { ...init, headers });
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function safeTimestamp(value) {
  const text = clean(value);
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null;
}
function clean(value) { return String(value ?? "").trim(); }
function recoveryError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
function methodNotAllowed(method) {
  return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `${method} required.` } }, 405, { Allow: method });
}
function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-mmd-care-back-recovery": "phase1-v1", ...extraHeaders },
  });
}

export const CARE_BACK_PHASE1_RECOVERY_INTERNALS = Object.freeze({
  normalizeRecovery,
  customerWallet,
  readSignedLineSession,
});
