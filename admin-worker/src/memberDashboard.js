import { json, safeJson } from "../lib/http.js";
import { dtFindMember } from "../lib/memberstack_dt.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const VERIFIED_PAYMENT_STATUSES = new Set(["paid", "success", "verified"]);
const VERIFIED_VERIFICATION_STATUSES = new Set(["verified", "approved", "success"]);
const UPCOMING_SESSION_EMPTY_STATE = {
  date_label: "No upcoming session",
  name: "No active session",
  meta: "Private route available when a new session is created",
  payment_badge: "No Payment Yet",
  reminder_badge: "No Reminder Scheduled",
};

export async function handleMemberDashboardRequest(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  try {
    const state = await loadMemberDashboardState(url, env);
    if (!state.ok) {
      return dashboardErrorResponse(state.error);
    }

    const { context, collections, meta } = state;

    if (path === "/api/member/dashboard") {
      return json(buildDashboardPayload(context, collections, meta));
    }

    if (path === "/api/member/profile") {
      return json(buildProfilePayload(context, collections, meta));
    }

    if (path === "/api/member/profile/member-id/check") {
      return json(await buildMemberIdAvailabilityPayload(url, env, context, meta));
    }

    if (method === "POST" && path === "/api/member/profile/member-id") {
      const body = (await safeJson(req)) || {};
      return json(await confirmMemberId(body, env, context, collections, meta));
    }

    if ((method === "GET" || method === "HEAD") && path === "/api/member/dashboard/view") {
      return renderMemberDashboardPreviewPage({
        method,
        dashboard: buildDashboardPayload(context, collections, meta),
        nextSession: buildNextSessionPayload(collections, meta),
        payments: buildPaymentSummaryPayload(collections, meta),
        token: toStr(url.searchParams.get("t")),
      });
    }

    if (path === "/api/member/session/next") {
      return json(buildNextSessionPayload(collections, meta));
    }

    if (path === "/api/member/payments/summary") {
      return json(buildPaymentSummaryPayload(collections, meta));
    }

    return dashboardErrorResponse(makeDashboardError("not_found", "Route not found.", 404, false));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "internal_error");
    const code = message.includes("missing_airtable_env") ? "upstream_unavailable" : "internal_error";
    const status = code === "upstream_unavailable" ? 503 : 500;
    return dashboardErrorResponse(makeDashboardError(code, message, status, code === "upstream_unavailable"));
  }
}

