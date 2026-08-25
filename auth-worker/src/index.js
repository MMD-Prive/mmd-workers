// MMD / SIGIL Access Core
// First-party passwordless auth for Webflow + Cloudflare Workers + Airtable.
// Endpoints:
//   GET  /ping
//   POST /v1/auth/request-code
//   POST /v1/auth/verify-code
//   GET  /v1/auth/me
//   POST /v1/auth/logout
//   POST /v1/admin/access/grant

const DEFAULT_ALLOWED_ORIGINS = [
  "https://mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
];

const TIER_RANK = {
  guest: 0,
  guest_pass: 1,
  standard: 2,
  lite: 2,
  premium: 3,
  vip: 4,
  svip: 5,
  blackcard: 6,
};

const MEMBER_STATUS_RESOLVER_PATH = "/__internal/member-status/resolve";
const MEMBER_PROFILE_RESOLVER_PATH = "/__internal/member-profile/read";
const LIFF_IDENTITY_RESOLUTION_PURPOSE = "liff_identity_resolution";
const LIFF_MEMBER_PROFILE_PURPOSE = "liff_member_profile_read";
const MEMBER_STATUS_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const MEMBER_HISTORY_MAX_ITEMS = 50;
const MEMBER_STATUS_AIRTABLE_TIMEOUT_MS = 4000;
const MEMBER_STATUS_AIRTABLE_TIMEOUT_MIN_MS = 50;

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (path === "/health" || path === "/ping") {
        return json(request, env, 200, { ok: true, service: "mmd-auth-worker", time: nowIso() });
      }

      if (path === "/v1/auth/request-code" && request.method === "POST") {
        return handleRequestCode(request, env);
      }

      if (path === "/v1/auth/verify-code" && request.method === "POST") {
        return handleVerifyCode(request, env);
      }

      if (path === "/v1/auth/me" && request.method === "GET") {
        return handleMe(request, env);
      }

      if (path === "/v1/auth/logout" && request.method === "POST") {
        return handleLogout(request, env);
      }

      if (path === MEMBER_STATUS_RESOLVER_PATH && request.method === "POST") {
        return handleInternalMemberStatusResolve(request, env);
      }

      if (path === MEMBER_PROFILE_RESOLVER_PATH && request.method === "POST") {
        return handleInternalMemberProfileRead(request, env);
      }

      if (path === "/v1/admin/access/grant" && request.method === "POST") {
        return handleAdminGrant(request, env);
      }

      return json(request, env, 404, { ok: false, error: { code: "NOT_FOUND", message: "Route not found" } });
    } catch (error) {
      return json(request, env, 500, {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: safeErrorMessage(error) },
      });
    }
  },
};

async function handleRequestCode(request, env) {
  const body = await readJson(request);
  const identity = normalizeIdentity(body);
  if (!identity.ok) {
    return json(request, env, 400, { ok: false, error: { code: "IDENTITY_REQUIRED", message: "Provide email, phone, or telegram_username." } });
  }

  const member = await findOrCreateMember(env, identity);
  await upsertIdentity(env, member.member_id, identity);

  const code = randomDigits(toInt(env.AUTH_CODE_LENGTH, 6));
  const nonce = randomId("nonce");
  const codeHash = await hashSecret(env, `${identity.identity_key}:${nonce}:${code}`);
  const ttlMinutes = toInt(env.AUTH_CODE_TTL_MINUTES, 10);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  const codeId = randomId("code");
  await airtableCreate(env, table(env, "AUTH_LOGIN_CODES"), compactFields({
    code_id: codeId,
    member_id: member.member_id,
    identity_type: identity.type,
    identity_value: identity.value,
    identity_key: identity.identity_key,
    code_hash: codeHash,
    nonce,
    attempts: 0,
    expires_at: expiresAt,
    consumed_at: "",
    requester_ip_hash: await hashClientValue(env, getClientIp(request)),
    user_agent: request.headers.get("user-agent") || "",
    created_at: nowIso(),
  }));

  await audit(env, request, member.member_id, "auth.request_code", "success", { identity_type: identity.type, identity_key: identity.identity_key });

  const payload = {
    ok: true,
    delivery_mode: "manual_or_provider",
    identity_type: identity.type,
    expires_at: expiresAt,
    message: "Login code created. Connect email/SMS/Telegram delivery for production, or use dev_code while testing.",
  };

  if (String(env.MMD_AUTH_DEV_MODE || "").toLowerCase() === "true") {
    payload.dev_code = code;
  }

  return json(request, env, 200, payload);
}

