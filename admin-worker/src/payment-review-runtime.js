import { inferMembershipPayment, membershipInferenceLabel } from "../../shared/payment-intelligence.mjs";

const QUEUE_PATH = "/v1/admin/payments/review-queue";
const REVIEW_PATH = "/v1/admin/payments/review";
const EVIDENCE_PATH = "/v1/admin/payments/evidence";
const ACCESS_LOG_TABLE = "System — Access Log";
const PAYMENT_REVIEW_ACTION = "payment_review_decision";
const PAYMENT_STAGES = new Set(["deposit", "final", "tips", "full", "membership"]);
const REVIEWABLE_STATES = new Set(["pending", "review", "review_required", "needs_review", "unmatched", "new", "submitted"]);
const HISTORICAL_SCHEMA = "mmd_historical_slip_backfill_v1";
const AIRTABLE_API = "https://api.airtable.com/v0";
const CANONICAL_PAYMENTS_TABLE_ID = "tblWGGJJOx5eBvBZJ";
const CANONICAL_MEMBERS_TABLE_ID = "tblgWc5VRon5o8Mhk";
const CANONICAL_CLIENTS_TABLE_ID = "tblVv58TCbwh5j1fS";
const CANONICAL_ENTITLEMENTS_TABLE_ID = "tblNImdF9PKAxhXGi";
const CANONICAL_LIFF_RENEWAL_TABLE_ID = "tblXjQFwo0A2cHseh";
const RECOVERY_APPROVER_ROLES = new Set(["owner", "admin"]);
const RECOVERY_CHANNELS = new Set(["line_ofc", "line_oa", "line"]);
const RECOVERY_BLOCKED_STATES = new Set(["rejected", "cancelled", "canceled", "blocked", "revoked", "failed"]);

export const PAYMENT_REVIEW_ROUTES = Object.freeze({
  queue: QUEUE_PATH,
  review: REVIEW_PATH,
  evidence: EVIDENCE_PATH,
});

export function isPaymentReviewRequest(path, method = "GET") {
  const normalized = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  if (normalized === QUEUE_PATH) return verb === "GET" || verb === "OPTIONS";
  if (normalized === EVIDENCE_PATH) return verb === "GET" || verb === "HEAD" || verb === "OPTIONS";
  if (normalized === REVIEW_PATH) return verb === "POST" || verb === "OPTIONS";
  return false;
}