export async function handleMemberKenjiChatRequest(req, env) {
  const url = new URL(req.url);
  const body = (await safeJson(req)) || {};

  try {
    const state = await loadMemberDashboardState(url, env);
    if (!state.ok) {
      return dashboardErrorResponse(state.error);
    }

    const { context, collections, meta } = state;
    const text = firstNonEmpty(body?.message, body?.text, body?.input);
    if (!text) {
      return dashboardErrorResponse(
        makeDashboardError("message_missing", "Missing Kenji message.", 400, false, meta),
      );
    }

    const nextSession = buildNextSessionPayload(collections, meta).session;
    const payments = buildPaymentSummaryPayload(collections, meta).payments;
    const dashboard = buildDashboardPayload(context, collections, meta);
    const reply = await requestKenjiChatReply(
      env,
      {
        text,
        language: normalizeKenjiLanguage(body?.language, text),
        context,
        collections,
        dashboard,
        nextSession,
        payments,
      },
    );

    return json({
      ok: true,
      reply: reply.text,
      kenji: dashboard.kenji,
      meta: {
        ...meta,
        assistant: reply.assistant,
        persona: reply.persona,
        route_id: reply.route_id,
        intent: reply.intent,
        next_action: reply.next_action,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "internal_error");
    const unavailable = message.includes("missing_chat_worker_env") || message.includes("kenji_chat_error_");
    const code = unavailable ? "kenji_unavailable" : "internal_error";
    const status = unavailable ? 503 : 500;
    const responseMessage = unavailable ? "Kenji is unavailable right now." : message;
    return dashboardErrorResponse(makeDashboardError(code, responseMessage, status, unavailable));
  }
}

export async function mintMemberDashboardToken(body, env) {
  const payload = {
    kind: "customer_invite",
    role: "customer",
    lane: "customer_onboarding",
    invite_id: `dash_${crypto.randomUUID().replace(/-/g, "")}`,
    username: slugify(firstNonEmpty(body?.username, body?.display_name, "member")),
    mmd_client_name: firstNonEmpty(body?.display_name, body?.full_name, "Member Dashboard"),
    nickname: slugify(firstNonEmpty(body?.nickname, body?.display_name, "member")),
    suffix_code: slugify(firstNonEmpty(body?.suffix_code, "qa")).slice(0, 2) || "qa",
    email: toStr(body?.email).toLowerCase(),
    line_user_id: toStr(body?.line_user_id),
    telegram_username: toStr(body?.telegram_username),
    memberstack_id: firstNonEmpty(body?.memberstack_id, body?.member_id),
    model_name: toStr(body?.model_name),
    model_record_id: toStr(body?.model_record_id),
    rules_url: toStr(body?.rules_url),
    console_url: toStr(body?.console_url),
    requires_rules_ack: false,
    requires_model_binding: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + Math.max(300, safeInt(body?.expires_in_seconds || 3600)),
  };

  const secret = getDashboardSecret(env);
  const token = await signTwoPartToken(payload, secret);

  return {
    ok: true,
    token,
    expires_at: new Date(payload.exp * 1000).toISOString(),
    payload,
    urls: {
      dashboard: `/api/member/dashboard?t=${encodeURIComponent(token)}`,
      dashboard_preview: `/api/member/dashboard/view?t=${encodeURIComponent(token)}`,
      next_session: `/api/member/session/next?t=${encodeURIComponent(token)}`,
      payments_summary: `/api/member/payments/summary?t=${encodeURIComponent(token)}`,
      kenji_chat: `/api/member/kenji/chat?t=${encodeURIComponent(token)}`,
    },
  };
}

async function readDashboardToken(url, env) {
  const requestId = newRequestId();
  const meta = buildMeta(requestId);
  const token = toStr(url.searchParams.get("t"));
  if (!token) {
    return {
      ok: false,
      error: makeDashboardError("token_missing", "Missing dashboard token.", 400, false, meta),
    };
  }

  const twoPartToken = await tryReadSignedToken(token, env);
  if (twoPartToken.ok) {
    return {
      ok: true,
      token_payload: twoPartToken.token_payload,
      meta,
    };
  }
  if (twoPartToken.expired) {
    return {
      ok: false,
      error: makeDashboardError("token_expired", "This dashboard link has expired.", 410, false, meta),
    };
  }

  const kv = env.PAY_SESSIONS_KV || env.PAYMENTS_KV || env.KV;
  if (!kv) {
    return {
      ok: false,
      error: makeDashboardError("token_invalid", "This dashboard link is invalid.", 401, false, meta),
    };
  }

  const tokenPayload = await readTokenFromKV(kv, token);
  const expiryMs = tokenExpiryMs(tokenPayload, token);
  if (expiryMs && expiryMs <= Date.now()) {
    return {
      ok: false,
      error: makeDashboardError("token_expired", "This dashboard link has expired.", 410, false, meta),
    };
  }

  if (!tokenPayload) {
    return {
      ok: false,
      error: makeDashboardError("token_invalid", "This dashboard link is invalid.", 401, false, meta),
    };
  }

  return {
    ok: true,
    token_payload: tokenPayload,
    meta,
  };
}

async function loadMemberDashboardState(url, env) {
  const tokenResult = await readDashboardToken(url, env);
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const context = await resolveMemberContext(env, tokenResult.token_payload);
  const collections = await fetchDashboardCollections(env, context);

  return {
    ok: true,
    context,
    collections,
    meta: tokenResult.meta,
  };
}

async function readTokenFromKV(kv, token) {
  const parts = String(token).split(".");
  const sig = parts.length === 3 ? parts[2] : null;
  if (!sig) return null;

  const raw = await kv.get(`tok:${sig}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function resolveMemberContext(env, tokenPayload) {
  const token = tokenPayload && typeof tokenPayload === "object" ? tokenPayload : {};
  const memberRecord = await findMemberRecord(env, token);

  const memberstackId =
    firstNonEmpty(
      memberRecord?.id,
      memberRecord?.memberstack_id,
      memberRecord?.member_id,
      token.memberstack_id,
      token.member_id,
    ) || "";
  const email = firstNonEmpty(memberRecord?.email, token.member_email, token.email) || "";
  const displayName =
    firstNonEmpty(
      memberRecord?.display_name,
      memberRecord?.name,
      memberRecord?.full_name,
      memberRecord?.customFields?.display_name,
      memberRecord?.customFields?.name,
      token.mmd_client_name,
      token.display_name,
      token.client_name,
      token.customer_name,
      token.name,
    ) || "MMD Member";
  const fullName =
    firstNonEmpty(
      memberRecord?.full_name,
      memberRecord?.name,
      memberRecord?.customFields?.full_name,
      token.mmd_client_name,
      token.full_name,
      token.display_name,
      displayName,
    ) || displayName;
  const username = normalizeUsername(
    firstNonEmpty(
      memberRecord?.username,
      memberRecord?.telegram_username,
      memberRecord?.customFields?.username,
      memberRecord?.customFields?.telegram_username,
      token.username,
      token.telegram_username,
    ),
  );

  return {
    token,
    memberRecord,
    memberstack_id: memberstackId,
    customer_key: firstNonEmpty(
      memberRecord?.customer_key,
      memberRecord?.customFields?.customer_key,
      token.customer_key,
    ) || "",
    member_email: email,
    display_name: displayName,
    full_name: fullName,
    username,
    tier:
      firstNonEmpty(
        memberRecord?.current_tier,
        memberRecord?.tier,
        memberRecord?.customFields?.current_tier,
        memberRecord?.customFields?.tier,
        token.base_tier,
        token.tier,
      ) || "STANDARD",
    status:
      firstNonEmpty(
        memberRecord?.membership_status,
        memberRecord?.status,
        memberRecord?.customFields?.membership_status,
        memberRecord?.customFields?.status,
        token.membership_status,
        token.status,
      ) || "ACTIVE",
    kenji_mode: firstNonEmpty(token.kenji_mode, token.kenji?.mode, memberRecord?.customFields?.kenji_mode) || "demo",
  };
}

async function findMemberRecord(env, token) {
  if (!toStr(env.MEMBERSTACK_API_KEY)) {
    return null;
  }

  const memberstackId = firstNonEmpty(token.memberstack_id, token.member_id);
  const email = firstNonEmpty(token.member_email, token.email);

  if (memberstackId) {
    const member = await dtFindMember({ memberstack_id: memberstackId }, env);
    if (member) return normalizeMemberRecord(member);
  }

  if (email) {
    const member = await dtFindMember({ email }, env);
    if (member) return normalizeMemberRecord(member);
  }

  return null;
}

function normalizeMemberRecord(record) {
  if (!record || typeof record !== "object") return null;
  const customFields = record.customFields && typeof record.customFields === "object" ? record.customFields : {};
  return { ...customFields, ...record, customFields };
}

async function fetchDashboardCollections(env, context) {
  const sessions = await fetchSessions(env, context);
  const payments = await fetchPayments(env, context);
  const points = await fetchPoints(env, context);

  return {
    sessions,
    payments,
    points,
  };
}

async function fetchSessions(env, context) {
  const identifiers = buildSessionIdentifiers(env, context);
  for (const identifier of identifiers) {
    const rows = await tryAirtableListByField(env, getSessionsTable(env), identifier.field, identifier.value, 100);
    if (rows.length) {
      return rows.map((row) => shapeSession(row, env)).filter((row) => row.session_id || row.date_ms);
    }
  }
  return [];
}

async function fetchPayments(env, context) {
  const identifiers = buildPaymentIdentifiers(context);
  for (const identifier of identifiers) {
    const rows = await tryAirtableListByField(env, getPaymentsTable(env), identifier.field, identifier.value, 100);
    if (rows.length) {
      return rows.map((row) => shapePayment(row, env));
    }
  }
  return [];
}

async function fetchPoints(env, context) {
  const identifiers = buildPointIdentifiers(context);
  for (const identifier of identifiers) {
    const rows = await tryAirtableListByField(env, getPointsTable(env), identifier.field, identifier.value, 100);
    if (rows.length) {
      return rows.map((row) => shapePoint(row));
    }
  }
  return [];
}

function buildIdentifiers(context) {
  const seen = new Set();
  const out = [];
  const push = (field, value) => {
    const clean = toStr(value);
    if (!field || !clean) return;
    const key = `${field}:${clean.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ field, value: clean });
  };

  push("customer_key", context.customer_key);
  push("member_email", context.member_email);
  push("email", context.member_email);
  push("memberstack_id", context.memberstack_id);
  return out;
}

function buildSessionIdentifiers(env, context) {
  const identifiers = buildIdentifiers(context);
  const memberstackField = toStr(env.AT_SESSIONS__MEMBERSTACK_ID);
  return identifiers.map((identifier) => {
    if (identifier.field === "memberstack_id" && memberstackField) {
      return { ...identifier, field: memberstackField };
    }
    return identifier;
  });
}

function buildPaymentIdentifiers(context) {
  return buildIdentifiers(context).filter((identifier) => identifier.field !== "memberstack_id");
}

function buildPointIdentifiers(context) {
  return buildIdentifiers(context).filter((identifier) => identifier.field !== "memberstack_id");
}

function buildDashboardPayload(context, collections, meta) {
  const points = computePoints(collections.points);
  const totalSessions = uniqueCount(collections.sessions.map((session) => session.session_id));
  const memberId = context.memberstack_id || firstNonEmpty(context.token.member_id, context.token.memberstack_id) || "";
  const username = context.username || "";
  const identity = [memberId, username].filter(Boolean).join(" · ") || memberId || context.display_name;
  const avatarLetter = firstLetter(context.display_name);

  return {
    ok: true,
    member: {
      member_id: memberId,
      display_name: context.display_name,
      full_name: context.full_name,
      username,
      identity,
      tier: uppercaseLabel(context.tier || "STANDARD"),
      status: uppercaseLabel(context.status || "ACTIVE"),
      points: points.active_points,
      avatar_letter: avatarLetter,
      total_sessions: totalSessions,
      landing_status: "Landingpage active",
      dashboard_status: "Dashboard verified",
      concierge_status: context.kenji_mode === "live" ? "Kenji AI live" : "Kenji AI ready",
    },
    kenji: buildKenjiSurface(context),
    meta,
  };
}

function buildProfilePayload(context, collections, meta) {
  return {
    ok: true,
    profile: buildProfileSnapshot(context, collections),
    meta,
  };
}

function buildProfileSnapshot(context, collections) {
  const points = computePoints(collections.points);
  const dashboard = buildDashboardPayload(context, collections, buildMeta("profile_snapshot"));
  const member = dashboard.member;
  const status = normalizeProfileStatus(context.status, member);
  const tier = normalizeProfileTier(context.tier, context);
  const hasPaid = collections.payments.some(isVerifiedPayment);
  const accessLayer = status === "Guest" || status === "Expired" ? "MMD PRIVÉ" : (hasPaid || tier !== null ? "SĪGIL" : "MMD PRIVÉ");
  const effectiveTier = accessLayer === "SĪGIL" ? tier || "Standard" : null;
  const usernameParts = profileUsernameParts(context);
  const pointReviewStatus = profilePointsStatus(context);
  const telegramAccess = deriveProfileTelegramAccess(status, effectiveTier);
  const modelAccessScope = accessLayer === "SĪGIL" && status === "Active" ? "private_models_enabled" : "public_models_only";
  const sevenDaysExpiresAt = normalizeProfileDate(firstNonEmpty(context.token.seven_days_expires_at, context.memberRecord?.seven_days_expires_at));
  const upgradeOfferExpiresAt = normalizeProfileDate(firstNonEmpty(context.token.upgrade_offer_expires_at, context.memberRecord?.upgrade_offer_expires_at));
  const upgradeWindow = effectiveTier === "7 Days"
    ? {
        seven_days_expires_at: sevenDaysExpiresAt || null,
        upgrade_offer_expires_at: upgradeOfferExpiresAt || null,
        special_price_applies_within_window: true,
      }
    : null;

  return {
    client_id: firstNonEmpty(context.customer_key, context.memberstack_id, context.token.client_id, context.token.member_id) || null,
    client_name: context.display_name || null,
    username_display: usernameParts.display || null,
    username_key: usernameParts.key || null,
    nickname_part: usernameParts.nickname_part || null,
    id_code_part: usernameParts.id_code_part || null,
    access_layer: accessLayer,
    status,
    tier: effectiveTier,
    previous_tier: firstNonEmpty(context.token.previous_tier, context.memberRecord?.previous_tier) || null,
    package_type: firstNonEmpty(context.token.package_type, context.token.package_code, context.memberRecord?.package_type) || null,
    member_since: normalizeProfileDate(firstNonEmpty(context.token.member_since, context.memberRecord?.member_since, context.memberRecord?.created_at)) || null,
    expires_at: normalizeProfileDate(firstNonEmpty(context.token.membership_expires_at, context.token.expires_at, context.memberRecord?.membership_expires_at)) || null,
    seven_days_expires_at: sevenDaysExpiresAt || null,
    upgrade_offer_expires_at: upgradeOfferExpiresAt || null,
    onboarding_assistant: buildOnboardingAssistant(context),
    points: {
      total: points.active_points,
      status: pointReviewStatus,
    },
    telegram_access: telegramAccess,
    model_access: {
      scope: modelAccessScope,
      note: "Depends on model visibility, points, availability, and system rules.",
    },
    upgrade_window: upgradeWindow,
    primary_cta: deriveProfilePrimaryCta(status, effectiveTier, pointReviewStatus),
  };
}

async function buildMemberIdAvailabilityPayload(url, env, context, meta) {
  const normalized = normalizeMemberIdParts({
    nickname_part: url.searchParams.get("nickname_part"),
    id_code_part: url.searchParams.get("id_code_part"),
    username_key: url.searchParams.get("username_key"),
  });
  if (!normalized.ok) {
    return { ok: false, available: false, error: normalized.error, meta };
  }
  const existing = await findExistingMemberId(env, normalized.username_key, context);
  return {
    ok: true,
    available: !existing,
    username_display: normalized.username_display,
    username_key: normalized.username_key,
    meta,
  };
}

async function confirmMemberId(body, env, context, collections, meta) {
  const normalized = normalizeMemberIdParts(body);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error, meta };
  }

  const existing = await findExistingMemberId(env, normalized.username_key, context);
  if (existing) {
    return {
      ok: false,
      error: "member_id_not_available",
      available: false,
      username_key: normalized.username_key,
      meta,
    };
  }

  const target = await findWritableMemberIdentityRecord(env, context);
  if (!target) {
    return {
      ok: false,
      error: "member_record_not_found",
      meta,
    };
  }

  await airtablePatchWithFallback(env, target.table, target.id, {
    username_display: normalized.username_display,
    username_key: normalized.username_key,
    nickname_part: normalized.nickname_part,
    id_code_part: normalized.id_code_part,
    username: normalized.username_key,
  });

  context.username = normalized.username_display;
  context.memberRecord = {
    ...(context.memberRecord || {}),
    username_display: normalized.username_display,
    username_key: normalized.username_key,
    nickname_part: normalized.nickname_part,
    id_code_part: normalized.id_code_part,
  };

  return {
    ok: true,
    available: true,
    username_display: normalized.username_display,
    username_key: normalized.username_key,
    profile: buildProfileSnapshot(context, collections),
    meta,
  };
}

