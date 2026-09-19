const AIRTABLE_API = "https://api.airtable.com/v0";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const POLICY = "member_history_recovery_v2_note_first";
const STATUS_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 180;
const AIRTABLE_TIMEOUT_MS = 10000;
const HISTORY_WINDOW_YEARS = 5;
const POINT_RATE_THB = 100;
const POINTS_BUCKET = "base_phase1";
const POINTS_SOURCE = "line_ofc_history";

const TABLES = Object.freeze({
  CLIENTS: "tblVv58TCbwh5j1fS",
  MEMBERS: "tblgWc5VRon5o8Mhk",
  LEGACY_STAGING: "tbl1u0foFBvgFpT9G",
  PRIVATE_STAGING: "tblOs8yyLK09SKrCt",
  CONSOLE_INBOX: "tblFHmfpB2TTrzO2e",
  REVIEWS: "tblnpDFQMpo8AmNQv",
  PAYMENT_PROOFS: "tblfJfM4Sqag9zrLi",
  SESSIONS: "tblC98mKWbzmPuNzX",
  POINTS_LEDGER: "tbl5dfnwjUFMLbnWL",
});

const APPROVED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);

const STATUS_PATHS = new Set([
  "/api/member/app/history/recovery",
  "/api/member/app/history/recovery/",
]);
const REFRESH_PATHS = new Set([
  "/api/member/app/history/refresh",
  "/api/member/app/history/refresh/",
]);

export function isMemberHistoryRecoveryPath(requestOrUrl) {
  let url;
  try {
    url = requestOrUrl instanceof URL
      ? requestOrUrl
      : new URL(requestOrUrl instanceof Request ? requestOrUrl.url : String(requestOrUrl));
  } catch {
    return false;
  }
  return STATUS_PATHS.has(url.pathname) || REFRESH_PATHS.has(url.pathname);
}

export function isLiffHistoryRecoveryStartPath(requestOrUrl) {
  let url;
  try {
    url = requestOrUrl instanceof URL
      ? requestOrUrl
      : new URL(requestOrUrl instanceof Request ? requestOrUrl.url : String(requestOrUrl));
  } catch {
    return false;
  }
  return url.pathname === "/member/api/liff/start" || url.pathname === "/member/api/liff/start/";
}

export function scheduleMemberHistoryRecoveryFromLiffResponse(response, env = {}, ctx) {
  if (!(response instanceof Response) || response.status !== 200) return false;
  const token = responseCookieValue(response, SESSION_COOKIE);
  if (!token) return false;
  schedule(ctx, scheduleMemberHistoryRecoveryForSessionToken(token, env, ctx, "login"));
  return true;
}

export async function handleMemberHistoryRecoveryRequest(request, env = {}, ctx) {
  const url = new URL(request.url);
  if (!isMemberHistoryRecoveryPath(url)) return json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
  if (request.method === "OPTIONS") return corsResponse(request, env);
  if (!approvedOrigin(request, env)) return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED" } }, 403);
  if (!hasBindings(env)) return json({ ok: false, error: { code: "HISTORY_RECOVERY_NOT_CONFIGURED" } }, 503);

  const session = await readVerifiedMemberSession(request, env);
  if (!session) return json({ ok: false, error: { code: "MEMBER_SESSION_REQUIRED" } }, 401);

  if (STATUS_PATHS.has(url.pathname)) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    const status = await readMemberHistoryRecoveryStatus(env, session.line_user_id);
    return withCors(request, env, json({ ok: true, history_recovery: publicStatus(status) }, 200));
  }

  if (request.method !== "POST") return methodNotAllowed("POST");
  const existing = await readMemberHistoryRecoveryStatus(env, session.line_user_id);
  if (existing.state === "in_progress" && !refreshExpired(existing)) {
    return withCors(request, env, json({ ok: true, history_recovery: publicStatus(existing), accepted: false }, 200));
  }

  const queued = await markQueued(env, session.line_user_id, "manual_refresh");
  schedule(ctx, runMemberHistoryRecovery({
    env,
    lineUserId: session.line_user_id,
    memberId: clean(session.member_id),
    trigger: "manual_refresh",
  }));
  return withCors(request, env, json({ ok: true, history_recovery: publicStatus(queued), accepted: true }, 202));
}

export async function scheduleMemberHistoryRecoveryForSessionToken(token, env = {}, ctx, trigger = "login") {
  if (!hasBindings(env) || !safeToken(token)) return false;
  const session = await readSessionByToken(token, env);
  // LINE OFC history is the source of truth from the first login. Do not gate
  // the background scan on a pre-existing Member/Airtable wallet or a slip.
  if (!session || !safeLineUserId(session.line_user_id)) return false;
  const existing = await readMemberHistoryRecoveryStatus(env, session.line_user_id);
  if (existing.state === "in_progress" && !refreshExpired(existing)) return true;
  await markQueued(env, session.line_user_id, trigger);
  schedule(ctx, runMemberHistoryRecovery({
    env,
    lineUserId: session.line_user_id,
    memberId: clean(session.member_id),
    trigger,
  }));
  return true;
}

