// Read-only display projection. Never release confirmation URLs or change money.
const text = (value) => String(value ?? "").trim().slice(0, 180);
const quote = (value) => `'${text(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const ids = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const amount = (value) => value !== null && value !== undefined && text(value) !== "" && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const serviceStages = new Set(["deposit", "full", "final", "tips"]);

async function exactRows(list, table, field, values) {
  const unique = [...new Set(values.filter(Boolean))];
  const rows = [];
  // Bounded batches avoid one Airtable request per slip and preserve ambiguity.
  for (let index = 0; index < unique.length; index += 20) {
    const terms = unique.slice(index, index + 20).map(value => `{${field}}=${quote(value)}`);
    rows.push(...await list(table, { filterByFormula: `OR(${terms.join(",")})`, maxRecords: 100 }));
  }
  return rows;
}

export async function enrichPaymentReviewContext(items, proofs, { list, paymentsTable, sessionsTable }) {
  let payments, sessions;
  try {
    payments = await exactRows(list, paymentsTable, "Payment Reference", items.map(item => item.payment_ref));
    sessions = await exactRows(list, sessionsTable, "session_id", payments.map(row => text(row.fields?.session_id)));
  } catch {
    return items.map(item => block(item, "review_context_unavailable"));
  }
  return items.map(item => {
    const matches = payments.filter(row => text(row.fields?.["Payment Reference"] || row.fields?.payment_ref) === item.payment_ref);
    if (matches.length !== 1) return block(item, matches.length ? "canonical_payment_ambiguous" : "canonical_payment_context_missing");
    const payment = matches[0], p = payment.fields || {};
    const proof = proofs.find(row => row.id === item.proof_record_id)?.fields || {};
    const linkedPayments = ids(proof.payment || proof.Payment);
    if (linkedPayments.length > 1 || (linkedPayments.length === 1 && linkedPayments[0] !== payment.id)) return block(item, "payment_context_mismatch");
    const stage = text(p.payment_stage || p.payment_type).toLowerCase();
    const sessionId = text(p.session_id);
    const sessionMatches = sessions.filter(row => text(row.fields?.session_id) === sessionId);
    const session = sessionMatches.length === 1 ? sessionMatches[0] : null;
    const s = session?.fields || {};
    const linkedSessions = ids(proof.session || proof.Session);
    const expected = amount(p.amount_thb ?? p.Amount);
    const issues = [];
    if (!stage) issues.push("canonical_payment_stage_missing");
    if (expected === null) issues.push("canonical_payment_amount_missing");
    else if (item.evidence_amount_thb != null && Math.abs(expected - item.evidence_amount_thb) > 0.009) issues.push("payment_amount_mismatch");
    if (serviceStages.has(stage) && !session) issues.push("canonical_session_context_missing");
    if (linkedSessions.length > 1 || (session && linkedSessions.length === 1 && linkedSessions[0] !== session.id)) issues.push("payment_context_mismatch");
    const status = text(p["Payment Status"] || p.status).toLowerCase();
    if (["cancelled", "canceled", "rejected", "void", "failed", "paid", "verified", "approved", "refunded"].includes(status)) issues.push("payment_not_pending");
    if (["cancelled", "canceled", "rejected", "void"].includes(text(s["Session Status"] || s.status).toLowerCase())) issues.push("session_cancelled");
    const result = {
      ...item,
      customer_name: item.customer_name || text(s.client_name),
      model_name: text(s.model_name),
      job_type: text(s.job_type),
      job_date: text(s.job_date),
      start_time: text(s.start_time),
      end_time: text(s.end_time),
      location_name: text(s.location_name),
      session_id: sessionId,
      payment_stage: stage,
      expected_amount_thb: expected,
      payment_status: status,
      package_code: text(p.package_code),
      context_loaded: true,
    };
    return issues.reduce((row, issue) => block(row, issue), result);
  });
}

function block(item, issue) {
  return { ...item, context_loaded: true, can_approve: false, review_lane: "needs_enrichment", context_issues: [...new Set([...(item.context_issues || []), issue])] };
}
