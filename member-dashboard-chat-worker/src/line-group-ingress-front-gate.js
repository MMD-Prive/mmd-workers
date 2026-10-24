import currentWorker from "./front-gate-index.js";
export { KenjiModelIdempotency } from "./front-gate-index.js";
import { classifyPaymentOpsRoute, membershipInferenceLabel } from "../../shared/payment-intelligence.mjs";
import { bindLineJobEvidence } from "./line-job-evidence-binding.mjs";
import { analyzeProductionPaymentProof } from "./payment-proof-intelligence.mjs";
import { dispatchOpsNotification, drainOpsNotificationOutbox } from "./line-ops-notification-outbox.mjs";
import { heldEvidenceAuditRecord, holdUncertainEvidence, reprocessHeldEvidence } from "./line-held-evidence-lane.mjs";
import { runPaymentObserverHealth } from "./payment-observer-health.mjs";
import { resolveLineCanonicalPayment, withPaymentEvidenceLock } from "../../shared/canonical-payment-evidence.mjs";
import { inspectPaymentProof, paymentProofReviewUrl, proofPrecheckLines } from "../../shared/payment-proof-precheck.mjs";

const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/"]);
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const MANUAL_SLIP_ACK = "ได้รับหลักฐานการชำระเงินแล้วครับ แต่รายละเอียดต้องให้ทาง MMD ตรวจสอบด้วยตนเอง กรุณารอสักครู่ก่อนนะครับ";
const SAFE_SLIP_ACK = "ได้รับหลักฐานการชำระเงินแล้วครับ ผมกำลังส่งรายละเอียดให้ทางระบบตรวจสอบ กรุณารอสักครู่ก่อนนะครับ";
const RETRY_SLIP_ACK = "ขณะนี้ระบบยังบันทึกหลักฐานการชำระเงินไม่สำเร็จครับ กรุณาเก็บสลิปไว้ก่อน ทาง MMD จะตรวจสอบและแจ้งให้ทราบอีกครั้งครับ";
const IMAGE_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_PAYMENT_PROOFS_TABLE = "tblfJfM4Sqag9zrLi";
const DEFAULT_CONSOLE_INBOX_TABLE = "tblFHmfpB2TTrzO2e";
const DEFAULT_DIRECT_CANDIDATE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PAYMENT_CONTEXT_LOOKBACK_HOURS = 48;
const PAYMENT_CONTEXT_RE = /(?:สลิป|หลักฐาน(?:การ)?(?:โอน|ชำระ)|โอน|จ่าย|ชำระ|สมัคร(?:สมาชิก)?|ต่อ(?:อายุ(?:สมาชิก)?|ให้|สมาชิก|เมม(?:เบอร์)?)|ค่าสมาชิก|เมมเบอร์|สมาชิก|payment(?:\s+proof)?|transfer(?:\s+(?:slip|proof|done))?|bank\s*transfer|renew(?:al)?|membership|promptpay|พร้อมเพย์)/i;
const PAYMENT_FOLLOWUP_RE = /(?:ขอ\s*เข้า\s*กลุ่ม|เข้า\s*กลุ่ม|access|drive|เข้าแล้ว|โอน|จ่าย|ชำระ|สลิป|หลักฐาน|สมัคร(?:สมาชิก)?|ต่อ(?:อายุ(?:สมาชิก)?|ให้|สมาชิก|เมม(?:เบอร์)?)|renew(?:al)?|payment|transfer|สมาชิก|member)/i;
const PAYMENT_EVIDENCE_FOLLOWUP_RE = /(?:โอน|จ่าย|ชำระ|สลิป|หลักฐาน|payment|transfer|promptpay|พร้อมเพย์)/i;
const DIRECT_CANDIDATE_WAIT_MS = 5000;
const DIRECT_CANDIDATE_POLL_MS = 500;
const MEMBERSHIP_PAYMENT_CONTEXT_RE = /(?:สมัคร(?:สมาชิก)?|ต่อ(?:อายุ(?:สมาชิก)?|ให้|สมาชิก|เมม(?:เบอร์)?)|ค่าสมาชิก|เมมเบอร์|สมาชิก|membership|member\s*(?:fee|renewal)?|renew(?:al)?)/i;
const BANK_DETAIL_CONTEXT_RE = /(?:คืนเงิน|โอนคืน|refund|ยกเลิก(?:งาน|รายการ)?|เลขบัญชี|บัญชี(?:สำหรับ)?(?:รับ|คืน)|ส่งบัญชี)/i;

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


