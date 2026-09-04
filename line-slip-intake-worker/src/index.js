const WORKER_NAME = "mmd-line-slip-intake-staging";
const QUEUE_SCHEMA = "line_slip_intake_queue_v1";
const PROOF_SCHEMA = "line_ofc_payment_proof_queue_v1";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_AMOUNT_THB = 10_000_000;
const PAYMENT_CONTEXT_RE = /(สลิป|หลักฐาน.{0,12}(ชำระ|โอน|จ่าย)|โอน(?:เงิน)?(?:แล้ว|เรียบร้อย)?|จ่าย(?:เงิน)?(?:แล้ว|เรียบร้อย)?|ชำระ(?:เงิน)?(?:แล้ว|เรียบร้อย)?|ยอด.{0,18}(?:บาท|thb)|(?:บาท|thb).{0,18}ยอด|payment\s*(slip|proof)|transfer\s*(slip|proof|done|complete|completed)|bank\s*transfer|prompt\s*pay|promptpay|พร้อมเพย์|\bpaid\b)/i;
const NON_PAYMENT_IMAGE_RE = /(ส่ง|ขอ|ดู|มี).{0,10}(รูป|รูปภาพ|profile|โปรไฟล์|หน้าสด)|(?:รูป|รูปภาพ|profile|โปรไฟล์|หน้าสด).{0,10}(model|นายแบบ|ems\d+|gws\d+)/i;
const IMAGE_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

const clean = (value) => String(value ?? "").trim();
const enabled = (value) => ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
const numberOrNull = (value) => {
  if (value == null || clean(value) === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const formulaValue = (value) => clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-mmd-worker": WORKER_NAME },
  });
}

async function sha256Hex(value) {
  const bytes = value instanceof ArrayBuffer
    ? value
    : ArrayBuffer.isView(value)
      ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
      : new TextEncoder().encode(String(value ?? "")).buffer;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedAmount(value, max = MAX_AMOUNT_THB) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(clean(value))) return null;
  const n = numberOrNull(value);
  const limit = numberOrNull(max) || MAX_AMOUNT_THB;
  if (n == null || n <= 0 || n > limit) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function threshold(env) {
  const n = numberOrNull(env.LINE_SLIP_CONFIDENCE_THRESHOLD);
  return n == null ? 0.85 : Math.max(0.5, Math.min(1, n));
}

function normalizeQueueBody(body) {
  if (!body || typeof body !== "object") throw new Error("queue_body_invalid");
  if (clean(body.schema) !== QUEUE_SCHEMA) throw new Error("queue_schema_invalid");
  const messageId = clean(body.message_id || body.line_event_id);
  const lineEventId = clean(body.line_event_id || body.message_id);
  if (!messageId || !lineEventId) throw new Error("queue_message_id_missing");
  return { messageId, lineEventId, webhookEventId: clean(body.webhook_event_id) };
}

async function airtable({ env, table, query = {}, init = {}, fetchImpl = fetch }) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!baseId || !token) throw new Error("airtable_config_missing");
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetchImpl(url.toString(), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}

async function records({ env, table, formula, maxRecords = 2, fetchImpl = fetch }) {
  const payload = await airtable({ env, table, query: { maxRecords, filterByFormula: formula }, fetchImpl });
  return Array.isArray(payload.records) ? payload.records : [];
}

async function loadInboxEvent({ env, lineEventId, fetchImpl }) {
  const found = await records({
    env,
    table: env.AIRTABLE_SYNC_TABLE || "MMD — Console Inbox",
    formula: `{line_id}='${formulaValue(lineEventId)}'`,
    maxRecords: 2,
    fetchImpl,
  });
  if (found.length !== 1) throw new Error(found.length > 1 ? "console_inbox_event_ambiguous" : "console_inbox_event_missing");
  const record = found[0];
  let payload = {};
  try { payload = JSON.parse(record?.fields?.payload_json || "{}"); } catch {}
  const lineUserId = clean(record?.fields?.line_user_id || payload.source_user_id);
  if (!lineUserId) throw new Error("console_inbox_line_user_missing");
  return { lineUserId };
}

