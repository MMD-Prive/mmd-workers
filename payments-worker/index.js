/**
 * =========================================================
 * MMD Privé — payments-worker (Production / Clean)
 * =========================================================
 */

import {
  ensureCommissionRowsForSession,
  mirrorCommissionSnapshot,
  normalizeCommissionSplits,
  updateCommissionEligibilityForSession,
} from "../shared/src/lib/partner-commissions/index.js";

const LOCK = "payments-production-v10-clean";
const AIRTABLE_API = "https://api.airtable.com/v0";

/* -------------------------------------------------- */
/* basic helpers */
/* -------------------------------------------------- */
function toStr(v) {
  return v == null ? "" : String(v).trim();
}

function toNum(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function nowIso() {
  return new Date().toISOString();
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function readJson(req) {
  try {
    const text = await req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCorsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const headers = new Headers();

  if (origin && allow.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Internal-Token");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function withCors(req, env, res) {
  const headers = new Headers(res.headers);
  const cors = buildCorsHeaders(req, env);
  cors.forEach((v, k) => headers.set(k, v));
  return new Response(res.body, {
    status: res.status,
    headers,
  });
}

function isInternalAuthed(req, env) {
  const headerToken =
    toStr(req.headers.get("X-Internal-Token")) ||
    toStr(req.headers.get("Authorization")).replace(/^Bearer\s+/i, "");

  return !!env.INTERNAL_TOKEN && headerToken === env.INTERNAL_TOKEN;
}

function hasConfirmKey(req, env) {
  const key = toStr(req.headers.get("X-Confirm-Key"));
  return !!env.CONFIRM_KEY && key === env.CONFIRM_KEY;
}

function assertRequired(value, field) {
  if (!toStr(value)) throw new Error(`${field}_required`);
  return value;
}

function ensurePositiveNumber(value, field) {
  const n = toNum(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${field}_must_be_positive_number`);
  }
  return n;
}

function ensureNonNegativeNumber(value, field) {
  const n = toNum(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field}_must_be_non_negative_number`);
  }
  return n;
}

function makePaymentRef(prefix = "pay") {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

function normalizeStage(value) {
  const s = toStr(value).toLowerCase();
  const allowed = ["deposit", "final", "tips", "full", "membership"];
  if (!allowed.includes(s)) throw new Error("invalid_payment_stage");
  return s;
}

function paymentStatusFromStage(stage) {
  if (stage === "deposit") return "Deposit Paid";
  if (stage === "final") return "Paid";
  if (stage === "full") return "Paid";
  if (stage === "tips") return "Tips Paid";
  if (stage === "membership") return "Paid";
  return "Paid";
}

function computePoints(env, amountThb) {
  const rate = toNum(env.POINTS_RATE) || 100;
  return Math.max(0, Math.floor(Number(amountThb || 0) / rate));
}

function stageEligibleForPoints(stage) {
  return ["deposit", "full", "membership"].includes(stage);
}

function truthy(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function compact(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );
}

function paymentMethodLabel(value) {
  const method = toStr(value).toLowerCase();
  if (method === "promptpay" || method === "promptpay_qr") return "QR PromptPay";
  if (method === "credit_card") return "Credit Card";
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "paypal") return "PayPal";
  return value || "PromptPay";
}

function selectLabel(value) {
  const raw = toStr(value).toLowerCase();
  if (raw === "pending") return "Pending";
  if (raw === "paid") return "Paid";
  if (raw === "verified") return "Verified";
  if (raw === "success") return "Success";
  if (raw === "manual_review") return "Manual Review";
  if (raw === "manual_slip_submitted") return "Manual Slip Submitted";
  return value || "";
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseIsoDate(value) {
  const raw = toStr(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next;
}

function addMonths(date, months) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + Number(months || 0));
  return next;
}

function normalizeRenewalPackage(value) {
  const raw = toStr(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw.includes("black") || raw.includes("svip")) return "black_card";
  if (raw === "vip" || raw.includes("_vip") || raw.includes("vip_")) return "vip";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  if (raw.includes("premium")) return "premium";
  return raw || "premium";
}

function renewalPackageLabel(value) {
  const code = normalizeRenewalPackage(value);
  if (code === "black_card") return "Black Card";
  if (code === "vip") return "VIP";
  if (code === "standard") return "Standard Package";
  return "Premium Package";
}

function normalizeRelationshipTier(value) {
  const raw = toStr(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "svip") return "svip";
  if (raw === "per_private" || raw === "per_private_first") return "per_private";
  if (raw === "priority") return "priority";
  return "normal";
}

function handlerModeForRelationshipTier(tier, value) {
  const raw = toStr(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "per_private_first" || tier === "svip" || tier === "per_private") return "per_private_first";
  if (raw === "per_review" || tier === "priority") return "per_review";
  return "system";
}

function entitlementLevelForPackage(packageCode) {
  const code = normalizeRenewalPackage(packageCode);
  if (code === "black_card") return "black_card";
  if (code === "vip") return "vip";
  if (code === "standard") return "standard_basic";
  return "premium";
}

function extensionReason(value) {
  const raw = toStr(value).toLowerCase();
  const allowed = [
    "paid_renewal",
    "points_threshold_reached",
    "spending_threshold_reached",
    "manual_review",
    "upgrade_review",
  ];
  return allowed.includes(raw) ? raw : "";
}

function getRenewalPolicy(env) {
  const days = parseJsonObject(env.RENEWAL_EXTENSION_DAYS_JSON, {});
  const months = parseJsonObject(env.RENEWAL_EXTENSION_MONTHS_JSON, {});
  return {
    extensionDays: days,
    extensionMonths: months,
    blackCardDefaultValidityMonths: toNum(env.BLACK_CARD_DEFAULT_VALIDITY_MONTHS) || 36,
    blackCardReviewCycleMonths: toNum(env.BLACK_CARD_REVIEW_CYCLE_MONTHS) || 12,
  };
}

function policyExtensionFor(env, packageCode, reason) {
  const code = normalizeRenewalPackage(packageCode);
  const policy = getRenewalPolicy(env);
  const monthKey = `${code}:${reason}`;
  const dayKey = `${code}:${reason}`;
  const months =
    toNum(policy.extensionMonths[monthKey]) ??
    toNum(policy.extensionMonths[code]) ??
    (code === "black_card" && reason === "paid_renewal" ? policy.blackCardDefaultValidityMonths : null);
  const days =
    toNum(policy.extensionDays[dayKey]) ??
    toNum(policy.extensionDays[code]) ??
    null;

  if (Number.isFinite(months) && months > 0) return { unit: "months", value: months };
  if (Number.isFinite(days) && days > 0) return { unit: "days", value: days };
  return null;
}

function applyExtension(baseDate, extension) {
  if (!extension) return null;
  if (extension.unit === "months") return addMonths(baseDate, extension.value);
  return addDays(baseDate, extension.value);
}

function resolveMembershipExpiryDecision(env, payload, pointsLedger = null) {
  const now = new Date();
  const policy = getRenewalPolicy(env);
  const targetPackage = normalizeRenewalPackage(payload.target_package || payload.package_code || payload.package);
  const targetPackageLabel = toStr(payload.target_package_label) || renewalPackageLabel(targetPackage);
  const currentExpiry = parseIsoDate(
    payload.current_expiry || payload.membership_expiry || payload.membership_expire_at || payload.expires_at
  );
  const baseDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const pointsBalance = toNum(payload.points_balance);
  const pointsRequired = toNum(payload.points_required);
  const spendingTotal = toNum(payload.total_spend_thb || payload.spending_total_thb || payload.eligible_spending_thb);
  const spendingRequired = toNum(payload.spending_required || payload.spending_required_thb);
  const pointsThresholdReached =
    truthy(payload.points_threshold_reached) ||
    (pointsBalance != null && pointsRequired != null && pointsRequired > 0 && pointsBalance >= pointsRequired);
  const spendingThresholdReached =
    truthy(payload.spending_threshold_reached) ||
    (spendingTotal != null && spendingRequired != null && spendingRequired > 0 && spendingTotal >= spendingRequired);
  const paidRenewalConfirmed = payload.stage === "membership" || truthy(payload.paid_renewal_confirmed);
  const incomingReason = extensionReason(payload.expiry_extension_reason);
  let reason = incomingReason;
  if (!reason && pointsThresholdReached) reason = "points_threshold_reached";
  if (!reason && spendingThresholdReached) reason = "spending_threshold_reached";
  if (!reason && paidRenewalConfirmed) reason = "paid_renewal";
  if (!reason && (targetPackage === "vip" || targetPackage === "black_card")) reason = "upgrade_review";
  if (!reason) reason = "manual_review";

  const relationshipTier = normalizeRelationshipTier(payload.relationship_tier);
  const handlerMode = handlerModeForRelationshipTier(relationshipTier, payload.handler_mode);
  const entitlementLevel = targetPackage === "black_card" || relationshipTier === "svip"
    ? "black_card"
    : entitlementLevelForPackage(targetPackage);
  const extension = policyExtensionFor(env, targetPackage, reason);
  const canSystemExtend =
    !!extension &&
    ["paid_renewal", "points_threshold_reached", "spending_threshold_reached"].includes(reason);
  const provisionalExpiry = canSystemExtend ? applyExtension(baseDate, extension) : null;
  const keptExistingActiveExpiry =
    !!(currentExpiry && currentExpiry > now && provisionalExpiry && provisionalExpiry < currentExpiry);
  const finalExpiry = keptExistingActiveExpiry ? currentExpiry : provisionalExpiry || currentExpiry || null;
  const accessStatus = canSystemExtend ? "active" : "pending_review";

  return {
    ok: true,
    target_package: targetPackage,
    target_package_label: targetPackageLabel,
    member_status: entitlementLevel === "standard_basic" ? "standard" : entitlementLevel,
    entitlement_level: entitlementLevel,
    relationship_tier: relationshipTier,
    handler_mode: handlerMode,
    handled_by: handlerMode === "per_private_first" ? "per" : "",
    pre_release_review_required: handlerMode === "per_private_first",
    private_first_contact: handlerMode === "per_private_first",
    access_status: accessStatus,
    membership_expiry_rule:
      targetPackage === "black_card"
        ? "long_term_dynamic_points_extension"
        : "dynamic_points_extension",
    renewal_days_fixed: false,
    points_can_extend_expiry: true,
    black_card_default_validity_months: targetPackage === "black_card" ? policy.blackCardDefaultValidityMonths : undefined,
    black_card_review_cycle_months: targetPackage === "black_card" ? policy.blackCardReviewCycleMonths : undefined,
    black_card_expiry_rule:
      targetPackage === "black_card" ? "long_term_dynamic_points_extension" : undefined,
    black_card_lifetime: targetPackage === "black_card" ? false : undefined,
    current_expiry: currentExpiry ? currentExpiry.toISOString() : "",
    base_date: baseDate.toISOString(),
    new_expiry: finalExpiry ? finalExpiry.toISOString() : "",
    expiry_extension_reason: reason,
    extension_policy: extension ? `${extension.value}_${extension.unit}` : "manual_review_required",
    pending_review: accessStatus === "pending_review",
    kept_existing_active_expiry,
    points_balance: pointsBalance,
    points_required: pointsRequired,
    points_shortfall: toNum(payload.points_shortfall),
    points_awarded: pointsLedger?.awarded ? Number(pointsLedger.points || 0) : 0,
    customer_note_th:
      targetPackage === "black_card"
        ? "สถานะ Black Card เป็นสิทธิ์สมาชิกระยะยาวระดับสูง โดยวันหมดอายุสามารถขยายเพิ่มเติมได้ตามยอดใช้งาน points และการอนุมัติจาก MMD Privé สถานะสุดท้ายจะได้รับการตรวจสอบและยืนยันเป็นรายกรณี"
        : "วันหมดอายุสมาชิกอาจขยายเพิ่มเติมได้ตามยอดใช้งานที่เข้าเกณฑ์ points และสถานะแพ็กเกจ โดย Per จะตรวจสอบและยืนยันวันหมดอายุสุดท้ายอีกครั้ง",
  };
}

/* -------------------------------------------------- */
/* confirm link helpers */
/* -------------------------------------------------- */
function base64UrlEncode(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(message || "")));
  return bytesToHex(sig);
}

async function sha256Hex(text) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(String(text || "")));
  return bytesToHex(digest);
}