export async function handlePaymentReviewRequest(request, env = {}, actor = null) {
  const path = normalizePath(new URL(request.url).pathname);
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders() });
  if (!isPaymentReviewRequest(path, method)) return json({ ok: false, error: "not_found" }, 404);

  const actorId = safeActor(actor?.id);
  const actorRole = safeCode(actor?.role);
  if (!actorId || !actorRole) return json({ ok: false, error: "authenticated_admin_required" }, 401);

  try {
    requireAirtable(env);
    if (path === QUEUE_PATH) return await listReviewQueue(request, env);
    if (path === EVIDENCE_PATH) return await getPaymentEvidence(request, env);
    return await commitReview(request, env, { id: actorId, role: actorRole });
  } catch (error) {
    return json({
      ok: false,
      error: safeCode(error?.message || error || "payment_review_unavailable"),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

async function getPaymentEvidence(request, env) {
  const proofId = safeText(new URL(request.url).searchParams.get("proof_id"), 120);
  if (!proofId) throw httpError(400, "proof_id_required");
  const proof = await loadProof(env, proofId);
  if (!proof) throw httpError(404, "payment_proof_not_found");
  const note = parseNote(proof.fields?.note);
  const key = safeEvidenceKey(note.r2_key);
  if (!key) throw httpError(404, "payment_evidence_not_available");
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.get !== "function") {
    throw httpError(503, "payment_evidence_storage_unavailable");
  }
  const object = await env.LINE_SLIP_EVIDENCE.get(key);
  if (!object) throw httpError(404, "payment_evidence_not_found");
  const contentType = safeImageContentType(object.httpMetadata?.contentType || note.mime_type);
  if (!contentType) throw httpError(415, "payment_evidence_mime_unsupported");
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "no-store, private",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}

async function listReviewQueue(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const records = await airtableList(env, paymentProofTable(env), {
    filterByFormula: reviewablePaymentProofFormula(),
    maxRecords: Math.min(Math.max(limit * 4, limit), 100),
    sort: [{ field: "created_at", direction: "desc" }],
  });
  const items = records
    .map(safeQueueItem)
    .filter(Boolean)
    .filter((item) => item.reviewable)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, limit);

  return json({
    ok: true,
    authority: "payments-worker",
    source: "payment_proofs",
    ordering: "created_at_desc",
    items,
    guardrails: {
      browser_can_mark_paid: false,
      browser_can_award_points: false,
      browser_can_mutate_membership: false,
      browser_can_mutate_entitlement: false,
      historical_backfill_separate: true,
      manual_recovery_requires_owner_admin: true,
      manual_recovery_requires_canonical_member: true,
    },
  });
}

async function commitReview(request, env, actor) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_review_request");

  const decision = safeCode(body.decision);
  const proofId = safeText(body.proof_id, 120);
  const reason = safeText(body.admin_reason || body.review_reason || body.reason, 600);
  const idempotencyKey = safeText(request.headers.get("Idempotency-Key") || body.idempotency_key, 180);
  if (!new Set(["approve", "issue", "reject"]).has(decision)) throw httpError(400, "invalid_review_decision");
  if (!proofId) throw httpError(400, "proof_id_required");
  if (reason.length < 5) throw httpError(400, "admin_reason_required");
  if (!idempotencyKey) throw httpError(400, "idempotency_key_required");

  const previous = await findReviewAudit(env, idempotencyKey);
  if (previous) return json(previous, 200);

  const proof = await loadProof(env, proofId);
  if (!proof) throw httpError(404, "payment_proof_not_found");
  const item = safeQueueItem(proof);
  if (!item || item.historical_backfill) throw httpError(409, "historical_proof_requires_historical_backfill_review");
  if (!item.reviewable) throw httpError(409, "payment_proof_not_reviewable");

  if (decision === "issue" || decision === "reject") {
    const audit = await writeAudit(env, {
      actor,
      decision,
      proof_id: proofId,
      proof_record_id: proof.id,
      idempotency_key: idempotencyKey,
      reason,
      result: "success",
      authority: "admin-worker",
    });
    return json({
      ok: true,
      decision,
      proof_id: proofId,
      audit_event_id: audit.event_id,
      authority: "admin-worker",
      money_truth_changed: false,
    });
  }

  const approval = await buildApprovalContext(env, proof, item, actor);
  const paymentsResponse = await sendReviewedProofToPayments(env, {
    ...approval,
    proof_id: proofId,
    evidence_record_id: proof.id,
    review_reason: reason,
    review_actor: actor.id,
  });
  const payload = await paymentsResponse.json().catch(() => ({}));
  if (!paymentsResponse.ok || payload?.ok !== true) {
    throw httpError(paymentsResponse.status >= 400 ? paymentsResponse.status : 502, safeCode(payload?.error || "payments_worker_review_failed"));
  }

  const audit = await writeAudit(env, {
    actor,
    decision,
    proof_id: proofId,
    proof_record_id: proof.id,
    idempotency_key: idempotencyKey,
    reason,
    result: "success",
    authority: "payments-worker",
    payment_ref: approval.payment_ref,
    amount_thb: approval.amount_thb,
    payment_stage: approval.payment_stage,
    context_source: approval.context_source,
    renewal_session_id: approval.renewal_session_id,
  }).then((value) => ({ ...value, ok: true })).catch((error) => ({
    ok: false,
    event_id: "",
    error: safeCode(error?.message || error || "payment_review_audit_write_failed"),
  }));

  return json({
    ok: true,
    decision: "approve",
    proof_id: proofId,
    audit_event_id: audit.event_id || null,
    audit_write_failed: audit.ok === false,
    manual_audit_required: audit.ok === false,
    authority: "payments-worker",
    payment_ref: safeText(payload.payment_ref || approval.payment_ref, 180),
    payment_stage: safeCode(payload.payment_stage || payload.stage || approval.payment_stage),
    context_source: approval.context_source || "canonical_payment",
    recovery_context: approval.context_source === "liff_renewal_recovery",
    duplicate: payload.duplicate === true,
    money_truth_changed: true,
  });
}

