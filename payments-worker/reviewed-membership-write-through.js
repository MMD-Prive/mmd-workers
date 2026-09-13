import { resolveMemberEntitlements } from "../auth-worker/src/member-entitlement-resolver.js";
import { inferMembershipPayment } from "../shared/payment-intelligence.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const MEMBERS_TABLE = "tblgWc5VRon5o8Mhk";
const ENTITLEMENTS_TABLE = "tblNImdF9PKAxhXGi";
const PACKAGES_TABLE = "tblg2z8dENx75yHka";
const AUTHORITY = "my_mmd_entitlement_resolver_v1";

const PACKAGE_POLICY = Object.freeze({
  mmd_member: Object.freeze({ capability: "public_member", entitlement_level: "public_member", label: "MMD Member", years: 1, private_catalog: false }),
  elite: Object.freeze({ capability: "public_member", entitlement_level: "elite", label: "Elite Membership", years: 2, private_catalog: false }),
  red_card: Object.freeze({ capability: "red_card", entitlement_level: "red_card", label: "Red Card", years: 1, private_catalog: false }),
  standard: Object.freeze({ capability: "private_standard", entitlement_level: "standard_basic", label: "Standard", years: 1, private_catalog: true }),
  premium: Object.freeze({ capability: "private_premium", entitlement_level: "premium", label: "Premium", years: 2, private_catalog: true }),
});

const BLOCKED = new Set(["blocked", "suspended", "revoked"]);
const EXTENDABLE = new Set(["active", "expiring_soon", "pending"]);

export async function reconcileReviewedMembershipEntitlement(request, response, env = {}) {
  if (!response?.ok) return response;

  const body = await request.clone().json().catch(() => null);
  if (!body || stage(body) !== "membership") return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok) return response;
  if (payload.entitlement_materialized === true) {
    return withReceipt(response, payload, {
      status: "materialized",
      authority: AUTHORITY,
      duplicate: payload.duplicate === true,
      entitlement_record_id: text(payload.entitlement_record_id, 120) || null,
      expire_at: iso(payload.membership_expire_at) || null,
      source: payload.recovery_context ? "liff_renewal_recovery" : "reviewed_proof",
    });
  }

  try {
    requireAirtable(env);
    const plan = await resolveWriteThroughPlan(env, body);
    if (plan.status !== "ready") {
      return withReceipt(response, payload, {
        status: "review_required",
        authority: AUTHORITY,
        reason: plan.reason,
        action: plan.action || null,
        package_code: plan.package_code || canonicalPackage(body.package_code || body.package) || null,
        capability: plan.capability || null,
        current_expire_at: plan.current_expire_at || null,
        proposed_expire_at: plan.proposed_expire_at || null,
        confidence: plan.confidence ?? null,
      });
    }

    const existing = await findByPaymentRef(env, plan.payment_ref);
    if (existing.length > 1) {
      return withReceipt(response, payload, failedReceipt("payment_entitlement_payment_ref_ambiguous", plan));
    }
    if (existing.length === 1) {
      const row = existing[0];
      if (!sameMaterialization(row, plan)) {
        return withReceipt(response, payload, failedReceipt("payment_entitlement_conflict", plan));
      }
      return withReceipt(response, payload, successReceipt(plan, row.id, true));
    }

    const fields = entitlementFields(plan);
    const prospective = resolveMemberEntitlements([...plan.entitlement_rows, { fields }], { now: plan.verified_at });
    if (prospective.schema_version !== AUTHORITY || prospective.fail_closed !== true || prospective.member_blocked === true) {
      return withReceipt(response, payload, failedReceipt("prospective_resolver_rejected_entitlement", plan));
    }

    const created = await airtableCreate(env, entitlementsTable(env), fields);
    const freshRows = await loadMemberEntitlements(env, plan.member_id, plan.member_email);
    const fresh = resolveMemberEntitlements(freshRows, { now: plan.verified_at });
    const createdNormalized = fresh.entitlements.find((item) => item.entitlement_id === plan.entitlement_id);
    const accepted = createdNormalized
      && createdNormalized.capability === plan.capability
      && ["active", "expiring_soon", "pending"].includes(createdNormalized.lifecycle)
      && fresh.member_blocked !== true;

    if (!accepted) {
      await revokeCreated(env, created.id, plan).catch(() => {});
      return withReceipt(response, payload, failedReceipt("post_write_resolver_verification_failed", plan));
    }

    return withReceipt(response, payload, successReceipt(plan, created.id, false));
  } catch (error) {
    return withReceipt(response, payload, {
      status: "failed",
      authority: AUTHORITY,
      reason: code(error?.message || error || "membership_write_through_failed"),
      manual_reconciliation_required: true,
    });
  }
}

