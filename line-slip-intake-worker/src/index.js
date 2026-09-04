const WORKER_NAME = "mmd-line-slip-intake-staging";
const QUEUE_SCHEMA = "line_slip_intake_queue_v1";
const PROOF_SCHEMA = "line_ofc_payment_proof_queue_v1";
const DEFAULT_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_AMOUNT_THB = 10_000_000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.85;
const PAYMENT_CONTEXT_RE = /(สลิป|หลักฐาน.{0,12}(ชำระ|โอน|จ่าย)|โอน(?:เงิน)?(?:แล้ว|เรียบร้อย)?|จ่าย(?:เงิน)?(?:แล้ว|เรียบร้อย)?|ชำระ(?:เงิน)?(?:แล้ว|เรียบร้อย)?|ยอด.{0,18}(?:บาท|thb)|(?:บาท|thb).{0,18}ยอด|payment\s*(slip|proof)|transfer\s*(slip|proof|done|complete|completed)|bank\s*transfer|prompt\s*pay|promptpay|พร้อมเพย์|\bpaid\b)/i;
const NON_PAYMENT_IMAGE_CONTEXT_RE = /(ส่ง|ขอ|ดู|มี).{0,10}(รูป|รูปภาพ|profile|โปรไฟล์|หน้าสด)|(?:รูป|รูปภาพ|profile|โปรไฟล์|หน้าสด).{0,10}(model|นายแบบ|ems\d+|gws\d+)/i;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const clean = (value) => String(value ?? "").trim();
const numberOrNull = (value) => {
  if (value == null || clean(value) === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const isEnabled = (value) => ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
const formulaValue = (value) => clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

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

async function sha256Hex(value) {
  const bytes = value instanceof ArrayBuffer
    ? value
    : ArrayBuffer.isView(value)
      ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
      : new TextEncoder().encode(String(value ?? "")).buffer;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeAmountThb(value, maxAmount = DEFAULT_MAX_AMOUNT_THB) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(clean(value))) return null;
  const numeric = numberOrNull(value);
  const configuredMax = numberOrNull(maxAmount);
  const limit = configuredMax != null && configuredMax > 0 ? configuredMax : DEFAULT_MAX_AMOUNT_THB;
  if (numeric == null || numeric <= 0 || numeric > limit) return null;
  const normalized = Math.round((numeric + Number.EPSILON) * 100) / 100;
  return normalized > 0 && normalized <= limit ? normalized : null;
}

function boundedMaxBytes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MAX_IMAGE_BYTES;
  return Math.min(Math.floor(parsed), DEFAULT_MAX_IMAGE_BYTES);
}

function confidenceThreshold(value) {
  const parsed = numberOrNull(value);
  if (parsed == null) return DEFAULT_CONFIDENCE_THRESHOLD;
  return Math.max(0.5, Math.min(1, parsed));
}

function normalizeQueueBody(body) {
  if (!body || typeof body !== "object") throw new Error("queue_body_invalid");
  if (clean(body.schema) !== QUEUE_SCHEMA) throw new Error("queue_schema_invalid");
  const lineEventId = clean(body.line_event_id || body.message_id);
  const messageId = clean(body.message_id || body.line_event_id);
  if (!lineEventId || !messageId) throw new Error("queue_message_id_missing");
  return {
    schema: QUEUE_SCHEMA,
    line_event_id: lineEventId,
    message_id: messageId,
    webhook_event_id: clean(body.webhook_event_id),
    enqueued_at: clean(body.enqueued_at),
  };
}

async function airtableRequest({ env, table, query = {}, init = {}, fetchImpl = fetch }) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!baseId || !token) throw new Error("airtable_config_missing");
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetchImpl(url.toString(), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}

async function airtableRecords({ env, table, formula, maxRecords = 2, fetchImpl = fetch }) {
  const data = await airtableRequest({
    env,
    table,
    query: { maxRecords, filterByFormula: formula },
    fetchImpl,
  });
  return Array.isArray(data.records) ? data.records : [];
}

