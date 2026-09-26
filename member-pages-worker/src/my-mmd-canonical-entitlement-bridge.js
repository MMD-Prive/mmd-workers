import { serializeCustomer360Profile } from "./customer-360-serializer.js";
import { readClientBackedHistoryResult, resolveCanonicalClientForLine } from "./member-app-client-history.js";
import { readMemberHistoryRecoveryStatus } from "./member-history-recovery.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const SESSION_TTL_SECONDS = 15 * 60;
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const MEMBER_PROFILE_PURPOSE = "liff_member_profile_read";
const MEMBER_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const RESOLVER_SCHEMA = "my_mmd_entitlement_resolver_v1";
const RESOLVER_SOURCE = "my_mmd_entitlement_resolver_v1";
const PROFILE_SOURCE = "member_profile_resolver";
const AIRTABLE_API = "https://api.airtable.com/v0";
const CONTACT_PROFILE_SOURCE = "canonical_client";
const LINE_OFC_NOTE_SOURCE = "line_ofc_notes";
const CONSOLE_INBOX_TABLE = "MMD — Console Inbox";
const WELCOME_CONTEXT_PATH = "/member/api/liff/welcome-context";

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
const PROTECTED_LABELS = Object.freeze({ black_card: "Black Card", svip: "SVIP", vip: "VIP" });

export function isMyMmdCanonicalEntitlementPath(url) {
  return Boolean(url && ELIGIBLE_PATHS.has(url.pathname));
}

export function isMyMmdWelcomeContextPath(url) {
  return Boolean(url && (url.pathname === WELCOME_CONTEXT_PATH || url.pathname === `${WELCOME_CONTEXT_PATH}/`));
}

export async function handleMyMmdWelcomeContext(request, env = {}) {
  const headers = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };
  if (!(request instanceof Request) || request.method !== "GET") {
    return Response.json({ ok: false, state: "public" }, { status: 405, headers: { ...headers, allow: "GET" } });
  }
  const url = new URL(request.url);
  if (!isMyMmdWelcomeContextPath(url) || url.search) return Response.json({ ok: false, state: "public" }, { status: 400, headers });
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return Response.json({ ok: false, state: "public" }, { status: 403, headers });
  const sessionRef = await readSessionRef(request, env);
  if (!sessionRef) return Response.json({ ok: true, data: { tier: "", membership_status: "" } }, { status: 200, headers });
  const resolved = await readCanonicalMemberProfile(env, sessionRef.lineUserId);
  if (!resolved) return Response.json({ ok: false, state: "public" }, { status: 503, headers });
  const denied = ["blocked", "suspended", "revoked", "expired", "pending_review", "under_review"].includes(String(resolved.profile?.membership_status || "").toLowerCase());
  const projection = denied ? null : projectProtectedEntitlement(resolved.entitlementSnapshot);
  const safeData = projection
    ? { tier: projection.label, membership_status: projection.lifecycle }
    : { tier: "", membership_status: "" };
  if (projection) headers["x-mmd-member-display-authority"] = RESOLVER_SOURCE;
  return Response.json({ ok: true, data: safeData }, { status: 200, headers });
}

