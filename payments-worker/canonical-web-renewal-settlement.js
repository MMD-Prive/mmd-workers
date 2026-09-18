import { resolveMemberEntitlements } from "../auth-worker/src/member-entitlement-resolver.js";
import { classifyPaymentOpsRoute, inferMembershipPayment } from "../shared/payment-intelligence.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const PAYMENTS = "tblWGGJJOx5eBvBZJ";
const PROOFS = "tblfJfM4Sqag9zrLi";
const RENEWALS = "tblXjQFwo0A2cHseh";
const MEMBERS = "tblgWc5VRon5o8Mhk";
const ENTITLEMENTS = "tblNImdF9PKAxhXGi";
const PACKAGES = "tblg2z8dENx75yHka";
const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const OWNER_POLICY = "membership_slip_simple_accept_v1";
const EXTENDABLE = new Set(["active", "expiring_soon", "pending"]);
const BLOCKED = new Set(["blocked", "suspended", "revoked"]);
const POLICY = Object.freeze({
  standard: Object.freeze({ years: 1, capability: "private_standard", entitlement_level: "standard_basic", label: "Standard" }),
  premium: Object.freeze({ years: 2, capability: "private_premium", entitlement_level: "premium", label: "Premium" }),
});

export async function reconcileCanonicalWebRenewalProof(request, response, env = {}) {
  if (!(response instanceof Response) || !response.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok || payload.evidence_submitted !== true) return response;

  let form;
  try { form = await request.clone().formData(); } catch { return response; }
  const sourcePage = code(form.get("source_page"));
  if (sourcePage !== "sigil_pay" || !uploadedFile(form)) return response;

  const paymentRef = text(form.get("payment_ref") || form.get("transaction_ref"), 180);
  if (!paymentRef) return response;

  try {
    requireAirtable(env);
    const paymentRows = await findByField(env, paymentsTable(env), ["payment_ref", "Payment Reference"], paymentRef, 2);
    if (paymentRows.length !== 1) return withSettlement(response, payload, reviewReceipt(paymentRows.length ? "canonical_payment_ambiguous" : "canonical_payment_not_found"));
    const payment = paymentRows[0];
    const snapshot = paymentSnapshot(payment);
    const inference = inferMembershipPayment({
      amount_thb: snapshot.amount_thb,
      linked_renewal: true,
      package_code: snapshot.package_code,
      source_context: "sigil_pay renewal",
    });
    const route = classifyPaymentOpsRoute({
      payment_stage: snapshot.payment_stage,
      amount_thb: snapshot.amount_thb,
      linked_renewal: true,
      package_code: snapshot.package_code,
      source_page: sourcePage,
      context_text: "membership renewal",
    });

    if (snapshot.payment_stage !== "membership"
      || !POLICY[snapshot.package_code]
      || !snapshot.session_id
      || snapshot.amount_thb == null
      || route.topic !== "membership"
      || route.should_alert === true
      || !inference
      || code(inference.inferred_intent) !== "renewal"
      || canonicalPackage(inference.inferred_package_code) !== snapshot.package_code) {
      return withSettlement(response, payload, reviewReceipt("renewal_payment_context_not_safe"));
    }

    const proof = await resolveProof(env, payload, paymentRef);
    if (!proof) return withSettlement(response, payload, reviewReceipt("canonical_payment_proof_not_found"));

    // Owner policy: a real membership/renewal slip with a positive numeric amount
    // and no payment-classification conflict is accepted as money truth. Identity
    // and entitlement materialization remain separate, exact, fail-closed steps.
    const verifiedAt = new Date().toISOString();
    await airtableUpdate(env, paymentsTable(env), payment.id, {
      "Payment Status": "paid",
      "Verification Status": "verified",
      "Payment Intent Status (AI)": "owner_membership_policy_verified",
      "Payment Date": firstValue(payment.fields || {}, ["Payment Date", "paid_at"]) || verifiedAt,
    });
    await airtableUpdate(env, proofsTable(env), proof.id, {
      status: "verified",
      verified_at: verifiedAt.slice(0, 10),
      verified_by: "payments-worker-web-renewal",
      note: appendPolicyNote(proof.fields?.note),
    });

    const moneyReceipt = {
      status: "paid",
      authority: "payments-worker",
      owner_policy: OWNER_POLICY,
      payment_ref: paymentRef,
      package_code: snapshot.package_code,
      amount_thb: snapshot.amount_thb,
    };

    const materialization = await materializeRenewal(env, {
      payment_ref: paymentRef,
      payment,
      proof,
      snapshot,
      inference,
      verified_at: verifiedAt,
    });

    return withSettlement(response, payload, {
      ...moneyReceipt,
      ...materialization,
    });
  } catch (error) {
    return withSettlement(response, payload, {
      status: "review_required",
      authority: "payments-worker",
      owner_policy: OWNER_POLICY,
      reason: code(error?.message || error || "canonical_web_renewal_settlement_failed"),
      payment_ref: paymentRef,
      manual_membership_review_required: true,
    });
  }
}