async function loadConsoleInboxEvent({ env, lineEventId, fetchImpl = fetch }) {
  const formula = `{line_id}='${formulaValue(lineEventId)}'`;
  const records = await airtableRecords({
    env,
    table: env.AIRTABLE_SYNC_TABLE || "MMD — Console Inbox",
    formula,
    maxRecords: 2,
    fetchImpl,
  });
  if (records.length !== 1) throw new Error(records.length > 1 ? "console_inbox_event_ambiguous" : "console_inbox_event_missing");
  const record = records[0] || {};
  const fields = record.fields || {};
  let payload = {};
  try { payload = JSON.parse(fields.payload_json || "{}"); } catch {}
  const lineUserId = clean(fields.line_user_id || payload.source_user_id);
  if (!lineUserId) throw new Error("console_inbox_line_user_missing");
  return {
    id: record.id,
    lineUserId,
    receivedAt: clean(payload.received_at || record.createdTime),
    parsedIntent: clean(payload.parsed_intent || fields.intent),
  };
}

async function loadRecentPaymentContext({ env, lineUserId, fetchImpl = fetch, now = new Date() }) {
  if (!clean(lineUserId)) return [];
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const cutoffMs = Date.parse(cutoff);
  const formula = `AND({line_user_id}='${formulaValue(lineUserId)}',IS_AFTER(CREATED_TIME(),DATETIME_PARSE('${cutoff}')))`;
  const found = await airtableRecords({
    env,
    table: env.AIRTABLE_SYNC_TABLE || "MMD — Console Inbox",
    formula,
    maxRecords: 20,
    fetchImpl,
  });
  return found
    .map((record) => {
      let payload = {};
      try { payload = JSON.parse(record?.fields?.payload_json || "{}"); } catch {}
      const receivedAt = clean(payload.received_at || record?.createdTime);
      const timestamp = Date.parse(receivedAt);
      return {
        timestamp,
        values: [clean(payload.raw_text), clean(record?.fields?.admin_note)].filter(Boolean),
      };
    })
    .filter((item) => Number.isFinite(item.timestamp) && item.timestamp >= cutoffMs && item.timestamp <= now.getTime() + 60 * 1000)
    .sort((a, b) => b.timestamp - a.timestamp)
    .flatMap((item) => item.values);
}

function recentContextDecision(values = []) {
  for (const value of Array.isArray(values) ? values : [values]) {
    const text = clean(value);
    if (!text) continue;
    if (PAYMENT_CONTEXT_RE.test(text)) return "payment";
    if (NON_PAYMENT_IMAGE_CONTEXT_RE.test(text)) return "non_payment_image";
  }
  return "unknown";
}

async function buildProofIdentity({ messageId, lineUserId, webhookEventId = "" }) {
  const digest = await sha256Hex(messageId);
  return {
    proofId: `line_${digest.slice(0, 24)}`,
    messageId,
    webhookEventId,
    lineUserId,
    lineUserIdHash: await sha256Hex(lineUserId || "unknown_line_user"),
  };
}

async function findExistingProof({ env, proofId, fetchImpl = fetch }) {
  const formula = `{proof_id}='${formulaValue(proofId)}'`;
  const found = await airtableRecords({
    env,
    table: env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs",
    formula,
    maxRecords: 1,
    fetchImpl,
  });
  return found[0] || null;
}

async function downloadLineImage({ env, messageId, fetchImpl = fetch }) {
  const accessToken = clean(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!accessToken) throw new Error("line_access_token_missing");
  const response = await fetchImpl(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`line_image_download_failed_${response.status}`);
  const mimeType = clean(response.headers.get("content-type")).split(";")[0].toLowerCase();
  if (!IMAGE_TYPES.has(mimeType)) throw new Error("line_image_mime_unsupported");
  const limit = boundedMaxBytes(env.LINE_SLIP_MAX_IMAGE_BYTES);
  const declared = numberOrNull(response.headers.get("content-length"));
  if (declared != null && declared > limit) throw new Error("line_image_too_large");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error("line_image_empty");
  if (bytes.byteLength > limit) throw new Error("line_image_too_large");
  return {
    bytes,
    mimeType,
    byteSize: bytes.byteLength,
    extension: IMAGE_TYPES.get(mimeType),
    sha256: await sha256Hex(bytes),
  };
}