export async function runMemberHistoryRecovery({
  env = {},
  lineUserId,
  memberId = "",
  trigger = "login",
  store,
  now = new Date(),
} = {}) {
  if (!hasBindings(env) && !store) return statusPayload("blocked", { reason: "not_configured", trigger });
  if (!safeLineUserId(lineUserId)) return statusPayload("blocked", { reason: "identity_invalid", trigger });

  const db = store || new AirtableHistoryStore(env);
  const lockKey = await recoveryKey("lock", lineUserId);
  const statusKey = await recoveryKey("status", lineUserId);
  const startedAt = now.toISOString();

  try {
    const held = await env.LIFF_IDENTITY_KV?.get(lockKey, "json").catch(() => null);
    if (held?.started_at && Date.now() - Date.parse(held.started_at) < LOCK_TTL_SECONDS * 1000) {
      return await readMemberHistoryRecoveryStatus(env, lineUserId);
    }
    if (env.LIFF_IDENTITY_KV?.put) {
      await env.LIFF_IDENTITY_KV.put(lockKey, JSON.stringify({ started_at: startedAt, trigger }), { expirationTtl: LOCK_TTL_SECONDS });
    }

    await writeStatusKey(env, statusKey, statusPayload("in_progress", {
      trigger,
      started_at: startedAt,
      updated_at: startedAt,
    }));

    // LINE OFC is the source of truth. Read it before trying to resolve a
    // canonical Client so a first-time login is never blocked by a missing or
    // ambiguous Airtable link. A Client/Member wallet is only an enrichment
    // target; it is not a prerequisite for displaying history or points.
    const [clients, legacyRows, privateRows, lineOfcRows, verifiedProofs] = await Promise.all([
      db.list(TABLES.CLIENTS, {
        formula: `{line_user_id}=${formulaString(lineUserId)}`,
        maxRecords: 3,
      }),
      db.list(TABLES.LEGACY_STAGING, { formula: `{line_user_id}=${formulaString(lineUserId)}` }),
      db.list(TABLES.PRIVATE_STAGING, { formula: `{LINE User ID}=${formulaString(lineUserId)}` }),
      db.list(TABLES.CONSOLE_INBOX, { formula: `{line_user_id}=${formulaString(lineUserId)}` }),
      db.list(TABLES.PAYMENT_PROOFS, { formula: `{status}=${formulaString("verified")}` }),
    ]);

    const client = clients.length === 1 ? clients[0] : null;
    const clientId = clean(client?.id) || `line:${lineUserId}`;
    const wallet = await resolveMemberWallet(db, { memberId, client });

    const rawCandidates = [
      ...lineOfcRows.map((record) => consoleInboxCandidate(record, clientId, lineUserId)).filter(Boolean),
      ...legacyRows.map((record) => legacyCandidate(record, clientId, lineUserId)),
      ...privateRows.map((record) => privateCandidate(record, clientId, lineUserId)),
    ].filter(Boolean);
    const candidates = await normalizeAndDedupeCandidates(rawCandidates);
    const cutoff = historyCutoff(now, HISTORY_WINDOW_YEARS);
    const inWindow = candidates.filter((candidate) => !candidate.service_date || candidate.service_date >= cutoff);
    const clientProofs = verifiedProofs.filter((record) => linkIds(record.fields?.Client).includes(clientId));

    const counters = {
      source_note_count: rawCandidates.filter((candidate) => candidate.note_present).length,
      candidate_count: inWindow.length,
      pending_review_count: 0,
      materialized_count: 0,
      duplicate_count: Math.max(0, rawCandidates.length - candidates.length),
      rejected_count: 0,
      undated_note_count: 0,
      note_without_amount_count: 0,
      unmatched_payment_count: 0,
    };

    let eligibleSpend = 0;
    const acceptedCandidates = [];
    for (const candidate of inWindow) {
      // Without a canonical Client, keep the source evidence and points
      // target live for the signed-in LINE identity, but do not manufacture a
      // Sessions row with an invalid Client link. The next login can
      // materialize it once the canonical link is available.
      const outcome = client
        ? await processNoteCandidate({ db, candidate, trigger, now })
        : { kind: "source_only" };
      if (outcome.kind === "cancelled") {
        counters.rejected_count += 1;
        continue;
      }
      if (outcome.kind === "missing_note") {
        counters.pending_review_count += 1;
        continue;
      }
      acceptedCandidates.push(candidate);
      eligibleSpend += candidate.points_eligible_amount_thb;
      if (!candidate.service_date) counters.undated_note_count += 1;
      if (!(candidate.points_eligible_amount_thb > 0)) counters.note_without_amount_count += 1;
      if (outcome.kind === "materialized") counters.materialized_count += 1;
      if (outcome.kind === "duplicate") counters.duplicate_count += 1;
    }

    const orphanProofs = findOrphanPaymentProofs(clientProofs, acceptedCandidates);
    counters.unmatched_payment_count = orphanProofs.length;

    const sourcePending = rawCandidates.length === 0;
    const pointsTarget = notePointSummary(acceptedCandidates);
    const pointsResult = wallet
      ? sourcePending
        ? await readCurrentPointsTotal(db, wallet)
        : await reconcileHistoricalPointsTotal({ db, wallet, clientId, pointsTarget, now })
      : {
          ok: true,
          reason: client ? "canonical_member_wallet_missing" : "line_ofc_source_only",
          desired_points: pointsTarget.points,
          desired_eligible_amount_thb: pointsTarget.eligible_amount_thb,
          // The app reads this same source directly, so a wallet is not
          // required before the customer can receive the calculated balance.
          current_points_total: pointsTarget.points,
          historical_points_added: 0,
        };

    const detailPendingCount = acceptedCandidates.filter((candidate) => !candidate.service_date || !(candidate.points_eligible_amount_thb > 0)).length;
    // Missing slips are never a reason to withhold points. Only unresolved
    // identity/details and an unavailable wallet remain review conditions.
    counters.pending_review_count += detailPendingCount + counters.unmatched_payment_count;
    const state = counters.pending_review_count > 0 ? "review_required" : "reconciled";
    const done = statusPayload(state, {
      ...counters,
      verified_service_spend_thb: roundMoney(eligibleSpend),
      historical_points_recovered: pointsTarget.points,
      historical_points_added: pointsResult.historical_points_added,
      current_points_total: pointsResult.current_points_total,
      points_expire: false,
      history_window_years: HISTORY_WINDOW_YEARS,
      source_pending: sourcePending,
      trigger,
      started_at: startedAt,
      updated_at: new Date().toISOString(),
      reason: sourcePending
        ? "source_notes_pending"
        : !client
          ? "line_ofc_source_ready_client_link_pending"
        : state === "review_required"
          ? "points_ready_history_details_pending"
          : "note_first_recovery_complete",
    });
    await writeStatusKey(env, statusKey, done);
    return done;
  } catch (error) {
    const failed = statusPayload("blocked", {
      trigger,
      reason: safeErrorCode(error),
      started_at: startedAt,
      updated_at: new Date().toISOString(),
    });
    await writeStatusKey(env, statusKey, failed).catch(() => {});
    console.warn({ event: "member_history_recovery_failed", policy: POLICY, reason: failed.reason });
    return failed;
  } finally {
    if (env.LIFF_IDENTITY_KV?.delete) await env.LIFF_IDENTITY_KV.delete(lockKey).catch(() => {});
  }
}