async function handleVerifyCode(request, env) {
  const body = await readJson(request);
  const identity = normalizeIdentity(body);
  const code = String(body.code || "").trim();
  const codeLength = toInt(env.AUTH_CODE_LENGTH, 6);

  if (!identity.ok || !new RegExp(`^\\d{${codeLength}}$`).test(code)) {
    return json(request, env, 400, { ok: false, error: { code: "INVALID_CODE", message: `Provide a valid identity and ${codeLength}-digit code.` } });
  }

  const maxAttempts = toInt(env.AUTH_MAX_CODE_ATTEMPTS, 5);
  const records = await airtableList(env, table(env, "AUTH_LOGIN_CODES"), {
    filterByFormula: `AND({identity_key}=${formulaString(identity.identity_key)}, OR({consumed_at}=BLANK(), {consumed_at}=''))`,
    sort: [{ field: "created_at", direction: "desc" }],
    maxRecords: 10,
  });

  let matched = null;
  const now = Date.now();

  for (const record of records) {
    const fields = record.fields || {};
    const expiresAt = Date.parse(fields.expires_at || "");
    const attempts = Number(fields.attempts || 0);
    if (!expiresAt || expiresAt < now || attempts >= maxAttempts) continue;

    const expected = await hashSecret(env, `${identity.identity_key}:${fields.nonce}:${code}`);
    if (safeEqual(expected, String(fields.code_hash || ""))) {
      matched = record;
      break;
    }

    await airtableUpdate(env, table(env, "AUTH_LOGIN_CODES"), record.id, { attempts: attempts + 1 });
  }

  if (!matched) {
    await audit(env, request, "", "auth.verify_code", "error", { identity_key: identity.identity_key, reason: "no_match" });
    return json(request, env, 401, { ok: false, error: { code: "CODE_REJECTED", message: "Code is invalid, expired, or already used." } });
  }

  const matchedFields = matched.fields || {};
  await airtableUpdate(env, table(env, "AUTH_LOGIN_CODES"), matched.id, { consumed_at: nowIso() });

  const memberRecord = await findMemberById(env, matchedFields.member_id);
  if (!memberRecord) {
    return json(request, env, 404, { ok: false, error: { code: "MEMBER_NOT_FOUND", message: "Member record was not found." } });
  }

  const sessionToken = randomToken(32);
  const sessionHash = await hashSecret(env, `session:${sessionToken}`);
  const sessionId = randomId("sess");
  const expiresAt = new Date(Date.now() + toInt(env.AUTH_SESSION_TTL_DAYS, 30) * 24 * 60 * 60 * 1000).toISOString();

  await airtableCreate(env, table(env, "AUTH_SESSIONS"), compactFields({
    session_id: sessionId,
    member_id: matchedFields.member_id,
    session_hash: sessionHash,
    created_at: nowIso(),
    expires_at: expiresAt,
    revoked_at: "",
    ip_hash: await hashClientValue(env, getClientIp(request)),
    user_agent: request.headers.get("user-agent") || "",
  }));

  await updateMemberLastLogin(env, memberRecord);

  const profile = await buildProfile(env, memberRecord.fields || {});
  await audit(env, request, matchedFields.member_id, "auth.login", "success", { session_id: sessionId });

  return json(request, env, 200, { ok: true, profile, expires_at: expiresAt }, {
    "Set-Cookie": makeSessionCookie(env, sessionToken, expiresAt),
  });
}

async function handleMe(request, env) {
  const session = await readSession(request, env);
  if (!session.ok) {
    return json(request, env, 401, {
      ok: false,
      authenticated: false,
      error: { code: session.code || "SESSION_REQUIRED", message: session.message || "Login required." },
    });
  }

  return json(request, env, 200, {
    ok: true,
    authenticated: true,
    profile: session.profile,
    session: {
      expires_at: session.session_fields.expires_at,
    },
  });
}

async function handleLogout(request, env) {
  const cookie = getCookie(request, env.AUTH_COOKIE_NAME || "mmd_auth");
  if (cookie) {
    const sessionHash = await hashSecret(env, `session:${cookie}`);
    const records = await airtableList(env, table(env, "AUTH_SESSIONS"), {
      filterByFormula: `AND({session_hash}=${formulaString(sessionHash)}, OR({revoked_at}=BLANK(), {revoked_at}=''))`,
      maxRecords: 1,
    });
    if (records[0]) await airtableUpdate(env, table(env, "AUTH_SESSIONS"), records[0].id, { revoked_at: nowIso() });
  }

  return json(request, env, 200, { ok: true }, {
    "Set-Cookie": clearSessionCookie(env),
  });
}

// This endpoint is reachable only through the configured service binding and
// a dedicated resolver secret. It intentionally returns no member attributes.
async function handleInternalMemberStatusResolve(request, env) {
  if (!isInternalMemberStatusResolverRequest(request, env)) {
    return json(request, env, 404, { ok: false, error: { code: "NOT_FOUND", message: "Route not found" } });
  }

  const body = await readStrictJsonObject(request);
  const allowedKeys = new Set(["line_user_id", "purpose"]);
  if (!body || Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return json(request, env, 400, { ok: false, error: { code: "INVALID_RESOLVER_REQUEST", message: "A valid resolver request is required." } });
  }

  const lineUserId = String(body.line_user_id || "").trim();
  if (!isCanonicalLineUserId(lineUserId) || body.purpose !== LIFF_IDENTITY_RESOLUTION_PURPOSE) {
    return json(request, env, 400, { ok: false, error: { code: "INVALID_RESOLVER_REQUEST", message: "A valid resolver request is required." } });
  }

  try {
    const matches = await withMemberStatusAirtableDeadline(request, env, (signal) => findMemberRecordsByLineUserId(env, lineUserId, {
      signal,
      requireRecordsArray: true,
    }));
    if (matches.length > 1) {
      return json(request, env, 409, { ok: false, error: { code: "MEMBER_MATCH_AMBIGUOUS", message: "Member identity could not be resolved safely." } });
    }
    return json(request, env, 200, { ok: true, data: { member_exists: matches.length === 1 } });
  } catch {
    return json(request, env, 503, { ok: false, error: { code: "MEMBER_STATUS_RESOLVER_UNAVAILABLE", message: "Member identity could not be resolved safely." } });
  }
}

