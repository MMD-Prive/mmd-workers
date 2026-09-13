const AIRTABLE_API = "https://api.airtable.com/v0";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const POLICY = "member_history_recovery_v1";
const STATUS_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 180;
const AIRTABLE_TIMEOUT_MS = 10000;

const TABLES = Object.freeze({
  CLIENTS: "tblVv58TCbwh5j1fS",
  LEGACY_STAGING: "tbl1u0foFBvgFpT9G",
  PRIVATE_STAGING: "tblOs8yyLK09SKrCt",
  REVIEWS: "tblnpDFQMpo8AmNQv",
  PAYMENT_PROOFS: "tblfJfM4Sqag9zrLi",
  SESSIONS: "tblC98mKWbzmPuNzX",
  PAYMENTS: "tblWGGJJOx5eBvBZJ",
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
    const status = await readRecoveryStatus(env, session.line_user_id);
    return withCors(request, env, json({ ok: true, history_recovery: publicStatus(status) }, 200));
  }

  if (request.method !== "POST") return methodNotAllowed("POST");
  const existing = await readRecoveryStatus(env, session.line_user_id);
  if (existing.state === "in_progress" && !refreshExpired(existing)) {
    return withCors(request, env, json({ ok: true, history_recovery: publicStatus(existing), accepted: false }, 200));
  }

  const queued = await markQueued(env, session.line_user_id, "manual_refresh");
  schedule(ctx, runMemberHistoryRecovery({ env, lineUserId: session.line_user_id, trigger: "manual_refresh" }));
  return withCors(request, env, json({ ok: true, history_recovery: publicStatus(queued), accepted: true }, 202));
}

export async function scheduleMemberHistoryRecoveryForSessionToken(token, env = {}, ctx, trigger = "login") {
  if (!hasBindings(env) || !safeToken(token)) return false;
  const session = await readSessionByToken(token, env);
  if (!session || session.member_exists !== true || !safeLineUserId(session.line_user_id)) return false;
  const existing = await readRecoveryStatus(env, session.line_user_id);
  if (existing.state === "in_progress" && !refreshExpired(existing)) return true;
  await markQueued(env, session.line_user_id, trigger);
  schedule(ctx, runMemberHistoryRecovery({ env, lineUserId: session.line_user_id, trigger }));
  return true;
}

export async function runMemberHistoryRecovery({ env = {}, lineUserId, trigger = "login", store } = {}) {
  if (!hasBindings(env) && !store) return statusPayload("blocked", { reason: "not_configured", trigger });
  if (!safeLineUserId(lineUserId)) return statusPayload("blocked", { reason: "identity_invalid", trigger });

  const db = store || new AirtableHistoryStore(env);
  const lockKey = await recoveryKey("lock", lineUserId);
  const statusKey = await recoveryKey("status", lineUserId);
  const now = new Date().toISOString();

  try {
    const held = await env.LIFF_IDENTITY_KV?.get(lockKey, "json").catch(() => null);
    if (held?.started_at && Date.now() - Date.parse(held.started_at) < LOCK_TTL_SECONDS * 1000) {
      return await readRecoveryStatus(env, lineUserId);
    }
    if (env.LIFF_IDENTITY_KV?.put) {
      await env.LIFF_IDENTITY_KV.put(lockKey, JSON.stringify({ started_at: now, trigger }), { expirationTtl: LOCK_TTL_SECONDS });
    }

    await writeStatusKey(env, statusKey, statusPayload("in_progress", { trigger, started_at: now, updated_at: now }));

    const clients = await db.list(TABLES.CLIENTS, { formula: `{line_user_id}=${formulaString(lineUserId)}`, maxRecords: 3 });
    if (clients.length !== 1) {
      const blocked = statusPayload("blocked", {
        trigger,
        reason: clients.length ? "identity_ambiguous" : "identity_not_linked",
        started_at: now,
        updated_at: new Date().toISOString(),
      });
      await writeStatusKey(env, statusKey, blocked);
      return blocked;
    }

    const clientId = clients[0].id;
    const [legacyRows, privateRows, verifiedProofs] = await Promise.all([
      db.list(TABLES.LEGACY_STAGING, { formula: `{line_user_id}=${formulaString(lineUserId)}` }),
      db.list(TABLES.PRIVATE_STAGING, { formula: `{LINE User ID}=${formulaString(lineUserId)}` }),
      db.list(TABLES.PAYMENT_PROOFS, { formula: `{status}=${formulaString("verified")}` }),
    ]);

    const clientProofs = verifiedProofs.filter((record) => linkIds(record.fields?.Client).includes(clientId));
    const candidates = [
      ...legacyRows.map((record) => legacyCandidate(record, clientId)),
      ...privateRows.map((record) => privateCandidate(record, clientId)),
    ].filter(Boolean);
    await normalizeCandidateIds(candidates);

    const counters = {
      source_note_count: legacyRows.length + privateRows.length,
      candidate_count: candidates.length,
      pending_review_count: 0,
      materialized_count: 0,
      duplicate_count: 0,
      rejected_count: 0,
    };
    let verifiedSpend = 0;

    for (const candidate of candidates) {
      const outcome = await reviewAndMaybeMaterialize({ db, candidate, clientProofs, trigger });
      if (outcome === "materialized") {
        counters.materialized_count += 1;
        verifiedSpend += candidate.amount_thb || 0;
      } else if (outcome === "duplicate") {
        counters.duplicate_count += 1;
      } else if (outcome === "rejected") {
        counters.rejected_count += 1;
      } else {
        counters.pending_review_count += 1;
      }
    }

    const state = counters.pending_review_count > 0 ? "review_required" : "reconciled";
    const done = statusPayload(state, {
      ...counters,
      verified_service_spend_thb: roundMoney(verifiedSpend),
      trigger,
      started_at: now,
      updated_at: new Date().toISOString(),
      reason: state === "review_required" ? "evidence_incomplete_or_sensitive" : "complete",
    });
    await writeStatusKey(env, statusKey, done);
    return done;
  } catch (error) {
    const failed = statusPayload("blocked", {
      trigger,
      reason: safeErrorCode(error),
      started_at: now,
      updated_at: new Date().toISOString(),
    });
    await writeStatusKey(env, statusKey, failed).catch(() => {});
    console.warn({ event: "member_history_recovery_failed", policy: POLICY, reason: failed.reason });
    return failed;
  } finally {
    if (env.LIFF_IDENTITY_KV?.delete) await env.LIFF_IDENTITY_KV.delete(lockKey).catch(() => {});
  }
}

