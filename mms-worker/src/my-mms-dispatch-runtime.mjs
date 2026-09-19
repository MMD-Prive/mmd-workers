import { DurableObject } from "cloudflare:workers";
import { matchTherapists } from "./core.mjs";
import { requireMyMmsApprovedTherapist } from "./my-mms-access-runtime.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const INTERNAL_HOST = "mms.internal";
const APP_API = "/male-massage/therapists/api/app";
const SUPPORT_URL = "https://line.me/R/ti/p/%40malemassage";
const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_MAX_OFFERS = 5;
const APP_PATHS = Object.freeze({
  offers: `${APP_API}/offers`,
  jobs: `${APP_API}/jobs`,
});
const INTERNAL_MATCH_RE = /^\/internal\/mms\/dispatch\/prebookings\/(mmspre_[a-f0-9]{24})\/match$/;
const INTERNAL_JOB_RE = /^\/internal\/mms\/dispatch\/jobs\/(mmsjob_[a-f0-9]{24})$/;
const INTERNAL_CANCEL_RE = /^\/internal\/mms\/dispatch\/jobs\/(mmsjob_[a-f0-9]{24})\/cancel$/;
const OFFER_RE = /^\/male-massage\/therapists\/api\/app\/offers\/(mmsjob_[a-f0-9]{24})$/;
const ACCEPT_RE = /^\/male-massage\/therapists\/api\/app\/offers\/(mmsjob_[a-f0-9]{24})\/accept$/;
const DECLINE_RE = /^\/male-massage\/therapists\/api\/app\/offers\/(mmsjob_[a-f0-9]{24})\/decline$/;
const JOB_RE = /^\/male-massage\/therapists\/api\/app\/jobs\/(mmsjob_[a-f0-9]{24})$/;
const START_RE = /^\/male-massage\/therapists\/api\/app\/jobs\/(mmsjob_[a-f0-9]{24})\/start$/;
const COMPLETE_RE = /^\/male-massage\/therapists\/api\/app\/jobs\/(mmsjob_[a-f0-9]{24})\/complete$/;

