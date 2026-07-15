// admin-worker/src/dashboard-worker.js
// =========================================================
// Admin dashboard wrapper
//
// Purpose:
// - Add GET /v1/admin/dashboard without touching the large core router.
// - Delegate every other request to the existing admin-worker implementation.
// - Keep the dashboard endpoint read-only and safe for Webflow.
// =========================================================

import coreWorker from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DASHBOARD_PATH = "/v1/admin/dashboard";
const MEMBER_DASHBOARD_PATH = "/v1/member/dashboard";
const SAFE_MEMBER_QUERY_KEYS = ["t", "code", "promo", "source", "invite"];
const ACTIVE_STATES = new Set(["active", "approved", "valid"]);
const EXPIRED_STATES = new Set(["expired", "inactive", "ended"]);
const PENDING_STATES = new Set(["pending", "pending_review", "review", "awaiting_verification", "proof_uploaded", "under_review"]);
const INVALID_STATES = new Set(["invalid", "invalid_token", "invalid_link", "token_invalid", "not_found", "unauthorized"]);

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = normalizePathname(url.pathname);
    const method = req.method.toUpperCase();
    const cors = corsHeaders(req, env);

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (path === MEMBER_DASHBOARD_PATH) {
      if (method !== "GET") {
        return withCors(json({ ok: false, error: "method_not_allowed" }, 405), cors);
      }

      return withCors(await handleMemberDashboard(req, env, url), cors);
    }

    if (path === DASHBOARD_PATH) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(json({ ok: false, error: "origin_not_allowed" }, 403), cors);
      }

      if (!isAuthed(req, env)) {
        return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
      }

      if (method !== "GET") {
        return withCors(json({ ok: false, error: "method_not_allowed" }, 405), cors);
      }

      return withCors(json(await buildAdminDashboard(env)), cors);
    }

    return coreWorker.fetch(req, env, ctx);
  },
};

async function handleMemberDashboard(req, env, url) {
  const token = str(url.searchParams.get("t"));
  if (!token) return invalidMemberDashboardLink();

  try {
    const data = await buildMemberDashboard(env, url, token);
    if (!data) return invalidMemberDashboardLink();
    return json({ ok: true, data });
  } catch (error) {
    return json({
      ok: false,
      state: "load_error",
      message: "ไม่สามารถโหลดข้อมูลสมาชิกได้ครับ",
      error: "load_error",
    }, 502);
  }
}

function invalidMemberDashboardLink() {
  return json({
    ok: false,
    state: "invalid_link",
    message: "ไม่พบลิงก์ส่วนตัวครับ",
  }, 404);
}

