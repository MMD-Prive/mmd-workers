const AIRTABLE_API = "https://api.airtable.com/v0";
const STAGING_TABLE = "LINE OFC Client Import Staging";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const FAST_TRUST_SOURCE = "line_oa_renamed_name_fast_trust";
const FAST_TRUST_RANK = { vip: 1, svip: 2, black_card: 3 };
const FAST_TRUST_LABEL = { vip: "VIP", svip: "SVIP", black_card: "Black Card" };
const FAST_TRUST_DURATION_YEARS = 2;
const APP_PREFIX = "/api/member/app/";
const DASHBOARD_PATHS = new Set(["/api/member/dashboard", "/api/member/dashboard/"]);
const LIFF_PROFILE_PATHS = new Set(["/member/api/liff/profile", "/member/api/liff/profile/"]);

export function trustedTierFromRenamedName(value) {
  const text = normalizeRenamedName(value);
  if (!text) return null;
  if (/(?:^|[^A-Za-z0-9])black\s*card$/i.test(text)) return "black_card";
  if (/(?:^|[^A-Za-z0-9])svip$/i.test(text)) return "svip";
  if (/(?:^|[^A-Za-z0-9])vip$/i.test(text)) return "vip";
  return null;
}

export function displayNameFromRenamedName(value) {
  const text = normalizeRenamedName(value);
  return text
    .replace(/(?:\s|[-–—|/])*(?:black\s*card|svip|vip)\s*$/i, "")
    .trim()
    .slice(0, 120);
}

function normalizeRenamedName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:\s*[-–—|/]\s*)+$/, "")
    .trim();
}

