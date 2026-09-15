import { classifyPaymentOpsRoute, inferMembershipPayment, membershipInferenceLabel } from "../../shared/payment-intelligence.mjs";

const clean = (value) => String(value ?? "").trim();
const numberOrNull = (value) => {
  if (value == null || clean(value) === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const near = (a, b, tolerance = 0.01) => {
  const left = numberOrNull(a);
  const right = numberOrNull(b);
  return left != null && right != null && Math.abs(left - right) <= tolerance;
};
const linkedIds = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const unique = (values) => [...new Set(values.filter(Boolean))];
const formulaValue = (value) => clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function normalizeExtraction(payload, method) {
  const source = payload?.result && typeof payload.result === "object" ? payload.result : payload || {};
  const amount = numberOrNull(source.amount_thb ?? source.amount);
  const confidence = Math.max(0, Math.min(1, numberOrNull(source.confidence_score ?? source.confidence) || 0));
  return {
    payment_ref: clean(source.payment_ref || source.provider_txn_id || source.transaction_ref),
    amount_thb: amount != null && amount > 0 ? amount : null,
    paid_at: clean(source.paid_at || source.transfer_at),
    payer_name: clean(source.payer_name || source.sender_name),
    sender_bank: clean(source.sender_bank),
    receiver_bank: clean(source.receiver_bank),
    provider: clean(source.provider || source.bank),
    confidence_score: confidence,
    extraction_method: method,
    extraction_error: "",
  };
}

async function callExtractor(env, image, route, method) {
  if (!env.SLIP_EXTRACTOR || typeof env.SLIP_EXTRACTOR.fetch !== "function") {
    return { ok: false, error: "extractor_binding_missing", result: null };
  }
  try {
    const response = await env.SLIP_EXTRACTOR.fetch(new Request(`https://mmd-slip-extractor${route}`, {
      method: "POST",
      headers: {
        "content-type": image.mimeType,
        "content-length": String(image.byteSize || image.body?.byteLength || 0),
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
        "x-request-id": `line-${crypto.randomUUID()}`,
      },
      body: image.body,
    }));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: `extractor_${response.status}`, result: null };
    return { ok: true, error: "", result: normalizeExtraction(payload, method) };
  } catch {
    return { ok: false, error: "extractor_failed", result: null };
  }
}

export async function extractPaymentEvidence(env = {}, image = {}) {
  const qr = await callExtractor(env, image, "/v1/extract/qr", "qr");
  if (qr.ok && clean(qr.result?.payment_ref)) return qr.result;

  const ocr = await callExtractor(env, image, "/v1/extract/ocr", "ocr");
  if (ocr.ok) {
    const result = ocr.result || {};
    if (result.payment_ref || result.amount_thb != null || result.paid_at || result.payer_name || result.sender_bank || result.receiver_bank) return result;
  }

  if (qr.ok && qr.result?.amount_thb != null) {
    return { ...qr.result, extraction_method: "qr", extraction_error: ocr.error || "" };
  }

  return {
    payment_ref: "", amount_thb: null, paid_at: "", payer_name: "", sender_bank: "", receiver_bank: "", provider: "",
    confidence_score: 0,
    extraction_method: ocr.ok ? "ocr" : qr.ok ? "qr" : "none",
    extraction_error: [qr.error, ocr.error].filter(Boolean).join(","),
  };
}

export function classifyPaymentImageEvidence(extraction = {}) {
  const hasRef = Boolean(clean(extraction.payment_ref));
  const hasAmount = numberOrNull(extraction.amount_thb) != null;
  const hasTime = Boolean(clean(extraction.paid_at));
  const hasBank = Boolean(clean(extraction.sender_bank || extraction.receiver_bank || extraction.provider));
  const hasPayer = Boolean(clean(extraction.payer_name));
  const hasUseful = hasRef || hasAmount || hasTime || hasBank || hasPayer;

  if (hasRef && hasAmount) return { image_class: "bank_transfer_slip", gate: "accept", is_payment_evidence: true, confidence: Math.max(0.96, Number(extraction.confidence_score) || 0), reason: "payment_ref_and_amount" };
  if (hasRef && (hasTime || hasBank || hasPayer)) return { image_class: "bank_transfer_slip", gate: "accept", is_payment_evidence: true, confidence: 0.93, reason: "payment_ref_plus_transfer_signal" };
  if (hasAmount && hasTime && (hasBank || hasPayer)) return { image_class: "bank_transfer_slip", gate: "accept", is_payment_evidence: true, confidence: 0.88, reason: "amount_time_transfer_signal" };
  if (clean(extraction.extraction_method) === "qr" && hasAmount && !hasRef) return { image_class: "payment_qr_request", gate: "reject", is_payment_evidence: false, confidence: 0.95, reason: "payment_request_not_completed_transfer" };
  if (!hasUseful && clean(extraction.extraction_error)) return { image_class: "uncertain", gate: "hold", is_payment_evidence: false, confidence: 0, reason: "extractor_unavailable_or_failed" };
  if (!hasUseful) return { image_class: "non_payment_image", gate: "reject", is_payment_evidence: false, confidence: 0.92, reason: "no_transaction_evidence_detected" };
  return { image_class: "uncertain_payment_image", gate: "hold", is_payment_evidence: false, confidence: Number(extraction.confidence_score) || 0.3, reason: "insufficient_transaction_evidence" };
}

async function airtableRequest(env, table, { recordId = "", formula = "", maxRecords = 20 } = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!baseId || !token || !table) return null;
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`);
  if (formula) url.searchParams.set("filterByFormula", formula);
  if (!recordId) url.searchParams.set("maxRecords", String(maxRecords));
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function queryRecords(env, table, formula, maxRecords = 20) {
  const payload = await airtableRequest(env, table, { formula, maxRecords });
  return Array.isArray(payload?.records) ? payload.records : [];
}

async function uniqueRecord(env, table, formula) {
  const records = await queryRecords(env, table, formula, 2);
  return { record: records.length === 1 ? records[0] : null, ambiguous: records.length > 1 };
}

async function getRecord(env, table, id) {
  return id ? airtableRequest(env, table, { recordId: id }) : null;
}

function clientLabel(record) {
  const f = record?.fields || {};
  return clean(f["Client Name"] || f.client_name || f.display_name || f.line_display_name || f.Name || f.name || f.nickname);
}

function sessionAmounts(record) {
  const f = record?.fields || {};
  return {
    total: numberOrNull(f["Total Amount"] ?? f.final_price_thb ?? f.amount_thb ?? f.total_amount_thb),
    balance: numberOrNull(f.balance_due_calc ?? f.customer_amount_due_thb ?? f["Remain to Pay"] ?? f.balance_due),
    received: numberOrNull(f.paid_received_sum ?? f.paid_total ?? f["Paid Total"]) || 0,
  };
}

function scoreSession(record, amountThb, explicitTip) {
  const amount = numberOrNull(amountThb);
  if (amount == null || !record) return null;
  const f = record.fields || {};
  const { total, balance, received } = sessionAmounts(record);
  const sessionId = clean(f.session_id);
  const jobId = clean(f.job_id);
  const state = clean(f.session_state || f["Session Status"] || f.status).toLowerCase();
  const boost = /(pending|confirm|book|active|upcoming|scheduled|ready|deposit|await)/i.test(state) ? 0.015 : 0;
  if (explicitTip && sessionId) return { stage: "tips", label: "Tip / ทิป", confidence: 0.92 + boost, basis: "explicit_tip_context", session_id: sessionId, job_id: jobId };
  if (balance != null && balance > 0 && near(amount, balance)) return { stage: "final", label: "ค่าจบงาน / ยอดคงเหลือ", confidence: Math.min(0.995, 0.98 + boost), basis: "amount_matches_balance_due", session_id: sessionId, job_id: jobId };
  if (total != null && total > 0 && near(amount, total) && received <= 0.01) return { stage: "full", label: "จ่ายเต็ม", confidence: Math.min(0.985, 0.955 + boost), basis: "amount_matches_session_total", session_id: sessionId, job_id: jobId };
  if (total != null && total > 0 && received <= 0.01) {
    const ratio = amount / total;
    if ([0.2, 0.25, 0.3, 0.5].some((target) => Math.abs(ratio - target) <= 0.015)) return { stage: "deposit", label: "ค่าจอง / มัดจำ", confidence: Math.min(0.94, 0.89 + boost), basis: `deposit_ratio_${Math.round(ratio * 100)}`, session_id: sessionId, job_id: jobId };
  }
  return null;
}

export function inferServicePaymentPurpose({ amount_thb, sessions = [], context_text = "" } = {}) {
  const explicitTip = /(\btip\b|\btips\b|ทิป|ค่าทิป)/i.test(clean(context_text));
  const ranked = sessions.map((record) => ({ record, score: scoreSession(record, amount_thb, explicitTip) })).filter((item) => item.score).sort((a, b) => b.score.confidence - a.score.confidence);
  if (!ranked.length) return null;
  const [top, second] = ranked;
  if (second && second.score.confidence >= top.score.confidence - 0.02 && second.record.id !== top.record.id) return { inferred_stage: "unknown", inferred_label: "ต้องตรวจประเภทเงิน", confidence: 0.6, ambiguous: true, match_basis: "multiple_session_candidates", session_record_id: null };
  return { inferred_stage: top.score.stage, inferred_label: top.score.label, confidence: top.score.confidence, ambiguous: false, match_basis: top.score.basis, session_record_id: top.record.id, session_id: top.score.session_id || null, job_id: top.score.job_id || null };
}

function choosePurpose({ membership, service, contextText, renewal }) {
  const membershipText = /(?:ค่าสมาชิก|ต่ออายุ(?:สมาชิก)?|สมัคร(?:สมาชิก)?|membership|renewal|renew\b|mmd\s*member|elite|red\s*card|private\s*(?:standard|premium))/i.test(clean(contextText));
  const serviceText = /(?:มัดจำ|ยอดคงเหลือ|ค่าบริการ|ค่างาน|ค่าจบ|deposit|balance|service\s*fee|booking|final\s*payment|tips?)/i.test(clean(contextText));
  if (service?.ambiguous) return service;
  if (service && membership && membershipText && serviceText) return { inferred_stage: "unknown", inferred_label: "ต้องตรวจประเภทเงิน", confidence: 0.65, ambiguous: true, match_basis: "membership_service_context_collision" };
  if (membership && (membershipText || renewal?.id) && !serviceText) return { ...membership, inferred_label: membershipInferenceLabel(membership), ambiguous: false, match_basis: renewal?.id ? "renewal_record_match" : "explicit_membership_context" };
  if (service && service.confidence >= 0.9) return service;
  if (membership && membership.confidence >= 0.9) return { ...membership, inferred_label: membershipInferenceLabel(membership), ambiguous: false, match_basis: "membership_amount_identity_match" };
  return service || (membership ? { ...membership, inferred_label: membershipInferenceLabel(membership), ambiguous: false, match_basis: "membership_amount_candidate" } : null);
}

export async function analyzeProductionPaymentProof({ env = {}, image, lineUserId = "", contextText = "" } = {}) {
  const extraction = await extractPaymentEvidence(env, image);
  const classification = classifyPaymentImageEvidence(extraction);
  if (!classification.is_payment_evidence) return { accepted: false, extraction, classification, links: {}, customer: null, payment_intelligence: null, review_summary: null, ops_route: null };

  const membersTable = clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || "Members");
  const clientsTable = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || "Clients");
  const sessionsTable = clean(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || "Sessions");
  const renewalsTable = clean(env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || "MMD — LIFF Renewal Sessions");

  let memberLookup = { record: null, ambiguous: false };
  let clientLookup = { record: null, ambiguous: false };
  if (clean(lineUserId)) {
    [memberLookup, clientLookup] = await Promise.all([
      uniqueRecord(env, membersTable, `{line_id}='${formulaValue(lineUserId)}'`),
      uniqueRecord(env, clientsTable, `{line_user_id}='${formulaValue(lineUserId)}'`),
    ]);
  }
  let member = memberLookup.record;
  const client = clientLookup.record;
  if (!member && client) {
    const cf = client.fields || {};
    const directMemberId = unique([...linkedIds(cf.Member), ...linkedIds(cf.Members), ...linkedIds(cf["MMD Members"]), ...linkedIds(cf.member)])[0];
    if (directMemberId) member = await getRecord(env, membersTable, directMemberId);
    if (!member && clean(cf["MMD Member ID"])) member = (await uniqueRecord(env, membersTable, `{member_id}='${formulaValue(cf["MMD Member ID"])}'`)).record;
  }

  let renewal = null;
  if (clean(lineUserId)) {
    const amountClause = extraction.amount_thb == null ? "" : `,{renewal_amount_thb}=${Number(extraction.amount_thb)}`;
    renewal = (await uniqueRecord(env, renewalsTable, `AND({line_user_id}='${formulaValue(lineUserId)}'${amountClause})`)).record;
  }

  const sessionMap = new Map();
  if (clean(lineUserId)) for (const record of await queryRecords(env, sessionsTable, `{line_user_id}='${formulaValue(lineUserId)}'`, 20)) sessionMap.set(record.id, record);
  if (client) {
    const cf = client.fields || {};
    for (const id of unique([...linkedIds(cf.Sessions), ...linkedIds(cf.Sessions_v2), ...linkedIds(cf["Sessions V2"])]).slice(0, 20)) {
      if (sessionMap.has(id)) continue;
      const record = await getRecord(env, sessionsTable, id);
      if (record?.id) sessionMap.set(record.id, record);
    }
  }

  const service = inferServicePaymentPurpose({ amount_thb: extraction.amount_thb, sessions: [...sessionMap.values()], context_text: contextText });
  const membership = inferMembershipPayment({ amount_thb: extraction.amount_thb, linked_member: Boolean(member?.id), linked_renewal: Boolean(renewal?.id), source_context: "line_ofc_cloudflare_payment_proof" });
  const intelligence = choosePurpose({ membership, service, contextText, renewal }) || { inferred_stage: "unknown", inferred_label: "ยังระบุประเภทเงินไม่ได้", confidence: 0, ambiguous: false, match_basis: "no_supported_payment_purpose" };
  const sessionRecordId = !intelligence.ambiguous && ["deposit", "final", "full", "tips"].includes(clean(intelligence.inferred_stage)) ? clean(intelligence.session_record_id) : "";
  const links = { member: clean(member?.id), client: clean(client?.id), renewal: clean(renewal?.id), session: sessionRecordId };
  const missing = [];
  if (!links.member && !links.client) missing.push("canonical_customer");
  if (!clean(extraction.payment_ref)) missing.push("payment_ref");
  if (extraction.amount_thb == null) missing.push("amount");
  if (clean(intelligence.inferred_stage) === "unknown") missing.push("payment_purpose");
  if (["deposit", "final", "full", "tips"].includes(clean(intelligence.inferred_stage)) && !links.session) missing.push("session");

  const opsRoute = classifyPaymentOpsRoute({ payment_stage: intelligence.inferred_stage, amount_thb: extraction.amount_thb, linked_member: Boolean(links.member), linked_renewal: Boolean(links.renewal), package_code: intelligence.inferred_package_code || "", source_context: "line_ofc_cloudflare_payment_proof", context_text: contextText });
  const reasonParts = [intelligence.inferred_label];
  if (client) reasonParts.push(`ลูกค้า ${clientLabel(client) || "matched"}`);
  else if (member) reasonParts.push("สมาชิกตรงกับ LINE");
  if (extraction.amount_thb != null) reasonParts.push(`${Number(extraction.amount_thb).toLocaleString("th-TH")} บาท`);
  if (clean(extraction.payment_ref)) reasonParts.push("มีเลขอ้างอิง");

  return {
    accepted: true,
    extraction,
    classification,
    links,
    customer: { status: memberLookup.ambiguous || clientLookup.ambiguous ? "ambiguous" : links.member || links.client ? "matched" : "unmatched", member_record_id: links.member || null, client_record_id: links.client || null, display_name: clientLabel(client) || null, source: links.member ? "members.line_id" : links.client ? "clients.line_user_id" : null },
    payment_intelligence: { ...intelligence, official_verification_required: true, may_mark_paid: false },
    review_summary: { image_class: classification.image_class, customer_match: links.member ? "member" : links.client ? "client" : "unmatched", client_name: clientLabel(client) || null, payment_stage: intelligence.inferred_stage, payment_label: intelligence.inferred_label, confidence: intelligence.confidence, missing, recommended_admin_reason: reasonParts.filter(Boolean).length ? `ระบบตรวจแล้ว · ${reasonParts.filter(Boolean).join(" · ")}` : "ระบบยังจับคู่ข้อมูลการชำระเงินไม่ครบ" },
    ops_route: opsRoute,
  };
}
