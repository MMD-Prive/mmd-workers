// Evidence-only LINE job binding. No Payment, verification or settlement writes.
import { paymentProofIdentity } from "../../shared/payment-proof-precheck.mjs";
import { balancePayment } from "../../payments-worker/verified-session-balance.js";
const text = v => String(v ?? "").trim();
const ids = v => Array.isArray(v) ? v.map(text) : [];
const quote = v => text(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const stages = new Set(["deposit", "final", "full"]);
const excluded = value => /mms|massage|historical|membership|renewal/i.test(text(value));
const stopped = value => /cancel|reject|void|refund|revers|chargeback|disput|failed/i.test(text(value));
async function lookup(env, kind, formula) {
  const table = env[`AIRTABLE_TABLE_${kind}_ID`] || env[`AIRTABLE_TABLE_${kind}`] || ({ SESSIONS: "tblC98mKWbzmPuNzX", PAYMENT_PROOFS: "tblfJfM4Sqag9zrLi", PAYMENTS: "tblWGGJJOx5eBvBZJ" })[kind];
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw Error("binding_unavailable");
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", formula); url.searchParams.set("pageSize", "2");
  const request = new Request(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` }, signal: AbortSignal.timeout(8000) });
  const response = await (env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request));
  if (!response.ok) throw Error("binding_lookup_failed");
  const data = await response.json();
  if (data.offset || !Array.isArray(data.records) || data.records.length !== 1) throw Error("binding_not_unique");
  return data.records[0];
}
export async function bindLineJobEvidence(env, analysis, { proofId, contextText = "", sourceContext = "", evidenceSha256 = "", now = new Date().toISOString() } = {}) {
  const pi = analysis.payment_intelligence || {}, selected = analysis.job_correlation?.selected || {};
  // These existing lanes retain their intake and review behavior.
  if (analysis.links?.renewal || pi.inferred_stage === "membership" || excluded([sourceContext, selected.job_type, analysis.ops_route?.classification].join(" "))) return analysis;
  const hold = reason => ({ ...analysis, links: { ...analysis.links, session: "", payment: "" }, canonical_payment: { status: "unresolved", reason },
    job_correlation: { ...analysis.job_correlation, status: "unresolved", selected: null, reason },
    proof_precheck: { ...analysis.proof_precheck, canonical: null, primary_proof_id: proofId, review_url: null },
    review_summary: { ...analysis.review_summary, job_correlation_status: "unresolved", session_id: null, job_id: null },
    automatic_job_binding: { status: "needs_review", reason, money_truth_changed: false } });
  let selectedSession;
  if (selected.session_id && analysis.links?.session) {
    try {
      selectedSession = await lookup(env, "SESSIONS", `{session_id}='${quote(selected.session_id)}'`);
      const f = selectedSession.fields || {};
      if (excluded([f.session_type_raw, f["Session Type"], f.job_type, f.model_work_lane].join(" "))) return analysis;
    } catch { return hold("canonical_binding_lookup_incomplete"); }
  }
  if (analysis.customer?.status !== "matched" || !analysis.links?.client) return hold("canonical_client_required");
  const precheck = analysis.proof_precheck || {};
  if (!precheck.complete || precheck.status === "needs_review") return hold("duplicate_check_incomplete_or_conflicting");
  const canonical = precheck.status === "duplicate" ? precheck.canonical : null;
  const explicitIds = [...new Set(text(contextText).match(/\bsess[-_][A-Za-z0-9_-]+\b/g) || [])];
  if (!canonical && explicitIds.length !== 1) return hold("explicit_session_or_exact_duplicate_required");
  if (canonical && explicitIds.length && (explicitIds.length !== 1 || explicitIds[0] !== canonical.session_id)) return hold("explicit_session_conflict");
  try {
    const sessionId = canonical?.session_id || explicitIds[0];
    const session = selectedSession?.fields?.session_id === sessionId ? selectedSession : await lookup(env, "SESSIONS", `{session_id}='${quote(sessionId)}'`), sf = session.fields || {};
    if (excluded([sf.session_type_raw, sf["Session Type"], sf.job_type, sf.model_work_lane].join(" "))) return analysis;
    if (text(sf.session_id) !== sessionId || ids(sf.Client).length !== 1 || ids(sf.Client)[0] !== analysis.links.client || stopped(sf["Session Status"] || sf.session_state)) return hold("session_identity_or_state_conflict");
    let stage, duplicate = null;
    if (canonical) {
      const original = await lookup(env, "PAYMENT_PROOFS", `{proof_id}='${quote(precheck.primary_proof_id)}'`), of = original.fields || {};
      const incoming = paymentProofIdentity({ fields: { note: JSON.stringify({ schema: "line_payment_evidence_v4", evidence_sha256: evidenceSha256, extraction: { ...analysis.extraction, bank_transaction_ref: analysis.extraction?.payment_ref } }) } });
      const prior = paymentProofIdentity(original);
      const conflict = incoming.amount !== null && prior.amount !== null && Math.abs(incoming.amount - prior.amount) > .009
        || incoming.at !== null && prior.at !== null && incoming.at !== prior.at
        || incoming.bankRef && prior.bankRef && incoming.bankRef !== prior.bankRef
        || incoming.bank && prior.bank && incoming.bank !== prior.bank
        || incoming.receiverBank && prior.receiverBank && incoming.receiverBank !== prior.receiverBank;
      const sameImage = incoming.hash && incoming.hash === prior.hash;
      const sameTransfer = incoming.bankRef && incoming.bankRef === prior.bankRef && incoming.bank && incoming.bank === prior.bank
        && incoming.amount !== null && prior.amount !== null && incoming.at !== null && incoming.at === prior.at;
      if (conflict || !(sameImage || sameTransfer)) return hold("original_evidence_changed_or_incomplete");
      const payment = await lookup(env, "PAYMENTS", `{payment_ref}='${quote(canonical.payment_ref)}'`), pay = balancePayment(payment, env);
      if (canonical.session_record_id !== session.id || payment.id !== canonical.payment_record_id || pay.ref !== canonical.payment_ref || !pay.verified || pay.sessionId !== sessionId || !stages.has(pay.stage) || pay.stage !== canonical.payment_stage
        || ids(payment.fields?.Client).length !== 1 || ids(payment.fields?.Client)[0] !== analysis.links.client || text(of.proof_id) !== precheck.primary_proof_id
        || ids(of.session).length !== 1 || ids(of.session)[0] !== session.id || ids(of.Client).length !== 1 || ids(of.Client)[0] !== analysis.links.client
        || ids(of.payment).length !== 1 || ids(of.payment)[0] !== payment.id || text(of.payment_ref) !== pay.ref
        || !["verified", "approved", "official_verified"].includes(text(of.status).toLowerCase()) || !(Number(pay.amount) > 0) || Number(of.amount_thb) !== Number(pay.amount)
        || excluded(of.note)) return hold("verified_original_required");
      stage = pay.stage;
      duplicate = { proof_id: text(of.proof_id), proof_record_id: original.id, payment_ref: pay.ref, amount_thb: Number(pay.amount) };
    } else {
      // An amount, a display name, or an inferred stage alone never selects a job.
      const explicitStages = [/(?:มัดจำ|\bdeposit\b)/i.test(contextText) && "deposit", /(?:ยอดคงเหลือ|ค่าจบ|\bfinal\b|\bbalance\b)/i.test(contextText) && "final", /(?:เต็มจำนวน|\bfull\b)/i.test(contextText) && "full"].filter(Boolean);
      if (explicitStages.length !== 1 || !analysis.extraction?.payment_ref || !(Number(analysis.extraction?.amount_thb) > 0) || precheck.status !== "clear") return hold("explicit_stage_and_transfer_evidence_required");
      stage = explicitStages[0];
    }
    const binding = { schema: "proof_session_binding_v1", session_id: sessionId, session_record_id: session.id, client_record_id: analysis.links.client, payment_stage: stage,
      duplicate_of: duplicate, actor: "system:line-evidence", bound_at: now, evidence_checked: true, money_truth_changed: false,
      reason: duplicate ? "exact_evidence_verified_original" : "explicit_session_and_canonical_client", source: "line_automatic_evidence_v1" };
    return { ...analysis, links: { ...analysis.links, session: session.id, payment: "" }, session_binding: binding,
      // Do not attach another money reference or redirect review to an approved proof.
      canonical_payment: { status: "unresolved", reason: "evidence_only_binding" },
      proof_precheck: { ...precheck, primary_proof_id: proofId, review_url: null },
      review_summary: { ...analysis.review_summary, job_correlation_status: "exact", session_id: sessionId, payment_stage: stage },
      payment_intelligence: { ...pi, inferred_stage: stage, tracking_kind: `job_${stage}`, official_verification_required: true, may_mark_paid: false },
      job_correlation: { status: "exact", reason: binding.reason, candidate_count: 1, selected: { session_id: sessionId, session_record_id: session.id }, candidates: [] },
      automatic_job_binding: { status: "bound", basis: binding.reason, duplicate: Boolean(duplicate), money_truth_changed: false } };
  } catch { return hold("canonical_binding_lookup_incomplete"); }
}