function maskAccountNumber(value = "") {
  const raw = asString(value).replace(/\s+/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}

function maskAccountName(value = "") {
  const name = asString(value);
  if (!name) return "";
  if (name.length <= 2) return name.slice(0, 1) + "•";
  return name.slice(0, 2) + "•••";
}

function bankDetailPurpose(contextText = "") {
  return /(?:คืนเงิน|โอนคืน|refund|ยกเลิก(?:งาน|รายการ)?)/i.test(asString(contextText)) ? "refund" : "unknown";
}

async function recentDirectBankOpsContext(env = {}, lineUserId = "") {
  const userId = asString(lineUserId);
  if (!userId) return { found: false, text: "", purpose: "unknown", sessionId: "", jobId: "", refundAmountThb: null };
  const params = new URLSearchParams();
  params.set("maxRecords", "12");
  params.set("filterByFormula", `{line_user_id}='${formulaValue(userId)}'`);
  params.set("sort[0][field]", "created_at");
  params.set("sort[0][direction]", "desc");
  const payload = await airtableRequest(env, `${encodeURIComponent(consoleInboxTable(env))}?${params.toString()}`).catch(() => ({}));
  for (const record of Array.isArray(payload.records) ? payload.records : []) {
    const text = recordContextText(record);
    if (!BANK_DETAIL_CONTEXT_RE.test(text)) continue;
    let meta = {};
    try { meta = JSON.parse(asString(record?.fields?.payload_json) || "{}"); } catch (_) {}
    return {
      found: true,
      text,
      purpose: bankDetailPurpose(text),
      sessionId: asString(meta?.session_id || meta?.sessionId || meta?.linked_session || ""),
      jobId: asString(meta?.job_id || meta?.jobId || ""),
      refundAmountThb: positiveNumericAmount(
        meta?.refund_amount_thb ??
        meta?.refundAmountThb ??
        record?.fields?.refund_amount_thb ??
        null
      ),
    };
  }
  return { found: false, text: "", purpose: "unknown", sessionId: "", jobId: "", refundAmountThb: null };
}

function ownerWorkUrl(path = "") {
  const suffix = asString(path).startsWith("/") ? asString(path) : `/${asString(path)}`;
  return `https://www.mmdbkk.com${suffix}`;
}

function buildHypeOwnerProblemAlert({
  eventType = "",
  customerName = "",
  modelName = "",
  jobId = "",
  sessionId = "",
  refundAmountThb = null,
  accountNumberMasked = "",
} = {}) {
  const type = asString(eventType).toLowerCase();
  const customer = asString(customerName) || "LINE customer";
  const jobRef = asString(jobId || sessionId);
  const refundUrl = ownerWorkUrl("/internal/admin/refunds");
  const jobQuery = asString(jobId)
    ? `?job_id=${encodeURIComponent(asString(jobId))}`
    : asString(sessionId)
      ? `?session_id=${encodeURIComponent(asString(sessionId))}`
      : "";
  const jobUrl = jobQuery ? ownerWorkUrl(`/internal/admin/jobs/all${jobQuery}`) : "";
  const amount = positiveNumericAmount(refundAmountThb);

  if (type === "account_changed") {
    return [
      "🔴 HYPE · ACCOUNT CHANGED",
      "ลูกค้าส่งบัญชีรับเงินคืนใหม่ ไม่ตรงกับบัญชีเดิมของเคสนี้",
      "",
      `ลูกค้า: ${customer}`,
      jobRef ? `งาน: ${jobRef}` : "งาน: ยังจับคู่ไม่ได้",
      accountNumberMasked ? `บัญชีใหม่: ${asString(accountNumberMasked)}` : "",
      "",
      "ระบบจัดการแล้ว",
      "✓ เก็บบัญชีใหม่เป็นหลักฐานแยก",
      "✓ ไม่ overwrite บัญชีเดิม",
      "✓ ไม่แก้ Payment / Money Truth",
      "",
      "เปอร์ต้องทำต่อ: เปิด Refund แล้วตรวจว่าบัญชีใหม่ถูกต้องก่อนโอน",
      `เปิด Refund: ${refundUrl}`,
      jobUrl ? `เปิด Job: ${jobUrl}` : "",
    ].filter(Boolean).join("\n");
  }

  if (type === "refund_ready") {
    return [
      "🟠 HYPE · REFUND READY",
      "ลูกค้าส่งบัญชีเพื่อรับเงินคืนแล้ว",
      "",
      `ลูกค้า: ${customer}`,
      asString(modelName) ? `Model: ${asString(modelName)}` : "",
      jobRef ? `งาน: ${jobRef}` : "งาน: ยังจับคู่ไม่ได้",
      accountNumberMasked ? `บัญชี: ${asString(accountNumberMasked)}` : "",
      "",
      "ระบบจัดการแล้ว",
      "✓ อ่านข้อมูลบัญชีแล้ว",
      jobRef ? "✓ ผูกกับงานแล้ว" : "⚠️ ยังต้องเลือกงานก่อนดำเนินการ",
      "✓ สร้าง Refund Task แล้ว",
      "✓ ไม่แก้ Payment / Money Truth",
      "",
      amount != null ? `เปอร์ต้องทำต่อ: คืนเงิน ${amount.toLocaleString("th-TH")} บาท` : "เปอร์ต้องทำต่อ: เปิด Refund เพื่อตรวจยอดและโอนคืน",
      `เปิด Refund: ${refundUrl}`,
      jobUrl ? `เปิด Job: ${jobUrl}` : "",
    ].filter(Boolean).join("\n");
  }

  return [
    "🟠 HYPE · NEEDS YOU",
    "มีงานที่ต้องให้เปอร์ตรวจ",
    `ลูกค้า: ${customer}`,
    jobRef ? `งาน: ${jobRef}` : "งาน: ยังจับคู่ไม่ได้",
    `เปิด Control Room: ${ownerWorkUrl("/internal/admin/control-room")}`,
  ].join("\n");
}

async function notifyOwnerBankDetailReady(env = {}, {
  proofId = "",
  purpose = "",
  customerName = "",
  jobId = "",
  sessionId = "",
  refundAmountThb = null,
  accountNumberMasked = "",
  accountChanged = false,
} = {}) {
  const chatId = paymentOpsChatId(env);
  if (!chatId) return { skipped: true, reason: "telegram_config_missing" };
  const eventType = accountChanged === true ? "account_changed" : (asString(purpose) === "refund" ? "refund_ready" : "needs_you");
  const text = buildHypeOwnerProblemAlert({
    eventType,
    customerName,
    jobId,
    sessionId,
    refundAmountThb,
    accountNumberMasked,
  });
  const threadId = alertsOpsThreadId(env);
  const delivery = await sendOpsMessage(env, {
    chatId,
    threadId,
    flow: "alert",
    text,
    eventKey: asString(proofId),
    purpose: eventType,
  });
  return {
    sent: delivery.delivered === true,
    queued: delivery.durable === true && delivery.delivered !== true,
    duplicate: delivery.duplicate === true,
    delivery_status: asString(delivery.status) || null,
    delivery_attempts: Number(delivery.attempts) || 0,
    delivery_durable: delivery.durable === true,
    delivery_reason: asString(delivery.reason) || null,
    notification_id: asString(delivery.id) || null,
    topic: "alerts",
    thread_id: threadId,
    delivered: delivery.delivered === true,
  };
}

async function persistBankDetailOps(env = {}, input = {}) {
  const image = input.image;
  const analysis = input.analysis || {};
  const extraction = analysis.extraction || {};
  const userId = asString(input.lineUserId);
  const proofId = asString(input.proofId);
  if (!image?.body || !proofId || !userId) return { captured: false, reason: "bank_detail_input_incomplete" };
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") return { captured: false, reason: "private_bucket_missing" };

  const recent = await recentDirectBankOpsContext(env, userId);
  const contextText = [asString(input.contextText), recent.text].filter(Boolean).join("\n");
  const purpose = bankDetailPurpose(contextText);
  const accountNumber = asString(extraction.account_number);
  const accountName = asString(extraction.account_name);
  const bankName = asString(extraction.account_bank || extraction.receiver_bank || extraction.sender_bank);
  if (!accountNumber) return { captured: false, reason: "account_number_missing" };
  const accountFingerprint = await sha256Hex([
    "refund-account-v1",
    userId,
    bankName.toLowerCase().replace(/\s+/g, ""),
    accountNumber.replace(/\D+/g, ""),
    accountName.toLowerCase().replace(/\s+/g, " "),
  ].join("|"));

  const now = new Date();
  const base = `line-ofc/bank-details/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${proofId}`;
  const sourceImageKey = `${base}/original.${image.extension}`;
  const privateDetailKey = `${base}/detail.json`;
  const customer = await resolveDirectPayerContext(env, userId);

  await env.LINE_SLIP_EVIDENCE.put(sourceImageKey, image.body, {
    httpMetadata: { contentType: image.mimeType },
    customMetadata: { schema: "mmd_bank_detail_image_v1", source: "line_direct_user", proof_id: proofId },
  });
  await env.LINE_SLIP_EVIDENCE.put(privateDetailKey, JSON.stringify({
    schema: "mmd_bank_detail_private_v1",
    bank_name: bankName,
    account_name: accountName,
    account_number: accountNumber,
    account_fingerprint: accountFingerprint,
    purpose,
    source_image_key: sourceImageKey,
    received_at: now.toISOString(),
  }), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { schema: "mmd_bank_detail_private_v1", proof_id: proofId, purpose },
  });

  const service = env.ADMIN_WORKER;
  if (!service || typeof service.fetch !== "function") {
    return { captured: true, queued: false, reason: "admin_worker_binding_missing", purpose };
  }
  const response = await service.fetch(new Request("https://admin-worker.internal/v1/internal/refund-ops/intake", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "member-dashboard-chat-worker",
    },
    body: JSON.stringify({
      inbox_id: `refund_${proofId}`,
      line_user_id: userId,
      customer_name: customer.payerName || "",
      purpose,
      bank_name: bankName,
      account_name_masked: maskAccountName(accountName),
      account_number_masked: maskAccountNumber(accountNumber),
      account_fingerprint: accountFingerprint,
      private_detail_key: privateDetailKey,
      source_image_key: sourceImageKey,
      session_id: recent.sessionId || "",
      job_id: recent.jobId || "",
    }),
  }));
  const payload = await response.json().catch(() => ({}));
  const queued = response.ok && payload?.ok === true;
  const deduped = payload?.deduped === true;
  let ownerNotification = null;
  if (queued && !deduped) {
    try {
      ownerNotification = await notifyOwnerBankDetailReady(env, {
        proofId,
        purpose,
        customerName: customer.payerName || "",
        jobId: recent.jobId || "",
        sessionId: recent.sessionId || "",
        refundAmountThb: recent.refundAmountThb,
        accountNumberMasked: maskAccountNumber(accountNumber),
        accountChanged: payload?.account_changed === true,
      });
    } catch (error) {
      ownerNotification = { delivered: false, reason: "owner_notification_failed" };
      console.log(JSON.stringify({
        line_bank_detail_owner_notification: "failed",
        proof_id: proofId,
        error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100),
      }));
    }
  }
  return {
    captured: true,
    queued,
    deduped,
    purpose,
    accountChanged: payload?.account_changed === true,
    accountChangeReviewRequired: payload?.account_change_review_required === true,
    imageClass: "bank_account_detail",
    reason: response.ok ? "bank_detail_ops_created" : "bank_detail_ops_queue_failed",
    ownerNotification: ownerNotification ? {
      delivered: ownerNotification.sent === true || ownerNotification.delivered === true,
      queued: ownerNotification.queued === true,
      skipped: ownerNotification.skipped === true,
      reason: asString(ownerNotification.reason) || null,
    } : null,
  };
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
  if (existing?.id) return { id: existing.id, deduped: true, verified: false };
  const analysis = evidence.analysis || {};
  const extraction = analysis.extraction || {};
  const links = analysis.links || {};
  const opsRoute = analysis.ops_route || evidence.paymentOpsRoute || classifyPaymentOpsRoute({ source_context: evidence.sourceContext, context_text: evidence.paymentContextText });
  const membershipBound = Boolean(asString(links.member) || asString(links.renewal));
  const noteValue = {
    schema: "line_payment_evidence_v4",
    evidence_only: true,
    source_type: evidence.sourceType,
    source_context: evidence.sourceContext || null,
    identity_match: evidence.identityMatch || analysis.customer?.source || "unresolved",
    identity_binding_review_required: !membershipBound,
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
      bank_transaction_ref: extraction.payment_ref || null,
      method: extraction.extraction_method || null,
      confidence: extraction.confidence_score || 0,
      provider: extraction.provider || null,
      sender_bank: extraction.sender_bank || null,
      receiver_bank: extraction.receiver_bank || null,
      amount_thb: extraction.amount_thb ?? null,
      paid_at: extraction.paid_at || null,
    },
    image_classification: analysis.classification || null,
    client_match: analysis.customer || null,
    links,
    payment_intelligence: analysis.payment_intelligence || null,
    job_correlation: analysis.job_correlation || null,
    canonical_payment: analysis.canonical_payment || null,
    ...(analysis.session_binding ? { session_binding: analysis.session_binding } : {}),
    ...(analysis.automatic_job_binding ? { automatic_job_binding: analysis.automatic_job_binding } : {}),
    review_summary: analysis.review_summary || null,
    payment_ops_route: { topic: opsRoute.topic, classification: opsRoute.classification, confidence: opsRoute.confidence, reason: opsRoute.reason, should_alert: opsRoute.should_alert === true },
    payment_truth: "unverified",
    official_verification_required: true,
    may_mark_paid: false,
    may_award_points: false,
    may_extend_membership: false,
    may_confirm_session: false,
    owner_policy: null,
    settlement: {
      status: "pending",
      authority: "payments-worker",
      reason: membershipBound ? "manual_official_verification_required" : "canonical_identity_binding_manual_review_required",
    },
  };
  // LINE intake is evidence-only. Only the separate official verification flow
  // may change payment truth or materialize membership.
  const fields = { proof_id: evidence.proofId, channel: "line_ofc", note: JSON.stringify(noteValue), status: "pending" };
  const payerName = asString(extraction.payer_name || analysis.customer?.display_name || evidence.payerName);
  if (payerName) fields.payer_name = payerName;
  if (extraction.amount_thb != null) fields.amount_thb = extraction.amount_thb;
  const paymentRef = asString(analysis.canonical_payment?.payment_ref || extraction.payment_ref);
  if (paymentRef && !analysis.session_binding) fields.payment_ref = paymentRef;
  if (safePaidDate(extraction.paid_at)) fields.paid_at = safePaidDate(extraction.paid_at);
  if (asString(links.member)) fields.member = [asString(links.member)];
  if (asString(links.client)) fields.Client = [asString(links.client)];
  if (asString(links.session)) fields.session = [asString(links.session)];
  if (asString(links.payment)) fields.payment = [asString(links.payment)];
  if (asString(links.renewal)) fields["MMD — LIFF Renewal Sessions"] = [asString(links.renewal)];
  const create = async () => {
    if (analysis.canonical_payment?.status === "exact") {
      const exactProofId = analysis.proof_precheck?.status === "duplicate" ? asString(analysis.proof_precheck.primary_proof_id) : "";
      const formula = exactProofId ? `AND({payment_ref}='${formulaValue(paymentRef)}',{proof_id}='${formulaValue(exactProofId)}')` : `{payment_ref}='${formulaValue(paymentRef)}'`;
      const params = new URLSearchParams({ maxRecords: exactProofId ? "2" : "1", filterByFormula: formula });
      const found = await airtableRequest(env, `${encodeURIComponent(paymentProofsTable(env))}?${params}`);
      if (exactProofId && (found.offset || found.records?.length > 1)) throw new Error("payment_proof_identity_ambiguous");
      const prior = found.records?.[0];
      if (prior?.id && analysis.proof_precheck?.status === "duplicate" && analysis.proof_precheck.primary_proof_id === asString(prior.fields?.proof_id)) {
        return { id: prior.id, proofId: asString(prior.fields?.proof_id), deduped: true, verified: false };
      }
      if (prior?.id) noteValue.related_payment_proof_id = asString(prior.fields?.proof_id);
    }
    fields.note = JSON.stringify(noteValue);
    const payload = await airtableRequest(env, encodeURIComponent(paymentProofsTable(env)), { method: "POST", body: JSON.stringify({ fields }) });
    return { id: asString(payload?.id), deduped: false, verified: false, mayExtendMembership: false, note: noteValue };
  };
  return analysis.canonical_payment?.status === "exact"
    ? withPaymentEvidenceLock(env.LINE_SLIP_EVIDENCE, paymentRef, create)
    : create();
}

