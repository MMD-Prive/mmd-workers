import { inferMembershipPayment } from "../../shared/payment-intelligence.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const RENEWALS = "tblXjQFwo0A2cHseh";
const PROOFS = "tblfJfM4Sqag9zrLi";
const MEMBERS = "tblgWc5VRon5o8Mhk";
const CLIENTS = "tblVv58TCbwh5j1fS";
const MERGES = "tblQ87hTYK5U9Gta4";
const MAX_PER_RUN = 10;
const ALLOWED_PACKAGES = new Set(["standard", "premium"]);

export async function reconcilePendingMembershipRecoveries(env = {}, options = {}) {
  if (!ready(env)) return { ok: true, skipped: true, reason: "recovery_dependencies_not_ready", scanned: 0, materialized: 0 };

  const renewals = await airtableList(env, renewalsTable(env), {
    filterByFormula: "AND({renewal_flow_status}='renewal_pending_review',{member_id_validation_status}='approved')",
    maxRecords: Number.isInteger(options.maxRecords) ? Math.max(1, Math.min(25, options.maxRecords)) : MAX_PER_RUN,
  });

  const summary = { ok: true, skipped: false, scanned: renewals.length, materialized: 0, review_required: 0, failures: 0 };
  for (const renewal of renewals) {
    try {
      const outcome = await reconcileOne(env, renewal);
      if (outcome.status === "materialized") summary.materialized += 1;
      else summary.review_required += 1;
    } catch (error) {
      summary.failures += 1;
      console.warn({
        event: "membership_payment_pending_recovery_failure",
        reason: safeCode(error?.message || error || "unknown"),
        renewal_record_id: renewal?.id || null,
      });
    }
  }
  return summary;
}

export async function reconcileOne(env = {}, renewal) {
  if (!renewal?.id) return review("renewal_record_missing");
  const rf = renewal.fields || {};
  const lineUserId = lineId(rf.line_user_id);
  const memberId = text(rf.member_id_canonical, 120);
  if (!lineUserId || !memberId) return review("canonical_identity_incomplete");
  if (code(rf.member_id_validation_status) !== "approved") return review("canonical_member_id_not_approved");
  if (code(rf.renewal_flow_status) !== "renewal_pending_review") return review("renewal_not_pending_review");

  const proofIds = linkedIds(rf["Payment Proof"] || rf["MMD — Payment Proofs"] || rf.payment_proof);
  const clientIds = linkedIds(rf.Client || rf.client);
  const mergeIds = linkedIds(rf["MMD — Identity Merge Requests"] || rf.identity_merge_request);
  if (proofIds.length !== 1) return review(proofIds.length ? "payment_proof_ambiguous" : "payment_proof_missing");
  if (clientIds.length !== 1) return review(clientIds.length ? "canonical_client_ambiguous" : "canonical_client_missing");
  if (mergeIds.length !== 1) return review(mergeIds.length ? "identity_merge_ambiguous" : "identity_merge_missing");

  const [proof, client, merge] = await Promise.all([
    airtableGet(env, proofsTable(env), proofIds[0]),
    airtableGet(env, clientsTable(env), clientIds[0]),
    airtableGet(env, mergesTable(env), mergeIds[0]),
  ]);

  if (code(proof.fields?.status || proof.fields?.verification_status) !== "verified") return review("payment_proof_not_verified");
  if (lineId(client.fields?.line_user_id) !== lineUserId) return review("canonical_client_line_mismatch");
  if (code(merge.fields?.status) !== "applied") return review("identity_merge_not_applied");
  if (Number(merge.fields?.match_confidence || 0) < 1) return review("identity_merge_confidence_insufficient");

  const mergeMembers = linkedIds(merge.fields?.["Candidate Member"]);
  const mergeClients = linkedIds(merge.fields?.["Candidate Client"]);
  if (mergeMembers.length !== 1 || mergeClients.length !== 1) return review("identity_merge_targets_incomplete");
  if (mergeClients[0] !== client.id) return review("identity_merge_client_mismatch");

  const members = await airtableList(env, membersTable(env), {
    filterByFormula: `{member_id}='${formulaValue(memberId)}'`,
    maxRecords: 2,
  });
  if (members.length !== 1) return review(members.length ? "canonical_member_ambiguous" : "canonical_member_missing");
  const member = members[0];
  if (mergeMembers[0] !== member.id) return review("identity_merge_member_mismatch");
  if (lineId(member.fields?.line_id || member.fields?.line_user_id) !== lineUserId) return review("canonical_member_line_mismatch");

  const proofMembers = linkedIds(proof.fields?.member || proof.fields?.Member);
  const proofClients = linkedIds(proof.fields?.Client || proof.fields?.client);
  const proofRenewals = linkedIds(proof.fields?.["MMD — LIFF Renewal Sessions"] || proof.fields?.["LIFF Renewal Session"]);
  if (proofMembers.length !== 1 || proofMembers[0] !== member.id) return review("payment_proof_member_mismatch");
  if (proofClients.length !== 1 || proofClients[0] !== client.id) return review("payment_proof_client_mismatch");
  if (proofRenewals.length !== 1 || proofRenewals[0] !== renewal.id) return review("payment_proof_renewal_mismatch");

  const amountThb = positiveAmount(proof.fields?.amount_thb ?? proof.fields?.amount ?? proof.fields?.total_thb);
  const paymentRef = text(proof.fields?.payment_ref || proof.fields?.transaction_ref, 180);
  if (amountThb == null || !paymentRef) return review("payment_proof_money_context_incomplete");

  const inference = inferMembershipPayment({
    amount_thb: amountThb,
    linked_member: true,
    linked_renewal: true,
    source_context: "liff_renewal_recovery verified owner membership renewal",
  });
  const packageCode = code(inference?.inferred_package_code);
  if (!inference || code(inference.inferred_intent) !== "renewal" || Number(inference.confidence || 0) < 0.99 || !ALLOWED_PACKAGES.has(packageCode)) {
    return review("renewal_package_inference_not_safe");
  }

  const requestedPackage = canonicalPackage(rf.requested_package || rf.package_code);
  if (requestedPackage && requestedPackage !== packageCode) return review("renewal_package_conflict");
  const renewalAmount = positiveAmount(rf.renewal_amount_thb ?? rf.amount_thb);
  if (renewalAmount != null && Math.abs(renewalAmount - amountThb) > 0.009) return review("renewal_amount_conflict");

  if (!requestedPackage || renewalAmount == null) {
    await airtableUpdate(env, renewalsTable(env), renewal.id, {
      requested_package: packageCode,
      renewal_amount_thb: amountThb,
      review_note: appendReviewNote(
        rf.review_note,
        `Canonical scheduled recovery prepared from verified proof; package=${packageCode}; amount=${amountThb}; price_rule=${text(inference.inferred_price_rule, 120)}; identity_merge=applied`
      ),
    });
  }

  const reviewed = await sendToPayments(env, {
    source: "payment_review_console",
    decision: "approved",
    proof_id: text(proof.fields?.proof_id, 120),
    evidence_record_id: proof.id,
    payment_ref: paymentRef,
    amount_thb: amountThb,
    payment_stage: "membership",
    member_id: memberId,
    member_record_id: member.id,
    client_record_id: client.id,
    line_user_id: lineUserId,
    package_code: packageCode,
    context_source: "liff_renewal_recovery",
    renewal_session_id: text(rf.renewal_session_id || rf.payment_intent_session_id, 180),
    renewal_record_id: renewal.id,
    payment_method: text(proof.fields?.payment_method || "promptpay", 80) || "promptpay",
    review_reason: "Scheduled recovery after exact LINE identity resolution and verified renewal proof.",
    review_actor: "admin-worker-scheduled-recovery",
    idempotency_key: `membership-recovery:${renewal.id}:${paymentRef}`,
  });

  const payload = await reviewed.json().catch(() => ({}));
  if (!reviewed.ok || payload?.ok !== true) {
    return review(`payments_worker_${safeCode(payload?.error || reviewed.status || "failed")}`);
  }
  if (payload.entitlement_materialized !== true || !payload.entitlement_record_id) {
    return review(`payments_worker_${safeCode(payload?.membership_write_through?.reason || "not_materialized")}`);
  }

  return {
    status: "materialized",
    renewal_record_id: renewal.id,
    entitlement_record_id: text(payload.entitlement_record_id, 120),
    package_code: packageCode,
    amount_thb: amountThb,
    membership_expire_at: text(payload.membership_expire_at, 80) || null,
  };
}

