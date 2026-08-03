import crypto from "node:crypto";

export const SAFE_SLIP_ACK = "ได้รับหลักฐานการชำระเงินแล้วครับ ผมกำลังส่งรายละเอียดให้ทางระบบตรวจสอบ กรุณารอสักครู่ก่อนนะครับ";
export const MANUAL_SLIP_ACK = "ได้รับหลักฐานการชำระเงินแล้วครับ แต่รายละเอียดต้องให้ทาง MMD ตรวจสอบด้วยตนเอง กรุณารอสักครู่ก่อนนะครับ";
export const RETRY_SLIP_ACK = "ขออภัยครับ ระบบยังรับรูปสลิปนี้ไม่สำเร็จ รบกวนส่งรูปสลิปอีกครั้ง หรือพิมพ์หา MMD เพื่อให้น้องๆช่วยตรวจให้ครับ";

const SLIP_CONTEXT_RE = /(สลิป|หลักฐาน.{0,12}(ชำระ|โอน|จ่าย)|โอนแล้ว|จ่ายแล้ว|ชำระแล้ว|payment\s*(slip|proof)|transfer\s*(slip|proof)|promptpay)/i;
const IMAGE_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const clean = (value) => (value == null ? "" : String(value).trim());
const numberOrNull = (value) => {
  if (value == null || clean(value) === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const positiveNumberOrNull = (value) => {
  const numeric = numberOrNull(value);
  return numeric != null && numeric > 0 ? numeric : null;
};
const formulaValue = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (key, value, encoding) => crypto.createHmac("sha256", key).update(value).digest(encoding);

export function isImageMessage(event) {
  return event?.type === "message" && event?.message?.type === "image" && Boolean(clean(event?.message?.id));
}

export function looksLikePaymentSlipContext(event, recentContext = []) {
  if (!isImageMessage(event)) return false;
  const direct = [event?.message?.fileName, event?.context?.text].map(clean).filter(Boolean);
  const recent = (Array.isArray(recentContext) ? recentContext : [recentContext]).map(clean).filter(Boolean);
  return [...direct, ...recent].some((value) => SLIP_CONTEXT_RE.test(value));
}

export function buildProofIdentity(event) {
  const messageId = clean(event?.message?.id);
  if (!messageId) throw new Error("line_message_id_missing");
  const lineUserId = clean(event?.source?.userId || event?.source?.groupId || event?.source?.roomId);
  return {
    proofId: `line_${sha256(messageId).slice(0, 24)}`,
    messageId,
    webhookEventId: clean(event?.webhookEventId),
    lineUserId,
    lineUserIdHash: sha256(lineUserId || "unknown_line_user"),
  };
}

export async function downloadLineImage({ accessToken, messageId, maxBytes = MAX_IMAGE_BYTES, fetchImpl = fetch }) {
  if (!clean(accessToken)) throw new Error("line_access_token_missing");
  const response = await fetchImpl(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`line_image_download_failed_${response.status}`);
  const mimeType = clean(response.headers.get("content-type")).split(";")[0].toLowerCase();
  if (!IMAGE_TYPES.has(mimeType)) throw new Error("line_image_mime_unsupported");
  const limit = Math.min(Math.max(Number(maxBytes) || MAX_IMAGE_BYTES, 1), 20 * 1024 * 1024);
  const declared = numberOrNull(response.headers.get("content-length"));
  if (declared != null && declared > limit) throw new Error("line_image_too_large");
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length) throw new Error("line_image_empty");
  if (body.length > limit) throw new Error("line_image_too_large");
  return { body, mimeType, byteSize: body.length, extension: IMAGE_TYPES.get(mimeType), sha256: sha256(body) };
}

export function buildPrivateR2Key(now, proofId, extension) {
  const date = now instanceof Date ? now : new Date(now);
  return `line-ofc/payment-proofs/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${proofId}/original.${extension}`;
}

export async function putPrivateR2Object({ env, key, image, fetchImpl = fetch, now = new Date() }) {
  const accountId = clean(env.CLOUDFLARE_ACCOUNT_ID);
  const accessKeyId = clean(env.LINE_SLIP_R2_ACCESS_KEY_ID);
  const secretAccessKey = clean(env.LINE_SLIP_R2_SECRET_ACCESS_KEY);
  const bucket = clean(env.LINE_SLIP_R2_BUCKET);
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) throw new Error("line_slip_r2_config_missing");
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const uri = `/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const signed = {
    "content-type": image.mimeType,
    host,
    "x-amz-content-sha256": image.sha256,
    "x-amz-date": amzDate,
    "x-amz-meta-evidence-sha256": image.sha256,
  };
  const names = Object.keys(signed).sort();
  const canonicalHeaders = names.map((name) => `${name}:${signed[name]}\n`).join("");
  const canonicalRequest = ["PUT", uri, "", canonicalHeaders, names.join(";"), image.sha256].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = hmac(signingKey, stringToSign, "hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
  const response = await fetchImpl(`https://${host}${uri}`, { method: "PUT", headers: { ...signed, Authorization: authorization }, body: image.body });
  if (!response.ok) throw new Error(`line_slip_r2_put_failed_${response.status}`);
  return { key, sha256: image.sha256, mimeType: image.mimeType, byteSize: image.byteSize };
}

