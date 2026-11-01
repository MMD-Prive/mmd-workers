// Read-only projection. Existing Payments verification remains the only money authority.
import { calculateVerifiedSessionBalance } from "../../payments-worker/verified-session-balance.js";
import { exactRows } from "./payment-review-display-context.js";
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
const service = new Set(["deposit", "full", "final"]);
const text = (v) => String(v ?? "").trim();
function proofNote(f) {
  try {
    const note = JSON.parse(typeof f.note === "string" ? f.note : "{}");
    return note && typeof note === "object" && !Array.isArray(note) ? note : {};
  } catch { return {}; }
}
const evidenceHash = (f) => text(
  f.image_sha256 || f.evidence_sha256 || f.content_sha256 || proofNote(f).evidence_sha256,
);
function transferIds(f, payment) {
  const note = proofNote(f);
  // Production proofs store evidence metadata in note; Payments hold canonical
  // provider IDs. These aliases only detect uncertainty, never verify money.
  return [...new Set([
    f.provider_txn_id, f.bank_transaction_id, payment?.transaction,
    note.extraction?.provider_txn_id, note.extraction?.bank_transaction_id,
    note.extraction?.payment_ref, note.manual_evidence_review?.bank_reference,
  ].map(text).filter(id => id && !id.startsWith("mmd_evidence_")))];
}
const ids = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean) : []);
const fail = (code, status = 409) => {
  throw Object.assign(new Error(code), { status });
};
const satang = (v) => {
  if (v === null || v === undefined || text(v) === "") return null;
  const n = Number(v),
    cents = Math.round(n * 100);
  return Number.isFinite(n) &&
    Number.isSafeInteger(cents) &&
    cents > 0 &&
    Math.abs(n * 100 - cents) < 0.00001
    ? cents
    : null;
};

export async function completeSummaryRows(page, table, params = {}) {
  const rows = [],
    cursors = new Set();
  let offset;
  do {
    // No Airtable maxRecords: it may hide the next page at the limit.
    const payload = await page(table, {
      filterByFormula: params.filterByFormula,
      pageSize: 100,
      ...(offset ? { offset } : {}),
    });
    if (!Array.isArray(payload?.records))
      fail("summary_ledger_unavailable", 503);
    rows.push(...payload.records);
    offset = payload.offset;
    if (rows.length > 1000 || (offset && rows.length >= 1000))
      fail("summary_read_incomplete", 503);
    if (offset && (typeof offset !== "string" || cursors.has(offset)))
      fail("summary_pagination_invalid", 503);
    if (offset) cursors.add(offset);
    if (cursors.size >= 50) fail("summary_read_incomplete", 503);
  } while (offset);
  return rows;
}

