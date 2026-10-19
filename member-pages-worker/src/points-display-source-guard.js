// Read-only presentation gate. Ledger/history rows never certify money truth.
const clean = value => String(value ?? "").trim();
const status = value => clean(value).toLowerCase();
const selectName = value => status(value && typeof value === "object" ? value.name : value);
function numeric(value) {
  if (value === null || value === undefined || clean(value) === "" || !/^[-+]?\d+(?:\.\d+)?$/.test(clean(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// These are existing server-owned historical ledger writer contracts, not
// payment verification. A posted historical award does not require a slip or
// a new paid+verified Payments record. Arbitrary source labels alone do not
// qualify; no raw note, customer text or archive number is parsed into Points.
export function isHistoricalPointsRecord(row = {}) {
  const f = row.fields || {};
  if (selectName(f.source) !== "line_ofc_history") return false;
  const key = clean(f.idempotency_key);
  return (f.created_by === "member_history_recovery_v2_note_first"
      && f.rate_policy === "historical_lifetime_total_100_thb_1_point_v2"
      && /^historical_note_total_v2:rec[A-Za-z0-9]+$/.test(key))
    || (f.created_by === "history_materializer_v1"
      && f.rate_policy === "historical_100_thb_1_pt_remainder"
      && /^historical_base:[A-Za-z0-9_:.-]+$/.test(key));
}

function validHistoricalPoints(row, points, clientId) {
  const f = row.fields || {};
  const amount = numeric(f.eligible_amount_thb ?? f.amount_thb);
  if (!Number.isSafeInteger(points) || points < 0 || amount === null || amount < 0
    || !Number.isFinite(Date.parse(clean(f.posted_at)))) return false;
  if (f.rate_policy === "historical_100_thb_1_pt_remainder") {
    const prior = numeric(f.prior_remainder_thb);
    const pool = numeric(f.pool_thb);
    const after = numeric(f.remainder_after_thb);
    return Number.isSafeInteger(amount) && Number.isSafeInteger(prior) && prior >= 0 && prior < 100
      && Number.isSafeInteger(pool) && pool === amount + prior
      && points === Math.floor(pool / 100) && after === pool % 100;
  }
  return /^rec[A-Za-z0-9]+$/.test(clean(clientId))
    && f.idempotency_key === `historical_note_total_v2:${clientId}`
    && points === Math.floor(amount / 100);
}
export function guardPointsDisplaySources(records = [], payments = [], { clientId = "" } = {}) {
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
    const signature = JSON.stringify([f.points, f.eligible_amount_thb ?? f.amount_thb, f.payment_ref, f.session_id, f.posted_at || f.created_at || row.createdTime, f.expires_at, f.source, f.created_by, f.rate_policy, f.prior_remainder_thb, f.pool_thb, f.remainder_after_thb]);
    if (key && seen.has(key)) {
      if (seen.get(key) !== signature) unresolved += 1;
      continue;
    }
    if (key) seen.set(key, signature);
    const points = numeric(f.points);
    // Gross is the stored positive historical points, before expiry/redemption.
    // Never derive it from arbitrary amount text, LINE UID or message IDs.
    if (Number.isSafeInteger(points) && points > 0) gross += points;
    if (isHistoricalPointsRecord(row)) {
      if (validHistoricalPoints(row, points, clientId)) verifiedRecords.push(row);
      else unresolved += 1;
      continue;
    }
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
  return [...new Set(records.filter(row => !isHistoricalPointsRecord(row)).map(row => clean(row?.fields?.payment_ref)).filter(ref => /^[A-Za-z0-9_:.-]{1,180}$/.test(ref)))];
}