export async function prepareMyMmdCanonicalEntitlementContext(request, env = {}) {
  if (!(request instanceof Request) || request.method !== "GET") return null;
  let url;
  try { url = new URL(request.url); } catch { return null; }
  if (!isMyMmdCanonicalEntitlementPath(url)) return null;
  const sessionRef = await readSessionRef(request, env);
  if (!sessionRef) return null;
  const [resolved, recoveryStatus] = await Promise.all([
    readCanonicalMemberProfile(env, sessionRef.lineUserId),
    readMemberHistoryRecoveryStatus(env, sessionRef.lineUserId),
  ]);
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
  const protectedActiveThrough = projection?.lifecycle === "active" && !projection.expiresAt
    ? await readOrCreateProtectedActiveThroughAnchor(env, sessionRef.lineUserId, projection)
    : null;
  const presentation = canonicalPresentationContext(
    serializedProfile,
    resolved.profile,
    projection,
    protectedActiveThrough,
    recoveryStatus,
  );
  const needsClientHistory = /^\/api\/member\/app\/(?:history|profile|dashboard)\/?$/.test(url.pathname)
    || /^\/member\/api\/liff\/profile\/?$/.test(url.pathname);
  const needsContactProfile = /^\/api\/member\/app\/profile\/?$/.test(url.pathname)
    || /^\/member\/api\/liff\/profile\/?$/.test(url.pathname);
  let [clientHistory, contactProfile, lineOfcNoteScan] = await Promise.all([
    needsClientHistory ? readClientBackedHistoryResult(env, sessionRef.lineUserId) : null,
    needsContactProfile ? readCanonicalContactProfile(env, sessionRef.lineUserId) : null,
    (needsClientHistory || needsContactProfile) ? readLineOfcNoteScan(env, sessionRef.lineUserId) : null,
  ]);
  if (!contactProfile && lineOfcNoteScan?.contact) {
    contactProfile = {
      ...lineOfcNoteScan.contact,
      source: LINE_OFC_NOTE_SOURCE,
      reviewState: "candidate",
    };
  }
  const memberProfile = resolved.memberId ? (projection ? overlayProtectedDisplay(serializedProfile, projection, displayName) : serializedProfile) : null;
  const refreshedSession = { ...sessionRef.session, member_exists: Boolean(resolved.memberId), member_id: resolved.memberId, member_profile: memberProfile };
  try {
    const ttl = remainingSessionTtl(refreshedSession);
    await env.LIFF_IDENTITY_KV.put(sessionRef.key, JSON.stringify(refreshedSession), { expirationTtl: ttl });
  } catch { return { unavailable: true }; }
  return {
    profileRefreshed: true, memberId: resolved.memberId, displayName, lineConnected: true,
    membershipStart: presentation.membershipStart, membershipExpiresAt: presentation.membershipExpiresAt,
    packageLabel: presentation.packageLabel,
    historyRecoveryState: presentation.historyRecoveryState,
    historyRecoveryStatus: presentation.historyRecoveryStatus,
    historyReviewRequired: presentation.historyReviewRequired,
    clientHistory, contactProfile, lineOfcNoteScan,
    ...(projection ? { capability: projection.capability, label: projection.label, lifecycle: projection.lifecycle,
      publicServiceAccess: projection.publicServiceAccess, source: RESOLVER_SOURCE } : { capability: null, source: PROFILE_SOURCE }),
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
  const historyPath = /^\/api\/member\/app\/history\/?$/.test(path);
  if (!payload || typeof payload !== "object" || (Array.isArray(payload) && !historyPath)) return response;
  let patched = payload;
  if (path === "/api/member/dashboard" || path === "/api/member/dashboard/") patched = patchDashboardPayload(payload, context);
  else if (/^\/api\/member\/app\/profile\/?$/.test(path)) patched = patchProfilePayload(payload, context);
  else if (/^\/member\/api\/liff\/profile\/?$/.test(path)) patched = patchLiffProfilePayload(payload, context);
  else if (historyPath) patched = patchHistoryPayload(payload, context);
  else if (path === "/api/member/app/dashboard" || path === "/api/member/app/dashboard/" || path === "/api/member/app/membership" || path === "/api/member/app/membership/") patched = patchMemberAppPayload(payload, context, /\/membership\/?$/.test(path));
  if (JSON.stringify(patched) === JSON.stringify(payload)) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-member-display-authority", context.capability ? RESOLVER_SOURCE : PROFILE_SOURCE);
  return new Response(JSON.stringify(patched), { status: response.status, statusText: response.statusText, headers });
}

function patchLiffProfilePayload(payload, context) {
  const data = isPlainObject(payload.data) ? payload.data : {};
  if (!Object.keys(data).length) return payload;
  const history = resolvedClientHistory(context);
  const patched = {
    ...data,
    ...(context.lineConnected === true ? { line_connected: true } : {}),
    ...(context.membershipStart && !safeCalendarDate(data.membership_start) ? { membership_start: context.membershipStart } : {}),
    ...(context.membershipExpiresAt && !safeCalendarDate(data.membership_expires_at) ? { membership_expires_at: context.membershipExpiresAt } : {}),
    ...(context.historyRecoveryState ? { history_recovery_state: context.historyRecoveryState } : {}),
    ...(context.contactProfile ? { contactProfile: context.contactProfile } : {}),
    ...(context.lineOfcNoteScan ? { line_ofc_note_scan: context.lineOfcNoteScan } : {}),
    ...(history ? { history: history.items, history_summary: history.summary } : {}),
  };
  if (context.capability) {
    patched.tier = context.label;
    patched.membership_status = context.lifecycle;
    patched.actual_access = context.publicServiceAccess ? "granted" : "restricted";
  }
  return { ...payload, data: patched };
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
  return { capability, label: PROTECTED_LABELS[capability], lifecycle, publicServiceAccess: access.public_service_access === true,
    startAt: safeCalendarDate(entitlement?.start_at), expiresAt: safeCalendarDate(entitlement?.expire_at), packageLabel: safeProtectedPackageLabel(entitlement?.package_code) };
}

export function projectCanonicalContactProfile(fields = {}) {
  if (!isPlainObject(fields)) return null;
  const email = safeEmail(fields["Contact Email"] || fields.email);
  const phone = safePhone(fields["Phone Number"] || fields.phone);
  const lineHandle = safeHumanLineHandle(fields.username || fields["LINE ID"] || fields.line_handle);
  const telegramUsername = safeTelegramUsername(fields.telegram_username || fields.telegram);
  if (!email && !phone && !lineHandle && !telegramUsername) return null;
  return {
    email: email || null,
    phone: phone || null,
    lineHandle: lineHandle || null,
    telegramUsername: telegramUsername || null,
    telegramName: null,
    source: CONTACT_PROFILE_SOURCE,
    reviewState: "verified",
  };
}

async function readCanonicalContactProfile(env, lineUserId) {
  try {
    const client = await resolveCanonicalClientForLine(env, lineUserId);
    return projectCanonicalContactProfile(client?.fields || {});
  } catch (error) {
    console.warn({ event: "my_mmd_contact_profile_lookup_failed", failure_class: safeFailureClass(error) });
    return null;
  }
}

export async function readLineOfcNoteScan(env = {}, lineUserId = "") {
  const lineId = canonicalLineId(lineUserId);
  const apiKey = String(env.AIRTABLE_API_KEY || "").trim();
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  if (!lineId || !apiKey || !baseId) return null;
  const table = String(env.AIRTABLE_TABLE_CONSOLE_INBOX || CONSOLE_INBOX_TABLE).trim();
  const records = [];
  let offset = "";
  try {
    do {
      const url = new URL(AIRTABLE_API + "/" + encodeURIComponent(baseId) + "/" + encodeURIComponent(table));
      url.searchParams.set("filterByFormula", "{line_user_id}=" + formulaString(lineId));
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response;
      try {
        const init = { headers: { authorization: "Bearer " + apiKey, accept: "application/json" }, signal: controller.signal };
        response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(new Request(url.toString(), init)) : await fetch(url.toString(), init);
      } finally { clearTimeout(timeout); }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.records)) return null;
      records.push(...payload.records);
      offset = typeof payload.offset === "string" ? payload.offset : "";
    } while (offset && records.length < 2000);
  } catch (error) {
    console.warn({ event: "my_mmd_line_ofc_note_scan_failed", failure_class: safeFailureClass(error) });
    return null;
  }
  const ordered = records.slice().sort((a, b) => String(a?.createdTime || a?.fields?.created_at || "").localeCompare(String(b?.createdTime || b?.fields?.created_at || "")));
  const emails = new Set();
  const phones = new Set();
  for (const record of ordered) {
    const fields = isPlainObject(record?.fields) ? record.fields : {};
    const directEmail = safeEmail(fields.member_email);
    const directPhone = safePhone(fields.member_phone);
    if (directEmail) emails.add(directEmail);
    if (directPhone) phones.add(directPhone);
    const scanText = [fields.admin_note, fields.payload_json].filter(Boolean).join("\n");
    for (const match of scanText.matchAll(/[A-Z0-9.!#$%&'*+/=?^_{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi)) {
      const email = safeEmail(match[0]); if (email) emails.add(email);
    }
    for (const match of scanText.matchAll(/(?:phone|mobile|tel(?:ephone)?|เบอร์|โทรศัพท์)[\s:=-]{0,8}((?:\+?66|0)[\d\s().-]{8,16})/gi)) {
      const phone = safePhone(match[1]); if (phone) phones.add(phone);
    }
  }
  const firstNoteAt = ordered[0] ? String(ordered[0].createdTime || ordered[0].fields?.created_at || "") : null;
  const lastNoteAt = ordered.length ? String(ordered[ordered.length - 1].createdTime || ordered[ordered.length - 1].fields?.created_at || "") : null;
  const email = [...emails][0] || null;
  const phone = [...phones][0] || null;
  return {
    state: "resolved", source: LINE_OFC_NOTE_SOURCE, scannedCount: ordered.length,
    firstNoteAt: firstNoteAt || null, lastNoteAt: lastNoteAt || null,
    emailCandidates: [...emails].slice(0, 8), phoneCandidates: [...phones].slice(0, 8),
    contact: email || phone ? { email, phone, lineHandle: null, telegramUsername: null } : null,
  };
}

function patchProfilePayload(payload, context) {
  const history = resolvedClientHistory(context);
  const serviceItems = history ? history.items.filter((item) => item?.kind === "booking").map(profileServiceItem) : null;
  const patched = {
    ...payload,
    ...(context.lineConnected === true ? { line_connected: true } : {}),
    ...(context.membershipStart && !safeCalendarDate(payload.member_since) ? { member_since: context.membershipStart } : {}),
    ...(context.membershipExpiresAt && !safeCalendarDate(payload.active_through) ? { active_through: context.membershipExpiresAt } : {}),
    ...(context.packageLabel && !safeDisplayName(payload.package_label) ? { package_label: context.packageLabel } : {}),
    ...(context.historyRecoveryState ? { history_recovery_state: context.historyRecoveryState } : {}),
    ...(context.contactProfile ? { contactProfile: context.contactProfile } : {}),
    ...(context.lineOfcNoteScan ? { line_ofc_note_scan: context.lineOfcNoteScan } : {}),
    ...(history ? { verified_service_count: history.summary.verifiedServiceCount,
      service_history_summary: { items: serviceItems, verified_service_count: history.summary.verifiedServiceCount,
        verified_service_spend_thb: history.summary.verifiedServiceSpendThb, last_service_date: history.summary.lastServiceDate } } : {}),
  };
  if (!context.capability) return patched;
  return { ...patched, match_state: "matched", membership_tier: context.capability, membership_status: context.lifecycle,
    actual_access: context.publicServiceAccess ? "granted" : "restricted" };
}

function patchHistoryPayload(payload, context) {
  const history = resolvedClientHistory(context);
  if (!history) return payload;
  const sourceItems = Array.isArray(payload) ? payload : (isPlainObject(payload) && Array.isArray(payload.items) ? payload.items : []);
  const items = mergeHistoryItems(sourceItems, history.items);
  if (Array.isArray(payload)) return items;
  if (isPlainObject(payload) && Array.isArray(payload.items)) return { ...payload, state: "resolved", items, summary: history.summary };
  return items.length ? items : payload;
}

function patchDashboardPayload(payload, context) {
  const data = isPlainObject(payload.data) ? payload.data : null;
  if (!data) return payload;
  const member = isPlainObject(data.member) ? data.member : {};
  const messages = Array.isArray(data.messages) ? data.messages.filter((item) => !["member_checking", "member_new"].includes(String(item?.code || ""))) : [];
  const patchedMember = { ...member,
    ...(context.membershipStart && !safeCalendarDate(member.membership_start) ? { membership_start: context.membershipStart } : {}),
    ...(context.membershipExpiresAt && !safeCalendarDate(member.membership_expires_at) ? { membership_expires_at: context.membershipExpiresAt } : {}) };
  if (context.capability) {
    patchedMember.display_name = preferResolvedDisplayName(member.display_name, context.displayName);
    patchedMember.tier = verifiedField(context.label);
    patchedMember.membership_status = verifiedField(context.lifecycle);
  }
  return { ...payload, ok: true, data: { ...data,
    ...(context.capability ? { dashboard_state: data.dashboard_state === "checking" ? "partial" : data.dashboard_state,
      data_status: data.data_status === "checking" ? "partial" : data.data_status } : {}), member: patchedMember,
    ...(context.lineOfcNoteScan ? { line_ofc_note_scan: context.lineOfcNoteScan } : {}),
    ...(context.capability ? { messages } : {}) } };
}

function patchMemberAppPayload(payload, context, standalone = false) {
  const membership = standalone ? payload : (isPlainObject(payload.membership) ? payload.membership : {});
  const currentMemberSince = safeCalendarDate(membership.memberSince || membership.member_since);
  const currentExpires = safeCalendarDate(membership.expiresAt || membership.expires_at);
  const currentRenewal = safeCalendarDate(membership.renewalDueAt || membership.renewal_due_at);
  const canonicalMembership = { ...membership,
    ...(context.packageLabel && !safeDisplayName(membership.packageLabel || membership.package_label) ? { packageLabel: context.packageLabel } : {}),
    ...(context.membershipStart && !currentMemberSince ? { memberSince: context.membershipStart } : {}),
    ...(context.membershipExpiresAt && !currentExpires ? { expiresAt: context.membershipExpiresAt } : {}),
    ...(context.membershipExpiresAt && !currentRenewal ? { renewalDueAt: context.membershipExpiresAt } : {}),
    ...(context.historyRecoveryState ? { historyRecoveryState: context.historyRecoveryState } : {}) };
  const history = resolvedClientHistory(context);
  const historyPatch = !standalone && history ? {
    verifiedServiceCount: history.summary.verifiedServiceCount,
    verifiedServiceSpendThb: history.summary.verifiedServiceSpendThb,
    lastServiceDate: history.summary.lastServiceDate,
    serviceHistorySummary: { items: history.items.filter((item) => item?.kind === "booking").map(profileServiceItem),
      verifiedServiceCount: history.summary.verifiedServiceCount, verifiedServiceSpendThb: history.summary.verifiedServiceSpendThb,
      lastServiceDate: history.summary.lastServiceDate },
  } : {};
  if (!context.capability) {
    if (standalone) return canonicalMembership;
    return { ...payload, ...historyPatch, membership: canonicalMembership };
  }
  const existingAction = isPlainObject(payload.nextAction) ? payload.nextAction : null;
  const nextAction = protectedMemberNextAction(existingAction);
  const identity = isPlainObject(payload.identity) ? payload.identity : {};
  const patched = { ...payload, ...historyPatch,
    greetingName: preferResolvedDisplayName(payload.greetingName, context.displayName),
    identity: { ...identity, displayName: preferResolvedDisplayName(identity.displayName, context.displayName) },
    membership: { ...canonicalMembership, level: context.capability, levelVerified: true, status: context.lifecycle,
      lifecycle: context.lifecycle, access: context.publicServiceAccess ? "granted" : (canonicalMembership.access || "checking"),
      displayOnly: false, displaySource: context.source, legacyStatus: null, nextAction },
    lifecycle: context.lifecycle, nextAction, legacyDisplay: null };
  return standalone ? { ...patched.membership, lifecycle: patched.lifecycle } : patched;
}

function resolvedClientHistory(context) {
  const history = context?.clientHistory;
  if (!history || history.state !== "resolved" || !Array.isArray(history.items) || !isPlainObject(history.summary)) return null;
  return history;
}

function profileServiceItem(item = {}) {
  return {
    id: safeDisplayName(item.id) || null,
    occurred_at: safeCalendarDate(item.occurredAt),
    title: safeDisplayName(item.title) || "MMD service",
    status_label: safeDisplayName(item.statusLabel) || "Completed",
    model: safeDisplayName(item.model) || null,
    service_codes: safeStringArray(item.serviceCodes),
    charge_components: Array.isArray(item.chargeComponents)
      ? item.chargeComponents.map((part) => ({ code: safeDisplayName(part?.code), type: safeDisplayName(part?.type) })).filter((part) => part.code) : [],
    location: safeDisplayName(item.location) || null,
    map_url: safeUrl(item.mapUrl),
    start_time: safeClock(item.startTime),
    end_time: safeClock(item.endTime),
    duration_minutes: safePositiveInteger(item.durationMinutes),
    total_amount_thb: safeMoney(item.totalAmountThb),
    deposit_amount_thb: safeMoney(item.depositAmountThb),
    balance_amount_thb: safeMoney(item.balanceAmountThb),
  };
}

function mergeHistoryItems(primary = [], recovered = []) {
  const all = [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(recovered) ? recovered : [])];
  const seenIds = new Set(); const seenFingerprints = new Set(); const out = [];
  for (const raw of all) {
    if (!raw || typeof raw !== "object") continue;
    const item = { ...raw };
    const id = String(item.id || "").trim();
    const occurredAt = String(item.occurredAt || item.occurred_at || item.date || "").trim();
    const kind = String(item.kind || item.type || "").trim().toLowerCase();
    const title = String(item.title || "").trim().toLowerCase();
    const model = String(item.model || "").trim().toLowerCase();
    const amount = String(item.totalAmountThb ?? item.total_amount_thb ?? item.amountThb ?? item.amount_thb ?? "");
    const fingerprint = `${kind}|${occurredAt}|${title}|${model}|${amount}`;
    if (id && seenIds.has(id)) continue;
    if (fingerprint !== "||||" && seenFingerprints.has(fingerprint)) continue;
    if (id) seenIds.add(id);
    if (fingerprint !== "||||") seenFingerprints.add(fingerprint);
    out.push(item);
  }
  return out.sort((a, b) => String(b.occurredAt || b.occurred_at || b.date || "").localeCompare(String(a.occurredAt || a.occurred_at || a.date || "")));
}