async function materializeRenewal(env, input) {
  const sessionId = input.snapshot.session_id;
  const renewalRows = await findByField(env, renewalsTable(env), ["renewal_session_id"], sessionId, 2);
  if (renewalRows.length !== 1) return entitlementReview(renewalRows.length ? "renewal_session_ambiguous" : "renewal_session_not_found");
  const renewal = renewalRows[0];
  const rf = renewal.fields || {};
  if (code(rf.liff_intent) !== "renew") return entitlementReview("renewal_intent_mismatch");
  if (BLOCKED.has(code(rf.renewal_flow_status))) return entitlementReview("renewal_session_blocked");
  const lineUserId = lineId(rf.line_user_id);
  if (!lineUserId) return entitlementReview("renewal_line_identity_missing");
  const requestedPackage = canonicalPackage(rf.requested_package || rf.package_code);
  if (requestedPackage && requestedPackage !== input.snapshot.package_code) return entitlementReview("renewal_package_mismatch");
  const renewalAmount = positiveAmount(rf.renewal_amount_thb ?? rf.amount_thb);
  if (renewalAmount != null && Math.abs(renewalAmount - input.snapshot.amount_thb) > 0.009) return entitlementReview("renewal_amount_mismatch");

  const members = await findByField(env, membersTable(env), ["line_id", "line_user_id"], lineUserId, 2);
  if (members.length !== 1) return entitlementReview(members.length ? "canonical_member_ambiguous" : "canonical_member_not_found");
  const member = members[0];
  const memberId = text(member.fields?.member_id, 120);
  if (!memberId) return entitlementReview("canonical_member_id_required");

  const packagePolicy = POLICY[input.snapshot.package_code];
  const catalog = await loadPackage(env, input.snapshot.package_code);
  if (!catalog || catalog.active !== true) return entitlementReview("membership_package_unavailable");
  if (catalog.require_approval === true) return entitlementReview("membership_package_requires_separate_approval");

  const rows = await airtableList(env, entitlementsTable(env), {
    filterByFormula: `{member_id}='${formulaValue(memberId)}'`,
    maxRecords: 100,
  });
  const snapshot = resolveMemberEntitlements(rows, { now: input.verified_at });
  if (snapshot.schema_version !== AUTHORITY || snapshot.fail_closed !== true) return entitlementReview("canonical_resolver_unavailable");
  if (snapshot.member_blocked === true || rows.some(blockedRow)) return entitlementReview("canonical_member_blocked");

  const exactRows = snapshot.entitlements.filter((item) => canonicalPackage(item.package_code) === input.snapshot.package_code);
  if (!exactRows.length) return entitlementReview("renewal_history_not_found");

  const existing = await airtableList(env, entitlementsTable(env), {
    filterByFormula: `{payment_ref}='${formulaValue(input.payment_ref)}'`,
    maxRecords: 3,
  });
  const entitlementId = deterministicEntitlementId(input.payment_ref, input.snapshot.package_code);
  if (existing.length > 1) return entitlementReview("payment_entitlement_payment_ref_ambiguous");
  if (existing.length === 1) {
    const ef = existing[0].fields || {};
    if (text(ef.entitlement_id, 180) !== entitlementId || text(ef.member_id, 120) !== memberId || canonicalPackage(ef.package_code) !== input.snapshot.package_code) {
      return entitlementReview("payment_entitlement_conflict");
    }
    await markRenewalMaterialized(env, renewal, input.proof, member, existing[0], input, lineUserId);
    return entitlementSuccess(existing[0], input, packagePolicy, true);
  }

  const futureExpiry = latestFutureExpiry(exactRows, input.verified_at);
  const startAt = futureExpiry || input.verified_at;
  const expireAt = addCalendarYears(startAt, packagePolicy.years)?.toISOString() || "";
  if (!expireAt) return entitlementReview("membership_term_invalid");
  const memberEmail = email(member.fields?.["Contact Email"] || member.fields?.email);
  const fields = compact({
    entitlement_id: entitlementId,
    member: [member.id],
    member_id: memberId,
    member_email: memberEmail || undefined,
    line_user_id: lineUserId,
    member_status: "active",
    member_lifecycle_status: "active",
    access_status: "active",
    capability: packagePolicy.capability,
    entitlement_level: packagePolicy.entitlement_level,
    package_code: input.snapshot.package_code,
    target_package_label: packagePolicy.label,
    start_at: startAt,
    expire_at: expireAt,
    membership_expiry_rule: futureExpiry
      ? `${packagePolicy.years}_year${packagePolicy.years === 1 ? "" : "s"}_from_current_expiry`
      : `${packagePolicy.years}_year${packagePolicy.years === 1 ? "" : "s"}_from_verified_payment`,
    source_ref: `payment:${input.payment_ref}`,
    payment_ref: input.payment_ref,
    notes: `Canonical signed web renewal; owner_policy=${OWNER_POLICY}; amount=${input.snapshot.amount_thb}; price_rule=${text(input.inference?.inferred_price_rule, 120)}; authority=${AUTHORITY}`,
  });

  const prospective = resolveMemberEntitlements([...rows, { fields }], { now: input.verified_at });
  if (prospective.schema_version !== AUTHORITY || prospective.fail_closed !== true || prospective.member_blocked === true) {
    return entitlementReview("prospective_resolver_rejected_entitlement");
  }

  const created = await airtableCreate(env, entitlementsTable(env), fields);
  const freshRows = await airtableList(env, entitlementsTable(env), {
    filterByFormula: `{member_id}='${formulaValue(memberId)}'`,
    maxRecords: 100,
  });
  const fresh = resolveMemberEntitlements(freshRows, { now: input.verified_at });
  const normalized = fresh.entitlements.find((item) => item.entitlement_id === entitlementId);
  if (!normalized || normalized.capability !== packagePolicy.capability || !EXTENDABLE.has(code(normalized.lifecycle)) || fresh.member_blocked === true) {
    await airtableUpdate(env, entitlementsTable(env), created.id, {
      access_status: "revoked",
      member_lifecycle_status: "revoked",
      member_status: "revoked",
      notes: `Rollback after resolver verification failure; payment_ref=${input.payment_ref}`,
    }).catch(() => {});
    return entitlementReview("post_write_resolver_verification_failed");
  }

  await markRenewalMaterialized(env, renewal, input.proof, member, created, input, lineUserId);
  return {
    status: "materialized",
    authority: AUTHORITY,
    entitlement_materialized: true,
    entitlement_record_id: created.id,
    duplicate: false,
    action: "renewal",
    package_code: input.snapshot.package_code,
    member_id: memberId,
    membership_expire_at: expireAt,
    membership_term: packagePolicy.years === 2 ? "2_years" : "1_year",
    membership_expiry_rule: fields.membership_expiry_rule,
    manual_membership_review_required: false,
    downstream_access_reconcile_required: true,
  };
}