export async function resolveWriteThroughPlan(env = {}, body = {}, options = {}) {
  const paymentRef = text(body.payment_ref || body.transaction_ref, 180);
  const amountThb = positiveAmount(body.amount_thb ?? body.amount);
  const packageCode = canonicalPackage(body.package_code || body.package);
  const memberEmail = email(body.member_email || body.email);
  const verifiedAt = iso(options.verified_at) || new Date().toISOString();
  const policy = PACKAGE_POLICY[packageCode];

  if (!paymentRef) return review("payment_ref_required", { package_code: packageCode });
  if (amountThb == null) return review("amount_required", { package_code: packageCode });
  if (!packageCode || !policy) return review("unsupported_membership_package", { package_code: packageCode });
  if (!memberEmail) return review("canonical_member_email_required", { package_code: packageCode, capability: policy.capability });

  const inference = inferMembershipPayment({
    amount_thb: amountThb,
    linked_member: true,
    linked_renewal: Boolean(body.renewal_session_id || body.renewal_record_id),
    package_code: packageCode,
    source_context: body.context_source,
  });
  if (!inference || inference.inferred_package_code !== packageCode) {
    return review("membership_amount_package_mismatch", {
      package_code: packageCode,
      capability: policy.capability,
      confidence: inference?.confidence ?? null,
    });
  }

  if (policy.private_catalog) {
    const catalog = await loadPrivatePackage(env, packageCode);
    if (!catalog) return review("membership_package_catalog_missing", { package_code: packageCode, capability: policy.capability });
    if (catalog.active === false) return review("membership_package_inactive", { package_code: packageCode, capability: policy.capability });
    if (catalog.require_approval === true) return review("membership_package_requires_separate_approval", { package_code: packageCode, capability: policy.capability });
  }

  const members = await findMemberByEmail(env, memberEmail);
  if (members.length !== 1) {
    return review(members.length ? "canonical_member_ambiguous" : "canonical_member_not_found", {
      package_code: packageCode,
      capability: policy.capability,
      confidence: inference.confidence,
    });
  }

  const member = members[0];
  const memberId = text(member.fields?.member_id, 120);
  if (!memberId) {
    return review("canonical_member_id_required", { package_code: packageCode, capability: policy.capability, confidence: inference.confidence });
  }

  const rows = await loadMemberEntitlements(env, memberId, memberEmail);
  const snapshot = resolveMemberEntitlements(rows, { now: verifiedAt });
  if (snapshot.schema_version !== AUTHORITY || snapshot.fail_closed !== true) {
    return review("canonical_resolver_unavailable", { package_code: packageCode, capability: policy.capability, confidence: inference.confidence });
  }
  if (snapshot.member_blocked === true || rows.some((row) => blockedRow(row))) {
    return review("canonical_member_blocked", { package_code: packageCode, capability: policy.capability, confidence: inference.confidence });
  }

  const normalizedRows = snapshot.entitlements.filter((item) => item.package_code === packageCode || item.capability === policy.capability);
  const exactPackageRows = normalizedRows.filter((item) => canonicalPackage(item.package_code) === packageCode);
  const hasExactHistory = exactPackageRows.length > 0;
  const inferredIntent = code(inference.inferred_intent);

  if (inferredIntent === "renewal" && !hasExactHistory) {
    return review("renewal_history_not_found", {
      package_code: packageCode,
      capability: policy.capability,
      action: "renewal",
      confidence: inference.confidence,
    });
  }

  const futureExpiry = latestFutureExpiry(exactPackageRows, verifiedAt);
  const action = hasExactHistory ? "renewal" : "signup";
  const startAt = futureExpiry || verifiedAt;
  const expireAt = addCalendarYears(startAt, policy.years)?.toISOString() || "";
  if (!expireAt) return review("membership_term_invalid", { package_code: packageCode, capability: policy.capability, action, confidence: inference.confidence });

  const lineUserId = lineId(member.fields?.line_id || member.fields?.line_user_id)
    || uniqueLineUserId(rows)
    || "";

  return {
    status: "ready",
    authority: AUTHORITY,
    payment_ref: paymentRef,
    amount_thb: amountThb,
    package_code: packageCode,
    capability: policy.capability,
    entitlement_level: policy.entitlement_level,
    target_package_label: policy.label,
    member_record_id: member.id,
    member_id: memberId,
    member_email: memberEmail,
    line_user_id: lineUserId,
    verified_at: verifiedAt,
    action,
    confidence: Math.max(Number(inference.confidence || 0), 0.94),
    price_rule: text(inference.inferred_price_rule, 120),
    current_expire_at: futureExpiry || latestHistoricalExpiry(exactPackageRows) || null,
    start_at: startAt,
    proposed_expire_at: expireAt,
    membership_term: policy.years === 2 ? "2_years" : "1_year",
    membership_expiry_rule: action === "renewal" && futureExpiry
      ? `${policy.years}_year${policy.years === 1 ? "" : "s"}_from_current_expiry`
      : `${policy.years}_year${policy.years === 1 ? "" : "s"}_from_verified_payment`,
    entitlement_id: deterministicEntitlementId(paymentRef, packageCode),
    entitlement_rows: rows,
  };
}