function buildNextSessionPayload(collections, meta) {
  const nextSession = findNextUpcomingSession(collections.sessions, collections.payments);
  return {
    ok: true,
    session: nextSession ? mapNextSession(nextSession) : { ...UPCOMING_SESSION_EMPTY_STATE },
    meta,
  };
}

function buildPaymentSummaryPayload(collections, meta) {
  const summary = summarizePayments(collections.sessions, collections.payments);
  return {
    ok: true,
    payments: summary,
    meta,
  };
}

function findNextUpcomingSession(sessions, payments) {
  const now = Date.now();
  const upcoming = sessions
    .filter((session) => session.date_ms && session.date_ms >= now)
    .sort((a, b) => a.date_ms - b.date_ms);

  if (!upcoming.length) return null;

  const next = upcoming[0];
  const relatedPayments = payments.filter((payment) => payment.session_id && payment.session_id === next.session_id);
  const paymentStatus = summarizeSessionPaymentStatus(relatedPayments, next.amount_total_thb);

  return {
    ...next,
    payment_status: paymentStatus.status,
    payment_badge: paymentStatus.badge,
    toast_payment: paymentStatus.toast,
    reminder_status: "pending",
    reminder_badge: "Awaiting Reminder",
    toast_reminder: "Reminder will be sent automatically.",
  };
}

function mapNextSession(session) {
  const dateIso = session.date || "";
  const date = dateIso || "";
  return {
    session_id: session.session_id || "",
    date,
    date_label: session.date_label || formatDateLabel(date),
    name: session.name || "Private Session",
    location: session.location || "Bangkok",
    venue: session.venue || "Private Venue",
    time: session.time || formatTime(date),
    meta: session.meta || buildSessionMeta(session),
    payment_status: session.payment_status || "pending",
    payment_badge: session.payment_badge || "No Payment Yet",
    reminder_status: session.reminder_status || "pending",
    reminder_badge: session.reminder_badge || "Awaiting Reminder",
    toast_payment: session.toast_payment || "Payment is pending verification.",
    toast_reminder: session.toast_reminder || "Reminder will be sent automatically.",
  };
}

function summarizePayments(sessions, payments) {
  const verifiedPayments = payments.filter(isVerifiedPayment);
  const paidAmount = verifiedPayments.reduce((sum, payment) => sum + payment.amount_thb, 0);
  const totalAmountFromSessions = sessions.reduce((sum, session) => sum + session.amount_total_thb, 0);
  const totalAmount = totalAmountFromSessions > 0 ? totalAmountFromSessions : paidAmount;
  const balanceAmount = Math.max(0, totalAmount - paidAmount);

  return {
    total_amount: totalAmount,
    paid_amount: paidAmount,
    balance_amount: balanceAmount,
    verified_payments_count: verifiedPayments.length,
    currency: "THB",
  };
}