async function buildApprovalContext(env, proof, item, actor) {
  const fields = proof.fields || {};
  const paymentRef = safeText(fields.payment_ref || fields.transaction_ref, 180);
  const amountThb = positiveAmount(fields.amount_thb ?? fields.amount ?? fields.total_thb);
  if (!paymentRef) throw httpError(409, "payment_proof_reference_missing");
  if (amountThb == null) throw httpError(409, "payment_proof_amount_missing");

  const linkedPayment = linkedRecordId(fields.payment || fields.Payment || fields["Payment"]);
  let paymentRecord = null;
  if (linkedPayment) paymentRecord = await airtableGet(env, paymentsTable(env), linkedPayment).catch(() => null);
  if (!paymentRecord) paymentRecord = await findPaymentByRef(env, paymentRef);

  let paymentFields = paymentRecord?.fields || null;
  let contextSource = "canonical_payment";
  let renewalSessionId = "";
  if (!paymentFields) {
    const recovery = await buildLinkedRenewalRecoveryContext(env, proof, item, actor, { paymentRef, amountThb });
    if (!recovery) throw httpError(409, "canonical_payment_context_missing");
    paymentFields = recovery.payment_fields;
    contextSource = recovery.context_source;
    renewalSessionId = recovery.renewal_session_id;
  }

  const expectedRef = safeText(paymentFields.payment_ref || paymentFields["Payment Reference"], 180);
  const expectedAmount = positiveAmount(paymentFields.amount_thb ?? paymentFields.amount ?? paymentFields["Amount"]);
  if (expectedRef && expectedRef !== paymentRef) throw httpError(409, "canonical_payment_reference_mismatch");
  if (expectedAmount != null && Math.abs(expectedAmount - amountThb) > 0.009) throw httpError(409, "canonical_payment_amount_mismatch");

  const paymentStage = normalizeStage(
    paymentFields.payment_stage || paymentFields.payment_type || fields.payment_stage || fields.payment_type || item.payment_stage || ""
  );
  const sessionId = safeText(paymentFields.session_id || fields.session_id || item.session_id, 180);
  const memberEmail = normalizeEmail(paymentFields.member_email || fields.member_email || item.member_email);
  const packageCode = canonicalPackageCode(paymentFields.package_code || fields.package_code);
  if (["deposit", "final", "tips", "full"].includes(paymentStage) && !sessionId) {
    throw httpError(409, "canonical_session_context_missing");
  }
  if (paymentStage === "membership" && !memberEmail) throw httpError(409, "canonical_member_context_missing");
  if (paymentStage === "membership" && !packageCode) throw httpError(409, "canonical_package_context_missing");

  return {
    source: "payment_review_console",
    decision: "approved",
    payment_ref: paymentRef,
    amount_thb: amountThb,
    payment_stage: paymentStage,
    session_id: sessionId || null,
    member_email: memberEmail || null,
    package_code: packageCode || null,
    payment_method: safeText(paymentFields["Payment Method"] || paymentFields.payment_method || fields.payment_method || "promptpay", 80) || "promptpay",
    context_source: contextSource,
    renewal_session_id: renewalSessionId || null,
  };
}

