const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_TIERS = new Set(["Member", "Standard", "Premium", "VIP", "Black Card"]);
const SAFE_MEMBERSHIP_STATES = new Set(["active", "grace", "expired", "checking", "under_review"]);
const SAFE_SOURCE_STATES = new Set(["verified", "checking", "not_available"]);
const SAFE_PAYMENT_STATES = new Set(["verified", "pending_review", "unavailable"]);
const SAFE_JOB_STATES = new Set(["upcoming", "active", "completed", "cancelled"]);
const SAFE_HISTORY_TYPES = new Set(["service", "membership", "points", "payment", "campaign", "privilege"]);
const FORBIDDEN_TEXT_RE = /\b(?:pn|mk|burn|svip|airtable|telegram|line[_\s-]?user|payment[_\s-]?ref|provider|bank|slip|commission|referral|risk|internal|admin|eligib(?:ility|le)?|proposal|private[_\s-]?model|model[_\s-]?ability|orientation|payload|entitlement|r2|drive)\b|\bU[a-f0-9]{20,}\b/i;

// This is the only member-profile projection used by member-pages-worker.
// It accepts a small allowlist and deliberately drops all other resolver data.
export function serializeCustomer360Profile(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const v2 = isPlainObject(source.customer_360) ? serializeV2(source.customer_360) : null;
  if (v2) return compactCompatibilityProfile(source, v2);
  return serializeLegacyCompatibilityProfile(source);
}

function serializeV2(source) {
  const rawMember = isPlainObject(source.member) ? source.member : {};
  const blackCardVisible = rawMember.black_card_customer_visible === true;
  const member = {
    display_name: safeText(rawMember.display_name, 120) || "สมาชิก MMD",
    member_id: safeIdentifier(rawMember.member_id),
    tier: safeTier(rawMember.tier, blackCardVisible),
    membership_status: safeChoice(rawMember.membership_status, SAFE_MEMBERSHIP_STATES, "checking"),
    membership_start: safeDate(rawMember.membership_start),
    membership_expires_at: safeDate(rawMember.membership_expires_at),
  };
  if (!member.membership_start) delete member.membership_start;
  if (!member.membership_expires_at) delete member.membership_expires_at;

  return {
    version: "customer_360_v2",
    member,
    points: serializePoints(source.points),
    packages: serializePackages(source.packages, blackCardVisible),
    jobs: serializeJobs(source.jobs),
    payments: serializePayments(source.payments),
    history: serializeHistory(source.history),
    requests: serializeRequests(source.requests),
    // Care Back has an independent verified state machine. This V2 profile
    // never turns generic resolver data into a customer privilege.
    care: { status: "checking", privileges: [] },
    mms: serializeMms(source.mms),
  };
}

function compactCompatibilityProfile(source, customer360) {
  const profile = {
    display_name: customer360.member.display_name,
    tier: customer360.member.tier,
    membership_status: customer360.member.membership_status,
    payment_status: customer360.payments.status,
    points: customer360.points.active_points,
    points_records_count: customer360.points.records_count,
    payment_history: customer360.payments.historical_verified,
    history_window: {
      from: customer360.history.from,
      to: customer360.history.to,
      timezone: "Asia/Bangkok",
    },
    history: customer360.history.events,
    customer_360: customer360,
  };
  const memberId = safeIdentifier(source.member_id) || customer360.member.member_id;
  if (memberId) profile.member_id = memberId;
  if (customer360.member.membership_start) profile.membership_start = customer360.member.membership_start;
  if (customer360.member.membership_expires_at) profile.membership_expires_at = customer360.member.membership_expires_at;
  return profile;
}

function serializeLegacyCompatibilityProfile(source) {
  const history = boundedArray(source.history, 50).map(legacyHistory).filter(Boolean);
  const paymentHistory = boundedArray(source.payment_history, 20).map((item) => safePaymentRecord(item, false)).filter(Boolean);
  // Old resolver payloads do not prove a ledger result unless they include the
  // bounded record count. Do not let a legacy summary value look authoritative.
  const pointsRecordsCount = safeNonNegativeInteger(source.points_records_count);
  const profile = {
    display_name: safeText(source.display_name, 120) || "สมาชิก MMD",
    tier: blockedLegacyTier(source.tier) ? "" : safeTier(source.tier, false),
    membership_status: safeChoice(source.membership_status, SAFE_MEMBERSHIP_STATES, "under_review"),
    payment_status: safeChoice(source.payment_status, SAFE_PAYMENT_STATES, "unavailable"),
    points: pointsRecordsCount === null ? null : safeNonNegativeInteger(source.points),
    points_records_count: pointsRecordsCount,
    payment_history: paymentHistory,
    history_window: {
      from: safeDate(source.history_window?.from),
      to: safeDate(source.history_window?.to),
      timezone: "Asia/Bangkok",
    },
    history,
  };
  const memberId = safeIdentifier(source.member_id);
  if (memberId) profile.member_id = memberId;
  const expiry = safeDate(source.membership_expires_at);
  if (["active", "grace"].includes(profile.membership_status) && expiry) profile.membership_expires_at = expiry;
  const start = safeDate(source.membership_start);
  if (["active", "grace"].includes(profile.membership_status) && start) profile.membership_start = start;
  return profile;
}