async function reviewAndMaybeMaterialize({ db, candidate, clientProofs, trigger }) {
  const existing = await db.findOne(TABLES.REVIEWS, `{history_review_id}=${formulaString(candidate.history_review_id)}`);
  const existingStatus = clean(existing?.fields?.review_status).toLowerCase();
  const existingReviewer = clean(existing?.fields?.reviewed_by);
  const humanReviewed = Boolean(existingReviewer && !existingReviewer.startsWith("system:"));
  if (existingStatus === "materialized") return "duplicate";
  if (existingStatus === "rejected") return "rejected";
  if (humanReviewed && existingStatus !== "approved") return "review_required";

  if (candidate.cancelled) {
    await upsertReview(db, existing, candidate, {
      review_status: "rejected",
      decision: "reject_service_history",
      reviewed_by: `system:${POLICY}`,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote(trigger, "cancelled_service"),
    });
    return "rejected";
  }

  const proofMatch = matchVerifiedPaymentProof(candidate, clientProofs);
  const complete = candidateComplete(candidate) && proofMatch.kind === "one" && !candidate.requires_human_review;
  if (!complete) {
    const reason = candidate.requires_human_review
      ? "sensitive_evidence_requires_review"
      : proofMatch.kind === "many"
        ? "payment_evidence_ambiguous"
        : proofMatch.kind === "none"
          ? "verified_payment_evidence_missing"
          : "service_evidence_incomplete";
    await upsertReview(db, existing, candidate, {
      review_status: "needs_more_evidence",
      decision: "hold_for_review",
      payment_review_status: "pending",
      payment_coverage_status: proofMatch.kind === "many" ? "unknown" : "partial",
      points_review_status: "pending",
      reviewed_by: `system:${POLICY}`,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote(trigger, reason),
    });
    return "review_required";
  }

  const proof = proofMatch.proof;
  const paymentRef = clean(proof.fields?.payment_ref);
  const paymentAmount = money(proof.fields?.amount_thb);
  const paidAt = isoDate(proof.fields?.paid_at);
  const approvedFields = {
    review_status: "approved",
    decision: "approve_service_history",
    approved_service_date: candidate.service_date,
    approved_service_amount_thb: candidate.amount_thb,
    approved_payment_ref: paymentRef,
    approved_payment_amount_thb: paymentAmount,
    approved_payment_events_json: JSON.stringify([{
      proof_id: clean(proof.fields?.proof_id),
      payment_ref: paymentRef,
      amount_thb: paymentAmount,
      paid_at: paidAt,
      verified_at: isoDate(proof.fields?.verified_at),
    }]),
    payment_review_status: "approved",
    payment_coverage_status: "complete",
    points_review_status: "pending",
    reviewed_by: `system:${POLICY}`,
    reviewed_at: new Date().toISOString(),
    review_note: reviewNote(trigger, "system_review_complete;points_untouched"),
  };
  const review = await upsertReview(db, existing, candidate, approvedFields);
  const materialized = await materializeCanonicalHistory({ db, candidate, proof, review });
  if (materialized === "conflict") {
    await db.update(TABLES.REVIEWS, review.id, compact({
      review_status: "needs_more_evidence",
      decision: "hold_for_review",
      review_note: humanReviewed ? undefined : reviewNote(trigger, "canonical_duplicate_conflict"),
    }));
    return "review_required";
  }
  await db.update(TABLES.REVIEWS, review.id, compact({
    review_status: "materialized",
    review_note: humanReviewed ? undefined : reviewNote(trigger, materialized === "duplicate" ? "canonical_duplicate_safe" : "canonical_materialized"),
  }));
  return materialized;
}