function buildPrivateR2Key(now, proofId, extension) {
  const date = now instanceof Date ? now : new Date(now);
  return `line-ofc/payment-proofs/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${proofId}/original.${extension}`;
}

async function storeEvidence({ env, proofId, image, now = new Date() }) {
  if (!env.SLIP_EVIDENCE_R2?.put) throw new Error("slip_evidence_r2_missing");
  const key = buildPrivateR2Key(now, proofId, image.extension);
  await env.SLIP_EVIDENCE_R2.put(key, image.bytes, {
    httpMetadata: { contentType: image.mimeType },
    customMetadata: {
      evidence_sha256: image.sha256,
      proof_id: proofId,
    },
  });
  return { key, sha256: image.sha256, mimeType: image.mimeType, byteSize: image.byteSize };
}

function normalizeExtraction(payload, method, env) {
  const data = payload?.result && typeof payload.result === "object" ? payload.result : payload || {};
  const amountThb = normalizeAmountThb(data.amount_thb ?? data.amount, env.LINE_SLIP_MAX_AMOUNT_THB);
  const paymentRef = clean(data.payment_ref || data.provider_txn_id || data.transaction_ref);
  const paidAt = clean(data.paid_at || data.transfer_at);
  const payerName = clean(data.payer_name || data.sender_name);
  const confidence = Math.max(0, Math.min(1, numberOrNull(data.confidence_score ?? data.confidence) || 0));
  return {
    payment_ref: paymentRef,
    amount_thb: amountThb,
    paid_at: paidAt,
    payer_name: payerName,
    sender_bank: clean(data.sender_bank),
    receiver_bank: clean(data.receiver_bank),
    provider: clean(data.provider || data.bank),
    extraction_method: method,
    confidence_score: amountThb == null && !paymentRef && !paidAt && !payerName ? 0 : confidence,
  };
}

function extractionUseful(result) {
  return Boolean(result && (result.payment_ref || result.amount_thb != null || result.paid_at || result.payer_name));
}

