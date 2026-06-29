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
  const entitlements = await deriveMemberEntitlements(env, memberId);
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

async function deriveMemberEntitlements(env, memberId) {
  if (!memberId) return [];
  let records = [];
  try {
    records = await airtableList(env, table(env, "MEMBER_ENTITLEMENTS"), {
      filterByFormula: `AND({member_id}=${formulaString(memberId)}, {status}='active')`,
      maxRecords: 100,
    });
  } catch (error) {
    console.warn("Member entitlement read skipped", safeAirtableReadDebug(table(env, "MEMBER_ENTITLEMENTS"), error));
    return [];
  }
  const now = Date.now();
  return records
    .map((r) => r.fields || {})
    .filter((f) => {
      const starts = f.starts_at ? Date.parse(f.starts_at) : 0;
      const expires = f.expires_at ? Date.parse(f.expires_at) : Number.MAX_SAFE_INTEGER;
      return starts <= now && expires >= now;
    })
    .map((f) => ({ resource_key: f.resource_key || "", min_tier: f.min_tier || "", expires_at: f.expires_at || "" }))
    .filter((g) => g.resource_key);
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
    await airtableCreate(env, table(env, "ACCESS_LOG"), compactFields({
      access_log_id: randomId("log"),
      member_id: memberId || "",
      action,
      result,
      metadata_json: JSON.stringify(metadata),
      ip_hash: await hashClientValue(env, getClientIp(request)),
      user_agent: request.headers.get("user-agent") || "",
      created_at: nowIso(),
    }));
  } catch (error) {
    console.warn("Access log write skipped", safeAirtableReadDebug(table(env, "ACCESS_LOG"), error));
    // Audit failures must never block auth.
  }
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

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Airtable list failed: ${response.status} ${JSON.stringify(data)}`);
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