export class MmsDispatchCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS dispatch_jobs (
          job_id TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          winner_therapist_id TEXT,
          accepted_at INTEGER,
          started_at INTEGER,
          completed_at INTEGER,
          cancelled_at INTEGER,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dispatch_offers (
          therapist_id TEXT PRIMARY KEY,
          offer_id TEXT NOT NULL,
          status TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          responded_at INTEGER,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dispatch_requests (
          request_key TEXT PRIMARY KEY,
          therapist_id TEXT NOT NULL,
          action TEXT NOT NULL,
          result_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
    });
  }

  initialize(jobId, offers, now) {
    const current = this._job(jobId);
    if (!current) {
      this.ctx.storage.sql.exec(
        "INSERT INTO dispatch_jobs (job_id, state, version, updated_at) VALUES (?, 'OFFERED', 1, ?)",
        jobId,
        now,
      );
    }
    const state = this._job(jobId);
    if (!["OFFERED", "MATCHING"].includes(state?.state || "")) return this.snapshot(jobId);
    for (const offer of Array.isArray(offers) ? offers : []) {
      if (!offer?.therapist_id || !offer?.offer_id || !Number.isFinite(Number(offer?.expires_at))) continue;
      this.ctx.storage.sql.exec(
        `INSERT OR IGNORE INTO dispatch_offers
          (therapist_id, offer_id, status, expires_at, responded_at, updated_at)
         VALUES (?, ?, 'OFFERED', ?, NULL, ?)`,
        offer.therapist_id,
        offer.offer_id,
        Number(offer.expires_at),
        now,
      );
    }
    return this.snapshot(jobId);
  }

  snapshot(jobId) {
    const job = this._job(jobId);
    const offers = this.ctx.storage.sql.exec("SELECT * FROM dispatch_offers ORDER BY therapist_id").toArray();
    return { job, offers: offers.map(dispatchOfferRow) };
  }

  accept(jobId, therapistId, requestKey, now) {
    const replay = this._replay(requestKey, therapistId, "accept");
    if (replay) return replay;
    const job = this._job(jobId);
    if (!job) return this._remember(requestKey, therapistId, "accept", { state: "CHECKING", code: "JOB_NOT_INITIALIZED" }, now);
    const offer = this._offer(therapistId);
    if (!offer) return this._remember(requestKey, therapistId, "accept", { state: "TAKEN", code: "OFFER_NOT_FOUND" }, now);

    if (job.state === "CANCELLED") return this._remember(requestKey, therapistId, "accept", { state: "CANCELLED" }, now);
    if (job.winner_therapist_id) {
      const state = job.winner_therapist_id === therapistId ? canonicalClientState(job.state) : "TAKEN";
      return this._remember(requestKey, therapistId, "accept", { state, winner_therapist_id: job.winner_therapist_id }, now);
    }
    if (offer.status === "DECLINED") return this._remember(requestKey, therapistId, "accept", { state: "DECLINED" }, now);
    if (offer.status === "EXPIRED" || Number(offer.expires_at) <= now) {
      this.ctx.storage.sql.exec(
        "UPDATE dispatch_offers SET status='EXPIRED', responded_at=?, updated_at=? WHERE therapist_id=?",
        now,
        now,
        therapistId,
      );
      return this._remember(requestKey, therapistId, "accept", { state: "EXPIRED" }, now);
    }
    if (offer.status !== "OFFERED") return this._remember(requestKey, therapistId, "accept", { state: canonicalClientState(offer.status) }, now);

    this.ctx.storage.sql.exec(
      `UPDATE dispatch_jobs
       SET state='ACCEPTED', winner_therapist_id=?, accepted_at=?, version=version+1, updated_at=?
       WHERE job_id=? AND winner_therapist_id IS NULL`,
      therapistId,
      now,
      now,
      jobId,
    );
    const after = this._job(jobId);
    if (after.winner_therapist_id !== therapistId) {
      return this._remember(requestKey, therapistId, "accept", { state: "TAKEN", winner_therapist_id: after.winner_therapist_id }, now);
    }
    this.ctx.storage.sql.exec(
      "UPDATE dispatch_offers SET status=CASE WHEN therapist_id=? THEN 'ACCEPTED' ELSE 'TAKEN' END, responded_at=?, updated_at=? WHERE status='OFFERED'",
      therapistId,
      now,
      now,
    );
    const result = {
      state: "ACCEPTED",
      winner_therapist_id: therapistId,
      accepted_at: new Date(now).toISOString(),
      offer_updates: this.ctx.storage.sql.exec("SELECT therapist_id, status, responded_at FROM dispatch_offers").toArray(),
      version: after.version,
    };
    return this._remember(requestKey, therapistId, "accept", result, now);
  }

  decline(jobId, therapistId, requestKey, now) {
    const replay = this._replay(requestKey, therapistId, "decline");
    if (replay) return replay;
    const job = this._job(jobId);
    if (!job) return this._remember(requestKey, therapistId, "decline", { state: "CHECKING", code: "JOB_NOT_INITIALIZED" }, now);
    const offer = this._offer(therapistId);
    if (!offer) return this._remember(requestKey, therapistId, "decline", { state: "TAKEN", code: "OFFER_NOT_FOUND" }, now);
    if (job.winner_therapist_id) {
      const state = job.winner_therapist_id === therapistId ? canonicalClientState(job.state) : "TAKEN";
      return this._remember(requestKey, therapistId, "decline", { state }, now);
    }
    if (Number(offer.expires_at) <= now) {
      this.ctx.storage.sql.exec("UPDATE dispatch_offers SET status='EXPIRED', responded_at=?, updated_at=? WHERE therapist_id=?", now, now, therapistId);
      return this._remember(requestKey, therapistId, "decline", { state: "EXPIRED" }, now);
    }
    if (offer.status !== "OFFERED") return this._remember(requestKey, therapistId, "decline", { state: canonicalClientState(offer.status) }, now);
    this.ctx.storage.sql.exec("UPDATE dispatch_offers SET status='DECLINED', responded_at=?, updated_at=? WHERE therapist_id=?", now, now, therapistId);
    return this._remember(requestKey, therapistId, "decline", { state: "DECLINED" }, now);
  }

  transition(jobId, therapistId, requestKey, action, now) {
    const replay = this._replay(requestKey, therapistId, action);
    if (replay) return replay;
    const job = this._job(jobId);
    if (!job) return this._remember(requestKey, therapistId, action, { state: "CHECKING", code: "JOB_NOT_INITIALIZED" }, now);
    if (job.winner_therapist_id !== therapistId) return this._remember(requestKey, therapistId, action, { state: "TAKEN", code: "NOT_JOB_OWNER" }, now);
    const from = action === "start" ? "ACCEPTED" : "IN_PROGRESS";
    const to = action === "start" ? "IN_PROGRESS" : "COMPLETED";
    if (job.state === to || (action === "start" && job.state === "COMPLETED")) {
      return this._remember(requestKey, therapistId, action, { state: canonicalClientState(job.state) }, now);
    }
    if (job.state !== from) return this._remember(requestKey, therapistId, action, { state: canonicalClientState(job.state), code: "INVALID_JOB_TRANSITION" }, now);
    const timeField = action === "start" ? "started_at" : "completed_at";
    this.ctx.storage.sql.exec(
      `UPDATE dispatch_jobs SET state=?, ${timeField}=?, version=version+1, updated_at=? WHERE job_id=?`,
      to,
      now,
      now,
      jobId,
    );
    return this._remember(requestKey, therapistId, action, { state: to, at: new Date(now).toISOString() }, now);
  }

  cancel(jobId, requestKey, now) {
    const replay = this._replay(requestKey, "internal", "cancel");
    if (replay) return replay;
    const job = this._job(jobId);
    if (!job) return this._remember(requestKey, "internal", "cancel", { state: "CHECKING", code: "JOB_NOT_INITIALIZED" }, now);
    if (job.state === "COMPLETED") return this._remember(requestKey, "internal", "cancel", { state: "COMPLETED", code: "JOB_ALREADY_COMPLETED" }, now);
    if (job.state !== "CANCELLED") {
      this.ctx.storage.sql.exec(
        "UPDATE dispatch_jobs SET state='CANCELLED', cancelled_at=?, version=version+1, updated_at=? WHERE job_id=?",
        now,
        now,
        jobId,
      );
      this.ctx.storage.sql.exec(
        "UPDATE dispatch_offers SET status='CANCELLED', responded_at=COALESCE(responded_at, ?), updated_at=? WHERE status IN ('OFFERED','ACCEPTED')",
        now,
        now,
      );
    }
    return this._remember(requestKey, "internal", "cancel", { state: "CANCELLED" }, now);
  }

  _job(jobId) {
    const row = this.ctx.storage.sql.exec("SELECT * FROM dispatch_jobs WHERE job_id=?", jobId).toArray()[0];
    return row ? dispatchJobRow(row) : null;
  }

  _offer(therapistId) {
    const row = this.ctx.storage.sql.exec("SELECT * FROM dispatch_offers WHERE therapist_id=?", therapistId).toArray()[0];
    return row ? dispatchOfferRow(row) : null;
  }

  _replay(requestKey, therapistId, action) {
    if (!requestKey) return null;
    const row = this.ctx.storage.sql.exec("SELECT * FROM dispatch_requests WHERE request_key=?", requestKey).toArray()[0];
    if (!row) return null;
    if (row.therapist_id !== therapistId || row.action !== action) return { state: "CHECKING", code: "IDEMPOTENCY_CONFLICT" };
    try { return JSON.parse(row.result_json); } catch { return { state: "CHECKING", code: "IDEMPOTENCY_CORRUPT" }; }
  }

  _remember(requestKey, therapistId, action, result, now) {
    if (requestKey) {
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO dispatch_requests (request_key, therapist_id, action, result_json, created_at) VALUES (?, ?, ?, ?, ?)",
        requestKey,
        therapistId,
        action,
        JSON.stringify(result),
        now,
      );
    }
    return result;
  }
}