async function callExtractor({ env, image, path, method, requestId }) {
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

async function extractPaymentSlip({ env, image, requestId }) {
  let qr = null;
  let qrError = "";
  try {
    qr = await callExtractor({ env, image, path: "/v1/extract/qr", method: "qr", requestId });
  } catch (error) {
    qrError = clean(error?.message || error);
  }
  if (clean(qr?.payment_ref)) return { ...qr, extraction_error: "" };

  try {
    const ocr = await callExtractor({ env, image, path: "/v1/extract/ocr", method: "ocr", requestId });
    if (extractionUseful(ocr)) return { ...ocr, extraction_error: qrError };
  } catch (error) {
    const ocrError = clean(error?.message || error);
    if (!qr || !extractionUseful(qr)) throw new Error([qrError, ocrError].filter(Boolean).join(",") || "slip_extraction_failed");
  }

  return {
    payment_ref: "",
    amount_thb: null,
    paid_at: "",
    payer_name: "",
    sender_bank: "",
    receiver_bank: "",
    provider: "",
    extraction_method: qr ? "qr" : "none",
    confidence_score: 0,
    extraction_error: qrError,
  };
}

function extractionStrongEnoughWithoutContext(extraction, env) {
  if (!extraction) return false;
  if (clean(extraction.payment_ref)) return true;
  const threshold = confidenceThreshold(env.LINE_SLIP_CONFIDENCE_THRESHOLD);
  return Boolean(
    extraction.amount_thb != null &&
    clean(extraction.paid_at) &&
    extraction.confidence_score >= threshold
  );
}

async function findDuplicate({ env, formula, fetchImpl = fetch }) {
  const found = await airtableRecords({
    env,
    table: env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs",
    formula,
    maxRecords: 1,
    fetchImpl,
  });
  return found[0] || null;
}

async function uniqueRecord({ env, table, formula, fetchImpl = fetch }) {
  const found = await airtableRecords({ env, table, formula, maxRecords: 2, fetchImpl });
  return { id: found.length === 1 ? found[0].id : "", ambiguous: found.length > 1 };
}

async function resolveDeterministicLinks({ env, identity, extraction, fetchImpl = fetch }) {
  const queries = [];
  if (identity.lineUserId) {
    queries.push(["member", env.AIRTABLE_TABLE_MEMBERS || "Members", `{line_id}='${formulaValue(identity.lineUserId)}'`]);
  }
  if (clean(extraction.session_id)) {
    const amountClause = extraction.amount_thb == null ? "" : `,{amount_thb}=${extraction.amount_thb}`;
    queries.push(["session", env.AIRTABLE_TABLE_SESSIONS || "Sessions", `AND({session_id}='${formulaValue(extraction.session_id)}'${amountClause})`]);
    queries.push(["renewal", env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || "MMD — LIFF Renewal Sessions", `{session_id}='${formulaValue(extraction.session_id)}'`]);
  }
  if (extraction.payment_ref) {
    const amountClause = extraction.amount_thb == null ? "" : `,{Amount}=${extraction.amount_thb}`;
    queries.push(["payment", env.AIRTABLE_TABLE_PAYMENTS || "Payments", `AND({Payment Reference}='${formulaValue(extraction.payment_ref)}'${amountClause})`]);
  }
  const resolved = Object.fromEntries(await Promise.all(queries.map(async ([name, table, formula]) => [name, await uniqueRecord({ env, table, formula, fetchImpl })])));
  const ambiguous = Object.values(resolved).some((item) => item.ambiguous);
  return {
    member: ambiguous ? "" : resolved.member?.id || "",
    session: ambiguous ? "" : resolved.session?.id || "",
    payment: ambiguous ? "" : resolved.payment?.id || "",
    renewal: ambiguous ? "" : resolved.renewal?.id || "",
    ambiguous,
  };
}

function buildStagedHandoff({ proofId, extraction, reviewRequired }) {
  return {
    action: "stage_payment_evidence",
    proof_id: proofId,
    payment_ref: extraction.payment_ref || null,
    amount_thb: extraction.amount_thb,
    state: "pending",
    review_required: Boolean(reviewRequired),
    official_verification_required: true,
    may_mark_paid: false,
    may_award_points: false,
    may_extend_membership: false,
    may_confirm_session: false,
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
    payments_worker_handoff: buildStagedHandoff({ proofId: identity.proofId, extraction, reviewRequired }),
  });

  const fields = {
    proof_id: identity.proofId,
    channel: "line_ofc",
    note,
    status: "pending",
  };
  if (extraction.payer_name) fields.payer_name = extraction.payer_name;
  if (extraction.amount_thb != null) fields.amount_thb = extraction.amount_thb;
  if (extraction.paid_at && !Number.isNaN(Date.parse(extraction.paid_at))) {
    const localDate = clean(extraction.paid_at).match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    fields.paid_at = localDate || new Date(extraction.paid_at).toISOString().slice(0, 10);
  }
  if (extraction.payment_ref) fields.payment_ref = extraction.payment_ref;
  if (links.member) fields.member = [links.member];
  if (links.session) fields.session = [links.session];
  if (links.payment) fields.payment = [links.payment];
  if (links.renewal) fields["MMD — LIFF Renewal Sessions"] = [links.renewal];
  return fields;
}

async function createProof({ env, fields, fetchImpl = fetch }) {
  return airtableRequest({
    env,
    table: env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs",
    init: { method: "POST", body: JSON.stringify({ fields }) },
    fetchImpl,
  });
}