async function processNoteCandidate({ db, candidate, trigger, now }) {
  const existing = await db.findOne(TABLES.REVIEWS, `{history_review_id}=${formulaString(candidate.history_review_id)}`);
  const existingStatus = clean(existing?.fields?.review_status).toLowerCase();
  const existingReviewer = clean(existing?.fields?.reviewed_by);
  const explicitlyRejected = existingStatus === "rejected" && existingReviewer && !existingReviewer.startsWith("system:");
  if (explicitlyRejected) return { kind: "cancelled" };

  if (candidate.cancelled) {
    await upsertReview(db, existing, candidate, compact({
      review_status: "rejected",
      decision: "reject_service_history",
      reviewed_by: `system:${POLICY}`,
      reviewed_at: now.toISOString(),
      review_note: reviewNote(trigger, "explicit_cancel_marker"),
    }));
    return { kind: "cancelled" };
  }

  if (!candidate.note_present) {
    await upsertReview(db, existing, candidate, compact({
      review_status: "needs_more_evidence",
      decision: "hold_for_review",
      reviewed_by: `system:${POLICY}`,
      reviewed_at: now.toISOString(),
      review_note: reviewNote(trigger, "note_evidence_missing"),
    }));
    return { kind: "missing_note" };
  }

  const reviewFields = compact({
    review_status: "approved",
    decision: "approve_service_history",
    approved_service_date: candidate.service_date || undefined,
    approved_service_amount_thb: candidate.service_amount_thb || undefined,
    points_review_status: candidate.points_eligible_amount_thb > 0 ? "approved" : "not_applicable",
    approved_points_eligible_amount_thb: candidate.points_eligible_amount_thb || undefined,
    reviewed_by: existingReviewer && !existingReviewer.startsWith("system:") ? existingReviewer : `system:${POLICY}`,
    reviewed_at: clean(existing?.fields?.reviewed_at) || now.toISOString(),
    materialization_idempotency_key: candidate.session_id,
    materialized_at: candidate.service_date ? now.toISOString() : undefined,
    review_note: existingReviewer && !existingReviewer.startsWith("system:")
      ? undefined
      : reviewNote(trigger, candidate.service_date ? "note_proves_occurrence" : "note_proves_occurrence_date_pending"),
  });
  const review = await upsertReview(db, existing, candidate, reviewFields);

  if (!candidate.service_date) return { kind: "approved_points_only" };
  const existingSessions = await db.list(TABLES.SESSIONS, {
    formula: `OR({session_id}=${formulaString(candidate.session_id)},{imported_source_ref}=${formulaString(candidate.history_review_id)})`,
    maxRecords: 3,
  });
  if (existingSessions.length > 1) return { kind: "duplicate" };
  if (existingSessions.length === 1) {
    if (review?.id) await db.update(TABLES.REVIEWS, review.id, { review_status: "materialized", materialized_at: now.toISOString() });
    return { kind: "duplicate" };
  }

  await db.create(TABLES.SESSIONS, compact({
    "Session Name": `Historical - ${candidate.service_date}`,
    Client: [candidate.client_id],
    "Session Status": "Completed",
    session_id: candidate.session_id,
    created_at: `${candidate.service_date}T12:00:00.000Z`,
    amount_thb: candidate.service_amount_thb || undefined,
    client_name: candidate.client_display_name || undefined,
    model_name: candidate.model_text || undefined,
    job_type: candidate.service_type || "historical_service",
    job_date: candidate.service_date,
    location_name: candidate.location_text || undefined,
    import_review_status: "approved",
    imported_source_ref: candidate.history_review_id,
    imported_confidence_score: candidate.points_eligible_amount_thb > 0 ? 90 : 75,
    client_note_short: "Recovered from an MMD-owned historical LINE note.",
  }));
  if (review?.id) await db.update(TABLES.REVIEWS, review.id, { review_status: "materialized", materialized_at: now.toISOString() });
  return { kind: "materialized" };
}