export async function paymentJobSlipSummary(
  sessionId,
  { page, sessionsTable, paymentsTable, proofsTable, env = {} },
) {
  const list = (table, params) => completeSummaryRows(page, table, params);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(sessionId || ""))
    fail("invalid_session_id", 400);
  const sessions = await exactRows(list, sessionsTable, "session_id", [
    sessionId,
  ]);
  if (sessions.length !== 1)
    fail(
      sessions.length ? "summary_session_ambiguous" : "summary_session_missing",
    );
  const session = sessions[0];
  const fields = session.fields || {};
  // Use the existing verified-ledger calculator and integer-satang rules unchanged.
  const normalizedSession = {
    ...session,
    fields: {
      ...fields,
      amount_thb: fields.amount_thb ?? fields.Amount ?? fields["Total Amount"],
    },
  };
  const payments = await exactRows(list, paymentsTable, "session_id", [
    sessionId,
  ]);
  const balance = calculateVerifiedSessionBalance(
    normalizedSession,
    payments,
    env,
  );
  const refs = balance.records.map((p) => p.ref);
  const backlinks = fields["MMD — Payment Proofs"];
  if (backlinks !== undefined && !Array.isArray(backlinks))
    fail("summary_proof_backlinks_invalid");
  const linkedIds = ids(backlinks);
  const linkedProofs = await exactRows(list, proofsTable, "RECORD_ID()", linkedIds);
  const foundIds = new Set(linkedProofs.map((proof) => proof.id));
  if (linkedIds.some((id) => !foundIds.has(id)))
    fail("summary_proof_backlinks_incomplete");
  const proofs = [
    // Airtable keeps the Session's reciprocal proof links. Read every linked
    // record by ID, and fail closed if any link disappears during the read.
    ...linkedProofs,
    ...(await exactRows(list, proofsTable, "payment_ref", refs)),
  ];
  const verifiedHashes = new Set(
    proofs
      .filter((proof) =>
        balance.records.some(
          (p) =>
            p.verified &&
            (p.ref ===
              text(
                proof.fields?.payment_ref || proof.fields?.transaction_ref,
              ) ||
              ids(proof.fields?.payment || proof.fields?.Payment).includes(
                p.id,
              )),
        ),
      )
      .map((proof) => evidenceHash(proof.fields || {}))
      .filter(Boolean),
  );
  const unique = new Map(),
    proofIds = new Set(),
    seenRefs = new Set(),
    seenTransactions = new Set(),
    hashes = new Set(),
    issues = new Set();
  const rows = [];
  let pendingCents = 0,
    pendingDeposit = 0;
  for (const proof of proofs) {
    if (!proof?.id) {
      issues.add("proof_identity_missing");
      continue;
    }
    if (unique.has(proof.id)) {
      if (JSON.stringify(unique.get(proof.id)) !== JSON.stringify(proof))
        issues.add("proof_changed_during_read");
      continue;
    }
    unique.set(proof.id, proof);
    const f = proof.fields || {};
    if (text(f.note).includes("mmd_historical_slip_backfill_v1")) continue;
    const ref = text(f.payment_ref || f.transaction_ref),
      linked = ids(f.payment || f.Payment),
      sessionsLinked = ids(f.session || f.Session);
    const matches = balance.records.filter(
      (p) => (ref && p.ref === ref) || linked.includes(p.id),
    );
    const directSession = text(f.session_id);
    if (
      directSession !== sessionId &&
      !sessionsLinked.includes(session.id) &&
      !matches.length
    )
      continue;
    if (
      (directSession && directSession !== sessionId) ||
      sessionsLinked.length > 1 ||
      (sessionsLinked.length === 1 && sessionsLinked[0] !== session.id) ||
      linked.length > 1 ||
      matches.length > 1 ||
      (linked.length && (!matches.length || linked[0] !== matches[0].id)) ||
      (ref && matches.length && ref !== matches[0].ref)
    ) {
      issues.add("proof_context_conflict");
      continue;
    }
    if (
      !matches.length &&
      directSession !== sessionId &&
      !sessionsLinked.includes(session.id)
    ) {
      issues.add("proof_context_missing");
      continue;
    }
    const clients = [
      ...new Set([
        ...ids(fields.Client),
        ...ids(f.client || f.Client),
        ...matches.flatMap((p) => ids(p.record.fields?.Client)),
      ]),
    ];
    if (clients.length > 1) {
      issues.add("proof_client_conflict");
      continue;
    }
    const state = text(
      f.status || f.verification_status || "pending",
    ).toLowerCase();
    const cents = satang(f.amount_thb ?? f.amount ?? f.total_thb);
    const binding = proofNote(f).session_binding;
    if (binding?.duplicate_of) {
      const original = proofs.find(p => p.id === binding.duplicate_of.proof_record_id && text(p.fields?.proof_id) === binding.duplicate_of.proof_id);
      const originalFields = original?.fields || {};
      const verified = balance.records.find(p => p.verified && p.ref === binding.duplicate_of.payment_ref && p.ref === text(originalFields.payment_ref));
      if (binding.schema !== "proof_session_binding_v1" || binding.session_id !== sessionId || binding.session_record_id !== session.id || !sessionsLinked.includes(session.id) || !verified || !["verified", "approved", "official_verified"].includes(text(originalFields.status).toLowerCase()) || satang(originalFields.amount_thb) !== satang(verified.amount)) issues.add("duplicate_evidence_verification_changed");
      continue; // Still pending evidence, but never another pending or received payment.
    }
    if (matches[0]?.verified) {
      if (cents === null || cents !== satang(matches[0].amount))
        issues.add("verified_evidence_amount_conflict");
      continue; // Already included in verified money. Never count again as pending.
    }
    if (!pending.has(state)) {
      if (["verified", "approved", "official_verified"].includes(state))
        issues.add("verified_proof_without_verified_payment");
      else if (
        !["rejected", "cancelled", "canceled", "void", "failed"].includes(state)
      )
        issues.add("proof_status_unknown");
      continue;
    }
    const proofId = text(f.proof_id),
      stage = text(
        f.payment_stage || f.payment_type || proofNote(f).session_binding?.payment_stage || matches[0]?.stage,
      ).toLowerCase();
    if (
      ["tips", "tip", "membership", "renewal", "extension", "shop"].includes(
        stage,
      )
    )
      continue;
    if (!service.has(stage)) {
      issues.add("proof_stage_unknown");
      continue;
    }
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(proofId) || proofIds.has(proofId)) {
      issues.add("proof_identity_ambiguous");
      continue;
    }
    proofIds.add(proofId);
    const hash = evidenceHash(f);
    const transactions = transferIds(f, matches[0]);
    if (
      (ref && seenRefs.has(ref)) ||
      (hash && (hashes.has(hash) || verifiedHashes.has(hash))) ||
      transactions.some(transaction =>
        seenTransactions.has(transaction) ||
          balance.records.some(
            (p) => p.verified && p.transaction === transaction,
          ))
    ) {
      issues.add("possible_duplicate_transfer");
      continue;
    }
    if (ref) seenRefs.add(ref);
    for (const transaction of transactions) seenTransactions.add(transaction);
    if (hash) hashes.add(hash);
    if (cents === null) {
      issues.add("proof_amount_missing");
      continue;
    }
    pendingCents += cents;
    if (!Number.isSafeInteger(pendingCents)) fail("summary_amount_invalid");
    if (stage === "deposit") pendingDeposit += cents;
    rows.push({
      proof_id: proofId,
      amount_thb: cents / 100,
      payment_stage: stage,
    });
  }
  const ready = issues.size === 0;
  const total = Math.round(balance.total_amount_thb * 100),
    paid = Math.round(balance.verified_paid_thb * 100);
  const minimum = Math.ceil(balance.total_amount_thb * 0.3); // Same existing deposit review policy; advisory only.
  return {
    schema: "job_slip_summary_v1",
    session_id: sessionId,
    complete: true,
    pending_complete: ready,
    total_amount_thb: balance.total_amount_thb,
    verified_paid_thb: balance.verified_paid_thb,
    remaining_amount_thb: balance.remaining_amount_thb,
    overpaid_amount_thb: balance.overpaid_amount_thb,
    pending_amount_thb: ready ? pendingCents / 100 : null,
    pending_proof_count: ready ? rows.length : null,
    projected_remaining_thb: ready
      ? Math.max(0, total - paid - pendingCents) / 100
      : null,
    projected_overpaid_thb: ready
      ? Math.max(0, paid + pendingCents - total) / 100
      : null,
    deposit: {
      standard_minimum_thb: minimum,
      verified_thb: balance.verified_deposit_thb,
      remaining_thb: Math.max(0, minimum - balance.verified_paid_thb),
      pending_thb: ready ? pendingDeposit / 100 : null,
      projected_remaining_thb: ready
        ? Math.max(
            0,
            Math.round((minimum - balance.verified_paid_thb) * 100) -
              pendingCents,
          ) / 100
        : null,
    },
    pending_proofs: ready ? rows : [],
    issues: [...issues],
    advisory_only: true,
    money_truth_changed: false,
  };
}