function safeStringArray(value) { return Array.isArray(value) ? value.map((item) => safeDisplayName(item)).filter(Boolean).slice(0, 20) : []; }
function safeClock(value) { const match = /^(\d{2}):(\d{2})$/.exec(String(value || "").trim()); if (!match) return null; const hour = Number(match[1]); const minute = Number(match[2]); return hour < 24 && minute < 60 ? `${match[1]}:${match[2]}` : null; }
function safePositiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
function safeMoney(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null; }
function safeUrl(value) { const text = String(value || "").trim(); if (!text) return null; try { const url = new URL(text); return ["https:", "http:"].includes(url.protocol) ? url.toString().slice(0, 500) : null; } catch { return null; } }
function safeEmail(value) { const email = String(value || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 254) : null; }
function safePhone(value) { const text = String(value || "").trim(); if (!text) return null; const hasPlus = text.startsWith("+"); const digits = text.replace(/\D/g, ""); if (digits.length < 8 || digits.length > 15) return null; return `${hasPlus ? "+" : ""}${digits}`; }
function safeHumanLineHandle(value) { const text = safeDisplayName(value).replace(/^@/, ""); if (!text || /^U[0-9a-f]{32}$/i.test(text)) return null; if (/^(?:username|line|line id)$/i.test(text)) return null; return text.slice(0, 120); }
function safeTelegramUsername(value) { const text = safeDisplayName(value).replace(/^@/, ""); if (!/^[A-Za-z0-9_]{3,64}$/.test(text) || /^(?:username|telegram)$/i.test(text)) return null; return text; }
function safeFailureClass(error) { const text = String(error?.message || error || "unknown").toLowerCase(); if (/timeout|abort/.test(text)) return "timeout"; if (/airtable_4\d\d/.test(text)) return "upstream_4xx"; if (/airtable_5\d\d/.test(text)) return "upstream_5xx"; return "lookup_failed"; }