async function buildLinkedRenewalRecoveryContext(env, proof, item, actor, { paymentRef, amountThb }) {
  const fields = proof?.fields || {};
  const renewalIds = uniqueStrings(linkedRecordIds(
    fields["MMD — LIFF Renewal Sessions"] ||
    fields["LIFF Renewal Session"] ||
    fields["MMD — LIFF Renewal Session"] ||
    fields.liff_renewal_session
  ));
  if (!renewalIds.length) return null;
  if (renewalIds.length !== 1) throw httpError(409, "liff_renewal_context_ambiguous");
  if (!RECOVERY_APPROVER_ROLES.has(safeCode(actor?.role))) throw httpError(403, "manual_recovery_requires_owner_admin");

  const channel = safeCode(fields.channel || fields.source || item?.channel || "");
  if (!RECOVERY_CHANNELS.has(channel)) throw httpError(409, "manual_recovery_channel_not_allowed");

  const renewal = await airtableGet(env, liffRenewalTable(env), renewalIds[0]);
  const renewalFields = renewal?.fields || {};
  const renewalState = safeCode(renewalFields.renewal_flow_status || renewalFields.status || "");
  if (RECOVERY_BLOCKED_STATES.has(renewalState)) throw httpError(409, "liff_renewal_context_not_approvable");

  const renewalAmount = positiveAmount(renewalFields.renewal_amount_thb ?? renewalFields.amount_thb);
  if (renewalAmount != null && Math.abs(renewalAmount - amountThb) > 0.009) {
    throw httpError(409, "liff_renewal_amount_mismatch");
  }

  const identity = await resolveRecoveryMemberIdentity(env, fields, renewalFields);
  if (!identity?.member?.id || !identity.email) throw httpError(409, "canonical_member_context_missing");

  const packageCode = canonicalPackageCode(
    renewalFields.requested_package ||
    renewalFields.package_code ||
    identity.package_code ||
    identity.member.fields?.["Membership Tier"] ||
    identity.member.fields?.membership_tier
  );
  if (!packageCode) throw httpError(409, "canonical_package_context_missing");

  const renewalSessionId = safeText(renewalFields.renewal_session_id || renewalFields.payment_intent_session_id, 180);
  return {
    context_source: "liff_renewal_recovery",
    renewal_session_id: renewalSessionId,
    payment_fields: {
      payment_ref: paymentRef,
      amount_thb: amountThb,
      payment_stage: "membership",
      payment_type: "membership",
      member_email: identity.email,
      package_code: packageCode,
      payment_method: "promptpay",
    },
  };
}

async function resolveRecoveryMemberIdentity(env, proofFields, renewalFields) {
  const directMemberIds = uniqueStrings([
    ...linkedRecordIds(proofFields.member || proofFields.Member),
    ...linkedRecordIds(renewalFields.member || renewalFields.Member),
  ]);
  if (directMemberIds.length > 1) throw httpError(409, "canonical_member_context_ambiguous");
  if (directMemberIds.length === 1) {
    const member = await airtableGet(env, membersTable(env), directMemberIds[0]);
    const email = memberEmail(member?.fields);
    if (email) return { member, email, package_code: memberPackage(member?.fields) };
  }

  const entitlementIds = uniqueStrings([
    ...linkedRecordIds(renewalFields["Member Entitlement"] || renewalFields["MMD — Member Entitlements"]),
    ...linkedRecordIds(proofFields["Member Entitlement"] || proofFields["MMD — Member Entitlements"]),
  ]);
  if (entitlementIds.length > 1) throw httpError(409, "canonical_member_context_ambiguous");
  if (entitlementIds.length === 1) {
    const entitlement = await airtableGet(env, entitlementsTable(env), entitlementIds[0]);
    const resolved = await resolveMemberFromEntitlementRows(env, [entitlement]);
    if (resolved) return resolved;
  }

  const memberId = safeText(renewalFields.member_id_canonical, 120);
  if (memberId) {
    const member = await findMemberByMemberId(env, memberId);
    if (member) {
      const email = memberEmail(member.fields);
      if (email) return { member, email, package_code: memberPackage(member.fields) };
    }
  }

  const clientIds = uniqueStrings([
    ...linkedRecordIds(renewalFields.Client || renewalFields.client),
    ...linkedRecordIds(proofFields.Client || proofFields.client),
  ]);
  if (clientIds.length > 1) throw httpError(409, "canonical_client_context_ambiguous");
  if (clientIds.length === 1) {
    const client = await airtableGet(env, clientsTable(env), clientIds[0]);
    const email = clientEmail(client?.fields);
    if (email) {
      const member = await findMemberByEmail(env, email);
      if (member) return { member, email: memberEmail(member.fields) || email, package_code: memberPackage(member.fields) };
    }
  }

  const lineUserId = canonicalLineUserId(renewalFields.line_user_id) || manualRecoveryLineUserId(proofFields.note);
  if (!lineUserId) return null;

  const entitlementRows = await airtableList(env, entitlementsTable(env), {
    filterByFormula: `{line_user_id}='${formulaValue(lineUserId)}'`,
    maxRecords: 20,
  }).catch((error) => {
    if (Number(error?.status) === 422) return [];
    throw error;
  });
  const entitlementIdentity = await resolveMemberFromEntitlementRows(env, entitlementRows);
  if (entitlementIdentity) return entitlementIdentity;

  const clientRows = await airtableList(env, clientsTable(env), {
    filterByFormula: `{line_user_id}='${formulaValue(lineUserId)}'`,
    maxRecords: 3,
  });
  if (clientRows.length > 1) throw httpError(409, "canonical_client_context_ambiguous");
  if (clientRows.length === 1) {
    const email = clientEmail(clientRows[0].fields);
    if (email) {
      const member = await findMemberByEmail(env, email);
      if (member) return { member, email: memberEmail(member.fields) || email, package_code: memberPackage(member.fields) };
    }
  }

  return null;
}

