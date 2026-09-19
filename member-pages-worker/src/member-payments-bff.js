import stableLiffFoundation from "./liff-stable-session-binding.js";
import { readMemberAppSession } from "./member-app-api.js";

const PATHS = new Set(["/v1/member/payments", "/v1/member/payments/"]);
const ALLOWED_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const PACKAGE_LABELS = Object.freeze({
  mmd_member: "MMD Member",
  elite: "Elite",
  red_card: "Red Card",
  standard: "Standard Membership",
  premium: "Premium Membership",
  blackcard: "Black Card",
  black_card: "Black Card",
  tmib_act_001: "TMIB · ACT 001",
});

function clean(value, max = 240) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/").toLowerCase();
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function json(payload, status = 200, headers = null, head = false) {
  const out = new Headers(headers || {});
  out.delete("content-length");
  out.set("content-type", "application/json; charset=utf-8");
  out.set("cache-control", "no-store");
  out.set("x-mmd-member-payments-bff", "v1");
  out.set("x-mmd-payment-authority", "payments-worker");
  return new Response(head ? null : JSON.stringify(payload), { status, headers: out });
}

function sameOrigin(request) {
  const origin = clean(request.headers.get("origin"), 240);
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function safeMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100000000
    ? Math.round(number * 100) / 100
    : null;
}

function safeDate(value) {
  const text = clean(value, 80);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function packageLabel(code) {
  const key = clean(code, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return PACKAGE_LABELS[key] || (key ? "MMD Payment" : "MMD Payment");
}

function canonicalSignedPaymentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const keys = [...url.searchParams.keys()];
    if (url.protocol !== "https:" || url.hostname !== "mmdbkk.com" || url.port || url.username || url.password || url.hash) return "";
    if (!["/pay/checkout", "/sigil/pay"].includes(url.pathname)) return "";
    if (keys.length !== 1 || keys[0] !== "t" || !/^[A-Za-z0-9._~-]+$/.test(url.searchParams.get("t") || "")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function historicalRecord(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const date = safeDate(item.date || item.occurred_at);
  const status = clean(item.status, 40).toLowerCase().replace(/[\s-]+/g, "_");
  if (!date || !["verified", "settled", "completed"].includes(status)) return null;
  return {
    id: `verified-${index + 1}`,
    title: clean(item.title, 100) || "MMD Payment",
    amount_thb: safeMoney(item.amount ?? item.amount_thb),
    currency: "THB",
    created_at: date,
    confirmed_at: date,
    verification_status: "verified",
    official_status: "confirmed",
  };
}

function currentRecord(snapshot, profilePaymentStatus = "") {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (clean(snapshot.bindingStatus, 80) !== "canonical_pending") return null;
  const paymentRef = clean(snapshot.paymentRef, 220);
  const amount = safeMoney(snapshot.amountThb);
  const packageCode = clean(snapshot.packageCode, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  if (!paymentRef || amount === null || !packageCode) return null;

  const latest = clean(profilePaymentStatus, 40).toLowerCase().replace(/[\s-]+/g, "_");
  if (latest === "verified") return null;

  const reviewing = latest === "pending_review";
  const record = {
    id: `current-${paymentRef}`,
    payment_ref: paymentRef,
    purpose: snapshot.paymentStage === "tmib_story" ? "TMIB Story" : "MMD Payment",
    title: packageLabel(packageCode),
    subtitle: "รายการที่ระบบ MMD ออกให้",
    amount_thb: amount,
    currency: "THB",
    created_at: safeDate(snapshot.createdAt),
    official_status: reviewing ? "pending_review" : "awaiting_payment",
    customer_safe_reason: reviewing ? "MMD ได้รับข้อมูลการชำระแล้วและกำลังตรวจสอบ" : null,
  };
  const url = canonicalSignedPaymentUrl(snapshot.customerPaymentUrl);
  if (!reviewing && url) record.customer_payment_url = url;
  return record;
}

function safeMember(profile, fallback = {}) {
  const source = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  const base = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {};
  const displayName = clean(source.display_name || base.display_name, 120);
  const tier = clean(source.tier || base.tier, 80);
  const status = clean(source.membership_status || base.membership_status, 80);
  return {
    ...(displayName ? { display_name: displayName } : {}),
    ...(tier ? { tier_label: tier } : {}),
    ...(status ? { account_status: status } : {}),
  };
}

async function freshProfile(request, env, delegate) {
  const url = new URL(request.url);
  url.pathname = "/member/api/liff/profile";
  url.search = "";
  const response = await delegate.fetch(new Request(url, request), env);
  const payload = await response.clone().json().catch(() => null);
  return { response, payload };
}

export function isMemberPaymentsBffPath(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  return PATHS.has(normalizePath(url.pathname));
}

export async function handleMemberPaymentsBff(request, env = {}, delegate = stableLiffFoundation, readSession = readMemberAppSession) {
  if (!(request instanceof Request) || !isMemberPaymentsBffPath(request.url)) {
    return json({ ok: false, error: { code: "MEMBER_PAYMENTS_ROUTE_NOT_FOUND" } }, 404);
  }
  const method = request.method.toUpperCase();
  const head = method === "HEAD";
  if (!["GET", "HEAD"].includes(method)) {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "GET, HEAD" }, head);
  }
  if (!sameOrigin(request)) return json({ ok: false, error: { code: "SAME_ORIGIN_REQUIRED" } }, 403, null, head);
  if (new URL(request.url).search) {
    return json({ ok: false, error: { code: "BROWSER_PAYMENT_CONTEXT_REJECTED" } }, 400, null, head);
  }

  const session = await readSession(request, env);
  if (!session?.lineUserId) {
    return json({
      ok: false,
      error: { code: "MEMBER_SESSION_REQUIRED" },
      auth_required: true,
    }, 401, null, head);
  }

  let profile = session.memberProfile || {};
  let upstreamHeaders = null;

  if (session.memberExists === true) {
    const fresh = await freshProfile(request, env, delegate);
    upstreamHeaders = fresh.response.headers;
    if (!fresh.response.ok || fresh.payload?.ok !== true || !fresh.payload?.data) {
      const status = fresh.response.status === 401 ? 401 : 503;
      return json({
        ok: false,
        error: { code: status === 401 ? "MEMBER_SESSION_REQUIRED" : "MEMBER_PAYMENT_PROFILE_UNAVAILABLE" },
        auth_required: status === 401,
      }, status, upstreamHeaders, head);
    }
    profile = fresh.payload.data;
  }

  const history = Array.isArray(profile.payment_history)
    ? profile.payment_history.map(historicalRecord).filter(Boolean)
    : [];

  const current = currentRecord(session.paymentSnapshot, profile.payment_status);
  const records = current ? [current, ...history] : history;

  return json({
    ok: true,
    schema: "mmd_member_payments_v1",
    authority: "member-pages-worker",
    money_authority: "payments-worker",
    surface_role: "status_history_navigation",
    member: safeMember(profile, session.memberProfile),
    records,
    official_verification_required: true,
    proof_is_evidence_only: true,
  }, 200, upstreamHeaders, head);
}

export const MEMBER_PAYMENTS_BFF_INTERNALS = Object.freeze({
  historicalRecord,
  currentRecord,
  safeMember,
  packageLabel,
  canonicalSignedPaymentUrl,
});