async function readCurrentPointsTotal(db, wallet) {
  const rows = await db.list(TABLES.POINTS_LEDGER, { formula: walletFormula(wallet), maxRecords: 2000 });
  return {
    ok: true,
    desired_points: 0,
    desired_eligible_amount_thb: 0,
    historical_points_added: 0,
    current_points_total: Math.max(0, rows.reduce((sum, row) => sum + postedPoints(row?.fields), 0)),
  };
}

async function reconcileHistoricalPointsTotal({ db, wallet, clientId, pointsTarget, now }) {
  const aggregateKey = `historical_note_total_v2:${clientId}`;
  const rows = await db.list(TABLES.POINTS_LEDGER, {
    formula: walletFormula(wallet),
    maxRecords: 2000,
  });
  const otherHistorical = rows.filter((row) => {
    const fields = row?.fields || {};
    const key = clean(fields.idempotency_key);
    if (key === aggregateKey) return false;
    return selectName(fields.source).toLowerCase() === POINTS_SOURCE
      || key.startsWith("historical_base:")
      || key.startsWith("historical_note:");
  });
  const otherHistoricalPoints = otherHistorical.reduce((sum, row) => sum + postedPoints(row?.fields), 0);
  const otherHistoricalSpend = otherHistorical.reduce((sum, row) => sum + historicalEligibleSpend(row?.fields), 0);
  const aggregatePoints = Math.max(0, pointsTarget.points - Math.max(0, otherHistoricalPoints));
  const aggregateSpend = Math.max(0, roundMoney(pointsTarget.eligible_amount_thb - Math.max(0, otherHistoricalSpend)));
  const existing = rows.find((row) => clean(row?.fields?.idempotency_key) === aggregateKey) || null;
  const previousPoints = existing ? Number(existing.fields?.points || 0) : 0;
  const fields = compact({
    "Points Entry": `hist_points_total_${await sha24(clientId)}`,
    member_id: wallet.member_id,
    member_email: wallet.member_email || undefined,
    amount_thb: aggregateSpend,
    eligible_amount_thb: aggregateSpend,
    points: aggregatePoints,
    rate_policy: "historical_lifetime_total_100_thb_1_point_v2",
    source: POINTS_SOURCE,
    note: `policy=${POLICY};window_years=${HISTORY_WINDOW_YEARS};expiry=none_phase1;notes_primary=true;slips_optional=true`,
    idempotency_key: aggregateKey,
    posted_at: now.toISOString(),
    transaction_status: "posted",
    created_by: POLICY,
    points_bucket: POINTS_BUCKET,
  });

  if (existing?.id) await db.update(TABLES.POINTS_LEDGER, existing.id, fields);
  else await db.create(TABLES.POINTS_LEDGER, fields);

  const afterRows = [
    ...rows.filter((row) => clean(row?.fields?.idempotency_key) !== aggregateKey),
    { id: existing?.id || "new-history-total", fields },
  ];
  const currentPointsTotal = Math.max(0, afterRows.reduce((sum, row) => sum + postedPoints(row?.fields), 0));
  return {
    ok: true,
    desired_points: pointsTarget.points,
    desired_eligible_amount_thb: pointsTarget.eligible_amount_thb,
    historical_points_added: aggregatePoints - previousPoints,
    current_points_total: currentPointsTotal,
  };
}

function postedPoints(fields = {}) {
  const status = selectName(fields.transaction_status || fields.status).toLowerCase();
  if (!["posted", "completed", "verified"].includes(status)) return 0;
  if (clean(fields.reversed_at) || status === "reversed") return 0;
  const value = Number(fields.points);
  if (Number.isFinite(value)) return Math.trunc(value);
  const amount = Number(fields.eligible_amount_thb ?? fields.amount_thb);
  return Number.isFinite(amount) ? Math.floor(amount / POINT_RATE_THB) : 0;
}