function protectedMemberNextAction(existing) { const kind = String(existing?.kind || "").trim(); if (kind && !["signup", "renew", "checking"].includes(kind)) return existing; return { kind: "none", label: null, url: null }; }
function verifiedField(value) { return { value, status: "verified", source: RESOLVER_SOURCE }; }
function preferResolvedDisplayName(current, resolved) { const currentName = safeDisplayName(current); const resolvedName = safeDisplayName(resolved); if (!resolvedName) return currentName || "สมาชิก MMD"; if (!currentName || currentName === "สมาชิก MMD") return resolvedName; return currentName; }

function overlayProtectedDisplay(profile, projection, displayName) {
  const source = isPlainObject(profile) ? profile : {};
  const customer360 = isPlainObject(source.customer_360) ? source.customer_360 : null;
  const member = customer360 && isPlainObject(customer360.member) ? customer360.member : null;
  const membershipStart = safeCalendarDate(source.membership_start) || projection.startAt || null;
  const membershipExpiresAt = safeCalendarDate(source.membership_expires_at) || projection.expiresAt || null;
  return { ...source, display_name: displayName || safeDisplayName(source.display_name) || "สมาชิก MMD", tier: projection.label,
    membership_status: projection.lifecycle, ...(membershipStart ? { membership_start: membershipStart } : {}),
    ...(membershipExpiresAt ? { membership_expires_at: membershipExpiresAt } : {}),
    ...(customer360 ? { customer_360: { ...customer360, ...(member ? { member: { ...member,
      display_name: displayName || safeDisplayName(member.display_name) || "สมาชิก MMD", tier: projection.label,
      membership_status: projection.lifecycle, ...(membershipStart ? { membership_start: safeCalendarDate(member.membership_start) || membershipStart } : {}),
      ...(membershipExpiresAt ? { membership_expires_at: safeCalendarDate(member.membership_expires_at) || membershipExpiresAt } : {}) } } : {}) } } : {}) };
}

