const WORKER_NAME = "mmd-line-slip-intake-staging";
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const MIME_TO_EXT = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const clean = (value) => String(value ?? "").trim();
const safeRunId = (value) => {
  const candidate = clean(value);
  return /^[A-Za-z0-9._-]{1,64}$/.test(candidate) ? candidate : crypto.randomUUID();
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
    },
  });
}

function maxBytes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_BYTES;
  return Math.min(Math.floor(parsed), DEFAULT_MAX_BYTES);
}

async function digestHex(value) {
  const bytes = value instanceof ArrayBuffer
    ? value
    : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function safeBearerMatch(header, expected) {
  const supplied = clean(header).replace(/^Bearer\s+/i, "");
  const wanted = clean(expected);
  if (!supplied || !wanted) return false;
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(wanted)),
  ]);
  const left = new Uint8Array(leftDigest);
  const right = new Uint8Array(rightDigest);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return diff === 0;
}

function formulaValue(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function airtableRequest(env, path, init = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!baseId || !token) throw new Error("airtable_config_missing");
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}

async function findStagingProof(env, proofId) {
  const table = clean(env.AIRTABLE_PAYMENT_PROOFS_STAGING_TABLE_ID || "tbl9Y6IMM4EWYjIBJ");
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{proof_id}='${formulaValue(proofId)}'`,
  });
  const payload = await airtableRequest(env, `${encodeURIComponent(table)}?${params.toString()}`);
  return Array.isArray(payload.records) ? payload.records[0] || null : null;
}

async function createStagingProof(env, job, extraction, messageId) {
  const table = clean(env.AIRTABLE_PAYMENT_PROOFS_STAGING_TABLE_ID || "tbl9Y6IMM4EWYjIBJ");
  const redacted = {
    extraction_method: extraction.extraction_method,
    extraction_available: extraction.extraction_available,
    extraction_error: extraction.extraction_error || "",
    has_payment_ref: Boolean(extraction.payment_ref),
    has_amount: extraction.amount_thb != null,
    confidence_bucket:
      extraction.confidence_score >= 0.85 ? "high" : extraction.confidence_score >= 0.5 ? "medium" : "low",
    alert_status: "queued_for_redacted_ops_notice",
  };
  const fields = {
    proof_id: job.proof_id,
    status: "pending",
    r2_key: job.r2_key,
    evidence_sha256: job.evidence_sha256,
    mime_type: job.mime_type,
    byte_size: job.byte_size,
    source: "synthetic_isolated",
    queue_message_id: clean(messageId),
    run_id: clean(job.run_id),
    note: JSON.stringify(redacted),
    created_at: clean(job.queued_at) || new Date().toISOString(),
  };
  const payload = await airtableRequest(env, encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!payload?.id) throw new Error("staging_proof_create_failed");
  return payload;
}

function normalizedExtraction(payload, method) {
  const result = payload?.result && typeof payload.result === "object" ? payload.result : {};
  const amount = Number(result.amount_thb);
  const confidence = Number(result.confidence_score);
  return {
    payment_ref: clean(result.payment_ref),
    amount_thb: Number.isFinite(amount) && amount > 0 ? amount : null,
    paid_at: clean(result.paid_at),
    payer_name: clean(result.payer_name),
    sender_bank: clean(result.sender_bank),
    receiver_bank: clean(result.receiver_bank),
    provider: clean(result.provider),
    confidence_score: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    extraction_method: method,
    extraction_available: true,
    extraction_error: "",
  };
}

async function callExtractor(env, route, object, job) {
  if (!env.SLIP_EXTRACTOR || typeof env.SLIP_EXTRACTOR.fetch !== "function") {
    return { ok: false, unavailable: true, error: "extractor_binding_missing" };
  }
  const token = clean(env.MMD_SLIP_EXTRACTOR_TOKEN);
  if (!token) return { ok: false, unavailable: true, error: "extractor_token_missing" };
  const body = await object.arrayBuffer();
  const response = await env.SLIP_EXTRACTOR.fetch(new Request(`https://mmd-slip-extractor-staging${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": job.mime_type,
      "content-length": String(job.byte_size),
      "x-request-id": clean(job.run_id) || job.proof_id,
    },
    body,
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, unavailable: false, error: `extractor_${response.status}` };
  return { ok: true, result: payload };
}

async function extractEvidence(env, object, job) {
  const qr = await callExtractor(env, "/v1/extract/qr", object, job);
  if (qr.ok) {
    const normalized = normalizedExtraction(qr.result, "qr");
    if (normalized.payment_ref) return normalized;
  }

  const ocr = await callExtractor(env, "/v1/extract/ocr", object, job);
  if (ocr.ok) return normalizedExtraction(ocr.result, "ocr");

  return {
    payment_ref: "",
    amount_thb: null,
    paid_at: "",
    payer_name: "",
    sender_bank: "",
    receiver_bank: "",
    provider: "",
    confidence_score: 0,
    extraction_method: qr.ok ? "qr" : "none",
    extraction_available: Boolean(qr.ok || ocr.ok),
    extraction_error: [qr.error, ocr.error].filter(Boolean).join(","),
  };
}