async function sendToPayments(env, body) {
  const secret = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS);
  if (!secret || typeof env.PAYMENTS_WORKER?.fetch !== "function") throw new Error("payments_service_not_ready");
  return env.PAYMENTS_WORKER.fetch(new Request("https://sigil.mmdbkk.com/v1/internal/payments/reviewed-proof", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      "X-MMD-Service-Caller": "admin-worker",
    },
    body: JSON.stringify(body),
  }));
}

async function airtableList(env, tableName, params = {}) {
  const url = airtableUrl(env, tableName);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch(env, new Request(url.toString(), {
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` },
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw new Error(`airtable_${response.status || "malformed"}`);
  return payload.records;
}

async function airtableGet(env, tableName, recordId) {
  const response = await airtableFetch(env, new Request(`${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId)}`, {
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` },
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error(`airtable_${response.status || "malformed"}`);
  return payload;
}

async function airtableUpdate(env, tableName, recordId, fields) {
  const response = await airtableFetch(env, new Request(`${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields, typecast: false }),
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error(`airtable_${response.status || "malformed"}`);
  return payload;
}

function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

function airtableUrl(env, tableName) {
  return new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
}

function ready(env) {
  return Boolean(clean(env.AIRTABLE_API_KEY) && clean(env.AIRTABLE_BASE_ID) && clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS) && typeof env.PAYMENTS_WORKER?.fetch === "function");
}

function renewalsTable(env) { return clean(env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || RENEWALS); }
function proofsTable(env) { return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || PROOFS); }
function membersTable(env) { return clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || MEMBERS); }
function clientsTable(env) { return clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CLIENTS); }
function mergesTable(env) { return clean(env.AIRTABLE_TABLE_IDENTITY_MERGE_REQUESTS_ID || env.AIRTABLE_TABLE_IDENTITY_MERGE_REQUESTS || MERGES); }

function linkedIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => typeof item === "string" ? item : item?.id).filter((item) => /^rec[A-Za-z0-9]{14}$/.test(String(item || ""))))]
    : [];
}

function canonicalPackage(value) {
  const v = code(value);
  if (v.includes("premium")) return "premium";
  if (v.includes("standard") || v.includes("lite")) return "standard";
  return "";
}

function positiveAmount(value) {
  if (value == null || clean(value) === "") return null;
  const v = clean(value).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}

function appendReviewNote(current, addition) {
  const base = text(current, 2600);
  const next = text(addition, 1000);
  return [base, next].filter(Boolean).join("\n").slice(0, 3600);
}

function review(reason) { return { status: "review_required", reason }; }
function lineId(value) { const v = text(value, 100); return /^U[0-9a-f]{32}$/i.test(v) ? v : ""; }
function formulaValue(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function code(value) { return clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 140); }
function safeCode(value) { return code(value) || "unknown"; }
function text(value, max = 500) { return clean(value).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max); }
function clean(value) { return String(value ?? "").trim(); }