function canonicalPresentationContext(serializedProfile, rawProfile, projection, protectedActiveThrough = null, recoveryStatus = null) {
  const source = isPlainObject(serializedProfile) ? serializedProfile : {};
  const customer360 = isPlainObject(source.customer_360) ? source.customer_360 : {};
  const member = isPlainObject(customer360.member) ? customer360.member : {};
  const packages = isPlainObject(customer360.packages) ? customer360.packages : {};
  const currentPackage = isPlainObject(packages.current_package) ? packages.current_package : {};
  const raw = isPlainObject(rawProfile) ? rawProfile : {};
  const raw360 = isPlainObject(raw.customer_360) ? raw.customer_360 : {};
  const rawMember = isPlainObject(raw360.member) ? raw360.member : {};
  const membershipStart = safeCalendarDate(source.membership_start) || safeCalendarDate(member.membership_start) || projection?.startAt || null;
  const canonicalExpiry = safeCalendarDate(source.membership_expires_at) || safeCalendarDate(member.membership_expires_at) || projection?.expiresAt || null;
  const membershipExpiresAt = canonicalExpiry || safeCalendarDate(protectedActiveThrough) || null;
  const recovery = projectHistoryRecoveryState(recoveryStatus, raw, rawMember);
  return { membershipStart,
    membershipExpiresAt,
    packageLabel: safeDisplayName(currentPackage.customer_safe_name) || projection?.packageLabel || null,
    historyRecoveryState: recovery.historyRecoveryState,
    historyRecoveryStatus: recovery.historyRecoveryStatus,
    historyReviewRequired: recovery.historyReviewRequired };
}