function normalizeExtraction(payload, method) {
  const data = payload?.result && typeof payload.result === "object" ? payload.result : payload || {};
  return {
    payment_ref: clean(data.payment_ref || data.provider_txn_id || data.transaction_ref),
    amount_thb: positiveNumberOrNull(data.amount_thb ?? data.amount),
    paid_at: clean(data.paid_at || data.transfer_at),
    payer_name: clean(data.payer_name || data.sender_name),
    sender_bank: clean(data.sender_bank),
    receiver_bank: clean(data.receiver_bank),
    provider: clean(data.provider || data.bank),
    session_id: clean(data.session_id || data.payment_intent_session_id),
    campaign_claim_id: clean(data.campaign_claim_id),
    extraction_method: method,
    confidence_score: Math.max(0, Math.min(1, numberOrNull(data.confidence_score ?? data.confidence) || 0)),
  };
}

const extractionUseful = (result) => Boolean(result && (result.payment_ref || result.amount_thb != null || result.paid_at || result.payer_name));

async function callExtractor({ url, token, image, method, fetchImpl }) {
  if (!clean(url)) return { available: false, error: `${method}_adapter_unavailable`, result: null };
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": image.mimeType, ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-mmd-extraction-method": method },
      body: image.body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { available: true, error: `${method}_adapter_failed_${response.status}`, result: null };
    return { available: true, error: "", result: normalizeExtraction(payload, method) };
  } catch {
    return { available: true, error: `${method}_adapter_failed`, result: null };
  }
}

export async function extractPaymentSlip({ env, image, fetchImpl = fetch }) {
  const token = clean(env.LINE_SLIP_EXTRACTOR_TOKEN);
  const qr = await callExtractor({ url: env.LINE_SLIP_QR_EXTRACTOR_URL, token, image, method: "qr", fetchImpl });
  // A payment-request QR can contain an amount and recipient proxy without
  // proving that a transfer occurred. Only accept QR-first when it has a
  // transaction reference; otherwise continue to OCR the slip evidence.
  if (clean(qr.result?.payment_ref)) return { ...qr.result, extraction_error: "" };
  const ocr = await callExtractor({ url: env.LINE_SLIP_OCR_EXTRACTOR_URL, token, image, method: "ocr", fetchImpl });
  if (extractionUseful(ocr.result)) return { ...ocr.result, extraction_error: qr.error || "" };
  return {
    payment_ref: "", amount_thb: null, paid_at: "", payer_name: "", sender_bank: "", receiver_bank: "", provider: "",
    session_id: "", campaign_claim_id: "", extraction_method: ocr.available ? "ocr" : qr.available ? "qr" : "none",
    confidence_score: 0, extraction_error: [qr.error, ocr.error].filter(Boolean).join(","),
  };
}

async function airtable({ env, table, query = {}, init = {}, fetchImpl = fetch }) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!baseId || !token) throw new Error("airtable_config_missing");
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  const response = await fetchImpl(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}

async function records({ env, table, formula, maxRecords = 2, sort, fetchImpl }) {
  const query = { maxRecords, filterByFormula: formula };
  if (sort) {
    query["sort[0][field]"] = sort.field;
    query["sort[0][direction]"] = sort.direction;
  }
  const data = await airtable({ env, table, query, fetchImpl });
  return Array.isArray(data.records) ? data.records : [];
}