async function upsertReview(db, existing, candidate, fields) {
  const base = compact({
    history_review_id: candidate.history_review_id,
    ...(candidate.source_kind === "legacy" && candidate.source_record_id ? { "LINE OFC Import Row": [candidate.source_record_id] } : {}),
    Client: [candidate.client_id],
    candidate_service_date: candidate.service_date || undefined,
    candidate_service_amount_thb: candidate.amount_thb || undefined,
    candidate_payment_ref: candidate.payment_ref || undefined,
    candidate_model_text: candidate.model_text || undefined,
    candidate_start_time: candidate.start_time || undefined,
    candidate_end_time: candidate.end_time || undefined,
    candidate_location_text: candidate.location_text || undefined,
    candidate_area_text: candidate.area_text || undefined,
    candidate_service_type: candidate.service_type || undefined,
    candidate_duration_minutes: candidate.duration_minutes || undefined,
    evidence_summary: candidate.evidence_summary,
    ...fields,
  });
  if (existing?.id) {
    const human = clean(existing.fields?.reviewed_by);
    if (human && !human.startsWith("system:")) return existing;
    return db.update(TABLES.REVIEWS, existing.id, base);
  }
  return db.create(TABLES.REVIEWS, base);
}

async function materializeCanonicalHistory({ db, candidate, proof, review }) {
  const paymentRef = clean(proof.fields?.payment_ref);
  if (!paymentRef) return "conflict";
  const seed = [review.fields?.history_review_id || candidate.history_review_id, candidate.client_id, candidate.service_date, candidate.amount_thb, paymentRef].join("|");
  const sessionId = `hist_sess_${await sha24(seed)}`;

  const [existingSessions, existingPayments] = await Promise.all([
    db.list(TABLES.SESSIONS, { formula: `{session_id}=${formulaString(sessionId)}`, maxRecords: 2 }),
    db.list(TABLES.PAYMENTS, { formula: `{Payment Reference}=${formulaString(paymentRef)}`, maxRecords: 2 }),
  ]);

  if (existingSessions.length > 1 || existingPayments.length > 1) return "conflict";
  if (existingPayments.length === 1 && !canonicalPaymentMatches(existingPayments[0], candidate, paymentRef)) return "conflict";
  if (existingPayments.length === 1) {
    const linkedSessionId = clean(existingPayments[0]?.fields?.session_id);
    if (linkedSessionId && linkedSessionId !== sessionId) return "duplicate";
  }
  let wrote = false;

  if (!existingSessions.length) {
    await db.create(TABLES.SESSIONS, compact({
      "Session Name": `Historical - ${candidate.service_date}`,
      Client: [candidate.client_id],
      "Session Status": "Completed",
      session_id: sessionId,
      created_at: isoDate(proof.fields?.paid_at) || new Date().toISOString(),
      amount_thb: candidate.amount_thb,
      payment_ref: paymentRef,
      payment_status: "paid",
      job_type: "historical_service",
      job_date: candidate.service_date,
      import_review_status: "approved",
      imported_source_ref: candidate.history_review_id,
      imported_confidence_score: 100,
    }));
    wrote = true;
  }

  if (!existingPayments.length) {
    await db.create(TABLES.PAYMENTS, compact({
      "Payment Reference": paymentRef,
      "Payment Date": candidate.service_date,
      Amount: candidate.amount_thb,
      "Payment Status": "Paid",
      "Payment Method": "Other",
      Client: [candidate.client_id],
      "Created At": isoDate(proof.fields?.verified_at) || new Date().toISOString(),
      session_id: sessionId,
      payment_stage: "full",
      payment_type: "full",
      source: "manual",
      payment_evidence_source: "imported_history",
      import_review_status: "approved",
    }));
    wrote = true;
  }

  return wrote ? "materialized" : "duplicate";
}

