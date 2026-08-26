const CUSTOMER_360_VERSION = "customer_360_v2";
const HISTORY_DAYS = 365;
const HISTORY_MAX_ITEMS = 50;
const POINTS_HISTORY_MAX_ITEMS = 50;
const PAYMENT_HISTORY_MAX_ITEMS = 20;
const JOBS_MAX_ITEMS = 50;
const REQUESTS_MAX_ITEMS = 20;
const POINTS_THB_PER_POINT = 100;
const POINTS_EXPIRING_SOON_DAYS = 30;

const MEMBER_STATES = new Set(["active", "grace", "expired", "checking"]);
const PACKAGE_STATES = new Set(["active", "grace", "expired", "cancelled", "refunded", "checking"]);
const PAYMENT_STATES = new Set(["verified", "pending_review", "unavailable"]);
const JOB_STATES = new Set(["upcoming", "active", "completed", "cancelled"]);
const HISTORY_TYPES = new Set(["service", "membership", "points", "payment", "campaign", "privilege"]);
const HISTORY_TYPE_ORDER = ["service", "membership", "points", "payment", "campaign", "privilege"];
const INTERNAL_TEXT_RE = /\b(?:pn|mk|burn|svip|r2|drive|airtable|telegram|line[_\s-]?user|payment[_\s-]?ref|provider|bank|slip|commission|referral|risk|internal|admin|eligib(?:ility|le)?|proposal|private[_\s-]?model|model[_\s-]?ability|orientation)\b/i;

export async function buildCustomer360MemberProfile({ env = {}, memberFields = {}, lineUserId = "", listRecords, now = new Date() } = {}) {
  if (typeof listRecords !== "function") throw new TypeError("customer_360_list_records_required");

  const identity = customerIdentity(env, memberFields, lineUserId);
  const window = historyWindow(now);
  const [packagesResult, pointsResult, jobsResult, paymentsResult] = await Promise.all([
    readPackages(env, identity, listRecords, window),
    readPoints(env, identity, listRecords, window),
    readJobs(env, identity, listRecords, window),
    readPayments(env, identity, listRecords, window),
  ]);

  const member = resolveMember(memberFields, identity, packagesResult, env);
  const history = buildHistory({
    window,
    packages: packagesResult,
    points: pointsResult,
    jobs: jobsResult,
    payments: paymentsResult,
  });
  const requests = buildRequests(jobsResult.raw_records, env, window, jobsResult.status);
  const mms = buildMmsSummary(jobsResult.raw_records, env, window, jobsResult.status);
  const customer360 = {
    version: CUSTOMER_360_VERSION,
    member,
    points: pointsResult.customer,
    packages: packagesResult.customer,
    jobs: jobsResult.customer,
    payments: paymentsResult.customer,
    history,
    requests,
    // CARE BACK already owns its verified claim lifecycle in member-pages-worker.
    // Do not infer a benefit from a general member lookup.
    care: { status: "checking", privileges: [] },
    mms,
  };

  return {
    // Retain this compact compatibility view for the existing LIFF session and
    // CARE BACK coordinator. The nested contract below is the V2 source of UI truth.
    display_name: member.display_name,
    member_id: member.member_id,
    tier: member.tier,
    membership_status: member.membership_status,
    membership_start: member.membership_start,
    membership_expires_at: member.membership_expires_at,
    points: pointsResult.customer.active_points,
    points_records_count: pointsResult.customer.records_count,
    payment_status: paymentsResult.customer.status,
    payment_history: paymentsResult.customer.historical_verified,
    history_window: { from: window.from, to: window.to, timezone: "Asia/Bangkok" },
    history: history.events,
    customer_360: customer360,
  };
}

