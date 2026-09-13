import { resolveAutomaticPaymentContext } from "./payment-review-auto-context.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_MEMBERS_TABLE = "tblgWc5VRon5o8Mhk";
const DEFAULT_SESSIONS_TABLE = "Sessions";
const SERVICE_STAGES = new Set(["deposit", "final", "full", "tips"]);
const PAYMENT_STAGES = new Set([...SERVICE_STAGES, "membership"]);
const AUTO_MEMBERSHIP_PACKAGES = new Set(["mmd_member", "elite", "red_card", "standard", "premium"]);

export function parseOperatorPaymentContext(body = {}) {
  return {
    payment_stage: optionalStage(body.payment_stage || body.stage || body.payment_type),
    session_id: safeText(body.session_id, 180),
    member_email: normalizeEmail(body.member_email || body.email),
    package_code: canonicalPackageCode(body.package_code || body.package),
    customer_name: safeText(body.customer_name || body.client_name, 180),
    model_name: safeText(body.model_name, 180),
  };
}

export function hasOperatorPaymentContext(context = {}) {
  return Boolean(context.payment_stage || context.session_id || context.member_email || context.package_code || context.customer_name || context.model_name);
}

export function operatorPaymentContextForAudit(context = {}) {
  return {
    payment_stage: optionalStage(context.payment_stage),
    session_id: safeText(context.session_id, 180) || null,
    member_email: normalizeEmail(context.member_email) || null,
    package_code: canonicalPackageCode(context.package_code) || null,
    customer_name: safeText(context.customer_name, 180) || null,
    model_name: safeText(context.model_name, 180) || null,
    identity_authority: "session_or_member_exact_match",
    customer_model_labels_authoritative: false,
  };
}

export function mergeOperatorPaymentContext(canonicalFields = {}, context = {}) {
  if (!hasOperatorPaymentContext(context)) return { ...canonicalFields };
  const canonicalStage = optionalStage(canonicalFields.payment_stage || canonicalFields.payment_type);
  const operatorStage = optionalStage(context.payment_stage);
  if (canonicalStage && operatorStage && canonicalStage !== operatorStage) throw httpError(409, "operator_context_stage_mismatch");
  const canonicalSession = safeText(canonicalFields.session_id, 180);
  const operatorSession = safeText(context.session_id, 180);
  if (canonicalSession && operatorSession && canonicalSession !== operatorSession) throw httpError(409, "operator_context_session_mismatch");
  const canonicalEmail = normalizeEmail(canonicalFields.member_email || canonicalFields.email);
  const operatorEmail = normalizeEmail(context.member_email);
  if (canonicalEmail && operatorEmail && canonicalEmail !== operatorEmail) throw httpError(409, "operator_context_member_mismatch");
  const canonicalPackage = canonicalPackageCode(canonicalFields.package_code);
  const operatorPackage = canonicalPackageCode(context.package_code);
  if (canonicalPackage && operatorPackage && canonicalPackage !== operatorPackage) throw httpError(409, "operator_context_package_mismatch");
  return {
    ...canonicalFields,
    payment_stage: canonicalStage || operatorStage || canonicalFields.payment_stage,
    payment_type: canonicalStage || operatorStage || canonicalFields.payment_type,
    session_id: canonicalSession || operatorSession || canonicalFields.session_id,
    member_email: canonicalEmail || operatorEmail || canonicalFields.member_email,
    package_code: canonicalPackage || operatorPackage || canonicalFields.package_code,
  };
}