// Server-only LIFF readback. Identity comes from a LINE ID token verified by
// member-pages-worker and is sent only over the authenticated service binding.
// The response intentionally excludes email, phone, payment data, notes, risk,
// raw LINE identity, Airtable record IDs, and history older than one year.
async function handleInternalMemberProfileRead(request, env) {
  if (!isInternalMemberStatusResolverRequest(request, env)) {
    return json(request, env, 404, { ok: false, error: { code: "NOT_FOUND", message: "Route not found" } });
  }

  const body = await readStrictJsonObject(request);
  const allowedKeys = new Set(["line_user_id", "purpose"]);
  if (!body || Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return json(request, env, 400, { ok: false, error: { code: "INVALID_PROFILE_REQUEST", message: "A valid profile request is required." } });
  }

  const lineUserId = String(body.line_user_id || "").trim();
  if (!isCanonicalLineUserId(lineUserId) || body.purpose !== LIFF_MEMBER_PROFILE_PURPOSE) {
    return json(request, env, 400, { ok: false, error: { code: "INVALID_PROFILE_REQUEST", message: "A valid profile request is required." } });
  }

  try {
    const matches = await findMemberRecordsByLineUserId(env, lineUserId);
    if (matches.length > 1) {
      return json(request, env, 409, { ok: false, error: { code: "MEMBER_MATCH_AMBIGUOUS", message: "Member identity could not be resolved safely." } });
    }
    if (!matches.length) {
      return json(request, env, 200, { ok: true, data: { member_exists: false } });
    }

    const memberRecord = { ...matches[0], fields: normalizeMemberRecord(matches[0]) };
    const data = await buildLiffMemberProfile(env, memberRecord, lineUserId);
    return json(request, env, 200, { ok: true, data });
  } catch {
    return json(request, env, 503, { ok: false, error: { code: "MEMBER_PROFILE_RESOLVER_UNAVAILABLE", message: "Member profile is temporarily unavailable." } });
  }
}

async function buildLiffMemberProfile(env, memberRecord, lineUserId) {
  const fields = memberRecord.fields || {};
  const email = normalizeEmail(fields.email || fields[env.AIRTABLE_MEMBERS_EMAIL_FIELD || "Contact Email"] || "");
  const memberId = String(fields.member_id || "").trim();
  const cutoff = memberHistoryCutoff();
  const membershipStatus = normalizeCustomerMembershipStatus(fields[env.AIRTABLE_MEMBERS_STATUS_FIELD || "Membership Status"]);
  const [sessions, packageResult, pointsResult, payment] = await Promise.all([
    listMemberServiceHistory(env, { lineUserId, email, cutoff }),
    listMemberPackageHistory(env, { email, cutoff, membershipStatus }),
    listMemberPointsLedger(env, { email, cutoff }),
    listMemberPaymentHistory(env, { email, cutoff }),
  ]);
  const history = [...sessions, ...packageResult.history, ...pointsResult.history]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MEMBER_HISTORY_MAX_ITEMS);

  const profile = {
    display_name: safeCustomerText(
      fields[env.AIRTABLE_MEMBERS_DISPLAY_NAME_FIELD || "Full Name (Display)"]
        || fields[env.AIRTABLE_MEMBERS_NAME_FIELD || "Full Name"]
        || fields.name,
      120,
    ) || "สมาชิก MMD",
    tier: normalizeCustomerTier(fields[env.AIRTABLE_MEMBERS_TIER_FIELD || "Membership Tier"]),
    membership_status: membershipStatus,
    points: pointsResult.total,
    points_records_count: pointsResult.records_count,
    payment_status: payment.status,
    payment_history: payment.history,
    history_window: { from: cutoff, to: bangkokCalendarDate(), timezone: "Asia/Bangkok" },
    history,
  };
  if (packageResult.membership_expires_at) profile.membership_expires_at = packageResult.membership_expires_at;

  return {
    member_exists: true,
    member_id: memberId,
    profile,
  };
}

async function listMemberPaymentHistory(env, { email, cutoff }) {
  if (!email) return { status: "unavailable", history: [] };
  try {
    const records = await airtableList(env, table(env, "PAYMENTS"), {
      filterByFormula: `LOWER({member_email})=${formulaString(email)}`,
      sort: [{ field: "Created At", direction: "desc" }],
      maxRecords: 20,
    });
    const fields = records[0]?.fields || {};
    return {
      status: normalizeCustomerPaymentStatus(fields["Payment Status"], fields["Verification Status"]),
      history: records.map((record) => {
        const f = record.fields || {};
        const date = safeHistoryDate(f[env.AIRTABLE_PAYMENTS_HISTORY_DATE_FIELD || "Created At"] || f.created_at || f.paid_at);
        const status = normalizeCustomerPaymentStatus(f["Payment Status"], f["Verification Status"]);
        if (!date || date < cutoff || status !== "verified") return null;
        return {
          date,
          title: "Membership payment",
          status: "verified",
        };
      }).filter(Boolean),
    };
  } catch {
    return { status: "unavailable", history: [] };
  }
}

async function listMemberServiceHistory(env, { lineUserId, email, cutoff }) {
  const lineField = env.AIRTABLE_SESSIONS_LINE_USER_ID_FIELD || "line_user_id";
  const emailField = env.AIRTABLE_SESSIONS_EMAIL_FIELD || "email";
  const identity = [
    lineUserId ? `{${lineField}}=${formulaString(lineUserId)}` : "",
    email ? `LOWER({${emailField}})=${formulaString(email)}` : "",
  ].filter(Boolean);
  if (!identity.length) return [];
  const records = await airtableList(env, table(env, "SESSIONS"), {
    filterByFormula: identity.length === 1 ? identity[0] : `OR(${identity.join(",")})`,
    sort: [{ field: env.AIRTABLE_SESSIONS_HISTORY_DATE_FIELD || "job_date", direction: "desc" }],
    maxRecords: 100,
  });
  return records.map((record) => {
    const f = record.fields || {};
    const date = safeHistoryDate(f[env.AIRTABLE_SESSIONS_HISTORY_DATE_FIELD || "job_date"] || f["Session Date"] || f.start_time);
    const status = String(f[env.AIRTABLE_SESSIONS_STATUS_FIELD || "Session Status"] || f.status || "").trim().toLowerCase();
    if (!date || date < cutoff || status !== "completed") return null;
    return {
      type: "service",
      date,
      title: safeCustomerText(f[env.AIRTABLE_SESSIONS_SERVICE_TYPE_FIELD || "job_type"] || f["Session Type"] || "MMD Service", 80),
      status: "completed",
    };
  }).filter(Boolean);
}