async function signConfirmToken(payload, secret) {
  const encoded = base64UrlEncode(JSON.stringify(payload || {}));
  const signature = await hmacSha256Hex(encoded, secret);
  return `${encoded}.${signature}`;
}

async function tokenSig(token) {
  const hex = await sha256Hex(token);
  return hex.slice(0, 24);
}

function getConfirmKey(env) {
  const key = toStr(env.CONFIRM_KEY);
  if (!key) throw new Error("missing_confirm_key");
  return key;
}

function getPayKv(env) {
  if (!env.PAY_SESSIONS_KV) throw new Error("missing_pay_sessions_kv");
  return env.PAY_SESSIONS_KV;
}

function getWebBaseUrl(env) {
  return toStr(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
}

function buildAbsoluteUrl(value, fallbackBase) {
  const raw = toStr(value);
  if (!raw) return fallbackBase;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${fallbackBase}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function combineDateAndTime(dateValue, timeValue) {
  const date = toStr(dateValue);
  const time = toStr(timeValue);
  if (!date || !time) return "";
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  const candidate = `${date}T${normalizedTime}+07:00`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function makeSessionId(prefix = "sess") {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

async function createConfirmTokenRecord(env, token, payload) {
  const kv = getPayKv(env);
  await kv.put(`sig:${await tokenSig(token)}`, JSON.stringify(payload), {
    expirationTtl: 60 * 60 * 24 * (toNum(env.PAY_SESSIONS_TTL_DAYS) || 30),
  });
}

async function createSessionIfMissing(env, payload) {
  const existing = await findSessionBySessionId(env, payload.session_id);
  const paymentRefField = sessionField(env, "AT_SESSIONS__PAYMENT_REF", "payment_ref");
  const amountThbField = sessionField(env, "AT_SESSIONS__AMOUNT_THB", "amount_thb");
  const startAt = combineDateAndTime(payload.job_date, payload.start_time);
  const endAt = combineDateAndTime(payload.job_date, payload.end_time);

  if (existing?.id) {
    await airtablePatch(env, getSessionsTable(env), existing.id, compact({
      [paymentRefField]: payload.payment_ref,
      [amountThbField]: payload.amount_thb,
      pay_model_thb: payload.pay_model_thb,
      "Pay Model": payload.pay_model_thb,
      client_name: payload.client_name,
      model_name: payload.model_name,
      job_type: payload.job_type,
      job_date: payload.job_date,
      start_time: startAt || payload.start_time,
      end_time: endAt || payload.end_time,
      location_name: payload.location_name,
      google_map_url: payload.google_map_url,
      note: payload.note,
      notes: payload.note,
      created_at: payload.created_at,
    }));
    return { ok: true, mode: "update", record_id: existing.id };
  }

  const created = await airtableCreate(env, getSessionsTable(env), compact({
    session_id: payload.session_id,
    [paymentRefField]: payload.payment_ref,
    [amountThbField]: payload.amount_thb,
    pay_model_thb: payload.pay_model_thb,
    "Pay Model": payload.pay_model_thb,
    client_name: payload.client_name,
    model_name: payload.model_name,
    job_type: payload.job_type,
    job_date: payload.job_date,
    start_time: startAt || payload.start_time,
    end_time: endAt || payload.end_time,
    location_name: payload.location_name,
    google_map_url: payload.google_map_url,
    note: payload.note,
    notes: payload.note,
    created_at: payload.created_at || nowIso(),
  }));
  return { ok: true, mode: "create", record_id: created?.id || null };
}

/* -------------------------------------------------- */
/* telegram */
/* -------------------------------------------------- */
async function telegramSend(env, text, threadId = null) {
  const token = toStr(env.TELEGRAM_BOT_TOKEN);
  const chatId = toStr(env.TELEGRAM_CHAT_ID || "-1003546439681");
  const thread = toStr(threadId || env.TG_THREAD_CONFIRM || "61");

  if (!token) {
    return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };
  }

  const body = {
    chat_id: chatId,
    text: toStr(text),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  if (thread) body.message_thread_id = Number(thread);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* -------------------------------------------------- */
/* airtable */
/* -------------------------------------------------- */
function getAirtableBaseId(env) {
  const baseId = toStr(env.AIRTABLE_BASE_ID);
  if (!baseId) throw new Error("missing_airtable_base_id");
  return baseId;
}

function getAirtableApiKey(env) {
  const apiKey = toStr(env.AIRTABLE_API_KEY);
  if (!apiKey) throw new Error("missing_airtable_api_key");
  return apiKey;
}

function getPaymentsTable(env) {
  return toStr(env.AIRTABLE_TABLE_PAYMENTS || "payments");
}

function getSessionsTable(env) {
  return toStr(env.AIRTABLE_TABLE_SESSIONS || "sessions");
}

function getPointsLedgerTable(env) {
  return toStr(env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger");
}

function getMemberEntitlementsTable(env) {
  return toStr(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || env.AIRTABLE_TABLE_MEMBER_PACKAGES || "");
}

function getConfiguredMemberEntitlementsTable(env) {
  return toStr(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS);
}

function hasConfirmedEntitlementSource(env) {
  return Boolean(toStr(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS));
}

function membershipAccessSyncMode(env) {
  const mode = toStr(env.MEMBERSHIP_ACCESS_SYNC_MODE).toLowerCase();
  if (mode === "dry_run" || mode === "notify_only" || mode === "enforce") return mode;
  return "dry_run";
}

function getActivityLogsTable(env) {
  return toStr(env.AIRTABLE_TABLE_ACTIVITY_LOGS || "");
}

function sessionField(env, envKey, fallback) {
  return toStr(env?.[envKey] || fallback);
}

function paymentField(env, envKey, fallback) {
  return toStr(env?.[envKey] || fallback);
}

async function airtableFetch(env, path, init = {}) {
  const apiKey = getAirtableApiKey(env);
  const baseId = getAirtableBaseId(env);

  const res = await fetch(`${AIRTABLE_API}/${baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`airtable_error_${res.status}:${JSON.stringify(data)}`);
  }

  return data;
}

function encodeFormulaValue(v) {
  return String(v || "").replace(/'/g, "\\'");
}

async function airtableFindFirstByFormula(env, table, formula) {
  const path = `${encodeURIComponent(table)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;
  const data = await airtableFetch(env, path, { method: "GET" });
  return data?.records?.[0] || null;
}

async function airtableCreate(env, table, fields) {
  const data = await airtableFetch(env, encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  return data?.records?.[0] || null;
}

async function airtablePatch(env, table, recordId, fields) {
  const data = await airtableFetch(env, `${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  return data || null;
}

async function createActivityLogBestEffort(env, fields) {
  const table = getActivityLogsTable(env);
  if (!table) return { ok: true, skipped: true, reason: "missing_activity_logs_table" };
  const action = toStr(fields?.action) || "payments_worker_activity";
  const target = JSON.stringify({
    source: "payments-worker",
    ...fields,
  });
  const targetText = target.length > 90000 ? `${target.slice(0, 90000)}...` : target;
  const attempts = [
    { action, target: targetText },
    { Action: action, Target: targetText },
    { Name: action, Notes: targetText },
    { event: action, payload_json: targetText },
    {},
  ];
  const errors = [];

  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const record = await airtableCreate(env, table, compact(attempts[i]));
      return {
        ok: true,
        record_id: record?.id || null,
        field_shape: Object.keys(attempts[i]).join(",") || "empty_record",
        fallback_attempt: i,
        warning: i === attempts.length - 1 ? "activity_log_schema_fields_unknown_empty_record_created" : undefined,
      };
    } catch (err) {
      errors.push(String(err?.message || err));
    }
  }

  return { ok: false, skipped: true, reason: "activity_log_write_failed", error: errors[errors.length - 1], errors };
}

async function findPaymentByPaymentRef(env, paymentRef) {
  const table = getPaymentsTable(env);
  const paymentRefField = paymentField(env, "AT_PAYMENTS__PAYMENT_REF", "Payment Reference");
  const formula = `{${paymentRefField}}='${encodeFormulaValue(paymentRef)}'`;
  return airtableFindFirstByFormula(env, table, formula);
}

async function findSuccessfulPaymentBySessionAndType(env, sessionId, stage) {
  const table = getPaymentsTable(env);
  const paymentStatusField = paymentField(env, "AT_PAYMENTS__PAYMENT_STATUS", "Payment Status");
  const formula =
    `AND(` +
    `{session_id}='${encodeFormulaValue(sessionId)}',` +
    `{payment_type}='${encodeFormulaValue(stage)}',` +
    `OR({${paymentStatusField}}='success',{${paymentStatusField}}='paid',{${paymentStatusField}}='verified')` +
    `)`;
  return airtableFindFirstByFormula(env, table, formula);
}

async function findSessionBySessionId(env, sessionId) {
  const table = getSessionsTable(env);
  const sessionIdField = sessionField(env, "AT_SESSIONS__SESSION_ID", "session_id");
  const formula = `{${sessionIdField}}='${encodeFormulaValue(sessionId)}'`;
  return airtableFindFirstByFormula(env, table, formula);
}

async function findPointLedgerByPaymentRef(env, paymentRef) {
  const table = getPointsLedgerTable(env);
  const formula = `{payment_ref}='${encodeFormulaValue(paymentRef)}'`;
  return airtableFindFirstByFormula(env, table, formula);
}

function memberEntitlementLookup(body) {
  const lookups = [
    ["entitlement_id", body.entitlement_id],
    ["member_email", body.member_email],
    ["memberstack_id", body.memberstack_id],
    ["telegram_user_id", body.telegram_user_id],
    ["payment_ref", body.payment_ref],
    ["session_id", body.session_id],
  ];
  for (const [field, value] of lookups) {
    const normalized = toStr(value);
    if (normalized) return { field, value: normalized };
  }
  return null;
}

async function findMemberEntitlementForAccessSync(env, body) {
  const table = getConfiguredMemberEntitlementsTable(env);
  if (!table) return { ok: true, skipped: true, reason: "missing_member_entitlements_table" };
  const lookup = memberEntitlementLookup(body);
  if (!lookup) return { ok: true, skipped: true, reason: "missing_entitlement_lookup_key", table };

  try {
    const record = await airtableFindFirstByFormula(
      env,
      table,
      `{${lookup.field}}='${encodeFormulaValue(lookup.value)}'`
    );
    if (!record?.id) {
      return { ok: true, found: false, table, lookup, reason: "entitlement_record_not_found" };
    }
    return { ok: true, found: true, table, lookup, record_id: record.id, fields: record.fields || {} };
  } catch (err) {
    return {
      ok: false,
      table,
      lookup,
      reason: "entitlement_lookup_failed",
      error: String(err?.message || err),
    };
  }
}

function mergeAccessSyncEntitlementPayload(body, entitlementRecord) {
  const fields = entitlementRecord?.fields || {};
  return {
    ...body,
    entitlement_id: body.entitlement_id || fields.entitlement_id,
    member_email: body.member_email || fields.member_email,
    memberstack_id: body.memberstack_id || fields.memberstack_id,
    telegram_user_id: body.telegram_user_id || fields.telegram_user_id,
    telegram_username: body.telegram_username || fields.telegram_username,
    line_user_id: body.line_user_id || fields.line_user_id,
    member_status: body.member_status || fields.member_status,
    access_status: body.access_status || fields.access_status,
    entitlement_level: body.entitlement_level || fields.entitlement_level,
    target_package: body.target_package || body.package_code || fields.package_code,
    package_code: body.package_code || fields.package_code,
    expires_at: body.expires_at || body.expire_at || fields.expire_at,
    entitlement_expires_at: body.entitlement_expires_at || body.expire_at || fields.expire_at,
    grace_until: body.grace_until || fields.grace_until,
    membership_expiry_rule: body.membership_expiry_rule || fields.membership_expiry_rule,
    points_can_extend_expiry: body.points_can_extend_expiry ?? fields.points_can_extend_expiry,
    relationship_tier: body.relationship_tier || fields.relationship_tier,
    handler_mode: body.handler_mode || fields.handler_mode,
    telegram_access_status: body.telegram_access_status || fields.telegram_access_status,
    telegram_group_key: body.telegram_group_key || fields.telegram_group_key,
    telegram_chat_id: body.telegram_chat_id || fields.telegram_chat_id,
    payment_ref: body.payment_ref || fields.payment_ref,
    session_id: body.session_id || fields.session_id,
    payload_json: body.payload_json || fields.payload_json,
  };
}

/* -------------------------------------------------- */
/* core actions */
/* -------------------------------------------------- */
async function createOrUpdatePaymentIntent(env, payload) {
  const table = getPaymentsTable(env);
  const existing = await findPaymentByPaymentRef(env, payload.payment_ref);
  const paymentRefField = paymentField(env, "AT_PAYMENTS__PAYMENT_REF", "Payment Reference");
  const amountField = paymentField(env, "AT_PAYMENTS__AMOUNT", "Amount");
  const packageCodeField = paymentField(env, "AT_PAYMENTS__PACKAGE_CODE", "Package Code");
  const createdAtField = paymentField(env, "AT_PAYMENTS__CREATED_AT", "Created At");

  const fields = compact({
    [paymentRefField]: payload.payment_ref,
    session_id: payload.session_id,
    [amountField]: payload.amount,
    [packageCodeField]: payload.package_code || "",
    [createdAtField]: payload.created_at || nowIso(),
  });

  if (existing?.id) {
    await airtablePatch(env, table, existing.id, fields);
    return { ok: true, mode: "update", record_id: existing.id };
  }

  const created = await airtableCreate(env, table, fields);
  return { ok: true, mode: "create", record_id: created?.id || null };
}

async function updateSessionFromPayment(env, payload) {
  const session = await findSessionBySessionId(env, payload.session_id);
  if (!session?.id) {
    return { ok: false, skipped: true, reason: "session_not_found" };
  }

  const nextStatus = paymentStatusFromStage(payload.stage);
  const sessionStatusField = sessionField(env, "AT_SESSIONS__STATUS", "status");
  const paymentStatusField = sessionField(env, "AT_SESSIONS__PAYMENT_STATUS", "payment_status");
  const paymentRefField = sessionField(env, "AT_SESSIONS__PAYMENT_REF", "payment_ref");
  const amountThbField = sessionField(env, "AT_SESSIONS__AMOUNT_THB", "amount_thb");

  const fields = compact({
    [sessionStatusField]: nextStatus,
    "Session Status": nextStatus,
    [paymentStatusField]: nextStatus,
    [paymentRefField]: payload.payment_ref,
    last_payment_ref: payload.payment_ref,
    [amountThbField]: payload.amount_thb,
    paid_at: payload.paid_at || nowIso(),
    receipt_url: payload.receipt_url || "",
    member_email: payload.member_email || "",
    package_code: payload.package_code || "",
    deposit_paid_at: payload.stage === "deposit" ? (payload.paid_at || nowIso()) : undefined,
    final_paid_at: payload.stage === "final" || payload.stage === "full" ? (payload.paid_at || nowIso()) : undefined,
    tips_paid_at: payload.stage === "tips" ? (payload.paid_at || nowIso()) : undefined,
  });

  await airtablePatch(env, getSessionsTable(env), session.id, fields);

  return {
    ok: true,
    session_record_id: session.id,
    status: nextStatus,
  };
}

async function awardPointsIfEligible(env, payload) {
  if (!stageEligibleForPoints(payload.stage)) {
    return { ok: true, skipped: true, reason: "stage_not_eligible" };
  }

  const existing = await findPointLedgerByPaymentRef(env, payload.payment_ref);
  if (existing?.id) {
    return { ok: true, duplicate: true, awarded: false, record_id: existing.id, points: 0 };
  }

  const points = computePoints(env, payload.amount_thb);
  if (points <= 0) {
    return { ok: true, skipped: true, reason: "points_zero", awarded: false, points: 0 };
  }

  const record = await airtableCreate(env, getPointsLedgerTable(env), {
    payment_ref: payload.payment_ref,
    session_id: payload.session_id || "",
    member_email: payload.member_email || "",
    package_code: payload.package_code || "",
    amount_thb: payload.amount_thb,
    points,
    type: "earn",
    payment_type: payload.stage,
    created_at: nowIso(),
  });

  return {
    ok: true,
    awarded: true,
    record_id: record?.id || null,
    points,
  };
}

async function recordMembershipEntitlementIfApplicable(env, payload, pointsLedger = null) {
  if (payload.stage !== "membership" && !truthy(payload.membership_renewal)) {
    return { ok: true, skipped: true, reason: "not_membership_payload" };
  }

  const decision = resolveMembershipExpiryDecision(env, payload, pointsLedger);
  const table = getMemberEntitlementsTable(env);
  if (!table) {
    await createActivityLogBestEffort(env, {
      action: "membership_entitlement_decision_no_table",
      member_email: payload.member_email || "",
      payment_ref: payload.payment_ref || "",
      target_package: decision.target_package,
      entitlement_level: decision.entitlement_level,
      access_status: decision.access_status,
      expiry_extension_reason: decision.expiry_extension_reason,
      new_expiry: decision.new_expiry,
    });
    return { ok: true, skipped: true, reason: "missing_member_entitlements_table", decision };
  }

  try {
    const record = await airtableCreate(env, table, compact({
      member_email: payload.member_email || "",
      payment_ref: payload.payment_ref || "",
      session_id: payload.session_id || "",
      target_package: decision.target_package,
      target_package_label: decision.target_package_label,
      member_status: decision.member_status,
      entitlement_level: decision.entitlement_level,
      relationship_tier: decision.relationship_tier,
      handler_mode: decision.handler_mode,
      handled_by: decision.handled_by,
      pre_release_review_required: decision.pre_release_review_required,
      private_first_contact: decision.private_first_contact,
      access_status: decision.access_status,
      current_expiry: decision.current_expiry,
      new_expiry: decision.new_expiry,
      membership_expiry_rule: decision.membership_expiry_rule,
      renewal_days_fixed: decision.renewal_days_fixed,
      points_can_extend_expiry: decision.points_can_extend_expiry,
      expiry_extension_reason: decision.expiry_extension_reason,
      extension_policy: decision.extension_policy,
      black_card_default_validity_months: decision.black_card_default_validity_months,
      black_card_review_cycle_months: decision.black_card_review_cycle_months,
      black_card_expiry_rule: decision.black_card_expiry_rule,
      black_card_lifetime: decision.black_card_lifetime,
      amount_thb: payload.amount_thb,
      payment_method: payload.payment_method || "",
      payment_method_label: paymentMethodLabel(payload.payment_method),
      payment_reference_url: payload.payment_reference_url || "",
      points_balance: decision.points_balance,
      points_required: decision.points_required,
      points_shortfall: decision.points_shortfall,
      points_awarded: decision.points_awarded,
      audit_note: decision.pending_review
        ? "Dynamic membership expiry needs Per/manual review; no fixed 365-day assumption was applied."
        : "Dynamic membership expiry decision recorded by payments-worker.",
      customer_note_th: decision.customer_note_th,
      created_at: nowIso(),
    }));

    await createActivityLogBestEffort(env, {
      action: "membership_entitlement_decision_recorded",
      member_email: payload.member_email || "",
      payment_ref: payload.payment_ref || "",
      target_package: decision.target_package,
      entitlement_level: decision.entitlement_level,
      access_status: decision.access_status,
      expiry_extension_reason: decision.expiry_extension_reason,
      relationship_tier: decision.relationship_tier,
      handler_mode: decision.handler_mode,
      new_expiry: decision.new_expiry,
    });

    return { ok: true, record_id: record?.id || null, decision };
  } catch (err) {
    return {
      ok: false,
      skipped: true,
      reason: "member_entitlement_write_failed",
      error: String(err?.message || err),
      decision,
    };
  }
}

async function telegramApi(env, method, body) {
  const token = toStr(env.TELEGRAM_BOT_TOKEN);
  if (!token) return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function privateTelegramGroupForEntitlement(env, entitlement) {
  const level = toStr(entitlement).toLowerCase();
  if (level === "black_card") {
    return { chat_id: toStr(env.TG_CHAT_BLACK_ROOM || "-1003348473234"), reason: "black_card_expired_removed_from_group" };
  }
  if (level === "vip") {
    return { chat_id: toStr(env.TG_CHAT_VIP_LOUNGE || "-1003578473671"), reason: "vip_expired_removed_from_group" };
  }
  if (level === "premium") {
    return { chat_id: toStr(env.TG_CHAT_MMD_PREMIUM || "-1001668261779"), reason: "premium_expired_removed_from_group" };
  }
  if (level === "guest_pass" || level === "guest_limited") {
    return { chat_id: toStr(env.TG_CHAT_PREVIEW_TH || "-1002393788585"), reason: "guest_pass_expired_removed_from_group" };
  }
  return { chat_id: "", reason: "" };
}

function shouldRemovePrivateTelegramAccess(payload) {
  const accessStatus = toStr(payload.access_status).toLowerCase();
  const now = new Date();
  const expiresAt = parseIsoDate(payload.expires_at || payload.membership_expiry || payload.entitlement_expires_at);
  const graceUntil = parseIsoDate(payload.grace_until || payload.review_until);
  const pendingReview =
    accessStatus === "pending_review" ||
    accessStatus === "pending_payment" ||
    accessStatus === "grace" ||
    truthy(payload.pending_review) ||
    truthy(payload.pending_payment) ||
    truthy(payload.review_extension_pending) ||
    truthy(payload.payment_review_pending) ||
    truthy(payload.manual_review_required) ||
    truthy(payload.active_extension_review);
  const expiredByStatus = accessStatus === "expired" || accessStatus === "revoked";
  const expiredByDate = Boolean(expiresAt && expiresAt <= now);

  if (accessStatus === "pending_review" || accessStatus === "pending_payment" || accessStatus === "grace") {
    return { ok: false, reason: `status_${accessStatus}` };
  }
  if (pendingReview) return { ok: false, reason: "pending_payment_or_review_extension" };
  if (!expiredByDate && !expiredByStatus) return { ok: false, reason: "entitlement_not_expired" };
  if (graceUntil && graceUntil > now) return { ok: false, reason: "grace_or_review_active" };
  if (expiredByStatus) return { ok: true, reason: accessStatus };
  if (expiredByDate) return { ok: true, reason: graceUntil ? "expiry_and_grace_elapsed" : "expiry_elapsed" };
  return { ok: false, reason: "not_expired_or_still_reviewable" };
}

async function handleMembershipAccessSync(req, env) {
  if (!isInternalAuthed(req, env) && !hasConfirmKey(req, env)) {
    return withCors(req, env, jsonResponse({ ok: false, error: "unauthorized" }, 401));
  }

  const requestBody = await readJson(req);
  const accessSyncMode = membershipAccessSyncMode(env);
  const entitlementSourceConfirmed = hasConfirmedEntitlementSource(env);
  const entitlementRecord = await findMemberEntitlementForAccessSync(env, requestBody);
  const body = mergeAccessSyncEntitlementPayload(requestBody, entitlementRecord);
  const relationshipTier = normalizeRelationshipTier(body.relationship_tier);
  const handlerMode = handlerModeForRelationshipTier(relationshipTier, body.handler_mode);
  const entitlement = relationshipTier === "svip"
    ? "black_card"
    : toStr(body.entitlement_level || entitlementLevelForPackage(body.member_status || body.target_package));
  const telegramUserId = toStr(body.telegram_user_id);
  const group = privateTelegramGroupForEntitlement(env, entitlement);
  const removeDecision = shouldRemovePrivateTelegramAccess(body);
  const removalCandidate = Boolean(
    accessSyncMode === "enforce" &&
    entitlementSourceConfirmed &&
    entitlementRecord.found &&
    telegramUserId &&
    group.chat_id &&
    removeDecision.ok
  );

  if (accessSyncMode === "enforce" && !entitlementSourceConfirmed) {
    const activity = await createActivityLogBestEffort(env, {
      action: "membership_access_sync_enforce_blocked",
      member_email: body.member_email || "",
      telegram_user_id: telegramUserId,
      entitlement_level: entitlement,
      access_status: body.access_status || "",
      reason: "enforce_requires_member_entitlements_source",
      note:
        "enforce mode requires AIRTABLE_TABLE_MEMBER_ENTITLEMENTS or confirmed entitlement source of truth; activity logs are audit/fallback only.",
      entitlement_source: entitlementRecord.found ? "airtable_member_entitlements" : "not_confirmed",
      entitlement_record_id: entitlementRecord.record_id || "",
    });
    return withCors(req, env, jsonResponse({
      ok: false,
      blocked: true,
      mode: accessSyncMode,
      error: "enforce_requires_entitlement_source_of_truth",
      message:
        "enforce mode requires AIRTABLE_TABLE_MEMBER_ENTITLEMENTS or confirmed entitlement source of truth",
      entitlement_source_confirmed: false,
      activity_logs_authoritative: false,
      entitlement_source: entitlementRecord.found ? "airtable_member_entitlements" : "not_confirmed",
      entitlement_record: entitlementRecord,
      entitlement_level: entitlement,
      removeDecision,
      activity,
    }, 409));
  }

  if (handlerMode === "per_private_first" && truthy(body.sensitive_release_request)) {
    const activity = await createActivityLogBestEffort(env, {
      action: "svip_per_private_first_release_routed",
      member_email: body.member_email || "",
      telegram_user_id: telegramUserId,
      entitlement_level: "black_card",
      relationship_tier: relationshipTier,
      handler_mode: handlerMode,
      note: "SVIP is Black Card entitlement with Per-private-first handling before sensitive release.",
    });
    return withCors(req, env, jsonResponse({
      ok: true,
      action: "per_private_first_required",
      entitlement_level: "black_card",
      relationship_tier: relationshipTier,
      handler_mode: handlerMode,
      activity,
    }));
  }

  if (accessSyncMode === "dry_run" || accessSyncMode === "notify_only") {
    const activity = await createActivityLogBestEffort(env, {
      action: "membership_access_sync_safe_mode",
      member_email: body.member_email || "",
      telegram_user_id: telegramUserId,
      telegram_chat_id: group.chat_id || "",
      entitlement_level: entitlement,
      access_status: body.access_status || "",
      mode: accessSyncMode,
      would_remove: Boolean(telegramUserId && group.chat_id && removeDecision.ok),
      reason: removeDecision.reason,
      entitlement_source: entitlementRecord.found ? "airtable_member_entitlements" : "request_payload",
      entitlement_record_id: entitlementRecord.record_id || "",
      note:
        accessSyncMode === "notify_only"
          ? "notify_only calculated the access removal candidate and notified Per/admin without Telegram removal."
          : "dry_run calculated the access removal candidate without Telegram removal.",
    });
    const adminNotice = accessSyncMode === "notify_only"
      ? await telegramSend(
          env,
          [
            "<b>Membership access sync notify-only</b>",
            `Member: <code>${esc(body.member_email || body.member_id || "unknown")}</code>`,
            `Entitlement: <code>${esc(entitlement)}</code>`,
            `Telegram user: <code>${esc(telegramUserId || "missing")}</code>`,
            `Target group: <code>${esc(group.chat_id || "missing")}</code>`,
            `Decision: <code>${esc(removeDecision.ok ? "would_remove" : "skip")}</code>`,
            `Reason: <code>${esc(removeDecision.reason)}</code>`,
          ].join("\n"),
          env.TG_THREAD_CONFIRM || "61"
        )
      : { ok: true, skipped: true, reason: "mode_dry_run" };

    return withCors(req, env, jsonResponse({
      ok: true,
      mode: accessSyncMode,
      destructive_removal_enabled: false,
      entitlement_source_confirmed: entitlementSourceConfirmed,
      entitlement_source: entitlementRecord.found ? "airtable_member_entitlements" : "request_payload",
      entitlement_record: entitlementRecord,
      activity_logs_authoritative: false,
      would_remove: Boolean(telegramUserId && group.chat_id && removeDecision.ok),
      entitlement_level: entitlement,
      telegram_user_id: telegramUserId,
      target_chat_id: group.chat_id || "",
      removal_action: group.reason || "",
      removeDecision,
      admin_notice: adminNotice,
      activity,
    }));
  }

  if (!telegramUserId) {
    return withCors(req, env, jsonResponse({ ok: true, mode: accessSyncMode, skipped: true, reason: "missing_telegram_user_id", removeDecision }));
  }
  if (!group.chat_id) {
    return withCors(req, env, jsonResponse({ ok: true, mode: accessSyncMode, skipped: true, reason: "no_private_group_for_entitlement", entitlement }));
  }
  if (!removeDecision.ok) {
    return withCors(req, env, jsonResponse({ ok: true, mode: accessSyncMode, skipped: true, reason: removeDecision.reason, entitlement }));
  }
  if (!removalCandidate) {
    return withCors(req, env, jsonResponse({
      ok: false,
      mode: accessSyncMode,
      skipped: true,
      reason: "destructive_removal_conditions_not_met",
      entitlement_source_confirmed: entitlementSourceConfirmed,
      entitlement,
      removeDecision,
    }, 409));
  }

  const notify = truthy(body.notify_customer);
  const notice = notify
    ? await telegramApi(env, "sendMessage", {
        chat_id: telegramUserId,
        text:
          "สิทธิ์ส่วนตัวของคุณหมดอายุหรืออยู่ระหว่างการตรวจสอบครับ หากต้องการต่ออายุหรือให้ Per ตรวจสอบสิทธิ์อีกครั้ง กรุณาติดต่อทีม MMD Privé ครับ",
      })
    : { ok: true, skipped: true, reason: "notify_customer_false" };
  const ban = await telegramApi(env, "banChatMember", {
    chat_id: group.chat_id,
    user_id: telegramUserId,
  });
  const unban = ban.ok
    ? await telegramApi(env, "unbanChatMember", {
        chat_id: group.chat_id,
        user_id: telegramUserId,
        only_if_banned: true,
      })
    : { ok: false, skipped: true, reason: "ban_failed" };
  const activity = await createActivityLogBestEffort(env, {
    action: group.reason,
    member_email: body.member_email || "",
    telegram_user_id: telegramUserId,
    telegram_chat_id: group.chat_id,
    entitlement_level: entitlement,
    access_status: body.access_status || "",
    expiry: body.expires_at || body.membership_expiry || body.entitlement_expires_at || "",
    downgrade_to: body.downgrade_to || "standard_basic",
    telegram_removal_ok: ban.ok,
    telegram_removal_status: ban.status || "",
    telegram_removal_error: ban.ok ? "" : JSON.stringify(ban.data || ban),
    telegram_unban_ok: unban.ok,
    telegram_unban_status: unban.status || "",
    entitlement_source: entitlementRecord.found ? "airtable_member_entitlements" : "request_payload",
    entitlement_record_id: entitlementRecord.record_id || "",
  });

  return withCors(req, env, jsonResponse({
    ok: ban.ok,
    action: group.reason,
    entitlement_level: entitlement,
    removed_from_chat_id: group.chat_id,
    downgraded_to: body.downgrade_to || "standard_basic",
    entitlement_source: entitlementRecord.found ? "airtable_member_entitlements" : "request_payload",
    entitlement_record,
    notice,
    ban,
    unban,
    activity,
  }, ban.ok ? 200 : 502));
}

/* -------------------------------------------------- */
/* handlers */
/* -------------------------------------------------- */
async function handlePing(req, env) {
  return withCors(
    req,
    env,
    jsonResponse({
      ok: true,
      worker: "payments-worker",
      lock: LOCK,
      ts: Date.now(),
      env: {
        airtable_base_id: toStr(env.AIRTABLE_BASE_ID),
        payments_table: getPaymentsTable(env),
        sessions_table: getSessionsTable(env),
        points_ledger_table: getPointsLedgerTable(env),
        telegram_chat_id: toStr(env.TELEGRAM_CHAT_ID || "-1003546439681"),
        tg_thread_confirm: toStr(env.TG_THREAD_CONFIRM || "61"),
        tg_thread_points: toStr(env.TG_THREAD_POINTS || "17"),
      },
    })
  );
}

async function handleVerify(req, env) {
  const body = await readJson(req);

  try {
    const session_id = toStr(assertRequired(body.session_id, "session_id"));
    const payment_stage = normalizeStage(body.payment_stage || body.payment_type || "deposit");
    const amount = ensurePositiveNumber(body.amount, "amount");
    const payment_method = toStr(body.payment_method || "promptpay");
    const member_email = toStr(body.member_email || body.email);
    const package_code = toStr(body.package_code || body.package);
    const notes = toStr(body.notes || body.note);
    const receipt_url = toStr(body.receipt_url || body.slip_url);
    const paid_at = toStr(body.paid_at || nowIso());
    const payment_ref = toStr(body.payment_ref || body.transaction_ref || makePaymentRef("pay"));
    const verify_strict = truthy(env.VERIFY_STRICT);

    const duplicateByRef = await findPaymentByPaymentRef(env, payment_ref);
    if (duplicateByRef?.id) {
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          duplicated: true,
          idempotent: true,
          reason: "payment_ref_already_exists",
          payment_ref,
          session_id,
          existing_record_id: duplicateByRef.id,
        })
      );
    }

    const duplicateByStage = await findSuccessfulPaymentBySessionAndType(env, session_id, payment_stage);
    if (duplicateByStage?.id && verify_strict) {
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          duplicated: true,
          idempotent: true,
          reason: "session_id_payment_type_already_verified",
          payment_ref,
          session_id,
          existing_record_id: duplicateByStage.id,
        })
      );
    }

    const paymentWrite = await createOrUpdatePaymentIntent(env, {
      session_id,
      payment_stage,
      amount,
      payment_method,
      member_email,
      package_code,
      notes,
      receipt_url,
      paid_at,
      payment_ref,
      payment_status: "pending",
      verification_status: "pending",
      intent_status: receipt_url ? "manual_slip_submitted" : "manual_review",
      created_at: nowIso(),
    });

    try {
      await telegramSend(
        env,
        [
          "🧾 <b>PAYMENT INTENT CREATED</b>",
          `Session: <code>${esc(session_id)}</code>`,
          `Stage: <b>${esc(payment_stage)}</b>`,
          `Amount: <b>${Number(amount || 0)} THB</b>`,
          `Payment Ref: <code>${esc(payment_ref)}</code>`,
          package_code ? `Package: <b>${esc(package_code)}</b>` : "",
          member_email ? `Member: ${esc(member_email)}` : "",
        ].filter(Boolean).join("\n"),
        env.TG_THREAD_CONFIRM || "61"
      );
    } catch (_) {}

    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        session_id,
        payment_stage,
        payment_ref,
        amount,
        payment_method,
        payment_write: paymentWrite,
        status: "pending",
        verification_status: "pending",
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}

async function handleNotify(req, env) {
  if (!isInternalAuthed(req, env) && !hasConfirmKey(req, env)) {
    return withCors(req, env, jsonResponse({ ok: false, error: "unauthorized" }, 401));
  }

  const body = await readJson(req);

  try {
    const payment_ref = toStr(assertRequired(body.payment_ref || body.transaction_ref, "payment_ref"));
    const stage = normalizeStage(body.stage || body.payment_stage || body.payment_type || "deposit");
    const session_id = toStr(body.session_id);
    const amount_thb = ensurePositiveNumber(body.amount_thb || body.amount, "amount_thb");
    const member_email = toStr(body.member_email || body.email);
    const package_code = toStr(body.package_code || body.package);
    const payment_method = toStr(body.payment_method || "promptpay");
    const payment_reference_url = toStr(body.payment_reference_url);
    const receipt_url = toStr(body.receipt_url || body.slip_url);
    const paid_at = toStr(body.paid_at || nowIso());
    const commissionSplits = normalizeCommissionSplits(
      body.commission_splits || body.referral_splits
    );
    const hasCommissionSplits = commissionSplits.length > 0;
    const commissionSnapshot = body.commission_snapshot || {
      session_id,
      payment_ref,
      stage,
      paid_at,
      splits: commissionSplits,
    };

    const paymentWrite = await createOrUpdatePaymentIntent(env, {
      session_id,
      payment_stage: stage,
      amount: amount_thb,
      payment_method,
      member_email,
      package_code,
      receipt_url,
      paid_at,
      payment_ref,
      payment_status: "paid",
      verification_status: "verified",
      intent_status: receipt_url ? "manual_slip_submitted" : "manual_review",
      created_at: nowIso(),
    });

    const session_updated = session_id
      ? await updateSessionFromPayment(env, {
          payment_ref,
          stage,
          session_id,
          amount_thb,
          member_email,
          package_code,
          receipt_url,
          paid_at,
        })
      : { ok: false, skipped: true, reason: "missing_session_id" };

    const points_ledger = await awardPointsIfEligible(env, {
      payment_ref,
      stage,
      session_id,
      amount_thb,
      member_email,
      package_code,
    });

    const membership_entitlement = await recordMembershipEntitlementIfApplicable(env, {
      payment_ref,
      stage,
      session_id,
      amount_thb,
      member_email,
      package_code,
      target_package: body.target_package || body.target_tier || package_code,
      target_package_label: body.target_package_label || body.package_label,
      payment_method,
      payment_reference_url,
      current_expiry: body.current_expiry || body.membership_expiry || body.membership_expire_at || body.expires_at,
      points_balance: body.points_balance,
      points_required: body.points_required,
      points_shortfall: body.points_shortfall,
      points_threshold_reached: body.points_threshold_reached,
      total_spend_thb: body.total_spend_thb || body.spending_total_thb || body.eligible_spending_thb,
      spending_required: body.spending_required || body.spending_required_thb,
      spending_threshold_reached: body.spending_threshold_reached,
      expiry_extension_reason: body.expiry_extension_reason,
      relationship_tier: body.relationship_tier,
      handler_mode: body.handler_mode,
      paid_renewal_confirmed: true,
      membership_renewal: stage === "membership",
    }, points_ledger);

    const eligibilityStatus =
      stage === "final" || stage === "full" || stage === "membership"
        ? "eligible"
        : "pending_payment";

    const commission_rows =
      session_id && hasCommissionSplits
        ? await ensureCommissionRowsForSession(env, {
            session_id,
            payment_ref,
            commission_splits: commissionSplits,
            model_id: toStr(body.model_id || body.model_record_id),
            partner_snapshot: body.partner_snapshot || null,
            referral_snapshot: body.referral_snapshot || null,
            commission_snapshot: commissionSnapshot,
            commission_group_key: body.commission_group_key || session_id,
            commission_snapshot_locked: true,
            actor: toStr(body.actor || "payments-worker"),
            source: "payments.notify",
          })
        : { ok: true, skipped: true, reason: "no_commission_splits" };

    const commission_snapshots =
      session_id && (hasCommissionSplits || body.commission_snapshot)
        ? await mirrorCommissionSnapshot(env, {
            session_id,
            partner_snapshot: body.partner_snapshot || null,
            referral_snapshot: body.referral_snapshot || null,
            commission_snapshot: commissionSnapshot,
            commission_group_key: body.commission_group_key || session_id,
            commission_snapshot_locked: true,
          })
        : { ok: true, skipped: true, reason: "no_commission_snapshot" };

    const commission_eligibility = session_id
      ? await updateCommissionEligibilityForSession(env, {
          session_id,
          payment_ref,
          eligibility_status: eligibilityStatus,
          actor: toStr(body.actor || "payments-worker"),
          eligible_at: paid_at,
        })
      : { ok: true, skipped: true, reason: "missing_session_id" };

    try {
      await telegramSend(
        env,
        [
          "✅ <b>PAYMENT NOTIFIED / PAID</b>",
          `Ref: <code>${esc(payment_ref)}</code>`,
          stage ? `Stage: <b>${esc(stage)}</b>` : "",
          session_id ? `Session: <code>${esc(session_id)}</code>` : "",
          package_code ? `Package: <b>${esc(package_code)}</b>` : "",
          membership_entitlement?.decision?.target_package
            ? `Target: <b>${esc(membership_entitlement.decision.target_package_label)}</b>`
            : "",
          membership_entitlement?.decision?.membership_expiry_rule
            ? `Expiry rule: <code>${esc(membership_entitlement.decision.membership_expiry_rule)}</code>`
            : "",
          membership_entitlement?.decision?.access_status
            ? `Access: <b>${esc(membership_entitlement.decision.access_status)}</b>`
            : "",
          amount_thb ? `Amount: <b>${Number(amount_thb)} THB</b>` : "",
          member_email ? `Member: ${esc(member_email)}` : "",
          session_updated?.ok ? "Session updated: <b>yes</b>" : "Session updated: <b>no</b>",
        ].filter(Boolean).join("\n"),
        env.TG_THREAD_CONFIRM || "61"
      );
    } catch (_) {}

    if (points_ledger && points_ledger.ok && points_ledger.awarded) {
      try {
        await telegramSend(
          env,
          [
            "🎯 <b>POINTS AWARDED</b>",
            `Ref: <code>${esc(payment_ref)}</code>`,
            `Points: <b>${Number(points_ledger.points || 0)}</b>`,
            amount_thb ? `Amount: <b>${Number(amount_thb)} THB</b>` : "",
            member_email ? `Member: ${esc(member_email)}` : "",
          ].filter(Boolean).join("\n"),
          env.TG_THREAD_POINTS || "17"
        );
      } catch (_) {}
    }

    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        payment_ref,
        stage,
        session_id,
        amount_thb,
        payment_write: paymentWrite,
        session_updated,
        points_ledger,
        membership_entitlement,
        commission_rows,
        commission_snapshots,
        commission_eligibility,
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}

async function handleConfirmLink(req, env) {
  const body = await readJson(req);

  try {
    const session_id = toStr(body.session_id || makeSessionId("sess"));
    const client_name = toStr(assertRequired(body.client_name, "client_name"));
    const model_name = toStr(assertRequired(body.model_name, "model_name"));
    const job_type = toStr(assertRequired(body.job_type, "job_type"));
    const job_date = toStr(assertRequired(body.job_date, "job_date"));
    const start_time = toStr(assertRequired(body.start_time, "start_time"));
    const end_time = toStr(assertRequired(body.end_time, "end_time"));
    const location_name = toStr(assertRequired(body.location_name, "location_name"));
    const google_map_url = toStr(body.google_map_url);
    const amount_thb = ensurePositiveNumber(body.amount_thb || body.amount, "amount_thb");
    const pay_model_thb =
      body.pay_model_thb == null &&
      body.pay_model == null &&
      body.model_pay_thb == null &&
      body.model_pay == null
        ? undefined
        : ensureNonNegativeNumber(
            body.pay_model_thb ?? body.pay_model ?? body.model_pay_thb ?? body.model_pay,
            "pay_model_thb"
          );
    const payment_type = normalizeStage(body.payment_type || body.payment_stage || "full");
    const payment_method = toStr(body.payment_method || "promptpay");
    const note = toStr(body.note || body.notes);
    const commissionSplits = normalizeCommissionSplits(
      body.commission_splits || body.referral_splits
    );
    const hasCommissionSplits = commissionSplits.length > 0;

    const payment_ref = toStr(body.payment_ref || makePaymentRef("pay"));
    const created_at = nowIso();

    const base = getWebBaseUrl(env);
    const customerConfirmPage = buildAbsoluteUrl(body.confirm_page || "/confirm/job-confirmation", base);
    const modelConfirmPage = buildAbsoluteUrl(body.model_confirm_page || "/confirm/job-model", base);

    const confirmKey = getConfirmKey(env);

    const customerPayload = {
      kind: "customer_confirm",
      role: "customer",
      session_id,
      payment_ref,
      payment_type,
    };

    const modelPayload = {
      kind: "model_confirm",
      role: "model",
      session_id,
      payment_ref,
      payment_type,
    };

    const customer_t = await signConfirmToken(customerPayload, confirmKey);
    const model_t = await signConfirmToken(modelPayload, confirmKey);

    await createConfirmTokenRecord(env, customer_t, customerPayload);
    await createConfirmTokenRecord(env, model_t, modelPayload);

    const session_write = await createSessionIfMissing(env, {
      session_id,
      payment_ref,
      payment_type,
      payment_status: "Pending",
      status: "Pending",
      amount_thb,
      pay_model_thb,
      client_name,
      model_name,
      job_type,
      job_date,
      start_time,
      end_time,
      location_name,
      google_map_url,
      note,
      created_at,
    });

    const commissionSnapshot = hasCommissionSplits
      ? body.commission_snapshot || {
          session_id,
          payment_ref,
          created_at,
          splits: commissionSplits,
        }
      : null;

    const commission_rows = hasCommissionSplits
      ? await ensureCommissionRowsForSession(env, {
          session_id,
          payment_ref,
          commission_splits: commissionSplits,
          model_id: toStr(body.model_id || body.model_record_id),
          partner_snapshot: body.partner_snapshot || null,
          referral_snapshot: body.referral_snapshot || null,
          commission_snapshot: commissionSnapshot,
          commission_group_key: body.commission_group_key || session_id,
          commission_snapshot_locked: true,
          actor: toStr(body.actor || "payments-worker"),
          source: "payments.confirm_link",
        })
      : { ok: true, skipped: true, reason: "no_commission_splits" };

    const commission_snapshots = hasCommissionSplits
      ? await mirrorCommissionSnapshot(env, {
          session_id,
          partner_snapshot: body.partner_snapshot || null,
          referral_snapshot: body.referral_snapshot || null,
          commission_snapshot: commissionSnapshot,
          commission_group_key: body.commission_group_key || session_id,
          commission_snapshot_locked: true,
        })
      : { ok: true, skipped: true, reason: "no_commission_splits" };

    const payment_write = await createOrUpdatePaymentIntent(env, {
      session_id,
      payment_ref,
      payment_stage: payment_type,
      amount: amount_thb,
      pay_model_thb,
      payment_method,
      notes: note,
      created_at,
      payment_status: "pending",
      verification_status: "pending",
      intent_status: "manual_review",
    });

    const customer_confirmation_url = `${customerConfirmPage}?t=${encodeURIComponent(customer_t)}`;
    const model_confirmation_url = `${modelConfirmPage}?t=${encodeURIComponent(model_t)}`;

    try {
      await telegramSend(
        env,
        [
          "🔗 <b>CONFIRM LINKS CREATED</b>",
          `Session: <code>${esc(session_id)}</code>`,
          `Payment Ref: <code>${esc(payment_ref)}</code>`,
          `Client: <b>${esc(client_name)}</b>`,
          `Model: <b>${esc(model_name)}</b>`,
          `Type: <b>${esc(job_type)}</b>`,
          `Amount: <b>${Number(amount_thb)} THB</b>`,
          pay_model_thb != null ? `Pay Model: <b>${Number(pay_model_thb)} THB</b>` : "",
        ].join("\n"),
        env.TG_THREAD_CONFIRM || "61"
      );
    } catch (_) {}

    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        session_id,
        payment_ref,
        customer_t,
        model_t,
        customer_confirmation_url,
        model_confirmation_url,
        payment_write,
        session_write,
        commission_rows,
        commission_snapshots,
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}

async function handlePromoValidate(req, env) {
  const body = await readJson(req);

  try {
    const amount = ensurePositiveNumber(body.amount, "amount");
    const code = toStr(body.code || body.promo_code).toUpperCase();

    const catalog = {
      SONGKRAN5: { type: "percent", value: 5, active: true },
      SONGKRAN10: { type: "percent", value: 10, active: true },
      WELCOME100: { type: "fixed", value: 100, active: true },
    };

    const promo = catalog[code];
    if (!promo?.active) {
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          valid: false,
          code,
          amount,
          discount_amount: 0,
          discounted_amount: amount,
        })
      );
    }

    let discount = 0;
    if (promo.type === "percent") discount = Math.floor((amount * promo.value) / 100);
    if (promo.type === "fixed") discount = Math.min(amount, promo.value);

    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        valid: true,
        code,
        amount,
        discount_amount: discount,
        discounted_amount: Math.max(0, amount - discount),
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}

async function handleInternalPay(req, env) {
  if (!isInternalAuthed(req, env)) {
    return withCors(req, env, jsonResponse({ ok: false, error: "unauthorized" }, 401));
  }

  const body = await readJson(req);
  const action = toStr(body.action || body.op || body.operation).toLowerCase();

  // Compatibility route for older internal callers that expected a single
  // payment endpoint instead of the split verify/notify contract.
  if (action === "verify" || action === "intent" || action === "create_intent") {
    return handleVerify(
      new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      }),
      env
    );
  }

  if (action === "notify" || action === "confirm" || action === "paid") {
    return handleNotify(
      new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      }),
      env
    );
  }

  if (body.payment_ref || body.transaction_ref) {
    return handleNotify(
      new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      }),
      env
    );
  }

  if (body.session_id && (body.amount != null || body.amount_thb != null)) {
    return handleVerify(
      new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify({
          ...body,
          amount: body.amount ?? body.amount_thb,
        }),
      }),
      env
    );
  }

  return withCors(
    req,
    env,
    jsonResponse(
      {
        ok: false,
        error: "invalid_internal_payment_request",
        hint: "Set action=verify or action=notify, or include payment_ref for notify.",
      },
      400
    )
  );
}

/* -------------------------------------------------- */
/* worker */
/* -------------------------------------------------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(req, env),
      });
    }

    if (method === "GET" && (path === "/ping" || path === "/health")) {
      return handlePing(req, env);
    }

    if (method === "POST" && path === "/promo/validate") {
      return handlePromoValidate(req, env);
    }

    if (method === "POST" && path === "/pay/internal") {
      return handleInternalPay(req, env);
    }

    if (method === "POST" && path === "/v1/confirm/link") {
      return handleConfirmLink(req, env);
    }

    if (method === "POST" && path === "/v1/pay/verify") {
      return handleVerify(req, env);
    }

    if (method === "POST" && (path === "/v1/payments/notify" || path === "/v1/pay/notify")) {
      return handleNotify(req, env);
    }

    if (method === "POST" && path === "/v1/membership/access/sync") {
      return handleMembershipAccessSync(req, env);
    }

    return withCors(req, env, jsonResponse({ ok: false, error: "not_found" }, 404));
  },
};