export function projectHistoryRecoveryState(recoveryStatus, rawProfile = {}, rawMember = {}) {
  const state = String(recoveryStatus?.state || "").trim().toLowerCase();
  if (state === "reconciled") {
    return { historyRecoveryState: null, historyRecoveryStatus: "reconciled", historyReviewRequired: false };
  }
  if (state === "review_required") {
    return { historyRecoveryState: null, historyRecoveryStatus: "review_required", historyReviewRequired: true };
  }
  if (state === "blocked") {
    return { historyRecoveryState: null, historyRecoveryStatus: "blocked", historyReviewRequired: false };
  }
  if (state === "checking" || state === "in_progress") {
    return { historyRecoveryState: "recovery_pending", historyRecoveryStatus: state, historyReviewRequired: false };
  }

  // Compatibility fallback only when there is no authoritative recovery state.
  // Missing membership_start/expiry is metadata absence, not proof that recovery is running.
  const explicitlyPending = [rawProfile?.history_recovery_state, rawMember?.history_recovery_state]
    .some((value) => String(value || "").trim().toLowerCase() === "pending");
  return {
    historyRecoveryState: explicitlyPending ? "recovery_pending" : null,
    historyRecoveryStatus: null,
    historyReviewRequired: false,
  };
}

export function protectedConnectNowActiveThrough(projection, anchorDate) {
  if (!isPlainObject(projection)) return null;
  if (projection.lifecycle !== "active") return null;
  const capability = String(projection.capability || "").trim().toLowerCase();
  if (!PROTECTED_PRIORITY.includes(capability)) return null;
  const start = safeCalendarDate(anchorDate);
  if (!start) return null;
  const anchor = new Date(`${start}T00:00:00.000Z`);
  anchor.setUTCFullYear(anchor.getUTCFullYear() + 2);
  return anchor.toISOString().slice(0, 10);
}