export async function loadRecentPaymentContext({ env, lineUserId, fetchImpl = fetch, now = new Date() }) {
  if (!clean(lineUserId)) return [];
  try {
    const cutoffMs = now.getTime() - 15 * 60 * 1000;
    const formula = `{line_user_id}='${formulaValue(lineUserId)}'`;
    const found = await records({ env, table: env.AIRTABLE_SYNC_TABLE || "MMD — Console Inbox", formula, maxRecords: 25, fetchImpl });
    return found
      .map((record) => {
        let payload = {};
        try { payload = JSON.parse(record?.fields?.payload_json || "{}"); } catch {}
        const receivedAt = clean(payload.received_at || record?.fields?.received_at || record?.createdTime);
        const timestamp = Date.parse(receivedAt);
        return {
          timestamp,
          values: [clean(payload.raw_text), clean(record?.fields?.admin_note)].filter(Boolean),
        };
      })
      .filter((item) => Number.isFinite(item.timestamp) && item.timestamp >= cutoffMs && item.timestamp <= now.getTime() + 60 * 1000)
      .sort((a, b) => b.timestamp - a.timestamp)
      .flatMap((item) => item.values);
  } catch {
    return [];
  }
}

export async function findExistingProof({ env, identity, fetchImpl = fetch }) {
  const eventClause = identity.webhookEventId
    ? `FIND('\\"webhook_event_id\\":\\"${formulaValue(identity.webhookEventId)}\\"',{note})>0`
    : "FALSE()";
  const formula = `OR({proof_id}='${formulaValue(identity.proofId)}',${eventClause})`;
  const found = await records({ env, table: env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs", formula, maxRecords: 1, fetchImpl });
  return found[0] || null;
}

async function findDuplicate({ env, formula, fetchImpl }) {
  const found = await records({ env, table: env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs", formula, maxRecords: 1, fetchImpl });
  return found[0] || null;
}

async function uniqueRecord({ env, table, formula, fetchImpl }) {
  const found = await records({ env, table, formula, maxRecords: 2, fetchImpl });
  return { id: found.length === 1 ? found[0].id : "", ambiguous: found.length > 1 };
}

export async function resolveDeterministicLinks({ env, identity, extraction, fetchImpl = fetch }) {
  const queries = [];
  if (identity.lineUserId) {
    queries.push(["member", env.AIRTABLE_TABLE_MEMBERS || "Members", `{line_id}='${formulaValue(identity.lineUserId)}'`]);
  }
  if (extraction.session_id) {
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
  return { member: ambiguous ? "" : resolved.member?.id || "", session: ambiguous ? "" : resolved.session?.id || "", payment: ambiguous ? "" : resolved.payment?.id || "", renewal: ambiguous ? "" : resolved.renewal?.id || "", ambiguous };
}

export function buildStagedHandoff({ proofId, extraction, reviewRequired }) {
  return {
    action: "stage_payment_evidence",
    proof_id: proofId,
    payment_ref: extraction.payment_ref || null,
    session_id: extraction.session_id || null,
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
    schema: "line_ofc_payment_proof_v1", line_user_id_hash: identity.lineUserIdHash, line_message_id: identity.messageId,
    webhook_event_id: identity.webhookEventId, r2_key: stored.key, evidence_sha256: stored.sha256, mime_type: stored.mimeType,
    byte_size: stored.byteSize, extraction_method: extraction.extraction_method, extraction_confidence: extraction.confidence_score,
    provider: extraction.provider || null, sender_bank: extraction.sender_bank || null, receiver_bank: extraction.receiver_bank || null,
    duplicate_status: duplicateRef ? "duplicate_payment_ref" : duplicateSha ? "duplicate_sha" : "not_detected",
    extraction_error: extraction.extraction_error || null, raw_payload_json_redacted: { message_id: identity.messageId, webhook_event_id: identity.webhookEventId },
    links, payments_worker_handoff: buildStagedHandoff({ proofId: identity.proofId, extraction, reviewRequired }),
  });
  // INTERNAL ONLY: note contains private R2 and payment-evidence metadata.
  // Never return this field from customer-facing or frontend APIs.
  const fields = { proof_id: identity.proofId, channel: "line_ofc", note, status: "pending" };
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
  if (extraction.campaign_claim_id) fields.campaign_claim_id = extraction.campaign_claim_id;
  return fields;
}

async function createProof({ env, fields, fetchImpl }) {
  return airtable({ env, table: env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs", init: { method: "POST", body: JSON.stringify({ fields }) }, fetchImpl });
}

export async function notifyOps({ env, kind, proofId, extraction = {}, status = "pending", fetchImpl = fetch }) {
  const token = clean(env.TELEGRAM_BOT_TOKEN);
  const chatId = clean(env.TELEGRAM_OPS_CHAT_ID);
  if (!token || !chatId) return { ok: false, skipped: true, reason: "telegram_config_missing" };
  const title = kind === "duplicate" ? "⚠️ LINE SLIP DUPLICATE" : kind === "extraction_failed" ? "⚠️ LINE SLIP REVIEW REQUIRED" : "🧾 LINE SLIP RECEIVED";
  const maskedRef = extraction.payment_ref ? `${extraction.payment_ref.slice(0, 4)}…${extraction.payment_ref.slice(-4)}` : "";
  const message = [title, `Proof: ${proofId}`, extraction.amount_thb != null ? `Amount: ${extraction.amount_thb} THB` : "", maskedRef ? `Ref: ${maskedRef}` : "", `Status: ${status}`].filter(Boolean).join("\n");
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: message }) });
  return { ok: response.ok, status: response.status };
}

export async function processPaymentSlipImage({ env, event, fetchImpl = fetch, now = new Date() }) {
  const identity = buildProofIdentity(event);
  const existing = await findExistingProof({ env, identity, fetchImpl });
  if (existing?.id) return { ok: true, deduped: true, proofId: identity.proofId, state: "pending", replyText: "" };
  let image;
  let stored;
  try {
    image = await downloadLineImage({ accessToken: env.LINE_CHANNEL_ACCESS_TOKEN, messageId: identity.messageId, maxBytes: env.LINE_SLIP_MAX_IMAGE_BYTES, fetchImpl });
    stored = await putPrivateR2Object({ env, key: buildPrivateR2Key(now, identity.proofId, image.extension), image, fetchImpl, now });
  } catch (error) {
    await notifyOps({ env, kind: "extraction_failed", proofId: identity.proofId, status: "retry_required", fetchImpl }).catch(() => null);
    return { ok: false, deduped: false, proofId: identity.proofId, state: "retry_required", error: clean(error?.message || error), replyText: RETRY_SLIP_ACK };
  }
  try {
    const extraction = await extractPaymentSlip({ env, image, fetchImpl });
    const duplicateShaFormula = `AND(FIND('${formulaValue(stored.sha256)}',{note})>0,{proof_id}!='${formulaValue(identity.proofId)}')`;
    const duplicateRefFormula = extraction.payment_ref ? `AND({payment_ref}='${formulaValue(extraction.payment_ref)}',{proof_id}!='${formulaValue(identity.proofId)}')` : "FALSE()";
    const [duplicateSha, duplicateRef] = await Promise.all([
      findDuplicate({ env, formula: duplicateShaFormula, fetchImpl }),
      findDuplicate({ env, formula: duplicateRefFormula, fetchImpl }),
    ]);
    let links = { member: "", session: "", payment: "", renewal: "", ambiguous: false };
    try { links = await resolveDeterministicLinks({ env, identity, extraction, fetchImpl }); } catch { links.ambiguous = true; }
    const threshold = Math.max(0.5, Math.min(1, numberOrNull(env.LINE_SLIP_CONFIDENCE_THRESHOLD) || 0.85));
    const reconciliationComplete = Boolean(extraction.payment_ref && extraction.amount_thb != null);
    const deterministicallyLinked = Boolean(links.member || links.session || links.payment || links.renewal);
    const reviewRequired = Boolean(duplicateSha || duplicateRef || links.ambiguous || extraction.confidence_score < threshold || !reconciliationComplete || !deterministicallyLinked);
    const fields = proofFields({ identity, stored, extraction, duplicateSha, duplicateRef, links, reviewRequired });
    const proof = await createProof({ env, fields, fetchImpl });
    if (!proof?.id) throw new Error("payment_proof_create_failed");
    const telegram = await notifyOps({ env, kind: duplicateSha || duplicateRef ? "duplicate" : extractionUseful(extraction) ? "received" : "extraction_failed", proofId: identity.proofId, extraction, status: reviewRequired ? "review_required" : "pending", fetchImpl }).catch(() => ({ ok: false }));
    return { ok: true, deduped: false, proofId: identity.proofId, proofRecordId: proof.id, state: "pending", reviewRequired, duplicatePaymentRef: Boolean(duplicateRef), extractionMethod: extraction.extraction_method, telegram, replyText: reviewRequired ? MANUAL_SLIP_ACK : SAFE_SLIP_ACK };
  } catch (error) {
    await notifyOps({ env, kind: "extraction_failed", proofId: identity.proofId, status: "post_storage_failure", fetchImpl }).catch(() => null);
    return { ok: false, deduped: false, proofId: identity.proofId, state: "manual_review", error: clean(error?.message || error), replyText: MANUAL_SLIP_ACK };
  }
}
