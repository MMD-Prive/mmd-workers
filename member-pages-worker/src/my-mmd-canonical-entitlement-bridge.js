import { serializeCustomer360Profile } from "./customer-360-serializer.js";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const SESSION_TTL_SECONDS = 15 * 60;
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const MEMBER_PROFILE_PURPOSE = "liff_member_profile_read";
const MEMBER_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const RESOLVER_SCHEMA = "my_mmd_entitlement_resolver_v1";
const RESOLVER_SOURCE = "my_mmd_entitlement_resolver_v1";

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
  const memberProfile = resolved.memberId ? (projection
    ? overlayProtectedDisplay(serializeCustomer360Profile(resolved.profile), projection, displayName)
    : serializeCustomer360Profile(resolved.profile)) : null;
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

  if (!projection) return { profileRefreshed: true };
  return {
    memberId: resolved.memberId,
    displayName,
    capability: projection.capability,
    label: projection.label,
    lifecycle: projection.lifecycle,
    publicServiceAccess: projection.publicServiceAccess,
    source: RESOLVER_SOURCE,
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
  if (!context.capability) {
    patched = payload;
  } else if (path === "/api/member/dashboard" || path === "/api/member/dashboard/") {
    patched = patchDashboardPayload(payload, context);
  } else if (/^\/api\/member\/app\/profile\/?$/.test(path)) {
    patched = { ...payload, match_state: "matched", membership_tier: context.capability, membership_status: context.lifecycle, actual_access: context.publicServiceAccess ? "granted" : "restricted" };
  } else if (path === "/api/member/app/dashboard" || path === "/api/member/app/dashboard/" || path === "/api/member/app/membership" || path === "/api/member/app/membership/") {
    patched = patchMemberAppPayload(payload, context, /\/membership\/?$/.test(path));
  }
  if (!context.capability) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-member-display-authority", RESOLVER_SOURCE);
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

  return {
    capability,
    label: PROTECTED_LABELS[capability],
    lifecycle: activeCapability ? "active" : "grace",
    publicServiceAccess: access.public_service_access === true,
  };
}

function patchDashboardPayload(payload, context) {
  const data = isPlainObject(payload.data) ? payload.data : null;
  if (!data) return payload;
  const member = isPlainObject(data.member) ? data.member : {};
  const messages = Array.isArray(data.messages)
    ? data.messages.filter((item) => !["member_checking", "member_new"].includes(String(item?.code || "")))
    : [];

  return {
    ...payload,
    ok: true,
    data: {
      ...data,
      dashboard_state: data.dashboard_state === "checking" ? "partial" : data.dashboard_state,
      data_status: data.data_status === "checking" ? "partial" : data.data_status,
      member: {
        ...member,
        display_name: preferResolvedDisplayName(member.display_name, context.displayName),
        tier: verifiedField(context.label),
        membership_status: verifiedField(context.lifecycle),
      },
      messages,
    },
  };
}

function patchMemberAppPayload(payload, context, standalone = false) {
  const membership = standalone ? payload : (isPlainObject(payload.membership) ? payload.membership : {});
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
      ...membership,
      level: context.capability,
      levelVerified: true,
      status: context.lifecycle,
      lifecycle: context.lifecycle,
      access: context.publicServiceAccess ? "granted" : (membership.access || "checking"),
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
  return {
    ...source,
    display_name: displayName || safeDisplayName(source.display_name) || "สมาชิก MMD",
    tier: projection.label,
    membership_status: projection.lifecycle,
    ...(customer360 ? {
      customer_360: {
        ...customer360,
        ...(member ? {
          member: {
            ...member,
            display_name: displayName || safeDisplayName(member.display_name) || "สมาชิก MMD",
            tier: projection.label,
            membership_status: projection.lifecycle,
          },
        } : {}),
      },
    } : {}),
  };
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
