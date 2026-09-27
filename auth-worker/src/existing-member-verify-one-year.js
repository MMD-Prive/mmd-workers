const AIRTABLE_API = "https://api.airtable.com/v0";

export const EXISTING_MEMBER_VERIFY_EXTENSION_PATH = "/__internal/member-existing-verify/extend";
export const EXISTING_MEMBER_VERIFY_PURPOSE = "my_mmd_existing_member_verify_one_year";
export const EXISTING_MEMBER_VERIFY_CAMPAIGN = "MY_MMD_EXISTING_VERIFY_1Y";

const RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const SUPPORTED_PACKAGES = new Set(["standard", "premium"]);

export async function handleExistingMemberVerifyOneYear(request, env = {}) {
  if (!authorized(request, env)) return response({ ok: false, error: "not_found" }, 404);
  if (request.method !== "POST") return response({ ok: false, error: "method_not_allowed" }, 405);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return response({ ok: false, error: "invalid_request" }, 400);
  const allowed = new Set(["line_user_id", "purpose"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return response({ ok: false, error: "invalid_request" }, 400);

  const lineUserId = String(body.line_user_id || "").trim();
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId) || body.purpose !== EXISTING_MEMBER_VERIFY_PURPOSE) {
    return response({ ok: false, error: "invalid_request" }, 400);
  }
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return response({ ok: false, error: "storage_unavailable" }, 503);

  try {
    const member = await exactMember(env, lineUserId);
    if (member.state === "ambiguous") return response({ ok: false, error: "member_match_ambiguous" }, 409);
    if (member.state !== "resolved") return response({ ok: true, data: { eligible: false, reason: "existing_member_not_found" } });

    const logicalMemberId = text(member.record.fields?.member_id || member.record.fields?.["Member ID"] || member.record.fields?.auth_member_id) || `mmd_rec_${member.record.id}`;
    const email = normalizedEmail(member.record.fields?.[env.AIRTABLE_MEMBERS_EMAIL_FIELD || "Contact Email"] || member.record.fields?.email);
    const marker = await sha256Hex(`existing-member-verify-1y:${lineUserId}`);
    const sourceRef = `my_mmd_existing_verify_1y:${marker.slice(0, 20)}`;
    const claimId = `verify1y_${marker.slice(0, 20)}`;

    const [packages, entitlements] = await Promise.all([
      listPackages(env, logicalMemberId, email),
      listEntitlements(env, lineUserId, logicalMemberId),
    ]);

    const markedPackages = packages.filter((record) => text(record.fields?.campaign_code) === EXISTING_MEMBER_VERIFY_CAMPAIGN);
    const markedEntitlements = entitlements.filter((record) => text(record.fields?.source_ref) === sourceRef);
    const protectedEntitlement = entitlements.find((record) => {
      const fields = record.fields || {};
      const access = token(fields.access_status || fields.member_lifecycle_status);
      if (["expired", "revoked", "blocked", "cancelled", "inactive", "denied"].includes(access)) return false;
      const marker = [
        fields.capability,
        fields.entitlement_level,
        fields.member_status,
        fields.package_code,
        fields.membership_label,
      ].map(token).join("_");
      return /(?:^|_)(?:vip|svip|black_card|blackcard)(?:_|$)/.test(marker);
    });
    if (markedPackages.length > 1 || markedEntitlements.length > 1) {
      return response({ ok: false, error: "existing_verify_conflict" }, 409);
    }
    if (!markedPackages.length && !markedEntitlements.length && protectedEntitlement) {
      return response({
        ok: true,
        data: {
          eligible: false,
          reason: "protected_entitlement_policy",
          protected_policy_unchanged: true,
        },
      });
    }

    let packageCode = normalizedPackage(markedPackages[0]?.fields?.package_code);
    let activeThrough = calendarDate(markedPackages[0]?.fields?.end_date);
    const entitlementThrough = calendarDate(markedEntitlements[0]?.fields?.new_expire_at || markedEntitlements[0]?.fields?.expire_at);
    if (activeThrough && entitlementThrough && activeThrough !== entitlementThrough) {
      return response({ ok: false, error: "existing_verify_expiry_conflict" }, 409);
    }
    activeThrough ||= entitlementThrough;

    const today = bangkokDate(new Date());
    const basePackages = packages.filter((record) => {
      if (text(record.fields?.campaign_code) === EXISTING_MEMBER_VERIFY_CAMPAIGN) return false;
      return SUPPORTED_PACKAGES.has(normalizedPackage(record.fields?.package_code));
    });
    const futurePackages = basePackages
      .filter((record) => {
        const status = token(record.fields?.status);
        const expiry = calendarDate(record.fields?.end_date);
        return ["active", "grace", "grace_period"].includes(status) && expiry && expiry >= today;
      })
      .sort((a, b) => calendarDate(b.fields?.end_date).localeCompare(calendarDate(a.fields?.end_date)));
    const basePackage = futurePackages[0] || basePackages[0];

    if (!packageCode) packageCode = normalizedPackage(basePackage?.fields?.package_code);
    if (!SUPPORTED_PACKAGES.has(packageCode)) {
      return response({
        ok: true,
        data: {
          eligible: false,
          reason: "standard_or_premium_membership_not_resolved",
          protected_policy_unchanged: true,
        },
      });
    }

    const previousExpiry = calendarDate(basePackage?.fields?.end_date);
    const baseStatus = token(basePackage?.fields?.status);
    const baseAnchor = ["active", "grace", "grace_period"].includes(baseStatus) && previousExpiry && previousExpiry >= today
      ? previousExpiry
      : today;
    if (!activeThrough) activeThrough = addCalendarYears(baseAnchor, 1);
    const appliedAt = new Date().toISOString();

    if (!markedPackages.length) {
      await createRecord(env, table(env, "MEMBER_PACKAGES", "member_packages"), compact({
        member_email: email,
        member_id: logicalMemberId,
        package_code: packageCode,
        amount: 0,
        status: "active",
        start_date: today,
        end_date: activeThrough,
        ledger_type: "comped",
        source: "system",
        campaign_code: EXISTING_MEMBER_VERIFY_CAMPAIGN,
        promo_source: "my_mmd_verify",
        promo_applied: true,
        promo_note: "Owner policy: existing member Verify grants one year. Idempotent MY MMD launch benefit.",
        campaign_claim_id: claimId,
        note: `Existing Member Verify +1Y; previous_expire_at=${previousExpiry || "none"}; anchor=${baseAnchor}`,
      }));
    }

    if (!markedEntitlements.length) {
      const capability = packageCode === "premium" ? "private_premium" : "private_standard";
      const entitlementLevel = packageCode === "premium" ? "premium" : "standard_basic";
      const memberStatus = packageCode === "premium" ? "premium" : "standard";
      await createRecord(env, table(env, "MEMBER_ENTITLEMENTS", "MMD — Member Entitlements"), compact({
        entitlement_id: `ent_verify1y_${marker.slice(0, 18)}`,
        member: [member.record.id],
        member_id: logicalMemberId,
        member_email: email,
        line_user_id: lineUserId,
        member_status: memberStatus,
        access_status: "active",
        entitlement_level: entitlementLevel,
        package_code: packageCode,
        capability,
        member_lifecycle_status: "active",
        start_at: appliedAt,
        expire_at: `${activeThrough}T16:59:59.000Z`,
        source: "manual",
        source_ref: sourceRef,
        notes: "Owner policy 2026-09-28: Existing Member Verify +1 calendar year. Browser is not authority.",
        payload_json: JSON.stringify({
          schema: "my_mmd_existing_member_verify_one_year_v1",
          extension_years: 1,
          extension_months: 12,
          previous_expire_at: previousExpiry || null,
          anchor_date: baseAnchor,
          active_through: activeThrough,
        }),
        campaign_code: EXISTING_MEMBER_VERIFY_CAMPAIGN,
        campaign_source: "my_mmd_verify",
        campaign_claim_id: claimId,
        extension_months: 12,
        previous_expire_at: previousExpiry ? `${previousExpiry}T16:59:59.000Z` : undefined,
        benefit_applied_at: appliedAt,
        new_expire_at: `${activeThrough}T16:59:59.000Z`,
        membership_expiry_rule: "one_calendar_year_from_existing_expiry_or_verify",
      }));
    }

    return response({
      ok: true,
      data: {
        eligible: true,
        applied: markedPackages.length === 0 || markedEntitlements.length === 0,
        idempotent: markedPackages.length > 0 && markedEntitlements.length > 0,
        policy: EXISTING_MEMBER_VERIFY_CAMPAIGN,
        extension_years: 1,
        extension_months: 12,
        package_code: packageCode,
        active_through: activeThrough,
      },
    });
  } catch (error) {
    console.warn({
      event: "existing_member_verify_one_year_failed",
      component: "auth-worker",
      failure_class: token(error?.message || error || "unknown").slice(0, 100),
    });
    return response({ ok: false, error: "existing_member_verify_extension_failed" }, 503);
  }
}