async function readPackages(env, identity, listRecords, window) {
  const formula = formulaForIdentity({
    email: { field: configuredField(env, "AIRTABLE_MEMBER_PACKAGES_EMAIL_FIELD", "member_email"), value: identity.email, lower: true },
    memberId: { field: configuredOptionalField(env, "AIRTABLE_MEMBER_PACKAGES_MEMBER_ID_FIELD"), value: identity.member_id },
  });
  if (!formula) return emptyPackageResult("checking");

  try {
    const records = await listRecords("MEMBER_PACKAGES", {
      filterByFormula: formula,
      sort: [{ field: configuredField(env, "AIRTABLE_MEMBER_PACKAGES_CREATED_FIELD", "created_at"), direction: "desc" }],
      maxRecords: 100,
    });
    const packages = Array.isArray(records) ? records.map((record) => packageRecord(record?.fields, env)).filter(Boolean) : [];
    const current = resolveCurrentPackage(packages);
    const membership = membershipFromCurrentPackage(current);
    const history = packages
      .filter((item) => item.date && item.date >= window.from)
      .map((item) => ({ type: "membership", date: item.date, title: item.customer_safe_name, status: item.status }))
      .slice(0, HISTORY_MAX_ITEMS);
    const status = current.kind === "ambiguous" ? "checking" : "verified";
    const currentPackage = current.kind === "resolved" && ["active", "grace"].includes(current.value.status)
      ? current.value
      : null;
    const membershipStart = currentPackage?.start_date || null;
    const membershipExpiresAt = currentPackage?.end_date || null;
    return {
      status,
      raw_records: Array.isArray(records) ? records : [],
      history,
      customer: {
        status,
        current_package: currentPackage ? customerPackage(currentPackage) : null,
        package_history: packages.slice(0, HISTORY_MAX_ITEMS).map(customerPackage),
        actions: packageActions(membership.status),
      },
      membership,
      membership_start: membershipStart,
      membership_expires_at: membershipExpiresAt,
      tier: currentPackage?.tier || null,
      black_card_customer_visible: currentPackage?.customer_visible_black_card === true,
    };
  } catch {
    return emptyPackageResult("checking");
  }
}

function emptyPackageResult(status) {
  return {
    status,
    raw_records: [],
    history: [],
    customer: { status, current_package: null, package_history: [], actions: [] },
    membership: { status: "checking" },
    membership_start: null,
    membership_expires_at: null,
    tier: null,
    black_card_customer_visible: false,
  };
}

function packageRecord(fields = {}, env = {}) {
  const code = packageCode(readField(fields, [configuredField(env, "AIRTABLE_MEMBER_PACKAGES_CODE_FIELD", "package_code"), "code"]));
  const status = normalizePackageStatus(readField(fields, [configuredField(env, "AIRTABLE_MEMBER_PACKAGES_STATUS_FIELD", "status"), "package_status"]));
  if (!status) return null;
  const createdValue = readField(fields, [configuredField(env, "AIRTABLE_MEMBER_PACKAGES_CREATED_FIELD", "created_at")]);
  const createdAt = strictTimestamp(createdValue);
  const createdDate = strictDate(createdValue);
  const startDate = strictCalendarDate(readField(fields, [configuredField(env, "AIRTABLE_MEMBER_PACKAGES_START_DATE_FIELD", "start_date")]));
  const endDate = strictCalendarDate(readField(fields, [configuredField(env, "AIRTABLE_MEMBER_PACKAGES_END_DATE_FIELD", "end_date")]));
  const duration = safeInteger(readField(fields, [configuredField(env, "AIRTABLE_MEMBER_PACKAGES_DURATION_FIELD", "duration_days")]));
  const customerVisibleBlackCard = readField(fields, [configuredOptionalField(env, "AIRTABLE_MEMBER_PACKAGES_BLACK_CARD_VISIBLE_FIELD"), "customer_visible"]) === true;
  const tier = customerTierFromPackage(code, customerVisibleBlackCard);
  return {
    code,
    customer_safe_name: safePackageName(code, customerVisibleBlackCard),
    tier,
    status,
    start_date: startDate || null,
    end_date: endDate || null,
    duration_days: duration !== null && duration > 0 && duration <= 3660 ? duration : null,
    customer_visible_black_card: customerVisibleBlackCard,
    created_at: createdAt,
    date: startDate || createdDate || endDate || null,
  };
}

function customerPackage(value) {
  return {
    code: value.code || null,
    customer_safe_name: value.customer_safe_name,
    tier: value.tier,
    status: value.status,
    start_date: value.start_date,
    end_date: value.end_date,
    duration_days: value.duration_days,
  };
}