async function buildMemberDashboard(env, url, token) {
  const [
    authSessions,
    authIdentities,
    members,
    entitlements,
    payments,
    sessions,
    pointsLedger,
    renewals,
  ] = await Promise.all([
    airtableList(env, env.AIRTABLE_TABLE_AUTH_SESSIONS || "MMD — Auth Sessions", 100),
    airtableList(env, env.AIRTABLE_TABLE_AUTH_IDENTITIES || "MMD — Auth Identities", 100),
    airtableList(env, env.AIRTABLE_TABLE_MEMBERS || "Members", 100),
    airtableList(env, env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || "MMD — Member Entitlements", 100),
    airtableList(env, env.AIRTABLE_TABLE_PAYMENTS || "Payments", 100),
    airtableList(env, env.AIRTABLE_TABLE_SESSIONS || "Sessions", 100),
    airtableList(env, env.AIRTABLE_TABLE_POINTS_LEDGER || "MMD — Points Ledger", 100),
    airtableList(env, env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || "MMD — LIFF Renewal Sessions", 50),
  ]);

  const authSession = authSessions.find((record) => {
    const fields = record.fields || {};
    if (!fieldEquals(fields, token, ["t", "token", "session_token", "link_token", "access_token", "session_id"])) return false;
    if (firstText(fields.revoked_at, fields.revokedAt)) return false;
    const expiresAt = parseDate(firstText(fields.expires_at, fields.expire_at, fields.expiry));
    return !expiresAt || expiresAt.getTime() > Date.now();
  });

  if (!authSession) return null;

  const sessionFields = authSession.fields || {};
  const identity = findIdentity(authIdentities, sessionFields);
  const identityFields = identity?.fields || {};
  const identityContext = buildIdentityContext(sessionFields, identityFields);
  const member = findMatchingRecord(members, identityContext);
  const memberFields = member?.fields || {};
  const entitlement = chooseEntitlement(entitlements.filter((record) => matchesIdentity(record.fields || {}, identityContext)));
  const entitlementFields = entitlement?.fields || {};
  const latestSession = chooseLatest(sessions.filter((record) => matchesIdentity(record.fields || {}, identityContext)), ["created_at", "updated_at", "start_time", "scheduled_at"]);
  const latestPayment = chooseLatest(payments.filter((record) => matchesIdentity(record.fields || {}, identityContext)), ["created_at", "updated_at", "paid_at", "verified_at"]);
  const renewal = chooseLatest(renewals.filter((record) => matchesIdentity(record.fields || {}, identityContext)), ["created_at", "updated_at"]);

  const dashboardState = resolveDashboardState({ entitlementFields, paymentFields: latestPayment?.fields || {}, sessionFields: latestSession?.fields || {} });
  const tier = firstText(entitlementFields.tier, entitlementFields.package_code, entitlementFields.min_tier, memberFields.tier, memberFields.package_code, memberFields.member_tier);
  const expiresAt = firstText(entitlementFields.expire_at, entitlementFields.expires_at, entitlementFields.end_date, memberFields.expires_at, memberFields.expire_at);
  const accessStatus = firstText(entitlementFields.access_status, entitlementFields.status, entitlementFields.member_status, dashboardState);
  const selectedGuide = firstText(memberFields.selected_guide, memberFields.guide, identityFields.selected_guide, "");
  const latestSessionFields = latestSession?.fields || {};
  const latestPaymentFields = latestPayment?.fields || {};
  const renewalFields = renewal?.fields || {};
  const sessionId = firstText(latestSessionFields.session_id, latestSessionFields.sid, latestSessionFields.job_id, latestSession?.id);
  const paymentRef = firstText(latestPaymentFields.payment_ref, latestPaymentFields.ref, latestSessionFields.payment_ref);

  return {
    dashboard_state: dashboardState,
    member: {
      display_name: firstText(memberFields.display_name, memberFields.mmd_client_name, memberFields.name, identityFields.display_name, identityFields.line_display_name, "สมาชิก MMD"),
      tier: tier || null,
      status: firstText(memberFields.status, memberFields.member_status, entitlementFields.member_status, dashboardState),
      expires_at: expiresAt || null,
    },
    access: {
      status: normalizeDashboardState(accessStatus),
      tier: tier || null,
      expire_label: formatExpireLabel(expiresAt),
      model_access: normalizeModelAccess(entitlementFields),
    },
    points: buildPoints(pointsLedger.filter((record) => matchesIdentity(record.fields || {}, identityContext)), memberFields),
    session: {
      session_id: sessionId || null,
      state: firstText(latestSessionFields.state, latestSessionFields.session_state, null),
      status: firstText(latestSessionFields.status, latestSessionFields.job_status, null),
      payment_status: firstText(latestSessionFields.payment_status, null),
      payment_ref: paymentRef || null,
    },
    payment: {
      status: firstText(latestPaymentFields.verification_status, latestPaymentFields.payment_status, latestPaymentFields.status, null),
      payment_ref: paymentRef || null,
    },
    renewal: {
      status: firstText(renewalFields.status, renewalFields.renewal_status, null),
    },
    guide: {
      selected_guide: selectedGuide || null,
    },
    actions: buildMemberDashboardActions(url, sessionId),
    updates: [],
  };
}