async function listMemberPackageHistory(env, { email, cutoff, membershipStatus }) {
  if (!email) return { history: [], membership_expires_at: "" };
  const records = await airtableList(env, table(env, "MEMBER_PACKAGES"), {
    filterByFormula: `LOWER({${env.AIRTABLE_MEMBER_PACKAGES_EMAIL_FIELD || "member_email"}})=${formulaString(email)}`,
    sort: [{ field: env.AIRTABLE_MEMBER_PACKAGES_CREATED_FIELD || "created_at", direction: "desc" }],
    maxRecords: 50,
  });
  const history = records.map((record) => {
    const f = record.fields || {};
    const date = safeHistoryDate(f.start_date || f.created_at || f.end_date);
    const status = String(f.status || "").trim().toLowerCase();
    if (!date || date < cutoff || !["active", "expired"].includes(status)) return null;
    return {
      type: "membership",
      date,
      title: safePackageLabel(f.package_code),
      status,
    };
  }).filter(Boolean);
  return {
    history,
    membership_expires_at: currentMembershipExpiry(records, membershipStatus, env.AIRTABLE_MEMBER_PACKAGES_CREATED_FIELD || "created_at"),
  };
}

function currentMembershipExpiry(records, membershipStatus, createdField) {
  if (!Array.isArray(records) || !records.length || !["active", "grace"].includes(membershipStatus)) return "";

  let current = records[0];
  if (records.length > 1) {
    const dated = records.map((record) => ({
      record,
      createdAt: strictTimestamp(record?.fields?.[createdField]),
    }));
    // Legacy or tied rows do not establish a unique current package. An older
    // row must never win merely because it carries a later end_date.
    if (dated.some((item) => item.createdAt === null)) return "";
    const newest = Math.max(...dated.map((item) => item.createdAt));
    const winners = dated.filter((item) => item.createdAt === newest);
    if (winners.length !== 1) return "";
    current = winners[0].record;
  }

  const fields = current?.fields || {};
  const packageStatus = String(fields.status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!["active", "grace", "grace_period"].includes(packageStatus)) return "";
  return strictCalendarDate(fields.end_date);
}

async function listMemberPointsLedger(env, { email, cutoff }) {
  if (!email) return { total: null, records_count: null, history: [] };
  const records = await airtableList(env, table(env, "POINTS_LEDGER"), {
    filterByFormula: `LOWER({${env.AIRTABLE_POINTS_EMAIL_FIELD || "member_email"}})=${formulaString(email)}`,
    sort: [{ field: env.AIRTABLE_POINTS_HISTORY_DATE_FIELD || "created_at", direction: "desc" }],
    maxRecords: 100,
  });
  let total = 0;
  let recordsCount = 0;
  const history = records.map((record) => {
    const f = record.fields || {};
    const date = safeHistoryDate(f.posted_at || f.created_at);
    const status = String(f.transaction_status || "").trim().toLowerCase();
    const delta = signedInteger(f.points);
    if (!date || date < cutoff || status !== "posted" || delta === null) return null;
    total += delta;
    recordsCount += 1;
    return {
      type: "points",
      date,
      title: delta >= 0 ? "Points added" : "Points adjusted",
      points_delta: delta,
      status: "posted",
    };
  }).filter(Boolean);
  return {
    total: Math.max(0, total),
    records_count: recordsCount,
    history,
  };
}

function memberHistoryCutoff(now = new Date()) {
  const current = bangkokCalendarDate(now);
  const previousYear = Number(current.slice(0, 4)) - 1;
  const candidate = `${previousYear}${current.slice(4)}`;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate) return candidate;
  return `${previousYear}-02-28`;
}

function bangkokCalendarDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function safeHistoryDate(value) {
  const text = String(value || "").trim();
  if (!text || Number.isNaN(Date.parse(text))) return "";
  return new Date(text).toISOString().slice(0, 10);
}

function strictCalendarDate(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? text : "";
}

function strictTimestamp(value) {
  const text = String(value || "").trim();
  if (!text || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeCustomerText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeCustomerTier(value) {
  const tier = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "_");
  if (tier === "black_card" || tier === "blackcard") return "Black Card";
  if (tier === "premium") return "Premium";
  if (tier === "vip") return "VIP";
  if (tier === "svip") return "SVIP";
  if (tier === "standard") return "Standard";
  return "Member";
}

function normalizeCustomerMembershipStatus(value) {
  const status = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "_");
  if (status === "active") return "active";
  if (status === "grace_period" || status === "grace") return "grace";
  if (status === "expired") return "expired";
  return "under_review";
}