function entitlementFields(plan) {
  return compact({
    entitlement_id: plan.entitlement_id,
    member: [plan.member_record_id],
    member_id: plan.member_id,
    member_email: plan.member_email,
    line_user_id: plan.line_user_id,
    member_status: "active",
    member_lifecycle_status: "active",
    access_status: "active",
    capability: plan.capability,
    entitlement_level: plan.entitlement_level,
    package_code: plan.package_code,
    target_package_label: plan.target_package_label,
    start_at: plan.start_at,
    expire_at: plan.proposed_expire_at,
    membership_expiry_rule: plan.membership_expiry_rule,
    source_ref: `payment:${plan.payment_ref}`,
    payment_ref: plan.payment_ref,
    notes: `Official payment write-through; action=${plan.action}; amount=${plan.amount_thb}; price_rule=${plan.price_rule}; authority=${AUTHORITY}`,
  });
}

function successReceipt(plan, recordId, duplicate) {
  return {
    status: "materialized",
    authority: AUTHORITY,
    duplicate,
    action: plan.action,
    package_code: plan.package_code,
    capability: plan.capability,
    member_id: plan.member_id,
    entitlement_record_id: recordId,
    entitlement_id: plan.entitlement_id,
    current_expire_at: plan.current_expire_at,
    start_at: plan.start_at,
    expire_at: plan.proposed_expire_at,
    membership_term: plan.membership_term,
    membership_expiry_rule: plan.membership_expiry_rule,
    confidence: plan.confidence,
    manual_reconciliation_required: false,
  };
}

function failedReceipt(reason, plan = {}) {
  return {
    status: "failed",
    authority: AUTHORITY,
    reason,
    action: plan.action || null,
    package_code: plan.package_code || null,
    capability: plan.capability || null,
    member_id: plan.member_id || null,
    manual_reconciliation_required: true,
  };
}

function review(reason, extra = {}) {
  return { status: "review_required", reason, ...extra };
}

function withReceipt(response, payload, receipt) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify({
    ...payload,
    entitlement_materialized: receipt.status === "materialized",
    entitlement_record_id: receipt.entitlement_record_id || payload.entitlement_record_id || undefined,
    membership_expire_at: receipt.expire_at || payload.membership_expire_at || undefined,
    membership_term: receipt.membership_term || payload.membership_term || undefined,
    membership_expiry_rule: receipt.membership_expiry_rule || payload.membership_expiry_rule || undefined,
    membership_write_through: receipt,
    manual_membership_review_required: receipt.status === "review_required" || receipt.status === "failed",
    downstream_access_reconcile_required: receipt.status === "materialized" || payload.downstream_access_reconcile_required === true,
  }), { status: response.status, statusText: response.statusText, headers });
}

async function findMemberByEmail(env, memberEmail) {
  for (const field of ["Contact Email", "email"]) {
    try {
      const rows = await airtableList(env, membersTable(env), {
        filterByFormula: `LOWER({${field}})='${formulaValue(memberEmail)}'`,
        maxRecords: 2,
      });
      if (rows.length) return rows;
    } catch (error) {
      if (Number(error?.status) !== 422) throw error;
    }
  }
  return [];
}

async function loadMemberEntitlements(env, memberId, memberEmail) {
  if (memberId) {
    try {
      const byMemberId = await airtableList(env, entitlementsTable(env), {
        filterByFormula: `{member_id}='${formulaValue(memberId)}'`,
        maxRecords: 100,
      });
      if (byMemberId.length) return byMemberId;
    } catch (error) {
      if (Number(error?.status) !== 422) throw error;
    }
  }
  return airtableList(env, entitlementsTable(env), {
    filterByFormula: `LOWER({member_email})='${formulaValue(memberEmail)}'`,
    maxRecords: 100,
  });
}