export async function readOrCreateProtectedActiveThroughAnchor(env = {}, lineUserId = "", projection = {}, now = new Date()) {
  const store = env.LIFF_IDENTITY_KV;
  const secret = String(env.LIFF_SESSION_SECRET || "");
  const lineId = canonicalLineId(lineUserId);
  if (!store?.get || !store?.put || secret.length < 32 || !lineId) return null;
  try {
    const fingerprint = (await hmacHex(secret, `protected-active-through:${lineId}`)).slice(0, 32);
    const key = `my-mmd:protected-active-through:v1:${fingerprint}`;
    const existing = await store.get(key, "json");
    const existingDate = safeCalendarDate(existing?.active_through);
    if (existingDate) return existingDate;

    const connectedOn = now instanceof Date && Number.isFinite(now.getTime())
      ? now.toISOString().slice(0, 10)
      : safeCalendarDate(now);
    const activeThrough = protectedConnectNowActiveThrough(projection, connectedOn);
    if (!activeThrough) return null;
    const record = {
      version: 1,
      policy: "protected_connect_now_plus_2y_v1",
      connected_on: connectedOn,
      active_through: activeThrough,
      capability_at_connect: String(projection.capability || "").trim().toLowerCase(),
      contains_raw_line_id: false,
      created_at: new Date().toISOString(),
    };
    await store.put(key, JSON.stringify(record));
    console.info({
      event: "my_mmd_protected_active_through_anchor_created",
      component: "member-pages-worker",
      policy: record.policy,
      capability: record.capability_at_connect,
      active_through: activeThrough,
    });
    return activeThrough;
  } catch (error) {
    console.warn({
      event: "my_mmd_protected_active_through_anchor_failed",
      component: "member-pages-worker",
      failure_class: safeFailureClass(error),
    });
    return null;
  }
}

