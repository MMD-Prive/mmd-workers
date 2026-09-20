import currentWorker from "./front-gate-index.js";
export { KenjiModelIdempotency } from "./front-gate-index.js";
import { classifyPaymentOpsRoute, membershipInferenceLabel } from "../../shared/payment-intelligence.mjs";
import { analyzeProductionPaymentProof } from "./payment-proof-intelligence.mjs";
import { dispatchOpsNotification, drainOpsNotificationOutbox } from "./line-ops-notification-outbox.mjs";
import { heldEvidenceAuditRecord, holdUncertainEvidence, reprocessHeldEvidence } from "./line-held-evidence-lane.mjs";

const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/"]);
const IMAGE_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_PAYMENT_PROOFS_TABLE = "tblfJfM4Sqag9zrLi";
const DEFAULT_CONSOLE_INBOX_TABLE = "tblFHmfpB2TTrzO2e";
const DEFAULT_DIRECT_CANDIDATE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PAYMENT_CONTEXT_LOOKBACK_HOURS = 48;
const PAYMENT_CONTEXT_RE = /(?:สลิป|หลักฐาน(?:การ)?(?:โอน|ชำระ)|โอน|จ่าย|ชำระ|สมัคร(?:สมาชิก)?|ต่อ(?:อายุ(?:สมาชิก)?|ให้|สมาชิก|เมม(?:เบอร์)?)|ค่าสมาชิก|เมมเบอร์|สมาชิก|payment(?:\s+proof)?|transfer(?:\s+(?:slip|proof|done))?|bank\s*transfer|renew(?:al)?|membership|promptpay|พร้อมเพย์)/i;
const PAYMENT_FOLLOWUP_RE = /(?:ขอ\s*เข้า\s*กลุ่ม|เข้า\s*กลุ่ม|access|drive|เข้าแล้ว|โอน|จ่าย|ชำระ|สลิป|หลักฐาน|สมัคร(?:สมาชิก)?|ต่อ(?:อายุ(?:สมาชิก)?|ให้|สมาชิก|เมม(?:เบอร์)?)|renew(?:al)?|payment|transfer|สมาชิก|member)/i;
const MEMBERSHIP_PAYMENT_CONTEXT_RE = /(?:สมัคร(?:สมาชิก)?|ต่อ(?:อายุ(?:สมาชิก)?|ให้|สมาชิก|เมม(?:เบอร์)?)|ค่าสมาชิก|เมมเบอร์|สมาชิก|membership|member\s*(?:fee|renewal)?|renew(?:al)?)/i;