function maskedRef(value) {
  const ref = clean(value);
  if (!ref) return "";
  return ref.length <= 8 ? "masked" : `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

async function notifyOps(env, job, extraction) {
  if (!env.TELEGRAM_WORKER || typeof env.TELEGRAM_WORKER.fetch !== "function") {
    return { ok: false, skipped: true, reason: "telegram_binding_missing" };
  }
  const token = clean(env.AUTH_SERVICE_LINE_TO_TELEGRAM);
  const chatId = clean(env.TELEGRAM_OPS_CHAT_ID || env.TELEGRAM_CHAT_ID);
  if (!token || !chatId) return { ok: false, skipped: true, reason: "telegram_config_missing" };
  const threadId = Number(env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || 21) || 21;
  const lines = [
    "🧪 LINE SLIP STAGING INTAKE",
    `Proof: ${job.proof_id}`,
    extraction.amount_thb != null ? `Amount: ${extraction.amount_thb} THB` : "",
    extraction.payment_ref ? `Ref: ${maskedRef(extraction.payment_ref)}` : "",
    "Status: pending",
  ].filter(Boolean);
  const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker/telegram/internal/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      flow: "payment_proof",
      chat_id: chatId,
      message_thread_id: threadId,
      text: lines.join("\n"),
    }),
  }));
  return { ok: response.ok, status: response.status, message_thread_id: threadId };
}

function validJob(job) {
  return Boolean(
    job &&
      job.version === 1 &&
      job.source === "synthetic_isolated" &&
      /^syn_[a-f0-9]{24}$/.test(clean(job.proof_id)) &&
      clean(job.r2_key) &&
      /^[a-f0-9]{64}$/.test(clean(job.evidence_sha256)) &&
      MIME_TO_EXT.has(clean(job.mime_type).toLowerCase()) &&
      Number.isInteger(Number(job.byte_size)) &&
      Number(job.byte_size) > 0 &&
      Number(job.byte_size) <= DEFAULT_MAX_BYTES,
  );
}

export async function processQueueMessage(message, env) {
  const job = message?.body;
  if (!validJob(job)) return { action: "ack", state: "invalid_job" };

  const existing = await findStagingProof(env, job.proof_id);
  if (existing?.id) return { action: "ack", state: "deduped", proof_id: job.proof_id };

  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.get !== "function") {
    throw new Error("r2_binding_missing");
  }
  const object = await env.LINE_SLIP_EVIDENCE.get(job.r2_key);
  if (!object) throw new Error("r2_object_missing");
  if (Number(object.size) !== Number(job.byte_size)) throw new Error("r2_size_mismatch");
  const observedSha = await digestHex(await object.arrayBuffer());
  if (observedSha !== job.evidence_sha256) throw new Error("r2_sha256_mismatch");

  const objectForExtraction = await env.LINE_SLIP_EVIDENCE.get(job.r2_key);
  if (!objectForExtraction) throw new Error("r2_object_missing_for_extraction");
  const extraction = await extractEvidence(env, objectForExtraction, job);
  await createStagingProof(env, job, extraction, message?.id);
  const telegram = await notifyOps(env, job, extraction).catch(() => ({ ok: false }));
  return { action: "ack", state: "pending", proof_id: job.proof_id, telegram };
}

export async function handleQueue(batch, env) {
  if (clean(env.MMD_RUNTIME_SCOPE) !== "staging") {
    for (const message of batch.messages || []) message.ack?.();
    return;
  }

  for (const message of batch.messages || []) {
    try {
      const result = await processQueueMessage(message, env);
      if (result.action === "ack") message.ack?.();
      else message.retry?.();
    } catch {
      message.retry?.();
    }
  }
}

export async function handleStagingIntake(request, env) {
  if (clean(env.MMD_RUNTIME_SCOPE) !== "staging") return json({ ok: false, error: "staging_scope_required" }, 503);
  if (!env.LINE_SLIP_QUEUE || typeof env.LINE_SLIP_QUEUE.send !== "function") return json({ ok: false, error: "queue_unavailable" }, 503);
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.put !== "function") return json({ ok: false, error: "r2_unavailable" }, 503);

  const authorized = await safeBearerMatch(request.headers.get("authorization"), env.MMD_SLIP_INTAKE_STAGING_TOKEN);
  if (!authorized) return json({ ok: false, error: "unauthorized" }, 401);

  const mimeType = clean(request.headers.get("content-type")).split(";", 1)[0].toLowerCase();
  if (!MIME_TO_EXT.has(mimeType)) return json({ ok: false, error: "unsupported_mime" }, 415);
  const limit = maxBytes(env.LINE_SLIP_MAX_BYTES);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return json({ ok: false, error: "image_too_large" }, 413);

  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ ok: false, error: "image_empty" }, 400);
  if (body.byteLength > limit) return json({ ok: false, error: "image_too_large" }, 413);

  const sha = await digestHex(body);
  const proofId = `syn_${sha.slice(0, 24)}`;
  const now = new Date();
  const runId = safeRunId(request.headers.get("x-mmd-run-id"));
  const extension = MIME_TO_EXT.get(mimeType);
  const r2Key = `line-ofc/payment-proofs/staging/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${proofId}/original.${extension}`;

  const existing = await env.LINE_SLIP_EVIDENCE.head?.(r2Key);
  if (!existing) {
    await env.LINE_SLIP_EVIDENCE.put(r2Key, body, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { evidence_sha256: sha, source: "synthetic_isolated" },
    });
  }

  const job = {
    version: 1,
    source: "synthetic_isolated",
    proof_id: proofId,
    r2_key: r2Key,
    evidence_sha256: sha,
    mime_type: mimeType,
    byte_size: body.byteLength,
    run_id: runId,
    queued_at: now.toISOString(),
  };
  await env.LINE_SLIP_QUEUE.send(job);
  return json({ ok: true, accepted: true, state: "queued", proof_id: proofId, run_id: runId }, 202);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, worker: WORKER_NAME, runtime_scope: clean(env.MMD_RUNTIME_SCOPE) || "unknown" });
    }
    if (url.pathname === "/v1/staging/intake" && request.method === "POST") return handleStagingIntake(request, env);
    return json({ ok: false, error: "not_found" }, 404);
  },
  async queue(batch, env) {
    return handleQueue(batch, env);
  },
};

export { safeBearerMatch, validJob };