function selectProtectedEntitlement(value, capability, lifecycle) {
  if (!Array.isArray(value)) return null;
  const allowed = lifecycle === "active" ? new Set(["active", "expiring_soon"]) : new Set(["grace"]);
  const candidates = value.filter((item) => isPlainObject(item) && String(item.capability || "").trim().toLowerCase() === capability && allowed.has(String(item.lifecycle || "").trim().toLowerCase()));
  candidates.sort((a, b) => { const aExpire = Date.parse(String(a.expire_at || "")) || 0; const bExpire = Date.parse(String(b.expire_at || "")) || 0; if (aExpire !== bExpire) return bExpire - aExpire; return (Date.parse(String(b.start_at || "")) || 0) - (Date.parse(String(a.start_at || "")) || 0); });
  return candidates[0] || null;
}

function safeProtectedPackageLabel(value) { const code = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"); if (!code) return null; if (code.includes("black_card") || code.includes("blackcard")) return "Black Card Membership"; if (code.includes("svip")) return "SVIP Membership"; if (code.includes("vip")) return "VIP Membership"; return null; }
function safeCalendarDate(value) { const text = String(value || "").trim(); const direct = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text); if (direct && validCalendarDate(direct[1], direct[2], direct[3])) return text; const parsed = Date.parse(text); if (!Number.isFinite(parsed)) return null; return new Date(parsed).toISOString().slice(0, 10); }
function validCalendarDate(yearText, monthText, dayText) { const year = Number(yearText); const month = Number(monthText); const day = Number(dayText); const value = new Date(Date.UTC(year, month - 1, day)); return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day; }

async function readCanonicalMemberProfile(env, lineUserId) {
  const resolver = env.MEMBER_STATUS_RESOLVER; const secret = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  if (!resolver?.fetch || secret.length < 32) return null;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await resolver.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_PROFILE_PATH}`, { method: "POST",
      headers: { "content-type": "application/json", [MEMBER_RESOLVER_SECRET_HEADER]: secret },
      body: JSON.stringify({ line_user_id: lineUserId, purpose: MEMBER_PROFILE_PURPOSE }), signal: controller.signal }));
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null); const data = isPlainObject(payload?.data) ? payload.data : null;
    if (payload?.ok !== true || typeof data?.member_exists !== "boolean") return null;
    if (!data.member_exists) return { memberId: null, profile: null, entitlementSnapshot: null };
    const memberId = safeIdentifier(data.member_id); const profile = isPlainObject(data.profile) ? data.profile : null;
    if (!memberId || !profile) return null;
    const entitlementSnapshot = isPlainObject(data.entitlement_snapshot) ? data.entitlement_snapshot : (isPlainObject(profile.entitlement_snapshot) ? profile.entitlement_snapshot : null);
    return { memberId, profile, entitlementSnapshot };
  } catch { return null; } finally { clearTimeout(timeout); }
}

async function readSessionRef(request, env) {
  const store = env.LIFF_IDENTITY_KV; const secret = String(env.LIFF_SESSION_SECRET || ""); const token = cookieValue(request, SESSION_COOKIE);
  if (!store?.get || !store?.put || secret.length < 32 || !token) return null;
  try { const hash = await hmacHex(secret, `session:${token}`); const key = `liff:session:${hash}`; const session = await store.get(key, "json");
    if (!isPlainObject(session) || Number(session.expires_at || 0) <= Date.now()) return null; const lineUserId = canonicalLineId(session.line_user_id); if (!lineUserId) return null; return { key, session, lineUserId }; } catch { return null; }
}
function remainingSessionTtl(session = {}) { const remaining = Math.ceil((Number(session.expires_at || 0) - Date.now()) / 1000); if (!Number.isFinite(remaining) || remaining <= 0) return 1; return Math.max(1, Math.min(SESSION_TTL_SECONDS, remaining)); }
function highestProtected(values) { const set = new Set(values); return PROTECTED_PRIORITY.find((value) => set.has(value)) || null; }
function safeTokens(value) { if (!Array.isArray(value)) return []; return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean).slice(0, 20); }
function canonicalLineId(value) { const lineId = String(value || "").trim(); return /^U[0-9a-f]{32}$/i.test(lineId) ? lineId : ""; }
function formulaString(value) { return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function safeIdentifier(value) { const text = String(value || "").trim(); return /^[A-Za-z0-9][A-Za-z0-9_-]{2,159}$/.test(text) ? text : ""; }
function safeDisplayName(value) { return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120); }
function cookieValue(request, name) { const raw = String(request.headers.get("cookie") || ""); for (const part of raw.split(";")) { const index = part.indexOf("="); if (index < 0) continue; if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim(); } return ""; }
async function hmacHex(secret, value) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
