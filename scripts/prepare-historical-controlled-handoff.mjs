import fs from "node:fs";

const runtimePath = "admin-worker/src/historical-slip-backfill-runtime.js";
let runtime = fs.readFileSync(runtimePath, "utf8");

const decisionNeedle = [
  '  const decision = safeCode(body.decision);',
  '  const reviewReason = safeText(body.review_reason || body.reason, 600);',
  '  if (!reviewReason || reviewReason.length < 5) throw httpError(400, "review_reason_required");',
  '',
  '  if (decision === "reject") {',
].join("\n");

const decisionReplacement = [
  '  const decision = safeCode(body.decision);',
  '  const reviewReason = safeText(body.review_reason || body.reason, 600);',
  '  if (!reviewReason || reviewReason.length < 5) throw httpError(400, "review_reason_required");',
  '',
  '  if (decision === "validate_handoff") {',
  '    return validateHistoricalHandoff(proof, note, body, env, reviewReason);',
  '  }',
  '',
  '  if (decision === "reject") {',
].join("\n");

if (!runtime.includes('decision === "validate_handoff"')) {
  if (!runtime.includes(decisionNeedle)) throw new Error("Historical runtime decision insertion point not found");
  runtime = runtime.replace(decisionNeedle, decisionReplacement);
}

if (!runtime.includes("async function validateHistoricalHandoff(")) {
  const helperNeedle = "async function extractSlip(env, image) {";
  const helper = [
    'async function validateHistoricalHandoff(proof, note, body, env, reviewReason) {',
    '  const base = clean(env.PAYMENTS_BASE_URL).replace(/\\/+$/, "");',
    '  const serviceToken = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS);',
    '  if (!base) throw httpError(503, "payments_worker_base_url_missing");',
    '  if (!serviceToken) throw httpError(503, "payments_worker_service_auth_missing");',
    '',
    '  const proofId = safeText(proof.fields?.proof_id || body.proof_id, 120);',
    '  const evidenceSha256 = safeText(note.evidence_sha256, 64).toLowerCase();',
    '  if (!proofId) throw httpError(400, "proof_id_required");',
    '  if (!/^[a-f0-9]{64}$/.test(evidenceSha256)) throw httpError(409, "historical_proof_sha_invalid_for_handoff_probe");',
    '',
    '  // Flip one SHA nibble deliberately. payments-worker must re-read the proof',
    '  // and reject before trusted notify / Money Truth writes are reachable.',
    '  const mismatchedSha256 = (evidenceSha256[0] === "0" ? "1" : "0") + evidenceSha256.slice(1);',
    '  const handoffProbe = {',
    '    source: "historical_slip_backfill",',
    '    decision: "approved",',
    '    proof_id: proofId,',
    '    proof_record_id: proof.id,',
    '    evidence_sha256: mismatchedSha256,',
    '    payment_ref: safeText("MMD_HANDOFF_PROBE_" + proofId, 180),',
    '    amount_thb: 1,',
    '    payment_stage: "membership",',
    '    session_id: null,',
    '    member_email: "historical-handoff-smoke@example.invalid",',
    '    package_code: null,',
    '    paid_at: null,',
    '    review_reason: reviewReason,',
    '    override_reason: null,',
    '    review_actor: "internal_admin_owner",',
    '  };',
    '',
    '  const response = await fetch(base + "/v1/internal/payments/historical-slip/reviewed", {',
    '    method: "POST",',
    '    headers: { Authorization: "Bearer " + serviceToken, "Content-Type": "application/json" },',
    '    body: JSON.stringify(handoffProbe),',
    '  });',
    '  const payload = await response.json().catch(() => ({}));',
    '  const expectedRejection = response.status === 409 && safeCode(payload?.error) === "historical_proof_sha_mismatch";',
    '  if (!expectedRejection) {',
    '    throw httpError(502, "handoff_probe_unexpected_" + response.status + "_" + safeCode(payload?.error || "unknown"));',
    '  }',
    '',
    '  return json({',
    '    ok: true,',
    '    state: "pending",',
    '    proof_id: proofId,',
    '    authority: "payments-worker",',
    '    handoff_validated: true,',
    '    expected_rejection: "historical_proof_sha_mismatch",',
    '    money_truth_mutated: false,',
    '    guardrails: guardrails(),',
    '  });',
    '}',
    '',
    helperNeedle,
  ].join("\n");
  if (!runtime.includes(helperNeedle)) throw new Error("Historical runtime helper insertion point not found");
  runtime = runtime.replace(helperNeedle, helper);
}

const notifyNeedle = [
  '  const notifyPromise = notifyOps(env, {',
  '    title: reviewRequired ? "HISTORICAL SLIP REVIEW REQUIRED" : "HISTORICAL SLIP READY FOR REVIEW",',
  '    proofId,',
  '    amount: candidate.amount_thb,',
  '    paymentRef: candidate.payment_ref,',
  '    sourceRef,',
  '  });',
].join("\n");

if (runtime.includes(notifyNeedle)) {
  const notifyReplacement = [
    '  const notifyPromise = sourceRef.startsWith("github-actions-controlled-smoke:")',
    '    ? Promise.resolve({ ok: false, skipped: true, reason: "controlled_smoke" })',
    '    : notifyOps(env, {',
    '        title: reviewRequired ? "HISTORICAL SLIP REVIEW REQUIRED" : "HISTORICAL SLIP READY FOR REVIEW",',
    '        proofId,',
    '        amount: candidate.amount_thb,',
    '        paymentRef: candidate.payment_ref,',
    '        sourceRef,',
    '      });',
  ].join("\n");
  runtime = runtime.replace(notifyNeedle, notifyReplacement);
}

fs.writeFileSync(runtimePath, runtime);

const deployPath = ".github/workflows/deploy-admin-worker.yml";
let deploy = fs.readFileSync(deployPath, "utf8");
const historicalRoute = '            "/v1/admin/payments/historical-backfill*",\n';
if (!deploy.includes(historicalRoute.trim())) {
  const routeNeedle = '            "/v1/admin/payments/review",\n';
  if (!deploy.includes(routeNeedle)) throw new Error("Deploy route insertion point not found");
  deploy = deploy.replace(routeNeedle, routeNeedle + historicalRoute);
}
fs.writeFileSync(deployPath, deploy);
