import liffFoundation from "./liff-identity-foundation.js";

const API_PREFIX = "/api/member/app/";
const AIRTABLE_API = "https://api.airtable.com/v0";
const LEGACY_STAGING_TABLE = "tbl1u0foFBvgFpT9G";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const MEMBERSHIP_SIGNUP_URL = "/sigil/member/membership?source=line&intent=signup";
const MEMBERSHIP_RENEW_URL = "/sigil/member/membership?source=line&intent=renew";
const CARE_BACK_WISH_URL = "/promotion/6-years-care-back/wish";
const CARE_BACK_CONTINUATION_END_AT = "2026-09-30T16:59:59.999Z";

const ROUTES = new Set([
  `${API_PREFIX}dashboard`,
  `${API_PREFIX}profile`,
  `${API_PREFIX}membership`,
  `${API_PREFIX}points`,
  `${API_PREFIX}coupons`,
  `${API_PREFIX}history`,
  `${API_PREFIX}care`,
]);

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isMemberAppApiPath(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  return ROUTES.has(normalizePath(url.pathname));
}

function methodNotAllowed() {
  return Response.json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET required." } }, {
    status: 405,
    headers: { allow: "GET", "cache-control": "no-store" },
  });
}

function routeNotFound() {
  return Response.json({ ok: false, error: { code: "MEMBER_APP_ROUTE_NOT_FOUND", message: "Unknown member app route." } }, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

function remapRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeLevel(value) {
  const key = asString(value, 64).toLowerCase().replace(/[\s_-]+/g, " ");
  if (["guest", "visitor", "public"].includes(key)) return "guest";
  if (["7 days", "7 day", "7d", "trial", "trial 7d"].includes(key)) return "trial_7d";
  if (["standard", "lite"].includes(key)) return "standard";
  if (key === "premium") return "premium";
  if (key === "vip") return "vip";
  if (["black card", "blackcard"].includes(key)) return "black_card";
  if (key === "svip") return "svip";
  return "unknown";
}

function normalizeStatus(value) {
  const key = asString(value, 64).toLowerCase().replace(/[\s-]+/g, "_");
  if (["active", "grace", "expired", "pending_review", "suspended", "blocked", "revoked"].includes(key)) return key;
  if (key === "pending") return "pending_review";
  return "checking";
}

function normalizeLegacyStatus(value) {
  const key = asString(value, 64).toLowerCase().replace(/[\s-]+/g, "_");
  if (["member", "purchased", "review_required", "none"].includes(key)) return key;
  return "unknown";
}

function responseFrom(upstream, data) {
  const headers = new Headers(upstream.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-member-app-api", "v1");
  return new Response(JSON.stringify(data), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function readUpstream(request, env, delegate, pathname) {
  const upstream = await delegate.fetch(remapRequest(request, pathname), env);
  if (!upstream.ok) return { ok: false, response: upstream };
  const payload = await upstream.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: { code: "MEMBER_APP_UPSTREAM_INVALID", message: "Member data is temporarily unavailable." } }, { status: 502 }),
    };
  }
  return { ok: true, upstream, payload };
}

function cookieValue(request, name) {
  const raw = String(request.headers.get("cookie") || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readMemberAppSession(request, env = {}) {
  const store = env.LIFF_IDENTITY_KV;
  const secret = String(env.LIFF_SESSION_SECRET || "");
  const token = cookieValue(request, SESSION_COOKIE);
  if (!store?.get || secret.length < 32 || !token) return null;
  try {
    const hash = await hmacHex(secret, `session:${token}`);
    const session = await store.get(`liff:session:${hash}`, "json");
    if (!session || Number(session.expires_at || 0) <= Date.now()) return null;
    const lineUserId = asString(session.line_user_id, 160);
    if (!/^U[a-f0-9]{32}$/i.test(lineUserId)) return null;
    return {
      lineUserId,
      memberExists: session.member_exists === true,
      memberId: asString(session.member_id, 160) || null,
      memberProfile: asObject(session.member_profile),
    };
  } catch {
    return null;
  }
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

async function readLegacyDisplay(env = {}, lineUserId = "") {
  const apiKey = String(env.AIRTABLE_API_KEY || "").trim();
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  const table = String(env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || LEGACY_STAGING_TABLE).trim();
  if (!apiKey || !baseId || !table || !/^U[a-f0-9]{32}$/i.test(lineUserId)) return null;

  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", `{line_user_id}=${formulaString(lineUserId)}`);
  url.searchParams.set("maxRecords", "2");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !Array.isArray(payload.records) || payload.records.length !== 1) return null;
    const fields = asObject(payload.records[0]?.fields);
    const level = normalizeLevel(fields.parsed_client_level || fields.parsed_membership_tier);
    const membershipStatus = normalizeLegacyStatus(fields.parsed_membership_status);
    const parseConfidence = asNumber(fields.parse_confidence);
    if (level === "unknown" && membershipStatus === "unknown") return null;
    return {
      level,
      membershipStatus,
      parseConfidence,
      source: "line_ofc_legacy_display_only",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function identityFromProfile(profile) {
  const emailMasked = asString(profile.email_masked || profile.emailMasked, 254) || null;
  const phoneMasked = asString(profile.phone_masked || profile.phoneMasked, 64) || null;
  return {
    displayName: asString(profile.display_name || profile.displayName, 120) || null,
    lineDisplayName: asString(profile.line_display_name || profile.lineDisplayName, 120) || null,
    lineAccountSummary: asString(profile.line_account_summary || profile.lineAccountSummary, 160) || null,
    emailMasked,
    emailVerified: profile.email_verified === true || profile.emailVerified === true,
    emailSafeToDisplay: Boolean(emailMasked) && (profile.email_safe_to_display === true || profile.emailSafeToDisplay === true),
    phoneMasked,
    phoneVerified: profile.phone_verified === true || profile.phoneVerified === true,
    phoneSafeToDisplay: Boolean(phoneMasked) && (profile.phone_safe_to_display === true || profile.phoneSafeToDisplay === true),
    memberSince: asString(profile.member_since || profile.memberSince, 40) || null,
    primaryChannel: "line",
    avatarUrl: null,
    memberRef: asString(profile.member_ref || profile.memberRef, 80) || null,
  };
}

function identityFromDashboard(data) {
  const member = asObject(data.member);
  return {
    displayName: asString(member.display_name || member.displayName, 120) || null,
    lineDisplayName: null,
    lineAccountSummary: null,
    emailMasked: null,
    emailVerified: false,
    emailSafeToDisplay: false,
    phoneMasked: null,
    phoneVerified: false,
    phoneSafeToDisplay: false,
    memberSince: null,
    primaryChannel: "line",
    avatarUrl: null,
    memberRef: null,
  };
}

function membershipFromDashboard(data) {
  const member = asObject(data.member);
  const tier = asObject(member.tier);
  const status = asObject(member.membership_status);
  const level = tier.status === "verified" ? normalizeLevel(tier.value) : "unknown";
  return {
    level,
    levelVerified: tier.status === "verified" && level !== "unknown",
    status: status.status === "verified" ? normalizeStatus(status.value) : "checking",
    packageLabel: null,
    renewalDueAt: null,
    renewalState: "unknown",
    access: "checking",
  };
}

function careBackOpen(now = new Date()) {
  return now.getTime() <= Date.parse(CARE_BACK_CONTINUATION_END_AT);
}

function legacyIndicatesPriorMembership(legacy) {
  if (!legacy) return false;
  if (["member", "review_required"].includes(legacy.membershipStatus)) return true;
  return !["unknown", "guest"].includes(legacy.level);
}

function nextActionFor(lifecycle) {
  if (lifecycle === "new") {
    return { kind: "signup", label: "สมัครสมาชิก", url: MEMBERSHIP_SIGNUP_URL };
  }
  if (lifecycle === "expired") {
    return { kind: "renew", label: "ต่ออายุสมาชิก", url: MEMBERSHIP_RENEW_URL };
  }
  if (lifecycle === "active" && careBackOpen()) {
    return { kind: "care_back_wish", label: "อวยพร MMD · รับ CARE BACK", url: CARE_BACK_WISH_URL };
  }
  if (lifecycle === "checking") {
    return { kind: "checking", label: null, url: null };
  }
  return { kind: "none", label: null, url: null };
}

function enrichMembership(baseMembership, session, legacy) {
  const membership = { ...baseMembership };
  const canonicalLevel = membership.levelVerified === true && membership.level !== "unknown";
  const expiry = asString(session?.memberProfile?.membership_expires_at, 40) || null;
  let displayOnly = false;

  if (!canonicalLevel && legacy && legacy.level !== "unknown") {
    membership.level = legacy.level;
    membership.levelVerified = false;
    displayOnly = true;
  }

  let lifecycle = "checking";
  if (session?.memberExists === false) {
    lifecycle = legacyIndicatesPriorMembership(legacy) ? "checking" : "new";
  } else if (["active", "grace"].includes(membership.status)) {
    lifecycle = "active";
  } else if (membership.status === "expired") {
    lifecycle = "expired";
  }

  membership.lifecycle = lifecycle;
  membership.expiresAt = expiry;
  membership.renewalDueAt = expiry;
  membership.displayOnly = displayOnly;
  membership.displaySource = displayOnly ? legacy.source : null;
  membership.legacyStatus = legacy?.membershipStatus && legacy.membershipStatus !== "unknown"
    ? legacy.membershipStatus
    : null;
  membership.nextAction = nextActionFor(lifecycle);
  return membership;
}

function legacyDisplayPayload(legacy) {
  if (!legacy) return null;
  return {
    source: legacy.source,
    level: legacy.level,
    membershipStatus: legacy.membershipStatus,
    parseConfidence: legacy.parseConfidence,
    displayOnly: true,
    grantsEntitlement: false,
    grantsPoints: false,
  };
}

function pointsSummaryFromDashboard(data) {
  const points = asObject(data.points);
  return {
    confirmedBalance: points.status === "verified" ? asNumber(points.value) : null,
    earnedTotal: null,
    redeemedTotal: null,
    currencyLabel: points.status === "verified" ? "MMD Points" : null,
  };
}

function pointsLedgerFromDashboard(data) {
  const history = asObject(data.history);
  if (!Array.isArray(history.events)) return [];
  return history.events.flatMap((event, index) => {
    const item = asObject(event);
    if (asString(item.type, 40).toLowerCase() !== "points") return [];
    const delta = asNumber(item.points_delta);
    if (delta === null) return [];
    return [{
      id: `points-${index + 1}`,
      occurredAt: asString(item.date || item.occurred_at, 40),
      label: asString(item.title, 160) || "MMD Points",
      delta,
      balanceAfter: null,
      state: "confirmed",
    }];
  });
}

function historyFromDashboard(data) {
  const history = asObject(data.history);
  const paymentHistory = asObject(data.payment_history);
  const events = Array.isArray(history.events) ? history.events : [];
  const records = Array.isArray(paymentHistory.records) ? paymentHistory.records : [];
  const mapped = events.flatMap((event, index) => {
    const item = asObject(event);
    const type = asString(item.type, 40).toLowerCase();
    if (type === "points") return [];
    const kind = type === "service" || type === "booking" ? "booking"
      : type === "payment" ? "payment"
        : type === "care" ? "care"
          : type === "membership" || type === "package" ? "membership"
            : null;
    if (!kind) return [];
    return [{
      id: `history-${index + 1}`,
      kind,
      occurredAt: asString(item.date || item.occurred_at, 40),
      title: asString(item.title, 160) || "MMD activity",
      detail: asString(item.detail || item.description, 240) || null,
      statusLabel: asString(item.status, 80) || null,
    }];
  });
  const paymentMapped = records.map((record, index) => {
    const item = asObject(record);
    return {
      id: `payment-${index + 1}`,
      kind: "payment",
      occurredAt: asString(item.date || item.occurred_at, 40),
      title: asString(item.title, 160) || "Payment history",
      detail: null,
      statusLabel: asString(item.status, 80) || null,
    };
  });
  return [...mapped, ...paymentMapped];
}

function couponState(value) {
  const key = asString(value, 48).toLowerCase().replace(/[\s-]+/g, "_");
  if (["ready", "active", "coupon_ready", "issued"].includes(key)) return "issued";
  if (["eligible", "wish_available"].includes(key)) return "eligible";
  if (key === "used") return "used";
  if (key === "expired") return "expired";
  if (["unavailable", "revoked", "invalid"].includes(key)) return "unavailable";
  return "checking";
}

function couponsFromWallet(payload) {
  const wallet = asObject(payload.data || payload.wallet || payload);
  const state = couponState(wallet.status || wallet.state || wallet.code_status);
  const code = asString(wallet.code || wallet.personal_code, 64);
  const approved = asNumber(wallet.approved_discount_percent);
  const hasSignal = Boolean(code || wallet.status || wallet.state || wallet.code_status || approved !== null);
  if (!hasSignal) return [];
  return [{
    id: `care-back-${state}`,
    title: "CARE BACK",
    description: state === "issued" ? "ระบบจะตรวจสอบคูปองอีกครั้งเมื่อจอง" : null,
    state,
    approvedDiscountPercent: approved,
    issuedAt: asString(wallet.activated_at || wallet.issued_at, 40) || null,
    expiresAt: asString(wallet.expires_at, 40) || null,
    reference: code || null,
  }];
}

function careFromState(payload) {
  const data = asObject(payload.data || payload);
  const state = asString(data.state || payload.state, 64).toLowerCase().replace(/[\s-]+/g, "_");
  const approved = asNumber(data.approved_discount_percent ?? payload.approved_discount_percent);
  let stage = "not_started";
  if (["verification_required", "identity_pending"].includes(state)) stage = "identity_pending";
  else if (["eligibility_pending", "review_required", "claim_required", "wish_available"].includes(state)) stage = "eligibility_pending";
  else if (["wish_saved", "completed"].includes(state)) stage = approved === null ? "wish_saved" : "approved";
  else if (["approved", "coupon_active", "coupon_ready"].includes(state)) stage = approved === null ? "wish_saved" : "approved";
  else if (["unavailable", "blocked", "expired", "rejected", "revoked", "invalid", "error"].includes(state)) stage = "unavailable";
  const finalDisplay = asObject(data.final_display || payload.final_display);
  return {
    stage,
    approvedDiscountPercent: approved,
    note: asString(finalDisplay.message || data.message || payload.message, 240) || null,
  };
}

async function sessionAndLegacy(request, env, baseMembership) {
  const session = await readMemberAppSession(request, env);
  const needsLegacy = Boolean(session?.lineUserId)
    && (session.memberExists === false || baseMembership.levelVerified !== true || baseMembership.status === "checking");
  const legacy = needsLegacy ? await readLegacyDisplay(env, session.lineUserId) : null;
  return { session, legacy };
}

async function adaptDashboard(request, env, delegate) {
  const sessionSnapshot = await readMemberAppSession(request, env);
  const result = await readUpstream(request, env, delegate, "/api/member/dashboard");
  if (!result.ok) return result.response;
  const data = asObject(result.payload.data);
  const baseMembership = membershipFromDashboard(data);
  const needsLegacy = Boolean(sessionSnapshot?.lineUserId)
    && (sessionSnapshot.memberExists === false || baseMembership.levelVerified !== true || baseMembership.status === "checking");
  const legacy = needsLegacy ? await readLegacyDisplay(env, sessionSnapshot.lineUserId) : null;
  const membership = enrichMembership(baseMembership, sessionSnapshot, legacy);
  return responseFrom(result.upstream, {
    greetingName: asString(asObject(data.member).display_name, 120) || null,
    identity: identityFromDashboard(data),
    membership,
    lifecycle: membership.lifecycle,
    nextAction: membership.nextAction,
    legacyDisplay: legacyDisplayPayload(legacy),
    points: pointsSummaryFromDashboard(data),
    couponHighlight: null,
  });
}

async function adaptProfile(request, env, delegate) {
  const result = await readUpstream(request, env, delegate, "/member/api/liff/profile");
  if (!result.ok) return result.response;
  return responseFrom(result.upstream, identityFromProfile(asObject(result.payload.data)));
}

async function adaptMembership(request, env, delegate) {
  const sessionSnapshot = await readMemberAppSession(request, env);
  const result = await readUpstream(request, env, delegate, "/api/member/dashboard");
  if (!result.ok) return result.response;
  const baseMembership = membershipFromDashboard(asObject(result.payload.data));
  const needsLegacy = Boolean(sessionSnapshot?.lineUserId)
    && (sessionSnapshot.memberExists === false || baseMembership.levelVerified !== true || baseMembership.status === "checking");
  const legacy = needsLegacy ? await readLegacyDisplay(env, sessionSnapshot.lineUserId) : null;
  return responseFrom(result.upstream, enrichMembership(baseMembership, sessionSnapshot, legacy));
}

async function adaptPoints(request, env, delegate) {
  const result = await readUpstream(request, env, delegate, "/api/member/dashboard");
  if (!result.ok) return result.response;
  const data = asObject(result.payload.data);
  return responseFrom(result.upstream, {
    summary: pointsSummaryFromDashboard(data),
    ledger: pointsLedgerFromDashboard(data),
  });
}

async function adaptHistory(request, env, delegate) {
  const result = await readUpstream(request, env, delegate, "/api/member/dashboard");
  if (!result.ok) return result.response;
  return responseFrom(result.upstream, historyFromDashboard(asObject(result.payload.data)));
}

async function adaptCoupons(request, env, delegate) {
  const result = await readUpstream(request, env, delegate, "/member/api/liff/care-back/wallet");
  if (!result.ok) return result.response;
  return responseFrom(result.upstream, couponsFromWallet(result.payload));
}

async function adaptCare(request, env, delegate) {
  const result = await readUpstream(request, env, delegate, "/member/api/liff/care-back/state");
  if (!result.ok) return result.response;
  return responseFrom(result.upstream, careFromState(result.payload));
}

export async function handleMemberAppApi(request, env = {}, delegate = liffFoundation) {
  if (request.method !== "GET") return methodNotAllowed();
  const path = normalizePath(new URL(request.url).pathname);
  if (!ROUTES.has(path)) return routeNotFound();
  if (path === `${API_PREFIX}dashboard`) return adaptDashboard(request, env, delegate);
  if (path === `${API_PREFIX}profile`) return adaptProfile(request, env, delegate);
  if (path === `${API_PREFIX}membership`) return adaptMembership(request, env, delegate);
  if (path === `${API_PREFIX}points`) return adaptPoints(request, env, delegate);
  if (path === `${API_PREFIX}coupons`) return adaptCoupons(request, env, delegate);
  if (path === `${API_PREFIX}history`) return adaptHistory(request, env, delegate);
  if (path === `${API_PREFIX}care`) return adaptCare(request, env, delegate);
  return routeNotFound();
}
