import { LINE_GROUP_INGRESS_INTERNALS } from "./line-group-ingress-front-gate.js";
import { MMS_LINE_RUNTIME_INTERNALS } from "./mms-line-runtime.mjs";

const MMS_WEBHOOK_PATHS = new Set(["/webhooks/line/mms", "/webhooks/line/mms/"]);
const DEFAULT_MODEL_HISTORY_IMPORTS_TABLE = "tbljrlOK5m4iBXgST";
const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
const LINE_DATA_API = "https://api-data.line.me/v2/bot";

function text(value, max = 8000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function pathOf(request) {
  return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
}

function isMmsWebhookPost(request) {
  return String(request?.method || "GET").toUpperCase() === "POST" && MMS_WEBHOOK_PATHS.has(pathOf(request));
}

async function sha256Hex(value) {
  const input = value instanceof ArrayBuffer ? value : new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function configuredMmsGroupHashes(env = {}) {
  const configured = text(env.MMS_LINE_PAYMENT_PROOF_GROUP_HASHES, 4096)
    .split(/[\s,]+/)
    .map((value) => value.toLowerCase())
    .filter((value) => /^[a-f0-9]{64}$/.test(value));
  if (configured.length) return Array.from(new Set(configured)).join(",");

  // The exact LINE group ID may be stored as a secret instead of committing its
  // hash. It is converted to the same hash contract used by the MMD intake core.
  const exactGroupId = text(env.MMS_LINE_GROUP_ID, 512);
  if (!exactGroupId) return "";
  return sha256Hex(exactGroupId);
}

async function buildMmsEvidenceEnv(env = {}) {
  const groupHashes = await configuredMmsGroupHashes(env);
  return new Proxy(env || {}, {
    get(target, property) {
      if (property === "LINE_CHANNEL_ACCESS_TOKEN") return text(target.MMS_LINE_CHANNEL_ACCESS_TOKEN, 4096);
      if (property === "LINE_PAYMENT_PROOF_GROUP_HASHES") return groupHashes;
      return Reflect.get(target, property, target);
    },
    has(target, property) {
      if (property === "LINE_CHANNEL_ACCESS_TOKEN" || property === "LINE_PAYMENT_PROOF_GROUP_HASHES") return true;
      return Reflect.has(target, property);
    },
  });
}

function messageType(event = {}) {
  if (event?.type !== "message") return "none";
  return text(event?.message?.type, 40).toLowerCase() || "unknown";
}

function sourceType(event = {}) {
  return text(event?.source?.type, 40).toLowerCase();
}

function safeExtension(fileName = "") {
  const match = text(fileName, 512).toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return match?.[1] || "bin";
}

function maxFileBytes(env = {}) {
  const configured = Number(env.MMS_LINE_EVIDENCE_MAX_FILE_BYTES);
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_MAX_FILE_BYTES;
  return Math.min(Math.floor(configured), 50 * 1024 * 1024);
}

async function downloadLineFile(env = {}, event = {}) {
  const token = text(env.MMS_LINE_CHANNEL_ACCESS_TOKEN, 4096);
  const messageId = text(event?.message?.id, 512);
  if (!token || !messageId) throw new Error("mms_line_file_download_unconfigured");

  const response = await fetch(`${LINE_DATA_API}/message/${encodeURIComponent(messageId)}/content`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`mms_line_file_download_${response.status}`);

  const limit = maxFileBytes(env);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("mms_line_file_too_large");
  const body = await response.arrayBuffer();
  if (!body.byteLength) throw new Error("mms_line_file_empty");
  if (body.byteLength > limit) throw new Error("mms_line_file_too_large");

  return {
    body,
    mimeType: text(response.headers.get("content-type"), 200).split(";", 1)[0].toLowerCase() || "application/octet-stream",
    byteSize: body.byteLength,
    sha256: await sha256Hex(body),
    extension: safeExtension(event?.message?.fileName),
  };
}

function formulaValue(value) {
  return text(value, 4000).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function airtableRequest(env = {}, path = "", init = {}) {
  const baseId = text(env.AIRTABLE_BASE_ID, 128);
  const token = text(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 4096);
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

function modelHistoryTable(env = {}) {
  return text(env.AIRTABLE_TABLE_MODEL_HISTORY_IMPORTS_ID || DEFAULT_MODEL_HISTORY_IMPORTS_TABLE, 128);
}

async function findExistingDocument(env = {}, importId = "") {
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{import_id}='${formulaValue(importId)}'`,
  });
  const payload = await airtableRequest(env, `${encodeURIComponent(modelHistoryTable(env))}?${params.toString()}`);
  return Array.isArray(payload?.records) ? payload.records[0] || null : null;
}

function eventTimeIso(event = {}) {
  const timestamp = Number(event?.timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return new Date().toISOString();
  return new Date(timestamp).toISOString();
}

async function captureMmsFileEvidence(env = {}, event = {}, mmdEnv = env) {
  if (sourceType(event) !== "group" || messageType(event) !== "file") return { skipped: true, reason: "not_group_file" };
  if (!(await LINE_GROUP_INGRESS_INTERNALS.isPaymentProofGroup(mmdEnv, event))) {
    return { skipped: true, reason: "group_not_allowlisted" };
  }
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") {
    throw new Error("line_slip_r2_binding_missing");
  }

  const messageId = text(event?.message?.id, 512);
  if (!messageId) throw new Error("mms_line_message_id_missing");
  const messageHash = await sha256Hex(messageId);
  const importId = `mms_line_doc_${messageHash.slice(0, 24)}`;
  const existing = await findExistingDocument(env, importId);
  if (existing?.id) return { captured: true, deduped: true, importId };

  const file = await downloadLineFile(env, event);
  const date = new Date(eventTimeIso(event));
  const r2Key = `line-mms/operational-evidence/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${importId}/original.${file.extension}`;
  const existingObject = await env.LINE_SLIP_EVIDENCE.head?.(r2Key);
  if (!existingObject) {
    await env.LINE_SLIP_EVIDENCE.put(r2Key, file.body, {
      httpMetadata: { contentType: file.mimeType },
      customMetadata: {
        evidence_sha256: file.sha256,
        import_id: importId,
        tenant: "mms",
        source: "line_group",
      },
    });
  }

  const groupId = text(event?.source?.groupId, 512);
  const userId = text(event?.source?.userId, 512);
  const webhookEventId = text(event?.webhookEventId, 512);
  const note = JSON.stringify({
    schema: "mms_line_group_document_evidence_v1",
    evidence_only: true,
    tenant: "mms",
    source_group_name: text(env.MMS_LINE_SOURCE_GROUP_NAME, 200) || "Male Massage",
    source_group_hash: groupId ? await sha256Hex(groupId) : null,
    source_user_hash: userId ? await sha256Hex(userId) : null,
    line_message_id_hash: messageHash,
    webhook_event_id_hash: webhookEventId ? await sha256Hex(webhookEventId) : null,
    original_file_name: text(event?.message?.fileName, 512) || null,
    r2_key: r2Key,
    evidence_sha256: file.sha256,
    mime_type: file.mimeType,
    byte_size: file.byteSize,
    truth_mutation_allowed: false,
  });

  const fields = {
    import_id: importId,
    source_name: "mms_line_group",
    source_group_name: text(env.MMS_LINE_SOURCE_GROUP_NAME, 200) || "Male Massage",
    raw_text: text(event?.message?.fileName, 2000) || "LINE file evidence",
    original_message_time: eventTimeIso(event),
    admin_note: note,
  };
  const created = await airtableRequest(env, encodeURIComponent(modelHistoryTable(env)), {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!created?.id) throw new Error("mms_document_evidence_create_failed");
  return { captured: true, deduped: false, importId };
}

export async function observeMmsLineEvidence(request, env = {}) {
  if (!isMmsWebhookPost(request)) return { ok: true, skipped: true, reason: "not_mms_webhook_post" };

  const rawBody = await request.text();
  const signature = text(request.headers.get("x-line-signature"), 256);
  const secret = text(env.MMS_LINE_CHANNEL_SECRET, 512);
  if (!secret || !(await MMS_LINE_RUNTIME_INTERNALS.verifyLineSignature(rawBody, signature, secret))) {
    return { ok: false, skipped: true, reason: "signature_rejected" };
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    return { ok: false, skipped: true, reason: "invalid_json" };
  }

  const mmdEnv = await buildMmsEvidenceEnv(env);
  if (!text(mmdEnv.LINE_PAYMENT_PROOF_GROUP_HASHES, 4096)) {
    return { ok: true, skipped: true, reason: "mms_group_allowlist_unconfigured" };
  }

  const summary = { ok: true, images_captured: 0, files_captured: 0, deduped: 0, skipped: 0, failed: 0 };
  for (const event of Array.isArray(body?.events) ? body.events : []) {
    if (sourceType(event) !== "group") continue;
    try {
      if (messageType(event) === "image") {
        const result = await LINE_GROUP_INGRESS_INTERNALS.captureGroupImageEvidence(mmdEnv, event);
        if (result?.captured) summary.images_captured += 1;
        if (result?.deduped) summary.deduped += 1;
        if (result?.skipped) summary.skipped += 1;
      } else if (messageType(event) === "file") {
        const result = await captureMmsFileEvidence(env, event, mmdEnv);
        if (result?.captured) summary.files_captured += 1;
        if (result?.deduped) summary.deduped += 1;
        if (result?.skipped) summary.skipped += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.log(JSON.stringify({
        mms_line_evidence: "capture_failed",
        message_type: messageType(event),
        error: text(error?.message || error, 120).replace(/[^A-Za-z0-9_.:-]/g, "_"),
      }));
    }
  }
  return summary;
}

export const MMS_LINE_EVIDENCE_INTERNALS = Object.freeze({
  buildMmsEvidenceEnv,
  captureMmsFileEvidence,
  configuredMmsGroupHashes,
  isMmsWebhookPost,
  messageType,
  sourceType,
});