function canonicalPaymentMatches(record, candidate, paymentRef) {
  const fields = record?.fields || {};
  const ref = clean(fields["Payment Reference"]);
  const amount = money(fields.Amount);
  const clients = linkIds(fields.Client);
  return ref === paymentRef && amount === candidate.amount_thb && clients.includes(candidate.client_id);
}

export function legacyCandidate(record, clientId) {
  const fields = record?.fields || {};
  const importId = clean(fields.import_id);
  if (!importId) return null;
  const history = parseObject(fields.historical_events_json);
  const serviceEvents = Array.isArray(history.amounts)
    ? history.amounts.filter((item) => clean(item?.type).toLowerCase() === "service" && money(item?.amount) > 0)
    : [];
  const dates = uniqueStrings(history.dates);
  const refs = uniqueStrings(history.payment_refs);
  const details = asObject(history.service_details);
  const reconciled = money(fields.reconciled_service_amount);
  const fallback = money(fields.service_amount);
  const amount = reconciled > 0 ? reconciled : serviceEvents.length === 1 ? money(serviceEvents[0].amount) : fallback;
  const serviceDate = dates.length === 1 ? yyyyMmDd(dates[0]) : "";
  const paymentRef = refs.length === 1 ? refs[0] : "";
  const status = clean(fields.historical_service_status).toLowerCase();
  const ambiguous = serviceEvents.length > 1 || dates.length > 1 || refs.length > 1 || money(fields.unknown_amount) > 0;
  return {
    source_kind: "legacy",
    source_record_id: clean(record.id),
    source_ref: importId,
    history_review_id: `hist_review_${syncShaPlaceholder(importId)}`,
    client_id: clientId,
    service_date: serviceDate,
    amount_thb: amount,
    payment_ref: paymentRef,
    model_text: bounded(details.model_text, 100),
    start_time: bounded(details.start_time, 10),
    end_time: bounded(details.end_time, 10),
    location_text: bounded(details.location_text, 120),
    area_text: bounded(details.area_text, 80),
    service_type: bounded(details.service_type, 80),
    duration_minutes: positiveInt(details.duration_minutes),
    cancelled: ["cancelled", "canceled", "refunded"].includes(status),
    requires_human_review: ambiguous,
    evidence_summary: `source=legacy;import_id=${bounded(importId, 80)};service_events=${serviceEvents.length};dates=${dates.length};payment_refs=${refs.length};ambiguous=${ambiguous}`,
  };
}

export function privateCandidate(record, clientId) {
  const fields = record?.fields || {};
  const sourceHash = clean(fields["Source Hash"]);
  const importId = clean(fields["Import ID"]);
  const sourceRef = sourceHash || importId || clean(record.id);
  const data = parseObject(fields["Service History Candidate JSON"]);
  if (!sourceRef || !Object.keys(data).length) return null;
  const amount = money(data.service_amount_thb);
  const serviceDate = yyyyMmDd(data.service_date);
  const warnings = Array.isArray(data.evidence_warnings) ? data.evidence_warnings.map(clean).filter(Boolean) : [];
  const sensitive = data.private_critical_evidence === true || data.needs_human_review === true;
  return {
    source_kind: "private",
    source_record_id: clean(record.id),
    source_ref: sourceRef,
    history_review_id: `hist_review_${syncShaPlaceholder(`private|${sourceRef}`)}`,
    client_id: clientId,
    service_date: serviceDate,
    amount_thb: amount,
    payment_ref: clean(data.payment_ref),
    model_text: bounded(Array.isArray(data.model_names) ? data.model_names.join(", ") : data.model_name, 100),
    start_time: bounded(data.start_time, 10),
    end_time: bounded(data.end_time, 10),
    location_text: bounded(data.location, 120),
    area_text: bounded(data.area, 80),
    service_type: bounded(data.service_type || "private_model", 80),
    duration_minutes: positiveInt(data.duration_minutes),
    cancelled: data.cancelled === true,
    requires_human_review: sensitive || warnings.some((item) => /requires_human_review|private_critical/i.test(item)),
    evidence_summary: `source=private;source_ref=${bounded(sourceRef, 80)};service_count=${Number(data.service_count || 0)};sensitive=${sensitive};warnings=${warnings.length}`,
  };
}