export async function resolveOperatorPaymentContext(env = {}, context = {}, evidence = {}) {
  if (!hasOperatorPaymentContext(context)) return resolveAutomaticPaymentContext(env, evidence);
  const paymentStage = optionalStage(context.payment_stage);
  if (!paymentStage) throw httpError(409, "operator_context_payment_stage_required");
  const paymentRef = safeText(evidence.payment_ref, 180);
  const amountThb = positiveAmount(evidence.amount_thb);
  if (!paymentRef || amountThb == null) throw httpError(409, "operator_context_requires_verified_money_evidence");

  if (SERVICE_STAGES.has(paymentStage)) {
    const sessionId = safeText(context.session_id, 180);
    if (!sessionId) throw httpError(409, "operator_context_session_required");
    const session = await findSessionBySessionId(env, sessionId);
    if (!session) throw httpError(409, "operator_context_session_not_found");
    return {
      context_source: "owner_context_match",
      operator_context: { ...operatorPaymentContextForAudit(context), session_record_id: session.id },
      payment_fields: {
        payment_ref: paymentRef,
        amount_thb: amountThb,
        payment_stage: paymentStage,
        payment_type: paymentStage,
        session_id: sessionId,
        payment_method: "promptpay",
      },
    };
  }

  const memberEmail = normalizeEmail(context.member_email);
  if (!memberEmail) throw httpError(409, "operator_context_member_email_required");
  const packageCode = canonicalPackageCode(context.package_code);
  if (!packageCode) throw httpError(409, "operator_context_package_required");
  if (!AUTO_MEMBERSHIP_PACKAGES.has(packageCode)) throw httpError(409, "operator_context_package_requires_special_review");
  const member = await findMemberByEmail(env, memberEmail);
  if (!member) throw httpError(409, "operator_context_member_not_found");
  return {
    context_source: "owner_context_match",
    operator_context: { ...operatorPaymentContextForAudit(context), member_record_id: member.id },
    payment_fields: {
      payment_ref: paymentRef,
      amount_thb: amountThb,
      payment_stage: "membership",
      payment_type: "membership",
      member_email: memberEmail,
      package_code: packageCode,
      payment_method: "promptpay",
    },
  };
}

async function findSessionBySessionId(env, sessionId) {
  const ids = new Map();
  for (const field of ["session_id", "Session ID", "job_id", "Job ID"]) {
    try {
      const records = await airtableList(env, sessionsTable(env), { filterByFormula: `{${field}}='${formulaValue(sessionId)}'`, maxRecords: 2 });
      for (const record of records) if (record?.id) ids.set(record.id, record);
      if (ids.size > 1) throw httpError(409, "operator_context_session_ambiguous");
    } catch (error) {
      if (Number(error?.status) === 409) throw error;
      if (Number(error?.status) !== 422) throw error;
    }
  }
  return ids.size === 1 ? [...ids.values()][0] : null;
}

async function findMemberByEmail(env, email) {
  const ids = new Map();
  for (const field of ["Contact Email", "email", "member_email"]) {
    try {
      const records = await airtableList(env, membersTable(env), { filterByFormula: `LOWER({${field}})='${formulaValue(email)}'`, maxRecords: 2 });
      for (const record of records) if (record?.id) ids.set(record.id, record);
      if (ids.size > 1) throw httpError(409, "operator_context_member_ambiguous");
    } catch (error) {
      if (Number(error?.status) === 409) throw error;
      if (Number(error?.status) !== 422) throw error;
    }
  }
  return ids.size === 1 ? [...ids.values()][0] : null;
}

async function airtableList(env, table, params = {}) {
  if (!clean(env.AIRTABLE_BASE_ID) || !clean(env.AIRTABLE_API_KEY)) throw httpError(503, "airtable_not_ready");
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const request = new Request(url.toString(), { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  if (!Array.isArray(payload.records)) throw httpError(502, "airtable_malformed");
  return payload.records;
}

function sessionsTable(env) { return clean(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE); }
function membersTable(env) { return clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || DEFAULT_MEMBERS_TABLE); }

function optionalStage(value) {
  const stage = safeCode(value);
  if (!stage) return "";
  if (!PAYMENT_STAGES.has(stage)) throw httpError(409, "operator_context_payment_stage_invalid");
  return stage;
}

function canonicalPackageCode(value) {
  const raw = safeCode(value).replace(/-/g, "_");
  if (!raw) return "";
  if (raw === "mmd_member" || raw === "member_690" || raw === "membership" || raw === "public_member") return "mmd_member";
  if (raw === "elite" || raw === "elite_membership") return "elite";
  if (raw === "red_card" || raw === "redcard" || raw.includes("red_card") || raw.includes("redcard")) return "red_card";
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  if (raw === "blackcard" || raw === "black_card" || raw.includes("blackcard")) return "blackcard";
  return "";
}

function positiveAmount(value) {
  if (value == null || clean(value) === "") return null;
  const amount = Number(clean(value).replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
function normalizeEmail(value) { const email = clean(value).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function formulaValue(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function safeCode(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_:\-.]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 160); }
function safeText(value, max = 500) { return clean(value).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max); }
function clean(value) { return String(value ?? "").trim(); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
