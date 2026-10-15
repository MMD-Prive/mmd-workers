const fail = (code, status = 409) => { throw Object.assign(new Error(code), { status }); };
const text = v => typeof v === 'string' ? v.trim() : '';
const amount = v => v == null || v === '' ? null : Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;

/** Fill missing extraction fields only. This never settles a payment. */
export async function correctPaymentEvidence(body, actor, deps) {
  if (!['owner', 'admin'].includes(actor?.role)) fail('evidence_correction_forbidden', 403);
  const id = text(body.proof_id), key = text(body.idempotency_key), ref = text(body.payment_ref), reason = text(body.admin_reason);
  const value = body.amount_thb;
  if (!id || id.length > 120 || !/^[A-Za-z0-9_-]{8,180}$/.test(key)) fail('invalid_evidence_correction', 400);
  if (ref.length < 3 || ref.length > 180 || !/^[A-Za-z0-9][A-Za-z0-9._/ -]*$/.test(ref)) fail('evidence_reference_invalid', 400);
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1000000000 || Math.abs(Math.round(value * 100) - value * 100) > 0.00001) fail('evidence_amount_invalid', 400);
  if (reason.length < 10 || reason.length > 600 || body.evidence_checked !== true) fail('evidence_correction_confirmation_required', 400);
  if (!body.expected || !Object.hasOwn(body.expected, 'payment_ref') || !Object.hasOwn(body.expected, 'amount_thb')) fail('evidence_snapshot_required', 400);
  const fingerprint = JSON.stringify({ id, ref, value, reason, expected: { payment_ref: text(body.expected.payment_ref), amount_thb: amount(body.expected.amount_thb) } });
  const proof = await deps.load(id);
  if (!proof) fail('payment_proof_not_found', 404);
  const fields = proof.fields || {}, note = deps.parseNote(fields.note);
  const oldRef = text(fields.payment_ref || fields.transaction_ref), oldAmount = amount(fields.amount_thb ?? fields.amount ?? fields.total_thb);
  const history = Array.isArray(note.evidence_corrections) ? note.evidence_corrections : [];
  const previous = history.find(row => row.key === key);
  if (previous) {
    if (previous.fingerprint !== fingerprint) fail('evidence_correction_key_conflict');
    return receipt(id, key, true);
  }
  if (!deps.reviewable(proof)) fail('payment_proof_not_reviewable');
  if (note.schema === 'mmd_historical_slip_backfill_v1') fail('historical_proof_requires_historical_backfill_review');
  if (oldRef !== text(body.expected.payment_ref) || oldAmount !== amount(body.expected.amount_thb)) fail('evidence_snapshot_changed');
  if ((oldRef && oldRef !== ref) || (oldAmount !== null && Math.abs(oldAmount - value) > 0.00001)) fail('existing_evidence_value_locked');
  if (oldRef && oldAmount !== null) fail('evidence_already_complete');
  if (history.length >= 20) fail('evidence_correction_history_full');
  const entry = { key, fingerprint, actor: actor.id, corrected_at: new Date().toISOString(), before: { payment_ref: oldRef || null, amount_thb: oldAmount }, after: { payment_ref: ref, amount_thb: value }, reason, money_truth_changed: false };
  // Audit must succeed before any evidence write. Original image/OCR and note survive.
  await deps.audit({ proof_id: id, proof_record_id: proof.id, ...entry });
  const nextNote = JSON.stringify({ ...note, ...(typeof fields.note === 'string' && (!fields.note.trim().startsWith('{') || !Object.keys(note).length) ? { original_note: fields.note } : {}), evidence_corrections: [...history, entry] });
  if (nextNote.length > 90000) fail('evidence_correction_note_too_large');
  await deps.patch(proof.id, { payment_ref: ref, amount_thb: value, note: nextNote });
  const after = await deps.load(id);
  const saved = deps.parseNote(after?.fields?.note).evidence_corrections;
  if (!Array.isArray(saved) || !saved.some(row => row.key === key && row.fingerprint === fingerprint) || text(after?.fields?.payment_ref) !== ref || amount(after?.fields?.amount_thb) !== value) fail('evidence_correction_readback_required', 503);
  return receipt(id, key, false);
}
function receipt(id, key, duplicate) { return { ok: true, action: 'correct_evidence', proof_id: id, correction_receipt: key, duplicate, money_truth_changed: false, approval_required: true }; }