function normalizeCustomerPaymentStatus(verificationValue, intentValue, paymentValue) {
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/[\\s-]+/g, "_");
  const verification = normalize(verificationValue);
  const intent = normalize(intentValue);
  const payment = normalize(paymentValue);
  const verifiedValues = new Set(["verified", "confirmed", "full_payment"]);
  const failedValues = new Set(["failed", "refunded", "cancelled", "canceled"]);
  const pendingValues = new Set(["pending", "pending_review", "pending_confirmation", "intent_created", "notified", "deposit", "partial_payment"]);
  if (verifiedValues.has(verification)) return "verified";
  if (failedValues.has(verification)) return "failed";
  if (pendingValues.has(verification)) return "pending_review";
  if (failedValues.has(intent)) return "failed";
  if (pendingValues.has(intent)) return "pending_review";
  if (failedValues.has(payment)) return "failed";
  if (pendingValues.has(payment)) return "pending_review";
  return "";
}

function safePackageLabel(value) {
  const packageCode = String(value || "").trim().toLowerCase();
  if (packageCode.includes("black")) return "Black Card";
  if (packageCode.includes("premium")) return "Premium Membership";
  if (packageCode.includes("standard") || packageCode.includes("lite")) return "Standard Membership";
  if (packageCode.includes("guest") || packageCode.includes("7")) return "7 Days Guest Pass";
  return "MMD Membership";
}

function signedInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : Math.max(0, Math.trunc(Number(fallback) || 0));
}

async function handleAdminGrant(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.ADMIN_BEARER || auth !== `Bearer ${env.ADMIN_BEARER}`) {
    return json(request, env, 401, { ok: false, error: { code: "ADMIN_REQUIRED", message: "Admin bearer token required." } });
  }

  const body = await readJson(request);
  const memberId = String(body.member_id || "").trim();
  const resourceKey = String(body.resource_key || "").trim();
  const minTier = String(body.min_tier || "").trim().toLowerCase();
  const expiresAt = body.expires_at ? String(body.expires_at) : "";

  if (!memberId || !resourceKey) {
    return json(request, env, 400, { ok: false, error: { code: "GRANT_REQUIRED", message: "member_id and resource_key are required." } });
  }

  const entitlementId = randomId("ent");
  await airtableCreate(env, table(env, "MEMBER_ENTITLEMENTS"), compactFields({
    entitlement_id: entitlementId,
    member_id: memberId,
    resource_key: resourceKey,
    min_tier: minTier,
    status: "active",
    starts_at: nowIso(),
    expires_at: expiresAt,
    note: String(body.note || ""),
    created_at: nowIso(),
  }));

  await audit(env, request, memberId, "admin.access_grant", "success", { resource_key: resourceKey, min_tier: minTier });
  return json(request, env, 200, { ok: true, entitlement_id: entitlementId });
}

async function readSession(request, env) {
  const token = getCookie(request, env.AUTH_COOKIE_NAME || "mmd_auth");
  if (!token) return { ok: false, code: "SESSION_REQUIRED", message: "Login required." };

  const sessionHash = await hashSecret(env, `session:${token}`);
  const records = await airtableList(env, table(env, "AUTH_SESSIONS"), {
    filterByFormula: `AND({session_hash}=${formulaString(sessionHash)}, OR({revoked_at}=BLANK(), {revoked_at}=''))`,
    maxRecords: 1,
  });

  const session = records[0];
  if (!session) return { ok: false, code: "SESSION_NOT_FOUND", message: "Session not found." };

  const fields = session.fields || {};
  if (Date.parse(fields.expires_at || "") < Date.now()) {
    return { ok: false, code: "SESSION_EXPIRED", message: "Session expired." };
  }

  const memberRecord = await findMemberById(env, fields.member_id);
  if (!memberRecord) return { ok: false, code: "MEMBER_NOT_FOUND", message: "Member not found." };

  const profile = await buildProfile(env, memberRecord.fields || {});
  return { ok: true, profile, session_record: session, session_fields: fields };
}

async function buildProfile(env, memberFields) {
  const memberId = String(memberFields.member_id || "");
  const email = normalizeEmail(memberFields.email || "");
  const entitlements = await deriveMemberEntitlements(env, {
    member_id: memberId,
    email,
    memberstack_id: memberFields.memberstack_id || "",
    telegram_user_id: memberFields.telegram_user_id || "",
    telegram_username: memberFields.telegram_username || "",
    line_user_id: memberFields.line_user_id || memberFields.line_id || "",
  });
  const packageAccess = await derivePackageAccess(env, memberFields);

  return {
    member_id: memberId,
    name: memberFields.name || "",
    email,
    phone: memberFields.phone || "",
    telegram_username: memberFields.telegram_username || "",
    tier: packageAccess.tier,
    status: packageAccess.status,
    expire_at: packageAccess.expire_at,
    package_code: packageAccess.package_code,
    tier_rank: TIER_RANK[packageAccess.tier] || 0,
    entitlements,
    grants: entitlements,
  };
}

async function derivePackageAccess(env, memberFields) {
  const email = normalizeEmail(memberFields.email || "");
  if (!email) return { tier: "guest", status: "guest", expire_at: "", package_code: "" };

  const records = await airtableList(env, table(env, "MEMBER_PACKAGES"), {
    filterByFormula: `LOWER({member_email})=${formulaString(email)}`,
    sort: [{ field: "end_date", direction: "desc" }],
    maxRecords: 20,
  });

  const now = Date.now();
  let best = null;
  for (const record of records) {
    const f = record.fields || {};
    if (String(f.status || "").toLowerCase() !== "active") continue;
    const endAt = Date.parse(f.end_date || "");
    if (!endAt || endAt < now) continue;
    const tier = tierFromPackageCode(f.package_code || f.tier || "");
    const rank = TIER_RANK[tier] || 0;
    if (!best || rank > best.rank || endAt > best.endAt) {
      best = { tier, rank, endAt, package_code: f.package_code || f.tier || "", expire_at: f.end_date || "" };
    }
  }

  if (!best) return { tier: "guest", status: "no_active_membership", expire_at: "", package_code: "" };
  return { tier: best.tier, status: "active", expire_at: best.expire_at, package_code: best.package_code };
}