function resolveCurrentPackage(packages) {
  if (!packages.length) return { kind: "none" };
  if (packages.length === 1) return { kind: "resolved", value: packages[0] };
  if (packages.some((item) => item.created_at === null)) return { kind: "ambiguous" };
  const newest = Math.max(...packages.map((item) => item.created_at));
  const winners = packages.filter((item) => item.created_at === newest);
  return winners.length === 1 ? { kind: "resolved", value: winners[0] } : { kind: "ambiguous" };
}

function membershipFromCurrentPackage(current) {
  if (current.kind !== "resolved") return { status: "checking" };
  const status = current.value.status;
  if (status === "active" || status === "grace" || status === "expired") return { status };
  return { status: "checking" };
}

function packageActions(membershipStatus) {
  if (membershipStatus === "expired") return [{ id: "renew", state: "available" }];
  if (membershipStatus === "active" || membershipStatus === "grace") return [{ id: "compare_package", state: "available" }];
  return [];
}

async function readPoints(env, identity, listRecords, window) {
  const formula = formulaForIdentity({
    email: { field: configuredField(env, "AIRTABLE_POINTS_EMAIL_FIELD", "member_email"), value: identity.email, lower: true },
    memberId: { field: configuredOptionalField(env, "AIRTABLE_POINTS_MEMBER_ID_FIELD"), value: identity.member_id },
  });
  if (!formula) return emptyPointsResult("checking", window);

  try {
    const records = await listRecords("POINTS_LEDGER", {
      filterByFormula: formula,
      sort: [{ field: configuredField(env, "AIRTABLE_POINTS_HISTORY_DATE_FIELD", "created_at"), direction: "desc" }],
      maxRecords: 200,
    });
    const today = window.to;
    const seen = new Set();
    const events = [];
    for (const record of Array.isArray(records) ? records : []) {
      const event = pointsRecord(record?.fields, env, today);
      if (!event || event.date < window.from) continue;
      if (event.dedupe_key && seen.has(event.dedupe_key)) continue;
      if (event.dedupe_key) seen.add(event.dedupe_key);
      events.push(event);
    }
    events.sort((a, b) => b.date.localeCompare(a.date));
    const active = events.filter((event) => event.active);
    const activePoints = Math.max(0, active.reduce((total, event) => total + event.points_delta, 0));
    const expiring = events.filter((event) => event.points_delta > 0 && event.expires_at && event.expires_at >= today && event.expires_at <= addCalendarDays(today, POINTS_EXPIRING_SOON_DAYS));
    const nearestExpiry = events
      .filter((event) => event.points_delta > 0 && event.expires_at && event.expires_at >= today)
      .map((event) => event.expires_at)
      .sort()[0] || null;
    const history = events.slice(0, POINTS_HISTORY_MAX_ITEMS).map((event) => ({
      date: event.date,
      title: event.points_delta >= 0 ? "Points added" : "Points adjusted",
      points_delta: event.points_delta,
      status: "posted",
      expires_at: event.expires_at,
    }));
    return {
      status: "verified",
      history_events: history.map((event) => ({ type: "points", ...event })),
      customer: {
        status: "verified",
        active_points: activePoints,
        records_count: events.length,
        rate_policy: { currency: "THB", thb_per_point: POINTS_THB_PER_POINT, rounding: "floor" },
        history,
        expiring_points: expiring.reduce((total, event) => total + event.points_delta, 0),
        nearest_expiry: nearestExpiry,
      },
    };
  } catch {
    return emptyPointsResult("checking", window);
  }
}

function emptyPointsResult(status, _window) {
  return {
    status,
    history_events: [],
    customer: {
      status,
      active_points: null,
      records_count: null,
      rate_policy: { currency: "THB", thb_per_point: POINTS_THB_PER_POINT, rounding: "floor" },
      history: [],
      expiring_points: null,
      nearest_expiry: null,
    },
  };
}

