export * from "./line-payment-slip-intake-core.mjs";

import * as core from "./line-payment-slip-intake-core.mjs";
import { inferMembershipPayment, membershipInferenceLabel } from "../../../shared/payment-intelligence.mjs";

const clean = (value) => (value == null ? "" : String(value).trim());
const numeric = (value) => {
  if (value == null || clean(value) === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const near = (a, b, tolerance = 0.01) => {
  const x = numeric(a);
  const y = numeric(b);
  return x != null && y != null && Math.abs(x - y) <= tolerance;
};
const uniq = (values) => [...new Set(values.filter(Boolean))];
const linkedIds = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const formulaValue = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const NON_PAYMENT_CLASSES = new Set(["model_profile_photo", "person_photo", "chat_screenshot", "receipt_invoice", "other_image", "non_payment_image"]);
const PAYMENT_CLASSES = new Set(["bank_transfer_slip", "payment_slip", "bank_receipt"]);

function normalizeImageClass(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

async function callVisualClassifier({ env, image, fetchImpl }) {
  const url = clean(env.LINE_SLIP_IMAGE_CLASSIFIER_URL);
  if (!url) return null;
  try {
    const token = clean(env.LINE_SLIP_IMAGE_CLASSIFIER_TOKEN || env.LINE_SLIP_EXTRACTOR_TOKEN);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": image.mimeType,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "x-mmd-classifier-purpose": "payment-evidence-gate",
      },
      body: image.body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    const source = payload?.result && typeof payload.result === "object" ? payload.result : payload;
    const imageClass = normalizeImageClass(source.image_class || source.class || source.label || source.category);
    const confidence = Math.max(0, Math.min(1, numeric(source.confidence_score ?? source.confidence) || 0));
    if (!imageClass) return null;
    return { image_class: imageClass, confidence, source: "visual_classifier" };
  } catch {
    return null;
  }
}

export async function classifyPaymentImageEvidence({ env = {}, image, extraction = {}, fetchImpl = fetch }) {
  const external = image ? await callVisualClassifier({ env, image, fetchImpl }) : null;
  const hasRef = Boolean(clean(extraction.payment_ref));
  const hasAmount = numeric(extraction.amount_thb) != null;
  const hasTransferTime = Boolean(clean(extraction.paid_at));
  const hasBankSignal = Boolean(clean(extraction.sender_bank || extraction.receiver_bank || extraction.provider));
  const hasPayer = Boolean(clean(extraction.payer_name));
  const strongTransaction = hasRef && hasAmount;
  const strongSlipShape = hasAmount && hasTransferTime && (hasBankSignal || hasPayer);

  if (external && external.confidence >= 0.8) {
    if (NON_PAYMENT_CLASSES.has(external.image_class)) {
      return { ...external, is_payment_evidence: false, gate: "reject", reason: "visual_non_payment" };
    }
    if (external.image_class === "payment_qr_request") {
      return { ...external, is_payment_evidence: false, gate: "reject", reason: "payment_request_not_transfer" };
    }
    if (PAYMENT_CLASSES.has(external.image_class)) {
      if (strongTransaction || strongSlipShape) return { ...external, is_payment_evidence: true, gate: "accept", reason: "visual_and_transaction_evidence" };
      return { ...external, is_payment_evidence: false, gate: "hold", reason: "visual_slip_without_transaction_evidence" };
    }
  }

  if (strongTransaction) {
    return { image_class: "bank_transfer_slip", confidence: Math.max(0.96, numeric(extraction.confidence_score) || 0), source: "transaction_extraction", is_payment_evidence: true, gate: "accept", reason: "payment_ref_and_amount" };
  }
  if (hasRef && (hasTransferTime || hasBankSignal || hasPayer)) {
    return { image_class: "bank_transfer_slip", confidence: 0.93, source: "transaction_extraction", is_payment_evidence: true, gate: "accept", reason: "payment_ref_plus_transfer_signal" };
  }
  if (strongSlipShape) {
    return { image_class: "bank_transfer_slip", confidence: 0.88, source: "transaction_extraction", is_payment_evidence: true, gate: "accept", reason: "amount_time_bank_signal" };
  }
  if (clean(extraction.extraction_method) === "qr" && !hasRef) {
    return { image_class: "payment_qr_request", confidence: 0.9, source: "transaction_extraction", is_payment_evidence: false, gate: "reject", reason: "qr_without_transaction_ref" };
  }
  return { image_class: external?.image_class || "uncertain", confidence: external?.confidence || 0, source: external?.source || "transaction_extraction", is_payment_evidence: false, gate: "hold", reason: "insufficient_transaction_evidence" };
}

async function airtableRequest({ env, table, recordId = "", query = {}, init = {}, fetchImpl = fetch }) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!baseId || !token || !table) return null;
  const suffix = recordId ? `/${encodeURIComponent(recordId)}` : "";
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}${suffix}`);
  for (const [key, value] of Object.entries(query || {})) if (value != null && value !== "") url.searchParams.set(key, String(value));
  const response = await fetchImpl(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function queryRecords({ env, table, formula, maxRecords = 20, fetchImpl = fetch }) {
  const payload = await airtableRequest({ env, table, query: { maxRecords, ...(formula ? { filterByFormula: formula } : {}) }, fetchImpl });
  return Array.isArray(payload?.records) ? payload.records : [];
}

async function getRecord({ env, table, id, fetchImpl = fetch }) {
  if (!id) return null;
  return airtableRequest({ env, table, recordId: id, fetchImpl });
}

async function uniqueByFormula({ env, table, formula, fetchImpl = fetch }) {
  const found = await queryRecords({ env, table, formula, maxRecords: 2, fetchImpl });
  return { record: found.length === 1 ? found[0] : null, ambiguous: found.length > 1 };
}

function clientLabel(record) {
  const f = record?.fields || {};
  return clean(f.client_name || f.display_name || f["Client Name"] || f.Name || f.name || f.Nickname || f.nickname);
}

function sessionAmounts(record) {
  const f = record?.fields || {};
  const total = numeric(f["Total Amount"] ?? f.final_price_thb ?? f.amount_thb ?? f.total_amount_thb);
  const balance = numeric(f.balance_due_calc ?? f.customer_amount_due_thb ?? f["Remain to Pay"] ?? f.balance_due);
  const received = numeric(f.paid_received_sum ?? f.paid_total ?? f["Paid Total"]) || 0;
  return { total, balance, received };
}

function scoreSession(record, amountThb, explicitTip = false) {
  const amount = numeric(amountThb);
  if (amount == null || !record) return null;
  const f = record.fields || {};
  const { total, balance, received } = sessionAmounts(record);
  const sessionId = clean(f.session_id);
  const jobId = clean(f.job_id);
  const state = clean(f.session_state || f["Session Status"] || f.status).toLowerCase();
  const activeBoost = /(pending|confirm|book|active|upcoming|scheduled|ready|deposit|await)/i.test(state) ? 0.015 : 0;

  if (explicitTip && sessionId) {
    return { stage: "tips", label: "Tip / ทิป", confidence: 0.92 + activeBoost, basis: "explicit_tip_context", session_id: sessionId, job_id: jobId };
  }
  if (balance != null && balance > 0 && near(amount, balance)) {
    return { stage: "final", label: "ค่าจบงาน / ยอดคงเหลือ", confidence: Math.min(0.995, 0.98 + activeBoost), basis: "amount_matches_balance_due", session_id: sessionId, job_id: jobId };
  }
  if (total != null && total > 0 && near(amount, total) && received <= 0.01) {
    return { stage: "full", label: "จ่ายเต็ม", confidence: Math.min(0.985, 0.955 + activeBoost), basis: "amount_matches_session_total", session_id: sessionId, job_id: jobId };
  }
  if (total != null && total > 0 && received <= 0.01) {
    const ratio = amount / total;
    const commonDeposit = [0.2, 0.25, 0.3, 0.5].some((target) => Math.abs(ratio - target) <= 0.015);
    if (commonDeposit) {
      return { stage: "deposit", label: "ค่าจอง / มัดจำ", confidence: Math.min(0.94, 0.89 + activeBoost), basis: `deposit_ratio_${Math.round(ratio * 100)}`, session_id: sessionId, job_id: jobId };
    }
  }
  return null;
}

export function inferServicePaymentPurpose({ amount_thb, sessions = [], context = [] } = {}) {
  const text = (Array.isArray(context) ? context : [context]).join(" ");
  const explicitTip = /(\btip\b|\btips\b|ทิป|ค่าทิป)/i.test(text);
  const ranked = sessions.map((record) => ({ record, score: scoreSession(record, amount_thb, explicitTip) })).filter((item) => item.score).sort((a, b) => b.score.confidence - a.score.confidence);
  if (!ranked.length) return null;
  const top = ranked[0];
  const second = ranked[1];
  if (second && second.score.confidence >= top.score.confidence - 0.02 && second.record.id !== top.record.id) {
    return {
      schema: "mmd_payment_intelligence_v2",
      inferred_stage: "unknown",
      inferred_label: "ต้องตรวจประเภทเงิน",
      confidence: Math.min(top.score.confidence, 0.6),
      ambiguous: true,
      match_basis: "multiple_session_candidates",
      session_record_id: null,
      official_verification_required: true,
    };
  }
  return {
    schema: "mmd_payment_intelligence_v2",
    inferred_stage: top.score.stage,
    inferred_label: top.score.label,
    confidence: top.score.confidence,
    ambiguous: false,
    match_basis: top.score.basis,
    session_record_id: top.record.id,
    session_id: top.score.session_id || null,
    job_id: top.score.job_id || null,
    official_verification_required: true,
    may_mark_paid: false,
  };
}

function choosePaymentIntelligence({ membership, service }) {
  if (service?.ambiguous) {
    if (membership && membership.confidence >= 0.94) return { ...membership, inferred_label: membershipInferenceLabel(membership), selection_basis: "membership_stronger_than_ambiguous_service" };
    return service;
  }
  if (service && membership) {
    if (service.confidence >= 0.95) return service;
    if (membership.confidence >= service.confidence + 0.04) return { ...membership, inferred_label: membershipInferenceLabel(membership), selection_basis: "membership_confidence" };
    return {
      schema: "mmd_payment_intelligence_v2",
      inferred_stage: "unknown",
      inferred_label: "ต้องตรวจประเภทเงิน",
      confidence: Math.max(service.confidence, membership.confidence) - 0.2,
      ambiguous: true,
      match_basis: "membership_service_collision",
      candidates: [membershipInferenceLabel(membership), service.inferred_label],
      official_verification_required: true,
    };
  }
  if (service) return service;
  if (membership) return { ...membership, inferred_label: membershipInferenceLabel(membership), selection_basis: "membership_amount_and_identity" };
  return {
    schema: "mmd_payment_intelligence_v2",
    inferred_stage: "unknown",
    inferred_label: "ยังระบุประเภทเงินไม่ได้",
    confidence: 0,
    ambiguous: false,
    match_basis: "no_supported_payment_purpose",
    official_verification_required: true,
  };
}

function recommendedReason({ intelligence, member, client, extraction }) {
  const parts = [];
  if (intelligence?.inferred_label) parts.push(intelligence.inferred_label);
  if (client) parts.push(`ลูกค้า ${clientLabel(client) || "matched"}`);
  else if (member) parts.push("สมาชิกตรงกับ LINE");
  if (numeric(extraction?.amount_thb) != null) parts.push(`${Number(extraction.amount_thb).toLocaleString("th-TH")} บาท`);
  if (clean(extraction?.payment_ref)) parts.push("มีเลขอ้างอิง");
  return parts.length ? `ระบบตรวจแล้ว · ${parts.join(" · ")}` : "ระบบยังจับคู่ข้อมูลการชำระเงินไม่ครบ";
}

async function enrichCreatedProof({ env, identity, extraction, classification, result, fetchImpl = fetch, now = new Date() }) {
  if (!result?.proofId) return result;
  const proofTable = env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs";
  const memberTable = env.AIRTABLE_TABLE_MEMBERS || "Members";
  const clientTable = env.AIRTABLE_TABLE_CLIENTS || "Clients";
  const sessionTable = env.AIRTABLE_TABLE_SESSIONS || "Sessions";
  const renewalTable = env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || "MMD — LIFF Renewal Sessions";

  const proofLookup = await uniqueByFormula({ env, table: proofTable, formula: `{proof_id}='${formulaValue(result.proofId)}'`, fetchImpl });
  const proof = proofLookup.record;
  if (!proof?.id) return result;

  let note = {};
  try { note = JSON.parse(clean(proof.fields?.note) || "{}"); } catch { note = {}; }
  const existingLinks = note?.links && typeof note.links === "object" ? note.links : {};

  let memberLookup = { record: null, ambiguous: false };
  let clientLookup = { record: null, ambiguous: false };
  if (identity.lineUserId) {
    [memberLookup, clientLookup] = await Promise.all([
      uniqueByFormula({ env, table: memberTable, formula: `{line_id}='${formulaValue(identity.lineUserId)}'`, fetchImpl }),
      uniqueByFormula({ env, table: clientTable, formula: `{line_user_id}='${formulaValue(identity.lineUserId)}'`, fetchImpl }),
    ]);
  }

  let member = memberLookup.record;
  const client = clientLookup.record;
  if (!member && client) {
    const cf = client.fields || {};
    const directMemberId = uniq([
      ...linkedIds(cf.Member), ...linkedIds(cf.Members), ...linkedIds(cf["MMD Members"]), ...linkedIds(cf.member),
    ])[0];
    if (directMemberId) member = await getRecord({ env, table: memberTable, id: directMemberId, fetchImpl });
    if (!member && clean(cf["MMD Member ID"])) {
      const byMemberId = await uniqueByFormula({ env, table: memberTable, formula: `{member_id}='${formulaValue(cf["MMD Member ID"])}'`, fetchImpl });
      member = byMemberId.record;
    }
  }

  let renewalLookup = { record: null, ambiguous: false };
  if (identity.lineUserId) {
    const amountClause = numeric(extraction.amount_thb) == null ? "" : `,{renewal_amount_thb}=${Number(extraction.amount_thb)}`;
    renewalLookup = await uniqueByFormula({ env, table: renewalTable, formula: `AND({line_user_id}='${formulaValue(identity.lineUserId)}'${amountClause})`, fetchImpl });
  }
  const renewal = renewalLookup.record;

  const candidateById = new Map();
  const existingSessionId = clean(existingLinks.session || linkedIds(proof.fields?.session)[0]);
  if (existingSessionId) {
    const record = await getRecord({ env, table: sessionTable, id: existingSessionId, fetchImpl });
    if (record?.id) candidateById.set(record.id, record);
  }
  if (identity.lineUserId) {
    const directSessions = await queryRecords({ env, table: sessionTable, formula: `{line_user_id}='${formulaValue(identity.lineUserId)}'`, maxRecords: 20, fetchImpl });
    for (const record of directSessions) candidateById.set(record.id, record);
  }
  if (client) {
    const cf = client.fields || {};
    const sessionIds = uniq([...linkedIds(cf.Sessions), ...linkedIds(cf.Sessions_v2), ...linkedIds(cf["Sessions V2"])]).slice(0, 20);
    for (const id of sessionIds) {
      if (candidateById.has(id)) continue;
      const record = await getRecord({ env, table: sessionTable, id, fetchImpl });
      if (record?.id) candidateById.set(record.id, record);
    }
  }

  const context = identity.lineUserId ? await core.loadRecentPaymentContext({ env, lineUserId: identity.lineUserId, fetchImpl, now }).catch(() => []) : [];
  const service = inferServicePaymentPurpose({ amount_thb: extraction.amount_thb, sessions: [...candidateById.values()], context });
  const membership = inferMembershipPayment({
    amount_thb: extraction.amount_thb,
    linked_member: Boolean(member?.id),
    linked_renewal: Boolean(renewal?.id || existingLinks.renewal),
    source_context: "line_ofc_payment_proof_v2",
  });
  const intelligence = choosePaymentIntelligence({ membership, service });

  const selectedSessionId = intelligence.inferred_stage !== "membership" && !intelligence.ambiguous ? clean(intelligence.session_record_id) : "";
  const mergedLinks = {
    ...existingLinks,
    member: clean(existingLinks.member || member?.id),
    session: clean(existingLinks.session || selectedSessionId),
    renewal: clean(existingLinks.renewal || renewal?.id),
  };

  const missing = [];
  if (!member?.id && !client?.id) missing.push("canonical_customer");
  if (!clean(extraction.payment_ref)) missing.push("payment_ref");
  if (numeric(extraction.amount_thb) == null) missing.push("amount");
  if (intelligence.inferred_stage === "unknown") missing.push("payment_purpose");
  if (["deposit", "final", "full", "tips"].includes(intelligence.inferred_stage) && !mergedLinks.session) missing.push("session");

  const reviewSummary = {
    image_class: classification.image_class,
    customer_match: member?.id ? "member" : client?.id ? "client" : "unmatched",
    client_name: clientLabel(client) || null,
    payment_stage: intelligence.inferred_stage,
    payment_label: intelligence.inferred_label,
    confidence: intelligence.confidence,
    missing,
    recommended_admin_reason: recommendedReason({ intelligence, member, client, extraction }),
  };

  const nextNote = {
    ...note,
    schema: "line_ofc_payment_proof_v2",
    image_classification: classification,
    client_match: {
      status: clientLookup.ambiguous || memberLookup.ambiguous ? "ambiguous" : member?.id || client?.id ? "matched" : "unmatched",
      client_record_id: client?.id || null,
      member_record_id: member?.id || null,
      source: member?.id ? "members.line_id" : client?.id ? "clients.line_user_id" : null,
    },
    links: mergedLinks,
    payment_intelligence: intelligence,
    review_summary: reviewSummary,
  };

  const fields = { note: JSON.stringify(nextNote) };
  if (member?.id) fields.member = [member.id];
  if (mergedLinks.session) fields.session = [mergedLinks.session];
  if (mergedLinks.renewal) fields["MMD — LIFF Renewal Sessions"] = [mergedLinks.renewal];

  await airtableRequest({ env, table: proofTable, recordId: proof.id, init: { method: "PATCH", body: JSON.stringify({ fields }) }, fetchImpl });
  return {
    ...result,
    imageClassification: classification,
    paymentIntelligence: intelligence,
    matchedMember: Boolean(member?.id),
    matchedClient: Boolean(client?.id),
    matchedSession: Boolean(mergedLinks.session),
  };
}

export async function processPaymentSlipImage({ env, event, fetchImpl = fetch, now = new Date() }) {
  const identity = core.buildProofIdentity(event);
  let image;
  let extraction;
  try {
    image = await core.downloadLineImage({ accessToken: env.LINE_CHANNEL_ACCESS_TOKEN, messageId: identity.messageId, maxBytes: env.LINE_SLIP_MAX_IMAGE_BYTES, fetchImpl });
    extraction = await core.extractPaymentSlip({ env, image, fetchImpl });
  } catch {
    return core.processPaymentSlipImage({ env, event, fetchImpl, now });
  }

  const classification = await classifyPaymentImageEvidence({ env, image, extraction, fetchImpl });
  if (!classification.is_payment_evidence) {
    return {
      ok: true,
      deduped: false,
      ignored: true,
      proofId: identity.proofId,
      state: classification.gate === "reject" ? "ignored_non_payment_image" : "held_uncertain_image",
      reviewRequired: false,
      imageClassification: classification,
      extractionMethod: extraction.extraction_method,
      replyText: "",
    };
  }

  const result = await core.processPaymentSlipImage({ env, event, fetchImpl, now });
  if (!result?.ok || result?.deduped || !result?.proofId) return { ...result, imageClassification: classification };
  try {
    return await enrichCreatedProof({ env, identity, extraction, classification, result, fetchImpl, now });
  } catch {
    return { ...result, imageClassification: classification, enrichment_state: "review_required" };
  }
}