async function settleTrackedMembership(_env = {}, _evidence = {}, proof = {}, _lineUserId = "") {
  if (proof?.deduped === true) return { status: "deduped" };
  return {
    status: "pending",
    authority: "payments-worker",
    reason: "manual_official_verification_required",
  };
}

function paymentOpsChatId(env = {}) { return asString(env.TELEGRAM_OPS_CHAT_ID || env.TELEGRAM_CHAT_ID); }
function paymentOpsThreadId(env = {}) { const value = Number(env.TELEGRAM_PAYMENT_THREAD_ID || env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM); return Number.isFinite(value) && value > 0 ? Math.floor(value) : 22; }
function membershipOpsThreadId(env = {}) { const value = Number(env.TELEGRAM_MEMBERSHIP_THREAD_ID || env.TG_THREAD_MEMBERSHIP); return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20; }
function alertsOpsThreadId(env = {}) { const value = Number(env.TELEGRAM_ALERTS_THREAD_ID || env.TG_THREAD_ALERTS); return Number.isFinite(value) && value > 0 ? Math.floor(value) : 9; }

// Durable Ops delivery. The message is persisted before the first send attempt
// and retried from the outbox, so a Telegram outage can never lose an operator
// notification and can never mutate payment or entitlement truth.
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
  if (!isMembership) return "service_payment_review";
  if (asString(settlementStatus) === "deduped") return "membership_payment_replay";
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