async function markRenewalMaterialized(env, renewal, proof, member, entitlement, input, lineUserId) {
  const now = new Date().toISOString();
  await Promise.all([
    airtableUpdate(env, renewalsTable(env), renewal.id, {
      renewal_flow_status: "materialized",
      requested_package: input.snapshot.package_code,
      renewal_amount_thb: input.snapshot.amount_thb,
      "Member Entitlement": [entitlement.id],
      verified_at: now,
      materialized_at: now,
      reviewed_by: "payments-worker-web-renewal",
      review_note: `Canonical signed renewal accepted by ${OWNER_POLICY}; payment_ref=${input.payment_ref}`,
    }),
    airtableUpdate(env, proofsTable(env), proof.id, {
      member: [member.id],
      "MMD — LIFF Renewal Sessions": [renewal.id],
      status: "verified",
      verified_by: "payments-worker-web-renewal",
    }),
  ]);
}

function entitlementSuccess(row, input, policy, duplicate) {
  const f = row.fields || {};
  return {
    status: "materialized",
    authority: AUTHORITY,
    entitlement_materialized: true,
    entitlement_record_id: row.id,
    duplicate,
    action: "renewal",
    package_code: input.snapshot.package_code,
    member_id: text(f.member_id, 120) || null,
    membership_expire_at: iso(f.expire_at) || null,
    membership_term: policy.years === 2 ? "2_years" : "1_year",
    membership_expiry_rule: text(f.membership_expiry_rule, 120) || null,
    manual_membership_review_required: false,
    downstream_access_reconcile_required: true,
  };
}