async function recentContext({ env, lineUserId, now, fetchImpl }) {
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const cutoffMs = Date.parse(cutoff);
  const found = await records({
    env,
    table: env.AIRTABLE_SYNC_TABLE || "MMD — Console Inbox",
    formula: `AND({line_user_id}='${formulaValue(lineUserId)}',IS_AFTER(CREATED_TIME(),DATETIME_PARSE('${cutoff}')))`,
    maxRecords: 20,
    fetchImpl,
  });
  return found
    .map((record) => {
      let payload = {};
      try { payload = JSON.parse(record?.fields?.payload_json || "{}"); } catch {}
      const at = Date.parse(clean(payload.received_at || record?.createdTime));
      return { at, values: [clean(payload.raw_text), clean(record?.fields?.admin_note)].filter(Boolean) };
    })
    .filter((item) => Number.isFinite(item.at) && item.at >= cutoffMs && item.at <= now.getTime() + 60_000)
    .sort((a, b) => b.at - a.at)
    .flatMap((item) => item.values);
}

function contextDecision(values) {
  for (const value of values || []) {
    if (PAYMENT_CONTEXT_RE.test(value)) return "payment";
    if (NON_PAYMENT_IMAGE_RE.test(value)) return "non_payment_image";
  }
  return "unknown";
}

async function proofIdentity({ messageId, lineUserId, webhookEventId }) {
  const messageHash = await sha256Hex(messageId);
  return {
    proofId: `line_${messageHash.slice(0, 24)}`,
    messageId,
    webhookEventId,
    lineUserId,
    lineUserIdHash: await sha256Hex(lineUserId),
  };
}

async function existingProof({ env, proofId, fetchImpl }) {
  return (await records({
    env,
    table: env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs",
    formula: `{proof_id}='${formulaValue(proofId)}'`,
    maxRecords: 1,
    fetchImpl,
  }))[0] || null;
}

async function downloadLineImage({ env, messageId, fetchImpl }) {
  const token = clean(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token) throw new Error("line_access_token_missing");
  const response = await fetchImpl(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`line_image_download_failed_${response.status}`);
  const mimeType = clean(response.headers.get("content-type")).split(";")[0].toLowerCase();
  if (!IMAGE_TYPES.has(mimeType)) throw new Error("line_image_mime_unsupported");
  const limit = Math.min(Math.max(Number(env.LINE_SLIP_MAX_IMAGE_BYTES) || MAX_IMAGE_BYTES, 1), MAX_IMAGE_BYTES);
  const declared = numberOrNull(response.headers.get("content-length"));
  if (declared != null && declared > limit) throw new Error("line_image_too_large");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error("line_image_empty");
  if (bytes.byteLength > limit) throw new Error("line_image_too_large");
  return { bytes, mimeType, byteSize: bytes.byteLength, extension: IMAGE_TYPES.get(mimeType), sha256: await sha256Hex(bytes) };
}

function normalizeExtraction(payload, method, env) {
  const data = payload?.result && typeof payload.result === "object" ? payload.result : payload || {};
  const amount = normalizedAmount(data.amount_thb ?? data.amount, env.LINE_SLIP_MAX_AMOUNT_THB);
  const paymentRef = clean(data.payment_ref || data.provider_txn_id || data.transaction_ref);
  const paidAt = clean(data.paid_at || data.transfer_at);
  const payerName = clean(data.payer_name || data.sender_name);
  return {
    payment_ref: paymentRef,
    amount_thb: amount,
    paid_at: paidAt,
    payer_name: payerName,
    sender_bank: clean(data.sender_bank),
    receiver_bank: clean(data.receiver_bank),
    provider: clean(data.provider || data.bank),
    extraction_method: method,
    confidence_score: Math.max(0, Math.min(1, numberOrNull(data.confidence_score ?? data.confidence) || 0)),
  };
}

function useful(extraction) {
  return Boolean(extraction && (extraction.payment_ref || extraction.amount_thb != null || extraction.paid_at || extraction.payer_name));
}