function syncShaPlaceholder(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `${hex}${hex}${hex}`.slice(0, 24);
}

function candidateComplete(candidate) {
  return Boolean(candidate
    && /^\d{4}-\d{2}-\d{2}$/.test(candidate.service_date)
    && Number.isFinite(candidate.amount_thb)
    && candidate.amount_thb > 0);
}

export function matchVerifiedPaymentProof(candidate, proofs = []) {
  if (!candidateComplete(candidate)) return { kind: "none" };
  const matches = proofs.filter((record) => {
    const fields = record?.fields || {};
    const status = selectName(fields.status).toLowerCase();
    if (status !== "verified" || !isoDate(fields.verified_at) || !clean(fields.verified_by)) return false;
    const ref = clean(fields.payment_ref);
    const amount = money(fields.amount_thb);
    const paidDate = yyyyMmDd(fields.paid_at);
    if (!ref || amount !== candidate.amount_thb) return false;
    if (candidate.payment_ref && ref !== candidate.payment_ref) return false;
    return candidate.payment_ref ? true : paidDate === candidate.service_date;
  });
  if (matches.length === 1) return { kind: "one", proof: matches[0] };
  if (matches.length > 1) return { kind: "many", proofs: matches };
  return { kind: "none" };
}

async function normalizeCandidateIds(candidates) {
  for (const item of candidates) {
    item.history_review_id = `hist_review_${await sha24(item.source_kind === "legacy" ? item.source_ref : `private|${item.source_ref}`)}`;
  }
  return candidates;
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

async function readRecoveryStatus(env, lineUserId) {
  if (!env.LIFF_IDENTITY_KV?.get) return statusPayload("checking", { reason: "status_unavailable" });
  const key = await recoveryKey("status", lineUserId);
  const stored = await env.LIFF_IDENTITY_KV.get(key, "json").catch(() => null);
  return stored && typeof stored === "object" ? statusPayload(stored.state, stored) : statusPayload("checking", { reason: "not_started" });
}

async function markQueued(env, lineUserId, trigger) {
  const status = statusPayload("checking", { trigger, reason: "queued", updated_at: new Date().toISOString() });
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
    verified_service_spend_thb: roundMoney(extra.verified_service_spend_thb),
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
  return `policy=${POLICY};trigger=${bounded(trigger, 32) || "unknown"};reason=${bounded(reason, 120) || "unknown"};identity=verified_liff_exact_client;entitlements=untouched`;
}

class AirtableHistoryStore {
  constructor(env) {
    this.baseId = clean(env.AIRTABLE_BASE_ID);
    this.token = clean(env.AIRTABLE_API_KEY);
  }

  async list(table, { formula = "", maxRecords = 0 } = {}) {
    const out = [];
    let offset = "";
    do {
      const url = this.url(table);
      if (formula) url.searchParams.set("filterByFormula", formula);
      if (maxRecords) url.searchParams.set("maxRecords", String(maxRecords));
      if (offset) url.searchParams.set("offset", offset);
      const payload = await this.request(url, { method: "GET" });
      out.push(...(Array.isArray(payload.records) ? payload.records : []));
      offset = clean(payload.offset);
      if (maxRecords && out.length >= maxRecords) break;
    } while (offset && out.length < 1000);
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
      const response = await fetch(url.toString(), {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        signal: controller.signal,
      });
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
  return withCors(request, env, new Response(null, { status: 204, headers: { allow: "GET,POST,OPTIONS" } }));
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
  return `history-recovery:v1:${kind}:${await sha24(lineUserId)}`;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
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

function selectName(value) {
  return clean(value && typeof value === "object" ? value.name : value);
}

function linkIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item && typeof item === "object" ? item.id : item)).filter((item) => /^rec[A-Za-z0-9]{14}$/.test(item));
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean))];
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? roundMoney(number) : 0;
}

function roundMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
}

function positiveInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function nonNegativeInt(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
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
  return bounded(error?.code || error?.message || "history_recovery_failed", 80).replace(/[^A-Za-z0-9_:-]/g, "_") || "history_recovery_failed";
}

export const __test = Object.freeze({
  candidateComplete,
  publicStatus,
  statusPayload,
  canonicalPaymentMatches,
  normalizeCandidateIds,
  materializeCanonicalHistory,
});
