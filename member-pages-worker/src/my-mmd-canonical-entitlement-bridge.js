import { serializeCustomer360Profile } from "./customer-360-serializer.js";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const SESSION_TTL_SECONDS = 15 * 60;
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const MEMBER_PROFILE_PURPOSE = "liff_member_profile_read";
const MEMBER_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const RESOLVER_SCHEMA = "my_mmd_entitlement_resolver_v1";
const RESOLVER_SOURCE = "my_mmd_entitlement_resolver_v1";
const PROFILE_SOURCE = "member_profile_resolver";

const ELIGIBLE_PATHS = new Set([
  "/api/member/app/points", "/api/member/app/points/",
  "/api/member/app/history", "/api/member/app/history/",
  "/api/member/app/profile", "/api/member/app/profile/",
  "/member/api/liff/profile", "/member/api/liff/profile/",
  "/api/member/dashboard",
  "/api/member/dashboard/",
  "/api/member/app/dashboard",
  "/api/member/app/dashboard/",
  "/api/member/app/membership",
  "/api/member/app/membership/",
]);

const PROTECTED_PRIORITY = ["black_card", "svip", "vip"];
const PROTECTED_LABELS = Object.freeze({
  black_card: "Black Card",
  svip: "SVIP",
  vip: "VIP",
});

export function isMyMmdCanonicalEntitlementPath(url) {
  return Boolean(url && ELIGIBLE_PATHS.has(url.pathname));
}

export async function prepareMyMmdCanonicalEntitlementContext(request, env = {}) {
  if (!(request instanceof Request) || request.method !== "GET") return null;
  let url;
  try { url = new URL(request.url); } catch { return null; }
  if (!isMyMmdCanonicalEntitlementPath(url)) return null;

  const sessionRef = await readSessionRef(request, env);
  if (!sessionRef) return null;

  const resolved = await readCanonicalMemberProfile(env, sessionRef.lineUserId);
  if (!resolved) return { unavailable: true };
  if (resolved.entitlementSnapshot?.member_blocked === true && resolved.profile) {
    resolved.profile = { ...resolved.profile, membership_status: "blocked",
      ...(resolved.profile.customer_360 ? { customer_360: { ...resolved.profile.customer_360,
        member: { ...resolved.profile.customer_360.member, membership_status: "blocked" } } } : {}) };
  }
  const denied = ["blocked", "suspended", "revoked", "expired", "pending_review", "under_review"].includes(resolved.profile?.membership_status);
  const projection = denied ? null : projectProtectedEntitlement(resolved.entitlementSnapshot);

  const displayName = safeDisplayName(resolved.profile?.display_name);
  const serializedProfile = resolved.memberId ? serializeCustomer360Profile(resolved.profile) : null;
  const presentation = canonicalPresentationContext(serializedProfile, resolved.profile, projection);
  const memberProfile = resolved.memberId ? (projection
    ? overlayProtectedDisplay(serializedProfile, projection, displayName)
    : serializedProfile) : null;
  const refreshedSession = {
    ...sessionRef.session,
    member_exists: Boolean(resolved.memberId),
    member_id: resolved.memberId,
    member_profile: memberProfile,
  };

  try {
    const ttl = remainingSessionTtl(refreshedSession);
    await env.LIFF_IDENTITY_KV.put(sessionRef.key, JSON.stringify(refreshedSession), { expirationTtl: ttl });
  } catch {
    return { unavailable: true };
  }

  return {
    profileRefreshed: true,
    memberId: resolved.memberId,
    displayName,
    lineConnected: true,
    membershipStart: presentation.membershipStart,
    membershipExpiresAt: presentation.membershipExpiresAt,
    packageLabel: presentation.packageLabel,
    historyRecoveryState: presentation.historyRecoveryState,
    ...(projection ? {
      capability: projection.capability,
      label: projection.label,
      lifecycle: projection.lifecycle,
      publicServiceAccess: projection.publicServiceAccess,
      source: RESOLVER_SOURCE,
    } : {
      capability: null,
      source: PROFILE_SOURCE,
    }),
  };
}