function buildKenjiSurface(context) {
  return {
    enabled: true,
    mode: context.kenji_mode,
    persona: "kenji",
    surface: "member_dashboard",
    chat_path: "/api/member/kenji/chat",
    starters: [
      "คิวถัดไปของผมคืออะไร",
      "ตอนนี้ผมต้องทำอะไรต่อ",
      "สรุปสถานะการชำระเงินให้หน่อย",
    ],
  };
}

function computePoints(points) {
  const now = Date.now();
  let active = 0;

  for (const point of points) {
    const expiry = point.expires_at ? Date.parse(point.expires_at) : 0;
    if (expiry && Number.isFinite(expiry) && expiry < now) continue;
    active += point.points_delta;
  }

  return {
    active_points: Math.max(0, active),
  };
}

async function requestKenjiChatReply(
  env,
  {
    text,
    language,
    context,
    collections,
    dashboard,
    nextSession,
    payments,
  },
) {
  const token = toStr(env.INTERNAL_TOKEN);
  const url = toStr(env.CHAT_INTERNAL_URL);
  if ((!url && !env.CHAT_WORKER) || !token) {
    throw new Error("missing_chat_worker_env");
  }

  const memberId = context.memberstack_id || firstNonEmpty(context.token.member_id, context.token.memberstack_id) || "";
  const requestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": token,
    },
    body: JSON.stringify({
      channel: "web",
      assistant: "per_ai",
      persona: "kenji",
      language,
      tier: context.tier,
      user_type: "member",
      member_id: memberId,
      surface: "member_dashboard",
      text,
      memory: buildKenjiMemory(context, collections, dashboard, nextSession, payments),
      context: buildKenjiContext(dashboard, nextSession, payments),
    }),
  };

  const response = env.CHAT_WORKER
    ? await env.CHAT_WORKER.fetch(
        new Request("https://chat-worker.internal/v1/chat/internal", requestInit),
      )
    : await fetch(url, requestInit);

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !toStr(payload?.reply)) {
    throw new Error(`kenji_chat_error_${response.status || 500}`);
  }

  return {
    text: toStr(payload.reply),
    assistant: toStr(payload?.meta?.assistant || "per_ai") || "per_ai",
    persona: toStr(payload?.meta?.persona || "kenji") || "kenji",
    route_id: toStr(payload?.meta?.route_id),
    intent: toStr(payload?.meta?.intent),
    next_action: toStr(payload?.meta?.next_action),
  };
}

function buildKenjiMemory(context, collections, dashboard, nextSession, payments) {
  const points = computePoints(collections.points);
  const nextSessionActive = Boolean(nextSession?.session_id || nextSession?.date);
  return {
    surface: "member_dashboard",
    member_id: dashboard.member.member_id,
    member_name: dashboard.member.display_name,
    tier: toStr(context.tier).toLowerCase(),
    total_spend: payments.paid_amount,
    active_points: points.active_points,
    total_sessions: dashboard.member.total_sessions,
    dashboard_status: dashboard.member.dashboard_status,
    next_session_date: nextSessionActive ? toStr(nextSession.date) : "",
    next_session_date_label: nextSessionActive ? toStr(nextSession.date_label) : "",
    next_session_name: nextSessionActive ? toStr(nextSession.name) : "",
    next_session_payment_status: nextSessionActive ? toStr(nextSession.payment_status).toLowerCase() : "",
    next_session_reminder_status: nextSessionActive ? toStr(nextSession.reminder_status).toLowerCase() : "",
    payment_balance_amount: payments.balance_amount,
    payment_paid_amount: payments.paid_amount,
    payment_total_amount: payments.total_amount,
    payment_currency: payments.currency,
  };
}

function buildKenjiContext(dashboard, nextSession, payments) {
  return {
    surface: "member_dashboard",
    member: dashboard.member,
    next_session: nextSession,
    payments,
  };
}

function summarizeSessionPaymentStatus(payments, sessionTotal) {
  const paidAmount = payments.filter(isVerifiedPayment).reduce((sum, payment) => sum + payment.amount_thb, 0);

  if (paidAmount <= 0) {
    return {
      status: "pending",
      badge: "No Payment Yet",
      toast: "Payment is pending verification.",
    };
  }

  if (sessionTotal > 0 && paidAmount < sessionTotal) {
    return {
      status: "partial_verified",
      badge: "Deposit Verified",
      toast: "Deposit verified successfully.",
    };
  }

  return {
    status: "verified",
    badge: "Deposit Verified",
    toast: "Deposit verified successfully.",
  };
}

function isVerifiedPayment(payment) {
  return (
    VERIFIED_PAYMENT_STATUSES.has(payment.payment_status) ||
    VERIFIED_VERIFICATION_STATUSES.has(payment.verification_status)
  );
}

function shapeSession(record, env) {
  const fields = record?.fields || {};
  const rawDate = firstNonEmpty(
    atVal(fields, env.AT_SESSIONS__SERVICE_DATE),
    atVal(fields, "service_date"),
    atVal(fields, "job_date"),
    atVal(fields, "Date"),
    atVal(fields, "Service Date"),
  );
  const date = normalizeDate(rawDate);
  return {
    session_id: firstNonEmpty(
      atVal(fields, env.AT_SESSIONS__SESSION_ID),
      atVal(fields, "session_id"),
      atVal(fields, "Session ID"),
      record?.id,
    ) || "",
    date,
    date_ms: date ? Date.parse(date) : 0,
    date_label: formatDateLabel(date),
    name: firstNonEmpty(
      atVal(fields, "session_name"),
      atVal(fields, "job_name"),
      atVal(fields, "name"),
      atVal(fields, "Work Type"),
      atVal(fields, "work_type"),
      atVal(fields, env.AT_SESSIONS__PACKAGE_CODE),
      atVal(fields, "package_code"),
    ) || "Private Session",
    location: firstNonEmpty(atVal(fields, "location"), atVal(fields, "city")) || "Bangkok",
    venue: firstNonEmpty(atVal(fields, "venue"), atVal(fields, "hotel"), atVal(fields, "place")) || "Private Venue",
    time: formatTime(date),
    meta: "",
    work_type: firstNonEmpty(
      atVal(fields, "work_type"),
      atVal(fields, "job_type"),
      atVal(fields, "Work Type"),
      atVal(fields, "Job Type"),
      atVal(fields, env.AT_SESSIONS__PACKAGE_CODE),
      atVal(fields, "package_code"),
    ),
    model_name: firstNonEmpty(atVal(fields, "model_name"), atVal(fields, "Model Name")) || "",
    amount_total_thb: safeInt(
      firstNonEmpty(
        atVal(fields, "amount_total_thb"),
        atVal(fields, "amount_thb"),
        atVal(fields, env.AT_SESSIONS__AMOUNT_THB),
        atVal(fields, "Amount THB"),
      ),
    ),
  };
}

function shapePayment(record, env) {
  const fields = record?.fields || {};
  return {
    payment_ref: firstNonEmpty(
      atVal(fields, env.AT_PAYMENTS__PAYMENT_REF),
      atVal(fields, "payment_ref"),
      atVal(fields, "Payment Reference"),
    ) || "",
    amount_thb: safeInt(
      firstNonEmpty(
        atVal(fields, env.AT_PAYMENTS__AMOUNT),
        atVal(fields, "amount_thb"),
        atVal(fields, "Amount"),
      ),
    ),
    payment_status: toStr(
      firstNonEmpty(
        atVal(fields, env.AT_PAYMENTS__PAYMENT_STATUS),
        atVal(fields, "payment_status"),
        atVal(fields, "Payment Status"),
      ),
    ).toLowerCase(),
    verification_status: toStr(
      firstNonEmpty(
        atVal(fields, env.AT_PAYMENTS__VERIFICATION_STATUS),
        atVal(fields, "verification_status"),
        atVal(fields, "Verification Status"),
      ),
    ).toLowerCase(),
    session_id: firstNonEmpty(
      atVal(fields, env.AT_PAYMENTS__SESSION_ID),
      atVal(fields, "session_id"),
      atVal(fields, "Session ID"),
    ) || "",
  };
}