function findIdentity(records, sessionFields) {
  const identityId = firstText(sessionFields.identity_id, sessionFields.auth_identity_id, sessionFields.identity);
  if (identityId) {
    const byId = records.find((record) => record.id === identityId || fieldEquals(record.fields || {}, identityId, ["identity_id", "auth_identity_id"]));
    if (byId) return byId;
  }
  const context = buildIdentityContext(sessionFields, {});
  return findMatchingRecord(records, context);
}

function buildIdentityContext(...sources) {
  const out = {};
  for (const fields of sources) {
    out.member_id ||= firstText(fields.member_id, fields.mmd_member_id, fields.client_id);
    out.member_email ||= lower(firstText(fields.member_email, fields.email, fields.Email));
    out.memberstack_id ||= firstText(fields.memberstack_id, fields.memberstackId);
    out.line_user_id ||= firstText(fields.line_user_id, fields.lineUserId, fields["LINE User ID"]);
    out.telegram_user_id ||= firstText(fields.telegram_user_id, fields.telegram_id);
    out.telegram_username ||= lower(firstText(fields.telegram_username, fields.telegram));
  }
  return out;
}

function findMatchingRecord(records, identityContext) {
  return records.find((record) => matchesIdentity(record.fields || {}, identityContext));
}

function matchesIdentity(fields, identityContext) {
  const checks = [
    ["member_id", ["member_id", "mmd_member_id", "client_id"]],
    ["member_email", ["member_email", "email", "Email"]],
    ["memberstack_id", ["memberstack_id", "memberstackId"]],
    ["line_user_id", ["line_user_id", "lineUserId", "LINE User ID"]],
    ["telegram_user_id", ["telegram_user_id", "telegram_id"]],
    ["telegram_username", ["telegram_username", "telegram"]],
  ];

  return checks.some(([key, fieldNames]) => {
    const value = identityContext[key];
    if (!value) return false;
    return fieldEquals(fields, value, fieldNames);
  });
}

function fieldEquals(fields, expected, fieldNames) {
  const target = lower(expected);
  if (!target) return false;
  return fieldNames.some((name) => lower(firstText(fields[name])) === target);
}

function chooseEntitlement(records) {
  const sorted = [...records].sort((a, b) => stateRank(b.fields || {}) - stateRank(a.fields || {}));
  return sorted[0] || null;
}

function stateRank(fields) {
  const state = normalizeDashboardState(firstText(fields.access_status, fields.status, fields.member_status));
  if (state === "active" && !isExpired(fields)) return 4;
  if (state === "pending") return 3;
  if (state === "expired" || isExpired(fields)) return 2;
  return 1;
}

function chooseLatest(records, dateFields) {
  return [...records].sort((a, b) => recordTime(b, dateFields) - recordTime(a, dateFields))[0] || null;
}

function recordTime(record, dateFields) {
  const fields = record.fields || {};
  for (const name of dateFields) {
    const date = parseDate(fields[name]);
    if (date) return date.getTime();
  }
  return 0;
}

function resolveDashboardState({ entitlementFields, paymentFields, sessionFields }) {
  if (!entitlementFields || !Object.keys(entitlementFields).length) {
    const paymentState = normalizeDashboardState(firstText(paymentFields.verification_status, paymentFields.payment_status, paymentFields.status));
    const sessionState = normalizeDashboardState(firstText(sessionFields.state, sessionFields.status, sessionFields.payment_status));
    if (paymentState === "pending" || sessionState === "pending") return "pending";
    if (paymentState === "expired" || sessionState === "expired") return "expired";
    return "invalid_link";
  }

  if (isExpired(entitlementFields)) return "expired";
  const entitlementState = normalizeDashboardState(firstText(entitlementFields.access_status, entitlementFields.status, entitlementFields.member_status));
  if (entitlementState === "active") return "active";
  if (entitlementState === "expired") return "expired";
  if (entitlementState === "pending") return "pending";
  if (entitlementState === "invalid_link") return "invalid_link";
  return "pending";
}

