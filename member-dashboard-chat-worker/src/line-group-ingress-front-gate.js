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
    schema: "line_group_payment_evidence_v1",
    evidence_only: true,
    source_type: "group",
    source_group_hash: evidence.groupHash,
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

async function captureGroupImageEvidence(env = {}, event = {}) {
  if (event?.type !== "message" || messageType(event) !== "image") return { skipped: true, reason: "not_image" };
  if (!(await isPaymentProofGroup(env, event))) return { skipped: true, reason: "group_not_allowlisted" };
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") {
    throw new Error("line_slip_r2_binding_missing");
  }

  const messageId = asString(event?.message?.id);
  if (!messageId) throw new Error("line_message_id_missing");
  const messageIdHash = await sha256Hex(messageId);
  const proofId = `line_${messageIdHash.slice(0, 24)}`;
  const existing = await findExistingProof(env, proofId);
  if (existing?.id) return { captured: true, deduped: true };

  const image = await downloadLineImage(env, messageId);
  const now = new Date();
  const r2Key = `line-ofc/payment-proofs/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${proofId}/original.${image.extension}`;
  const groupHash = await sha256Hex(asString(event?.source?.groupId));
  const userId = asString(event?.source?.userId);
  const webhookEventId = asString(event?.webhookEventId);

  const object = await env.LINE_SLIP_EVIDENCE.head?.(r2Key);
  if (!object) {
    await env.LINE_SLIP_EVIDENCE.put(r2Key, image.body, {
      httpMetadata: { contentType: image.mimeType },
      customMetadata: {
        evidence_sha256: image.sha256,
        proof_id: proofId,
        source: "line_group",
      },
    });
  }

  await createPendingProof(env, {
    proofId,
    groupHash,
    userHash: userId ? await sha256Hex(userId) : "",
    messageIdHash,
    webhookEventIdHash: webhookEventId ? await sha256Hex(webhookEventId) : "",
    r2Key,
    sha256: image.sha256,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
  });

  return { captured: true, deduped: false };
}

async function observeSignedGroupEvents(request, env = {}) {
  const rawBody = await request.text();
  const signature = asString(request.headers.get("x-line-signature"));
  const valid = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
  if (!valid) {
    console.log(JSON.stringify({ line_group_ingress: "signature_rejected" }));
    return;
  }

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    console.log(JSON.stringify({ line_group_ingress: "invalid_json" }));
    return;
  }

  const events = Array.isArray(body.events) ? body.events : [];
  for (const event of events) {
    if (sourceType(event) !== "group") continue;
    const type = messageType(event);

    console.log(JSON.stringify({
      line_group_ingress: "observed",
      event_type: asString(event?.type).toLowerCase() || "unknown",
      message_type: type,
      group_source_present: Boolean(asString(event?.source?.groupId)),
      user_source_present: Boolean(asString(event?.source?.userId)),
      stable_event_present: Boolean(asString(event?.message?.id || event?.webhookEventId)),
      redelivered: event?.deliveryContext?.isRedelivery === true,
      persistence_owner: "core_line_handler",
    }));

    if (type !== "image") continue;
    try {
      const result = await captureGroupImageEvidence(env, event);
      console.log(JSON.stringify({
        line_group_image_capture: result?.captured ? "captured" : "skipped",
        deduped: result?.deduped === true,
        reason: asString(result?.reason) || null,
      }));
    } catch (error) {
      console.log(JSON.stringify({
        line_group_image_capture: "failed",
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
      const work = observeSignedGroupEvents(observerRequest, env).catch(() => {
        console.log(JSON.stringify({ line_group_ingress: "observer_failed" }));
      });
      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
      else await work;
    }

    return response;
  },
};

export const LINE_GROUP_INGRESS_INTERNALS = Object.freeze({
  captureGroupImageEvidence,
  downloadLineImage,
  isPaymentProofGroup,
  messageType,
  sourceType,
});