function paymentProofCategory(trackingKind, isMembership) {
  const labels = isMembership
    ? { membership_signup: "ค่าสมาชิก", membership_renewal: "ค่าต่อสมาชิก" }
    : { job_deposit: "ค่ามัดจำ", job_final: "ค่าจบงาน", job_full: "ค่าบริการจ่ายเต็ม", job_tip: "ค่าทิป" };
  return labels[trackingKind] || (isMembership ? "ค่าสมาชิก · รอตรวจประเภท" : "ค่างาน · รอตรวจประเภท");
}


function buildDirectPaymentAcknowledgement(evidence = {}, result = {}) {
  if (result?.acknowledgement === "retry") return RETRY_SLIP_ACK;
  if (result?.deduped === true || result?.acknowledgement === "safe") return SAFE_SLIP_ACK;
  if (result?.manualReviewRequired === true || result?.heldStored === true || result?.acknowledgement === "manual") return MANUAL_SLIP_ACK;
  return SAFE_SLIP_ACK;
}

async function notifyDirectCustomerPaymentEvidence(env = {}, evidence = {}, result = {}, replyToken = "") {
  if (asString(evidence.sourceType) !== "user") return { skipped: true, reason: "not_direct_user" };
  const reply = asString(replyToken);
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!reply) return { skipped: true, reason: "reply_token_missing" };
  if (!token) return { skipped: true, reason: "line_token_missing" };

  const text = buildDirectPaymentAcknowledgement(evidence, result);
  if (!text) return { skipped: true, reason: "message_empty" };

  try {
    const response = await fetch(LINE_REPLY_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        replyToken: reply,
        messages: [{ type: "text", text }],
      }),
    });
    if (!response.ok) return { sent: false, status: response.status, reason: `line_reply_${response.status}` };
    return { sent: true, status: response.status };
  } catch (error) {
    return {
      sent: false,
      reason: asString(error?.message || error || "line_reply_failed").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100),
    };
  }
}