async function loadPrivatePackage(env, packageCode) {
  const rows = await airtableList(env, packagesTable(env), {
    filterByFormula: `{code}='${formulaValue(packageCode)}'`,
    maxRecords: 2,
  });
  if (rows.length !== 1) return null;
  const fields = rows[0].fields || {};
  return {
    code: canonicalPackage(fields.code),
    active: fields.is_active !== false,
    require_approval: fields.require_approval === true,
    duration_days: Number(fields.duration_days || 0) || null,
    price: Number(fields.price || 0) || null,
    renew_price: Number(fields.renew_price || 0) || null,
  };
}

async function findByPaymentRef(env, paymentRef) {
  return airtableList(env, entitlementsTable(env), {
    filterByFormula: `{payment_ref}='${formulaValue(paymentRef)}'`,
    maxRecords: 3,
  });
}

function sameMaterialization(record, plan) {
  const f = record?.fields || {};
  return text(f.entitlement_id, 180) === plan.entitlement_id
    && text(f.member_id, 120) === plan.member_id
    && canonicalPackage(f.package_code) === plan.package_code
    && code(f.capability || f.entitlement_level) === plan.capability;
}

async function revokeCreated(env, recordId, plan) {
  return airtableUpdate(env, entitlementsTable(env), recordId, {
    access_status: "revoked",
    member_lifecycle_status: "revoked",
    member_status: "revoked",
    notes: `Rollback after resolver verification failure; payment_ref=${plan.payment_ref}`,
  });
}

function latestFutureExpiry(rows, nowIso) {
  const now = Date.parse(nowIso);
  const values = rows
    .filter((item) => EXTENDABLE.has(code(item.lifecycle)))
    .map((item) => Date.parse(item.expire_at || ""))
    .filter((value) => Number.isFinite(value) && value > now);
  return values.length ? new Date(Math.max(...values)).toISOString() : "";
}

function latestHistoricalExpiry(rows) {
  const values = rows.map((item) => Date.parse(item.expire_at || "")).filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values)).toISOString() : "";
}

function uniqueLineUserId(rows) {
  const values = [...new Set(rows.map((row) => lineId(row?.fields?.line_user_id)).filter(Boolean))];
  return values.length === 1 ? values[0] : "";
}

function blockedRow(row) {
  const f = row?.fields || {};
  return BLOCKED.has(code(f.member_lifecycle_status || f.member_status)) || BLOCKED.has(code(f.access_status));
}

function deterministicEntitlementId(paymentRef, packageCode) {
  const ref = code(paymentRef).slice(0, 80) || "payment";
  return `pay_${ref}_${packageCode}`.slice(0, 180);
}

function addCalendarYears(value, years) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !Number.isInteger(years) || years < 1) return null;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

async function airtableList(env, tableName, params = {}) {
  const url = airtableUrl(env, tableName);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch(env, new Request(url.toString(), { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload.records;
}

async function airtableCreate(env, tableName, fields) {
  const response = await airtableFetch(env, new Request(airtableUrl(env, tableName).toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  }));
  const payload = await response.json().catch(() => ({}));
  const row = payload?.records?.[0];
  if (!response.ok || !row?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return row;
}

async function airtableUpdate(env, tableName, recordId, fields) {
  const response = await airtableFetch(env, new Request(airtableUrl(env, tableName).toString(), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast: false }),
  }));
  if (!response.ok) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return response.json().catch(() => ({}));
}

function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

function airtableUrl(env, tableName) {
  return new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
}

function membersTable(env) { return clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || MEMBERS_TABLE); }
function entitlementsTable(env) { return clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENTS_TABLE); }
function packagesTable(env) { return clean(env.AIRTABLE_TABLE_PACKAGES_ID || env.AIRTABLE_TABLE_PACKAGES || PACKAGES_TABLE); }

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}

function stage(body = {}) { return code(body.payment_stage || body.stage || body.payment_type); }
function canonicalPackage(value) {
  const raw = code(value).replace(/-/g, "_");
  if (raw === "mmd_member" || raw === "member_690" || raw === "membership") return "mmd_member";
  if (raw === "elite" || raw === "elite_membership") return "elite";
  if (raw === "red_card" || raw === "redcard") return "red_card";
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "";
}
function email(value) { const v = clean(value).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ""; }
function lineId(value) { const v = text(value, 100); return /^U[A-Za-z0-9_-]{20,80}$/.test(v) ? v : ""; }
function positiveAmount(value) { const n = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? Math.round((n + Number.EPSILON) * 100) / 100 : null; }
function iso(value) { const t = Date.parse(String(value || "")); return Number.isFinite(t) ? new Date(t).toISOString() : ""; }
function formulaValue(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function code(value) { return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function text(value, max = 240) { return clean(value, max).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max); }
function clean(value, max = 2000) { return String(value == null ? "" : value).trim().slice(0, max); }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== "" && v !== null && v !== undefined)); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