export function isMyMmsDispatchRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === APP_PATHS.offers || path === APP_PATHS.jobs || OFFER_RE.test(path) || ACCEPT_RE.test(path) || DECLINE_RE.test(path) || JOB_RE.test(path) || START_RE.test(path) || COMPLETE_RE.test(path) || INTERNAL_MATCH_RE.test(path) || INTERNAL_JOB_RE.test(path) || INTERNAL_CANCEL_RE.test(path);
}

export async function maybeHandleMyMmsDispatch(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (!isMyMmsDispatchRequest(path)) return null;

  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(request, env) });

    const internalMatch = path.match(INTERNAL_MATCH_RE);
    if (internalMatch) {
      requireInternalRequest(request, env);
      if (request.method !== "POST") return methodNotAllowed(request, env);
      return json({ ok: true, data: await dispatchPrebooking(request, env, internalMatch[1]) }, 200, request, env);
    }

    const internalJob = path.match(INTERNAL_JOB_RE);
    if (internalJob) {
      requireInternalRequest(request, env);
      if (request.method !== "GET") return methodNotAllowed(request, env);
      const job = await findUniqueByField(env, tableId(env, "JOBS"), "Job ID", internalJob[1]);
      if (!job) throw dispatchError(404, "JOB_NOT_FOUND");
      return json({ ok: true, data: internalJobProjection(job) }, 200, request, env);
    }

    const internalCancel = path.match(INTERNAL_CANCEL_RE);
    if (internalCancel) {
      requireInternalRequest(request, env);
      if (request.method !== "POST") return methodNotAllowed(request, env);
      const body = await readJson(request);
      const requestKey = requiredRequestKey(body.request_key, `cancel:${internalCancel[1]}`);
      const result = await dispatchStub(env, internalCancel[1]).cancel(internalCancel[1], requestKey, Date.now());
      await projectJobState(env, internalCancel[1], result);
      await projectOfferStatesFromSnapshot(env, internalCancel[1]);
      return actionJson(internalCancel[1], result, request, env);
    }

    const therapist = await requireMyMmsApprovedTherapist(request, env);
    const therapistId = clean(therapist?.fields?.["Therapist ID"], 80);
    if (!therapistId) throw dispatchError(403, "THERAPIST_ACCESS_DENIED");

    if (path === APP_PATHS.offers) {
      if (request.method !== "GET") return methodNotAllowed(request, env);
      const offers = await listTherapistOffers(env, therapistId);
      return json({ ok: true, data: offers }, 200, request, env);
    }

    if (path === APP_PATHS.jobs) {
      if (request.method !== "GET") return methodNotAllowed(request, env);
      const jobs = await listTherapistJobs(env, therapistId);
      return json({ ok: true, data: jobs }, 200, request, env);
    }

    const offerMatch = path.match(OFFER_RE);
    if (offerMatch) {
      if (request.method !== "GET") return methodNotAllowed(request, env);
      const offer = await readTherapistOffer(env, therapistId, offerMatch[1]);
      if (!offer) throw dispatchError(404, "OFFER_NOT_FOUND");
      return json({ ok: true, data: offer }, 200, request, env);
    }

    const acceptMatch = path.match(ACCEPT_RE);
    if (acceptMatch) {
      if (request.method !== "POST") return methodNotAllowed(request, env);
      const body = await readJson(request);
      const requestKey = requiredRequestKey(body.requestKey ?? body.request_key, `accept:${acceptMatch[1]}:${therapistId}`);
      const offer = await findOfferForTherapist(env, acceptMatch[1], therapistId);
      if (!offer) throw dispatchError(404, "OFFER_NOT_FOUND");
      const result = await dispatchStub(env, acceptMatch[1]).accept(acceptMatch[1], therapistId, requestKey, Date.now());
      await projectAcceptResult(env, acceptMatch[1], result);
      return actionJson(acceptMatch[1], result, request, env);
    }

    const declineMatch = path.match(DECLINE_RE);
    if (declineMatch) {
      if (request.method !== "POST") return methodNotAllowed(request, env);
      const body = await readJson(request);
      const requestKey = requiredRequestKey(body.requestKey ?? body.request_key, `decline:${declineMatch[1]}:${therapistId}`);
      const offer = await findOfferForTherapist(env, declineMatch[1], therapistId);
      if (!offer) throw dispatchError(404, "OFFER_NOT_FOUND");
      const result = await dispatchStub(env, declineMatch[1]).decline(declineMatch[1], therapistId, requestKey, Date.now());
      await projectSingleOfferState(env, offer, result.state, requestKey);
      return actionJson(declineMatch[1], result, request, env);
    }

    const jobMatch = path.match(JOB_RE);
    if (jobMatch) {
      if (request.method !== "GET") return methodNotAllowed(request, env);
      const job = await readTherapistJob(env, therapistId, jobMatch[1]);
      if (!job) throw dispatchError(404, "JOB_NOT_FOUND");
      return json({ ok: true, data: job }, 200, request, env);
    }

    const startMatch = path.match(START_RE);
    if (startMatch) {
      if (request.method !== "POST") return methodNotAllowed(request, env);
      const body = await readJson(request);
      const requestKey = requiredRequestKey(body.requestKey ?? body.request_key, `start:${startMatch[1]}:${therapistId}`);
      const owned = await findOwnedJob(env, startMatch[1], therapistId);
      if (!owned) throw dispatchError(404, "JOB_NOT_FOUND");
      const result = await dispatchStub(env, startMatch[1]).transition(startMatch[1], therapistId, requestKey, "start", Date.now());
      await projectJobState(env, startMatch[1], result);
      return actionJson(startMatch[1], result, request, env);
    }

    const completeMatch = path.match(COMPLETE_RE);
    if (completeMatch) {
      if (request.method !== "POST") return methodNotAllowed(request, env);
      const body = await readJson(request);
      const requestKey = requiredRequestKey(body.requestKey ?? body.request_key, `complete:${completeMatch[1]}:${therapistId}`);
      const owned = await findOwnedJob(env, completeMatch[1], therapistId);
      if (!owned) throw dispatchError(404, "JOB_NOT_FOUND");
      const result = await dispatchStub(env, completeMatch[1]).transition(completeMatch[1], therapistId, requestKey, "complete", Date.now());
      await projectJobState(env, completeMatch[1], result);
      return actionJson(completeMatch[1], result, request, env);
    }

    return null;
  } catch (error) {
    const status = Number(error?.status) || 503;
    const code = clean(error?.code || error?.message, 120) || "MMS_DISPATCH_UNAVAILABLE";
    return json({ ok: false, error: { code } }, status, request, env);
  }
}

