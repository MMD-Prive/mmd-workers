import currentWorker from "./front-gate-index.js";
export { KenjiModelIdempotency } from "./front-gate-index.js";

const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/"]);
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_PAYMENT_PROOFS_TABLE = "tblfJfM4Sqag9zrLi";
const DEFAULT_CONSOLE_INBOX_TABLE = "tblFHmfpB2TTrzO2e";
const DEFAULT_DIRECT_CANDIDATE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PAYMENT_CONTEXT_LOOKBACK_HOURS = 48;
const PAYMENT_CONTEXT_RE = /(?:สลิป|หลักฐาน(?:การ)?(?:โอน|ชำระ)|โอน|จ่าย|ชำระ|ต่ออายุ|ค่าสมาชิก|เมมเบอร์|สมาชิก|payment(?:\s+proof)?|transfer(?:\s+(?:slip|proof|done))?|bank\s*transfer|renew(?:al)?|membership|promptpay|พร้อมเพย์)/i;
const PAYMENT_FOLLOWUP_RE = /(?:ขอ\s*เข้า\s*กลุ่ม|เข้า\s*กลุ่ม|access|drive|เข้าแล้ว|โอน|จ่าย|ชำระ|สลิป|หลักฐาน|ต่ออายุ|renew(?:al)?|payment|transfer|สมาชิก|member)/i;

function asString(value) {
  return String(value || "").trim();
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeStringEqual(a, b) {
  const left = asString(a);
  const right = asString(b);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function createLineSignature(rawBody, channelSecret) {
  const secret = asString(channelSecret);
  if (!secret) return "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(rawBody || "")));
  return bytesToBase64(signature);
}

async function verifyLineSignature(rawBody, signature, channelSecret) {
  const expected = await createLineSignature(rawBody, channelSecret);
  return timingSafeStringEqual(expected, signature);
}

function sourceType(event = {}) {
  const type = asString(event?.source?.type).toLowerCase();
  return ["user", "group", "room"].includes(type) ? type : "unknown";
}

function messageType(event = {}) {
  if (event?.type !== "message") return "none";
  return asString(event?.message?.type).toLowerCase() || "unknown";
}

function messageText(event = {}) {
  return event?.type === "message" && messageType(event) === "text"
    ? asString(event?.message?.text)
    : "";
}

function hasPaymentContext(value = "") {
  return PAYMENT_CONTEXT_RE.test(asString(value));
}

function hasPaymentFollowupContext(value = "") {
  return PAYMENT_FOLLOWUP_RE.test(asString(value));
}

async function sha256Hex(value) {
  const input = value instanceof ArrayBuffer ? value : new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function configuredGroupHashes(env = {}) {
  return new Set(
    asString(env.LINE_PAYMENT_PROOF_GROUP_HASHES)
      .split(/[\s,]+/)
      .map((value) => value.toLowerCase())
      .filter((value) => /^[a-f0-9]{64}$/.test(value)),
  );
}

async function isPaymentProofGroup(env = {}, event = {}) {
  const groupId = asString(event?.source?.groupId);
  if (!groupId || sourceType(event) !== "group") return false;
  const hashes = configuredGroupHashes(env);
  if (!hashes.size) return false;
  return hashes.has(await sha256Hex(groupId));
}

function maxImageBytes(env = {}) {
  const configured = Number(env.LINE_SLIP_MAX_IMAGE_BYTES);
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_MAX_IMAGE_BYTES;
  return Math.min(Math.floor(configured), DEFAULT_MAX_IMAGE_BYTES);
}

function directCandidateTtlMs(env = {}) {
  const configuredMinutes = Number(env.LINE_DIRECT_PAYMENT_CANDIDATE_TTL_MINUTES);
  if (!Number.isFinite(configuredMinutes) || configuredMinutes < 1) return DEFAULT_DIRECT_CANDIDATE_TTL_MS;
  return Math.min(Math.floor(configuredMinutes * 60 * 1000), 2 * 60 * 60 * 1000);
}

function paymentContextLookbackHours(env = {}) {
  const configured = Number(env.LINE_DIRECT_PAYMENT_CONTEXT_LOOKBACK_HOURS);
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_PAYMENT_CONTEXT_LOOKBACK_HOURS;
  return Math.min(Math.floor(configured), 168);
}

async function downloadLineImage(env = {}, messageId = "") {
  const token = asString(env.LINE_CHANNEL_ACCESS_TOKEN);
  const id = asString(messageId);
  if (!token || !id) throw new Error("line_image_download_unconfigured");
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(id)}/content`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`line_image_download_${response.status}`);
  const mimeType = asString(response.headers.get("content-type")).split(";", 1)[0].toLowerCase();
  if (!IMAGE_TYPES.has(mimeType)) throw new Error("line_image_mime_unsupported");
  const limit = maxImageBytes(env);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("line_image_too_large");
  const body = await response.arrayBuffer();
  if (!body.byteLength) throw new Error("line_image_empty");
  if (body.byteLength > limit) throw new Error("line_image_too_large");
  return {
    body,
    mimeType,
    extension: IMAGE_TYPES.get(mimeType),
    byteSize: body.byteLength,
    sha256: await sha256Hex(body),
  };
}

function formulaValue(value) {
  return asString(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function paymentProofsTable(env = {}) {
  return asString(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || DEFAULT_PAYMENT_PROOFS_TABLE);
}

function consoleInboxTable(env = {}) {
  return asString(env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || env.AIRTABLE_SYNC_TABLE || DEFAULT_CONSOLE_INBOX_TABLE);
}

async function airtableRequest(env = {}, path = "", init = {}) {
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const token = asString(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!baseId || !token) throw new Error("airtable_config_missing");
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}

async function findExistingProof(env = {}, proofId = "") {
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{proof_id}='${formulaValue(proofId)}'`,
  });
  const payload = await airtableRequest(
    env,
    `${encodeURIComponent(paymentProofsTable(env))}?${params.toString()}`,
  );
  return Array.isArray(payload.records) ? payload.records[0] || null : null;
}

