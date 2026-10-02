// Read-only presentation gate. Ledger/history rows never certify money truth.
const clean = value => String(value ?? "").trim();
const status = value => clean(value).toLowerCase();
function numeric(value) {
  if (value === null || value === undefined || clean(value) === "" || !/^[-+]?\d+(?:\.\d+)?$/.test(clean(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function guardPointsDisplaySources(records = [], payments = []) {
  const byRef = new Map();
  for (const row of payments) {
    const ref = clean(row?.fields?.["Payment Reference"]);
    if (ref) byRef.set(ref, [...(byRef.get(ref) || []), row.fields]);
  }
  const verifiedRecords = [];
  let gross = 0;
  let unresolved = 0;
  const seen = new Map();
  const seenRefs = new Set();
  for (const row of records) {
    const f = row?.fields || {};
    if (!["posted", "completed", "verified"].includes(status(f.transaction_status || f.status)) || f.reversed_at) continue;
    const key = clean(f.idempotency_key || f.logical_source_id || f.transaction_id || f.source_event_id || f.service_event_id || f.session_id || row.id);
    const signature = JSON.stringify([f.points, f.eligible_amount_thb ?? f.amount_thb, f.payment_ref, f.session_id, f.posted_at || f.created_at || row.createdTime, f.expires_at]);
    if (key && seen.has(key)) {
      if (seen.get(key) !== signature) unresolved += 1;
      continue;
    }
    if (key) seen.set(key, signature);
    const points = numeric(f.points);
    // Gross is the stored positive historical points, before expiry/redemption.
    // Never derive it from arbitrary amount text, LINE UID or message IDs.
    if (Number.isSafeInteger(points) && points > 0) gross += points;
    const ref = clean(f.payment_ref);
    if (ref && seenRefs.has(ref)) { unresolved += 1; continue; }
    if (ref) seenRefs.add(ref);
    const candidates = byRef.get(ref) || [];
    const payment = candidates.length === 1 ? candidates[0] : null;
    const amount = numeric(payment?.Amount);
    const ledgerAmount = numeric(f.eligible_amount_thb ?? f.amount_thb);
    const sameSession = !clean(f.session_id) || clean(f.session_id) === clean(payment?.session_id);
    const valid = payment && status(payment["Payment Status"]) === "paid"
      && status(payment["Verification Status"]) === "verified"
      && Number.isSafeInteger(points) && points >= 0
      && amount !== null && amount > 0 && ledgerAmount === amount
      && points === Math.floor(amount / 100) && sameSession
      && Number.isFinite(Date.parse(clean(f.posted_at || f.created_at || row.createdTime)));
    if (!valid) { unresolved += 1; continue; }
    verifiedRecords.push(row);
  }
  return {
    state: unresolved ? "review_required" : "verified",
    verifiedRecords,
    unresolvedRecords: unresolved,
    historicalPoints: { grossPoints: gross, state: "unverified_estimate", source: "stored_points_ledger", usable: false },
  };
}

export function paymentRefsForPoints(records = []) {
  return [...new Set(records.map(row => clean(row?.fields?.payment_ref)).filter(ref => /^[A-Za-z0-9_:.-]{1,180}$/.test(ref)))];
}