async function dispatchPrebooking(request, env, prebookingId) {
  requireDispatchConfig(env);
  const body = await readJson(request);
  rejectUnknownKeys(body, new Set([
    "request_key", "service_label", "safe_area_label", "safe_note_label", "exact_address",
    "customer_display_label", "customer_contact", "map_url", "travel_label", "eta_label",
    "therapist_payout_thb", "payout_note", "payment_state_label", "offer_ttl_seconds", "max_offers",
  ]));
  const requestKey = requiredRequestKey(body.request_key, `dispatch:${prebookingId}`);
  const prebooking = await findUniqueByField(env, tableId(env, "PREBOOKINGS"), "Prebooking ID", prebookingId);
  if (!prebooking) throw dispatchError(404, "PREBOOKING_NOT_FOUND");
  const existingJobId = await deterministicId("mmsjob", prebookingId);
  const existing = await findUniqueByField(env, tableId(env, "JOBS"), "Job ID", existingJobId);
  if (existing) {
    return {
      duplicate: true,
      request_key: requestKey,
      job: internalJobProjection(existing),
      offers: await listOffersByJob(env, existingJobId).then((items) => items.map(internalOfferProjection)),
    };
  }

  const pf = prebooking.fields || {};
  const recipientGender = clean(selectName(pf["Recipient Gender"]), 80);
  const zone = clean(selectName(pf.Zone), 120);
  const skills = arrayStrings(pf["Selected Skills"]);
  if (!recipientGender || !zone || !skills.length) throw dispatchError(409, "PREBOOKING_NOT_READY_FOR_MATCHING");

  const therapists = await listAllRecords(env, tableId(env, "THERAPISTS"));
  const accessById = new Map(therapists.map((record) => [clean(record.fields?.["Therapist ID"], 80), clean(selectName(record.fields?.["MY MMS Access"]), 40)]));
  const result = matchTherapists(therapists, { recipient_gender: recipientGender, zone, skills });
  if (result.requires_manual_coordination) throw dispatchError(409, "MANUAL_COORDINATION_REQUIRED");
  const maxOffers = boundedInt(body.max_offers, 1, 10, DEFAULT_MAX_OFFERS);
  const candidates = result.matches
    .filter((item) => item.availability_status === "Available")
    .filter((item) => accessById.get(item.therapist_id) === "Approved")
    .slice(0, maxOffers);
  if (!candidates.length) throw dispatchError(409, "NO_AVAILABLE_APPROVED_THERAPIST");

  const now = Date.now();
  const ttlSeconds = boundedInt(body.offer_ttl_seconds, 60, 1800, DEFAULT_TTL_SECONDS);
  const expiresAt = now + ttlSeconds * 1000;
  const jobId = existingJobId;
  const serviceLabel = clean(body.service_label, 160) || skills.join(" · ");
  const durationMinutes = boundedInt(pf["Duration Minutes"], 15, 480, 60);
  const serviceStartAt = combineBangkokDateTime(pf["Service Date"], pf["Service Time"]);
  const safeAreaLabel = clean(body.safe_area_label, 180) || zone;
  const payout = optionalMoney(body.therapist_payout_thb);
  const internalPayload = {
    request_key: requestKey,
    member_ref: clean(pf["Member Ref"], 160) || null,
    exact_address: clean(body.exact_address, 2000) || null,
    customer_display_label: clean(body.customer_display_label, 160) || null,
    customer_contact: clean(body.customer_contact, 240) || null,
    map_url: safeHttpsUrl(body.map_url),
    safe_note_label: clean(body.safe_note_label, 500) || null,
  };
  const matchingSnapshot = candidates.map((candidate, index) => ({
    therapist_id: candidate.therapist_id,
    rank: index + 1,
    matched_skills: candidate.matched_skills,
    match_score: candidate.match_score,
    availability_status: candidate.availability_status,
  }));
  const jobFields = compact({
    "Job ID": jobId,
    "Prebooking ID": prebookingId,
    Service: serviceLabel,
    "Duration Minutes": durationMinutes,
    "Service Start At": serviceStartAt,
    Zone: zone,
    "Safe Area Label": safeAreaLabel,
    "Exact Address Private": internalPayload.exact_address,
    "Customer Display Private": internalPayload.customer_display_label,
    "Customer Contact Private": internalPayload.customer_contact,
    "Map URL Private": internalPayload.map_url,
    "Travel Label": clean(body.travel_label, 160) || null,
    "ETA Label": clean(body.eta_label, 160) || null,
    "Therapist Payout THB": payout,
    "Payout Note": clean(body.payout_note, 240) || null,
    "Payment State Label": clean(body.payment_state_label, 160) || null,
    "Job Status": "Offered",
    "Matching Snapshot JSON": JSON.stringify(matchingSnapshot),
    "Internal Payload JSON": JSON.stringify(internalPayload),
    Version: 1,
    "Created At": new Date(now).toISOString(),
    "Updated At": new Date(now).toISOString(),
  });
  await createRecord(env, tableId(env, "JOBS"), jobFields);

  const offerRows = [];
  const coordinatorOffers = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const offerId = await deterministicId("mmsoffer", `${jobId}:${candidate.therapist_id}`);
    const safeSnapshot = {
      job_id: jobId,
      service_label: serviceLabel,
      duration_minutes: durationMinutes,
      service_start_at: serviceStartAt,
      area_label: safeAreaLabel,
      travel_label: clean(body.travel_label, 160) || null,
      eta_label: clean(body.eta_label, 160) || null,
      payout_thb: payout,
      payout_note: clean(body.payout_note, 240) || null,
      note_label: internalPayload.safe_note_label,
      expires_at: new Date(expiresAt).toISOString(),
    };
    const fields = compact({
      "Offer ID": offerId,
      "Job ID": jobId,
      "Therapist ID": candidate.therapist_id,
      "Offer Status": "Offered",
      "Offered At": new Date(now).toISOString(),
      "Expires At": new Date(expiresAt).toISOString(),
      "Match Rank": index + 1,
      "Payout THB": payout,
      "Safe Area Label": safeAreaLabel,
      "Travel Label": clean(body.travel_label, 160) || null,
      "ETA Label": clean(body.eta_label, 160) || null,
      "Safe Payload JSON": JSON.stringify(safeSnapshot),
      Version: 1,
      "Created At": new Date(now).toISOString(),
      "Updated At": new Date(now).toISOString(),
    });
    await createRecord(env, tableId(env, "OFFERS"), fields);
    offerRows.push({ id: offerId, therapist_id: candidate.therapist_id, rank: index + 1 });
    coordinatorOffers.push({ therapist_id: candidate.therapist_id, offer_id: offerId, expires_at: expiresAt });
  }
  await dispatchStub(env, jobId).initialize(jobId, coordinatorOffers, now);
  return {
    duplicate: false,
    request_key: requestKey,
    job_id: jobId,
    state: "OFFERED",
    matched_count: result.matches.length,
    offered_count: offerRows.length,
    offers: offerRows,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

async function listTherapistOffers(env, therapistId) {
  const records = await listByFormula(env, tableId(env, "OFFERS"), `{Therapist ID}=${formulaString(therapistId)}`);
  const now = Date.now();
  const output = [];
  for (const record of records) {
    const fields = record.fields || {};
    if (clean(selectName(fields["Offer Status"]), 40) !== "Offered") continue;
    const expires = Date.parse(clean(fields["Expires At"], 80));
    if (Number.isFinite(expires) && expires <= now) {
      await updateRecord(env, tableId(env, "OFFERS"), record.id, { "Offer Status": "Expired", "Responded At": new Date(now).toISOString(), "Updated At": new Date(now).toISOString() }).catch(() => null);
      continue;
    }
    const job = await findUniqueByField(env, tableId(env, "JOBS"), "Job ID", clean(fields["Job ID"], 80));
    if (!job) continue;
    output.push(offerProjection(record, job));
  }
  return output;
}

async function readTherapistOffer(env, therapistId, jobId) {
  const record = await findOfferForTherapist(env, jobId, therapistId);
  if (!record) return null;
  const fields = record.fields || {};
  let state = clean(selectName(fields["Offer Status"]), 40);
  const expires = Date.parse(clean(fields["Expires At"], 80));
  if (state === "Offered" && Number.isFinite(expires) && expires <= Date.now()) {
    state = "Expired";
    await updateRecord(env, tableId(env, "OFFERS"), record.id, { "Offer Status": "Expired", "Responded At": new Date().toISOString(), "Updated At": new Date().toISOString() }).catch(() => null);
  }
  const job = await findUniqueByField(env, tableId(env, "JOBS"), "Job ID", jobId);
  if (!job) return null;
  return offerProjection({ ...record, fields: { ...fields, "Offer Status": state } }, job);
}

async function listTherapistJobs(env, therapistId) {
  const records = await listByFormula(env, tableId(env, "JOBS"), `{Accepted Therapist ID}=${formulaString(therapistId)}`);
  return records
    .sort((a, b) => Date.parse(clean(b.fields?.["Service Start At"], 80)) - Date.parse(clean(a.fields?.["Service Start At"], 80)))
    .map((record) => jobProjection(record));
}

async function readTherapistJob(env, therapistId, jobId) {
  const record = await findOwnedJob(env, jobId, therapistId);
  return record ? jobProjection(record) : null;
}

async function findOwnedJob(env, jobId, therapistId) {
  const record = await findUniqueByField(env, tableId(env, "JOBS"), "Job ID", jobId);
  if (!record) return null;
  return clean(record.fields?.["Accepted Therapist ID"], 80) === therapistId ? record : null;
}

async function findOfferForTherapist(env, jobId, therapistId) {
  const formula = `AND({Job ID}=${formulaString(jobId)},{Therapist ID}=${formulaString(therapistId)})`;
  const records = await listByFormula(env, tableId(env, "OFFERS"), formula, 2);
  if (records.length > 1) throw dispatchError(503, "OFFER_IDENTITY_CONFLICT");
  return records[0] || null;
}

async function projectAcceptResult(env, jobId, result) {
  if (result?.state === "ACCEPTED") {
    const now = new Date().toISOString();
    await patchByField(env, tableId(env, "JOBS"), "Job ID", jobId, compact({
      "Job Status": "Accepted",
      "Accepted Therapist ID": clean(result.winner_therapist_id, 80),
      "Accepted At": clean(result.accepted_at, 80) || now,
      "Updated At": now,
      Version: Number(result.version) || undefined,
    }));
  }
  if (Array.isArray(result?.offer_updates)) {
    const allOffers = await listOffersByJob(env, jobId);
    const byTherapist = new Map(allOffers.map((record) => [clean(record.fields?.["Therapist ID"], 80), record]));
    for (const update of result.offer_updates) {
      const record = byTherapist.get(clean(update.therapist_id, 80));
      if (!record) continue;
      await updateRecord(env, tableId(env, "OFFERS"), record.id, compact({
        "Offer Status": airtableOfferStatus(update.status),
        "Responded At": update.responded_at ? new Date(Number(update.responded_at)).toISOString() : new Date().toISOString(),
        "Updated At": new Date().toISOString(),
      }));
    }
  }
}

async function projectSingleOfferState(env, offer, state, requestKey) {
  const status = airtableOfferStatus(state);
  if (!status) return;
  await updateRecord(env, tableId(env, "OFFERS"), offer.id, {
    "Offer Status": status,
    "Responded At": new Date().toISOString(),
    "Response Request Key": requestKey,
    "Updated At": new Date().toISOString(),
  });
}

async function projectJobState(env, jobId, result) {
  const map = { ACCEPTED: "Accepted", IN_PROGRESS: "In Progress", COMPLETED: "Completed", CANCELLED: "Cancelled", EXPIRED: "Expired", OFFERED: "Offered" };
  const status = map[result?.state];
  if (!status) return;
  const now = new Date().toISOString();
  const fields = { "Job Status": status, "Updated At": now };
  if (result.state === "IN_PROGRESS") fields["Started At"] = clean(result.at, 80) || now;
  if (result.state === "COMPLETED") fields["Completed At"] = clean(result.at, 80) || now;
  if (result.state === "CANCELLED") fields["Cancelled At"] = now;
  await patchByField(env, tableId(env, "JOBS"), "Job ID", jobId, fields);
}

async function projectOfferStatesFromSnapshot(env, jobId) {
  const snapshot = await dispatchStub(env, jobId).snapshot(jobId);
  const records = await listOffersByJob(env, jobId);
  const byTherapist = new Map(records.map((record) => [clean(record.fields?.["Therapist ID"], 80), record]));
  for (const update of snapshot.offers || []) {
    const record = byTherapist.get(update.therapist_id);
    if (!record) continue;
    await updateRecord(env, tableId(env, "OFFERS"), record.id, compact({
      "Offer Status": airtableOfferStatus(update.status),
      "Responded At": update.responded_at ? new Date(Number(update.responded_at)).toISOString() : null,
      "Updated At": new Date().toISOString(),
    }));
  }
}

function offerProjection(offerRecord, jobRecord) {
  const of = offerRecord?.fields || {};
  const jf = jobRecord?.fields || {};
  const safe = parseObject(of["Safe Payload JSON"]);
  return {
    jobId: clean(of["Job ID"], 80),
    refDisplay: displayRef(clean(of["Job ID"], 80)),
    state: clientOfferState(selectName(of["Offer Status"])),
    serviceLabel: clean(safe.service_label || jf.Service, 160) || "Male Massage",
    durationLabel: durationLabel(safe.duration_minutes ?? jf["Duration Minutes"]),
    scheduledLabel: scheduledLabel(safe.service_start_at || jf["Service Start At"]),
    areaLabel: clean(safe.area_label || of["Safe Area Label"] || jf["Safe Area Label"], 180) || null,
    travelLabel: clean(safe.travel_label || of["Travel Label"] || jf["Travel Label"], 160) || null,
    etaLabel: clean(safe.eta_label || of["ETA Label"] || jf["ETA Label"], 160) || null,
    payoutLabel: moneyLabel(safe.payout_thb ?? of["Payout THB"] ?? jf["Therapist Payout THB"]),
    payoutNote: clean(safe.payout_note || jf["Payout Note"], 240) || null,
    expiresAt: clean(safe.expires_at || of["Expires At"], 80) || null,
    noteLabel: clean(safe.note_label, 500) || null,
  };
}

function jobProjection(record) {
  const fields = record?.fields || {};
  const internal = parseObject(fields["Internal Payload JSON"]);
  const state = clientJobState(selectName(fields["Job Status"]));
  const accepted = ["ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(state);
  const base = {
    jobId: clean(fields["Job ID"], 80),
    refDisplay: displayRef(clean(fields["Job ID"], 80)),
    state,
    serviceLabel: clean(fields.Service, 160) || "Male Massage",
    durationLabel: durationLabel(fields["Duration Minutes"]),
    scheduledLabel: scheduledLabel(fields["Service Start At"]),
    areaLabel: clean(fields["Safe Area Label"] || fields.Zone, 180) || null,
    travelLabel: clean(fields["Travel Label"], 160) || null,
    etaLabel: clean(fields["ETA Label"], 160) || null,
    payoutLabel: moneyLabel(fields["Therapist Payout THB"]),
    payoutNote: clean(fields["Payout Note"], 240) || null,
    expiresAt: null,
    noteLabel: null,
  };
  return {
    ...base,
    disclosure: {
      locationUnlocked: accepted && Boolean(clean(fields["Exact Address Private"], 2000)),
      addressLabel: accepted ? clean(fields["Exact Address Private"], 2000) || null : null,
      mapUrl: accepted ? safeHttpsUrl(fields["Map URL Private"]) : null,
      customerDisplayLabel: accepted ? clean(fields["Customer Display Private"] || internal.customer_display_label, 160) || null : null,
      contactLabel: accepted ? clean(fields["Customer Contact Private"] || internal.customer_contact, 240) || null : null,
      contactUrl: null,
    },
    payoutSummaryLabel: clean(fields["Payout Note"], 240) || null,
    paymentStateLabel: clean(fields["Payment State Label"], 160) || null,
    timeline: timelineFor(fields, state),
    supportUrl: SUPPORT_URL,
  };
}

function internalJobProjection(record) {
  const f = record?.fields || {};
  return {
    job_id: clean(f["Job ID"], 80),
    prebooking_id: clean(f["Prebooking ID"], 80) || null,
    status: clean(selectName(f["Job Status"]), 40),
    accepted_therapist_id: clean(f["Accepted Therapist ID"], 80) || null,
    service_start_at: clean(f["Service Start At"], 80) || null,
    version: Number(f.Version) || 1,
  };
}

function internalOfferProjection(record) {
  const f = record?.fields || {};
  return {
    offer_id: clean(f["Offer ID"], 80),
    job_id: clean(f["Job ID"], 80),
    therapist_id: clean(f["Therapist ID"], 80),
    status: clean(selectName(f["Offer Status"]), 40),
    expires_at: clean(f["Expires At"], 80) || null,
  };
}

function actionJson(jobId, result, request, env) {
  const state = canonicalClientState(result?.state);
  const status = state === "TAKEN" ? 409 : state === "EXPIRED" ? 410 : state === "CHECKING" ? 409 : 200;
  const messageMap = {
    ACCEPTED: "JOB CONFIRMED ✓",
    DECLINED: "ปฏิเสธงานนี้แล้ว",
    TAKEN: "งานนี้มี Therapist รับแล้ว",
    EXPIRED: "งานนี้หมดเวลาตอบรับแล้ว",
    IN_PROGRESS: "เริ่มให้บริการแล้ว",
    COMPLETED: "งานเสร็จสิ้น",
    CANCELLED: "งานนี้ถูกยกเลิก",
  };
  return json({ ok: status < 400, data: { jobId, state, message: messageMap[state] || null }, ...(status >= 400 ? { error: { code: clean(result?.code, 120) || state } } : {}) }, status, request, env);
}

function timelineFor(fields, state) {
  const entries = [
    { key: "ACCEPTED", label: "รับงานแล้ว", at: fields["Accepted At"] },
    { key: "IN_PROGRESS", label: "เริ่มให้บริการ", at: fields["Started At"] },
    { key: "COMPLETED", label: "งานเสร็จสิ้น", at: fields["Completed At"] },
  ];
  const order = { ACCEPTED: 0, IN_PROGRESS: 1, COMPLETED: 2, CANCELLED: 0 };
  const current = order[state] ?? 0;
  return entries.map((entry, index) => ({
    label: entry.label,
    atLabel: scheduledLabel(entry.at),
    note: null,
    state: index < current ? "done" : index === current ? "current" : "upcoming",
  }));
}

async function listOffersByJob(env, jobId) {
  return listByFormula(env, tableId(env, "OFFERS"), `{Job ID}=${formulaString(jobId)}`);
}

async function patchByField(env, table, field, value, fields) {
  const record = await findUniqueByField(env, table, field, value);
  if (!record) throw dispatchError(404, "RECORD_NOT_FOUND");
  return updateRecord(env, table, record.id, fields);
}

async function findUniqueByField(env, table, field, value) {
  const records = await listByFormula(env, table, `{${field}}=${formulaString(value)}`, 2);
  if (records.length > 1) throw dispatchError(503, "CANONICAL_ID_CONFLICT");
  return records[0] || null;
}

async function listByFormula(env, table, formula, maxRecords = 100) {
  requireAirtable(env);
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", String(Math.min(100, maxRecords)));
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("filterByFormula", formula);
  const data = await airtableFetch(url, { method: "GET" }, env);
  return Array.isArray(data.records) ? data.records : [];
}

async function listAllRecords(env, table) {
  requireAirtable(env);
  const records = [];
  let offset = "";
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const data = await airtableFetch(url, { method: "GET" }, env);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = clean(data.offset, 200);
    if (!offset) break;
  }
  return records;
}

async function createRecord(env, table, fields) {
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`;
  return airtableFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields, typecast: false }) }, env);
}

async function updateRecord(env, table, recordId, fields) {
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  return airtableFetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: compact(fields), typecast: false }) }, env);
}

async function airtableFetch(url, init, env) {
  requireAirtable(env);
  let response;
  try {
    response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`, ...(init.headers || {}) } });
  } catch {
    throw dispatchError(503, "AIRTABLE_UNAVAILABLE");
  }
  if (!response.ok) throw dispatchError(503, `AIRTABLE_${response.status}`);
  try { return await response.json(); } catch { throw dispatchError(503, "AIRTABLE_INVALID_RESPONSE"); }
}