async function createPendingProof(env = {}, evidence = {}) {
  const existing = await findExistingProof(env, evidence.proofId);
  if (existing?.id) return { id: existing.id, deduped: true };

  const note = JSON.stringify({
    schema: "line_payment_evidence_v2",
    evidence_only: true,
    source_type: evidence.sourceType,
    source_context: evidence.sourceContext || null,
    source_group_hash: evidence.groupHash || null,
    source_user_hash: evidence.userHash || null,
    line_message_id_hash: evidence.messageIdHash,
    webhook_event_id_hash: evidence.webhookEventIdHash || null,
    r2_key: evidence.r2Key,
    evidence_sha256: evidence.sha256,
    mime_type: evidence.mimeType,
    byte_size: evidence.byteSize,
    payment_truth: "unverified",
    official_verification_required: true,
    may_mark_paid: false,
    may_award_points: false,
    may_extend_membership: false,
    may_confirm_session: false,
  });

  const fields = {
    proof_id: evidence.proofId,
    channel: "line_ofc",
    note,
    status: "pending",
  };
  const payload = await airtableRequest(env, encodeURIComponent(paymentProofsTable(env)), {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  return { id: asString(payload?.id), deduped: false };
}

function paymentOpsChatId(env = {}) {
  return asString(env.TELEGRAM_OPS_CHAT_ID || env.TELEGRAM_CHAT_ID);
}

function paymentOpsThreadId(env = {}) {
  const value = Number(env.TELEGRAM_PAYMENT_THREAD_ID || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 21;
}

async function notifyPaymentProofOps(env = {}, evidence = {}, result = {}) {
  if (result?.deduped === true) return { skipped: true, reason: "deduped" };
  if (!env.TELEGRAM_WORKER || typeof env.TELEGRAM_WORKER.fetch !== "function") {
    return { skipped: true, reason: "telegram_binding_missing" };
  }
  const token = asString(env.AUTH_SERVICE_LINE_TO_TELEGRAM || env.INTERNAL_TOKEN);
  const chatId = paymentOpsChatId(env);
  if (!token || !chatId) return { skipped: true, reason: "telegram_config_missing" };

  const sourceLabel = evidence.sourceType === "user" ? "LINE OA direct" : "LINE payment group";
  const text = [
    "💳 MMD Payment Proof",
    "Status: pending review",
    `Source: ${sourceLabel}`,
    `Proof: ${evidence.proofId}`,
    "Action: verify in Payment Slip Inbox before any membership/access change.",
  ].join("\n");

  const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker/telegram/internal/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      flow: "payment_proof",
      chat_id: chatId,
      message_thread_id: paymentOpsThreadId(env),
      text,
    }),
  }));
  if (!response.ok) throw new Error(`telegram_payment_alert_${response.status}`);
  return { sent: true };
}

