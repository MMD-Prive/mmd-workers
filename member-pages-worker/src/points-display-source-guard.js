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
    || isMaterializedHistoricalPointsRecord(row);
}

export function isMaterializedHistoricalPointsRecord(row = {}) {
  const f = row.fields || {};
  const reference = clean(f.payment_ref);
  return selectName(f.source) === "line_ofc_history"
    && f.created_by === "history_materializer_v1"
    && f.rate_policy === "historical_100_thb_1_pt_remainder"
    && /^[A-Za-z0-9_:.-]{1,180}$/.test(reference)
    && clean(f.idempotency_key) === `historical_base:${reference}`;
}

function validHistoricalPoints(row, points) {
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
      && points === Math.floor(pool / 100) && Number.isSafeInteger(after)
      && after === pool % 100;
  }
  return Number.isSafeInteger(amount) && canonicalTimestamp(f.expires_at);
}

function canonicalTimestamp(value) {
  const text = clean(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(text);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return false;
  const milliseconds = Date.parse(text);
  return Number.isFinite(milliseconds);
}

function linkedClientIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => clean(item && typeof item === "object" ? item.id : item)).filter(Boolean);
}

function ownedByClient(row, clientId) {
  const ids = linkedClientIds(row?.fields?.Client);
  return ids.length === 1 && ids[0] === clientId;
}

function validMaterializedOwnership(row, paymentsByRef, sessionsById, clientId) {
  if (!/^rec[A-Za-z0-9]+$/.test(clean(clientId))) return false;
  const fields = row?.fields || {};
  const reference = clean(fields.payment_ref);
  const sessionId = clean(fields.session_id);
  if (!reference || !sessionId) return false;
  const paymentRows = paymentsByRef.get(reference) || [];
  const sessionRows = sessionsById.get(sessionId) || [];
  return paymentRows.length === 1 && sessionRows.length === 1
    && clean(paymentRows[0]?.fields?.["Payment Reference"]) === reference
    && clean(paymentRows[0]?.fields?.session_id) === sessionId
    && clean(sessionRows[0]?.fields?.session_id) === sessionId
    && ownedByClient(paymentRows[0], clientId)
    && ownedByClient(sessionRows[0], clientId);
}

function validNoteAggregateOwnership(row, clientId) {
  return /^rec[A-Za-z0-9]+$/.test(clean(clientId))
    && clean(row?.fields?.idempotency_key) === `historical_note_total_v2:${clientId}`;
}

export function guardPointsDisplaySources(records = [], payments = [], { clientId = "", sessions = [] } = {}) {
  const byRef = new Map();
  for (const row of payments) {
    const ref = clean(row?.fields?.["Payment Reference"]);
    if (ref) byRef.set(ref, [...(byRef.get(ref) || []), row.fields]);
  }
  const paymentsByRef = new Map();
  for (const row of payments) {
    const ref = clean(row?.fields?.["Payment Reference"]);
    if (ref) paymentsByRef.set(ref, [...(paymentsByRef.get(ref) || []), row]);
  }
  const sessionsById = new Map();
  for (const row of sessions) {
    const id = clean(row?.fields?.session_id);
    if (id) sessionsById.set(id, [...(sessionsById.get(id) || []), row]);
  }
  const verifiedRecords = [];
  const acceptedHistoricalRecords = [];
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
    const ref = clean(f.payment_ref);
    if (ref && seenRefs.has(ref)) { unresolved += 1; continue; }
    if (ref) seenRefs.add(ref);
    if (isHistoricalPointsRecord(row)) {
      const owned = isMaterializedHistoricalPointsRecord(row)
        ? validMaterializedOwnership(row, paymentsByRef, sessionsById, clientId)
        : validNoteAggregateOwnership(row, clientId);
      if (owned && validHistoricalPoints(row, points)) {
        verifiedRecords.push(row);
        acceptedHistoricalRecords.push(row);
      } else unresolved += 1;
      continue;
    }
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
  const noteAggregates = acceptedHistoricalRecords.filter(row => row?.fields?.created_by === "member_history_recovery_v2_note_first");
  if (noteAggregates.length) {
    const totalSpend = acceptedHistoricalRecords.reduce((sum, row) => {
      const amount = numeric(row?.fields?.eligible_amount_thb ?? row?.fields?.amount_thb);
      return amount === null ? Number.NaN : sum + amount;
    }, 0);
    const totalPoints = acceptedHistoricalRecords.reduce((sum, row) => {
      const value = numeric(row?.fields?.points);
      return value === null ? Number.NaN : sum + value;
    }, 0);
    // The note-first writer reconciles the group target after subtracting
    // already-posted historical rows. Validate the combined group so a
    // carried remainder is preserved; a standalone aggregate ratio is wrong.
    if (noteAggregates.length !== 1 || !Number.isSafeInteger(totalSpend)
      || !Number.isSafeInteger(totalPoints) || totalPoints !== Math.floor(totalSpend / 100)) unresolved += 1;
  }
  return {
    state: unresolved ? "review_required" : "verified",
    verifiedRecords,
    unresolvedRecords: unresolved,
    historicalPoints: { grossPoints: gross, state: "unverified_estimate", source: "stored_points_ledger", usable: false },
  };
}

export function paymentRefsForPoints(records = []) {
  return [...new Set(records.filter(row => !isHistoricalPointsRecord(row) || isMaterializedHistoricalPointsRecord(row))
    .map(row => clean(row?.fields?.payment_ref)).filter(ref => /^[A-Za-z0-9_:.-]{1,180}$/.test(ref)))];
}

export function sessionIdsForHistoricalPoints(records = []) {
  return [...new Set(records.filter(isMaterializedHistoricalPointsRecord)
    .map(row => clean(row?.fields?.session_id))
    .filter(id => /^[A-Za-z0-9_:.-]{1,180}$/.test(id)))];
}
