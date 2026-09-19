import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";

const ACCESS_LOG_TABLE = "System — Access Log";
const ENTITLEMENT_TABLE = "MMD — Member Entitlements";
const PAYMENT_EVIDENCE_ACTION = "membership_payment_evidence";
const APPROVAL_AUDIT_ACTION = "membership_entitlement_materialized";
const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const OWNER_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);
const BLOCKED_MEMBER_STATUSES = new Set(["blocked", "suspended", "revoked"]);

const PRODUCT_RULES = Object.freeze({
  black_card: Object.freeze({
    capability: "black_card",
    package_code: "black_card",
    relationship_tier: "black_card",
    duration_days: 365,
    protected: true,
  }),
});

export const PAYMENT_ENTITLEMENT_APPROVAL_PATH = "/v1/admin/membership/payment-entitlement/approve";

export function isPaymentEntitlementApprovalRequest(path, method = "POST") {
  return normalizePath(path) === PAYMENT_ENTITLEMENT_APPROVAL_PATH && String(method || "").toUpperCase() === "POST";
}

export async function handlePaymentEntitlementApproval(request, env = {}, actor = null) {
  if (!isPaymentEntitlementApprovalRequest(new URL(request.url).pathname, request.method)) {
    return json({ ok: false, error: "not_found", authority: AUTHORITY }, 404);
  }

  const approvedBy = safeActor(actor?.id);
  const actorRole = safeCode(actor?.role);
  if (!approvedBy || !actorRole) {
    return json({ ok: false, error: "authenticated_admin_required", authority: AUTHORITY }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_approval_request", authority: AUTHORITY }, 400);
  }

  const decision = safeCode(body.decision);
  const eventId = safeEventId(body.event_id);
  const approvalReason = safeText(body.approval_reason, 600);
  if (decision !== "approve" || !eventId || approvalReason.length < 5) {
    return json({
      ok: false,
      error: "explicit_approval_required",
      details: {
        decision_required: decision !== "approve",
        event_id_required: !eventId,
        approval_reason_required: approvalReason.length < 5,
      },
      authority: AUTHORITY,
    }, 400);
  }

  try {
    requireAirtable(env);

    const payment = await loadCanonicalPaymentEvidence(env, eventId);
    if (!payment) return json({ ok: false, error: "payment_evidence_not_found", authority: AUTHORITY }, 404);
    if (payment.ambiguous) return json({ ok: false, error: "payment_evidence_ambiguous", authority: AUTHORITY }, 409);

    const evidenceCheck = validateCanonicalPaymentEvidence(payment);
    if (!evidenceCheck.ok) {
      return json({ ok: false, error: evidenceCheck.error, authority: AUTHORITY }, evidenceCheck.status);
    }

    const evidence = evidenceCheck.evidence;
    const rule = PRODUCT_RULES[evidence.product];
    if (!rule) {
      return json({ ok: false, error: "unsupported_membership_product", authority: AUTHORITY }, 422);
    }

    if (rule.protected && !OWNER_ROLES.has(actorRole)) {
      return json({ ok: false, error: "protected_approval_requires_owner", authority: AUTHORITY }, 403);
    }

    const currentRows = await loadMemberEntitlements(env, evidence.member_email);
    if (!currentRows.length) {
      return json({ ok: false, error: "canonical_member_match_lost", authority: AUTHORITY }, 409);
    }

    const identity = resolveCanonicalIdentity(currentRows);
    if (!identity.ok) {
      return json({ ok: false, error: identity.error, authority: AUTHORITY }, 409);
    }

    if (evidence.canonical_member_record_ids.length) {
      const currentIds = new Set(currentRows.map((row) => safeText(row?.id, 100)).filter(Boolean));
      const overlaps = evidence.canonical_member_record_ids.some((id) => currentIds.has(id));
      if (!overlaps) {
        return json({ ok: false, error: "canonical_member_evidence_stale", authority: AUTHORITY }, 409);
      }
    }

    if (isBlockedMember(currentRows)) {
      return json({ ok: false, error: "canonical_member_blocked", authority: AUTHORITY }, 409);
    }

    const sourceRef = `operator-payment:${safeText(evidence.payment_reference, 180)}`;
    const entitlementId = await deterministicEntitlementId(eventId, evidence.payment_reference);
    const existing = await findMaterializedEntitlement(env, sourceRef, entitlementId);
    if (existing.ambiguous) {
      return json({ ok: false, error: "payment_entitlement_ambiguous", authority: AUTHORITY }, 409);
    }
    if (existing.record) {
      if (!sameMaterialization(existing.record, {
        entitlementId,
        memberEmail: evidence.member_email,
        packageCode: rule.package_code,
        capability: rule.capability,
        sourceRef,
      })) {
        return json({ ok: false, error: "payment_entitlement_conflict", authority: AUTHORITY }, 409);
      }

      const snapshot = resolveMemberEntitlements(currentRows);
      return json({
        ok: true,
        duplicate: true,
        authority: AUTHORITY,
        entitlement_record_id: safeText(existing.record.id, 100),
        snapshot: safeSnapshot(snapshot),
      }, 200);
    }

    const currentSnapshot = resolveMemberEntitlements(currentRows);
    if (rule.protected && currentSnapshot.capability_state?.active?.includes(rule.capability)) {
      return json({ ok: false, error: "protected_entitlement_already_active", authority: AUTHORITY }, 409);
    }

    const approvedAt = new Date().toISOString();
    const expireAt = addDays(approvedAt, rule.duration_days);
    const entitlementFields = compact({
      entitlement_id: entitlementId,
      member_email: evidence.member_email,
      memberstack_id: identity.memberstack_id,
      line_user_id: identity.line_user_id,
      member_status: "active",
      access_status: "active",
      capability: rule.capability,
      entitlement_level: rule.capability,
      package_code: rule.package_code,
      relationship_tier: rule.relationship_tier,
      start_at: approvedAt,
      expire_at: expireAt,
      source: "admin_payment_approval",
      source_ref: sourceRef,
    });

    const prospective = resolveMemberEntitlements([...currentRows, { fields: entitlementFields }], { now: approvedAt });
    if (!prospective.capability_state?.active?.includes(rule.capability)) {
      return json({ ok: false, error: "prospective_resolver_rejected_entitlement", authority: AUTHORITY }, 409);
    }

    const created = await airtableCreate(env, entitlementTable(env), entitlementFields);
    let freshRows = await loadMemberEntitlements(env, evidence.member_email);
    let freshSnapshot = resolveMemberEntitlements(freshRows);
    if (!freshSnapshot.capability_state?.active?.includes(rule.capability)) {
      await revokeCreatedEntitlement(env, created.id, "post_write_resolver_verification_failed");
      return json({ ok: false, error: "post_write_resolver_verification_failed", authority: AUTHORITY }, 503);
    }

    let audit;
    try {
      audit = await writeApprovalAudit(env, {
        member_email: evidence.member_email,
        actor: approvedBy,
        approval_reason: approvalReason,
        payment_event_id: eventId,
        payment_source_ref: payment.source_ref,
        payment_reference: evidence.payment_reference,
        product: evidence.product,
        entitlement_record_id: created.id,
        entitlement_id: entitlementId,
        capability: rule.capability,
        package_code: rule.package_code,
        start_at: approvedAt,
        expire_at: expireAt,
        snapshot: freshSnapshot,
      });
    } catch (error) {
      await revokeCreatedEntitlement(env, created.id, "approval_audit_write_failed");
      return json({
        ok: false,
        error: "approval_audit_write_failed",
        failure_class: safeFailure(error),
        authority: AUTHORITY,
      }, 503);
    }

    freshRows = await loadMemberEntitlements(env, evidence.member_email);
    freshSnapshot = resolveMemberEntitlements(freshRows);

    return json({
      ok: true,
      duplicate: false,
      authority: AUTHORITY,
      approval_event_id: audit.event_id,
      entitlement_record_id: safeText(created.id, 100),
      snapshot: safeSnapshot(freshSnapshot),
    }, 200);
  } catch (error) {
    return json({
      ok: false,
      error: "payment_entitlement_approval_unavailable",
      failure_class: safeFailure(error),
      authority: AUTHORITY,
    }, 503);
  }
}

async function loadCanonicalPaymentEvidence(env, eventId) {
  const table = accessLogTable(env);
  const formula = `AND({Action}=${formulaString(PAYMENT_EVIDENCE_ACTION)},{Event ID}=${formulaString(eventId)})`;
  const records = await airtableList(env, table, { filterByFormula: formula, maxRecords: 2 });
  if (!records.length) return null;
  if (records.length > 1) return { ambiguous: true };
  const record = records[0];
  const fields = record.fields || {};
  return {
    ambiguous: false,
    record_id: safeText(record.id, 100),
    event_id: safeEventId(fields["Event ID"]),
    result: safeCode(fields.Result),
    reason: safeCode(fields.Reason),
    member_email: normalizeEmail(fields["Member Email"]),
    source_ref: safeText(fields["Source Ref"], 240),
    before: parseJson(fields["Before JSON"]),
  };
}

function validateCanonicalPaymentEvidence(payment) {
  const before = payment.before || {};
  const event = safeCode(before.event);
  const paymentReference = safeText(before.payment_reference, 180);
  const product = safeCode(before.product);
  const memberMatch = before.member_match === true;
  const ids = Array.isArray(before.canonical_member_record_ids)
    ? before.canonical_member_record_ids.map((value) => safeText(value, 100)).filter(Boolean)
    : [];

  if (payment.result !== "success") return { ok: false, error: "payment_evidence_not_successful", status: 409 };
  if (event !== "membership_payment_verified") return { ok: false, error: "payment_not_verified", status: 409 };
  if (!payment.member_email || !memberMatch) return { ok: false, error: "payment_member_not_matched", status: 409 };
  if (!paymentReference) return { ok: false, error: "payment_reference_required", status: 409 };
  if (!product) return { ok: false, error: "payment_product_required", status: 409 };
  if (payment.reason !== "pending_canonical_resolution") return { ok: false, error: "payment_not_pending_canonical_resolution", status: 409 };

  return {
    ok: true,
    evidence: {
      event,
      member_email: payment.member_email,
      payment_reference: paymentReference,
      product,
      verified_at: isoOrEmpty(before.verified_at),
      canonical_member_record_ids: ids,
    },
  };
}

async function loadMemberEntitlements(env, email) {
  const field = String(env.AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD || "member_email").trim() || "member_email";
  const formula = `LOWER({${field}})=${formulaString(email)}`;
  return airtableList(env, entitlementTable(env), { filterByFormula: formula, maxRecords: 100 });
}

function resolveCanonicalIdentity(rows) {
  const memberstack = unique(rows.map((row) => safeText(row?.fields?.memberstack_id, 160)).filter(Boolean));
  const line = unique(rows.map((row) => safeText(row?.fields?.line_user_id, 160)).filter(Boolean));
  if (memberstack.length > 1 || line.length > 1) return { ok: false, error: "canonical_member_ambiguous" };
  return { ok: true, memberstack_id: memberstack[0] || "", line_user_id: line[0] || "" };
}

function isBlockedMember(rows) {
  return rows.some((row) => {
    const fields = row?.fields || {};
    const status = safeCode(fields.member_status || fields["Membership Status"]);
    return BLOCKED_MEMBER_STATUSES.has(status);
  });
}

async function findMaterializedEntitlement(env, sourceRef, entitlementId) {
  const formula = `OR({source_ref}=${formulaString(sourceRef)},{entitlement_id}=${formulaString(entitlementId)})`;
  const records = await airtableList(env, entitlementTable(env), { filterByFormula: formula, maxRecords: 2 });
  return { ambiguous: records.length > 1, record: records[0] || null };
}

function sameMaterialization(record, expected) {
  const fields = record?.fields || {};
  return safeText(fields.entitlement_id, 180) === expected.entitlementId
    && normalizeEmail(fields.member_email) === expected.memberEmail
    && safeCode(fields.package_code) === expected.packageCode
    && safeCode(fields.capability || fields.entitlement_level) === expected.capability
    && safeText(fields.source_ref, 240) === expected.sourceRef;
}

async function revokeCreatedEntitlement(env, recordId, reason) {
  if (!recordId) return;
  try {
    await airtableUpdate(env, entitlementTable(env), recordId, {
      access_status: "revoked",
      member_status: "revoked",
      source: "admin_payment_approval_rollback",
      source_ref: `rollback:${safeCode(reason)}:${safeText(recordId, 100)}`,
    });
  } catch {
    // Preserve the original failure response; reconciliation/audit will surface any rollback failure.
  }
}

async function writeApprovalAudit(env, input) {
  const eventId = `mmdpa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const fields = compact({
    "Member Email": normalizeEmail(input.member_email),
    "Identity Ref": normalizeEmail(input.member_email) ? `email:${normalizeEmail(input.member_email)}` : "unknown",
    Action: APPROVAL_AUDIT_ACTION,
    Target: "member_entitlement",
    Result: "success",
    "Event ID": eventId,
    "Created At (ISO)": new Date().toISOString(),
    "Source Ref": `payment-approval:${safeEventId(input.payment_event_id)}`,
    Reason: "approved",
    "Before JSON": boundedJson({
      payment_event_id: safeEventId(input.payment_event_id),
      payment_source_ref: safeText(input.payment_source_ref, 240),
      payment_reference: safeText(input.payment_reference, 180),
      product: safeCode(input.product),
      approval_reason: safeText(input.approval_reason, 600),
    }),
    "After JSON": boundedJson({
      entitlement_record_id: safeText(input.entitlement_record_id, 100),
      entitlement_id: safeText(input.entitlement_id, 180),
      capability: safeCode(input.capability),
      package_code: safeCode(input.package_code),
      start_at: isoOrEmpty(input.start_at),
      expire_at: isoOrEmpty(input.expire_at),
    }),
    "Snapshot JSON": boundedJson(safeSnapshot(input.snapshot)),
    Actor: safeActor(input.actor),
  });
  const record = await airtableCreate(env, accessLogTable(env), fields);
  return { event_id: eventId, record_id: record.id };
}

function safeSnapshot(snapshot = {}) {
  return {
    schema_version: safeText(snapshot.schema_version, 120) || AUTHORITY,
    member_blocked: snapshot.member_blocked === true,
    capability_state: {
      active: Array.isArray(snapshot.capability_state?.active) ? [...snapshot.capability_state.active] : [],
      expiring_soon: Array.isArray(snapshot.capability_state?.expiring_soon) ? [...snapshot.capability_state.expiring_soon] : [],
      grace: Array.isArray(snapshot.capability_state?.grace) ? [...snapshot.capability_state.grace] : [],
    },
    access: snapshot.access && typeof snapshot.access === "object" ? { ...snapshot.access } : {},
  };
}

async function airtableList(env, tableName, params = {}) {
  const url = airtableUrl(env, tableName);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch(env, new Request(url.toString(), {
    headers: { Authorization: `Bearer ${String(env.AIRTABLE_API_KEY).trim()}` },
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.records)) throw new Error(`payment_entitlement_airtable_list_${response.status || "malformed"}`);
  return data.records;
}

async function airtableCreate(env, tableName, fields) {
  const response = await airtableFetch(env, new Request(airtableUrl(env, tableName).toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(env.AIRTABLE_API_KEY).trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  }));
  const data = await response.json().catch(() => ({}));
  const record = data?.records?.[0];
  if (!response.ok || !record?.id) throw new Error(`payment_entitlement_airtable_create_${response.status || "malformed"}`);
  return record;
}

async function airtableUpdate(env, tableName, recordId, fields) {
  const response = await airtableFetch(env, new Request(airtableUrl(env, tableName).toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${String(env.AIRTABLE_API_KEY).trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ records: [{ id: recordId, fields }], typecast: false }),
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.records?.[0]?.id) throw new Error(`payment_entitlement_airtable_update_${response.status || "malformed"}`);
  return data.records[0];
}

function airtableUrl(env, tableName) {
  return new URL(`https://api.airtable.com/v0/${encodeURIComponent(String(env.AIRTABLE_BASE_ID).trim())}/${encodeURIComponent(tableName)}`);
}

async function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

async function deterministicEntitlementId(eventId, paymentReference) {
  const bytes = new TextEncoder().encode(`${eventId}|${paymentReference}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `mmdpe_ent_${hex.slice(0, 24)}`;
}

function addDays(iso, days) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString();
}

function requireAirtable(env) {
  if (!String(env.AIRTABLE_API_KEY || "").trim() || !String(env.AIRTABLE_BASE_ID || "").trim()) {
    throw new Error("payment_entitlement_airtable_not_configured");
  }
}

function accessLogTable(env) {
  return String(env.AIRTABLE_TABLE_ACCESS_LOG || ACCESS_LOG_TABLE).trim() || ACCESS_LOG_TABLE;
}

function entitlementTable(env) {
  return String(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENT_TABLE).trim() || ENTITLEMENT_TABLE;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private" },
  });
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function boundedJson(value) {
  const raw = JSON.stringify(value ?? {});
  return raw.length <= 12000 ? raw : JSON.stringify({ truncated: true, original_length: raw.length });
}

function formulaString(value) {
  return `'${String(value || "").replace(/'/g, "\\'")}'`;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function isoOrEmpty(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function safeEventId(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_:\-.]/g, "_").slice(0, 180);
}

function safeActor(value) {
  return safeCode(value).slice(0, 120);
}

function safeCode(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_:\-.]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 160);
}

function safeText(value, max = 500) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}

function safeFailure(error) {
  return safeCode(error?.message || error || "unknown_failure") || "unknown_failure";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
