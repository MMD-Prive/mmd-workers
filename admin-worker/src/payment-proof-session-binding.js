import {
  balancePayment,
  calculateVerifiedSessionBalance,
} from "../../payments-worker/verified-session-balance.js";
const text = (v) => String(v ?? "").trim();
const ids = (v) => (Array.isArray(v) ? v.map(text) : []);
const fail = (code, status = 409) => {
  throw Object.assign(new Error(code), { status });
};
const pending = new Set([
  "pending",
  "pending_review",
  "under_review",
  "review",
  "review_required",
  "needs_review",
  "unmatched",
  "new",
  "submitted",
]);
const stages = new Set(["deposit", "final", "full"]);
export const bindingNote = (raw) => {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}
async function digest(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(stable(value))),
      ),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function checkActor(actor) {
  if (!actor?.id || !["owner", "admin"].includes(actor.role))
    fail("proof_binding_forbidden", 403);
}
function selection(body) {
  const proofId = text(body.proof_id),
    sessionId = text(body.session_id),
    stage = text(body.payment_stage),
    duplicateId = text(body.duplicate_of_proof_id);
  if (
    !/^[A-Za-z0-9_-]{1,120}$/.test(proofId) ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(sessionId) ||
    !stages.has(stage)
  )
    fail("proof_binding_invalid", 400);
  if (
    duplicateId &&
    (!/^[A-Za-z0-9_-]{1,120}$/.test(duplicateId) || duplicateId === proofId)
  )
    fail("proof_binding_duplicate_invalid", 400);
  return { proofId, sessionId, stage, duplicateId };
}
function assertService(session, proof, note) {
  const f = session.fields || {};
  if (
    text(proof.fields?.note).includes("mmd_historical_slip_backfill_v1") ||
    /mms|massage/i.test(
      [
        note.payment_lane,
        note.schema,
        note.source_context,
        f.session_type_raw,
        f["Session Type"],
        f.job_type,
        f.model_work_lane,
      ]
        .map(text)
        .join(" "),
    )
  )
    fail("proof_binding_lane_unsupported");
  if (
    ids(proof.fields?.member).length ||
    ids(proof.fields?.["MMD — LIFF Renewal Sessions"]).length ||
    /membership|renewal|shop|tips/.test(
      text(note.payment_intelligence?.inferred_stage),
    )
  )
    fail("proof_binding_lane_unsupported");
}
export async function previewProofSessionBinding(body, actor, deps) {
  checkActor(actor);
  const { proofId, sessionId, stage, duplicateId } = selection(body);
  const [proof, session] = await Promise.all([
    deps.loadProof(proofId),
    deps.loadSession(sessionId),
  ]);
  if (!proof || !session) fail("proof_binding_record_not_found", 404);
  const f = proof.fields || {},
    s = session.fields || {},
    note = bindingNote(f.note);
  assertService(session, proof, note);
  if (!pending.has(text(f.status).toLowerCase()))
    fail("payment_proof_not_reviewable");
  const clients = ids(s.Client),
    proofClients = ids(f.Client || f.client),
    sessions = ids(f.session || f.Session);
  if (
    clients.length !== 1 ||
    proofClients.length > 1 ||
    (proofClients.length === 1 && proofClients[0] !== clients[0])
  )
    fail("proof_binding_client_mismatch");
  if (
    sessions.length > 1 ||
    (sessions.length === 1 && sessions[0] !== session.id) ||
    (text(f.session_id) && text(f.session_id) !== sessionId)
  )
    fail("proof_binding_session_conflict");
  if (
    ids(f.payment || f.Payment).length ||
    (text(f.payment_ref) && !text(f.payment_ref).startsWith("mmd_evidence_"))
  )
    fail("proof_binding_payment_context_locked");
  if (note.session_binding) fail("proof_binding_already_bound");
  const payments = await deps.loadPayments(sessionId);
  const balance = calculateVerifiedSessionBalance(
    {
      ...session,
      fields: { ...s, amount_thb: s.amount_thb ?? s["Total Amount"] },
    },
    payments,
    deps.env,
  );
  const linkedProofs = await deps.loadLinkedProofs(
    ids(s["MMD — Payment Proofs"]),
  );
  const verifiedProofs = linkedProofs
    .filter((p) => {
      const f = p.fields || {};
      return (
        ["verified", "approved", "official_verified"].includes(
          text(f.status).toLowerCase(),
        ) &&
        ids(f.session).length === 1 &&
        ids(f.session)[0] === session.id &&
        ids(f.Client).length === 1 &&
        ids(f.Client)[0] === clients[0] &&
        balance.records.some(
          (pay) =>
            pay.verified &&
            pay.stage === stage &&
            pay.ref === text(f.payment_ref) &&
            Number(pay.amount) === Number(f.amount_thb),
        )
      );
    })
    .map((p) => ({
      proof_id: text(p.fields.proof_id),
      amount_thb: Number(p.fields.amount_thb),
    }));
  let duplicate = null;
  if (duplicateId) {
    const original = await deps.loadProof(duplicateId),
      of = original?.fields || {};
    const verified = payments
      .map((p) => balancePayment(p, deps.env))
      .filter(
        (p) =>
          p.verified &&
          p.stage === stage &&
          (p.ref === text(of.payment_ref) || ids(of.payment).includes(p.id)),
      );
    if (
      !verifiedProofs.some((p) => p.proof_id === duplicateId) ||
      !original ||
      !["verified", "approved", "official_verified"].includes(
        text(of.status).toLowerCase(),
      ) ||
      verified.length !== 1 ||
      ids(of.session).length !== 1 ||
      ids(of.session)[0] !== session.id ||
      ids(of.Client).length !== 1 ||
      ids(of.Client)[0] !== clients[0] ||
      Number(of.amount_thb) !== Number(verified[0].amount) ||
      Number(of.amount_thb) <= 0
    )
      fail("proof_binding_verified_original_mismatch");
    if (f.amount_thb != null && Number(f.amount_thb) !== Number(of.amount_thb))
      fail("proof_binding_amount_mismatch");
    duplicate = {
      proof_id: duplicateId,
      proof_record_id: original.id,
      payment_ref: verified[0].ref,
      amount_thb: Number(verified[0].amount),
    };
  }
  const snapshot = await digest({
    proof,
    session,
    payments,
    linkedProofs,
    duplicate,
    stage,
  });
  return {
    ok: true,
    action: "preview_bind_session",
    proof_id: proofId,
    session_id: sessionId,
    payment_stage: stage,
    status: f.status,
    client_record_id: clients[0],
    client_name: text(s.client_name),
    model_name: text(s.model_name),
    job_date: text(s.job_date),
    verified_paid_thb: balance.verified_paid_thb,
    remaining_amount_thb: balance.remaining_amount_thb,
    duplicate_of: duplicate,
    verified_proofs: verifiedProofs,
    snapshot,
    session_record_id: session.id,
    money_truth_changed: false,
  };
}
export async function bindProofSession(body, actor, deps) {
  checkActor(actor);
  const sel = selection(body),
    key = text(body.idempotency_key),
    reason = text(body.admin_reason);
  if (
    !/^[A-Za-z0-9_-]{8,180}$/.test(key) ||
    reason.length < 10 ||
    reason.length > 600 ||
    body.evidence_checked !== true ||
    !/^[a-f0-9]{64}$/.test(text(body.expected_snapshot))
  )
    fail("proof_binding_confirmation_required", 400);
  if (sel.duplicateId && body.same_transfer_confirmed !== true)
    fail("proof_binding_same_transfer_confirmation_required", 400);
  // Retry the same immutable operation; never overwrite an existing binding.
  const before = await deps.loadProof(sel.proofId),
    old = bindingNote(before?.fields?.note).session_binding;
  const requestFingerprint = await digest({
    selection: sel,
    reason,
    snapshot: body.expected_snapshot,
    same_transfer_confirmed: body.same_transfer_confirmed === true,
  });
  if (old) {
    if (old.key !== key || old.request_fingerprint !== requestFingerprint)
      fail("proof_binding_already_bound");
    if (
      ids(before.fields.Client).length !== 1 ||
      ids(before.fields.Client)[0] !== old.client_record_id ||
      ids(before.fields.session).length !== 1 ||
      ids(before.fields.session)[0] !== old.session_record_id ||
      !pending.has(text(before.fields.status).toLowerCase())
    )
      fail("proof_binding_readback_required", 503);
    return receipt(sel.proofId, old, true);
  }
  const preview = await previewProofSessionBinding(body, actor, deps);
  if (preview.snapshot !== body.expected_snapshot)
    fail("proof_binding_snapshot_changed");
  const current = await deps.loadProof(sel.proofId);
  if ((await digest(current)) !== (await digest(before)))
    fail("proof_binding_snapshot_changed");
  const note = bindingNote(before.fields.note);
  const binding = {
    schema: "proof_session_binding_v1",
    key,
    request_fingerprint: requestFingerprint,
    session_id: sel.sessionId,
    session_record_id: preview.session_record_id,
    client_record_id: preview.client_record_id,
    payment_stage: sel.stage,
    duplicate_of: preview.duplicate_of,
    actor: actor.id,
    reason,
    bound_at: new Date().toISOString(),
    evidence_checked: true,
    money_truth_changed: false,
  };
  const nextNote = JSON.stringify({
    ...note,
    ...(text(before.fields.note) && !Object.keys(note).length
      ? { original_note: before.fields.note }
      : {}),
    session_binding: binding,
  });
  if (nextNote.length > 90000) fail("proof_binding_note_too_large");
  await deps.audit({
    proof_id: sel.proofId,
    proof_record_id: before.id,
    ...binding,
    phase: "binding_prepared",
  });
  // Only proof linkage + audit metadata. No payment, balance, status, verification or notification writes.
  await deps.patch(before.id, {
    session: [preview.session_record_id],
    Client: [preview.client_record_id],
    note: nextNote,
  });
  const after = await deps.loadProof(sel.proofId);
  if (
    after?.fields?.note !== nextNote ||
    JSON.stringify(ids(after.fields.session)) !==
      JSON.stringify([preview.session_record_id]) ||
    JSON.stringify(ids(after.fields.Client)) !==
      JSON.stringify([preview.client_record_id]) ||
    after.fields.status !== before.fields.status
  )
    fail("proof_binding_readback_required", 503);
  return receipt(sel.proofId, binding, false);
}
function receipt(proofId, binding, replay) {
  return {
    ok: true,
    action: "bind_session",
    proof_id: proofId,
    session_id: binding.session_id,
    binding_receipt: binding.key,
    idempotent: replay,
    money_truth_changed: false,
    approval_performed: false,
    duplicate_of: binding.duplicate_of,
  };
}