function asString(value) { return String(value || "").trim(); }
function bytesToBase64(buffer) { const bytes = new Uint8Array(buffer); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function timingSafeStringEqual(a, b) { const left = asString(a); const right = asString(b); if (!left || !right || left.length !== right.length) return false; let diff = 0; for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; }
async function createLineSignature(rawBody, secret) { if (!asString(secret)) return ""; const encoder = new TextEncoder(); const key = await crypto.subtle.importKey("raw", encoder.encode(asString(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return bytesToBase64(await crypto.subtle.sign("HMAC", key, encoder.encode(String(rawBody || "")))); }
async function verifyLineSignature(rawBody, signature, secret) { return timingSafeStringEqual(await createLineSignature(rawBody, secret), signature); }
function sourceType(event = {}) { const type = asString(event?.source?.type).toLowerCase(); return ["user", "group", "room"].includes(type) ? type : "unknown"; }
function messageType(event = {}) { return event?.type === "message" ? asString(event?.message?.type).toLowerCase() || "unknown" : "none"; }
function messageText(event = {}) { return event?.type === "message" && messageType(event) === "text" ? asString(event?.message?.text) : ""; }
function hasPaymentContext(value = "") { return PAYMENT_CONTEXT_RE.test(asString(value)); }
function hasPaymentFollowupContext(value = "") { const text = asString(value); return PAYMENT_FOLLOWUP_RE.test(text) || /\d/.test(text); }
function hasMembershipPaymentContext(value = "") { return MEMBERSHIP_PAYMENT_CONTEXT_RE.test(asString(value)); }
function positiveNumericAmount(value) { const amount = Number(value); return Number.isFinite(amount) && amount > 0 ? amount : null; }
function membershipPaymentAcceptedByOwnerPolicy({ route = {}, extraction = {}, contextText = "" } = {}) {
  const amount = positiveNumericAmount(extraction?.amount_thb);
  if (amount == null || route?.should_alert === true) return false;
  return route?.topic === "membership" || hasMembershipPaymentContext(contextText);
}

async function sha256Hex(value) {
  const input = value instanceof ArrayBuffer ? value : new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function configuredGroupHashes(env = {}) { return new Set(asString(env.LINE_PAYMENT_PROOF_GROUP_HASHES).split(/[\s,]+/).map((v) => v.toLowerCase()).filter((v) => /^[a-f0-9]{64}$/.test(v))); }
async function isPaymentProofGroup(env = {}, event = {}) { const groupId = asString(event?.source?.groupId); return Boolean(groupId && sourceType(event) === "group" && configuredGroupHashes(env).has(await sha256Hex(groupId))); }
function maxImageBytes(env = {}) { const n = Number(env.LINE_SLIP_MAX_IMAGE_BYTES); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), DEFAULT_MAX_IMAGE_BYTES) : DEFAULT_MAX_IMAGE_BYTES; }
function directCandidateTtlMs(env = {}) { const n = Number(env.LINE_DIRECT_PAYMENT_CANDIDATE_TTL_MINUTES); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n * 60000), 2 * 60 * 60 * 1000) : DEFAULT_DIRECT_CANDIDATE_TTL_MS; }
function paymentContextLookbackHours(env = {}) { const n = Number(env.LINE_DIRECT_PAYMENT_CONTEXT_LOOKBACK_HOURS); return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 168) : DEFAULT_PAYMENT_CONTEXT_LOOKBACK_HOURS; }
function formulaValue(value) { return asString(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function paymentProofsTable(env = {}) { return asString(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || DEFAULT_PAYMENT_PROOFS_TABLE); }
function consoleInboxTable(env = {}) { return asString(env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || env.AIRTABLE_SYNC_TABLE || DEFAULT_CONSOLE_INBOX_TABLE); }
function clientsTable(env = {}) { return asString(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || "Clients"); }

async function downloadLineImage(env = {}, messageId = "") {
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  const id = asString(messageId);
  if (!token || !id) throw new Error("line_image_download_unconfigured");
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(id)}/content`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`line_image_download_${response.status}`);
  const mimeType = asString(response.headers.get("content-type")).split(";", 1)[0].toLowerCase();
  if (!IMAGE_TYPES.has(mimeType)) throw new Error("line_image_mime_unsupported");
  const limit = maxImageBytes(env);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("line_image_too_large");
  const body = await response.arrayBuffer();
  if (!body.byteLength || body.byteLength > limit) throw new Error(body.byteLength ? "line_image_too_large" : "line_image_empty");
  return { body, mimeType, extension: IMAGE_TYPES.get(mimeType), byteSize: body.byteLength, sha256: await sha256Hex(body) };
}

async function airtableRequest(env = {}, path = "", init = {}) {
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const token = asString(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!baseId || !token) throw new Error("airtable_config_missing");
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}

async function updatePaymentProof(env = {}, recordId = "", fields = {}) {
  const id = asString(recordId);
  if (!id) throw new Error("payment_proof_record_id_missing");
  return airtableRequest(env, `${encodeURIComponent(paymentProofsTable(env))}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

async function findExistingProof(env = {}, proofId = "") {
  const params = new URLSearchParams({ maxRecords: "1", filterByFormula: `{proof_id}='${formulaValue(proofId)}'` });
  const payload = await airtableRequest(env, `${encodeURIComponent(paymentProofsTable(env))}?${params.toString()}`);
  return Array.isArray(payload.records) ? payload.records[0] || null : null;
}

async function resolveDirectPayerContext(env = {}, lineUserId = "") {
  const id = asString(lineUserId);
  if (!id) return { payerName: "", identityMatch: "unavailable" };
  try {
    const params = new URLSearchParams({ maxRecords: "2", filterByFormula: `{line_user_id}='${formulaValue(id)}'` });
    const payload = await airtableRequest(env, `${encodeURIComponent(clientsTable(env))}?${params.toString()}`);
    const matches = Array.isArray(payload.records) ? payload.records : [];
    if (matches.length === 1) {
      const f = matches[0].fields || {};
      const payerName = asString(f["Client Name"] || f.line_display_name || f.display_name || f.name || f.nickname);
      if (payerName) return { payerName, identityMatch: "exact_clients_line_user_id" };
    }
  } catch (_) {}
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (token) {
    try {
      const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
      const profile = await response.json().catch(() => ({}));
      if (response.ok && asString(profile.displayName)) return { payerName: asString(profile.displayName), identityMatch: "line_profile_display_name" };
    } catch (_) {}
  }
  return { payerName: "", identityMatch: "unresolved" };
}

function safePaidDate(value) {
  const raw = asString(value);
  if (!raw || Number.isNaN(Date.parse(raw))) return "";
  return raw.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || new Date(raw).toISOString().slice(0, 10);
}

async function createPendingProof(env = {}, evidence = {}) {
  const existing = await findExistingProof(env, evidence.proofId);
  if (existing?.id) return { id: existing.id, deduped: true, verified: existing?.fields?.status === "verified" };
  const analysis = evidence.analysis || {};
  const extraction = analysis.extraction || {};
  const links = analysis.links || {};
  const opsRoute = analysis.ops_route || evidence.paymentOpsRoute || classifyPaymentOpsRoute({ source_context: evidence.sourceContext, context_text: evidence.paymentContextText });
  const ownerPolicyVerified = membershipPaymentAcceptedByOwnerPolicy({ route: opsRoute, extraction, contextText: evidence.paymentContextText });
  const identityReady = Boolean(asString(links.member) || asString(links.client) || asString(links.renewal));
  const packageReady = Boolean(asString(analysis.payment_intelligence?.inferred_package_code));
  const explicitMembershipIntent = hasMembershipPaymentContext(evidence.paymentContextText);
  const mayExtendMembership = ownerPolicyVerified && identityReady && packageReady && (Boolean(asString(links.renewal)) || explicitMembershipIntent);
  const noteValue = {
    schema: "line_payment_evidence_v4",
    evidence_only: !ownerPolicyVerified,
    source_type: evidence.sourceType,
    source_context: evidence.sourceContext || null,
    identity_match: evidence.identityMatch || analysis.customer?.source || "unresolved",
    sender_display_name: evidence.payerName || analysis.customer?.display_name || extraction.payer_name || null,
    source_group_hash: evidence.groupHash || null,
    source_user_hash: evidence.userHash || null,
    line_message_id_hash: evidence.messageIdHash,
    webhook_event_id_hash: evidence.webhookEventIdHash || null,
    r2_key: evidence.r2Key,
    evidence_sha256: evidence.sha256,
    mime_type: evidence.mimeType,
    byte_size: evidence.byteSize,
    extraction: {
      method: extraction.extraction_method || null,
      confidence: extraction.confidence_score || 0,
      provider: extraction.provider || null,
      sender_bank: extraction.sender_bank || null,
      receiver_bank: extraction.receiver_bank || null,
    },
    image_classification: analysis.classification || null,
    client_match: analysis.customer || null,
    links,
    payment_intelligence: analysis.payment_intelligence || null,
    job_correlation: analysis.job_correlation || null,
    review_summary: analysis.review_summary || null,
    payment_ops_route: { topic: opsRoute.topic, classification: opsRoute.classification, confidence: opsRoute.confidence, reason: opsRoute.reason, should_alert: opsRoute.should_alert === true },
    payment_truth: ownerPolicyVerified ? "verified_by_owner_membership_policy" : "unverified",
    official_verification_required: !ownerPolicyVerified,
    may_mark_paid: ownerPolicyVerified,
    may_award_points: false,
    may_extend_membership: mayExtendMembership,
    may_confirm_session: false,
    owner_policy: ownerPolicyVerified ? {
      code: "membership_slip_simple_accept_v1",
      receiving_account_required: false,
      positive_numeric_amount_required: true,
      membership_intent_required: true,
      identity_and_package_remain_separate: true,
    } : null,
    settlement: asString(analysis.payment_intelligence?.inferred_stage) !== "membership"
      ? { status: "official_verify_required", authority: "payments-worker" }
      : mayExtendMembership
        ? { status: "pending", authority: "payments-worker" }
        : { status: "review_required", reason: identityReady ? "membership_package_unresolved" : "canonical_identity_unresolved" },
  };
  // Never persist a verified proof before the authoritative Payments write-through succeeds.
  const fields = { proof_id: evidence.proofId, channel: "line_ofc", note: JSON.stringify(noteValue), status: "pending" };
  const payerName = asString(extraction.payer_name || analysis.customer?.display_name || evidence.payerName);
  if (payerName) fields.payer_name = payerName;
  if (extraction.amount_thb != null) fields.amount_thb = extraction.amount_thb;
  if (asString(extraction.payment_ref)) fields.payment_ref = asString(extraction.payment_ref);
  if (safePaidDate(extraction.paid_at)) fields.paid_at = safePaidDate(extraction.paid_at);
  if (asString(links.member)) fields.member = [asString(links.member)];
  if (asString(links.client)) fields.Client = [asString(links.client)];
  if (asString(links.session)) fields.session = [asString(links.session)];
  if (asString(links.payment)) fields.payment = [asString(links.payment)];
  if (asString(links.renewal)) fields["MMD — LIFF Renewal Sessions"] = [asString(links.renewal)];
  const payload = await airtableRequest(env, encodeURIComponent(paymentProofsTable(env)), { method: "POST", body: JSON.stringify({ fields }) });
  return { id: asString(payload?.id), deduped: false, verified: false, mayExtendMembership, note: noteValue };
}

async function settleTrackedMembership(env = {}, evidence = {}, proof = {}, lineUserId = "") {
  if (proof?.deduped === true) return { status: "deduped" };
  if (proof?.mayExtendMembership !== true) return { status: "review_required", reason: "membership_context_incomplete" };
  if (!env.PAYMENTS_WORKER || typeof env.PAYMENTS_WORKER.fetch !== "function") return markSettlementReview(env, proof, "payments_binding_missing");

  const analysis = evidence.analysis || {};
  const extraction = analysis.extraction || {};
  const intelligence = analysis.payment_intelligence || {};
  const context = analysis.settlement_context || {};
  const packageCode = asString(intelligence.inferred_package_code).toLowerCase();
  if (!new Set(["standard", "premium"]).has(packageCode)) return markSettlementReview(env, proof, "private_membership_package_required");
  const token = asString(env.AUTH_SERVICE_LINE_TO_PAYMENTS || env.INTERNAL_TOKEN);
  if (!token) return markSettlementReview(env, proof, "payments_service_token_missing");

  const body = {
    source: "line_ofc_payment_ingress",
    decision: "approved",
    proof_id: evidence.proofId,
    evidence_record_id: proof.id,
    payment_ref: asString(extraction.payment_ref),
    amount_thb: positiveNumericAmount(extraction.amount_thb),
    payment_stage: "membership",
    member_email: asString(context.member_email) || undefined,
    package_code: packageCode,
    payment_method: asString(extraction.provider) || "promptpay",
    context_source: asString(context.member_email) ? "line_ofc_exact_member" : "liff_renewal_recovery",
    member_id: asString(context.member_id) || undefined,
    member_record_id: asString(context.member_record_id) || undefined,
    client_record_id: asString(context.client_record_id) || undefined,
    renewal_record_id: asString(context.renewal_record_id) || undefined,
    renewal_session_id: asString(context.renewal_session_id) || undefined,
    line_user_id: asString(lineUserId) || undefined,
    review_reason: "LINE OFC membership slip matched canonical identity, package, amount, and payment reference",
    review_actor: "line_ofc_membership_auto",
  };
  try {
    const response = await env.PAYMENTS_WORKER.fetch(new Request("https://payments-worker/v1/internal/payments/reviewed-proof", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-mmd-service-caller": "member-dashboard-chat-worker",
      },
      body: JSON.stringify(body),
    }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true || payload?.entitlement_materialized !== true) {
      return markSettlementReview(env, proof, asString(payload?.membership_write_through?.reason || payload?.error || `payments_${response.status}`));
    }
    const settlement = {
      status: "materialized",
      authority: "payments-worker",
      entitlement_record_id: asString(payload.entitlement_record_id) || null,
      membership_expire_at: asString(payload.membership_expire_at) || null,
      membership_term: asString(payload.membership_term) || null,
      membership_expiry_rule: asString(payload.membership_expiry_rule) || null,
      promotion: payload?.membership_write_through?.promotion || null,
    };
    await updatePaymentProof(env, proof.id, {
      status: "verified",
      verified_at: new Date().toISOString().slice(0, 10),
      verified_by: "payments-worker-line-ofc",
      note: JSON.stringify({ ...(proof.note || {}), settlement }),
    });
    return settlement;
  } catch (error) {
    return markSettlementReview(env, proof, asString(error?.message || error || "payments_settlement_failed"));
  }
}

async function markSettlementReview(env = {}, proof = {}, reason = "membership_settlement_failed") {
  const settlement = { status: "review_required", authority: "payments-worker", reason: asString(reason).slice(0, 180) || "membership_settlement_failed" };
  if (asString(proof?.id)) {
    await updatePaymentProof(env, proof.id, {
      status: "review_required",
      note: JSON.stringify({ ...(proof.note || {}), settlement }),
    }).catch(() => {});
  }
  return settlement;
}

function paymentOpsChatId(env = {}) { return asString(env.TELEGRAM_OPS_CHAT_ID || env.TELEGRAM_CHAT_ID); }
function paymentOpsThreadId(env = {}) { const value = Number(env.TELEGRAM_PAYMENT_THREAD_ID || env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM); return Number.isFinite(value) && value > 0 ? Math.floor(value) : 22; }
function membershipOpsThreadId(env = {}) { const value = Number(env.TELEGRAM_MEMBERSHIP_THREAD_ID || env.TG_THREAD_MEMBERSHIP); return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20; }
function alertsOpsThreadId(env = {}) { const value = Number(env.TELEGRAM_ALERTS_THREAD_ID || env.TG_THREAD_ALERTS); return Number.isFinite(value) && value > 0 ? Math.floor(value) : 9; }

// Durable Ops delivery. The message is persisted before the first send attempt
// and retried from the outbox, so a Telegram outage can never lose an operator
// notification and can never re-run payment settlement.
async function sendOpsMessage(env, { chatId, threadId, flow, text, eventKey, purpose }) {
  if (!asString(chatId)) return { delivered: false, durable: false, skipped: true, reason: "telegram_config_missing" };
  return dispatchOpsNotification(env, {
    eventKey: asString(eventKey),
    purpose: asString(purpose) || flow,
    destination: { chat_id: chatId, message_thread_id: threadId, flow },
    message: text,
  });
}

function paymentNotificationPurpose({ isMembership = false, settlementStatus = "" } = {}) {
  // Service/Job evidence always stays one review-lane event. Only the
  // Membership lane distinguishes a settlement outcome.
  if (!isMembership) return "service_payment_review";
  const status = asString(settlementStatus);
  if (status === "materialized") return "membership_settlement_materialized";
  if (status === "review_required") return "membership_settlement_review_required";
  return "membership_payment_review";
}

function compactOpsWhen(summary = {}) {
  const date = asString(summary.job_date);
  const start = asString(summary.start_time);
  const end = asString(summary.end_time);
  if (date && start && end) return `${date} · ${start} → ${end}`;
  if (date && start) return `${date} · ${start}`;
  return date || start || end || "";
}

function jobCandidateLine(candidate = {}, index = 0) {
  const ref = asString(candidate.job_id || candidate.session_id) || "ไม่ทราบรหัสงาน";
  const details = [
    asString(candidate.model_name) ? `Model ${asString(candidate.model_name)}` : "",
    compactOpsWhen(candidate),
    asString(candidate.location_name),
  ].filter(Boolean);
  return `${index + 1}. ${ref}${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

function paymentJobCorrelationLines(analysis = {}) {
  const correlation = analysis.job_correlation || {};
  const status = asString(correlation.status).toLowerCase();
  const selected = correlation.selected || null;
  if (status === "not_applicable") return [];
  if (status === "exact" && selected) {
    const ref = asString(selected.job_id || selected.session_id) || "matched";
    return [
      "Job Match: ✅ exact canonical match",
      `Job: ${ref}`,
      asString(selected.model_name) ? `Model: ${asString(selected.model_name)}` : "",
      compactOpsWhen(selected) ? `When: ${compactOpsWhen(selected)}` : "",
      asString(selected.location_name) ? `Location: ${asString(selected.location_name)}` : "",
      asString(correlation.reason) ? `Match basis: ${asString(correlation.reason)}` : "",
    ].filter(Boolean);
  }
  if (status === "ambiguous") {
    const candidates = Array.isArray(correlation.candidates) ? correlation.candidates.slice(0, 5) : [];
    return [
      `Job Match: ⚠️ ambiguous · ${Number(correlation.candidate_count || candidates.length) || candidates.length} candidates`,
      ...candidates.map((candidate, index) => jobCandidateLine(candidate, index)),
      "Action: choose the canonical Job before Official Verify. Do not guess.",
    ];
  }
  return [
    "Job Match: ⚠️ ยังระบุงานไม่ได้",
    asString(correlation.reason) ? `Reason: ${asString(correlation.reason)}` : "",
    "Action: resolve/bind the canonical Job before Official Verify. Do not guess.",
  ].filter(Boolean);
}

async function notifyPaymentProofOps(env = {}, evidence = {}, result = {}) {
  if (result?.deduped === true) return { skipped: true, reason: "deduped" };
  const chatId = paymentOpsChatId(env);
  // Without a configured Ops destination there is nothing to address. A missing
  // binding/secret is not skipped here: it is recorded durably and retried.
  if (!chatId) return { skipped: true, reason: "telegram_config_missing" };
  const analysis = evidence.analysis || {};
  const route = analysis.ops_route || evidence.paymentOpsRoute || classifyPaymentOpsRoute({ source_context: evidence.sourceContext, context_text: evidence.paymentContextText });
  const extraction = analysis.extraction || {};
  const policyVerified = membershipPaymentAcceptedByOwnerPolicy({ route, extraction, contextText: evidence.paymentContextText });
  const isMembership = route.topic === "membership" || (policyVerified && hasMembershipPaymentContext(evidence.paymentContextText));
  const threadId = isMembership ? membershipOpsThreadId(env) : paymentOpsThreadId(env);
  const purpose = asString(analysis.payment_intelligence?.inferred_label) || membershipInferenceLabel(route.inference) || (isMembership ? "Membership / Renewal" : "Payment / Service");
  const customer = asString(analysis.customer?.display_name || evidence.payerName);
  const trackingKind = asString(analysis.payment_intelligence?.tracking_kind) || "unresolved_payment";
  const settlement = result?.settlement || null;
  const statusLine = settlement?.status === "materialized"
    ? "Status: verified · membership entitlement materialized"
    : settlement?.status === "review_required"
      ? "Status: review required"
      : policyVerified
        ? "Status: verified · simple membership slip policy"
        : "Status: pending review";
  const text = [
    isMembership ? "🧾 MMD Membership Payment Proof" : "💳 MMD Payment Proof",
    statusLine,
    `Source: ${evidence.sourceType === "user" ? "LINE OA direct" : "LINE payment group"}`,
    `Proof: ${evidence.proofId}`,
    `Classified: ${purpose}`,
    `Tracking: ${trackingKind}`,
    customer ? `Customer: ${customer}` : "Customer: pending match",
    extraction.amount_thb != null ? `Amount: ${Number(extraction.amount_thb).toLocaleString("en-US")} THB` : "Amount: pending extraction",
    ...(!isMembership ? paymentJobCorrelationLines(analysis) : []),
    `Routing: ${route.reason}`,
    settlement?.status === "materialized"
      ? `Action: membership materialized${settlement.membership_expire_at ? ` through ${settlement.membership_expire_at}` : ""}.`
      : policyVerified
        ? "Action: payment accepted; membership settlement requires exact canonical identity/package."
        : analysis.job_correlation?.status === "exact" || isMembership
          ? "Action: Official Verify in Payment Inbox before any money/access change."
          : "Action: resolve the canonical Job, then Official Verify. No guessing / no money-truth mutation.",
  ].filter(Boolean).join("\n");
  const notificationPurpose = paymentNotificationPurpose({ isMembership, settlementStatus: settlement?.status });
  const main = await sendOpsMessage(env, { chatId, threadId, flow: isMembership ? "membership" : "payment_proof", text, eventKey: evidence.proofId, purpose: notificationPurpose });
  let alertSent = false;
  let alertDelivery = null;
  if (route.should_alert === true) {
    alertDelivery = await sendOpsMessage(env, { chatId, threadId: alertsOpsThreadId(env), flow: "alert", text: `🚨 MMD Payment Classification Conflict\nProof: ${evidence.proofId}\nReason: ${route.reason}\nAction: keep pending; do not activate automatically.`, eventKey: evidence.proofId, purpose: "payment_classification_conflict" });
    alertSent = alertDelivery.delivered === true;
  }
  // A failed Telegram send never rolls back settlement and never blocks the
  // canonical Payment Proof. It stays recoverable in the durable outbox.
  return {
    sent: main.delivered === true,
    queued: main.durable === true && main.delivered !== true,
    duplicate: main.duplicate === true,
    delivery_status: asString(main.status) || null,
    delivery_attempts: Number(main.attempts) || 0,
    delivery_durable: main.durable === true,
    delivery_reason: asString(main.reason) || null,
    notification_id: asString(main.id) || null,
    alert_notification_id: asString(alertDelivery?.id) || null,
    topic: isMembership ? "membership" : route.topic,
    thread_id: threadId,
    alert_sent: alertSent,
    verified: policyVerified,
  };
}

// Bounded, hash-only operator notice raised when held evidence reaches terminal
// review_required. It carries no image, no LINE identity and no amount.
async function notifyHeldEvidenceReview(env = {}, audit = {}) {
  const chatId = paymentOpsChatId(env);
  if (!chatId) return { delivered: false, skipped: true, reason: "telegram_config_missing" };
  const text = [
    "🟠 MMD Held Payment Evidence — review required",
    `Proof candidate: ${asString(audit.proof_id)}`,
    `Hold reason: ${asString(audit.hold_reason) || "uncertain_payment_image"}`,
    `Reprocess attempts: ${Number(audit.attempts) || 0}`,
    `Source: ${audit.source_type === "user" ? "LINE OA direct" : "LINE payment group"}`,
    "This image was never promoted to a Payment Proof and holds no payment truth.",
    "Action: inspect the private evidence candidate in Ops. Do not mark paid from here; Official Verify / payments-worker remains the only settlement path.",
  ].join("\n");
  return sendOpsMessage(env, {
    chatId,
    threadId: alertsOpsThreadId(env),
    flow: "alert",
    text,
    eventKey: asString(audit.proof_id),
    purpose: "held_evidence_review_required",
  });
}

async function persistCapturedImage(env = {}, event = {}, options = {}) {
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") throw new Error("line_slip_r2_binding_missing");
  const source = sourceType(event);
  const messageId = asString(options.messageId || event?.message?.id);
  if (!messageId) throw new Error("line_message_id_missing");
  const messageIdHash = await sha256Hex(messageId);
  const proofId = asString(options.proofId) || `line_${messageIdHash.slice(0, 24)}`;
  const existing = await findExistingProof(env, proofId);
  if (existing?.id) return { captured: true, deduped: true, proofId, recordId: existing.id, verified: existing?.fields?.status === "verified" };

  const image = await downloadLineImage(env, messageId);
  const userId = asString(event?.source?.userId);
  const contextText = asString(options.paymentContextText);
  const analysis = await analyzeProductionPaymentProof({ env, image, lineUserId: userId, contextText });
  const groupId = asString(event?.source?.groupId);
  const webhookEventId = asString(options.webhookEventId || event?.webhookEventId);
  const identity = {
    groupHash: groupId ? await sha256Hex(groupId) : "",
    userHash: userId ? await sha256Hex(userId) : asString(options.userHash),
    messageIdHash,
    webhookEventIdHash: webhookEventId ? await sha256Hex(webhookEventId) : "",
  };
  if (!analysis.accepted) {
    const gate = analysis.classification?.gate;
    if (gate !== "hold") {
      return {
        captured: false,
        ignored: gate === "reject",
        held: false,
        proofId,
        reason: analysis.classification?.reason || "not_payment_evidence",
        imageClass: analysis.classification?.image_class || "uncertain",
      };
    }
    // Uncertain evidence stays an evidence candidate only. It is never a
    // Payment Proof and never reaches payments-worker from here.
    const hold = await holdUncertainEvidence(env, {
      proofId,
      image,
      lineUserId: userId,
      messageId,
      paymentContextText: contextText,
      sourceType: source,
      sourceContext: asString(options.sourceContext),
      holdReason: analysis.classification?.reason,
      imageClass: analysis.classification?.image_class,
      ...identity,
    });
    return {
      captured: false,
      ignored: false,
      held: true,
      heldStored: hold.held === true,
      heldDeduped: hold.deduped === true,
      proofId,
      reason: analysis.classification?.reason || "uncertain_payment_image",
      imageClass: analysis.classification?.image_class || "uncertain",
    };
  }

  return persistAcceptedEvidence(env, {
    proofId,
    image,
    analysis,
    lineUserId: userId,
    contextText,
    sourceType: source,
    sourceContext: asString(options.sourceContext),
    ...identity,
  });
}

// The single canonical accepted-evidence gate. Live LINE intake and held
// evidence reprocess both land here, so a promoted held item passes exactly the
// same correlation, pending-first Payment Proof and settlement contract.
async function persistAcceptedEvidence(env = {}, input = {}) {
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") throw new Error("line_slip_r2_binding_missing");
  const { proofId, image, analysis } = input;
  const source = asString(input.sourceType);
  const userId = asString(input.lineUserId);
  const now = new Date();
  const r2Key = `line-ofc/payment-proofs/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${proofId}/original.${image.extension}`;
  if (!(await env.LINE_SLIP_EVIDENCE.head?.(r2Key))) await env.LINE_SLIP_EVIDENCE.put(r2Key, image.body, { httpMetadata: { contentType: image.mimeType }, customMetadata: { evidence_sha256: image.sha256, proof_id: proofId, source: source === "user" ? "line_direct_user" : "line_group" } });
  const evidence = {
    proofId,
    sourceType: source,
    sourceContext: asString(input.sourceContext),
    paymentContextText: asString(input.contextText),
    groupHash: asString(input.groupHash),
    userHash: asString(input.userHash),
    messageIdHash: asString(input.messageIdHash),
    webhookEventIdHash: asString(input.webhookEventIdHash),
    r2Key,
    sha256: image.sha256,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    analysis,
    paymentOpsRoute: analysis.ops_route,
    payerName: asString(analysis.customer?.display_name || analysis.extraction?.payer_name),
    identityMatch: asString(analysis.customer?.source),
  };
  if (source === "user" && !evidence.payerName) {
    const payer = await resolveDirectPayerContext(env, userId);
    evidence.payerName = payer.payerName;
    evidence.identityMatch = evidence.identityMatch || payer.identityMatch;
  }
  const proof = await createPendingProof(env, evidence);
  const settlement = proof.deduped ? { status: "deduped" } : await settleTrackedMembership(env, evidence, proof, userId);
  const result = { ...proof, settlement };
  let delivery = null;
  try { delivery = await notifyPaymentProofOps(env, evidence, result); } catch (error) { console.log(JSON.stringify({ line_payment_alert: "failed", proof_id: proofId, error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100) })); }
  const verified = settlement.status === "materialized"
    ? true
    : settlement.status === "review_required"
      ? false
      : proof.verified === true;
  return { captured: true, deduped: proof.deduped, verified, proofId, recordId: proof.id, imageClass: analysis.classification?.image_class, paymentStage: analysis.payment_intelligence?.inferred_stage, trackingKind: analysis.payment_intelligence?.tracking_kind, settlementStatus: settlement.status, customerMatch: analysis.customer?.status, opsDelivery: delivery ? { delivered: delivery.sent === true, queued: delivery.queued === true, status: asString(delivery.delivery_status) || null } : null };
}

// Bounded recovery sweep: retry undelivered Ops notifications and reprocess
// held evidence candidates. It performs no settlement of its own — promotion
// re-enters the canonical accepted-evidence gate, and notification retry only
// re-sends an already-rendered message.
export async function runLineSlipEvidenceMaintenance(env = {}, options = {}) {
  const now = Number(options.now) || Date.now();
  const notification = await drainOpsNotificationOutbox(env, { now, limit: options.notificationLimit })
    .catch((error) => ({ error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80) }));
  const held = await reprocessHeldEvidence(env, {
    now,
    limit: options.heldLimit,
    analyze: ({ env: scopedEnv, image, lineUserId, contextText }) => analyzeProductionPaymentProof({ env: scopedEnv, image, lineUserId, contextText }),
    promote: ({ env: scopedEnv, state, image, analysis, lineUserId, contextText }) => persistAcceptedEvidence(scopedEnv, {
      proofId: state.proof_id,
      image,
      analysis,
      lineUserId,
      contextText,
      sourceType: state.source_type,
      sourceContext: `${asString(state.source_context) || "held_evidence"}_held_reprocess`,
      groupHash: state.group_hash,
      userHash: state.user_hash,
      messageIdHash: state.message_id_hash,
      webhookEventIdHash: state.webhook_event_id_hash,
    }),
    notifyReviewRequired: ({ env: scopedEnv, audit }) => notifyHeldEvidenceReview(scopedEnv, audit),
  }).catch((error) => ({ error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80) }));
  return { notification, held };
}

async function captureGroupImageEvidence(env = {}, event = {}) {
  if (event?.type !== "message" || messageType(event) !== "image") return { skipped: true, reason: "not_image" };
  if (!(await isPaymentProofGroup(env, event))) return { skipped: true, reason: "group_not_allowlisted" };
  return persistCapturedImage(env, event, { sourceContext: "allowlisted_payment_group" });
}

function directCandidateKey(userHash = "") { return `line-ofc/direct-user-candidates/${asString(userHash)}/latest.json`; }
async function storeDirectUserImageCandidate(env = {}, event = {}) {
  if (sourceType(event) !== "user" || messageType(event) !== "image") return { skipped: true, reason: "not_direct_user_image" };
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") throw new Error("line_slip_r2_binding_missing");
  const userId = asString(event?.source?.userId); const messageId = asString(event?.message?.id);
  if (!userId || !messageId) throw new Error("line_direct_candidate_identity_missing");
  const userHash = await sha256Hex(userId); const messageIdHash = await sha256Hex(messageId); const proofId = `line_${messageIdHash.slice(0, 24)}`;
  const timestamp = Number(event?.timestamp); const createdAtMs = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
  const candidate = { schema: "line_direct_payment_candidate_v1", message_id: messageId, message_id_hash: messageIdHash, proof_id: proofId, webhook_event_id: asString(event?.webhookEventId), user_hash: userHash, created_at_ms: createdAtMs };
  const key = directCandidateKey(userHash);
  await env.LINE_SLIP_EVIDENCE.put(key, JSON.stringify(candidate), { httpMetadata: { contentType: "application/json" }, customMetadata: { schema: candidate.schema, proof_id: proofId, source: "line_direct_user_candidate" } });
  return { candidate: true, proofId, userHash, key };
}

async function loadDirectUserImageCandidate(env = {}, userId = "") {
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.get !== "function" || !asString(userId)) return null;
  const userHash = await sha256Hex(userId); const key = directCandidateKey(userHash); const object = await env.LINE_SLIP_EVIDENCE.get(key);
  if (!object) return null;
  let candidate; try { candidate = JSON.parse(await object.text()); } catch (_) { return null; }
  const createdAtMs = Number(candidate?.created_at_ms);
  if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > directCandidateTtlMs(env)) { if (typeof env.LINE_SLIP_EVIDENCE.delete === "function") await env.LINE_SLIP_EVIDENCE.delete(key); return null; }
  return { ...candidate, key, userHash };
}

function recordContextText(record = {}) { const f = record?.fields || {}; return [f.admin_note, f.intent, f.member_name, f.payload_json].map(asString).filter(Boolean).join("\n"); }
async function recentDirectPaymentContext(env = {}, event = {}) {
  const userId = asString(event?.source?.userId); if (!userId || sourceType(event) !== "user") return { found: false, text: "" };
  const params = new URLSearchParams(); params.set("maxRecords", "12"); params.set("filterByFormula", `AND({line_user_id}='${formulaValue(userId)}',IS_AFTER({created_at},DATEADD(NOW(),-${paymentContextLookbackHours(env)},'hours')))`); params.set("sort[0][field]", "created_at"); params.set("sort[0][direction]", "desc");
  const payload = await airtableRequest(env, `${encodeURIComponent(consoleInboxTable(env))}?${params.toString()}`);
  for (const record of Array.isArray(payload.records) ? payload.records : []) { const text = recordContextText(record); if (hasPaymentContext(text)) return { found: true, text }; }
  return { found: false, text: "" };
}
async function hasRecentDirectPaymentContext(env = {}, event = {}) { return (await recentDirectPaymentContext(env, event)).found; }

async function captureDirectUserImageEvidence(env = {}, event = {}, options = {}) {
  if (event?.type !== "message" || messageType(event) !== "image" || sourceType(event) !== "user") return { skipped: true, reason: "not_direct_user_image" };
  let recentContext = options.recentPaymentContext; let recentContextText = asString(options.paymentContextText);
  if (typeof recentContext !== "boolean") {
    try { const recent = await recentDirectPaymentContext(env, event); recentContext = recent.found; recentContextText = recent.text; } catch (_) { recentContext = false; recentContextText = ""; }
  }
  return persistCapturedImage(env, event, {
    sourceContext: recentContext ? "recent_direct_payment_context" : "direct_user_visual_payment_gate",
    paymentContextText: recentContext ? recentContextText : "",
  });
}

async function promoteDirectUserCandidate(env = {}, event = {}) {
  if (sourceType(event) !== "user" || messageType(event) !== "text") return { skipped: true, reason: "not_direct_user_text" };
  const text = messageText(event); if (!hasPaymentFollowupContext(text)) return { skipped: true, reason: "followup_not_payment_related" };
  const userId = asString(event?.source?.userId); const candidate = await loadDirectUserImageCandidate(env, userId);
  if (!candidate) return { skipped: true, reason: "candidate_missing_or_stale" };
  const syntheticEvent = { type: "message", source: { type: "user", userId }, message: { type: "image", id: candidate.message_id }, webhookEventId: candidate.webhook_event_id || "" };
  const result = await persistCapturedImage(env, syntheticEvent, { messageId: candidate.message_id, proofId: candidate.proof_id, webhookEventId: candidate.webhook_event_id, userHash: candidate.user_hash, sourceContext: "direct_user_payment_followup", paymentContextText: text });
  if ((result?.captured || result?.ignored) && typeof env.LINE_SLIP_EVIDENCE?.delete === "function") await env.LINE_SLIP_EVIDENCE.delete(candidate.key);
  return result;
}

async function observeSignedLineEvents(request, env = {}) {
  const rawBody = await request.text(); const signature = asString(request.headers.get("x-line-signature"));
  if (!(await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET))) { console.log(JSON.stringify({ line_payment_ingress: "signature_rejected" })); return; }
  let body; try { body = JSON.parse(rawBody || "{}"); } catch (_) { console.log(JSON.stringify({ line_payment_ingress: "invalid_json" })); return; }
  for (const event of Array.isArray(body.events) ? body.events : []) {
    const source = sourceType(event); if (!["user", "group"].includes(source)) continue; const type = messageType(event);
    try {
      let result = null;
      if (source === "group" && type === "image") result = await captureGroupImageEvidence(env, event);
      else if (source === "user" && type === "image") result = await captureDirectUserImageEvidence(env, event);
      else if (source === "user" && type === "text") result = await promoteDirectUserCandidate(env, event);
      if (result && (type === "image" || result.captured || result.ignored || result.held)) console.log(JSON.stringify({ line_payment_ingress: result.captured ? "captured" : result.ignored ? "ignored_non_payment" : result.held ? "held_uncertain" : result.candidate ? "candidate" : "skipped", source_type: source, message_type: type, deduped: result.deduped === true, verified: result.verified === true, reason: asString(result.reason) || null, image_class: asString(result.imageClass) || null, payment_stage: asString(result.paymentStage) || null }));
    } catch (error) { console.log(JSON.stringify({ line_payment_ingress: "capture_failed", source_type: source, message_type: type, error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100) })); }
  }
  // Opportunistic recovery on live traffic. The hourly cron remains the floor
  // so recovery still happens when LINE is quiet. Bounded per invocation.
  try {
    const maintenance = await runLineSlipEvidenceMaintenance(env, { notificationLimit: 5, heldLimit: 3 });
    const retried = Number(maintenance?.notification?.retried) || 0;
    const heldProcessed = Number(maintenance?.held?.processed) || 0;
    if (retried || heldProcessed) console.log(JSON.stringify({ line_payment_maintenance: "ran", notifications_retried: retried, notifications_delivered: Number(maintenance?.notification?.delivered) || 0, held_processed: heldProcessed, held_promoted: Number(maintenance?.held?.promoted) || 0, held_review_required: Number(maintenance?.held?.review_required) || 0 }));
  } catch (_) { console.log(JSON.stringify({ line_payment_maintenance: "failed" })); }
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url); const isLineWebhook = request.method === "POST" && LINE_WEBHOOK_PATHS.has(url.pathname); const observerRequest = isLineWebhook ? request.clone() : null;
    const response = await currentWorker.fetch(request, env, ctx);
    if (observerRequest && response.ok) { const work = observeSignedLineEvents(observerRequest, env).catch(() => console.log(JSON.stringify({ line_payment_ingress: "observer_failed" }))); if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work); else await work; }
    return response;
  },
};

export const LINE_GROUP_INGRESS_INTERNALS = Object.freeze({
  alertsOpsThreadId,
  captureDirectUserImageEvidence,
  captureGroupImageEvidence,
  directCandidateKey,
  downloadLineImage,
  resolveDirectPayerContext,
  hasMembershipPaymentContext,
  hasPaymentContext,
  hasPaymentFollowupContext,
  hasRecentDirectPaymentContext,
  isPaymentProofGroup,
  loadDirectUserImageCandidate,
  membershipPaymentAcceptedByOwnerPolicy,
  membershipOpsThreadId,
  messageText,
  messageType,
  notifyHeldEvidenceReview,
  notifyPaymentProofOps,
  paymentNotificationPurpose,
  persistAcceptedEvidence,
  runLineSlipEvidenceMaintenance,
  settleTrackedMembership,
  paymentOpsThreadId,
  promoteDirectUserCandidate,
  recentDirectPaymentContext,
  sourceType,
  storeDirectUserImageCandidate,
});