async function resolveMemberFromEntitlementRows(env, rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const emails = uniqueStrings(rows.map((row) => normalizeEmail(row?.fields?.member_email)).filter(Boolean));
  const memberIds = uniqueStrings(rows.flatMap((row) => linkedRecordIds(row?.fields?.member)));
  const packages = uniqueStrings(rows.map((row) => canonicalPackageCode(row?.fields?.package_code)).filter(Boolean));
  if (emails.length > 1 || memberIds.length > 1) throw httpError(409, "canonical_member_context_ambiguous");

  let member = null;
  if (memberIds.length === 1) member = await airtableGet(env, membersTable(env), memberIds[0]);
  if (!member && emails.length === 1) member = await findMemberByEmail(env, emails[0]);
  if (!member) return null;

  const canonicalEmail = memberEmail(member.fields) || emails[0] || "";
  if (!canonicalEmail) return null;
  if (emails.length === 1 && normalizeEmail(emails[0]) !== normalizeEmail(canonicalEmail)) {
    throw httpError(409, "canonical_member_email_mismatch");
  }

  return {
    member,
    email: canonicalEmail,
    package_code: packages.length === 1 ? packages[0] : memberPackage(member.fields),
  };
}

async function findMemberByMemberId(env, memberId) {
  const records = await airtableList(env, membersTable(env), {
    filterByFormula: `{member_id}='${formulaValue(memberId)}'`,
    maxRecords: 2,
  });
  if (records.length > 1) throw httpError(409, "canonical_member_context_ambiguous");
  return records[0] || null;
}

async function findMemberByEmail(env, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  for (const field of ["Contact Email", "email"]) {
    try {
      const records = await airtableList(env, membersTable(env), {
        filterByFormula: `LOWER({${field}})='${formulaValue(normalized)}'`,
        maxRecords: 2,
      });
      if (records.length > 1) throw httpError(409, "canonical_member_context_ambiguous");
      if (records[0]) return records[0];
    } catch (error) {
      if (Number(error?.status) === 409) throw error;
      if (Number(error?.status) !== 422) throw error;
    }
  }
  return null;
}