function requireDispatchConfig(env) {
  requireAirtable(env);
  for (const suffix of ["PREBOOKINGS", "THERAPISTS", "JOBS", "OFFERS"]) tableId(env, suffix);
  if (!env.MMS_DISPATCH_COORDINATOR?.get || !env.MMS_DISPATCH_COORDINATOR?.idFromName) throw dispatchError(503, "DISPATCH_COORDINATOR_NOT_CONFIGURED");
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_BASE_ID, 80) || !String(env.AIRTABLE_API_TOKEN || "")) throw dispatchError(503, "MMS_DISPATCH_NOT_CONFIGURED");
}

function tableId(env, suffix) {
  const value = clean(env[`AIRTABLE_${suffix}_TABLE_ID`], 80);
  if (!/^tbl[A-Za-z0-9]{14}$/.test(value)) throw dispatchError(503, `AIRTABLE_${suffix}_TABLE_INVALID`);
  return value;
}

function dispatchStub(env, jobId) {
  if (!env.MMS_DISPATCH_COORDINATOR?.get || !env.MMS_DISPATCH_COORDINATOR?.idFromName) throw dispatchError(503, "DISPATCH_COORDINATOR_NOT_CONFIGURED");
  return env.MMS_DISPATCH_COORDINATOR.get(env.MMS_DISPATCH_COORDINATOR.idFromName(jobId));
}