async function notifyPaymentProofOps(env = {}, evidence = {}, result = {}) {
  if (result?.deduped === true && !result?.proofId && evidence.analysis?.proof_precheck?.status !== "duplicate") return { skipped: true, reason: "deduped" };
  const chatId = paymentOpsChatId(env);
  // Without a configured Ops destination there is nothing to address. A missing
  // binding/secret is not skipped here: it is recorded durably and retried.
  if (!chatId) return { skipped: true, reason: "telegram_config_missing" };
  const analysis = evidence.analysis || {};
  const route = analysis.ops_route || evidence.paymentOpsRoute || classifyPaymentOpsRoute({ source_context: evidence.sourceContext, context_text: evidence.paymentContextText });
  const extraction = analysis.extraction || {};
  const isMembership = route.should_alert !== true
    && (route.topic === "membership" || hasMembershipPaymentContext(evidence.paymentContextText));
  const threadId = isMembership ? membershipOpsThreadId(env) : paymentOpsThreadId(env);
  const purpose = asString(analysis.payment_intelligence?.inferred_label) || membershipInferenceLabel(route.inference) || (isMembership ? "Membership / Renewal" : "Payment / Service");
  const customer = asString(analysis.customer?.display_name || evidence.payerName);
  const trackingKind = asString(analysis.payment_intelligence?.tracking_kind) || "unresolved_payment";
  const settlement = result?.settlement || null;
  const category = paymentProofCategory(trackingKind, isMembership);
  const statusLine = "สถานะ: รอตรวจสอบ";
  const text = [
    `${isMembership ? "🧾" : "💳"} สลิป${category}`,
    statusLine,
    `เปิดตรวจและยืนยันเงินเข้า: ${analysis.proof_precheck?.review_url || paymentProofReviewUrl(result.proofId || evidence.proofId)}`,
    ...proofPrecheckLines(analysis.proof_precheck),
    `Source: ${evidence.sourceType === "user" ? "LINE OA direct" : "LINE payment group"}`,
    `Proof: ${evidence.proofId}`,
    `Classified: ${purpose}`,
    `ประเภท: ${category}`,
    customer ? `Customer: ${customer}` : "Customer: pending match",
    extraction.amount_thb != null ? `Amount: ${Number(extraction.amount_thb).toLocaleString("en-US")} THB` : "Amount: pending extraction",
    ...(!isMembership ? paymentJobCorrelationLines(analysis) : []),
    `Routing: ${route.reason}`,
    analysis.job_correlation?.status === "exact" || isMembership
      ? "ขั้นต่อไป: ตรวจเงินเข้าจริง แล้วกด ยืนยันเงินเข้า (Official Verify) ในลิงก์ด้านบน"
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
  // A failed Telegram send never changes or blocks the pending Payment Proof.
  // It stays recoverable in the durable outbox.
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
    verified: false,
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
  if (existing?.id) return { captured: true, deduped: true, proofId, recordId: existing.id, verified: false, acknowledgement: "safe" };

  const image = await downloadLineImage(env, messageId);
  const userId = asString(event?.source?.userId);
  const contextText = asString(options.paymentContextText);
  const analysis = await analyzeProductionPaymentProof({
    env,
    image,
    lineUserId: userId,
    contextText,
    automatedExtraction: true,
    paymentContextConfirmed: source === "group" || hasPaymentContext(contextText),
  });
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
    if (source === "user" && analysis.classification?.image_class === "bank_account_detail") {
      return persistBankDetailOps(env, {
        proofId,
        image,
        analysis,
        lineUserId: userId,
        contextText,
      });
    }
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
// same correlation and pending-only Payment Proof contract.
async function persistAcceptedEvidence(env = {}, input = {}) {
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") throw new Error("line_slip_r2_binding_missing");
  const { proofId, image } = input;
  let analysis = input.analysis;
  const precheck = await inspectPaymentProof(env, { fields: {
    proof_id: proofId, channel: "line_ofc", Client: analysis.links?.client ? [analysis.links.client] : [], member: analysis.links?.member ? [analysis.links.member] : [],
    session: analysis.links?.session ? [analysis.links.session] : [], payment: analysis.links?.payment ? [analysis.links.payment] : [],
    note: JSON.stringify({ schema: "line_payment_evidence_v4", evidence_sha256: image.sha256, extraction: { ...analysis.extraction, bank_transaction_ref: analysis.extraction?.payment_ref } }),
  } });
  if (analysis.customer?.status !== "matched" && precheck.canonical) {
    precheck.status = "needs_review"; precheck.canonical = null; precheck.primary_proof_id = proofId;
    precheck.review_url = paymentProofReviewUrl(proofId); precheck.issues = ["canonical_customer_ambiguous"];
  }
  if (precheck.status === "needs_review") {
    analysis = { ...analysis, links: { ...analysis.links, session: "", payment: "" },
      job_correlation: { ...analysis.job_correlation, status: "ambiguous", selected: null, reason: "evidence_context_conflict" } };
  }
  // Exact evidence + canonical customer + freshly re-read Payment/Session only.
  // Do not fill an unread slip amount from the expected payment amount.
  if (precheck.canonical && analysis.customer?.status === "matched") {
    const c = precheck.canonical;
    analysis = { ...analysis, links: { ...analysis.links, session: c.session_record_id, payment: c.payment_record_id },
      payment_intelligence: { ...analysis.payment_intelligence, inferred_stage: c.payment_stage, inferred_label: c.payment_stage, tracking_kind: `job_${c.payment_stage}`, official_verification_required: true, may_mark_paid: false },
      job_correlation: { status: "exact", reason: "same_evidence_canonical_customer_payment", candidate_count: 1, selected: c, candidates: [c] } };
  }
  const canonicalPayment = (analysis.customer?.status === "matched" ? precheck.canonical : null) || await resolveLineCanonicalPayment(env, analysis)
    .catch(() => ({ status: "unresolved", reason: "canonical_payment_lookup_failed" }));
  analysis = { ...analysis, canonical_payment: canonicalPayment, proof_precheck: precheck };
  if (canonicalPayment.status === "exact") {
    analysis.links = { ...analysis.links, payment: canonicalPayment.payment_record_id };
  }
  analysis = await bindLineJobEvidence(env, analysis, { proofId, contextText: input.contextText, sourceContext: input.sourceContext, evidenceSha256: image.sha256 });
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
  if (proof.note?.related_payment_proof_id) {
    analysis.proof_precheck = { ...precheck, status: "needs_review", primary_proof_id: proofId,
      review_url: paymentProofReviewUrl(proofId, canonicalPayment.session_id), issues: ["existing_payment_proof_not_transfer_dedup"] };
  }
  if (proof.deduped && proof.proofId && precheck.status !== "duplicate") {
    analysis.proof_precheck = { ...precheck, status: "needs_review", primary_proof_id: proof.proofId,
      review_url: paymentProofReviewUrl(proof.proofId, canonicalPayment.session_id), issues: ["existing_payment_proof_not_transfer_dedup"] };
  }
  const settlement = proof.deduped ? { status: "deduped" } : await settleTrackedMembership(env, evidence, proof, userId);
  const result = { ...proof, settlement };
  let delivery = null;
  try { delivery = await notifyPaymentProofOps(env, evidence, result); } catch (error) { console.log(JSON.stringify({ line_payment_alert: "failed", proof_id: proofId, error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100) })); }
  const missing = Array.isArray(analysis.review_summary?.missing) ? analysis.review_summary.missing : [];
  const manualReviewRequired = missing.length > 0
    || analysis.customer?.status !== "matched"
    || analysis.automatic_job_binding?.status === "needs_review"
    || analysis.job_correlation?.status === "ambiguous"
    || analysis.extraction?.extraction_method === "none"
    || analysis.classification?.confidence < 0.8;
  return {
    captured: true,
    deduped: proof.deduped,
    verified: false,
    proofId,
    reviewProofId: proof.proofId || proofId,
    reviewUrl: analysis.proof_precheck?.review_url || paymentProofReviewUrl(proof.proofId || proofId, analysis.session_binding?.session_id || analysis.canonical_payment?.session_id),
    recordId: proof.id,
    imageClass: analysis.classification?.image_class,
    paymentStage: analysis.payment_intelligence?.inferred_stage,
    trackingKind: analysis.payment_intelligence?.tracking_kind,
    settlementStatus: settlement.status,
    customerMatch: analysis.customer?.status,
    manualReviewRequired,
    acknowledgement: proof.deduped ? "safe" : manualReviewRequired ? "manual" : "safe",
    opsDelivery: delivery ? { delivered: delivery.sent === true, queued: delivery.queued === true, status: asString(delivery.delivery_status) || null } : null,
  };
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
    analyze: ({ env: scopedEnv, image, lineUserId, contextText }) => analyzeProductionPaymentProof({
      env: scopedEnv,
      image,
      lineUserId,
      contextText,
      automatedExtraction: false,
      paymentContextConfirmed: hasPaymentContext(contextText),
    }),
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
  const health = options.health === false
    ? { skipped: true, reason: "health_cron_only" }
    : await runPaymentObserverHealth(env, { now })
        .catch((error) => ({ error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80) }));
  return { notification, held, health };
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

export async function hasPendingDirectUserPaymentCandidate(env = {}, event = {}, options = {}) {
  if (sourceType(event) !== "user" || messageType(event) !== "text" || !hasPaymentFollowupContext(messageText(event))) return false;
  const userId = asString(event?.source?.userId);
  if (!userId) return false;
  if (await loadDirectUserImageCandidate(env, userId)) return true;
  // The signed text webhook can run before the image observer finishes its R2
  // candidate write. Only strong payment-evidence language gets a bounded wait;
  // generic membership/Drive messages keep their existing immediate path.
  const requestedWaitMs = Number(options.waitForImageMs);
  const waitMs = Number.isFinite(requestedWaitMs) ? Math.min(Math.max(requestedWaitMs, 0), DIRECT_CANDIDATE_WAIT_MS) : 0;
  if (!waitMs || !PAYMENT_EVIDENCE_FOLLOWUP_RE.test(messageText(event)) || typeof env.LINE_SLIP_EVIDENCE?.get !== "function") return false;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(DIRECT_CANDIDATE_POLL_MS, deadline - Date.now())));
    if (await loadDirectUserImageCandidate(env, userId)) {
      console.log(JSON.stringify({ line_payment_route: "candidate_wait_resolved" }));
      return true;
    }
  }
  console.log(JSON.stringify({ line_payment_route: "candidate_wait_expired" }));
  return false;
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
  if (!recentContext) return storeDirectUserImageCandidate(env, event);
  try {
    return await persistCapturedImage(env, event, {
      sourceContext: "recent_direct_payment_context",
      paymentContextText: recentContextText,
    });
  } catch (error) {
    const failure = error instanceof Error ? error : new Error("line_slip_intake_failed");
    failure.lineSlipRetryAcknowledgement = true;
    throw failure;
  }
}