async function persistCapturedImage(env = {}, event = {}, options = {}) {
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") {
    throw new Error("line_slip_r2_binding_missing");
  }
  const source = sourceType(event);
  const messageId = asString(options.messageId || event?.message?.id);
  if (!messageId) throw new Error("line_message_id_missing");
  const messageIdHash = await sha256Hex(messageId);
  const proofId = asString(options.proofId) || `line_${messageIdHash.slice(0, 24)}`;
  const existing = await findExistingProof(env, proofId);
  if (existing?.id) return { captured: true, deduped: true, proofId, recordId: existing.id };

  const image = await downloadLineImage(env, messageId);
  const now = new Date();
  const r2Key = `line-ofc/payment-proofs/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${proofId}/original.${image.extension}`;
  const groupId = asString(event?.source?.groupId);
  const userId = asString(event?.source?.userId);
  const webhookEventId = asString(options.webhookEventId || event?.webhookEventId);

  const object = await env.LINE_SLIP_EVIDENCE.head?.(r2Key);
  if (!object) {
    await env.LINE_SLIP_EVIDENCE.put(r2Key, image.body, {
      httpMetadata: { contentType: image.mimeType },
      customMetadata: {
        evidence_sha256: image.sha256,
        proof_id: proofId,
        source: source === "user" ? "line_direct_user" : "line_group",
      },
    });
  }

  const evidence = {
    proofId,
    sourceType: source,
    sourceContext: asString(options.sourceContext),
    groupHash: groupId ? await sha256Hex(groupId) : "",
    userHash: userId ? await sha256Hex(userId) : asString(options.userHash),
    messageIdHash,
    webhookEventIdHash: webhookEventId ? await sha256Hex(webhookEventId) : "",
    r2Key,
    sha256: image.sha256,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
  };
  const proof = await createPendingProof(env, evidence);
  try {
    await notifyPaymentProofOps(env, evidence, proof);
  } catch (error) {
    console.log(JSON.stringify({
      line_payment_alert: "failed",
      proof_id: proofId,
      error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100),
    }));
  }
  return { captured: true, deduped: proof.deduped, proofId, recordId: proof.id };
}

async function captureGroupImageEvidence(env = {}, event = {}) {
  if (event?.type !== "message" || messageType(event) !== "image") return { skipped: true, reason: "not_image" };
  if (!(await isPaymentProofGroup(env, event))) return { skipped: true, reason: "group_not_allowlisted" };
  return persistCapturedImage(env, event, { sourceContext: "allowlisted_payment_group" });
}

function directCandidateKey(userHash = "") {
  return `line-ofc/direct-user-candidates/${asString(userHash)}/latest.json`;
}