async function deriveMemberEntitlements(env, memberIdentity) {
  const identityFormula = entitlementIdentityFormula(env, memberIdentity);
  if (!identityFormula) return [];
  let records = [];
  try {
    records = await airtableList(env, table(env, "MEMBER_ENTITLEMENTS"), {
      filterByFormula: identityFormula,
      maxRecords: 100,
    });
  } catch (error) {
    console.warn("Member entitlement read skipped", safeAirtableReadDebug(table(env, "MEMBER_ENTITLEMENTS"), error));
    return [];
  }
  const now = Date.now();
  const accessStatusFields = envList(env.AIRTABLE_ENTITLEMENT_ACCESS_STATUS_FIELDS || "access_status");
  const memberStatusFields = envList(env.AIRTABLE_ENTITLEMENT_MEMBER_STATUS_FIELDS || "member_status");
  const activeValues = envList(env.AIRTABLE_ENTITLEMENT_ACTIVE_VALUES || "active,grace").map((v) => v.toLowerCase());
  const blockedMemberValues = envList(env.AIRTABLE_ENTITLEMENT_BLOCKED_MEMBER_STATUS_VALUES || "inactive,blocked").map((v) => v.toLowerCase());
  const resourceFields = envList(env.AIRTABLE_ENTITLEMENT_RESOURCE_FIELDS || "resource_key,access_key,package_code");
  const minTierFields = envList(env.AIRTABLE_ENTITLEMENT_TIER_FIELDS || "min_tier,tier,package_code");
  const expiresAtFields = envList(env.AIRTABLE_ENTITLEMENT_EXPIRES_AT_FIELDS || "expire_at");

  return records
    .map((r) => r.fields || {})
    .filter((f) => {
      const accessStatus = stringField(f, accessStatusFields).toLowerCase();
      if (!accessStatus || !activeValues.includes(accessStatus)) return false;

      const memberStatus = stringField(f, memberStatusFields).toLowerCase();
      if (memberStatus && blockedMemberValues.includes(memberStatus)) return false;

      const expiresAt = stringField(f, expiresAtFields);
      const expires = expiresAt ? Date.parse(expiresAt) : Number.MAX_SAFE_INTEGER;
      return expires >= now;
    })
    .map((f) => ({
      resource_key: stringField(f, resourceFields),
      min_tier: normalizeTierValue(stringField(f, minTierFields)),
      expires_at: stringField(f, expiresAtFields),
    }))
    .filter((g) => g.resource_key);
}

function entitlementIdentityFormula(env, identity) {
  const clauses = [];
  addFormulaClause(clauses, env.AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD || "memberstack_id", identity?.memberstack_id);
  addFormulaClause(clauses, env.AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD || "member_email", identity?.email, true);
  addFormulaClause(clauses, env.AIRTABLE_ENTITLEMENT_TELEGRAM_USER_ID_FIELD || "telegram_user_id", identity?.telegram_user_id);
  addFormulaClause(clauses, env.AIRTABLE_ENTITLEMENT_TELEGRAM_USERNAME_FIELD || "telegram_username", identity?.telegram_username, true);
  addFormulaClause(clauses, env.AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD || "line_user_id", identity?.line_user_id);
  if (!clauses.length) return "";
  return clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
}

function addFormulaClause(clauses, field, value, lower = false) {
  const fieldName = String(field || "").trim();
  const fieldValue = String(value || "").trim();
  if (!fieldName || !fieldValue) return;
  const left = lower ? `LOWER({${fieldName}})` : `{${fieldName}}`;
  const right = formulaString(lower ? fieldValue.toLowerCase() : fieldValue);
  clauses.push(`${left}=${right}`);
}

function tierFromPackageCode(value) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("black") || raw.includes("svip")) return raw.includes("black") ? "blackcard" : "svip";
  if (raw.includes("vip")) return "vip";
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  if (raw.includes("7") || raw.includes("guest")) return "guest_pass";
  return "guest";
}

async function findOrCreateMember(env, identity) {
  const identityRecord = await findIdentity(env, identity.identity_key);
  if (identityRecord?.fields?.member_id) {
    const memberRecord = await findMemberById(env, identityRecord.fields.member_id);
    if (memberRecord) return memberRecord.fields;
  }

  let memberRecord = null;
  if (identity.type === "email") {
    memberRecord = await airtableFirst(env, table(env, "MEMBERS"), `LOWER({Contact Email})=${formulaString(identity.value)}`);
  } else if (identity.type === "phone") {
    memberRecord = await airtableFirst(env, table(env, "MEMBERS"), `{Phone Number}=${formulaString(identity.value)}`);
  } else if (identity.type === "telegram") {
    memberRecord = await airtableFirst(env, table(env, "MEMBERS"), `{telegram_username}=${formulaString(identity.value)}`);
  }

  if (memberRecord) return normalizeMemberRecord(memberRecord);

  const memberId = await memberIdFromIdentity(identity);
  const fields = compactFields({
    member_id: memberId,
    "Full Name": "",
    "Contact Email": identity.type === "email" ? identity.value : "",
    "Phone Number": identity.type === "phone" ? identity.value : "",
    telegram_username: identity.type === "telegram" ? identity.value : "",
    "Date Joined": todayDate(),
  });
  await airtableCreate(env, table(env, "MEMBERS"), fields);
  return {
    ...fields,
    member_id: memberId,
    name: fields["Full Name"] || "",
    email: normalizeEmail(fields["Contact Email"] || ""),
    phone: fields["Phone Number"] || "",
  };
}