function serializePoints(value) {
  const source = isPlainObject(value) ? value : {};
  const status = safeChoice(source.status, SAFE_SOURCE_STATES, "checking");
  const verified = status === "verified";
  return {
    status,
    active_points: verified ? safeNonNegativeInteger(source.active_points) : null,
    records_count: verified ? safeNonNegativeInteger(source.records_count) : null,
    rate_policy: { currency: "THB", thb_per_point: 100, rounding: "floor" },
    history: verified ? boundedArray(source.history, 50).map(pointHistory).filter(Boolean) : [],
    expiring_points: verified ? safeNonNegativeInteger(source.expiring_points) : null,
    nearest_expiry: verified ? safeDate(source.nearest_expiry) : null,
  };
}

function serializePackages(value, blackCardVisible) {
  const source = isPlainObject(value) ? value : {};
  const status = safeChoice(source.status, SAFE_SOURCE_STATES, "checking");
  return {
    status,
    current_package: status === "verified" ? safePackage(source.current_package, blackCardVisible) : null,
    package_history: status === "verified" ? boundedArray(source.package_history, 50).map((item) => safePackage(item, blackCardVisible)).filter(Boolean) : [],
    actions: status === "verified" ? boundedArray(source.actions, 4).map(safePackageAction).filter(Boolean) : [],
  };
}

function safePackage(value, blackCardVisible) {
  if (!isPlainObject(value)) return null;
  const code = safePackageCode(value.code);
  const status = safeChoice(value.status, new Set(["active", "grace", "expired", "cancelled", "refunded"]), "");
  if (!code || !status) return null;
  const tier = safeTier(value.tier, blackCardVisible);
  const blackCardPackage = /blackcard|black_card/.test(code) || String(value.tier || "") === "Black Card";
  return compact({
    code: blackCardPackage && !blackCardVisible ? "membership" : code,
    customer_safe_name: blackCardPackage && !blackCardVisible ? "MMD Membership" : (safeText(value.customer_safe_name, 100) || "MMD Membership"),
    tier,
    status,
    start_date: safeDate(value.start_date),
    end_date: safeDate(value.end_date),
    duration_days: boundedInteger(value.duration_days, 1, 3660),
  });
}

function safePackageAction(value) {
  if (!isPlainObject(value)) return null;
  const id = safeChoice(value.id, new Set(["renew", "upgrade", "compare_package"]), "");
  return id && value.state === "available" ? { id, state: "available" } : null;
}

function serializeJobs(value) {
  const source = isPlainObject(value) ? value : {};
  const status = safeChoice(source.status, SAFE_SOURCE_STATES, "checking");
  const result = { status };
  for (const key of ["upcoming_jobs", "active_jobs", "completed_jobs", "cancelled_jobs"]) {
    result[key] = status === "verified" ? boundedArray(source[key], 50).map(safeJob).filter(Boolean) : [];
  }
  return result;
}

function safeJob(value) {
  if (!isPlainObject(value)) return null;
  const status = safeChoice(value.status, SAFE_JOB_STATES, "");
  const date = safeDate(value.date);
  if (!status || !date) return null;
  return compact({
    job_number: safeIdentifier(value.job_number),
    date,
    start_time: safeTime(value.start_time),
    end_time: safeTime(value.end_time),
    duration: boundedInteger(value.duration, 1, 1440),
    model_display_name: safeText(value.model_display_name, 80),
    service_title: safeText(value.service_title, 80) || "MMD Service",
    status,
    location_customer_safe: safeText(value.location_customer_safe, 120),
    customer_safe_note: safeText(value.customer_safe_note, 240),
    payment_status: safeChoice(value.payment_status, SAFE_PAYMENT_STATES, "unavailable"),
    amount_due_thb: safeMoney(value.amount_due_thb),
  });
}

function serializePayments(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    status: safeChoice(source.status, SAFE_PAYMENT_STATES, "unavailable"),
    historical_verified: boundedArray(source.historical_verified, 20).map((item) => safePaymentRecord(item, true)).filter(Boolean),
  };
}

function safePaymentRecord(value, requireVerified) {
  if (!isPlainObject(value)) return null;
  const date = safeDate(value.date);
  const status = safeChoice(value.status, SAFE_PAYMENT_STATES, "");
  if (!date || !status || (requireVerified && status !== "verified")) return null;
  return compact({ date, title: safeText(value.title, 80) || "MMD payment", amount: safeMoney(value.amount), status });
}

function serializeHistory(value) {
  const source = isPlainObject(value) ? value : {};
  const status = safeChoice(source.status, SAFE_SOURCE_STATES, "checking");
  return {
    status,
    from: safeDate(source.from),
    to: safeDate(source.to),
    range_days: source.range_days === 365 ? 365 : 365,
    events: boundedArray(source.events, 50).map(legacyHistory).filter(Boolean),
  };
}