async function storeDirectUserImageCandidate(env = {}, event = {}) {
  if (sourceType(event) !== "user" || messageType(event) !== "image") return { skipped: true, reason: "not_direct_user_image" };
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") {
    throw new Error("line_slip_r2_binding_missing");
  }
  const userId = asString(event?.source?.userId);
  const messageId = asString(event?.message?.id);
  if (!userId || !messageId) throw new Error("line_direct_candidate_identity_missing");
  const userHash = await sha256Hex(userId);
  const messageIdHash = await sha256Hex(messageId);
  const proofId = `line_${messageIdHash.slice(0, 24)}`;
  const timestamp = Number(event?.timestamp);
  const createdAtMs = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
  const candidate = {
    schema: "line_direct_payment_candidate_v1",
    message_id: messageId,
    message_id_hash: messageIdHash,
    proof_id: proofId,
    webhook_event_id: asString(event?.webhookEventId),
    user_hash: userHash,
    created_at_ms: createdAtMs,
  };
  const key = directCandidateKey(userHash);
  await env.LINE_SLIP_EVIDENCE.put(key, JSON.stringify(candidate), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      schema: candidate.schema,
      proof_id: proofId,
      source: "line_direct_user_candidate",
    },
  });
  return { candidate: true, proofId, userHash, key };
}

async function loadDirectUserImageCandidate(env = {}, userId = "") {
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.get !== "function") return null;
  const id = asString(userId);
  if (!id) return null;
  const userHash = await sha256Hex(id);
  const key = directCandidateKey(userHash);
  const object = await env.LINE_SLIP_EVIDENCE.get(key);
  if (!object) return null;
  let candidate;
  try {
    candidate = JSON.parse(await object.text());
  } catch (_) {
    return null;
  }
  const createdAtMs = Number(candidate?.created_at_ms);
  if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > directCandidateTtlMs(env)) {
    if (typeof env.LINE_SLIP_EVIDENCE.delete === "function") await env.LINE_SLIP_EVIDENCE.delete(key);
    return null;
  }
  return { ...candidate, key, userHash };
}

function recordContextText(record = {}) {
  const fields = record?.fields || {};
  return [
    fields.admin_note,
    fields.intent,
    fields.member_name,
    fields.payload_json,
  ].map(asString).filter(Boolean).join("\n");
}

async function hasRecentDirectPaymentContext(env = {}, event = {}) {
  const userId = asString(event?.source?.userId);
  if (!userId || sourceType(event) !== "user") return false;
  const hours = paymentContextLookbackHours(env);
  const params = new URLSearchParams();
  params.set("maxRecords", "12");
  params.set("filterByFormula", `AND({line_user_id}='${formulaValue(userId)}',IS_AFTER({created_at},DATEADD(NOW(),-${hours},'hours')))`);
  params.set("sort[0][field]", "created_at");
  params.set("sort[0][direction]", "desc");
  const payload = await airtableRequest(
    env,
    `${encodeURIComponent(consoleInboxTable(env))}?${params.toString()}`,
  );
  const records = Array.isArray(payload.records) ? payload.records : [];
  return records.some((record) => hasPaymentContext(recordContextText(record)));
}

async function captureDirectUserImageEvidence(env = {}, event = {}, options = {}) {
  if (event?.type !== "message" || messageType(event) !== "image" || sourceType(event) !== "user") {
    return { skipped: true, reason: "not_direct_user_image" };
  }
  let recentContext = options.recentPaymentContext;
  if (typeof recentContext !== "boolean") {
    try {
      recentContext = await hasRecentDirectPaymentContext(env, event);
    } catch (_) {
      recentContext = false;
    }
  }
  if (recentContext) {
    return persistCapturedImage(env, event, { sourceContext: "recent_direct_payment_context" });
  }
  const candidate = await storeDirectUserImageCandidate(env, event);
  return { captured: false, candidate: true, proofId: candidate.proofId, reason: "awaiting_payment_followup" };
}