async function upsertIdentity(env, memberId, identity) {
  const existing = await findIdentity(env, identity.identity_key);
  if (existing) {
    await airtableUpdate(env, table(env, "AUTH_IDENTITIES"), existing.id, {
      member_id: memberId,
      last_seen_at: nowIso(),
    });
    return existing;
  }

  return airtableCreate(env, table(env, "AUTH_IDENTITIES"), {
    identity_id: randomId("ident"),
    member_id: memberId,
    identity_type: identity.type,
    identity_value: identity.value,
    identity_key: identity.identity_key,
    status: "active",
    created_at: nowIso(),
    last_seen_at: nowIso(),
  });
}

async function findIdentity(env, identityKey) {
  return airtableFirst(env, table(env, "AUTH_IDENTITIES"), `{identity_key}=${formulaString(identityKey)}`);
}

async function findMemberById(env, memberId) {
  const id = String(memberId || "");
  if (id.startsWith("mmd_rec_")) {
    const recordId = id.slice("mmd_rec_".length);
    const record = await airtableGet(env, table(env, "MEMBERS"), recordId);
    return record ? { ...record, fields: normalizeMemberRecord(record) } : null;
  }
  const record = await airtableFirst(env, table(env, "MEMBERS"), `{member_id}=${formulaString(id)}`);
  return record ? { ...record, fields: normalizeMemberRecord(record) } : null;
}

async function findMemberRecordsByLineUserId(env, lineUserId, options = {}) {
  const field = String(env.AIRTABLE_MEMBERS_LINE_USER_ID_FIELD || "line_user_id").trim();
  if (!field) throw new Error("AIRTABLE_MEMBERS_LINE_USER_ID_FIELD is required.");
  return airtableList(env, table(env, "MEMBERS"), {
    filterByFormula: `{${field}}=${formulaString(lineUserId)}`,
    maxRecords: 2,
    signal: options.signal,
    requireRecordsArray: options.requireRecordsArray === true,
  });
}

async function withMemberStatusAirtableDeadline(request, env, operation) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (request.signal?.aborted) controller.abort();
  else request.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), memberStatusAirtableTimeoutMs(env));
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function memberStatusAirtableTimeoutMs(env) {
  const configured = Number(env.MEMBER_STATUS_AIRTABLE_TIMEOUT_MS);
  if (!Number.isInteger(configured)) return MEMBER_STATUS_AIRTABLE_TIMEOUT_MS;
  return Math.min(MEMBER_STATUS_AIRTABLE_TIMEOUT_MS, Math.max(MEMBER_STATUS_AIRTABLE_TIMEOUT_MIN_MS, configured));
}

function normalizeMemberRecord(record) {
  const fields = record.fields || {};
  const memberId = String(fields.member_id || fields["Member ID"] || fields.auth_member_id || "");
  return {
    ...fields,
    member_id: memberId || `mmd_rec_${String(record.id || "")}`,
    name: fields.name || fields["Full Name"] || fields["Full Name (Display)"] || fields["Full Name (EN)"] || "",
    email: normalizeEmail(fields.email || fields["Contact Email"] || ""),
    phone: fields.phone || fields["Phone Number"] || "",
    telegram_username: fields.telegram_username || "",
    telegram_user_id: fields.telegram_user_id || "",
    memberstack_id: fields.memberstack_id || "",
    line_user_id: fields.line_user_id || fields.line_id || "",
  };
}

async function memberIdFromIdentity(identity) {
  const digest = await sha256Hex(identity.identity_key);
  return `mmd_${identity.type}_${digest.slice(0, 16)}`;
}

async function updateMemberLastLogin(env, memberRecord) {
  const fields = memberRecord.fields || {};
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(fields, "last_login_at")) updates.last_login_at = nowIso();
  if (Object.prototype.hasOwnProperty.call(fields, "Last Login At")) updates["Last Login At"] = nowIso();
  if (Object.keys(updates).length) await airtableUpdate(env, table(env, "MEMBERS"), memberRecord.id, updates);
}

function compactFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

async function audit(env, request, memberId, action, result, metadata = {}) {
  try {
    const fields = compactFields({
      [env.AIRTABLE_ACCESS_LOG_EVENT_ID_FIELD || "Event ID"]: randomId("log"),
      [env.AIRTABLE_ACCESS_LOG_ACTION_FIELD || "Action"]: action,
      [env.AIRTABLE_ACCESS_LOG_RESULT_FIELD || "Result"]: normalizeAuditResult(result),
      ...optionalField(env.AIRTABLE_ACCESS_LOG_MEMBER_FIELD, memberId || ""),
      ...optionalField(env.AIRTABLE_ACCESS_LOG_METADATA_FIELD, JSON.stringify(metadata)),
      ...optionalField(env.AIRTABLE_ACCESS_LOG_IP_HASH_FIELD, await hashClientValue(env, getClientIp(request))),
      ...optionalField(env.AIRTABLE_ACCESS_LOG_USER_AGENT_FIELD, request.headers.get("user-agent") || ""),
      ...optionalField(env.AIRTABLE_ACCESS_LOG_CREATED_AT_FIELD, nowIso()),
    });
    if (Object.keys(fields).length) await airtableCreate(env, table(env, "ACCESS_LOG"), fields);
  } catch (error) {
    console.warn("Access log write skipped", safeAirtableReadDebug(table(env, "ACCESS_LOG"), error));
    // Audit failures must never block auth.
  }
}

function normalizeAuditResult(result) {
  return String(result || "").toLowerCase() === "success" ? "success" : "fail";
}