function historicalEligibleSpend(fields = {}) {
  const amount = Number(fields.eligible_amount_thb ?? fields.amount_thb);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function walletFormula(wallet) {
  const clauses = [];
  if (wallet.member_id) clauses.push(`{member_id}=${formulaString(wallet.member_id)}`);
  if (wallet.member_email) clauses.push(`LOWER({member_email}&"")=${formulaString(wallet.member_email.toLowerCase())}`);
  return clauses.length > 1 ? `OR(${clauses.join(",")})` : clauses[0] || "FALSE()";
}

async function resolveMemberWallet(db, { memberId = "", client } = {}) {
  const normalizedMemberId = clean(memberId);
  const clientEmail = normalizeEmail(client?.fields?.["Contact Email"] || client?.fields?.email);
  const clauses = [];
  if (normalizedMemberId) clauses.push(`{member_id}=${formulaString(normalizedMemberId)}`);
  if (clientEmail) clauses.push(`LOWER({Contact Email}&"")=${formulaString(clientEmail)}`, `LOWER({email}&"")=${formulaString(clientEmail)}`);
  if (!clauses.length) return null;
  const formula = clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
  const rows = await db.list(TABLES.MEMBERS, { formula, maxRecords: 3 });
  const unique = dedupeById(rows);
  if (unique.length !== 1) return null;
  const fields = unique[0].fields || {};
  const canonicalId = clean(fields.member_id) || normalizedMemberId;
  if (!canonicalId) return null;
  return {
    record_id: clean(unique[0].id),
    member_id: canonicalId,
    member_email: normalizeEmail(fields["Contact Email"] || fields.email || clientEmail),
  };
}

export function legacyCandidate(record, clientId, lineUserId = "") {
  const fields = record?.fields || {};
  const importId = clean(fields.import_id);
  const rawNote = clean(fields.raw_note);
  if (!importId && !rawNote) return null;
  const history = parseObject(fields.historical_events_json);
  const details = asObject(history.service_details);
  const serviceEvents = Array.isArray(history.amounts)
    ? history.amounts.filter((item) => clean(item?.type).toLowerCase() === "service" && money(item?.amount) > 0)
    : [];
  const dates = uniqueStrings(history.dates);
  const refs = uniqueStrings(history.payment_refs);
  const reconciled = money(fields.reconciled_service_amount);
  const pointsEligible = money(fields.points_eligible_amount);
  const stagedService = money(fields.service_amount);
  const singleService = serviceEvents.length === 1 ? money(serviceEvents[0].amount) : 0;
  const amount = reconciled || pointsEligible || stagedService || singleService;
  const serviceDate = dates.length === 1 ? yyyyMmDd(dates[0]) : "";
  const status = clean(fields.historical_service_status);
  const cancellationText = `${status}\n${clean(fields.cancellation_evidence)}\n${rawNote}`;
  const notePresent = Boolean(rawNote || Object.keys(history).length || stagedService || reconciled);
  return {
    source_kind: "legacy",
    source_record_id: clean(record.id),
    source_ref: importId || clean(record.id),
    source_fingerprint_seed: rawNote || stableJson({ importId, history, amount }),
    client_id: clientId,
    line_user_id: lineUserId,
    client_display_name: bounded(fields.line_renamed_name || fields.normalized_name, 120),
    note_present: notePresent,
    service_date: serviceDate,
    service_amount_thb: amount,
    points_eligible_amount_thb: amount,
    payment_ref: refs.length === 1 ? refs[0] : "",
    model_text: bounded(details.model_text, 100),
    location_text: bounded(details.location_text, 120),
    service_type: bounded(details.service_type, 80),
    cancelled: detectExplicitCancellation(cancellationText),
    detail_review_needed: dates.length > 1 || serviceEvents.length > 1 || refs.length > 1,
    evidence_summary: `source=legacy;note_present=${notePresent};date_count=${dates.length};service_events=${serviceEvents.length};payment_refs=${refs.length};policy=note_first`,
  };
}

export function privateCandidate(record, clientId, lineUserId = "") {
  const fields = record?.fields || {};
  const sourceHash = clean(fields["Source Hash"]);
  const importId = clean(fields["Import ID"]);
  const rawNote = clean(fields["Raw LINE Notes"]);
  const data = parseObject(fields["Service History Candidate JSON"]);
  const sourceRef = sourceHash || importId || clean(record.id);
  if (!sourceRef && !rawNote && !Object.keys(data).length) return null;
  const amount = money(data.service_amount_thb ?? data.points_eligible_amount_thb ?? data.amount_thb);
  const serviceDate = yyyyMmDd(data.service_date || data.date);
  const notePresent = Boolean(rawNote || Object.keys(data).length);
  return {
    source_kind: "private",
    source_record_id: clean(record.id),
    source_ref: sourceRef,
    source_fingerprint_seed: sourceHash || rawNote || stableJson(data),
    client_id: clientId,
    line_user_id: lineUserId,
    client_display_name: bounded(fields["Current LINE Rename"] || fields["Display Name"], 120),
    note_present: notePresent,
    service_date: serviceDate,
    service_amount_thb: amount,
    points_eligible_amount_thb: amount,
    payment_ref: clean(data.payment_ref),
    model_text: bounded(Array.isArray(data.model_names) ? data.model_names.join(", ") : data.model_name, 100),
    location_text: bounded(data.location, 120),
    service_type: bounded(data.service_type || "historical_service", 80),
    cancelled: data.cancelled === true || detectExplicitCancellation(`${data.status || ""}\n${rawNote}`),
    detail_review_needed: !serviceDate || amount <= 0,
    evidence_summary: `source=private;note_present=${notePresent};date_present=${Boolean(serviceDate)};amount_present=${amount > 0};policy=note_first`,
  };
}

// LINE OFC notes are authoritative evidence of an occurrence. Payment/slip
// records are optional enrichment only; a note that has no matching slip still
// produces a history candidate and eligible spend when an amount is present.
export function consoleInboxCandidate(record, clientId, lineUserId = "") {
  const fields = record?.fields || {};
  const payload = parseObject(fields.payload_json);
  const rawNote = clean([
    fields.admin_note,
    fields.note,
    fields.message,
    fields.text,
    typeof fields.payload_json === "string" ? fields.payload_json : "",
    payload.note,
    payload.message,
    payload.text,
    payload.admin_note,
  ].filter(Boolean).join("\n"));
  const intent = clean(fields.intent || payload.intent).toLowerCase();
  if (!rawNote && !intent) return null;
  const cancellationText = `${intent}\n${rawNote}\n${fields.status || payload.status || ""}`;
  const cancelled = detectExplicitCancellation(cancellationText);
  const amount = money(
    fields.service_amount_thb ?? fields.points_eligible_amount_thb ?? fields.amount_thb
      ?? payload.service_amount_thb ?? payload.points_eligible_amount_thb ?? payload.amount_thb,
  ) || extractAmount(rawNote);
  const explicitDate = yyyyMmDd(fields.service_date || fields.job_date || payload.service_date || payload.job_date || extractDate(rawNote));
  const likelyJob = isLikelyJobNote(rawNote, intent, amount, explicitDate);
  if (!likelyJob && !cancelled) return null;
  const createdDate = yyyyMmDd(fields.created_at || fields.timestamp || record.createdTime);
  const serviceDate = explicitDate || (likelyJob ? createdDate : "");
  const sourceRecordId = clean(record.id);
  const sourceRef = clean(fields.event_id || fields.message_id || fields.inbox_id || sourceRecordId);
  const details = parseObject(payload.service_details);
  return {
    source_kind: "line_ofc",
    source_record_id: sourceRecordId,
    source_ref: sourceRef,
    source_fingerprint_seed: rawNote || stableJson({ sourceRef, intent, amount, serviceDate }),
    client_id: clientId,
    line_user_id: lineUserId,
    client_display_name: bounded(fields.line_display_name || fields.display_name || payload.display_name, 120),
    note_present: Boolean(rawNote || intent),
    service_date: serviceDate,
    service_amount_thb: amount,
    points_eligible_amount_thb: amount,
    payment_ref: clean(fields.payment_ref || payload.payment_ref),
    model_text: bounded(fields.model_name || payload.model_name || details.model_text, 100),
    location_text: bounded(fields.location_name || payload.location || details.location_text, 120),
    service_type: bounded(fields.service_type || fields.job_type || intent || payload.service_type || "historical_service", 80),
    cancelled,
    detail_review_needed: !serviceDate,
    evidence_summary: `source=line_ofc;record=${sourceRecordId || "unknown"};intent=${intent || "note"};note_present=${Boolean(rawNote || intent)};slip_optional=true;policy=line_ofc_source_truth`,
  };
}

function isLikelyJobNote(rawNote, intent, amount, date) {
  if (["service", "booking", "job", "completed", "session", "history", "used_service"].some((token) => intent.includes(token))) return true;
  if (date && amount > 0) return true;
  if (amount > 0 && /(?:งาน|บริการ|ใช้บริการ|คิว|นัด|จอง|session|booking|job|service|completed|เสร็จ|เรียบร้อย)/i.test(rawNote)) return true;
  return /(?:งานเสร็จ|ใช้บริการแล้ว|บริการเรียบร้อย|ปิดงาน|completed service)/i.test(rawNote);
}

function extractAmount(value) {
  const matches = String(value || "").match(/(?:฿|บาท|thb)?\s*([0-9]{1,3}(?:[,\s][0-9]{3})+|[0-9]{3,7})(?:\s*(?:บาท|thb|฿))?/gi) || [];
  return matches.map((item) => money(item)).filter((item) => item > 0).sort((a, b) => b - a)[0] || 0;
}

function extractDate(value) {
  const text = String(value || "");
  const iso = text.match(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/);
  if (iso) return iso[0].replace(/\//g, "-");
  const dmy = text.match(/\b\d{1,2}[/-]\d{1,2}[/-](?:20)?\d{2}\b/);
  if (!dmy) return "";
  const parts = dmy[0].split(/[/-]/).map(Number);
  const year = parts[2] < 100 ? 2000 + parts[2] : parts[2] > 2400 ? parts[2] - 543 : parts[2];
  return `${year}-${String(parts[1]).padStart(2, "0")}-${String(parts[0]).padStart(2, "0")}`;
}

export function detectExplicitCancellation(value) {
  const text = clean(value).toLowerCase().replace(/\s+/g, " ");
  if (!text) return false;
  return /(?:ยกเลิก(?:งาน|คิว|นัด|บริการ)?|งานยกเลิก|คิวยกเลิก|cancel(?:led|ed)?(?:\s+(?:job|booking|session))?|job\s+cancel(?:led|ed)?|booking\s+cancel(?:led|ed)?|เลื่อน(?:งาน|คิว|นัด|บริการ)?|งานเลื่อน|คิวเลื่อน|reschedul(?:e|ed|ing)?|postpon(?:e|ed|ing)?)/i.test(text);
}

export function notePointSummary(candidates = []) {
  const eligibleAmount = roundMoney((Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate?.note_present && !candidate?.cancelled)
    .reduce((sum, candidate) => sum + Math.max(0, Number(candidate?.points_eligible_amount_thb || 0)), 0));
  return {
    eligible_amount_thb: eligibleAmount,
    points: Math.floor(eligibleAmount / POINT_RATE_THB),
    rate_thb_per_point: POINT_RATE_THB,
    expires: false,
  };
}

export function findOrphanPaymentProofs(proofs = [], candidates = []) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  return (Array.isArray(proofs) ? proofs : []).filter((proof) => {
    const fields = proof?.fields || {};
    if (linkIds(fields.session).length || linkIds(fields.payment).length) return false;
    const amount = money(fields.amount_thb);
    const date = yyyyMmDd(fields.paid_at);
    const ref = clean(fields.payment_ref);
    return !safeCandidates.some((candidate) => {
      if (candidate.cancelled) return false;
      if (ref && candidate.payment_ref && ref === candidate.payment_ref) return true;
      if (amount > 0 && candidate.service_amount_thb === amount && date && candidate.service_date === date) return true;
      return false;
    });
  });
}

async function normalizeAndDedupeCandidates(candidates) {
  const out = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const sourceHash = await sha24(`${candidate.client_id}|${normalizeFingerprintSeed(candidate.source_fingerprint_seed || candidate.source_ref)}`);
    candidate.source_fingerprint = sourceHash;
    candidate.history_review_id = `hist_review_${sourceHash}`;
    candidate.session_id = `hist_note_${sourceHash}`;
    if (seen.has(sourceHash)) continue;
    seen.add(sourceHash);
    out.push(candidate);
  }
  return out;
}