function shapePoint(record) {
  const fields = record?.fields || {};
  return {
    points_delta: safeInt(firstNonEmpty(atVal(fields, "points"), atVal(fields, "Points"))),
    expires_at: normalizeDate(firstNonEmpty(atVal(fields, "expires_at"), atVal(fields, "Expires At"))),
  };
}

async function airtableListByField(env, tableName, fieldName, fieldValue, maxRecords) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new Error("missing_airtable_env");
  }

  const params = new URLSearchParams();
  params.set("maxRecords", String(maxRecords || 100));
  params.set("filterByFormula", `{${fieldName}}='${encodeFormulaValue(fieldValue)}'`);

  const res = await fetch(
    `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`airtable_list_error_${res.status}:${JSON.stringify(payload)}`);
  }

  return Array.isArray(payload?.records) ? payload.records : [];
}

async function tryAirtableListByField(env, tableName, fieldName, fieldValue, maxRecords) {
  try {
    return await airtableListByField(env, tableName, fieldName, fieldValue, maxRecords);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (
      message.includes("INVALID_FILTER_BY_FORMULA") ||
      message.includes("Unknown field names") ||
      message.includes("INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND")
    ) {
      return [];
    }
    throw error;
  }
}

async function tryReadSignedToken(token, env) {
  const secret = getDashboardSecret(env);
  if (!secret) return { ok: false, expired: false };

  const parts = String(token).split(".");
  if (parts.length !== 2) return { ok: false, expired: false };

  try {
    const payload = await verifyTwoPartToken(token, secret);
    return { ok: true, token_payload: payload, expired: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (message === "expired_invite_token") {
      return { ok: false, expired: true };
    }
    return { ok: false, expired: false };
  }
}

function getSessionsTable(env) {
  return env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || "Sessions";
}

function getPaymentsTable(env) {
  return env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "payments";
}

function getPointsTable(env) {
  return env.AIRTABLE_TABLE_POINTS_LEDGER_ID || env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger";
}

function tokenExpiryMs(tokenPayload, token) {
  const payload = tokenPayload && typeof tokenPayload === "object" ? tokenPayload : {};
  const exp = payload.exp;
  if (Number.isFinite(exp)) return Number(exp) * 1000;

  const expiresAt = firstNonEmpty(payload.expires_at, payload.customer_invite_expires_at, payload.membership_expires_at);
  if (expiresAt) {
    const expiresMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresMs)) return expiresMs;
  }

  return decodeJwtExp(token);
}

function decodeJwtExp(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return 0;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    if (Number.isFinite(payload?.exp)) return Number(payload.exp) * 1000;
  } catch {
    return 0;
  }

  return 0;
}

async function verifyTwoPartToken(token, secret) {
  const parts = String(token).split(".");
  if (parts.length !== 2) throw new Error("invalid_token_format");

  const [encodedPayload, signature] = parts;
  const expected = await signValue(encodedPayload, secret);
  if (signature !== expected) throw new Error("invalid_token_signature");

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  const now = Math.floor(Date.now() / 1000);
  if (Number(payload?.exp || 0) > 0 && Number(payload.exp) <= now) {
    throw new Error("expired_invite_token");
  }
  return payload;
}

async function signTwoPartToken(payload, secret) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

async function signValue(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = String(input).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function getDashboardSecret(env) {
  return toStr(env.CONFIRM_KEY || env.INTERNAL_TOKEN);
}

function makeDashboardError(code, message, status, retryable, meta = buildMeta(newRequestId())) {
  return {
    ok: false,
    error: {
      code,
      message,
      status,
      retryable,
    },
    meta,
  };
}

function dashboardErrorResponse(body) {
  return json(body, body?.error?.status || 500);
}

function buildMeta(requestId) {
  return {
    request_id: requestId,
    ts: new Date().toISOString(),
  };
}

function newRequestId() {
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildSessionMeta(session) {
  return [session.location || "Bangkok", session.venue || "Private Venue", session.time || ""]
    .filter(Boolean)
    .join(" · ");
}

function normalizeDate(value) {
  const raw = toStr(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function formatDateLabel(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  })
    .format(parsed)
    .toUpperCase();
}

function formatTime(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(parsed);
}

function normalizeKenjiLanguage(language, text) {
  const requested = toStr(language).toLowerCase();
  if (requested === "th" || requested === "thai") return "th";
  if (requested === "en" || requested === "english") return "en";
  return hasThaiText(text) ? "th" : "en";
}

function hasThaiText(value) {
  return /[\u0E00-\u0E7F]/.test(toStr(value));
}

function renderMemberDashboardPreviewPage({ method, dashboard, nextSession, payments, token }) {
  const initialState = {
    dashboard,
    nextSession,
    payments,
    token,
  };

  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Member Dashboard Preview</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: rgba(15, 23, 42, 0.76);
        --panel-strong: rgba(15, 23, 42, 0.92);
        --line: rgba(148, 163, 184, 0.24);
        --text: #e5eefc;
        --muted: #94a3b8;
        --accent: #f59e0b;
        --accent-soft: rgba(245, 158, 11, 0.18);
        --accent-2: #38bdf8;
        --ok: #34d399;
        --warn: #fb7185;
        --shadow: 0 24px 80px rgba(15, 23, 42, 0.35);
        --radius: 22px;
        font-family: "SF Pro Display", "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 32%),
          radial-gradient(circle at top right, rgba(245, 158, 11, 0.18), transparent 28%),
          linear-gradient(180deg, #0f172a 0%, #111827 52%, #020617 100%);
      }
      .shell {
        width: min(1180px, calc(100vw - 32px));
        margin: 24px auto 40px;
      }
      .hero, .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        backdrop-filter: blur(18px);
        box-shadow: var(--shadow);
      }
      .hero {
        border-radius: 30px;
        padding: 28px;
        display: grid;
        gap: 20px;
      }
      .hero-top {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }
      .eyebrow {
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-size: 12px;
        color: var(--accent-2);
        margin-bottom: 12px;
      }
      h1 {
        margin: 0;
        font-size: clamp(28px, 4vw, 46px);
        line-height: 0.98;
      }
      .subtext {
        margin: 10px 0 0;
        max-width: 680px;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.6;
      }
      .hero-badges, .stat-grid, .action-row, .starter-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .badge, .stat, .starter, .ghost-button, .send-button {
        border-radius: 999px;
        border: 1px solid var(--line);
      }
      .badge {
        padding: 10px 14px;
        background: rgba(15, 23, 42, 0.54);
        color: var(--text);
        font-size: 13px;
      }
      .badge strong {
        color: white;
      }
      .layout {
        margin-top: 20px;
        display: grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 20px;
      }
      .column {
        display: grid;
        gap: 20px;
      }
      .panel {
        border-radius: var(--radius);
        padding: 20px;
      }
      .panel h2 {
        margin: 0 0 6px;
        font-size: 20px;
      }
      .panel p.section-note {
        margin: 0 0 18px;
        color: var(--muted);
        font-size: 14px;
      }
      .stat {
        min-width: 140px;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.03);
      }
      .stat-label {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }
      .stat-value {
        margin-top: 8px;
        font-size: 24px;
        font-weight: 600;
      }
      .session-card, .payment-card {
        display: grid;
        gap: 10px;
        padding: 18px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.03);
      }
      .session-title, .payment-title {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }
      .session-name, .payment-name {
        font-size: 20px;
        font-weight: 600;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        border-radius: 999px;
        font-size: 13px;
        background: var(--accent-soft);
        color: #fde68a;
      }
      .pill.ok {
        background: rgba(52, 211, 153, 0.18);
        color: #a7f3d0;
      }
      .list-line {
        color: var(--muted);
        font-size: 14px;
      }
      .money-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .money-item {
        padding: 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.03);
      }
      .money-label {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      .money-value {
        margin-top: 10px;
        font-size: 24px;
        font-weight: 600;
      }
      .kenji-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }
      .kenji-avatar {
        width: 48px;
        height: 48px;
        border-radius: 16px;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(56, 189, 248, 0.22));
        border: 1px solid rgba(255, 255, 255, 0.12);
        font-weight: 700;
        letter-spacing: 0.08em;
      }
      .kenji-title {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .kenji-copy h2 {
        margin-bottom: 2px;
      }
      .kenji-copy span {
        color: var(--muted);
        font-size: 13px;
      }
      .starter-row {
        margin-bottom: 14px;
      }
      .starter, .ghost-button {
        background: transparent;
        color: var(--text);
        cursor: pointer;
        padding: 10px 14px;
      }
      .starter:hover, .ghost-button:hover {
        border-color: rgba(245, 158, 11, 0.45);
        background: rgba(245, 158, 11, 0.08);
      }
      .messages {
        min-height: 280px;
        max-height: 460px;
        overflow: auto;
        display: grid;
        gap: 12px;
        padding-right: 4px;
      }
      .message {
        padding: 14px 16px;
        border-radius: 18px;
        max-width: 88%;
        line-height: 1.55;
        font-size: 14px;
      }
      .message.user {
        margin-left: auto;
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.3), rgba(59, 130, 246, 0.2));
        border: 1px solid rgba(125, 211, 252, 0.18);
      }
      .message.kenji {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--line);
      }
      .composer {
        margin-top: 16px;
        display: grid;
        gap: 12px;
      }
      textarea {
        width: 100%;
        min-height: 110px;
        resize: vertical;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(2, 6, 23, 0.62);
        color: var(--text);
        padding: 16px;
        font: inherit;
      }
      textarea:focus {
        outline: none;
        border-color: rgba(56, 189, 248, 0.52);
        box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.12);
      }
      .action-row {
        justify-content: space-between;
        align-items: center;
      }
      .helper {
        color: var(--muted);
        font-size: 13px;
      }
      .send-button {
        cursor: pointer;
        border: 0;
        padding: 12px 18px;
        background: linear-gradient(135deg, var(--accent), #fb7185);
        color: #111827;
        font-weight: 700;
      }
      .status {
        margin-top: 10px;
        color: var(--muted);
        font-size: 13px;
        min-height: 18px;
      }
      .status.error {
        color: #fda4af;
      }
      @media (max-width: 980px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 720px) {
        .shell {
          width: min(100vw - 20px, 100%);
          margin: 12px auto 28px;
        }
        .hero, .panel {
          border-radius: 20px;
          padding: 18px;
        }
        .money-grid {
          grid-template-columns: 1fr;
        }
        .message {
          max-width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="hero-top">
          <div>
            <div class="eyebrow">Member Dashboard Preview</div>
            <h1 id="member-name">Loading...</h1>
            <p class="subtext" id="hero-copy">Preparing member continuity view and Kenji bridge.</p>
          </div>
          <div class="hero-badges" id="hero-badges"></div>
        </div>
        <div class="stat-grid" id="top-stats"></div>
      </section>

      <section class="layout">
        <div class="column">
          <section class="panel">
            <h2>Upcoming Session</h2>
            <p class="section-note">This is fed from the same member dashboard facade payload, not from raw truth workers in the browser.</p>
            <div class="session-card">
              <div class="session-title">
                <div>
                  <div class="session-name" id="session-name">No active session</div>
                  <div class="list-line" id="session-date">No upcoming session</div>
                </div>
                <div class="pill" id="payment-badge">No Payment Yet</div>
              </div>
              <div class="list-line" id="session-meta">Private route available when a new session is created</div>
              <div class="pill" id="reminder-badge">No Reminder Scheduled</div>
            </div>
          </section>

          <section class="panel">
            <h2>Payment Summary</h2>
            <p class="section-note">A quick view of total, paid, and balance amounts for the current member lane.</p>
            <div class="money-grid" id="money-grid"></div>
          </section>
        </div>

        <div class="column">
          <section class="panel">
            <div class="kenji-header">
              <div class="kenji-title">
                <div class="kenji-avatar">KJ</div>
                <div class="kenji-copy">
                  <h2>Kenji Continuity</h2>
                  <span id="kenji-mode">Dashboard-linked concierge</span>
                </div>
              </div>
              <button class="ghost-button" id="refresh-button" type="button">Refresh</button>
            </div>

            <div class="starter-row" id="starter-row"></div>
            <div class="messages" id="messages"></div>

            <form class="composer" id="chat-form">
              <textarea id="chat-input" placeholder="ถาม Kenji เรื่องคิวถัดไป, ยอดที่ต้องชำระ, หรือควรทำอะไรต่อ"></textarea>
              <div class="action-row">
                <div class="helper">The preview uses the same signed dashboard token and member context.</div>
                <button class="send-button" id="send-button" type="submit">Send to Kenji</button>
              </div>
            </form>
            <div class="status" id="status-line"></div>
          </section>
        </div>
      </section>
    </main>

    <script id="initial-state" type="application/json">${escapeScriptJson(initialState)}</script>
    <script>
      const state = JSON.parse(document.getElementById("initial-state").textContent);
      const dashboardPath = "/api/member/dashboard";
      const nextSessionPath = "/api/member/session/next";
      const paymentsPath = "/api/member/payments/summary";
      const kenjiPath = (state.dashboard.kenji && state.dashboard.kenji.chat_path) || "/api/member/kenji/chat";
      const token = state.token;
      const messages = [];

      const el = {
        memberName: document.getElementById("member-name"),
        heroCopy: document.getElementById("hero-copy"),
        heroBadges: document.getElementById("hero-badges"),
        topStats: document.getElementById("top-stats"),
        sessionName: document.getElementById("session-name"),
        sessionDate: document.getElementById("session-date"),
        sessionMeta: document.getElementById("session-meta"),
        paymentBadge: document.getElementById("payment-badge"),
        reminderBadge: document.getElementById("reminder-badge"),
        moneyGrid: document.getElementById("money-grid"),
        kenjiMode: document.getElementById("kenji-mode"),
        starterRow: document.getElementById("starter-row"),
        messages: document.getElementById("messages"),
        chatForm: document.getElementById("chat-form"),
        chatInput: document.getElementById("chat-input"),
        sendButton: document.getElementById("send-button"),
        statusLine: document.getElementById("status-line"),
        refreshButton: document.getElementById("refresh-button"),
      };

      function formatMoney(value, currency) {
        const amount = Number(value || 0);
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency || "THB",
          maximumFractionDigits: 0,
        }).format(amount);
      }

      function escapeHtml(value) {
        return String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function renderBadges(member) {
        const badges = [
          "<span class=\\"badge\\"><strong>Tier</strong> " + escapeHtml(member.tier || "STANDARD") + "</span>",
          "<span class=\\"badge\\"><strong>Status</strong> " + escapeHtml(member.status || "ACTIVE") + "</span>",
          "<span class=\\"badge\\"><strong>Concierge</strong> " + escapeHtml(member.concierge_status || "Kenji AI ready") + "</span>",
        ];
        el.heroBadges.innerHTML = badges.join("");
      }

      function renderStats(member) {
        const stats = [
          { label: "Points", value: String(member.points || 0) },
          { label: "Total Sessions", value: String(member.total_sessions || 0) },
          { label: "Identity", value: member.identity || member.display_name || "Member" },
        ];
        el.topStats.innerHTML = stats.map(function (item) {
          return "<div class=\\"stat\\"><div class=\\"stat-label\\">" + escapeHtml(item.label) + "</div><div class=\\"stat-value\\">" + escapeHtml(item.value) + "</div></div>";
        }).join("");
      }

      function renderSession(session) {
        const paymentVerified = String(session.payment_status || "").toLowerCase().includes("verified");
        el.sessionName.textContent = session.name || "No active session";
        el.sessionDate.textContent = session.date_label || "No upcoming session";
        el.sessionMeta.textContent = session.meta || "Private route available when a new session is created";
        el.paymentBadge.textContent = session.payment_badge || "No Payment Yet";
        el.paymentBadge.className = "pill" + (paymentVerified ? " ok" : "");
        el.reminderBadge.textContent = session.reminder_badge || "No Reminder Scheduled";
      }

      function renderPayments(payments) {
        const items = [
          { label: "Total", value: formatMoney(payments.total_amount, payments.currency) },
          { label: "Paid", value: formatMoney(payments.paid_amount, payments.currency) },
          { label: "Balance", value: formatMoney(payments.balance_amount, payments.currency) },
        ];
        el.moneyGrid.innerHTML = items.map(function (item) {
          return "<div class=\\"money-item\\"><div class=\\"money-label\\">" + escapeHtml(item.label) + "</div><div class=\\"money-value\\">" + escapeHtml(item.value) + "</div></div>";
        }).join("");
      }

      function renderStarters(kenji) {
        const starters = Array.isArray(kenji.starters) ? kenji.starters : [];
        el.starterRow.innerHTML = starters.map(function (text) {
          return "<button class=\\"starter\\" type=\\"button\\" data-starter=\\"" + escapeHtml(text) + "\\">" + escapeHtml(text) + "</button>";
        }).join("");
        Array.from(el.starterRow.querySelectorAll("[data-starter]")).forEach(function (button) {
          button.addEventListener("click", function () {
            el.chatInput.value = button.getAttribute("data-starter") || "";
            el.chatInput.focus();
          });
        });
      }

      function renderDashboard(data) {
        const member = data.dashboard.member;
        el.memberName.textContent = member.display_name || "Member Dashboard";
        el.heroCopy.textContent = member.concierge_status === "Kenji AI live"
          ? "Kenji is live on this dashboard lane and can continue with session, payment, and next-step context."
          : "Kenji is connected to the member dashboard facade and ready to continue the current member lane.";
        el.kenjiMode.textContent = "Mode: " + ((data.dashboard.kenji && data.dashboard.kenji.mode) || "demo");
        renderBadges(member);
        renderStats(member);
        renderSession(data.nextSession.session || {});
        renderPayments(data.payments.payments || {});
        renderStarters(data.dashboard.kenji || {});
      }

      function pushMessage(role, text) {
        messages.push({ role: role, text: text });
        el.messages.innerHTML = messages.map(function (item) {
          return "<div class=\\"message " + escapeHtml(item.role) + "\\">" + escapeHtml(item.text) + "</div>";
        }).join("");
        el.messages.scrollTop = el.messages.scrollHeight;
      }

      function setStatus(text, isError) {
        el.statusLine.textContent = text || "";
        el.statusLine.className = "status" + (isError ? " error" : "");
      }

      async function fetchJson(path, options) {
        const response = await fetch(path + "?t=" + encodeURIComponent(token), options);
        const data = await response.json().catch(function () { return null; });
        if (!response.ok || !data || data.ok === false) {
          const message = data && data.error && data.error.message
            ? data.error.message
            : data && data.error
              ? String(data.error)
              : "Request failed";
          throw new Error(message);
        }
        return data;
      }

      async function refreshDashboard() {
        setStatus("Refreshing dashboard context...");
        try {
          const fresh = await Promise.all([
            fetchJson(dashboardPath),
            fetchJson(nextSessionPath),
            fetchJson(paymentsPath),
          ]);
          state.dashboard = fresh[0];
          state.nextSession = fresh[1];
          state.payments = fresh[2];
          renderDashboard(state);
          setStatus("Dashboard refreshed.");
        } catch (error) {
          setStatus(error.message || "Refresh failed.", true);
        }
      }

      async function sendKenjiMessage(text) {
        pushMessage("user", text);
        setStatus("Kenji is replying...");
        el.sendButton.disabled = true;
        try {
          const data = await fetchJson(kenjiPath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text }),
          });
          pushMessage("kenji", data.reply || "Kenji is here.");
          setStatus("Kenji replied.");
        } catch (error) {
          pushMessage("kenji", "Kenji cannot reply right now.");
          setStatus(error.message || "Kenji is unavailable.", true);
        } finally {
          el.sendButton.disabled = false;
        }
      }

      el.chatForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const text = el.chatInput.value.trim();
        if (!text) return;
        el.chatInput.value = "";
        await sendKenjiMessage(text);
      });

      el.refreshButton.addEventListener("click", refreshDashboard);

      renderDashboard(state);
      pushMessage("kenji", "Kenji is connected to this dashboard preview. Ask about your next session, payment status, or what to do next.");
      setStatus("Preview ready.");
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function normalizeProfileStatus(value, member) {
  const raw = toStr(value || member?.status).toLowerCase().replace(/[_-]+/g, " ");
  if (!raw || raw === "guest") return "Guest";
  if (raw.includes("expired") || raw.includes("inactive") || raw.includes("cancel")) return "Expired";
  if (raw.includes("pending")) return "Pending Review";
  return "Active";
}

function normalizeProfileTier(value, context) {
  const raw = firstNonEmpty(value, context.token.current_tier, context.token.target_tier).toLowerCase().replace(/[_-]+/g, " ");
  if (!raw) return null;
  if (raw.includes("7") || raw.includes("seven")) return "7 Days";
  if (raw.includes("standard")) return "Standard";
  if (raw.includes("premium")) return "Premium";
  if (raw === "vip" || raw.includes(" vip")) return "VIP";
  if (raw.includes("svip")) return "SVIP";
  if (raw.includes("black")) return "Black Card";
  return null;
}

function profileUsernameParts(context) {
  const display = firstNonEmpty(
    context.memberRecord?.username_display,
    context.memberRecord?.customFields?.username_display,
    context.token.username_display,
  );
  const key = firstNonEmpty(
    context.memberRecord?.username_key,
    context.memberRecord?.customFields?.username_key,
    context.token.username_key,
  );
  const nicknamePart = firstNonEmpty(
    context.memberRecord?.nickname_part,
    context.memberRecord?.customFields?.nickname_part,
    context.token.nickname_part,
  );
  const idCodePart = firstNonEmpty(
    context.memberRecord?.id_code_part,
    context.memberRecord?.customFields?.id_code_part,
    context.token.id_code_part,
  );
  if (display || key || (nicknamePart && idCodePart)) {
    return {
      display: display || `${nicknamePart} ${idCodePart}`.trim() || key,
      key: key || `${nicknamePart}${idCodePart}`.replace(/\s+/g, ""),
      nickname_part: nicknamePart,
      id_code_part: idCodePart,
    };
  }
  const legacy = toStr(context.username).replace(/^@+/, "");
  return {
    display: legacy,
    key: legacy.replace(/[^a-z0-9]/gi, "").toLowerCase(),
    nickname_part: "",
    id_code_part: "",
  };
}

function profilePointsStatus(context) {
  const raw = firstNonEmpty(
    context.token.points_status,
    context.token.point_status,
    context.memberRecord?.points_status,
    context.memberRecord?.customFields?.points_status,
  ).toLowerCase();
  return raw.includes("verified") || raw.includes("approved") ? "verified" : "pending_review";
}

function deriveProfileTelegramAccess(status, tier) {
  if (status === "Expired") {
    return { standard_group: "retained_if_policy_allows", premium_group: "removed" };
  }
  if (tier === "7 Days") {
    return { standard_group: "active", premium_group: "active" };
  }
  if (tier === "Standard") {
    return { standard_group: "active", premium_group: "not_included" };
  }
  if (["Premium", "VIP", "Black Card", "SVIP"].includes(tier)) {
    return { standard_group: "active", premium_group: "active" };
  }
  return { standard_group: "inactive", premium_group: "inactive" };
}

function buildOnboardingAssistant(context) {
  const rawKey = firstNonEmpty(
    context.token.onboarding_assistant_key,
    context.token.onboarding_assistant,
    context.memberRecord?.onboarding_assistant,
    context.memberRecord?.customFields?.onboarding_assistant,
  ).toLowerCase();
  const key = ["hito", "hiro", "hima", "hiei"].includes(rawKey) ? rawKey : "";
  return {
    selected: Boolean(key),
    character_key: key,
    display_name: key ? key[0].toUpperCase() + key.slice(1) : "",
    source: firstNonEmpty(context.token.onboarding_assistant_source, context.memberRecord?.onboarding_assistant_source) || "/trust/inme",
    status: key ? "active" : "not_selected",
  };
}

function deriveProfilePrimaryCta(status, tier, pointStatus) {
  if (pointStatus === "pending_review") return { label: "Check Status", href: "/member/dashboard" };
  if (status === "Guest") return { label: "Start Membership", href: "/trust/inme" };
  if (status === "Expired") return { label: "Renew Access", href: "/pay/renewal" };
  if (tier === "7 Days") return { label: "Upgrade Tier", href: "/pay/renewal" };
  return { label: "Open Dashboard", href: "/member/dashboard" };
}

function normalizeProfileDate(value) {
  const raw = toStr(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().slice(0, 10);
}

function normalizeMemberIdParts(input) {
  const rawKey = toStr(input?.username_key).toLowerCase();
  let nicknamePart = toStr(input?.nickname_part).toLowerCase();
  let idCodePart = toStr(input?.id_code_part).toLowerCase();
  if (rawKey && !/^[a-z]{3,10}$/.test(rawKey)) {
    return { ok: false, error: "username_key_invalid" };
  }
  const key = rawKey;
  if ((!nicknamePart || !idCodePart) && key.length >= 3) {
    nicknamePart = key.slice(0, -2);
    idCodePart = key.slice(-2);
  }
  if (!/^[a-z]{1,8}$/.test(nicknamePart)) {
    return { ok: false, error: "nickname_part_invalid" };
  }
  if (!/^[a-z]{2}$/.test(idCodePart)) {
    return { ok: false, error: "id_code_part_invalid" };
  }
  return {
    ok: true,
    nickname_part: nicknamePart,
    id_code_part: idCodePart,
    username_display: `${nicknamePart} ${idCodePart}`,
    username_key: `${nicknamePart}${idCodePart}`,
  };
}

async function findExistingMemberId(env, usernameKey, context) {
  const tables = [getMembersTable(env), getClientsTable(env)];
  const usernameDisplay = `${usernameKey.slice(0, -2)} ${usernameKey.slice(-2)}`;
  const candidates = [
    ["username_key", usernameKey],
    ["username", usernameKey],
    ["member_username", usernameKey],
    ["Member Username", usernameKey],
    ["username_display", usernameDisplay],
    ["Member ID", usernameDisplay],
    ["member_id", usernameKey],
  ];
  for (const tableName of tables) {
    for (const [field, value] of candidates) {
      const rows = await tryAirtableListByField(env, tableName, field, value, 2);
      const existing = rows.find((row) => !isSameIdentityRecord(row, context));
      if (existing) return existing;
    }
  }
  return null;
}

function isSameIdentityRecord(row, context) {
  const fields = row?.fields || {};
  const recordMemberstackId = firstNonEmpty(atVal(fields, "memberstack_id"), atVal(fields, "Memberstack ID"));
  const recordEmail = firstNonEmpty(atVal(fields, "email"), atVal(fields, "Email"));
  const recordCustomerKey = firstNonEmpty(atVal(fields, "customer_key"), atVal(fields, "client_id"));
  if (recordMemberstackId && recordMemberstackId === context.memberstack_id) return true;
  if (recordEmail && recordEmail.toLowerCase() === context.member_email.toLowerCase()) return true;
  if (recordCustomerKey && recordCustomerKey === context.customer_key) return true;
  return false;
}

async function findWritableMemberIdentityRecord(env, context) {
  const identifiers = buildIdentifiers(context);
  for (const tableName of [getMembersTable(env), getClientsTable(env)]) {
    for (const identifier of identifiers) {
      const rows = await tryAirtableListByField(env, tableName, identifier.field, identifier.value, 1);
      if (rows[0]?.id) return { table: tableName, id: rows[0].id };
    }
  }
  return null;
}

async function airtablePatchWithFallback(env, tableName, recordId, fields) {
  const fallbacks = [
    fields,
    {
      username_display: fields.username_display,
      username_key: fields.username_key,
      nickname_part: fields.nickname_part,
      id_code_part: fields.id_code_part,
    },
    {
      username: fields.username,
    },
  ];
  let lastError = null;
  for (const candidate of fallbacks) {
    try {
      return await airtablePatch(env, tableName, recordId, candidate);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error || "");
      if (!message.includes("Unknown field names") && !message.includes("INVALID_VALUE_FOR_COLUMN")) throw error;
    }
  }
  throw lastError || new Error("airtable_patch_failed");
}

async function airtablePatch(env, tableName, recordId, fields) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new Error("missing_airtable_env");
  }
  const res = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields, typecast: true }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`airtable_patch_error_${res.status}:${JSON.stringify(payload)}`);
  return payload;
}

function getMembersTable(env) {
  return env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || "Members";
}

function getClientsTable(env) {
  return env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || "Clients";
}

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function uppercaseLabel(value) {
  return toStr(value).replace(/_/g, " ").trim().toUpperCase();
}

function normalizeUsername(value) {
  const raw = toStr(value);
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function firstLetter(value) {
  const raw = toStr(value);
  return raw ? raw[0].toUpperCase() : "M";
}

function slugify(value) {
  return toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

function safeInt(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function atVal(obj, key) {
  if (!obj || !key) return "";
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : "";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const clean = toStr(value);
    if (clean) return clean;
  }
  return "";
}

function toStr(value) {
  return value == null ? "" : String(value).trim();
}

function encodeFormulaValue(value) {
  return String(value || "").replace(/'/g, "\\'");
}