async function promoteDirectUserCandidate(env = {}, event = {}) {
  if (sourceType(event) !== "user" || messageType(event) !== "text") return { skipped: true, reason: "not_direct_user_text" };
  const text = messageText(event); if (!hasPaymentFollowupContext(text)) return { skipped: true, reason: "followup_not_payment_related" };
  try {
    const userId = asString(event?.source?.userId); const candidate = await loadDirectUserImageCandidate(env, userId);
    console.log(JSON.stringify({ line_payment_match: "candidate_lookup", candidate_found: Boolean(candidate) }));
    if (!candidate) return { skipped: true, reason: "candidate_missing_or_stale" };
    const syntheticEvent = { type: "message", source: { type: "user", userId }, message: { type: "image", id: candidate.message_id }, webhookEventId: candidate.webhook_event_id || "" };
    const result = await persistCapturedImage(env, syntheticEvent, { messageId: candidate.message_id, proofId: candidate.proof_id, webhookEventId: candidate.webhook_event_id, userHash: candidate.user_hash, sourceContext: "direct_user_payment_followup", paymentContextText: text });
    if ((result?.captured || result?.ignored) && typeof env.LINE_SLIP_EVIDENCE?.delete === "function") await env.LINE_SLIP_EVIDENCE.delete(candidate.key);
    return result;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error("line_slip_intake_failed");
    failure.lineSlipRetryAcknowledgement = true;
    throw failure;
  }
}