export async function applyMyMmdCanonicalEntitlementResponse(request, response, context) {
  if (!(response instanceof Response) || !context || !response.ok) return response;
  let path = "";
  try { path = new URL(request.url).pathname; } catch { return response; }
  if (!ELIGIBLE_PATHS.has(path)) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response;

  let patched = payload;
  if (path === "/api/member/dashboard" || path === "/api/member/dashboard/") {
    patched = patchDashboardPayload(payload, context);
  } else if (/^\/api\/member\/app\/profile\/?$/.test(path)) {
    patched = patchProfilePayload(payload, context);
  } else if (path === "/api/member/app/dashboard" || path === "/api/member/app/dashboard/" || path === "/api/member/app/membership" || path === "/api/member/app/membership/") {
    patched = patchMemberAppPayload(payload, context, /\/membership\/?$/.test(path));
  }

  if (JSON.stringify(patched) === JSON.stringify(payload)) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-member-display-authority", context.capability ? RESOLVER_SOURCE : PROFILE_SOURCE);
  return new Response(JSON.stringify(patched), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function projectProtectedEntitlement(snapshot = {}) {
  if (!isPlainObject(snapshot)) return null;
  if (snapshot.schema_version !== RESOLVER_SCHEMA) return null;
  if (snapshot.source_status !== "verified" || snapshot.fail_closed !== true || snapshot.member_blocked === true) return null;

  const access = isPlainObject(snapshot.access) ? snapshot.access : {};
  const active = safeTokens(access.protected_capabilities_active);
  const grace = safeTokens(access.protected_capabilities_grace);
  const activeCapability = highestProtected(active);
  const graceCapability = highestProtected(grace);
  const capability = activeCapability || graceCapability;
  if (!capability) return null;

  const lifecycle = activeCapability ? "active" : "grace";
  const entitlement = selectProtectedEntitlement(snapshot.entitlements, capability, lifecycle);
  return {
    capability,
    label: PROTECTED_LABELS[capability],
    lifecycle,
    publicServiceAccess: access.public_service_access === true,
    startAt: safeCalendarDate(entitlement?.start_at),
    expiresAt: safeCalendarDate(entitlement?.expire_at),
    packageLabel: safeProtectedPackageLabel(entitlement?.package_code),
  };
}

function patchProfilePayload(payload, context) {
  const patched = {
    ...payload,
    ...(context.lineConnected === true ? { line_connected: true } : {}),
    ...(context.membershipStart && !safeCalendarDate(payload.member_since) ? { member_since: context.membershipStart } : {}),
    ...(context.membershipExpiresAt && !safeCalendarDate(payload.active_through) ? { active_through: context.membershipExpiresAt } : {}),
    ...(context.packageLabel && !safeDisplayName(payload.package_label) ? { package_label: context.packageLabel } : {}),
    ...(context.historyRecoveryState ? { history_recovery_state: context.historyRecoveryState } : {}),
  };
  if (!context.capability) return patched;
  return {
    ...patched,
    match_state: "matched",
    membership_tier: context.capability,
    membership_status: context.lifecycle,
    actual_access: context.publicServiceAccess ? "granted" : "restricted",
  };
}

function patchDashboardPayload(payload, context) {
  const data = isPlainObject(payload.data) ? payload.data : null;
  if (!data) return payload;
  const member = isPlainObject(data.member) ? data.member : {};
  const messages = Array.isArray(data.messages)
    ? data.messages.filter((item) => !["member_checking", "member_new"].includes(String(item?.code || "")))
    : [];
  const patchedMember = {
    ...member,
    ...(context.membershipStart && !safeCalendarDate(member.membership_start) ? { membership_start: context.membershipStart } : {}),
    ...(context.membershipExpiresAt && !safeCalendarDate(member.membership_expires_at) ? { membership_expires_at: context.membershipExpiresAt } : {}),
  };
  if (context.capability) {
    patchedMember.display_name = preferResolvedDisplayName(member.display_name, context.displayName);
    patchedMember.tier = verifiedField(context.label);
    patchedMember.membership_status = verifiedField(context.lifecycle);
  }

  return {
    ...payload,
    ok: true,
    data: {
      ...data,
      ...(context.capability ? {
        dashboard_state: data.dashboard_state === "checking" ? "partial" : data.dashboard_state,
        data_status: data.data_status === "checking" ? "partial" : data.data_status,
      } : {}),
      member: patchedMember,
      ...(context.capability ? { messages } : {}),
    },
  };
}

function patchMemberAppPayload(payload, context, standalone = false) {
  const membership = standalone ? payload : (isPlainObject(payload.membership) ? payload.membership : {});
  const currentMemberSince = safeCalendarDate(membership.memberSince || membership.member_since);
  const currentExpires = safeCalendarDate(membership.expiresAt || membership.expires_at);
  const currentRenewal = safeCalendarDate(membership.renewalDueAt || membership.renewal_due_at);
  const canonicalMembership = {
    ...membership,
    ...(context.packageLabel && !safeDisplayName(membership.packageLabel || membership.package_label)
      ? { packageLabel: context.packageLabel }
      : {}),
    ...(context.membershipStart && !currentMemberSince ? { memberSince: context.membershipStart } : {}),
    ...(context.membershipExpiresAt && !currentExpires ? { expiresAt: context.membershipExpiresAt } : {}),
    ...(context.membershipExpiresAt && !currentRenewal ? { renewalDueAt: context.membershipExpiresAt } : {}),
    ...(context.historyRecoveryState ? { historyRecoveryState: context.historyRecoveryState } : {}),
  };

  if (!context.capability) {
    if (standalone) return canonicalMembership;
    return {
      ...payload,
      membership: canonicalMembership,
    };
  }

  const existingAction = isPlainObject(payload.nextAction) ? payload.nextAction : null;
  const nextAction = protectedMemberNextAction(existingAction);
  const identity = isPlainObject(payload.identity) ? payload.identity : {};
  const patched = {
    ...payload,
    greetingName: preferResolvedDisplayName(payload.greetingName, context.displayName),
    identity: {
      ...identity,
      displayName: preferResolvedDisplayName(identity.displayName, context.displayName),
    },
    membership: {
      ...canonicalMembership,
      level: context.capability,
      levelVerified: true,
      status: context.lifecycle,
      lifecycle: context.lifecycle,
      access: context.publicServiceAccess ? "granted" : (canonicalMembership.access || "checking"),
      displayOnly: false,
      displaySource: context.source,
      legacyStatus: null,
      nextAction,
    },
    lifecycle: context.lifecycle,
    nextAction,
    legacyDisplay: null,
  };
  return standalone ? { ...patched.membership, lifecycle: patched.lifecycle } : patched;
}

function protectedMemberNextAction(existing) {
  const kind = String(existing?.kind || "").trim();
  if (kind && !["signup", "renew", "checking"].includes(kind)) return existing;
  return { kind: "none", label: null, url: null };
}

function verifiedField(value) {
  return { value, status: "verified", source: RESOLVER_SOURCE };
}

function preferResolvedDisplayName(current, resolved) {
  const currentName = safeDisplayName(current);
  const resolvedName = safeDisplayName(resolved);
  if (!resolvedName) return currentName || "สมาชิก MMD";
  if (!currentName || currentName === "สมาชิก MMD") return resolvedName;
  return currentName;
}

function overlayProtectedDisplay(profile, projection, displayName) {
  const source = isPlainObject(profile) ? profile : {};
  const customer360 = isPlainObject(source.customer_360) ? source.customer_360 : null;
  const member = customer360 && isPlainObject(customer360.member) ? customer360.member : null;
  const membershipStart = safeCalendarDate(source.membership_start) || projection.startAt || null;
  const membershipExpiresAt = safeCalendarDate(source.membership_expires_at) || projection.expiresAt || null;
  return {
    ...source,
    display_name: displayName || safeDisplayName(source.display_name) || "สมาชิก MMD",
    tier: projection.label,
    membership_status: projection.lifecycle,
    ...(membershipStart ? { membership_start: membershipStart } : {}),
    ...(membershipExpiresAt ? { membership_expires_at: membershipExpiresAt } : {}),
    ...(customer360 ? {
      customer_360: {
        ...customer360,
        ...(member ? {
          member: {
            ...member,
            display_name: displayName || safeDisplayName(member.display_name) || "สมาชิก MMD",
            tier: projection.label,
            membership_status: projection.lifecycle,
            ...(membershipStart ? { membership_start: safeCalendarDate(member.membership_start) || membershipStart } : {}),
            ...(membershipExpiresAt ? { membership_expires_at: safeCalendarDate(member.membership_expires_at) || membershipExpiresAt } : {}),
          },
        } : {}),
      },
    } : {}),
  };
}

function canonicalPresentationContext(serializedProfile, rawProfile, projection) {
  const source = isPlainObject(serializedProfile) ? serializedProfile : {};
  const customer360 = isPlainObject(source.customer_360) ? source.customer_360 : {};
  const member = isPlainObject(customer360.member) ? customer360.member : {};
  const packages = isPlainObject(customer360.packages) ? customer360.packages : {};
  const currentPackage = isPlainObject(packages.current_package) ? packages.current_package : {};
  const raw = isPlainObject(rawProfile) ? rawProfile : {};
  const raw360 = isPlainObject(raw.customer_360) ? raw.customer_360 : {};
  const rawMember = isPlainObject(raw360.member) ? raw360.member : {};
  const historyPending = [raw.history_recovery_state, rawMember.history_recovery_state]
    .some((value) => String(value || "").trim().toLowerCase() === "pending");

  return {
    membershipStart:
      safeCalendarDate(source.membership_start)
      || safeCalendarDate(member.membership_start)
      || projection?.startAt
      || null,
    membershipExpiresAt:
      safeCalendarDate(source.membership_expires_at)
      || safeCalendarDate(member.membership_expires_at)
      || projection?.expiresAt
      || null,
    packageLabel:
      safeDisplayName(currentPackage.customer_safe_name)
      || projection?.packageLabel
      || null,
    historyRecoveryState: historyPending ? "recovery_pending" : null,
  };
}

function selectProtectedEntitlement(value, capability, lifecycle) {
  if (!Array.isArray(value)) return null;
  const allowed = lifecycle === "active" ? new Set(["active", "expiring_soon"]) : new Set(["grace"]);
  const candidates = value.filter((item) => {
    if (!isPlainObject(item)) return false;
    return String(item.capability || "").trim().toLowerCase() === capability
      && allowed.has(String(item.lifecycle || "").trim().toLowerCase());
  });
  candidates.sort((a, b) => {
    const aExpire = Date.parse(String(a.expire_at || "")) || 0;
    const bExpire = Date.parse(String(b.expire_at || "")) || 0;
    if (aExpire !== bExpire) return bExpire - aExpire;
    return (Date.parse(String(b.start_at || "")) || 0) - (Date.parse(String(a.start_at || "")) || 0);
  });
  return candidates[0] || null;
}

function safeProtectedPackageLabel(value) {
  const code = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (!code) return null;
  if (code.includes("black_card") || code.includes("blackcard")) return "Black Card Membership";
  if (code.includes("svip")) return "SVIP Membership";
  if (code.includes("vip")) return "VIP Membership";
  return null;
}

function safeCalendarDate(value) {
  const text = String(value || "").trim();
  const direct = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (direct && validCalendarDate(direct[1], direct[2], direct[3])) return text;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function validCalendarDate(yearText, monthText, dayText) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

async function readCanonicalMemberProfile(env, lineUserId) {
  const resolver = env.MEMBER_STATUS_RESOLVER;
  const secret = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  if (!resolver?.fetch || secret.length < 32) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await resolver.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_PROFILE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MEMBER_RESOLVER_SECRET_HEADER]: secret,
      },
      body: JSON.stringify({ line_user_id: lineUserId, purpose: MEMBER_PROFILE_PURPOSE }),
      signal: controller.signal,
    }));
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    const data = isPlainObject(payload?.data) ? payload.data : null;
    if (payload?.ok !== true || typeof data?.member_exists !== "boolean") return null;
    if (!data.member_exists) return { memberId: null, profile: null, entitlementSnapshot: null };
    const memberId = safeIdentifier(data.member_id);
    const profile = isPlainObject(data.profile) ? data.profile : null;
    if (!memberId || !profile) return null;
    const entitlementSnapshot = isPlainObject(data.entitlement_snapshot)
      ? data.entitlement_snapshot
      : (isPlainObject(profile.entitlement_snapshot) ? profile.entitlement_snapshot : null);
    return { memberId, profile, entitlementSnapshot };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readSessionRef(request, env) {
  const store = env.LIFF_IDENTITY_KV;
  const secret = String(env.LIFF_SESSION_SECRET || "");
  const token = cookieValue(request, SESSION_COOKIE);
  if (!store?.get || !store?.put || secret.length < 32 || !token) return null;
  try {
    const hash = await hmacHex(secret, `session:${token}`);
    const key = `liff:session:${hash}`;
    const session = await store.get(key, "json");
    if (!isPlainObject(session) || Number(session.expires_at || 0) <= Date.now()) return null;
    const lineUserId = canonicalLineId(session.line_user_id);
    if (!lineUserId) return null;
    return { key, session, lineUserId };
  } catch {
    return null;
  }
}

function remainingSessionTtl(session = {}) {
  const remaining = Math.ceil((Number(session.expires_at || 0) - Date.now()) / 1000);
  if (!Number.isFinite(remaining) || remaining <= 0) return 1;
  return Math.max(1, Math.min(SESSION_TTL_SECONDS, remaining));
}

function highestProtected(values) {
  const set = new Set(values);
  return PROTECTED_PRIORITY.find((value) => set.has(value)) || null;
}

function safeTokens(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean).slice(0, 20);
}

function canonicalLineId(value) {
  const lineId = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(lineId) ? lineId : "";
}

function safeIdentifier(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{2,159}$/.test(text) ? text : "";
}

function safeDisplayName(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