function legacyHistory(value) {
  if (!isPlainObject(value)) return null;
  const type = safeChoice(value.type, SAFE_HISTORY_TYPES, "");
  const date = safeDate(value.date);
  if (!type || !date) return null;
  const event = {
    type,
    date,
    title: safeText(value.title, 80) || "MMD activity",
    status: safeChoice(value.status, new Set(["active", "grace", "expired", "upcoming", "completed", "cancelled", "posted", "verified", "pending_review"]), "checking"),
  };
  const delta = safeSignedInteger(value.points_delta);
  if (type === "points" && delta !== null) event.points_delta = delta;
  return event;
}

function pointHistory(value) {
  const event = legacyHistory({ ...value, type: "points" });
  return event ? compact({ date: event.date, title: event.title, points_delta: event.points_delta, status: event.status, expires_at: safeDate(value?.expires_at) }) : null;
}

function serializeRequests(value) {
  const source = isPlainObject(value) ? value : {};
  const status = safeChoice(source.status, SAFE_SOURCE_STATES, "checking");
  return {
    status,
    items: status === "verified" ? boundedArray(source.items, 20).map(safeRequest).filter(Boolean) : [],
  };
}

function safeRequest(value) {
  if (!isPlainObject(value)) return null;
  const status = safeChoice(value.status, new Set(["requested", "submitted", "pending", "under_review", "confirmed", "cancelled"]), "");
  const date = safeDate(value.preferred_date);
  if (!status || !date) return null;
  return compact({
    request_number: safeIdentifier(value.request_number),
    requested_model_display_name: safeText(value.requested_model_display_name, 80),
    preferred_date: date,
    preferred_time: safeTime(value.preferred_time),
    status,
    safe_next_action: safeChoice(value.safe_next_action, new Set(["wait_for_review", "wait_for_confirmation", "view_job", "none"]), "none"),
  });
}

function serializeMms(value) {
  const source = isPlainObject(value) ? value : {};
  const status = safeChoice(source.status, SAFE_SOURCE_STATES, "not_available");
  return {
    status,
    prebookings: status === "verified" ? boundedArray(source.prebookings, 20).map(safeMms).filter(Boolean) : [],
  };
}

function safeMms(value) {
  if (!isPlainObject(value)) return null;
  const date = safeDate(value.date);
  if (!date) return null;
  return compact({
    prebooking_number: safeIdentifier(value.prebooking_number),
    therapist_display_name: safeText(value.therapist_display_name, 80),
    service: safeText(value.service, 80) || "MMD Service",
    date,
    time: safeTime(value.time),
    zone: safeText(value.zone, 80),
    status: safeChoice(value.status, new Set(["requested", "pending", "confirmed", "scheduled", "completed", "cancelled", "under_review"]), "under_review"),
  });
}

function safeTier(value, blackCardVisible) {
  const tier = String(value || "").trim();
  if (tier === "Black Card") return blackCardVisible ? "Black Card" : "Member";
  return SAFE_TIERS.has(tier) && tier !== "Black Card" ? tier : "Member";
}

function blockedLegacyTier(value) {
  const tier = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "_");
  return tier === "svip" || tier === "black_card" || tier === "blackcard";
}

function safeChoice(value, choices, fallback) { return choices.has(String(value || "")) ? String(value) : fallback; }
function safeDate(value) {
  const text = String(value || "");
  const match = DATE_RE.exec(text);
  if (!match) return "";
  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? text : "";
}
function safeTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : ""; }
function safeText(value, max) { const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); return text && !FORBIDDEN_TEXT_RE.test(text) ? text.slice(0, max) : ""; }
function safeIdentifier(value) { const text = String(value || "").trim(); return /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(text) && !/^(?:rec|app|tbl|att)[A-Za-z0-9]+$/i.test(text) && !/^U[a-f0-9]{20,}$/i.test(text) && !FORBIDDEN_TEXT_RE.test(text) ? text : ""; }
function safePackageCode(value) { const code = String(value || "").trim().toLowerCase(); return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(code) && !FORBIDDEN_TEXT_RE.test(code) ? code : ""; }
function safeNonNegativeInteger(value) { if (value === undefined || value === null || String(value).trim() === "") return null; const number = Number(value); return Number.isInteger(number) && number >= 0 && number <= 1000000 ? number : null; }
function safeSignedInteger(value) { if (value === undefined || value === null || String(value).trim() === "") return null; const number = Number(value); return Number.isInteger(number) && Math.abs(number) <= 1000000 ? number : null; }
function safeMoney(value) { if (value === undefined || value === null || String(value).trim() === "") return null; const number = Number(value); return Number.isInteger(number) && number >= 0 && number <= 100000000 ? number : null; }
function boundedInteger(value, min, max) { if (value === undefined || value === null || String(value).trim() === "") return null; const number = Number(value); return Number.isInteger(number) && number >= min && number <= max ? number : null; }
function boundedArray(value, max) { return Array.isArray(value) ? value.slice(0, max) : []; }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")); }
function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
