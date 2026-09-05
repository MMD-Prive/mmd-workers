const API_PREFIX = "/v1/admin/payments/historical-backfill";
const INTAKE_PATH = `${API_PREFIX}/intake`;
const REVIEW_PATH = `${API_PREFIX}/review`;
const SCHEMA = "mmd_historical_slip_backfill_v1";
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_AMOUNT_THB = 10_000_000;
const PAYMENT_STAGES = new Set(["deposit", "final", "tips", "full", "membership"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isHistoricalSlipBackfillRequest(path, method = "GET") {
  const normalized = normalizePath(path);
  const verb = String(method || "GET").toUpperCase();
  if (normalized === API_PREFIX) return verb === "GET" || verb === "OPTIONS";
  if (normalized === INTAKE_PATH || normalized === REVIEW_PATH) return verb === "POST" || verb === "OPTIONS";
  return false;
}

export async function handleHistoricalSlipBackfillRequest(request, env = {}, ctx = null) {
  const path = normalizePath(new URL(request.url).pathname);
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders() });
  if (!isHistoricalSlipBackfillRequest(path, method)) return json({ ok: false, error: "not_found" }, 404);

  try {
    if (path === API_PREFIX && method === "GET") return listBackfillProofs(request, env);
    if (path === INTAKE_PATH && method === "POST") return ingestHistoricalProof(request, env, ctx);
    if (path === REVIEW_PATH && method === "POST") return reviewHistoricalProof(request, env, ctx);
    return json({ ok: false, error: "method_not_allowed" }, 405);
  } catch (error) {
    return json({
      ok: false,
      error: safeCode(error?.message || error || "historical_slip_backfill_failed"),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

async function listBackfillProofs(request, env) {
  requireAirtable(env);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const formula = `FIND('${formulaValue(`\"schema\":\"${SCHEMA}\"`)}',{note})>0`;
  const records = await airtableList(env, paymentProofTable(env), { filterByFormula: formula, maxRecords: limit });
  const items = records
    .map(safeProofSummary)
    .filter(Boolean)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

  return json({
    ok: true,
    schema: SCHEMA,
    canonical_flow: "LINE Album / archive -> SHA-256 dedupe -> QR/OCR -> match context -> Payment Proof pending -> review -> payments-worker",
    authority: "payments-worker",
    items,
  });
}

async function ingestHistoricalProof(request, env, ctx) {
  requireAirtable(env);
  const contentType = clean(request.headers.get("Content-Type")).toLowerCase();
  if (!contentType.includes("multipart/form-data")) throw httpError(415, "multipart_form_data_required");

  const form = await request.formData();
  const file = form.get("file") || form.get("slip") || form.get("proof");
  if (!file || typeof file.arrayBuffer !== "function") throw httpError(400, "slip_file_required");

  const mimeType = clean(file.type).toLowerCase();
  if (!IMAGE_TYPES.has(mimeType)) throw httpError(415, "unsupported_slip_image_type");
  const maxBytes = Math.min(Math.max(Number(env.HISTORICAL_SLIP_MAX_IMAGE_BYTES) || DEFAULT_MAX_IMAGE_BYTES, 1), 20 * 1024 * 1024);
  if (Number(file.size || 0) > maxBytes) throw httpError(413, "slip_image_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength) throw httpError(400, "slip_image_empty");
  if (bytes.byteLength > maxBytes) throw httpError(413, "slip_image_too_large");

  const sourceType = normalizeSourceType(form.get("source_type"));
  const sourceRef = safeText(form.get("source_ref") || file.name, 300);
  if (!sourceRef) throw httpError(400, "source_ref_required");

  const evidenceSha256 = await sha256Hex(bytes);
  const proofId = `hist_${evidenceSha256.slice(0, 24)}`;
  const duplicate = await findHistoricalDuplicate(env, { proofId, evidenceSha256 });
  if (duplicate) {
    return json({ ok: true, duplicate: true, proof: safeProofSummary(duplicate), state: "pending" }, 200);
  }

  const explicit = {
    payment_ref: safeText(form.get("payment_ref"), 180),
    session_id: safeText(form.get("session_id"), 180),
    line_user_id: safeText(form.get("line_user_id"), 180),
    member_email: normalizeEmail(form.get("member_email")),
    payment_stage: normalizePaymentStage(form.get("payment_stage"), true),
    context_text: safeText(form.get("context_text"), 1000),
  };

  const extraction = await extractSlip(env, { bytes, mimeType });
  const candidate = {
    payment_ref: extraction.payment_ref || explicit.payment_ref,
    session_id: extraction.session_id || explicit.session_id,
    line_user_id: explicit.line_user_id,
    member_email: explicit.member_email,
    payment_stage: extraction.payment_stage || explicit.payment_stage,
    amount_thb: extraction.amount_thb,
    paid_at: extraction.paid_at,
    payer_name: extraction.payer_name,
  };

  const links = await resolveDeterministicLinks(env, candidate);
  const threshold = Math.max(0.5, Math.min(1, Number(env.HISTORICAL_SLIP_CONFIDENCE_THRESHOLD) || 0.85));
  const reconciliationComplete = Boolean(candidate.payment_ref && candidate.amount_thb != null);
  const deterministicMatch = Boolean(links.payment || links.session || links.member || links.client);
  const reviewRequired = Boolean(
    links.ambiguous ||
    extraction.confidence_score < threshold ||
    extraction.extraction_error ||
    !reconciliationComplete ||
    !deterministicMatch
  );

  const note = {
    schema: SCHEMA,
    source_type: sourceType,
    source_ref: sourceRef,
    source_file_name: safeText(file.name, 240),
    evidence_sha256: evidenceSha256,
    byte_size: bytes.byteLength,
    mime_type: mimeType,
    extraction: safeExtractionForNote(extraction),
    explicit_context: compact({
      payment_ref: explicit.payment_ref || null,
      session_id: explicit.session_id || null,
      line_user_id_hash: explicit.line_user_id ? await sha256Hex(new TextEncoder().encode(explicit.line_user_id)) : null,
      member_email: explicit.member_email || null,
      payment_stage: explicit.payment_stage || null,
      context_text: explicit.context_text || null,
    }),
    match: links,
    review_required: reviewRequired,
    review_state: "pending",
    created_at: new Date().toISOString(),
    payments_worker_handoff: stagedHandoff({ proofId, evidenceSha256, candidate, reviewRequired }),
  };

  const fields = {
    proof_id: proofId,
    channel: "line_ofc",
    status: "pending",
    note: JSON.stringify(note),
  };
  if (candidate.payment_ref) fields.payment_ref = candidate.payment_ref;
  if (candidate.amount_thb != null) fields.amount_thb = candidate.amount_thb;
  if (candidate.payer_name) fields.payer_name = candidate.payer_name;
  if (candidate.paid_at && !Number.isNaN(Date.parse(candidate.paid_at))) fields.paid_at = dateOnly(candidate.paid_at);
  if (links.member) fields.member = [links.member];
  if (links.session) fields.session = [links.session];
  if (links.payment) fields.payment = [links.payment];

  const created = await airtableCreate(env, paymentProofTable(env), fields);
  const result = {
    ok: true,
    duplicate: false,
    proof_id: proofId,
    proof_record_id: created.id,
    state: "pending",
    review_required: reviewRequired,
    extraction_method: extraction.extraction_method,
    match: safeMatch(links),
    guardrails: guardrails(),
  };

  const notifyPromise = sourceRef.startsWith("github-actions-controlled-smoke:")
    ? Promise.resolve({ ok: false, skipped: true, reason: "controlled_smoke" })
    : notifyOps(env, {
        title: reviewRequired ? "HISTORICAL SLIP REVIEW REQUIRED" : "HISTORICAL SLIP READY FOR REVIEW",
        proofId,
        amount: candidate.amount_thb,
        paymentRef: candidate.payment_ref,
        sourceRef,
      });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifyPromise.catch(() => null));
  else await notifyPromise.catch(() => null);

  return json(result, 201);
}

async function reviewHistoricalProof(request, env, ctx) {
  requireAirtable(env);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(400, "invalid_review_request");

  const proofId = safeText(body.proof_id, 120);
  const recordId = safeText(body.proof_record_id, 120);
  if (!proofId && !recordId) throw httpError(400, "proof_id_required");
  const proof = await loadHistoricalProof(env, { proofId, recordId });
  if (!proof) throw httpError(404, "historical_proof_not_found");

  const note = parseNote(proof.fields?.note);
  if (note.schema !== SCHEMA) throw httpError(409, "historical_proof_schema_mismatch");
  const reviewState = safeCode(note.review_state || "pending");
  if (reviewState === "processed") {
    return json({ ok: true, duplicate: true, state: "processed", proof_id: proof.fields?.proof_id || proofId, authority: "payments-worker" });
  }
  if (reviewState === "rejected") throw httpError(409, "historical_proof_rejected");
  if (reviewState !== "pending") throw httpError(409, "historical_proof_not_pending_review");

  const decision = safeCode(body.decision);
  const reviewReason = safeText(body.review_reason || body.reason, 600);
  if (!reviewReason || reviewReason.length < 5) throw httpError(400, "review_reason_required");

  if (decision === "validate_handoff") {
    return validateHistoricalHandoff(proof, note, body, env, reviewReason);
  }

  if (decision === "reject") {
    const rejectedAt = new Date().toISOString();
    const nextNote = {
      ...note,
      review_state: "rejected",
      reviewed_at: rejectedAt,
      review_reason: reviewReason,
      reviewed_by: "internal_admin_owner",
    };
    await airtableUpdate(env, paymentProofTable(env), proof.id, { status: "rejected", note: JSON.stringify(nextNote) });
    return json({ ok: true, state: "rejected", proof_id: proof.fields?.proof_id || proofId, authority: "payments-worker", guardrails: guardrails() });
  }

  if (decision !== "approve") throw httpError(400, "decision_must_be_approve_or_reject");

  const paymentRef = safeText(body.payment_ref || proof.fields?.payment_ref || note.extraction?.payment_ref, 180);
  const amountThb = normalizeAmount(body.amount_thb ?? proof.fields?.amount_thb ?? note.extraction?.amount_thb);
  const paymentStage = normalizePaymentStage(body.payment_stage || note.explicit_context?.payment_stage || note.extraction?.payment_stage, false);
  const sessionId = safeText(body.session_id || note.extraction?.session_id || note.payments_worker_handoff?.session_id, 180);
  const memberEmail = normalizeEmail(body.member_email || note.explicit_context?.member_email);
  const packageCode = safeText(body.package_code, 120);
  const overrideReason = safeText(body.override_reason, 600);

  if (!paymentRef) throw httpError(400, "payment_ref_required");
  if (amountThb == null) throw httpError(400, "amount_thb_required");
  if (["deposit", "final", "tips", "full"].includes(paymentStage) && !sessionId) throw httpError(400, "session_id_required_for_service_payment");
  if (paymentStage === "membership" && !memberEmail) throw httpError(400, "member_email_required_for_membership_payment");

  const extractedRef = safeText(note.extraction?.payment_ref, 180);
  const extractedAmount = normalizeAmount(note.extraction?.amount_thb);
  const conflict = Boolean(
    (extractedRef && extractedRef !== paymentRef) ||
    (extractedAmount != null && Math.abs(extractedAmount - amountThb) > 0.009)
  );
  if (conflict && overrideReason.length < 5) throw httpError(409, "override_reason_required_for_extraction_conflict");

  const base = clean(env.PAYMENTS_BASE_URL).replace(/\/+$/, "");
  const serviceToken = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS);
  if (!base) throw httpError(503, "payments_worker_base_url_missing");
  if (!serviceToken) throw httpError(503, "payments_worker_service_auth_missing");

  const handoff = {
    source: "historical_slip_backfill",
    decision: "approved",
    proof_id: safeText(proof.fields?.proof_id || proofId, 120),
    proof_record_id: proof.id,
    evidence_sha256: safeText(note.evidence_sha256, 64),
    payment_ref: paymentRef,
    amount_thb: amountThb,
    payment_stage: paymentStage,
    session_id: sessionId || null,
    member_email: memberEmail || null,
    package_code: packageCode || null,
    paid_at: safeText(body.paid_at || proof.fields?.paid_at || note.extraction?.paid_at, 80) || null,
    review_reason: reviewReason,
    override_reason: overrideReason || null,
    review_actor: "internal_admin_owner",
  };

  const response = await fetch(`${base}/v1/internal/payments/historical-slip/reviewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(handoff),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw httpError(response.status >= 400 ? response.status : 502, safeCode(payload?.error || "payments_worker_handoff_failed"));
  }

  const processedAt = new Date().toISOString();
  const nextNote = {
    ...note,
    review_state: "processed",
    reviewed_at: processedAt,
    review_reason: reviewReason,
    override_reason: overrideReason || null,
    reviewed_by: "internal_admin_owner",
    payments_worker_processed_at: processedAt,
    payments_worker_result: compact({
      payment_ref: safeText(payload.payment_ref, 180),
      payment_stage: safeCode(payload.payment_stage || payload.stage),
      payment_record_id: safeText(payload.payment_write?.record_id || payload.payment_write?.id, 120),
      points_awarded: payload.points_ledger?.awarded === true,
      duplicate: payload.duplicate === true,
    }),
  };
  await airtableUpdate(env, paymentProofTable(env), proof.id, { status: "reviewed", note: JSON.stringify(nextNote) });

  const notifyPromise = notifyOps(env, {
    title: "HISTORICAL SLIP REVIEWED -> PAYMENTS WORKER",
    proofId: handoff.proof_id,
    amount: amountThb,
    paymentRef,
    sourceRef: note.source_ref,
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifyPromise.catch(() => null));
  else await notifyPromise.catch(() => null);

  return json({
    ok: true,
    state: "processed",
    proof_id: handoff.proof_id,
    authority: "payments-worker",
    payment_ref: safeText(payload.payment_ref || paymentRef, 180),
    payment_stage: paymentStage,
    duplicate: payload.duplicate === true,
    guardrails: guardrails(),
  });
}

async function validateHistoricalHandoff(proof, note, body, env, reviewReason) {
  const base = clean(env.PAYMENTS_BASE_URL).replace(/\/+$/, "");
  const serviceToken = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS);
  if (!base) throw httpError(503, "payments_worker_base_url_missing");
  if (!serviceToken) throw httpError(503, "payments_worker_service_auth_missing");

  const proofId = safeText(proof.fields?.proof_id || body.proof_id, 120);
  const evidenceSha256 = safeText(note.evidence_sha256, 64).toLowerCase();
  if (!proofId) throw httpError(400, "proof_id_required");
  if (!/^[a-f0-9]{64}$/.test(evidenceSha256)) throw httpError(409, "historical_proof_sha_invalid_for_handoff_probe");

  // Flip one SHA nibble deliberately. payments-worker must re-read the proof
  // and reject before trusted notify / Money Truth writes are reachable.
  const mismatchedSha256 = (evidenceSha256[0] === "0" ? "1" : "0") + evidenceSha256.slice(1);
  const handoffProbe = {
    source: "historical_slip_backfill",
    decision: "approved",
    proof_id: proofId,
    proof_record_id: proof.id,
    evidence_sha256: mismatchedSha256,
    payment_ref: safeText("MMD_HANDOFF_PROBE_" + proofId, 180),
    amount_thb: 1,
    payment_stage: "membership",
    session_id: null,
    member_email: "historical-handoff-smoke@example.invalid",
    package_code: null,
    paid_at: null,
    review_reason: reviewReason,
    override_reason: null,
    review_actor: "internal_admin_owner",
  };

  const response = await fetch(base + "/v1/internal/payments/historical-slip/reviewed", {
    method: "POST",
    headers: { Authorization: "Bearer " + serviceToken, "Content-Type": "application/json" },
    body: JSON.stringify(handoffProbe),
  });
  const payload = await response.json().catch(() => ({}));
  const expectedRejection = response.status === 409 && safeCode(payload?.error) === "historical_proof_sha_mismatch";
  if (!expectedRejection) {
    throw httpError(502, "handoff_probe_unexpected_" + response.status + "_" + safeCode(payload?.error || "unknown"));
  }

  return json({
    ok: true,
    state: "pending",
    proof_id: proofId,
    authority: "payments-worker",
    handoff_validated: true,
    expected_rejection: "historical_proof_sha_mismatch",
    money_truth_mutated: false,
    guardrails: guardrails(),
  });
}

async function extractSlip(env, image) {
  const token = clean(env.HISTORICAL_SLIP_EXTRACTOR_TOKEN || env.LINE_SLIP_EXTRACTOR_TOKEN);
  const maxAmount = Number(env.HISTORICAL_SLIP_MAX_AMOUNT_THB || env.LINE_SLIP_MAX_AMOUNT_THB) || DEFAULT_MAX_AMOUNT_THB;
  const qrUrl = clean(env.HISTORICAL_SLIP_QR_EXTRACTOR_URL || env.LINE_SLIP_QR_EXTRACTOR_URL);
  const ocrUrl = clean(env.HISTORICAL_SLIP_OCR_EXTRACTOR_URL || env.LINE_SLIP_OCR_EXTRACTOR_URL);

  const qr = await callExtractor({ url: qrUrl, token, image, method: "qr", maxAmount });
  if (clean(qr.result?.payment_ref)) return { ...qr.result, extraction_error: "" };
  const ocr = await callExtractor({ url: ocrUrl, token, image, method: "ocr", maxAmount });
  if (extractionUseful(ocr.result)) return { ...ocr.result, extraction_error: qr.error || "" };

  return {
    payment_ref: "",
    amount_thb: null,
    paid_at: "",
    payer_name: "",
    sender_bank: "",
    receiver_bank: "",
    provider: "",
    session_id: "",
    payment_stage: "",
    extraction_method: ocr.available ? "ocr" : qr.available ? "qr" : "none",
    confidence_score: 0,
    extraction_error: [qr.error, ocr.error].filter(Boolean).join(",") || "extractor_unavailable",
  };
}

async function callExtractor({ url, token, image, method, maxAmount }) {
  if (!url) return { available: false, error: `${method}_adapter_unavailable`, result: null };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": image.mimeType, ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-mmd-extraction-method": method },
      body: image.bytes,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { available: true, error: `${method}_adapter_failed_${response.status}`, result: null };
    return { available: true, error: "", result: normalizeExtraction(payload, method, maxAmount) };
  } catch {
    return { available: true, error: `${method}_adapter_failed`, result: null };
  }
}

function normalizeExtraction(payload, method, maxAmount) {
  const data = payload?.result && typeof payload.result === "object" ? payload.result : payload || {};
  const amountThb = normalizeAmount(data.amount_thb ?? data.amount, maxAmount);
  const paymentRef = safeText(data.payment_ref || data.provider_txn_id || data.transaction_ref, 180);
  const paidAt = safeText(data.paid_at || data.transfer_at, 80);
  const payerName = safeText(data.payer_name || data.sender_name, 180);
  const confidence = Math.max(0, Math.min(1, Number(data.confidence_score ?? data.confidence) || 0));
  return {
    payment_ref: paymentRef,
    amount_thb: amountThb,
    paid_at: paidAt,
    payer_name: payerName,
    sender_bank: safeText(data.sender_bank, 120),
    receiver_bank: safeText(data.receiver_bank, 120),
    provider: safeText(data.provider || data.bank, 120),
    session_id: safeText(data.session_id || data.payment_intent_session_id, 180),
    payment_stage: normalizePaymentStage(data.payment_stage || data.payment_type, true),
    extraction_method: method,
    confidence_score: amountThb == null && !paymentRef && !paidAt && !payerName ? 0 : confidence,
  };
}

async function resolveDeterministicLinks(env, candidate) {
  const result = { payment: "", session: "", member: "", client: "", ambiguous: false };
  const checks = [];
  if (candidate.payment_ref) checks.push(["payment", paymentTable(env), ["Payment Reference", "payment_ref"], candidate.payment_ref]);
  if (candidate.session_id) checks.push(["session", sessionTable(env), ["session_id", "Session ID"], candidate.session_id]);
  if (candidate.line_user_id) {
    checks.push(["member", memberTable(env), ["line_id", "line_user_id", "LINE User ID"], candidate.line_user_id]);
    checks.push(["client", clientTable(env), ["line_user_id", "line_id", "LINE User ID"], candidate.line_user_id]);
  }
  if (candidate.member_email) {
    checks.push(["member", memberTable(env), ["email", "Email", "member_email"], candidate.member_email]);
    checks.push(["client", clientTable(env), ["email", "Email", "member_email"], candidate.member_email]);
  }

  for (const [name, table, fields, value] of checks) {
    const found = await uniqueAcrossFields(env, table, fields, value);
    if (found.ambiguous) result.ambiguous = true;
    if (found.id && !result[name]) result[name] = found.id;
    else if (found.id && result[name] !== found.id) result.ambiguous = true;
  }
  if (result.ambiguous) return { payment: "", session: "", member: "", client: "", ambiguous: true };
  return result;
}

async function uniqueAcrossFields(env, table, fieldNames, value) {
  const ids = new Set();
  let successfulQuery = false;
  for (const field of fieldNames) {
    try {
      const records = await airtableList(env, table, { filterByFormula: `{${field}}='${formulaValue(value)}'`, maxRecords: 2 });
      successfulQuery = true;
      for (const record of records) ids.add(record.id);
      if (ids.size > 1) return { id: "", ambiguous: true };
    } catch {
      // Field-name drift is expected across legacy tables. Try the next exact field only.
    }
  }
  if (!successfulQuery) return { id: "", ambiguous: false };
  return { id: ids.size === 1 ? [...ids][0] : "", ambiguous: ids.size > 1 };
}

async function findHistoricalDuplicate(env, { proofId, evidenceSha256 }) {
  const formula = `OR({proof_id}='${formulaValue(proofId)}',FIND('${formulaValue(evidenceSha256)}',{note})>0)`;
  const records = await airtableList(env, paymentProofTable(env), { filterByFormula: formula, maxRecords: 2 });
  if (records.length > 1) throw httpError(409, "historical_duplicate_ambiguous");
  return records[0] || null;
}

async function loadHistoricalProof(env, { proofId, recordId }) {
  if (recordId) {
    try {
      const record = await airtableGet(env, paymentProofTable(env), recordId);
      if (record?.id) return record;
    } catch {}
  }
  if (!proofId) return null;
  const records = await airtableList(env, paymentProofTable(env), { filterByFormula: `{proof_id}='${formulaValue(proofId)}'`, maxRecords: 2 });
  if (records.length > 1) throw httpError(409, "historical_proof_ambiguous");
  return records[0] || null;
}

function stagedHandoff({ proofId, evidenceSha256, candidate, reviewRequired }) {
  return {
    action: "stage_payment_evidence",
    proof_id: proofId,
    evidence_sha256: evidenceSha256,
    payment_ref: candidate.payment_ref || null,
    session_id: candidate.session_id || null,
    amount_thb: candidate.amount_thb,
    payment_stage: candidate.payment_stage || null,
    state: "pending",
    review_required: Boolean(reviewRequired),
    official_verification_required: true,
    ...guardrails(),
  };
}

function guardrails() {
  return {
    may_mark_paid: false,
    may_award_points: false,
    may_extend_membership: false,
    may_create_entitlement: false,
    may_confirm_session: false,
  };
}

function safeProofSummary(record) {
  if (!record?.id) return null;
  const fields = record.fields || {};
  const note = parseNote(fields.note);
  if (note.schema !== SCHEMA) return null;
  const ref = safeText(fields.payment_ref || note.extraction?.payment_ref, 180);
  return {
    id: record.id,
    proof_id: safeText(fields.proof_id, 120),
    status: safeCode(fields.status || "pending"),
    review_state: safeCode(note.review_state || "pending"),
    source_type: safeCode(note.source_type),
    source_ref: safeText(note.source_ref, 240),
    evidence_sha256: safeText(note.evidence_sha256, 64),
    extraction_method: safeCode(note.extraction?.extraction_method),
    extraction_confidence: Number(note.extraction?.confidence_score || 0),
    payment_ref_masked: maskRef(ref),
    amount_thb: normalizeAmount(fields.amount_thb ?? note.extraction?.amount_thb),
    review_required: note.review_required !== false,
    match: safeMatch(note.match || {}),
    created_at: safeText(note.created_at || record.createdTime, 80),
  };
}

function safeExtractionForNote(extraction) {
  return compact({
    payment_ref: extraction.payment_ref || null,
    amount_thb: extraction.amount_thb,
    paid_at: extraction.paid_at || null,
    payer_name: extraction.payer_name || null,
    sender_bank: extraction.sender_bank || null,
    receiver_bank: extraction.receiver_bank || null,
    provider: extraction.provider || null,
    session_id: extraction.session_id || null,
    payment_stage: extraction.payment_stage || null,
    extraction_method: extraction.extraction_method,
    confidence_score: extraction.confidence_score,
    extraction_error: extraction.extraction_error || null,
  });
}

function safeMatch(links = {}) {
  return {
    payment: links.payment ? "matched" : "",
    session: links.session ? "matched" : "",
    member: links.member ? "matched" : "",
    client: links.client ? "matched" : "",
    ambiguous: links.ambiguous === true,
  };
}

async function notifyOps(env, { title, proofId, amount, paymentRef, sourceRef }) {
  const endpoint = clean(env.TELEGRAM_INTERNAL_SEND_URL);
  const token = clean(env.AUTH_SERVICE_STUDIO_TO_TELEGRAM || env.AUTH_SERVICE_ADMIN_TO_TELEGRAM);
  const chatId = clean(env.TELEGRAM_CHAT_ID || "-1003546439681");
  if (!endpoint || !token || !chatId) return { ok: false, skipped: true };
  const text = [
    `🧾 <b>${escapeHtml(title)}</b>`,
    `Proof: <code>${escapeHtml(proofId)}</code>`,
    amount != null ? `Amount: <b>${Number(amount)} THB</b>` : "",
    paymentRef ? `Ref: <code>${escapeHtml(maskRef(paymentRef))}</code>` : "",
    sourceRef ? `Source: ${escapeHtml(sourceRef)}` : "",
    "State: <b>pending / review</b>",
    "Authority: <b>payments-worker</b>",
  ].filter(Boolean).join("\n");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": token },
    body: JSON.stringify({ flow: "historical_slip_backfill", chat_id: chatId, message_thread_id: Number(env.TG_THREAD_CONFIRM || 61), text }),
  });
  return { ok: response.ok, status: response.status };
}

async function airtableList(env, table, query = {}) {
  return (await airtable(env, table, "", { method: "GET" }, query)).records || [];
}

async function airtableGet(env, table, recordId) {
  return airtable(env, table, recordId, { method: "GET" });
}

async function airtableCreate(env, table, fields) {
  return airtable(env, table, "", { method: "POST", body: JSON.stringify({ fields, typecast: true }) });
}

async function airtableUpdate(env, table, recordId, fields) {
  return airtable(env, table, recordId, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) });
}

async function airtable(env, table, recordId = "", init = {}, query = {}) {
  requireAirtable(env);
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status, `airtable_${response.status}`);
  return payload;
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_BASE_ID) || !clean(env.AIRTABLE_API_KEY)) throw httpError(503, "airtable_not_ready");
}

function paymentProofTable(env) {
  return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || "MMD — Payment Proofs");
}
function paymentTable(env) { return clean(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "Payments"); }
function sessionTable(env) { return clean(env.AIRTABLE_TABLE_SESSIONS || env.AIRTABLE_TABLE_SESSIONS_ID || "Sessions"); }
function memberTable(env) { return clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || "Members"); }
function clientTable(env) { return clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || "Clients"); }

function normalizeSourceType(value) {
  const source = safeCode(value || "line_archive");
  if (source === "line_album" || source === "line_archive") return source;
  throw httpError(400, "source_type_must_be_line_album_or_line_archive");
}

function normalizePaymentStage(value, optional) {
  const stage = safeCode(value);
  if (!stage && optional) return "";
  if (!PAYMENT_STAGES.has(stage)) throw httpError(400, "invalid_payment_stage");
  return stage;
}

function normalizeAmount(value, max = DEFAULT_MAX_AMOUNT_THB) {
  if (value == null || clean(value) === "") return null;
  const text = clean(value).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  const limit = Number(max) > 0 ? Number(max) : DEFAULT_MAX_AMOUNT_THB;
  if (!Number.isFinite(number) || number <= 0 || number > limit) return null;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function extractionUseful(result) {
  return Boolean(result && (result.payment_ref || result.amount_thb != null || result.paid_at || result.payer_name));
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseNote(value) {
  try {
    const parsed = JSON.parse(clean(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function dateOnly(value) {
  const match = clean(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function maskRef(value) {
  const ref = clean(value);
  if (!ref) return "";
  if (ref.length <= 8) return `${ref.slice(0, 2)}…${ref.slice(-2)}`;
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, value]) => value !== undefined));
}

function safeCode(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
}

function safeText(value, max = 240) {
  return clean(value).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function responseHeaders() {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-MMD-Historical-Slip-Authority": "payments-worker",
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders() });
}