async function acknowledgeDirectSlipResult(env = {}, event = {}, result = {}) {
  if (sourceType(event) !== "user" || !asString(event?.replyToken)) return { skipped: true, reason: "reply_not_available" };
  if (result?.imageClass === "bank_account_detail") return { skipped: true, reason: "not_payment_proof" };
  if (!(result?.captured || result?.deduped || result?.heldStored || result?.acknowledgement === "retry")) return { skipped: true, reason: "no_durable_payment_evidence" };
  return notifyDirectCustomerPaymentEvidence(env, { sourceType: "user" }, result, event.replyToken);
}

async function observeSignedLineEvents(request, env = {}) {
  const rawBody = await request.text(); const signature = asString(request.headers.get("x-line-signature"));
  if (!(await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET))) { console.log(JSON.stringify({ line_payment_ingress: "signature_rejected" })); return; }
  let body; try { body = JSON.parse(rawBody || "{}"); } catch (_) { console.log(JSON.stringify({ line_payment_ingress: "invalid_json" })); return; }
  const events = Array.isArray(body.events) ? body.events : [];
  // Diagnostics are aggregate-only: never log raw event types, payloads, LINE IDs, or headers.
  const knownEventTypes = new Set(["message", "unsend", "follow", "unfollow", "join", "leave", "memberJoined", "memberLeft", "postback", "beacon", "accountLink", "videoPlayComplete"]);
  const eventTypeCounts = Object.create(null);
  for (const event of events) {
    const eventType = knownEventTypes.has(event?.type) ? event.type : "other";
    eventTypeCounts[eventType] = (eventTypeCounts[eventType] || 0) + 1;
  }
  console.log(JSON.stringify({ line_payment_observer: "batch_parsed", events_array: Array.isArray(body.events), event_count: events.length, event_type_counts: eventTypeCounts }));
  for (const event of events) {
    const source = sourceType(event); const type = messageType(event);
    if (event?.type === "message") console.log(JSON.stringify({
      line_payment_match: "event_seen",
      source_type: source,
      message_type: type === "text" || type === "image" ? type : "other",
      payment_followup: source === "user" && type === "text" ? hasPaymentFollowupContext(messageText(event)) : null,
    }));
    if (!["user", "group"].includes(source)) continue;
    try {
      let result = null;
      if (source === "group" && type === "image") result = await captureGroupImageEvidence(env, event);
      else if (source === "user" && type === "image") result = await captureDirectUserImageEvidence(env, event);
      else if (source === "user" && type === "text") result = await promoteDirectUserCandidate(env, event);
      if (result) {
        const acknowledgement = await acknowledgeDirectSlipResult(env, event, result);
        if (acknowledgement?.sent === false) console.log(JSON.stringify({ line_payment_acknowledgement: "failed", reason: asString(acknowledgement.reason).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100) }));
      }
      const candidateLookupMiss = source === "user" && type === "text" && result?.skipped === true && result.reason === "candidate_missing_or_stale";
      if (result && (type === "image" || result.captured || result.ignored || result.held || candidateLookupMiss)) console.log(JSON.stringify({ line_payment_ingress: result.imageClass === "bank_account_detail" ? "bank_detail_ops" : result.captured ? "captured" : result.ignored ? "ignored_non_payment" : result.held ? "held_uncertain" : result.candidate ? "candidate" : candidateLookupMiss ? "candidate_missing" : "skipped", source_type: source, message_type: type, deduped: result.deduped === true, verified: result.verified === true, reason: asString(result.reason) || null, image_class: asString(result.imageClass) || null, payment_stage: asString(result.paymentStage) || null }));
    } catch (error) {
      if (error?.lineSlipRetryAcknowledgement === true) {
        const acknowledgement = await acknowledgeDirectSlipResult(env, event, { acknowledgement: "retry" });
        if (acknowledgement?.sent === false) console.log(JSON.stringify({ line_payment_acknowledgement: "failed", reason: asString(acknowledgement.reason).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100) }));
      }
      console.log(JSON.stringify({ line_payment_ingress: "capture_failed", source_type: source, message_type: type, error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100) }));
    }
  }
  // Opportunistic recovery on live traffic. The hourly cron remains the floor
  // so recovery still happens when LINE is quiet. Bounded per invocation.
  try {
    const maintenance = await runLineSlipEvidenceMaintenance(env, { notificationLimit: 5, heldLimit: 3, health: false });
    const retried = Number(maintenance?.notification?.retried) || 0;
    const heldProcessed = Number(maintenance?.held?.processed) || 0;
    if (retried || heldProcessed) console.log(JSON.stringify({ line_payment_maintenance: "ran", notifications_retried: retried, notifications_delivered: Number(maintenance?.notification?.delivered) || 0, held_processed: heldProcessed, held_promoted: Number(maintenance?.held?.promoted) || 0, held_review_required: Number(maintenance?.held?.review_required) || 0 }));
  } catch (_) { console.log(JSON.stringify({ line_payment_maintenance: "failed" })); }
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url); const isLineWebhook = request.method === "POST" && LINE_WEBHOOK_PATHS.has(url.pathname); const observerRequest = isLineWebhook ? request.clone() : null;
    const response = await currentWorker.fetch(request, env, ctx);
    if (observerRequest && !response.ok) console.log(JSON.stringify({ line_payment_observer: "skipped", reason: "handler_non_2xx", response_status: response.status }));
    if (observerRequest && response.ok) {
      console.log(JSON.stringify({ line_payment_observer: "scheduled", response_status: response.status, execution: typeof ctx?.waitUntil === "function" ? "wait_until" : "inline" }));
      const work = observeSignedLineEvents(observerRequest, env).catch(() => console.log(JSON.stringify({ line_payment_ingress: "observer_failed" })));
      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work); else await work;
    }
    return response;
  },
};

export const LINE_GROUP_INGRESS_INTERNALS = Object.freeze({
  acknowledgeDirectSlipResult,
  createPendingProof,
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
  membershipOpsThreadId,
  messageText,
  messageType,
  notifyHeldEvidenceReview,
  notifyPaymentProofOps,
  notifyDirectCustomerPaymentEvidence,
  buildDirectPaymentAcknowledgement,
  buildHypeOwnerProblemAlert,
  notifyOwnerBankDetailReady,
  observeSignedLineEvents,
  persistBankDetailOps,
  recentDirectBankOpsContext,
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