function requireInternalRequest(request, env) {
  const host = new URL(request.url).hostname.toLowerCase();
  if (host !== clean(env.MMS_INTERNAL_HOST || INTERNAL_HOST, 160).toLowerCase()) throw dispatchError(404, "NOT_FOUND");
}

function responseHeaders(request, env) {
  const headers = new Headers({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  const origin = clean(request?.headers?.get?.("Origin"), 300);
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean));
  if (origin && allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    headers.set("Vary", "Origin");
  }
  return headers;
}

function json(payload, status, request, env) {
  return new Response(JSON.stringify(payload), { status, headers: new Headers({ ...Object.fromEntries(responseHeaders(request, env)), "Content-Type": "application/json; charset=utf-8" }) });
}

function methodNotAllowed(request, env) {
  return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, request, env);
}

async function readJson(request) {
  const type = clean(request.headers.get("content-type"), 120).toLowerCase();
  if (request.method !== "GET" && !type.startsWith("application/json")) throw dispatchError(415, "JSON_REQUIRED");
  const text = await request.text();
  if (text.length > 32 * 1024) throw dispatchError(413, "JSON_TOO_LARGE");
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value;
  } catch {
    throw dispatchError(400, "INVALID_JSON");
  }
}

function rejectUnknownKeys(body, allowed) {
  const unknown = Object.keys(body || {}).filter((key) => !allowed.has(key));
  if (unknown.length) throw dispatchError(400, "UNKNOWN_FIELD");
}