function entitlementReview(reason) {
  return {
    status: "review_required",
    authority: AUTHORITY,
    entitlement_materialized: false,
    reason,
    manual_membership_review_required: true,
    downstream_access_reconcile_required: false,
  };
}

function reviewReceipt(reason) {
  return {
    status: "review_required",
    authority: "payments-worker",
    reason,
    owner_policy: OWNER_POLICY,
    entitlement_materialized: false,
    manual_membership_review_required: true,
  };
}

function withSettlement(response, payload, receipt) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  const paid = receipt.status === "paid" || receipt.status === "materialized" || receipt.payment_status === "paid";
  return new Response(JSON.stringify({
    ...payload,
    ...(paid ? { payment_status: "paid", verification_status: "verified", evidence_submitted: true } : {}),
    entitlement_materialized: receipt.entitlement_materialized === true,
    entitlement_record_id: receipt.entitlement_record_id || undefined,
    membership_expire_at: receipt.membership_expire_at || undefined,
    membership_term: receipt.membership_term || undefined,
    membership_expiry_rule: receipt.membership_expiry_rule || undefined,
    manual_membership_review_required: receipt.manual_membership_review_required === true,
    downstream_access_reconcile_required: receipt.downstream_access_reconcile_required === true,
    renewal_settlement: receipt,
    owner_policy: receipt.owner_policy || (paid ? OWNER_POLICY : undefined),
  }), { status: response.status, statusText: response.statusText, headers });
}

async function resolveProof(env, payload, paymentRef) {
  const recordId = recordIdValue(payload.proof_record_id);
  if (recordId) {
    try { return await airtableGet(env, proofsTable(env), recordId); } catch {}
  }
  const rows = await findByField(env, proofsTable(env), ["payment_ref", "transaction_ref"], paymentRef, 2);
  return rows.length === 1 ? rows[0] : null;
}

function paymentSnapshot(record) {
  const f = record?.fields || {};
  return {
    payment_ref: text(firstValue(f, ["payment_ref", "Payment Reference"]), 180),
    session_id: text(firstValue(f, ["session_id", "Session ID"]), 180),
    payment_stage: code(firstValue(f, ["payment_stage", "payment_type", "stage"]) || "membership"),
    amount_thb: positiveAmount(firstValue(f, ["amount_thb", "amount", "Amount", "Amount THB"])),
    package_code: canonicalPackage(firstValue(f, ["package_code", "package", "Package Code"])),
  };
}

function appendPolicyNote(value) {
  const base = text(value, 3500);
  const suffix = `owner_policy=${OWNER_POLICY}; payment_truth=verified_by_owner_membership_policy; receiving_account_required=false`;
  return base ? `${base}; ${suffix}`.slice(0, 4000) : suffix;
}