function parseNote(record) {
  try { return JSON.parse(record?.fields?.note || "{}"); } catch { return {}; }
}

async function updateProofNote({ env, record, patch, fetchImpl = fetch }) {
  if (!record?.id) return;
  const note = { ...parseNote(record), ...patch };
  await airtableRequest({
    env,
    table: `${env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs"}/${record.id}`,
    init: { method: "PATCH", body: JSON.stringify({ fields: { note: JSON.stringify(note) } }) },
    fetchImpl,
  });
  record.fields = { ...(record.fields || {}), note: JSON.stringify(note) };
}

function maskedPaymentRef(value) {
  const ref = clean(value);
  if (!ref) return "";
  if (ref.length <= 8) return `${ref.slice(0, 2)}…${ref.slice(-2)}`;
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

async function notifyHype({ env, proofId, amountThb, paymentRef, status = "pending" }) {
  const required = isEnabled(env.HYPE_ALERT_REQUIRED ?? "true");
  const chatId = clean(env.TELEGRAM_OPS_CHAT_ID || env.TELEGRAM_CHAT_ID);
  const token = clean(env.AUTH_SERVICE_LINE_TO_TELEGRAM);
  if (!env.TELEGRAM_WORKER?.fetch || !chatId || !token) {
    if (required) throw new Error("hype_alert_config_missing");
    return { ok: false, skipped: true };
  }
  const maskedRef = maskedPaymentRef(paymentRef);
  const text = [
    "🧾 LINE SLIP RECEIVED",
    `Proof: ${proofId}`,
    amountThb != null ? `Amount: ${amountThb} THB` : "",
    maskedRef ? `Ref: ${maskedRef}` : "",
    `Status: ${status}`,
  ].filter(Boolean).join("\n");
  const threadId = Number(env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || 21) || 21;
  const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      flow: "payment_proof",
      chat_id: chatId,
      message_thread_id: threadId,
      text,
    }),
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.telegram?.ok !== true) throw new Error(`hype_alert_failed_${response.status}`);
  return { ok: true, status: response.status, message_thread_id: threadId };
}

async function ensureHypeAlert({ env, record, proofId, amountThb, paymentRef, status, fetchImpl }) {
  const note = parseNote(record);
  if (note.hype_alert_status === "sent") return { ok: true, deduped: true };
  const result = await notifyHype({ env, proofId, amountThb, paymentRef, status });
  if (result.ok) {
    await updateProofNote({
      env,
      record,
      patch: { hype_alert_status: "sent", hype_alerted_at: new Date().toISOString() },
      fetchImpl,
    });
  }
  return result;
}