function normalizeFingerprintSeed(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ").slice(0, 20000);
}

async function upsertReview(db, existing, candidate, fields) {
  const base = compact({
    history_review_id: candidate.history_review_id,
    ...(candidate.source_kind === "legacy" && candidate.source_record_id
      ? { "LINE OFC Import Row": [candidate.source_record_id] }
      : {}),
    Client: [candidate.client_id],
    candidate_service_date: candidate.service_date || undefined,
    candidate_service_amount_thb: candidate.service_amount_thb || undefined,
    candidate_payment_ref: candidate.payment_ref || undefined,
    candidate_model_text: candidate.model_text || undefined,
    candidate_location_text: candidate.location_text || undefined,
    candidate_service_type: candidate.service_type || undefined,
    evidence_summary: candidate.evidence_summary,
    ...fields,
  });
  if (existing?.id) return db.update(TABLES.REVIEWS, existing.id, base);
  return db.create(TABLES.REVIEWS, base);
}

function historyCutoff(now, years) {
  const date = now instanceof Date && Number.isFinite(now.getTime()) ? new Date(now) : new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

async function readVerifiedMemberSession(request, env) {
  const token = requestCookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await readSessionByToken(token, env);
  if (!session || session.member_exists !== true || !safeLineUserId(session.line_user_id)) return null;
  return session;
}

async function readSessionByToken(token, env) {
  try {
    const digest = await hmacHex(env.LIFF_SESSION_SECRET, `session:${token}`);
    const session = await env.LIFF_IDENTITY_KV.get(`liff:session:${digest}`, "json");
    if (!session || Number(session.expires_at || 0) <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function readMemberHistoryRecoveryStatus(env, lineUserId) {
  if (!env.LIFF_IDENTITY_KV?.get) return statusPayload("checking", { reason: "status_unavailable" });
  const key = await recoveryKey("status", lineUserId);
  const stored = await env.LIFF_IDENTITY_KV.get(key, "json").catch(() => null);
  return stored && typeof stored === "object"
    ? statusPayload(stored.state, stored)
    : statusPayload("checking", { reason: "not_started" });
}

async function markQueued(env, lineUserId, trigger) {
  const status = statusPayload("checking", {
    trigger,
    reason: "queued",
    updated_at: new Date().toISOString(),
    points_expire: false,
    history_window_years: HISTORY_WINDOW_YEARS,
  });
  await writeStatusKey(env, await recoveryKey("status", lineUserId), status);
  return status;
}

async function writeStatusKey(env, key, status) {
  if (!env.LIFF_IDENTITY_KV?.put) return;
  await env.LIFF_IDENTITY_KV.put(key, JSON.stringify(publicStatus(status)), { expirationTtl: STATUS_TTL_SECONDS });
}

function statusPayload(state, extra = {}) {
  const allowed = new Set(["checking", "in_progress", "review_required", "reconciled", "blocked"]);
  return {
    state: allowed.has(state) ? state : "checking",
    source_note_count: nonNegativeInt(extra.source_note_count),
    candidate_count: nonNegativeInt(extra.candidate_count),
    pending_review_count: nonNegativeInt(extra.pending_review_count),
    materialized_count: nonNegativeInt(extra.materialized_count),
    duplicate_count: nonNegativeInt(extra.duplicate_count),
    rejected_count: nonNegativeInt(extra.rejected_count),
    undated_note_count: nonNegativeInt(extra.undated_note_count),
    note_without_amount_count: nonNegativeInt(extra.note_without_amount_count),
    unmatched_payment_count: nonNegativeInt(extra.unmatched_payment_count),
    verified_service_spend_thb: roundMoney(extra.verified_service_spend_thb),
    historical_points_recovered: nonNegativeInt(extra.historical_points_recovered),
    historical_points_added: signedInt(extra.historical_points_added),
    current_points_total: nullableNonNegativeInt(extra.current_points_total),
    points_expire: false,
    history_window_years: HISTORY_WINDOW_YEARS,
    source_pending: extra.source_pending === true,
    trigger: bounded(extra.trigger, 32) || null,
    reason: bounded(extra.reason, 80) || null,
    started_at: isoDate(extra.started_at),
    updated_at: isoDate(extra.updated_at) || new Date().toISOString(),
    can_refresh: state !== "in_progress",
  };
}

function publicStatus(value) {
  return statusPayload(value?.state, value || {});
}

function refreshExpired(status) {
  const updated = Date.parse(status?.updated_at || "");
  return !Number.isFinite(updated) || Date.now() - updated > LOCK_TTL_SECONDS * 1000;
}

function reviewNote(trigger, reason) {
  return `policy=${POLICY};trigger=${bounded(trigger, 32) || "unknown"};reason=${bounded(reason, 120) || "unknown"};identity=verified_liff_exact_client;note_occurrence=true;old_slip_required=false;points_expiry=none_phase1;entitlements=untouched`;
}

class AirtableHistoryStore {
  constructor(env) {
    this.baseId = clean(env.AIRTABLE_BASE_ID);
    this.token = clean(env.AIRTABLE_API_KEY);
    this.http = env.AIRTABLE_HTTP;
  }

  async list(table, { formula = "", maxRecords = 0 } = {}) {
    const out = [];
    let offset = "";
    do {
      const url = this.url(table);
      if (formula) url.searchParams.set("filterByFormula", formula);
      if (maxRecords) url.searchParams.set("maxRecords", String(maxRecords));
      url.searchParams.set("pageSize", String(Math.min(100, maxRecords ? Math.max(1, maxRecords - out.length) : 100)));
      if (offset) url.searchParams.set("offset", offset);
      const payload = await this.request(url, { method: "GET" });
      out.push(...(Array.isArray(payload.records) ? payload.records : []));
      offset = clean(payload.offset);
      if (maxRecords && out.length >= maxRecords) break;
    } while (offset && out.length < 5000);
    return maxRecords ? out.slice(0, maxRecords) : out;
  }

  async findOne(table, formula) {
    const rows = await this.list(table, { formula, maxRecords: 2 });
    return rows.length === 1 ? rows[0] : null;
  }

  async create(table, fields) {
    return this.request(this.url(table), { method: "POST", body: JSON.stringify({ fields }) });
  }

  async update(table, recordId, fields) {
    return this.request(this.url(table, recordId), { method: "PATCH", body: JSON.stringify({ fields }) });
  }

  url(table, recordId = "") {
    return new URL(`${AIRTABLE_API}/${encodeURIComponent(this.baseId)}/${encodeURIComponent(table)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`);
  }

  async request(url, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AIRTABLE_TIMEOUT_MS);
    try {
      const request = new Request(url.toString(), {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        signal: controller.signal,
      });
      const response = this.http?.fetch ? await this.http.fetch(request) : await fetch(request);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object") {
        const error = new Error(response.status === 401 || response.status === 403 ? "AIRTABLE_FORBIDDEN" : "AIRTABLE_UNAVAILABLE");
        error.code = error.message;
        throw error;
      }
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function hasBindings(env) {
  return Boolean(env.LIFF_IDENTITY_KV?.get
    && env.LIFF_IDENTITY_KV?.put
    && clean(env.LIFF_SESSION_SECRET).length >= 32
    && clean(env.AIRTABLE_BASE_ID)
    && clean(env.AIRTABLE_API_KEY));
}

function approvedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return request.method === "GET" || request.method === "HEAD";
  if (APPROVED_ORIGINS.has(origin)) return true;
  const extra = clean(env.MY_MMD_APP_ORIGIN);
  return Boolean(extra && origin === extra);
}

function corsResponse(request, env) {
  if (!approvedOrigin(request, env)) return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED" } }, 403);
  return withCors(request, env, new Response(null, {
    status: 204,
    headers: { allow: "GET,POST,OPTIONS" },
  }));
}

function withCors(request, env, response) {
  const origin = clean(request.headers.get("origin"));
  if (!origin || !approvedOrigin(request, env)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function methodNotAllowed(allow) {
  return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow });
}

function json(payload, status = 200, extraHeaders = {}) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store", ...extraHeaders } });
}

function schedule(ctx, promise) {
  if (ctx?.waitUntil) ctx.waitUntil(Promise.resolve(promise));
  else Promise.resolve(promise).catch(() => {});
}

function responseCookieValue(response, name) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  for (const cookie of cookies) {
    const first = String(cookie || "").split(";", 1)[0];
    const index = first.indexOf("=");
    if (index <= 0 || first.slice(0, index) !== name) continue;
    return safeToken(first.slice(index + 1));
  }
  return "";
}

function requestCookieValue(request, name) {
  const raw = clean(request.headers.get("cookie"));
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return safeToken(part.slice(index + 1).trim());
  }
  return "";
}

function safeToken(value) {
  const token = clean(value);
  return token.length > 0 && token.length <= 8192 && /^[A-Za-z0-9._~-]+$/.test(token) ? token : "";
}

function safeLineUserId(value) {
  return /^U[a-f0-9]{32}$/i.test(clean(value));
}

async function recoveryKey(kind, lineUserId) {
  return `history-recovery:v2:${kind}:${await sha24(lineUserId)}`;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha24(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clean(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

function formulaString(value) {
  return `'${clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(clean(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function selectName(value) {
  return clean(value && typeof value === "object" ? value.name : value);
}

function linkIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clean(item && typeof item === "object" ? item.id : item))
    .filter((item) => /^rec[A-Za-z0-9]{6,32}$/.test(item));
}

function dedupeById(records = []) {
  const out = [];
  const seen = new Set();
  for (const record of records) {
    const id = clean(record?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(record);
  }
  return out;
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean))];
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function money(value) {
  const number = typeof value === "number"
    ? value
    : Number(String(value || "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? roundMoney(number) : 0;
}

function roundMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function nonNegativeInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function signedInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function nullableNonNegativeInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function yyyyMmDd(value) {
  const text = clean(value);
  const direct = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

function isoDate(value) {
  const text = clean(value);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function bounded(value, max = 120) {
  return clean(value).replace(/[\r\n]+/g, " ").slice(0, max);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function safeErrorCode(error) {
  return bounded(error?.code || error?.message || "history_recovery_failed", 80)
    .replace(/[^A-Za-z0-9_:-]/g, "_") || "history_recovery_failed";
}

export const __test = Object.freeze({
  publicStatus,
  statusPayload,
  normalizeAndDedupeCandidates,
  postedPoints,
  reconcileHistoricalPointsTotal,
  processNoteCandidate,
  consoleInboxCandidate,
  historyCutoff,
});