function pointsRecord(fields = {}, env = {}, today = "") {
  const transactionStatus = normalizeLedgerStatus(readField(fields, [configuredField(env, "AIRTABLE_POINTS_STATUS_FIELD", "transaction_status"), "status"]));
  if (!transactionStatus) return null;
  const date = strictDate(readField(fields, [configuredField(env, "AIRTABLE_POINTS_POSTED_AT_FIELD", "posted_at"), configuredField(env, "AIRTABLE_POINTS_HISTORY_DATE_FIELD", "created_at")]));
  if (!date) return null;
  const explicitPoints = signedSafeInteger(readField(fields, [configuredField(env, "AIRTABLE_POINTS_VALUE_FIELD", "points")]));
  const amount = safeNonNegativeNumber(readField(fields, [configuredOptionalField(env, "AIRTABLE_POINTS_AMOUNT_THB_FIELD"), "amount_thb"]));
  const pointsDelta = explicitPoints ?? (amount === null ? null : Math.floor(amount / POINTS_THB_PER_POINT));
  if (pointsDelta === null) return null;
  const explicitExpiry = strictDate(readField(fields, [configuredOptionalField(env, "AIRTABLE_POINTS_EXPIRES_AT_FIELD"), "expires_at"]));
  const expiresAt = explicitExpiry || addCalendarDays(date, HISTORY_DAYS);
  const dedupeKey = safeDedupeKey(readField(fields, [
    configuredOptionalField(env, "AIRTABLE_POINTS_IDEMPOTENCY_FIELD"),
    "idempotency_key",
    "logical_source_id",
    "transaction_id",
    "source_event_id",
    "service_event_id",
    "session_id",
  ]));
  const active = pointsDelta < 0 ? date >= addCalendarDays(today, -HISTORY_DAYS) : expiresAt >= today;
  return { date, points_delta: pointsDelta, expires_at: expiresAt, dedupe_key: dedupeKey, active };
}

async function readJobs(env, identity, listRecords, window) {
  const formula = formulaForIdentity({
    lineUserId: { field: configuredField(env, "AIRTABLE_SESSIONS_LINE_USER_ID_FIELD", "line_user_id"), value: identity.line_user_id },
    email: { field: configuredField(env, "AIRTABLE_SESSIONS_EMAIL_FIELD", "email"), value: identity.email, lower: true },
    memberId: { field: configuredOptionalField(env, "AIRTABLE_SESSIONS_MEMBER_ID_FIELD"), value: identity.member_id },
  });
  if (!formula) return emptyJobsResult("checking");

  try {
    const records = await listRecords("SESSIONS", {
      filterByFormula: formula,
      sort: [{ field: configuredField(env, "AIRTABLE_SESSIONS_HISTORY_DATE_FIELD", "job_date"), direction: "desc" }],
      maxRecords: 200,
    });
    const jobs = (Array.isArray(records) ? records : [])
      .map((record) => customerSafeJob(record?.fields, env))
      .filter(Boolean)
      .filter((job) => job.date >= window.from)
      .slice(0, JOBS_MAX_ITEMS);
    const grouped = Object.fromEntries([...JOB_STATES].map((state) => [state, jobs.filter((job) => job.status === state)]));
    const historyEvents = jobs.map((job) => ({ type: "service", date: job.date, title: job.service_title, status: job.status }));
    return {
      status: "verified",
      raw_records: Array.isArray(records) ? records : [],
      history_events: historyEvents,
      customer: {
        status: "verified",
        upcoming_jobs: grouped.upcoming,
        active_jobs: grouped.active,
        completed_jobs: grouped.completed,
        cancelled_jobs: grouped.cancelled,
      },
    };
  } catch {
    return emptyJobsResult("checking");
  }
}

function emptyJobsResult(status) {
  return {
    status,
    raw_records: [],
    history_events: [],
    customer: { status, upcoming_jobs: [], active_jobs: [], completed_jobs: [], cancelled_jobs: [] },
  };
}