function requiredRequestKey(value, fallback) {
  const key = clean(value || fallback, 160);
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) throw dispatchError(400, "REQUEST_KEY_INVALID");
  return key;
}

function combineBangkokDateTime(dateValue, timeValue) {
  const date = clean(dateValue, 40).slice(0, 10);
  const timeRaw = clean(timeValue, 40);
  const time = /^\d{2}:\d{2}/.test(timeRaw) ? timeRaw.slice(0, 5) : "12:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw dispatchError(409, "PREBOOKING_SERVICE_DATE_INVALID");
  const iso = `${date}T${time}:00+07:00`;
  if (!Number.isFinite(Date.parse(iso))) throw dispatchError(409, "PREBOOKING_SERVICE_TIME_INVALID");
  return iso;
}

function displayRef(jobId) {
  const tail = clean(jobId, 80).replace(/^mmsjob_/, "").slice(0, 10).toUpperCase();
  return tail ? `MMS-J-${tail}` : null;
}

function durationLabel(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? `${Math.round(number)} นาที` : null;
}

function scheduledLabel(value) {
  const time = Date.parse(clean(value, 80));
  if (!Number.isFinite(time)) return null;
  try {
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(time));
  } catch { return new Date(time).toISOString(); }
}

function moneyLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  try { return `฿${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(number)}`; }
  catch { return `฿${Math.round(number)}`; }
}