function recordTelemetry(result = {}) {
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

  const inbox = await loadConsoleInboxEvent({ env, lineEventId: queued.line_event_id, fetchImpl });
  const identity = await buildProofIdentity({
    messageId: queued.message_id,
    lineUserId: inbox.lineUserId,
    webhookEventId: queued.webhook_event_id,
  });

  const existing = await findExistingProof({ env, proofId: identity.proofId, fetchImpl });
  if (existing?.id) {
    await ensureHypeAlert({
      env,
      record: existing,
      proofId: identity.proofId,
      amountThb: numberOrNull(existing.fields?.amount_thb),
      paymentRef: clean(existing.fields?.payment_ref),
      status: "pending",
      fetchImpl,
    });
    return { ok: true, deduped: true, proofId: identity.proofId, state: "pending" };
  }

  const recentContext = await loadRecentPaymentContext({ env, lineUserId: inbox.lineUserId, fetchImpl, now });
  const contextDecision = recentContextDecision(recentContext);
  if (contextDecision === "non_payment_image") {
    return { ok: true, ignored: true, state: "non_payment_image" };
  }

  const image = await downloadLineImage({ env, messageId: identity.messageId, fetchImpl });
  const extraction = await extractPaymentSlip({ env, image, requestId: identity.proofId });

  if (contextDecision !== "payment" && !extractionStrongEnoughWithoutContext(extraction, env)) {
    return { ok: true, ignored: true, state: "not_payment_evidence" };
  }

  const stored = await storeEvidence({ env, proofId: identity.proofId, image, now });
  const duplicateShaFormula = `AND(FIND('${formulaValue(stored.sha256)}',{note})>0,{proof_id}!='${formulaValue(identity.proofId)}')`;
  const duplicateRefFormula = extraction.payment_ref
    ? `AND({payment_ref}='${formulaValue(extraction.payment_ref)}',{proof_id}!='${formulaValue(identity.proofId)}')`
    : "FALSE()";
  const [duplicateSha, duplicateRef] = await Promise.all([
    findDuplicate({ env, formula: duplicateShaFormula, fetchImpl }),
    findDuplicate({ env, formula: duplicateRefFormula, fetchImpl }),
  ]);

  let links = { member: "", session: "", payment: "", renewal: "", ambiguous: false };
  try {
    links = await resolveDeterministicLinks({ env, identity, extraction, fetchImpl });
  } catch {
    links.ambiguous = true;
  }

  const reconciliationComplete = Boolean(extraction.payment_ref && extraction.amount_thb != null);
  const deterministicallyLinked = Boolean(links.member || links.session || links.payment || links.renewal);
  const reviewRequired = Boolean(
    duplicateSha ||
    duplicateRef ||
    links.ambiguous ||
    extraction.confidence_score < confidenceThreshold(env.LINE_SLIP_CONFIDENCE_THRESHOLD) ||
    !reconciliationComplete ||
    !deterministicallyLinked
  );

  const fields = proofFields({ identity, stored, extraction, duplicateSha, duplicateRef, links, reviewRequired });
  const proof = await createProof({ env, fields, fetchImpl });
  if (!proof?.id) throw new Error("payment_proof_create_failed");
  const record = { id: proof.id, fields };
  await ensureHypeAlert({
    env,
    record,
    proofId: identity.proofId,
    amountThb: extraction.amount_thb,
    paymentRef: extraction.payment_ref,
    status: reviewRequired ? "review_required" : "pending",
    fetchImpl,
  });

  return {
    ok: true,
    deduped: false,
    proofId: identity.proofId,
    proofRecordId: proof.id,
    state: "pending",
    reviewRequired,
    duplicatePaymentRef: Boolean(duplicateRef),
    extractionMethod: extraction.extraction_method,
  };
}

async function handleQueue(batch, env) {
  for (const message of batch.messages || []) {
    try {
      const result = await processSlipQueueMessage(message.body, env);
      recordTelemetry(result);
      if (typeof message.ack === "function") message.ack();
    } catch (error) {
      console.error(JSON.stringify({
        event: "mmd_line_slip_queue_failed",
        error: clean(error?.message || error).slice(0, 120),
      }));
      if (typeof message.retry === "function") message.retry();
      else throw error;
    }
  }
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: clean(env.MMD_RUNTIME_SCOPE) === "staging",
        worker: WORKER_NAME,
        runtime_scope: clean(env.MMD_RUNTIME_SCOPE),
        queue_consumer: true,
        r2_configured: Boolean(env.SLIP_EVIDENCE_R2?.put),
        extractor_configured: Boolean(env.SLIP_EXTRACTOR?.fetch),
        telegram_configured: Boolean(env.TELEGRAM_WORKER?.fetch),
        payment_truth: "payments-worker",
        may_mark_paid: false,
      }, clean(env.MMD_RUNTIME_SCOPE) === "staging" ? 200 : 503);
    }
    return json({ ok: false, error: "not_found" }, 404);
  },

  async queue(batch, env) {
    if (clean(env.MMD_RUNTIME_SCOPE) !== "staging") throw new Error("staging_scope_required");
    return handleQueue(batch, env);
  },
};