export async function resolveFastTrustForLine(env = {}, lineUserId = "") {
  const lineId = canonicalLineId(lineUserId);
  if (!lineId) return null;
  const apiKey = String(env.AIRTABLE_API_KEY || "").trim();
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  const table = String(
    env.AIRTABLE_TABLE_LINE_OFC_STAGING
      || env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID
      || STAGING_TABLE,
  ).trim();
  if (!apiKey || !baseId || !table) return null;

  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", `{line_user_id}=${formulaString(lineId)}`);
  url.searchParams.set("maxRecords", "20");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const init = {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: controller.signal,
    };
    const response = env.AIRTABLE_HTTP?.fetch
      ? await env.AIRTABLE_HTTP.fetch(new Request(url.toString(), init))
      : await fetch(url.toString(), init);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !Array.isArray(payload.records)) return null;

    const candidates = payload.records.flatMap((record) => {
      const renamedName = String(record?.fields?.line_renamed_name || "").trim();
      const tier = trustedTierFromRenamedName(renamedName);
      return tier ? [{ tier, renamedName }] : [];
    });
    if (!candidates.length) return null;

    candidates.sort((a, b) => FAST_TRUST_RANK[b.tier] - FAST_TRUST_RANK[a.tier]);
    const winner = candidates[0];
    return {
      tier: winner.tier,
      label: FAST_TRUST_LABEL[winner.tier],
      displayName: displayNameFromRenamedName(winner.renamedName) || null,
      source: FAST_TRUST_SOURCE,
      membershipStart: todayDate(),
      membershipExpiresAt: addYearsDate(todayDate(), FAST_TRUST_DURATION_YEARS),
      historyState: "recovery_pending",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function applyMyMmdFastTrustResponse(request, response, env = {}) {
  if (!(request instanceof Request) || !(response instanceof Response) || request.method !== "GET" || !response.ok) return response;
  let path = "";
  try { path = new URL(request.url).pathname; } catch { return response; }
  const isDashboard = DASHBOARD_PATHS.has(path);
  const isMemberApp = path.startsWith(APP_PREFIX);
  const isLiffProfile = LIFF_PROFILE_PATHS.has(path);
  if (!isDashboard && !isMemberApp && !isLiffProfile) return response;

  // Fresh resolver decisions and explicit restrictions outrank recovery markers.
  if (response.headers.get("x-mmd-member-display-authority") === "my_mmd_entitlement_resolver_v1") return response;

  // Dashboard reads rotate the LIFF cookie. Try the request token first, then
  // the replacement token emitted by the response so Fast Trust survives the
  // normal secure session-rotation boundary.
  const session = await readSessionFromRequestOrResponse(request, response, env);
  if (!session?.lineUserId) return response;
  const fastTrust = await resolveFastTrustForLine(env, session.lineUserId);
  if (!fastTrust?.tier) return response;

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response;

  const currentStatus = isDashboard ? payload.data?.member?.membership_status?.value : (payload.membership?.status || payload.membership_status || payload.status);
  if (["blocked", "suspended", "revoked", "expired", "pending_review", "under_review"].includes(currentStatus)) return response;

  const patched = isDashboard
    ? patchDashboardPayload(payload, fastTrust)
    : isLiffProfile
      ? patchLiffProfilePayload(payload, fastTrust)
    : patchMemberAppPayload(path, payload, fastTrust);
  if (!patched) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-fast-trust", "true");
  headers.set("x-mmd-tier-source", FAST_TRUST_SOURCE);
  headers.set("x-mmd-fast-trust-tier", fastTrust.tier);
  return new Response(JSON.stringify(patched), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function patchLiffProfilePayload(payload, fastTrust) {
  const data = asObject(payload.data);
  if (!Object.keys(data).length) return payload;
  const customer360 = asObject(data.customer_360);
  const member = asObject(customer360.member);
  const membershipStart = data.membership_start || fastTrust.membershipStart;
  const membershipExpiresAt = data.membership_expires_at || fastTrust.membershipExpiresAt;
  return {
    ...payload,
    data: {
      ...data,
      display_name: asString(data.display_name, 120) || fastTrust.displayName || "สมาชิก MMD",
      tier: fastTrust.label,
      membership_status: "active",
      membership_start: membershipStart,
      membership_expires_at: membershipExpiresAt,
      active_through: data.active_through || membershipExpiresAt,
      tier_source: FAST_TRUST_SOURCE,
      history_recovery_state: fastTrust.historyState,
      customer_360: {
        ...customer360,
        member: {
          ...member,
          display_name: asString(member.display_name, 120) || fastTrust.displayName || "สมาชิก MMD",
          tier: fastTrust.label,
          membership_status: "active",
          membership_start: member.membership_start || membershipStart,
          membership_expires_at: member.membership_expires_at || membershipExpiresAt,
        },
      },
      fastTrust: fastTrustMeta(fastTrust),
    },
  };
}

function patchDashboardPayload(payload, fastTrust) {
  const data = asObject(payload.data);
  if (!Object.keys(data).length) return null;
  const member = asObject(data.member);
  const nextMessages = Array.isArray(data.messages)
    ? data.messages.filter((item) => asObject(item).code !== "member_checking")
    : [];
  if (!nextMessages.some((item) => asObject(item).code === "history_recovery_pending")) {
    nextMessages.push({ code: "history_recovery_pending", text: "กำลังดึงประวัติเดิม" });
  }
  return {
    ...payload,
    state: payload.state === "checking" ? "resolved" : payload.state,
    data: {
      ...data,
      dashboard_state: data.dashboard_state === "checking" ? "partial" : data.dashboard_state,
      data_status: data.data_status === "checking" ? "partial" : data.data_status,
      member: {
        ...member,
        display_name: asString(member.display_name, 120) || fastTrust.displayName || "สมาชิก MMD",
        tier: { value: fastTrust.label, status: "verified", source: FAST_TRUST_SOURCE },
        membership_status: { value: "active", status: "verified", source: FAST_TRUST_SOURCE },
      },
      fast_trust: {
        tier: fastTrust.tier,
        tier_verified: true,
        tier_source: FAST_TRUST_SOURCE,
        history_state: fastTrust.historyState,
        membership_start: fastTrust.membershipStart,
        membership_expires_at: fastTrust.membershipExpiresAt,
      },
      messages: nextMessages,
    },
  };
}

function patchMemberAppPayload(path, payload, fastTrust) {
  if (path === `${APP_PREFIX}profile`) {
    return { ...payload, match_state: "matched", membership_tier: fastTrust.tier, membership_status: "active", active_through: payload.active_through || fastTrust.membershipExpiresAt, member_since: payload.member_since || fastTrust.membershipStart, actual_access: "granted", fastTrust: fastTrustMeta(fastTrust) };
  }
  if (path === `${APP_PREFIX}dashboard`) {
    const membership = patchMembership(asObject(payload.membership), fastTrust);
    return {
      ...payload,
      state: payload.state === "checking" ? "resolved" : payload.state,
      greetingName: asString(payload.greetingName, 120) || fastTrust.displayName || null,
      membership,
      active_through: payload.active_through || fastTrust.membershipExpiresAt,
      member_since: payload.member_since || fastTrust.membershipStart,
      lifecycle: "active",
      nextAction: membership.nextAction,
      legacyDisplay: null,
      fastTrust: fastTrustMeta(fastTrust),
    };
  }
  if (path === `${APP_PREFIX}membership`) {
    return {
      ...patchMembership(asObject(payload), fastTrust),
      fastTrust: fastTrustMeta(fastTrust),
    };
  }
  return payload;
}

function patchMembership(membership, fastTrust) {
  const nextAction = {
    kind: "care_back_wish",
    label: "อวยพร MMD · รับ CARE BACK",
    url: "/promotion/6-years-care-back/wish",
  };
  return {
    ...membership,
    level: fastTrust.tier,
    levelVerified: true,
    status: "active",
    access: "granted",
    lifecycle: "active",
    displayOnly: false,
    displaySource: FAST_TRUST_SOURCE,
    resolution: "resolved",
    memberSince: membership.memberSince || fastTrust.membershipStart,
    expiresAt: membership.expiresAt || fastTrust.membershipExpiresAt,
    activeThrough: membership.activeThrough || membership.active_through || fastTrust.membershipExpiresAt,
    nextAction,
    fastTrust: fastTrustMeta(fastTrust),
  };
}

function fastTrustMeta(fastTrust) {
  return {
    tier: fastTrust.tier,
    tierVerified: true,
    tierSource: FAST_TRUST_SOURCE,
    historyState: fastTrust.historyState,
    membershipStart: fastTrust.membershipStart,
    membershipExpiresAt: fastTrust.membershipExpiresAt,
  };
}

async function readSessionFromRequestOrResponse(request, response, env) {
  const requestToken = cookieValue(request, SESSION_COOKIE);
  const requestSession = await readSessionToken(requestToken, env);
  if (requestSession) return requestSession;
  const responseToken = setCookieValue(response, SESSION_COOKIE);
  return readSessionToken(responseToken, env);
}

async function readSessionToken(token, env) {
  const store = env.LIFF_IDENTITY_KV;
  const secret = String(env.LIFF_SESSION_SECRET || "");
  if (!store?.get || secret.length < 32 || !token) return null;
  try {
    const hash = await hmacHex(secret, `session:${token}`);
    const session = await store.get(`liff:session:${hash}`, "json");
    if (!session || Number(session.expires_at || 0) <= Date.now()) return null;
    const lineUserId = canonicalLineId(session.line_user_id);
    return lineUserId ? { lineUserId } : null;
  } catch {
    return null;
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asString(value, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function canonicalLineId(value) {
  const id = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}
function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function todayDate() { return new Date().toISOString().slice(0, 10); }
function addYearsDate(value, years) { const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00.000Z`); if (!Number.isFinite(date.getTime())) return null; date.setUTCFullYear(date.getUTCFullYear() + Number(years || 0)); return date.toISOString().slice(0, 10); }
function cookieValue(request, name) {
  const raw = String(request.headers.get("cookie") || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}
function setCookieValue(response, name) {
  const raw = String(response.headers.get("set-cookie") || "");
  const match = raw.match(new RegExp(`(?:^|,\\s*|;\\s*)${name}=([^;,\\s]+)`));
  return match ? match[1] : "";
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