function optionalMoney(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000000) throw dispatchError(400, "THERAPIST_PAYOUT_INVALID");
  return Math.round(number);
}

function safeHttpsUrl(value) {
  const raw = clean(value, 1200);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}

function arrayStrings(value) {
  return Array.isArray(value) ? value.map((item) => clean(selectName(item), 160)).filter(Boolean) : [];
}

function selectName(value) {
  return value && typeof value === "object" && typeof value.name === "string" ? value.name : value;
}

function clientOfferState(value) {
  const map = { Offered: "OFFERED", Accepted: "ACCEPTED", Declined: "DECLINED", Expired: "EXPIRED", Taken: "TAKEN", Cancelled: "CANCELLED" };
  return map[clean(selectName(value), 40)] || "CHECKING";
}

function clientJobState(value) {
  const map = { Offered: "OFFERED", Accepted: "ACCEPTED", "In Progress": "IN_PROGRESS", Completed: "COMPLETED", Cancelled: "CANCELLED", Expired: "EXPIRED", Matching: "CHECKING" };
  return map[clean(selectName(value), 40)] || "CHECKING";
}

function canonicalClientState(value) {
  const state = clean(value, 40).toUpperCase().replace(/ /g, "_");
  return new Set(["OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "TAKEN", "CANCELLED", "IN_PROGRESS", "COMPLETED", "CHECKING"]).has(state) ? state : "CHECKING";
}

function airtableOfferStatus(value) {
  const map = { OFFERED: "Offered", ACCEPTED: "Accepted", DECLINED: "Declined", EXPIRED: "Expired", TAKEN: "Taken", CANCELLED: "Cancelled", Offered: "Offered", Accepted: "Accepted", Declined: "Declined", Expired: "Expired", Taken: "Taken", Cancelled: "Cancelled" };
  return map[value] || null;
}

function dispatchJobRow(row) {
  return {
    job_id: String(row.job_id),
    state: String(row.state),
    winner_therapist_id: row.winner_therapist_id ? String(row.winner_therapist_id) : null,
    accepted_at: row.accepted_at == null ? null : Number(row.accepted_at),
    started_at: row.started_at == null ? null : Number(row.started_at),
    completed_at: row.completed_at == null ? null : Number(row.completed_at),
    cancelled_at: row.cancelled_at == null ? null : Number(row.cancelled_at),
    version: Number(row.version) || 1,
    updated_at: Number(row.updated_at) || 0,
  };
}

function dispatchOfferRow(row) {
  return {
    therapist_id: String(row.therapist_id),
    offer_id: String(row.offer_id),
    status: String(row.status),
    expires_at: Number(row.expires_at),
    responded_at: row.responded_at == null ? null : Number(row.responded_at),
    updated_at: Number(row.updated_at) || 0,
  };
}

async function deterministicId(prefix, input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(input)));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex.slice(0, 24)}`;
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function boundedInt(value, min, max, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw dispatchError(400, "NUMBER_OUT_OF_RANGE");
  return number;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

class MmsDispatchError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function dispatchError(status, code) {
  return new MmsDispatchError(status, code);
}

export const myMmsDispatchContract = Object.freeze({
  app_api_prefix: APP_API,
  internal_match: "/internal/mms/dispatch/prebookings/:prebooking_id/match",
  internal_job: "/internal/mms/dispatch/jobs/:job_id",
  therapist_routes: Object.freeze([
    "GET /male-massage/therapists/api/app/offers",
    "GET /male-massage/therapists/api/app/offers/:job_id",
    "POST /male-massage/therapists/api/app/offers/:job_id/accept",
    "POST /male-massage/therapists/api/app/offers/:job_id/decline",
    "GET /male-massage/therapists/api/app/jobs",
    "GET /male-massage/therapists/api/app/jobs/:job_id",
    "POST /male-massage/therapists/api/app/jobs/:job_id/start",
    "POST /male-massage/therapists/api/app/jobs/:job_id/complete",
  ]),
  preaccept_forbidden: Object.freeze(["customer_name", "phone", "exact_address", "line_user_id", "payment_internal"]),
  first_accept_owner: "MMS_DISPATCH_COORDINATOR",
});
