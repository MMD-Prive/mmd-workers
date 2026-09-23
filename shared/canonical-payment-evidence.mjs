// Evidence correlation only. This module never verifies or settles a payment.
const text = (value) => String(value ?? "").trim();
const quote = (value) => text(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const ids = (value) => Array.isArray(value) ? value.map(text) : [];
const stageOf = (fields) => text(fields.payment_stage || fields.payment_type).toLowerCase();

export async function resolveLineCanonicalPayment(env, analysis = {}) {
  const correlation = analysis.job_correlation || {};
  const selected = correlation.selected || {};
  const links = analysis.links || {};
  const stage = text(analysis.payment_intelligence?.inferred_stage).toLowerCase();
  const amount = Number(analysis.extraction?.amount_thb);
  const unresolved = (reason) => ({ status: "unresolved", reason });
  if (analysis.customer?.status !== "matched" || !(links.client || links.member)
      || correlation.status !== "exact" || !links.session
      || selected.session_record_id !== links.session || !selected.session_id
      || !["deposit", "full", "final", "tips", "extension"].includes(stage)
      || analysis.payment_intelligence?.ambiguous === true || !(amount > 0)) {
    return unresolved("exact_customer_session_stage_required");
  }

  const base = text(env.AIRTABLE_BASE_ID);
  const token = text(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  const table = text(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ");
  if (!base || !token) return unresolved("canonical_payment_unavailable");
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", `{session_id}='${quote(selected.session_id)}'`);
  url.searchParams.set("pageSize", "100");
  const request = new Request(url, { headers: { authorization: `Bearer ${token}` } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  if (!response.ok) return unresolved("canonical_payment_lookup_failed");
  const data = await response.json();
  // Never choose a unique candidate from a truncated result set.
  if (data.offset) return unresolved("canonical_payment_candidates_truncated");
  const candidates = (data.records || []).filter((record) => {
    const f = record.fields || {};
    const clientIds = ids(f.Client || f.client);
    const memberIds = ids(f.Member || f.member);
    return record.id && text(f.payment_ref || f["Payment Reference"])
      && text(f.session_id) === text(selected.session_id) && stageOf(f) === stage
      && Math.abs(Number(f.amount_thb ?? f.amount ?? f.Amount) - amount) < 0.009
      && (!clientIds.length || (links.client && clientIds.includes(links.client)))
      && (!memberIds.length || (links.member && memberIds.includes(links.member)))
      && !["cancelled", "canceled", "rejected", "void", "refunded"].includes(text(f.payment_status || f["Payment Status"]).toLowerCase());
  });
  if (candidates.length !== 1) return unresolved(candidates.length ? "canonical_payment_ambiguous" : "canonical_payment_not_found");
  const payment = candidates[0];
  return {
    status: "exact",
    payment_record_id: payment.id,
    payment_ref: text(payment.fields.payment_ref || payment.fields["Payment Reference"]),
    session_id: text(selected.session_id),
    payment_stage: stage,
  };
}

export async function paymentEvidenceKey(paymentRef) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text(paymentRef)));
  return `payment-evidence/locks/${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}.json`;
}

// Both production workers bind the same private evidence bucket. Conditional
// writes serialize web/LINE intake for one canonical ref, including redeliveries.
export async function withPaymentEvidenceLock(bucket, paymentRef, operation) {
  if (!bucket?.get || !bucket?.put) throw Object.assign(new Error("payment_evidence_storage_unavailable"), { status: 503 });
  const key = await paymentEvidenceKey(paymentRef);
  const current = await bucket.get(key);
  const previous = current ? JSON.parse(await current.text()) : null;
  if (previous?.until > Date.now()) throw Object.assign(new Error("payment_evidence_intake_in_progress"), { status: 409 });
  const lease = { until: Date.now() + 300000, nonce: crypto.randomUUID() };
  const stored = await bucket.put(key, JSON.stringify(lease), {
    onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
  });
  if (stored === null) throw Object.assign(new Error("payment_evidence_intake_in_progress"), { status: 409 });
  try {
    return await operation();
  } finally {
    // CAS release cannot unlock another request's newer lease. Never mask a
    // successfully persisted proof with a release failure; the lease expires.
    await bucket.put(key, JSON.stringify({ until: 0, nonce: lease.nonce }), {
      onlyIf: { etagMatches: stored.etag },
      httpMetadata: { contentType: "application/json" },
    }).catch(() => {});
  }
}