function uploadedFile(form) {
  const value = form.get("file") || form.get("slip") || form.get("proof") || form.get("receipt") || form.get("receipt_photo");
  return Boolean(value && typeof value === "object" && typeof value.arrayBuffer === "function" && Number(value.size || 0) > 0);
}

async function loadPackage(env, packageCode) {
  const rows = await airtableList(env, packagesTable(env), {
    filterByFormula: `{code}='${formulaValue(packageCode)}'`,
    maxRecords: 2,
  });
  if (rows.length !== 1) return null;
  const f = rows[0].fields || {};
  return { active: f.is_active !== false, require_approval: f.require_approval === true };
}

function latestFutureExpiry(rows, nowIso) {
  const now = Date.parse(nowIso);
  const values = rows
    .filter((item) => EXTENDABLE.has(code(item.lifecycle)))
    .map((item) => Date.parse(item.expire_at || ""))
    .filter((value) => Number.isFinite(value) && value > now);
  return values.length ? new Date(Math.max(...values)).toISOString() : "";
}

function addCalendarYears(value, years) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !Number.isInteger(years) || years < 1) return null;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

function blockedRow(row) {
  const f = row?.fields || {};
  return BLOCKED.has(code(f.member_lifecycle_status || f.member_status)) || BLOCKED.has(code(f.access_status));
}

function deterministicEntitlementId(paymentRef, packageCode) {
  return `pay_${code(paymentRef).slice(0, 80) || "payment"}_${packageCode}`.slice(0, 180);
}

async function findByField(env, tableName, fieldNames, value, maxRecords = 2) {
  for (const field of fieldNames) {
    try {
      const rows = await airtableList(env, tableName, {
        filterByFormula: `{${field}}='${formulaValue(value)}'`,
        maxRecords,
      });
      if (rows.length) return rows;
    } catch (error) {
      if (Number(error?.status) !== 422) throw error;
    }
  }
  return [];
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

async function airtableGet(env, tableName, recordId) {
  const response = await airtableFetch(env, new Request(`${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId)}`, {
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` },
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
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
  const url = `${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId)}`;
  const response = await airtableFetch(env, new Request(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
}

function airtableFetch(env, request) { return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request); }
function airtableUrl(env, tableName) { return new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`); }
function paymentsTable(env) { return clean(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || PAYMENTS); }
function proofsTable(env) { return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || PROOFS); }
function renewalsTable(env) { return clean(env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || RENEWALS); }
function membersTable(env) { return clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || MEMBERS); }
function entitlementsTable(env) { return clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENTS); }
function packagesTable(env) { return clean(env.AIRTABLE_TABLE_PACKAGES_ID || env.AIRTABLE_TABLE_PACKAGES || PACKAGES); }

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}

function firstValue(fields, keys) { for (const key of keys) if (fields[key] !== undefined && fields[key] !== null && fields[key] !== "") return fields[key]; return null; }
function canonicalPackage(value) { const raw = code(value); if (raw.includes("premium")) return "premium"; if (raw.includes("standard") || raw.includes("lite")) return "standard"; return ""; }
function positiveAmount(value) { const n = Number(String(value ?? "").replace(/,/g, "").trim()); return Number.isFinite(n) && n > 0 ? Math.round((n + Number.EPSILON) * 100) / 100 : null; }
function recordIdValue(value) { const id = text(value, 100); return /^rec[A-Za-z0-9]{6,32}$/.test(id) ? id : ""; }
function lineId(value) { const id = text(value, 100); return /^U[A-Za-z0-9_-]{20,80}$/.test(id) ? id : ""; }
function email(value) { const v = clean(value, 320).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ""; }
function iso(value) { const n = Date.parse(String(value || "")); return Number.isFinite(n) ? new Date(n).toISOString() : ""; }
function formulaValue(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function code(value) { return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function text(value, max = 240) { return clean(value, max).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max); }
function clean(value, max = 4000) { return String(value == null ? "" : value).trim().slice(0, max); }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== "")); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