async function sendReviewedProofToPayments(env, body) {
  const base = clean(env.PAYMENTS_BASE_URL).replace(/\/+$/, "");
  const token = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS);
  if (!base) throw httpError(503, "payments_worker_base_url_missing");
  if (!token) throw httpError(503, "payments_worker_service_auth_missing");
  return fetch(`${base}/v1/internal/payments/reviewed-proof`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function safeQueueItem(record) {
  const fields = record?.fields || {};
  const proofId = safeText(fields.proof_id, 120);
  if (!proofId) return null;
  const note = parseNote(fields.note);
  const historical = note.schema === HISTORICAL_SCHEMA;
  const status = safeCode(fields.status || fields.verification_status || fields.payment_status || "pending");
  const reviewable = !historical && (REVIEWABLE_STATES.has(status) || (!status && !historical));
  const paymentRef = safeText(fields.payment_ref || fields.transaction_ref, 180);
  const amountThb = positiveAmount(fields.amount_thb ?? fields.amount ?? fields.total_thb);
  const renewalIds = linkedRecordIds(
    fields["MMD — LIFF Renewal Sessions"] ||
    fields["LIFF Renewal Session"] ||
    fields["MMD — LIFF Renewal Session"] ||
    fields.liff_renewal_session
  );
  const previewUrl = internalEvidenceUrl(proofId, note) || evidenceUrl(fields);
  const sourceContext = safeCode(note.source_context || note.source_type || note.schema || "");
  const extractionMethod = safeCode(note.extraction_method || "");
  const extractionError = safeCode(note.extraction_error || "");
  const contextIssues = [];
  if (!previewUrl) contextIssues.push("evidence_preview_missing");
  if (amountThb == null) contextIssues.push("amount_not_extracted");
  if (!paymentRef) contextIssues.push("payment_reference_missing");
  const linkedPaymentPresent = Boolean(linkedRecordId(fields.payment || fields.Payment || fields["Payment"]));
  const linkedSessionPresent = Boolean(linkedRecordId(fields.session || fields.Session || fields["Session"]));
  const linkedRenewalPresent = renewalIds.length === 1;
  const linkedMemberPresent = Boolean(linkedRecordId(fields.member || fields.Member));
  const storedIntelligence = note.payment_intelligence && typeof note.payment_intelligence === "object" ? note.payment_intelligence : null;
  const paymentIntelligence = storedIntelligence || inferMembershipPayment({
    amount_thb: amountThb, linked_member: linkedMemberPresent, linked_renewal: linkedRenewalPresent,
    package_code: fields.package_code, source_context: sourceContext,
  });
  if (!(linkedPaymentPresent || linkedRenewalPresent || linkedMemberPresent)) contextIssues.push("customer_or_job_not_linked");
  return {
    proof_id: proofId,
    proof_record_id: safeText(record.id, 120),
    customer_name: safeText(note.sender_display_name || fields.client_name || fields.member_name, 180),
    payer_name: safeText(fields.payer_name || fields.member_name || fields.client_name || fields.name, 180),
    payment_ref: paymentRef,
    evidence_amount_thb: amountThb,
    status: status || "pending",
    channel: safeCode(fields.channel || fields.source || ""),
    paid_at: isoOrText(fields.paid_at || fields["Payment Date"]),
    created_at: isoOrText(fields.created_at || fields["Created At"] || fields.createdTime || record.createdTime),
    session_id: safeText(fields.session_id, 180),
    member_email: normalizeEmail(fields.member_email || fields.email),
    payment_stage: safeCode(fields.payment_stage || fields.payment_type || paymentIntelligence?.inferred_stage || ""),
    payment_intelligence: paymentIntelligence,
    inferred_label: membershipInferenceLabel(paymentIntelligence),
    inferred_intent: safeCode(paymentIntelligence?.inferred_intent || ""),
    inferred_package_code: safeCode(paymentIntelligence?.inferred_package_code || ""),
    match_confidence: confidenceOrNull(paymentIntelligence?.confidence),
    identity_state: safeCode(paymentIntelligence?.identity_state || (linkedMemberPresent ? "canonical_member_linked" : "")),
    pending_member_profile: paymentIntelligence?.pending_member_profile === true,
    evidence_preview_url: previewUrl,
    source_context: sourceContext,
    extraction_method: extractionMethod || "not_run",
    extraction_confidence: confidenceOrNull(note.extraction_confidence),
    extraction_error: extractionError,
    context_issues: contextIssues,
    review_lane: contextIssues.length ? "needs_enrichment" : "owner_review",
    can_approve: contextIssues.length === 0,
    reviewable,
    historical_backfill: historical,
    match_flags: {
      evidence_preview_present: Boolean(previewUrl),
      payment_ref_present: Boolean(paymentRef),
      amount_present: amountThb != null,
      linked_payment_present: linkedPaymentPresent,
      linked_session_present: linkedSessionPresent,
      linked_renewal_present: linkedRenewalPresent,
      linked_member_present: linkedMemberPresent,
    },
  };
}

async function loadProof(env, proofId) {
  const formula = `{proof_id}='${formulaValue(proofId)}'`;
  const records = await airtableList(env, paymentProofTable(env), { filterByFormula: formula, maxRecords: 2 });
  if (records.length > 1) throw httpError(409, "payment_proof_ambiguous");
  return records[0] || null;
}

async function findPaymentByRef(env, paymentRef) {
  for (const field of ["payment_ref", "Payment Reference"]) {
    try {
      const records = await airtableList(env, paymentsTable(env), { filterByFormula: `{${field}}='${formulaValue(paymentRef)}'`, maxRecords: 2 });
      if (records.length > 1) throw httpError(409, "canonical_payment_ambiguous");
      if (records[0]) return records[0];
    } catch (error) {
      if (Number(error?.status) === 409) throw error;
    }
  }
  return null;
}

async function findReviewAudit(env, idempotencyKey) {
  const formula = `AND({Action}='${PAYMENT_REVIEW_ACTION}',{Source Ref}='${formulaValue(`payment-review:${idempotencyKey}`)}')`;
  const records = await airtableList(env, accessLogTable(env), { filterByFormula: formula, maxRecords: 2 });
  if (records.length > 1) throw httpError(409, "payment_review_idempotency_ambiguous");
  if (!records[0]) return null;
  const fields = records[0].fields || {};
  const after = parseJson(fields["After JSON"]);
  return {
    ok: safeCode(fields.Result) === "success",
    duplicate: true,
    idempotent: true,
    decision: safeCode(fields.Reason),
    proof_id: safeText(parseJson(fields["Before JSON"]).proof_id, 120),
    audit_event_id: safeText(fields["Event ID"], 180),
    authority: safeCode(after.authority || "payments-worker"),
    context_source: safeCode(after.context_source || ""),
    recovery_context: safeCode(after.context_source) === "liff_renewal_recovery",
    money_truth_changed: after.money_truth_changed === true,
  };
}

async function writeAudit(env, input) {
  const eventId = `mmdpr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const fields = {
    Action: PAYMENT_REVIEW_ACTION,
    Target: "payment_proof",
    Result: input.result || "success",
    Reason: input.decision,
    "Event ID": eventId,
    "Created At (ISO)": new Date().toISOString(),
    "Source Ref": `payment-review:${input.idempotency_key}`,
    "Before JSON": boundedJson({
      proof_id: input.proof_id,
      proof_record_id: input.proof_record_id,
      admin_reason: input.reason,
      payment_ref: input.payment_ref || null,
      amount_thb: input.amount_thb ?? null,
      payment_stage: input.payment_stage || null,
      renewal_session_id: input.renewal_session_id || null,
    }),
    "After JSON": boundedJson({
      authority: input.authority || "payments-worker",
      context_source: input.context_source || "",
      money_truth_changed: input.decision === "approve" && input.authority === "payments-worker",
    }),
    Actor: input.actor.id,
  };
  const record = await airtableCreate(env, accessLogTable(env), fields);
  return { event_id: eventId, record_id: record.id };
}

async function airtableList(env, tableName, params = {}) {
  const url = airtableUrl(env, tableName);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  if (Array.isArray(params.sort)) {
    params.sort.slice(0, 3).forEach((entry, index) => {
      const field = safeText(entry?.field, 120);
      if (!field) return;
      const direction = clean(entry?.direction).toLowerCase() === "asc" ? "asc" : "desc";
      url.searchParams.set(`sort[${index}][field]`, field);
      url.searchParams.set(`sort[${index}][direction]`, direction);
    });
  }
  const response = await airtableFetch(env, new Request(url.toString(), { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload.records;
}

async function airtableGet(env, tableName, recordId) {
  const url = `${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId)}`;
  const response = await airtableFetch(env, new Request(url, { headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } }));
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
  const record = payload?.records?.[0];
  if (!response.ok || !record?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return record;
}

async function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

function airtableUrl(env, tableName) {
  return new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
}

function paymentProofTable(env) {
  return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
}

function paymentsTable(env) {
  return clean(
    env.AIRTABLE_TABLE_PAYMENTS_ID ||
    env.AIRTABLE_TABLE_PAYMENTS ||
    env.AT_PAYMENTS_TABLE ||
    CANONICAL_PAYMENTS_TABLE_ID
  );
}

function membersTable(env) {
  return clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || CANONICAL_MEMBERS_TABLE_ID);
}

function clientsTable(env) {
  return clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CANONICAL_CLIENTS_TABLE_ID);
}

function entitlementsTable(env) {
  return clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || CANONICAL_ENTITLEMENTS_TABLE_ID);
}

function liffRenewalTable(env) {
  return clean(env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || CANONICAL_LIFF_RENEWAL_TABLE_ID);
}

function accessLogTable(env) {
  return clean(env.AIRTABLE_TABLE_ACCESS_LOG || ACCESS_LOG_TABLE);
}

function reviewablePaymentProofFormula() {
  const statuses = [...REVIEWABLE_STATES].map((status) => `{status}='${formulaValue(status)}'`);
  statuses.push(`{status}=''`);
  return `OR(${statuses.join(",")})`;
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}

function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => safeText(entry, 120)).filter(Boolean);
}

function linkedRecordId(value) {
  return linkedRecordIds(value)[0] || "";
}

function memberEmail(fields = {}) {
  return normalizeEmail(fields["Contact Email"] || fields.email || fields.member_email);
}

function clientEmail(fields = {}) {
  return normalizeEmail(fields["Contact Email"] || fields.email);
}

function memberPackage(fields = {}) {
  return canonicalPackageCode(fields["Membership Tier"] || fields.membership_tier || fields.package_code);
}

function manualRecoveryLineUserId(noteValue) {
  const note = clean(noteValue);
  if (!/^MANUAL_RECOVERY\|/i.test(note)) return "";
  const match = /\bline_user_id(?:\s*[:=]|\s+)([A-Za-z0-9_-]{20,80})/i.exec(note);
  return canonicalLineUserId(match?.[1]);
}

function canonicalLineUserId(value) {
  const candidate = safeText(value, 100);
  return /^U[A-Za-z0-9_-]{20,80}$/.test(candidate) ? candidate : "";
}

function canonicalPackageCode(value) {
  const raw = safeCode(value).replace(/-/g, "_");
  if (!raw) return "";
  if (raw === "guest7" || raw === "guest_7" || raw.includes("guest7")) return "guest7";
  if (raw === "blackcard" || raw === "black_card" || raw.includes("black_card") || raw.includes("blackcard")) return "blackcard";
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "";
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => safeText(value, 240)).filter(Boolean))];
}

function evidenceUrl(fields = {}) {
  for (const value of [fields.receipt_url, fields.slip_url, fields.evidence_url, fields["Receipt Photo"]]) {
    if (typeof value === "string" && /^https:\/\//i.test(value)) return value.slice(0, 1200);
    if (Array.isArray(value) && value[0] && typeof value[0].url === "string" && /^https:\/\//i.test(value[0].url)) return value[0].url.slice(0, 1200);
  }
  return "";
}

function internalEvidenceUrl(proofId, note = {}) {
  return safeEvidenceKey(note.r2_key)
    ? `${EVIDENCE_PATH}?proof_id=${encodeURIComponent(proofId)}`
    : "";
}

function safeEvidenceKey(value) {
  const key = safeText(value, 800);
  if (!/^line-ofc\/payment-proofs\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\/original\.(?:jpe?g|png|webp)$/i.test(key)) return "";
  return key;
}

function safeImageContentType(value) {
  const type = clean(value).toLowerCase();
  return new Set(["image/jpeg", "image/png", "image/webp"]).has(type) ? type : "";
}

function confidenceOrNull(value) {
  if (value == null || clean(value) === "") return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 1 ? score : null;
}

function normalizeStage(value) {
  const stage = safeCode(value);
  if (!PAYMENT_STAGES.has(stage)) throw httpError(409, "canonical_payment_stage_missing");
  return stage;
}

function positiveAmount(value) {
  if (value == null || clean(value) === "") return null;
  const normalized = clean(value).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function isoOrText(value) {
  const raw = safeText(value, 100);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw;
}

function parseNote(value) {
  return parseJson(value);
}

function parseJson(value) {
  try {
    const parsed = JSON.parse(clean(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function boundedJson(value) {
  const raw = JSON.stringify(value ?? {});
  return raw.length <= 12000 ? raw : JSON.stringify({ truncated: true, original_length: raw.length });
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function responseHeaders() {
  return new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders() });
}

function safeActor(value) {
  return safeCode(value).slice(0, 120);
}

function safeCode(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9_:\-.]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 160);
}

function safeText(value, max = 500) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