function customerSafeJob(fields = {}, env = {}) {
  if (String(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_SERVICE_FAMILY_FIELD"), "service_family", "service_category"])).trim().toLowerCase() === "mms") return null;
  const status = normalizeJobStatus(readField(fields, [configuredField(env, "AIRTABLE_SESSIONS_STATUS_FIELD", "Session Status"), "status", "service_status"]));
  const date = strictDate(readField(fields, [configuredField(env, "AIRTABLE_SESSIONS_HISTORY_DATE_FIELD", "job_date"), "Session Date", "start_date"]));
  if (!JOB_STATES.has(status) || !date) return null;
  const serviceTitle = customerSafeServiceTitle(readField(fields, [configuredField(env, "AIRTABLE_SESSIONS_SERVICE_TYPE_FIELD", "job_type"), "Session Type", "work_type", "service_title"]));
  return compactObject({
    job_number: customerSafeIdentifier(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_JOB_NUMBER_FIELD"), "job_number", "Job Number", "public_job_id"])),
    date,
    start_time: customerSafeTime(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_START_TIME_FIELD"), "start_time", "Start Time"])),
    end_time: customerSafeTime(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_END_TIME_FIELD"), "end_time", "End Time"])),
    duration: safeDuration(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_DURATION_FIELD"), "duration_minutes", "duration"])),
    model_display_name: customerSafeText(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_MODEL_DISPLAY_NAME_FIELD"), "model_display_name", "Model Display Name"]), 80),
    service_title: serviceTitle,
    status,
    location_customer_safe: customerSafeText(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_LOCATION_CUSTOMER_SAFE_FIELD"), "customer_location"]), 120),
    customer_safe_note: customerSafeText(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_CUSTOMER_SAFE_NOTE_FIELD"), "customer_safe_note"]), 240),
    payment_status: customerSafePaymentStatus(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_PAYMENT_STATUS_FIELD"), "payment_status", "Payment Status"]), readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_VERIFICATION_STATUS_FIELD"), "verification_status", "Verification Status"])),
  });
}

async function readPayments(env, identity, listRecords, window) {
  const formula = formulaForIdentity({
    email: { field: configuredField(env, "AIRTABLE_PAYMENTS_EMAIL_FIELD", "member_email"), value: identity.email, lower: true },
    memberId: { field: configuredOptionalField(env, "AIRTABLE_PAYMENTS_MEMBER_ID_FIELD"), value: identity.member_id },
  });
  if (!formula) return emptyPaymentsResult("checking");

  try {
    const records = await listRecords("PAYMENTS", {
      filterByFormula: formula,
      sort: [{ field: configuredField(env, "AIRTABLE_PAYMENTS_CREATED_FIELD", "Created At"), direction: "desc" }],
      maxRecords: 100,
    });
    const all = Array.isArray(records) ? records.map((record) => paymentRecord(record?.fields, env)).filter(Boolean) : [];
    const latest = all[0] || null;
    const history = all
      .filter((payment) => payment.status === "verified" && payment.date && payment.date >= window.from)
      .slice(0, PAYMENT_HISTORY_MAX_ITEMS)
      .map((payment) => compactObject({ date: payment.date, title: payment.title, amount: payment.amount, status: "verified" }));
    return {
      status: "verified",
      history_events: history.map((payment) => ({ type: "payment", date: payment.date, title: payment.title, status: payment.status })),
      customer: { status: latest?.status || "unavailable", historical_verified: history },
    };
  } catch {
    return emptyPaymentsResult("checking");
  }
}

function emptyPaymentsResult(status) {
  return { status, history_events: [], customer: { status: status === "verified" ? "unavailable" : "unavailable", historical_verified: [] } };
}

function paymentRecord(fields = {}, env = {}) {
  const status = customerSafePaymentStatus(
    readField(fields, [configuredField(env, "AIRTABLE_PAYMENTS_STATUS_FIELD", "Payment Status"), "payment_status"]),
    readField(fields, [configuredField(env, "AIRTABLE_PAYMENTS_VERIFICATION_FIELD", "Verification Status"), "verification_status"]),
  );
  const date = strictDate(readField(fields, [configuredField(env, "AIRTABLE_PAYMENTS_DATE_FIELD", "Payment Date"), configuredField(env, "AIRTABLE_PAYMENTS_CREATED_FIELD", "Created At"), "created_at"]));
  const amount = safeMoney(readField(fields, [configuredOptionalField(env, "AIRTABLE_PAYMENTS_AMOUNT_FIELD"), "amount_thb", "Amount THB", "amount"]));
  const title = customerSafePaymentTitle(readField(fields, [configuredOptionalField(env, "AIRTABLE_PAYMENTS_TITLE_FIELD"), "customer_title", "purpose", "Payment For"]));
  return { date, status, amount, title };
}

function buildHistory({ window, packages, points, jobs, payments }) {
  const events = [
    ...packages.history,
    ...points.history_events,
    ...jobs.history_events,
    ...payments.history_events,
  ].filter((item) => HISTORY_TYPES.has(item.type) && item.date >= window.from && item.date <= window.to)
    .map((item) => compactObject({
      type: item.type,
      date: item.date,
      title: customerSafeText(item.title, 80) || "MMD activity",
      status: safeHistoryStatus(item.status),
      points_delta: item.type === "points" ? signedSafeInteger(item.points_delta) : undefined,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || HISTORY_TYPE_ORDER.indexOf(a.type) - HISTORY_TYPE_ORDER.indexOf(b.type))
    .slice(0, HISTORY_MAX_ITEMS);
  const sourceStatuses = [packages.status, points.status, jobs.status, payments.status];
  return {
    status: sourceStatuses.every((status) => status === "verified") ? "verified" : "checking",
    from: window.from,
    to: window.to,
    range_days: HISTORY_DAYS,
    events,
  };
}

function buildRequests(records = [], env = {}, window, sourceStatus = "checking") {
  if (sourceStatus !== "verified") return { status: "checking", items: [] };
  const items = (Array.isArray(records) ? records : []).map((record) => {
    const fields = record?.fields || {};
    const status = normalizeRequestStatus(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_REQUEST_STATUS_FIELD"), "request_status", "Booking Status"]));
    const date = strictDate(readField(fields, [configuredField(env, "AIRTABLE_SESSIONS_HISTORY_DATE_FIELD", "job_date"), "requested_date", "preferred_date"]));
    if (!status || !date || date < window.from) return null;
    return compactObject({
      request_number: customerSafeIdentifier(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_REQUEST_NUMBER_FIELD"), "request_number", "booking_request_number"])),
      requested_model_display_name: customerSafeText(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_REQUEST_MODEL_FIELD"), "requested_model_display_name", "model_display_name"]), 80),
      preferred_date: date,
      preferred_time: customerSafeTime(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_REQUEST_TIME_FIELD"), "preferred_time", "start_time"])),
      status,
      safe_next_action: safeRequestNextAction(status),
    });
  }).filter(Boolean).slice(0, REQUESTS_MAX_ITEMS);
  return { status: "verified", items };
}

function buildMmsSummary(records = [], env = {}, window, sourceStatus = "checking") {
  if (sourceStatus !== "verified") return { status: "checking", prebookings: [] };
  const prebookings = (Array.isArray(records) ? records : []).map((record) => {
    const fields = record?.fields || {};
    const family = String(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_SERVICE_FAMILY_FIELD"), "service_family", "service_category"])).trim().toLowerCase();
    if (family !== "mms") return null;
    const date = strictDate(readField(fields, [configuredField(env, "AIRTABLE_SESSIONS_HISTORY_DATE_FIELD", "job_date"), "prebooking_date"]));
    if (!date || date < window.from) return null;
    return compactObject({
      prebooking_number: customerSafeIdentifier(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_MMS_PREBOOKING_NUMBER_FIELD"), "prebooking_number"])),
      therapist_display_name: customerSafeText(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_MMS_THERAPIST_DISPLAY_NAME_FIELD"), "therapist_display_name"]), 80),
      service: customerSafeServiceTitle(readField(fields, [configuredField(env, "AIRTABLE_SESSIONS_SERVICE_TYPE_FIELD", "job_type"), "service"])),
      date,
      time: customerSafeTime(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_START_TIME_FIELD"), "start_time"])),
      zone: customerSafeText(readField(fields, [configuredOptionalField(env, "AIRTABLE_SESSIONS_MMS_ZONE_FIELD"), "zone"]), 80),
      status: normalizeMmsStatus(readField(fields, [configuredField(env, "AIRTABLE_SESSIONS_STATUS_FIELD", "Session Status"), "status"])),
    });
  }).filter(Boolean).slice(0, REQUESTS_MAX_ITEMS);
  return prebookings.length ? { status: "verified", prebookings } : { status: "not_available", prebookings: [] };
}

function resolveMember(fields = {}, identity, packages, env = {}) {
  const displayName = customerSafeText(readField(fields, [configuredField(env, "AIRTABLE_MEMBERS_DISPLAY_NAME_FIELD", "Full Name (Display)"), "Full Name (Display)", "Full Name", "name"]), 120) || "สมาชิก MMD";
  const packageTier = packages.tier;
  const membershipStatus = MEMBER_STATES.has(packages.membership.status) ? packages.membership.status : "checking";
  return {
    display_name: displayName,
    member_id: identity.member_id || null,
    // Only a unique current package can raise the customer-facing tier.
    tier: packageTier || "Member",
    black_card_customer_visible: packages.black_card_customer_visible === true,
    membership_status: membershipStatus,
    membership_start: packages.membership_start,
    membership_expires_at: packages.membership_expires_at,
  };
}

function customerIdentity(env, fields, lineUserId) {
  const memberId = customerSafeIdentifier(readField(fields, [configuredOptionalField(env, "AIRTABLE_MEMBERS_MEMBER_ID_FIELD"), "member_id"]));
  const email = normalizedEmail(readField(fields, [configuredField(env, "AIRTABLE_MEMBERS_EMAIL_FIELD", "Contact Email"), "email"]));
  return { line_user_id: String(lineUserId || "").trim(), member_id: memberId, email };
}

function formulaForIdentity(candidates) {
  const clauses = [];
  for (const candidate of Object.values(candidates)) {
    if (!candidate?.field || !candidate?.value) continue;
    const value = candidate.lower ? String(candidate.value).toLowerCase() : String(candidate.value);
    clauses.push(candidate.lower ? `LOWER({${candidate.field}})=${formulaString(value)}` : `{${candidate.field}}=${formulaString(value)}`);
  }
  if (!clauses.length) return "";
  return clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
}

function configuredField(env, key, fallback) {
  return String(env?.[key] || fallback || "").trim();
}

function configuredOptionalField(env, key) {
  return String(env?.[key] || "").trim();
}

function readField(fields = {}, names = []) {
  for (const name of names) {
    if (!name) continue;
    const value = fields[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function normalizedEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function customerSafeIdentifier(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(text)) return "";
  if (/^(?:rec|app|tbl|att)[A-Za-z0-9]+$/i.test(text)) return "";
  return INTERNAL_TEXT_RE.test(text) ? "" : text;
}

function packageCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(code) ? code : "";
}

function normalizePackageStatus(value) {
  const status = normalizedStatus(value);
  if (status === "grace_period") return "grace";
  return PACKAGE_STATES.has(status) ? status : "";
}

function normalizeLedgerStatus(value) {
  const status = normalizedStatus(value);
  return ["posted", "verified", "completed"].includes(status) ? status : "";
}

function normalizeJobStatus(value) {
  const status = normalizedStatus(value);
  if (["upcoming", "confirmed", "scheduled", "booked"].includes(status)) return "upcoming";
  if (["active", "en_route", "arrived", "met", "work_started", "in_progress"].includes(status)) return "active";
  if (["completed", "complete", "done"].includes(status)) return "completed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return "";
}

function normalizeRequestStatus(value) {
  const status = normalizedStatus(value);
  if (["requested", "submitted", "pending", "under_review", "confirmed", "cancelled"].includes(status)) return status;
  return "";
}

function normalizeMmsStatus(value) {
  const status = normalizedStatus(value);
  return ["requested", "pending", "confirmed", "scheduled", "completed", "cancelled"].includes(status) ? status : "under_review";
}

function normalizedStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function customerSafePaymentStatus(paymentValue, verificationValue) {
  const payment = normalizedStatus(paymentValue);
  const verification = normalizedStatus(verificationValue);
  if (payment === "paid" && verification === "verified") return "verified";
  if (payment === "pending" && ["pending", "pending_review", "under_review"].includes(verification)) return "pending_review";
  return "unavailable";
}

function customerTierFromPackage(code, blackCardVisible) {
  if (/svip/.test(code)) return null;
  if (/blackcard|black_card/.test(code)) return blackCardVisible ? "Black Card" : null;
  if (/premium/.test(code)) return "Premium";
  if (/vip/.test(code)) return "VIP";
  if (/standard|lite/.test(code)) return "Standard";
  if (/7days|7_day|guest/.test(code)) return "Member";
  return null;
}

function customerTier(value, blackCardVisible) {
  const tier = normalizedStatus(value);
  if (tier === "premium") return "Premium";
  if (tier === "vip") return "VIP";
  if (tier === "standard" || tier === "lite") return "Standard";
  if (tier === "black_card" || tier === "blackcard") return blackCardVisible ? "Black Card" : null;
  // SVIP is never inferred into customer output.
  return tier === "member" ? "Member" : null;
}

function safePackageName(code, blackCardVisible) {
  if (/blackcard|black_card/.test(code)) return blackCardVisible ? "Black Card Membership" : "MMD Membership";
  if (/premium/.test(code)) return "Premium Membership";
  if (/vip/.test(code)) return "VIP Membership";
  if (/standard|lite/.test(code)) return "Standard Membership";
  if (/7days|7_day|guest/.test(code)) return "7 Days Guest Pass";
  return "MMD Membership";
}

function customerSafeServiceTitle(value) {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (normalized === "partner_present_massage_session") return "Partner-Present Massage Session";
  if (!raw || INTERNAL_TEXT_RE.test(raw)) return "MMD Service";
  return customerSafeText(raw, 80) || "MMD Service";
}

function customerSafePaymentTitle(value) {
  const title = customerSafeText(value, 80);
  return title || "MMD payment";
}

function customerSafeText(value, maxLength) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || INTERNAL_TEXT_RE.test(text)) return "";
  return text.slice(0, maxLength);
}

function safeHistoryStatus(value) {
  const status = normalizedStatus(value);
  return ["active", "grace", "expired", "upcoming", "completed", "cancelled", "posted", "verified", "pending_review"].includes(status) ? status : "checking";
}

function safeDedupeKey(value) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9:_-]{1,160}$/.test(key) ? key : "";
}

function strictDate(value) {
  const text = String(value || "").trim();
  const direct = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (direct) return validCalendarDate(direct[1], direct[2], direct[3]) ? text : "";
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

function strictCalendarDate(value) {
  const text = String(value || "").trim();
  const direct = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return direct && validCalendarDate(direct[1], direct[2], direct[3]) ? text : "";
}

function strictTimestamp(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function validCalendarDate(yearText, monthText, dayText) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
}

function safeInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function signedSafeInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && Math.abs(number) <= 1000000 ? number : null;
}

function safeNonNegativeNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100000000 ? number : null;
}

function safeMoney(value) {
  const number = safeNonNegativeNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function safeDuration(value) {
  const duration = safeInteger(value);
  return duration !== null && duration > 0 && duration <= 1440 ? duration : null;
}

function customerSafeTime(value) {
  const text = String(value || "").trim();
  const direct = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(text);
  if (direct) {
    const hour = Number(direct[1]);
    const minute = Number(direct[2]);
    return hour < 24 && minute < 60 ? `${direct[1]}:${direct[2]}` : "";
  }
  const timestamp = /T(\d{2}):(\d{2})/.exec(text);
  if (timestamp) {
    const hour = Number(timestamp[1]);
    const minute = Number(timestamp[2]);
    return hour < 24 && minute < 60 ? `${timestamp[1]}:${timestamp[2]}` : "";
  }
  return "";
}

function safeRequestNextAction(status) {
  if (status === "requested" || status === "submitted") return "wait_for_review";
  if (status === "pending" || status === "under_review") return "wait_for_confirmation";
  if (status === "confirmed") return "view_job";
  return "none";
}

function historyWindow(now) {
  const to = bangkokDate(now);
  return { from: addCalendarDays(to, -HISTORY_DAYS), to };
}

function bangkokDate(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addCalendarDays(date, amount) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export const CUSTOMER_360_INTERNALS = Object.freeze({
  CUSTOMER_360_VERSION,
  HISTORY_DAYS,
  POINTS_THB_PER_POINT,
});