async function promoteDirectUserCandidate(env = {}, event = {}) {
  if (sourceType(event) !== "user" || messageType(event) !== "text") return { skipped: true, reason: "not_direct_user_text" };
  const text = messageText(event);
  if (!hasPaymentFollowupContext(text)) return { skipped: true, reason: "followup_not_payment_related" };
  const userId = asString(event?.source?.userId);
  const candidate = await loadDirectUserImageCandidate(env, userId);
  if (!candidate) return { skipped: true, reason: "candidate_missing_or_stale" };

  const syntheticEvent = {
    type: "message",
    source: { type: "user", userId },
    message: { type: "image", id: candidate.message_id },
    webhookEventId: candidate.webhook_event_id || "",
  };
  const result = await persistCapturedImage(env, syntheticEvent, {
    messageId: candidate.message_id,
    proofId: candidate.proof_id,
    webhookEventId: candidate.webhook_event_id,
    userHash: candidate.user_hash,
    sourceContext: "direct_user_payment_followup",
  });
  if (result?.captured && typeof env.LINE_SLIP_EVIDENCE?.delete === "function") {
    await env.LINE_SLIP_EVIDENCE.delete(candidate.key);
  }
  return result;
}

async function observeSignedLineEvents(request, env = {}) {
  const rawBody = await request.text();
  const signature = asString(request.headers.get("x-line-signature"));
  const valid = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
  if (!valid) {
    console.log(JSON.stringify({ line_payment_ingress: "signature_rejected" }));
    return;
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    console.log(JSON.stringify({ line_payment_ingress: "invalid_json" }));
    return;
  }

  const events = Array.isArray(body.events) ? body.events : [];
  for (const event of events) {
    const source = sourceType(event);
    if (!['user', 'group'].includes(source)) continue;
    const type = messageType(event);

    console.log(JSON.stringify({
      line_payment_ingress: "observed",
      source_type: source,
      event_type: asString(event?.type).toLowerCase() || "unknown",
      message_type: type,
      stable_event_present: Boolean(asString(event?.message?.id || event?.webhookEventId)),
      redelivered: event?.deliveryContext?.isRedelivery === true,
      persistence_owner: "core_line_handler",
    }));

    try {
      if (source === "group" && type === "image") {
        const result = await captureGroupImageEvidence(env, event);
        console.log(JSON.stringify({
          line_group_image_capture: result?.captured ? "captured" : "skipped",
          deduped: result?.deduped === true,
          reason: asString(result?.reason) || null,
        }));
      } else if (source === "user" && type === "image") {
        const result = await captureDirectUserImageEvidence(env, event);
        console.log(JSON.stringify({
          line_direct_image_capture: result?.captured ? "captured" : result?.candidate ? "candidate" : "skipped",
          deduped: result?.deduped === true,
          reason: asString(result?.reason) || null,
        }));
      } else if (source === "user" && type === "text") {
        const result = await promoteDirectUserCandidate(env, event);
        if (result?.captured) {
          console.log(JSON.stringify({
            line_direct_image_promotion: "captured",
            deduped: result?.deduped === true,
          }));
        }
      }
    } catch (error) {
      console.log(JSON.stringify({
        line_payment_ingress: "capture_failed",
        source_type: source,
        message_type: type,
        error: asString(error?.message || error).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100),
      }));
    }
  }
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    const isLineWebhook = request.method === "POST" && LINE_WEBHOOK_PATHS.has(url.pathname);
    const observerRequest = isLineWebhook ? request.clone() : null;

    const response = await currentWorker.fetch(request, env, ctx);

    if (observerRequest && response.ok) {
      const work = observeSignedLineEvents(observerRequest, env).catch(() => {
        console.log(JSON.stringify({ line_payment_ingress: "observer_failed" }));
      });
      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
      else await work;
    }

    return response;
  },
};

export const LINE_GROUP_INGRESS_INTERNALS = Object.freeze({
  captureDirectUserImageEvidence,
  captureGroupImageEvidence,
  directCandidateKey,
  downloadLineImage,
  hasPaymentContext,
  hasPaymentFollowupContext,
  hasRecentDirectPaymentContext,
  isPaymentProofGroup,
  loadDirectUserImageCandidate,
  messageText,
  messageType,
  notifyPaymentProofOps,
  promoteDirectUserCandidate,
  sourceType,
  storeDirectUserImageCandidate,
});