async function extractorCall({ env, image, path, method, requestId }) {
  if (!env.SLIP_EXTRACTOR?.fetch) throw new Error("slip_extractor_binding_missing");
  const token = clean(env.MMD_SLIP_EXTRACTOR_TOKEN);
  if (!token) throw new Error("slip_extractor_token_missing");
  const response = await env.SLIP_EXTRACTOR.fetch(new Request(`https://mmd-slip-extractor.internal${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": image.mimeType,
      "content-length": String(image.byteSize),
      "x-request-id": requestId,
    },
    body: image.bytes,
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method}_extractor_failed_${response.status}`);
  return normalizeExtraction(payload, method, env);
}

async function extract({ env, image, requestId }) {
  let qr = null;
  let qrError = "";
  try { qr = await extractorCall({ env, image, path: "/v1/extract/qr", method: "qr", requestId }); }
  catch (error) { qrError = clean(error?.message || error); }
  if (clean(qr?.payment_ref)) return { ...qr, extraction_error: "" };
  try {
    const ocr = await extractorCall({ env, image, path: "/v1/extract/ocr", method: "ocr", requestId });
    if (useful(ocr)) return { ...ocr, extraction_error: qrError };
  } catch (error) {
    if (!qr || !useful(qr)) throw error;
  }
  return { payment_ref: "", amount_thb: null, paid_at: "", payer_name: "", sender_bank: "", receiver_bank: "", provider: "", extraction_method: qr ? "qr" : "none", confidence_score: 0, extraction_error: qrError };
}

function strongWithoutContext(extraction, env) {
  if (clean(extraction?.payment_ref)) return true;
  return Boolean(extraction?.amount_thb != null && clean(extraction?.paid_at) && extraction.confidence_score >= threshold(env));
}

async function storeEvidence({ env, identity, image, now }) {
  if (!env.SLIP_EVIDENCE_R2?.put) throw new Error("slip_evidence_r2_missing");
  const key = `line-ofc/payment-proofs/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${identity.proofId}/original.${image.extension}`;
  await env.SLIP_EVIDENCE_R2.put(key, image.bytes, {
    httpMetadata: { contentType: image.mimeType },
    customMetadata: { evidence_sha256: image.sha256, proof_id: identity.proofId },
  });
  return { key, sha256: image.sha256, mimeType: image.mimeType, byteSize: image.byteSize };
}

async function duplicateEvidence({ env, identity, stored, extraction, fetchImpl }) {
  const table = env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs";
  const shaFormula = `AND(FIND('${formulaValue(stored.sha256)}',{note})>0,{proof_id}!='${formulaValue(identity.proofId)}')`;
  const refFormula = extraction.payment_ref
    ? `AND({payment_ref}='${formulaValue(extraction.payment_ref)}',{proof_id}!='${formulaValue(identity.proofId)}')`
    : "FALSE()";
  const [sha, ref] = await Promise.all([
    records({ env, table, formula: shaFormula, maxRecords: 1, fetchImpl }),
    records({ env, table, formula: refFormula, maxRecords: 1, fetchImpl }),
  ]);
  return { duplicateSha: sha[0] || null, duplicateRef: ref[0] || null };
}

async function deterministicLinks({ env, identity, extraction, fetchImpl }) {
  const memberQuery = records({
    env,
    table: env.AIRTABLE_TABLE_MEMBERS || "Members",
    formula: `{line_id}='${formulaValue(identity.lineUserId)}'`,
    maxRecords: 2,
    fetchImpl,
  });
  const paymentQuery = extraction.payment_ref
    ? records({
        env,
        table: env.AIRTABLE_TABLE_PAYMENTS || "Payments",
        formula: `AND({Payment Reference}='${formulaValue(extraction.payment_ref)}'${extraction.amount_thb == null ? "" : `,{Amount}=${extraction.amount_thb}`})`,
        maxRecords: 2,
        fetchImpl,
      })
    : Promise.resolve([]);
  const [members, payments] = await Promise.all([memberQuery, paymentQuery]);
  return {
    member: members.length === 1 ? members[0].id : "",
    payment: payments.length === 1 ? payments[0].id : "",
    ambiguous: members.length > 1 || payments.length > 1,
  };
}

function proofFields({ identity, stored, extraction, duplicateSha, duplicateRef, links, reviewRequired }) {
  const note = JSON.stringify({
    schema: PROOF_SCHEMA,
    line_user_id_hash: identity.lineUserIdHash,
    line_message_id: identity.messageId,
    webhook_event_id: identity.webhookEventId || null,
    r2_key: stored.key,
    evidence_sha256: stored.sha256,
    mime_type: stored.mimeType,
    byte_size: stored.byteSize,
    extraction_method: extraction.extraction_method,
    extraction_confidence: extraction.confidence_score,
    provider: extraction.provider || null,
    sender_bank: extraction.sender_bank || null,
    receiver_bank: extraction.receiver_bank || null,
    duplicate_status: duplicateRef ? "duplicate_payment_ref" : duplicateSha ? "duplicate_sha" : "not_detected",
    extraction_error: extraction.extraction_error || null,
    hype_alert_status: "pending",
    payments_worker_handoff: {
      action: "stage_payment_evidence",
      proof_id: identity.proofId,
      payment_ref: extraction.payment_ref || null,
      amount_thb: extraction.amount_thb,
      state: "pending",
      review_required: Boolean(reviewRequired),
      official_verification_required: true,
      may_mark_paid: false,
      may_award_points: false,
      may_extend_membership: false,
      may_confirm_session: false,
    },
  });
  const fields = { proof_id: identity.proofId, channel: "line_ofc", note, status: "pending" };
  if (extraction.payer_name) fields.payer_name = extraction.payer_name;
  if (extraction.amount_thb != null) fields.amount_thb = extraction.amount_thb;
  if (extraction.payment_ref) fields.payment_ref = extraction.payment_ref;
  if (extraction.paid_at && !Number.isNaN(Date.parse(extraction.paid_at))) fields.paid_at = new Date(extraction.paid_at).toISOString().slice(0, 10);
  if (links.member) fields.member = [links.member];
  if (links.payment) fields.payment = [links.payment];
  return fields;
}

async function createProof({ env, fields, fetchImpl }) {
  return airtable({
    env,
    table: env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs",
    init: { method: "POST", body: JSON.stringify({ fields }) },
    fetchImpl,
  });
}

function parseNote(record) {
  try { return JSON.parse(record?.fields?.note || "{}"); } catch { return {}; }
}

async function patchProofNote({ env, record, patch, fetchImpl }) {
  const note = { ...parseNote(record), ...patch };
  const body = { records: [{ id: record.id, fields: { note: JSON.stringify(note) } }] };
  await airtable({
    env,
    table: env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs",
    init: { method: "PATCH", body: JSON.stringify(body) },
    fetchImpl,
  });
  record.fields = { ...(record.fields || {}), note: JSON.stringify(note) };
}

function maskedRef(value) {
  const ref = clean(value);
  if (!ref) return "";
  return ref.length <= 8 ? `${ref.slice(0, 2)}…${ref.slice(-2)}` : `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

async function notifyHype({ env, proofId, amount, paymentRef, state }) {
  const required = enabled(env.HYPE_ALERT_REQUIRED ?? "true");
  const chatId = clean(env.TELEGRAM_OPS_CHAT_ID || env.TELEGRAM_CHAT_ID);
  const token = clean(env.AUTH_SERVICE_LINE_TO_TELEGRAM);
  if (!env.TELEGRAM_WORKER?.fetch || !chatId || !token) {
    if (required) throw new Error("hype_alert_config_missing");
    return { ok: false, skipped: true };
  }
  const ref = maskedRef(paymentRef);
  const text = ["🧾 LINE SLIP RECEIVED", `Proof: ${proofId}`, amount != null ? `Amount: ${amount} THB` : "", ref ? `Ref: ${ref}` : "", `Status: ${state}`].filter(Boolean).join("\n");
  const thread = Number(env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || 21) || 21;
  const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram.internal/telegram/internal/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ flow: "payment_proof", chat_id: chatId, message_thread_id: thread, text }),
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.telegram?.ok !== true) throw new Error(`hype_alert_failed_${response.status}`);
  return { ok: true };
}

async function ensureHype({ env, record, proofId, amount, paymentRef, state, fetchImpl }) {
  if (parseNote(record).hype_alert_status === "sent") return;
  const result = await notifyHype({ env, proofId, amount, paymentRef, state });
  if (result.ok) await patchProofNote({ env, record, patch: { hype_alert_status: "sent", hype_alerted_at: new Date().toISOString() }, fetchImpl });
}

function telemetry(result) {
  console.log(JSON.stringify({
    event: "mmd_line_slip_queue_result",
    ok: result.ok === true,
    ignored: result.ignored === true,
    deduped: result.deduped === true,
    review_required: result.reviewRequired === true,
    state: clean(result.state || "unknown"),
  }));
}

export async function processSlipQueueMessage(body, env = {}, dependencies = {}) {
  if (clean(env.MMD_RUNTIME_SCOPE) !== "staging") throw new Error("staging_scope_required");
  const fetchImpl = dependencies.fetchImpl || fetch;
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const queued = normalizeQueueBody(body);
  const inbox = await loadInboxEvent({ env, lineEventId: queued.lineEventId, fetchImpl });
  const identity = await proofIdentity({ messageId: queued.messageId, lineUserId: inbox.lineUserId, webhookEventId: queued.webhookEventId });

  const found = await existingProof({ env, proofId: identity.proofId, fetchImpl });
  if (found?.id) {
    await ensureHype({
      env,
      record: found,
      proofId: identity.proofId,
      amount: numberOrNull(found.fields?.amount_thb),
      paymentRef: clean(found.fields?.payment_ref),
      state: "pending",
      fetchImpl,
    });
    return { ok: true, deduped: true, proofId: identity.proofId, state: "pending" };
  }

  const decision = contextDecision(await recentContext({ env, lineUserId: inbox.lineUserId, now, fetchImpl }));
  if (decision === "non_payment_image") return { ok: true, ignored: true, state: "non_payment_image" };

  const image = await downloadLineImage({ env, messageId: identity.messageId, fetchImpl });
  const extraction = await extract({ env, image, requestId: identity.proofId });
  if (decision !== "payment" && !strongWithoutContext(extraction, env)) return { ok: true, ignored: true, state: "not_payment_evidence" };

  const stored = await storeEvidence({ env, identity, image, now });
  const { duplicateSha, duplicateRef } = await duplicateEvidence({ env, identity, stored, extraction, fetchImpl });
  let links = { member: "", payment: "", ambiguous: false };
  try { links = await deterministicLinks({ env, identity, extraction, fetchImpl }); }
  catch { links.ambiguous = true; }

  const reviewRequired = Boolean(
    duplicateSha || duplicateRef || links.ambiguous ||
    extraction.confidence_score < threshold(env) ||
    !extraction.payment_ref || extraction.amount_thb == null ||
    !(links.member || links.payment)
  );
  const fields = proofFields({ identity, stored, extraction, duplicateSha, duplicateRef, links, reviewRequired });
  const proof = await createProof({ env, fields, fetchImpl });
  if (!proof?.id) throw new Error("payment_proof_create_failed");
  const record = { id: proof.id, fields };
  await ensureHype({
    env,
    record,
    proofId: identity.proofId,
    amount: extraction.amount_thb,
    paymentRef: extraction.payment_ref,
    state: reviewRequired ? "review_required" : "pending",
    fetchImpl,
  });
  return { ok: true, deduped: false, proofId: identity.proofId, proofRecordId: proof.id, state: "pending", reviewRequired, duplicatePaymentRef: Boolean(duplicateRef), extractionMethod: extraction.extraction_method };
}

async function consume(batch, env) {
  for (const message of batch.messages || []) {
    try {
      const result = await processSlipQueueMessage(message.body, env);
      telemetry(result);
      if (typeof message.ack === "function") message.ack();
    } catch (error) {
      console.error(JSON.stringify({ event: "mmd_line_slip_queue_failed", error: clean(error?.message || error).slice(0, 120) }));
      if (typeof message.retry === "function") message.retry();
      else throw error;
    }
  }
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const staging = clean(env.MMD_RUNTIME_SCOPE) === "staging";
      return json({
        ok: staging,
        worker: WORKER_NAME,
        runtime_scope: clean(env.MMD_RUNTIME_SCOPE),
        queue_consumer: true,
        r2_configured: Boolean(env.SLIP_EVIDENCE_R2?.put),
        extractor_configured: Boolean(env.SLIP_EXTRACTOR?.fetch),
        telegram_configured: Boolean(env.TELEGRAM_WORKER?.fetch),
        payment_truth: "payments-worker",
        may_mark_paid: false,
      }, staging ? 200 : 503);
    }
    return json({ ok: false, error: "not_found" }, 404);
  },
  async queue(batch, env) {
    if (clean(env.MMD_RUNTIME_SCOPE) !== "staging") throw new Error("staging_scope_required");
    return consume(batch, env);
  },
};