function authorized(request, env) {
  const expected = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  const received = String(request.headers.get(RESOLVER_SECRET_HEADER) || "");
  return expected.length >= 32 && received.length === expected.length && constantTimeEqual(expected, received);
}

async function exactMember(env, lineUserId) {
  const lineField = env.AIRTABLE_MEMBERS_LINE_USER_ID_FIELD || "line_id";
  const records = await listRecords(env, table(env, "MEMBERS", "Members"), {
    filterByFormula: `{${lineField}}=${formulaString(lineUserId)}`,
    maxRecords: 2,
  });
  if (records.length > 1) return { state: "ambiguous" };
  return records.length === 1 ? { state: "resolved", record: records[0] } : { state: "missing" };
}

async function listPackages(env, memberId, email) {
  const clauses = [];
  if (memberId) clauses.push(`{member_id}=${formulaString(memberId)}`);
  if (email) clauses.push(`LOWER({member_email})=${formulaString(email.toLowerCase())}`);
  if (!clauses.length) return [];
  return listRecords(env, table(env, "MEMBER_PACKAGES", "member_packages"), {
    filterByFormula: clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`,
    sort: [{ field: env.AIRTABLE_MEMBER_PACKAGES_CREATED_FIELD || "created_at", direction: "desc" }],
    maxRecords: 100,
  });
}

async function listEntitlements(env, lineUserId, memberId) {
  const clauses = [`{line_user_id}=${formulaString(lineUserId)}`];
  if (memberId) clauses.push(`{member_id}=${formulaString(memberId)}`);
  return listRecords(env, table(env, "MEMBER_ENTITLEMENTS", "MMD — Member Entitlements"), {
    filterByFormula: clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`,
    maxRecords: 100,
  });
}