function optionalField(field, value) {
  const key = String(field || "").trim();
  return key ? { [key]: value } : {};
}

function envList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringField(fields, candidates) {
  for (const field of candidates) {
    const value = fields[field];
    const normalized = normalizeFieldValue(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeFieldValue(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(normalizeFieldValue).filter(Boolean).join(",");
  if (typeof value === "object") return String(value.name || value.id || "").trim();
  return String(value).trim();
}

function normalizeTierValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "black_card") return "blackcard";
  return raw;
}

function normalizeIdentity(body) {
  const email = normalizeEmail(body.email || body.identifier || "");
  if (email && email.includes("@")) return { ok: true, type: "email", value: email, identity_key: `email:${email}` };

  const phone = normalizePhone(body.phone || body.identifier || "");
  if (phone && phone.length >= 7) return { ok: true, type: "phone", value: phone, identity_key: `phone:${phone}` };

  const telegram = normalizeTelegram(body.telegram_username || body.telegram || body.identifier || "");
  if (telegram) return { ok: true, type: "telegram", value: telegram, identity_key: `telegram:${telegram}` };

  return { ok: false };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/[^0-9+]/g, "").replace(/^\+66/, "0");
}

function normalizeTelegram(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

async function airtableList(env, tableName, params = {}) {
  requireAirtable(env);
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`);

  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  if (Array.isArray(params.sort)) {
    params.sort.forEach((sort, index) => {
      url.searchParams.set(`sort[${index}][field]`, sort.field);
      url.searchParams.set(`sort[${index}][direction]`, sort.direction || "asc");
    });
  }

  const fetchOptions = { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } };
  if (params.signal) fetchOptions.signal = params.signal;
  const response = await fetch(url.toString(), fetchOptions);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Airtable list failed: ${response.status} ${JSON.stringify(data)}`);
  if (params.requireRecordsArray && !Array.isArray(data.records)) throw new Error("Airtable list response is malformed");
  return data.records || [];
}

async function airtableFirst(env, tableName, formula) {
  const records = await airtableList(env, tableName, { filterByFormula: formula, maxRecords: 1 });
  return records[0] || null;
}

async function airtableGet(env, tableName, recordId) {
  requireAirtable(env);
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Airtable get failed: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function airtableCreate(env, tableName, fields) {
  requireAirtable(env);
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn("Airtable create failed", safeAirtableDebug(tableName, response.status, data));
    throw new Error(`Airtable create failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function airtableUpdate(env, tableName, recordId, fields) {
  requireAirtable(env);
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn("Airtable update failed", safeAirtableDebug(tableName, response.status, data));
    throw new Error(`Airtable update failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

function requireAirtable(env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("AIRTABLE_API_KEY and AIRTABLE_BASE_ID are required.");
}

function table(env, key) {
  return env[`AIRTABLE_TABLE_${key}`] || key.toLowerCase();
}

function formulaString(value) {
  return `'${String(value || "").replace(/'/g, "\\'")}'`;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowList = allowed.length ? allowed : DEFAULT_ALLOWED_ORIGINS;
  const allowOrigin = allowList.includes(origin) ? origin : allowList[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
    "Vary": "Origin",
  };
}

function json(request, env, status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.slice(0, 500) || "Unknown error";
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch (_) { return {}; }
}

async function readStrictJsonObject(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) return null;
  const text = await request.text();
  if (!text) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function makeSessionCookie(env, token, expiresAt) {
  const name = env.AUTH_COOKIE_NAME || "mmd_auth";
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  return `${name}=${token}; Path=/; Max-Age=${maxAge}${cookieDomain(env)}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie(env) {
  const name = env.AUTH_COOKIE_NAME || "mmd_auth";
  return `${name}=; Path=/; Max-Age=0${cookieDomain(env)}; HttpOnly; Secure; SameSite=Lax`;
}

function cookieDomain(env) {
  const domain = String(env.COOKIE_DOMAIN || "").trim();
  return domain ? `; Domain=${domain}` : "";
}

function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const parts = cookie.split(/;\s*/);
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index) === name) return decodeURIComponent(part.slice(index + 1));
  }
  return "";
}

function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
}

async function hashSecret(env, value) {
  if (!env.AUTH_HMAC_SECRET) throw new Error("AUTH_HMAC_SECRET is required.");
  return sha256Hex(`${env.AUTH_HMAC_SECRET}:${value}`);
}

async function hashClientValue(env, value) {
  if (!value) return "";
  const salt = env.AUTH_HMAC_SECRET || "mmd-auth";
  return sha256Hex(`${salt}:client:${value}`);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (x.length !== y.length) return false;
  let result = 0;
  for (let i = 0; i < x.length; i += 1) result |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return result === 0;
}

function isInternalMemberStatusResolverRequest(request, env) {
  const expected = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  const received = String(request.headers.get(MEMBER_STATUS_RESOLVER_SECRET_HEADER) || "");
  return expected.length >= 32 && received.length === expected.length && safeEqual(expected, received);
}

function isCanonicalLineUserId(value) {
  return /^U[0-9a-f]{32}$/i.test(String(value || ""));
}

function randomDigits(length) {
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) out += String(byte % 10);
  return out;
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomId(prefix) {
  return `${prefix}_${randomToken(16).toLowerCase()}`;
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function safeAirtableDebug(tableName, status, data) {
  return {
    table: tableName,
    status,
    errorType: data?.error?.type || "",
    errorMessage: data?.error?.message || "",
  };
}

function safeAirtableReadDebug(tableName, error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return {
    table: tableName,
    message: message.slice(0, 300),
  };
}