function normalizeDashboardState(value) {
  const state = lower(value).replace(/[\s-]+/g, "_");
  if (ACTIVE_STATES.has(state)) return "active";
  if (EXPIRED_STATES.has(state)) return "expired";
  if (PENDING_STATES.has(state)) return "pending";
  if (INVALID_STATES.has(state)) return "invalid_link";
  return state || "pending";
}

function isExpired(fields) {
  const expiresAt = parseDate(firstText(fields.expire_at, fields.expires_at, fields.end_date, fields.expiry));
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

function buildPoints(records, memberFields) {
  let active = numeric(memberFields.points_balance, memberFields.active_points, memberFields.Points);
  let lifetime = numeric(memberFields.lifetime_points);
  let spendYear = numeric(memberFields.spend_year, memberFields.spend_this_year);
  let spendLifetime = numeric(memberFields.spend_lifetime, memberFields.total_spend);

  for (const record of records) {
    const fields = record.fields || {};
    const status = normalizeDashboardState(firstText(fields.status, fields.verification_status, fields.payment_status));
    if (status !== "active") continue;
    const points = numeric(fields.points, fields.points_delta, fields.amount_points);
    active += points;
    lifetime += Math.max(0, points);
    spendYear += numeric(fields.spend_year, fields.amount_thb);
    spendLifetime += numeric(fields.spend_lifetime, fields.amount_thb);
  }

  return { active, lifetime, spend_year: spendYear, spend_lifetime: spendLifetime };
}

function buildMemberDashboardActions(url, sessionId) {
  const query = safeMemberQuery(url.searchParams);
  return {
    renewal_url: appendSafeMemberQuery("/sigil/pay/renewal", query),
    guide_url: appendSafeMemberQuery("/sigil/guide", query),
    booking_url: appendSafeMemberQuery("/sigil/booking", query),
    payment_url: appendSafeMemberQuery("/confirm/payment-confirmation", query),
    session_url: sessionId ? appendSafeMemberQuery(`/sigil/session/${encodeURIComponent(sessionId)}`, query) : null,
  };
}

function safeMemberQuery(params) {
  const out = new URLSearchParams();
  for (const key of SAFE_MEMBER_QUERY_KEYS) {
    const value = str(params.get(key));
    if (value) out.set(key, value);
  }
  return out;
}

function appendSafeMemberQuery(path, params) {
  const rendered = params.toString();
  return rendered ? `${path}?${rendered}` : path;
}

function normalizeModelAccess(fields) {
  const raw = firstText(fields.model_access, fields.resource_key, fields.access_key, fields.package_code);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(str).filter(Boolean);
  return String(raw).split(",").map(str).filter(Boolean);
}

function formatExpireLabel(value) {
  const date = parseDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(date);
}

async function buildAdminDashboard(env) {
  const now = new Date();

  const [proofsResult, sessionsResult, membersResult] = await Promise.allSettled([
    airtableList(env, env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi", 30),
    airtableList(env, env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 30),
    airtableList(env, env.AIRTABLE_TABLE_MEMBERS || "members", 30),
  ]);

  const proofRecords = settledRecords(proofsResult);
  const sessionRecords = settledRecords(sessionsResult);
  const memberRecords = settledRecords(membersResult);

  const money = buildMoneyList(proofRecords);
  const jobs = buildJobList(sessionRecords, now);
  const members = buildMemberList(memberRecords, now);
  const boss = buildBossList({ money, jobs, members, proofRecords, sessionRecords, memberRecords });
  const todos = buildTodos({ money, jobs, members, boss });

  const counts = {
    urgent: todos.length + boss.length,
    payments: money.length,
    jobs: jobs.length,
    members: members.length,
  };

  const focus = buildFocus({ money, jobs, members, boss });

  return {
    ok: true,
    layer: "core",
    source: "admin-worker",
    generated_at: now.toISOString(),
    focus,
    counts,
    todos,
    jobs,
    money,
    members,
    boss,
    status: {
      admin: "พร้อม",
      payments: proofRecords.length ? "พร้อม" : statusFromResult(proofsResult),
      telegram: "พร้อม",
      data: dataMode([proofsResult, sessionsResult, membersResult]),
    },
    debug: {
      payments_loaded: proofRecords.length,
      sessions_loaded: sessionRecords.length,
      members_loaded: memberRecords.length,
      payment_source: resultReason(proofsResult),
      session_source: resultReason(sessionsResult),
      member_source: resultReason(membersResult),
    },
  };
}

function buildFocus({ money, jobs, members, boss }) {
  if (money.length) {
    return {
      title: "ตรวจเงินก่อน",
      text: `มีรายการรอตรวจ ${money.length} รายการ อย่าเพิ่งเปิดสิทธิ์หรือเริ่มงานที่ผูกกับยอดนี้จนกว่าจะตรวจเสร็จ`,
    };
  }

  if (boss.length) {
    return {
      title: "ส่งเคสให้ Boss Per ดู",
      text: `มีเคสพิเศษ ${boss.length} รายการที่ไม่ควรให้แอดมินตัดสินใจเอง`,
    };
  }

  if (jobs.length) {
    return {
      title: "เช็กงานวันนี้",
      text: `มีงาน ${jobs.length} รายการที่ควรดูสถานะ เวลา และการคอนเฟิร์ม`,
    };
  }

  if (members.length) {
    return {
      title: "ดูสมาชิกที่ต้องต่ออายุ",
      text: `มีสมาชิก ${members.length} รายการที่ควรตรวจสถานะหรือต่ออายุ`,
    };
  }

  return {
    title: "ยังไม่มีเรื่องด่วน",
    text: "ตอนนี้ยังไม่มีรายการที่ต้องรีบทำก่อน",
  };
}

function buildTodos({ money, jobs, members, boss }) {
  const todos = [];

  if (money[0]) {
    todos.push({
      title: `ตรวจเงินของ ${money[0].title}`,
      text: money[0].text,
      href: "/internal/admin/payments",
      icon: "฿",
      tag: "ตรวจเงิน",
      color: "red",
    });
  }

  if (jobs.find((job) => /telegram|รอ|pending|confirm/i.test(job.status || job.text))) {
    const job = jobs.find((item) => /telegram|รอ|pending|confirm/i.test(item.status || item.text));
    todos.push({
      title: `เช็กงาน ${job.id || job.title}`,
      text: job.text,
      href: job.href || "/internal/admin/jobs",
      icon: "+",
      tag: "เช็กงาน",
      color: "yellow",
    });
  }

  if (members[0]) {
    todos.push({
      title: `ดูสมาชิก ${members[0].title}`,
      text: members[0].text,
      href: members[0].href || "/internal/admin/member-intelligence",
      icon: "◇",
      tag: members[0].tag || "สมาชิก",
      color: "gold",
    });
  }

  if (boss[0]) {
    todos.push({
      title: boss[0].title,
      text: boss[0].text,
      href: boss[0].href || "/internal/admin/exceptions",
      icon: "!",
      tag: "Boss Per",
      color: "gold",
    });
  }

  return todos.slice(0, 4);
}

function buildMoneyList(records) {
  return records
    .filter((record) => {
      const fields = record.fields || {};
      const status = lower(fields.status || fields.verification_status || fields.payment_status);
      return !status || /pending|รอ|review|unmatched|new/.test(status);
    })
    .slice(0, 6)
    .map((record) => {
      const fields = record.fields || {};
      const name = firstText(fields.payer_name, fields.member_name, fields.client_name, fields.name, "ลูกค้า");
      const amount = amountText(fields.amount_thb, fields.amount, fields.total_thb);
      const ref = firstText(fields.payment_ref, fields.proof_id, fields.session_id, record.id);
      return {
        title: name,
        text: compactJoin([firstText(fields.note, fields.channel, "รอตรวจสลิป"), ref ? `ref ${ref}` : ""], " · "),
        amount,
        href: "/internal/admin/payments",
      };
    });
}

function buildJobList(records, now) {
  return records
    .slice(0, 6)
    .map((record, index) => {
      const fields = record.fields || {};
      const sessionId = firstText(fields.session_id, fields.sid, fields.job_id, record.id);
      const model = firstText(fields.model_name, fields["Model Name"], fields.model, fields.assigned_model, "ยังไม่ระบุ model");
      const customer = firstText(fields.member_name, fields.customer_name, fields.client_name, fields.name, "ลูกค้า");
      const status = firstText(fields.session_state, fields.status, fields.job_status, "กำลังดำเนินการ");
      const time = timeLabel(fields.start_time || fields.start_at || fields.scheduled_at || fields.date_time, now, index);
      return {
        id: sessionId,
        title: `${model} · ${customer}`,
        text: compactJoin([status, firstText(fields.service_type, fields.package_code, fields.work_type, "")], " · "),
        time,
        status: thaiStatus(status),
        progress: progressFromStatus(status),
        href: `/internal/admin/jobs/${encodeURIComponent(sessionId)}`,
      };
    });
}

function buildMemberList(records, now) {
  return records
    .filter((record) => {
      const fields = record.fields || {};
      const status = lower(fields.status || fields.member_status || fields.membership_status);
      const expiry = parseDate(fields.expire_at || fields.expiry || fields.end_date || fields.expires_at);
      const nearExpiry = expiry ? expiry.getTime() - now.getTime() < 1000 * 60 * 60 * 24 * 30 : false;
      return /expired|pending|hold|รอ|หมด/.test(status) || nearExpiry;
    })
    .slice(0, 6)
    .map((record) => {
      const fields = record.fields || {};
      const name = firstText(fields.name, fields.mmd_client_name, fields.nickname, fields.email, "สมาชิก");
      const tier = firstText(fields.tier, fields.package_code, fields.member_tier, "Member");
      const status = firstText(fields.status, fields.member_status, fields.membership_status, "ควรตรวจ");
      return {
        title: name,
        text: `${tier} · ${thaiStatus(status)}`,
        tag: memberTag(status),
        href: "/internal/admin/member-intelligence",
      };
    });
}

function buildBossList({ money, jobs, members, proofRecords, sessionRecords, memberRecords }) {
  const out = [];

  const blackCardMember = memberRecords.find((record) => /black|vip|svip/i.test(JSON.stringify(record.fields || {})));
  if (blackCardMember) {
    const fields = blackCardMember.fields || {};
    out.push({
      title: `Black Card Review · ${firstText(fields.name, fields.mmd_client_name, fields.email, "สมาชิก")}`,
      text: "มีข้อมูลระดับ VIP / Black Card ควรให้ Boss Per ตรวจเอง",
      href: "/internal/admin/black-card-review",
    });
  }

  const unmatchedPayment = proofRecords.find((record) => /unmatched|จับคู่ไม่ได้|missing/i.test(JSON.stringify(record.fields || {})));
  if (unmatchedPayment) {
    out.push({
      title: "ยอดโอนจับคู่ไม่ได้",
      text: "มีรายการจ่ายเงินที่ยังจับคู่กับ session หรือสมาชิกไม่ได้",
      href: "/internal/admin/payments",
    });
  }

  const exceptionJob = sessionRecords.find((record) => /exception|telegram missing|invalid|hold|blocked/i.test(JSON.stringify(record.fields || {})));
  if (exceptionJob) {
    out.push({
      title: "Job Exception",
      text: "มีงานที่สถานะไม่ปกติ ควรตรวจเองก่อนให้ flow ไปต่อ",
      href: "/internal/admin/exceptions",
    });
  }

  if (!out.length && (money.length > 3 || jobs.length > 5 || members.length > 3)) {
    out.push({
      title: "รายการวันนี้ค่อนข้างแน่น",
      text: "ควรไล่ตรวจเงิน งาน และสมาชิกที่ใกล้หมดอายุก่อน",
      href: "/internal/admin/dashboard",
    });
  }

  return out.slice(0, 5);
}

async function airtableList(env, tableName, maxRecords = 20) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !tableName) {
    throw new Error("missing_airtable_env");
  }

  const qs = new URLSearchParams({ maxRecords: String(maxRecords) });
  const res = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`airtable_${tableName}_${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data.records) ? data.records : [];
}

function settledRecords(result) {
  return result.status === "fulfilled" && Array.isArray(result.value) ? result.value : [];
}

function statusFromResult(result) {
  return result.status === "fulfilled" ? "พร้อม" : "ยังไม่มีข้อมูล";
}

function resultReason(result) {
  return result.status === "fulfilled" ? "ok" : String(result.reason?.message || result.reason || "unavailable");
}

function dataMode(results) {
  const ok = results.filter((item) => item.status === "fulfilled").length;
  if (ok === results.length) return "ข้อมูลจริง";
  if (ok > 0) return "ข้อมูลจริงบางส่วน";
  return "ยังไม่มีข้อมูล";
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const h = new Headers();

  if (!origin) {
    // server-to-server
  } else if (allow.length === 0 || allow.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }

  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Content-Type", "application/json");
  return h;
}

function withCors(res, cors) {
  const headers = new Headers(res.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(res.body, { status: res.status, headers });
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowedOrigin(req, env) {
  const allow = getAllowedOrigins(env);
  const origin = req.headers.get("Origin") || "";
  if (!origin) return true;
  if (!allow.length) return true;
  return allow.includes(origin);
}

function isAuthed(req, env) {
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (env.ADMIN_BEARER && bearer && bearer === env.ADMIN_BEARER) return true;
  if (env.INTERNAL_TOKEN && bearer && bearer === env.INTERNAL_TOKEN) return true;

  const confirmKey = str(req.headers.get("X-Confirm-Key") || "");
  if (env.CONFIRM_KEY && confirmKey && confirmKey === env.CONFIRM_KEY) return true;

  return false;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizePathname(pathname = "") {
  const normalized = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (normalized.length > 1) return normalized.replace(/\/$/, "");
  return normalized || "/";
}

function str(value) {
  return String(value == null ? "" : value).trim();
}

function lower(value) {
  return str(value).toLowerCase();
}

function firstText(...values) {
  for (const value of values) {
    const text = str(Array.isArray(value) ? value[0] : value);
    if (text) return text;
  }
  return "";
}

function compactJoin(values, separator) {
  return values.map(str).filter(Boolean).join(separator);
}

function amountText(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(num);
    }
  }
  return "-";
}

function numeric(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function parseDate(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeLabel(value, now, index) {
  const date = parseDate(value);
  if (date) {
    return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(date);
  }
  const fallback = new Date(now.getTime() + (index + 1) * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(fallback);
}

function thaiStatus(value) {
  const text = lower(value);
  if (/active|confirmed|ready|verified|paid|approved/.test(text)) return "พร้อม";
  if (/pending|wait|review|new|รอ/.test(text)) return "รอตรวจ";
  if (/expired|หมด/.test(text)) return "หมดอายุ";
  if (/hold|paused|blocked|พัก/.test(text)) return "พักไว้ก่อน";
  if (/travel|en_route|on_the_way/.test(text)) return "กำลังเดินทาง";
  if (/arrived/.test(text)) return "ถึงแล้ว";
  if (/working|live/.test(text)) return "กำลังทำงาน";
  if (/finished|done|closed/.test(text)) return "เสร็จแล้ว";
  return str(value) || "กำลังดำเนินการ";
}

function progressFromStatus(value) {
  const text = lower(value);
  if (/new|pending|wait|รอ/.test(text)) return 20;
  if (/confirmed|ready|approved/.test(text)) return 40;
  if (/travel|en_route|on_the_way/.test(text)) return 58;
  if (/arrived/.test(text)) return 72;
  if (/working|live/.test(text)) return 86;
  if (/finished|done|closed/.test(text)) return 100;
  return 35;
}

function memberTag(status) {
  const text = lower(status);
  if (/expired|หมด/.test(text)) return "ต่ออายุ";
  if (/pending|รอ/.test(text)) return "รอตรวจ";
  if (/hold|paused|พัก/.test(text)) return "พักไว้ก่อน";
  return "ดู";
}