async function listRecords(env, tableName, params = {}) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  if (Array.isArray(params.sort)) params.sort.forEach((sort, i) => {
    url.searchParams.set(`sort[${i}][field]`, sort.field);
    url.searchParams.set(`sort[${i}][direction]`, sort.direction || "asc");
  });
  const init = { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, Accept: "application/json" } };
  const upstream = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(new Request(url.toString(), init))
    : await fetch(url.toString(), init);
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok || !body || !Array.isArray(body.records)) throw new Error(`airtable_list_${upstream.status}`);
  return body.records;
}

async function createRecord(env, tableName, fields) {
  const upstream = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok || !body?.id) throw new Error(`airtable_create_${upstream.status}`);
  return body;
}

function table(env, key, fallback) {
  return String(env[`AIRTABLE_TABLE_${key}`] || fallback);
}

function normalizedPackage(value) {
  const v = token(value);
  if (["standard", "private_standard", "standard_private"].includes(v)) return "standard";
  if (["premium", "private_premium", "premium_private"].includes(v)) return "premium";
  return "";
}

function bangkokDate(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addCalendarYears(date, years) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) throw new Error("invalid_anchor_date");
  const y = Number(match[1]) + Number(years || 0);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

function calendarDate(value) {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function normalizedEmail(value) {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function text(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(",");
  if (typeof value === "object") return String(value.name || value.value || value.id || "").trim();
  return String(value).trim();
}

function token(value) {
  return text(value).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function response(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-mmd-membership-policy": "existing-member-verify-one-year",
    },
  });
}
