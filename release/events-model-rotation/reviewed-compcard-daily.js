import { APPROVED_COMPCARD_MANIFEST } from "./compcard-approved-manifest.js";
import { automaticModelAllowed, destinationsForModelSlot, buildCompcardCaption, chooseDailyCard, destinationsForCategory, evaluateCard, publicationCadence } from "./compcard-policy.js";
import { assertIntakeCardCurrent, mergeApprovedIntake, readApprovedIntakeAsset } from "./compcard-intake.js";
import {
  compcardStorage, deliverCompcardOnce, freezeCompcardPlan, readCompcardHistory,
  readCompcardJson, reserveCompcardExposure, settleCompcardExposure, writeCompcardJson,
} from "./compcard-journal.js";

const TELEGRAM_ORIGIN = "https://telegram-worker.malemodel-bkk.workers.dev";
const PHOTO_PATH = "/telegram/internal/compcard/photo";
const TEXT_PATH = "/telegram/internal/compcard/text";
const DESTINATIONS_PATH = "/telegram/internal/compcard/destinations";
const MODEL_FIELDS = ["working_name", "status", "sales_layer", "private_tier", "model_class", "visibility", "catalog_visibility", "client_visibility_status", "approved_client_visibility", "registry_record_type", "MMD Public Category", "height_cm", "weight_kg"];
const MAX_PHOTO_BYTES = 10_000_000;
const MAX_CATCHUP_MINUTES = 90;
const READINESS_TTL_MS = 30 * 60 * 1000;
const DOUBLE_MOMENT_CAMPAIGN_ID = "double-moment-continues-2026-telegram";
const DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH = "2026-11";
const DOUBLE_MOMENT_MONTHLY_ANCHOR_DATE = "2026-11-03";
const DOUBLE_MOMENT_MONTHLY_ROOT = "monthly-promotions/double-moment/";
// Workers native fetch needs its runtime receiver when called via an injected
// function parameter. Preserve it while retaining explicit test overrides.
const runtimeFetch = (input, init) => globalThis.fetch(input, init);

function problem(code, retryable = true) {
  return Object.assign(new Error(code), { code, retryable });
}
function safeError(error) {
  const code = String(error?.code || error?.message || error || "");
  if (/^compcard_[a-z0-9_]{1,100}$/.test(code)) return code;
  const message = String(error?.message || "");
  if (/illegal invocation|invalid.*receiver/i.test(message)) return "compcard_runtime_receiver_invalid";
  if (/redirect/i.test(message) && /unsupported|invalid|not implemented/i.test(message)) return "compcard_runtime_redirect_unsupported";
  if (["AbortError", "TimeoutError"].includes(error?.name)) return "compcard_request_timed_out";
  if (error?.name === "TypeError") return "compcard_runtime_type_error";
  return "compcard_operation_failed";
}
function enabled(value) { return String(value || "").trim().toLowerCase() === "true"; }
function hhmm(value, fallback) {
  const text = String(value || fallback);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw problem("compcard_schedule_invalid", false);
  return text;
}
function minutesAt(value) { const [h, m] = value.split(":").map(Number); return h * 60 + m; }
export function compcardClock(now) {
  if (!Number.isFinite(now)) throw problem("compcard_time_invalid", false);
  const clock = new Date(now + 7 * 3600000).toISOString();
  return { date: clock.slice(0, 10), minutes: Number(clock.slice(11, 13)) * 60 + Number(clock.slice(14, 16)), time: clock.slice(11, 16) };
}
export function compcardSchedule(env = {}) {
  const model = hhmm(env.HYPE_COMPCARD_SEND_AT_ICT, "16:30");
  const promotion = hhmm(env.HYPE_PROMOTION_SEND_AT_ICT, "20:00");
  const standard = hhmm(env.HYPE_STANDARD_SEND_AT_ICT, promotion);
  // Model exposure is shared across both slots. Non-overlapping windows keep
  // the evening selection behind the afternoon slot's durable reservation.
  if (env.HYPE_CADENCE_START_DATE && enabled(env.HYPE_STANDARD_ENABLED)
      && Math.abs(minutesAt(model) - minutesAt(standard)) < MAX_CATCHUP_MINUTES) throw problem("compcard_schedule_overlap", false);
  return { timezone: "Asia/Bangkok", model, promotion, standard, catchup_minutes: MAX_CATCHUP_MINUTES };
}
function due(clock, time) {
  const start = minutesAt(time);
  return clock.minutes >= start && clock.minutes < Math.min(1440, start + MAX_CATCHUP_MINUTES);
}
function log(result) {
  // Keep captions, asset URLs, tokens and customer data out of Worker logs.
  try { console.log(JSON.stringify({ event: "hype_compcard_daily", date: result.date, status: result.status, slot: result.slot, error: result.error, sent: result.sent, uncertain: result.uncertain })); } catch { /* isolated from other scheduled jobs */ }
}
export async function compcardSha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function jsonDigest(value) { return compcardSha256(new TextEncoder().encode(JSON.stringify(value))); }
function writeCompcardSnapshot(bucket, key, result) {
  // R2 returns the object body directly. Keep operational errors inside an API
  // envelope so API clients do not mistake them for provider request failures.
  return writeCompcardJson(bucket, key, { schema: "hype_compcard_snapshot_v1", success: true, result });
}

export async function readApprovedCompcardAsset(card, http = runtimeFetch) {
  if (!/^[A-Za-z0-9_-]{10,180}$/.test(card.file_id || "") || !/^[a-f0-9]{64}$/.test(card.sha256 || "")
      || !["image/jpeg", "image/png"].includes(card.content_type) || !Number.isSafeInteger(card.bytes) || card.bytes < 1 || card.bytes > MAX_PHOTO_BYTES) {
    throw problem("compcard_manifest_asset_invalid", false);
  }
  let url = new URL("https://drive.google.com/uc");
  url.searchParams.set("export", "download");
  url.searchParams.set("id", card.file_id);
  let response;
  for (let hop = 0; hop <= 4; hop += 1) {
    if (url.protocol !== "https:" || url.username || url.password || url.port
        || !["drive.google.com", "drive.usercontent.google.com"].includes(url.hostname) && !url.hostname.endsWith(".googleusercontent.com")) {
      throw problem("compcard_drive_redirect_invalid", false);
    }
    response = await http(url.href, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = response.headers.get("location");
    if (!next || hop === 4) throw problem("compcard_drive_redirect_failed");
    url = new URL(next, url);
  }
  if (!response?.ok) throw problem("compcard_drive_read_failed");
  if ((response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== card.content_type) {
    throw problem("compcard_drive_not_original_image", false);
  }
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_PHOTO_BYTES)) throw problem("compcard_drive_size_invalid", false);
  if (!response.body) throw problem("compcard_drive_empty_image");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_PHOTO_BYTES) { await reader.cancel(); throw problem("compcard_drive_size_invalid", false); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  if (size !== card.bytes) throw problem("compcard_source_changed", false);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (await compcardSha256(bytes) !== card.sha256) throw problem("compcard_source_changed", false);
  return { bytes, content_type: card.content_type, sha256: card.sha256 };
}

function airtableConfig(env) {
  const base = String(env.AIRTABLE_BASE_ID || "").trim();
  const table = String(env.AIRTABLE_TABLE_MODELS || "").trim();
  const token = String(env.AIRTABLE_API_KEY || "").trim();
  if (!/^app[A-Za-z0-9]+$/.test(base) || !/^tbl[A-Za-z0-9]+$/.test(table) || !token) throw problem("compcard_models_not_configured");
  return { base, table, token };
}
export async function readCompcardModels(env, http = runtimeFetch) {
  const { base, table, token } = airtableConfig(env);
  let offset = "";
  const rows = [];
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`https://api.airtable.com/v0/${base}/${table}`);
    url.searchParams.set("pageSize", "100");
    for (const field of MODEL_FIELDS) url.searchParams.append("fields[]", field);
    if (offset) url.searchParams.set("offset", offset);
    const response = await http(url.href, { headers: { authorization: `Bearer ${token}` }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body?.records)) throw problem("compcard_models_read_failed");
    rows.push(...body.records);
    if (!body.offset) return rows;
    offset = String(body.offset);
  }
  throw problem("compcard_models_pagination_incomplete");
}
async function readCompcardModel(env, modelId, http = runtimeFetch) {
  const { base, table, token } = airtableConfig(env);
  if (!/^rec[A-Za-z0-9]+$/.test(modelId || "")) throw problem("compcard_model_id_invalid", false);
  const response = await http(`https://api.airtable.com/v0/${base}/${table}/${modelId}`, {
    headers: { authorization: `Bearer ${token}` }, redirect: "manual", signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.id !== modelId) throw problem("compcard_model_refresh_failed");
  return body;
}

async function telegramCall(env, path, { form, jsonBody, http, timeout = 95000 } = {}) {
  const token = String(env.AUTH_SERVICE_EVENTS_TO_TELEGRAM || "").trim();
  if (!token) throw problem("compcard_telegram_service_not_configured");
  const request = new Request(`${TELEGRAM_ORIGIN}${path}`, {
    method: form || jsonBody ? "POST" : "GET", headers: { "x-internal-token": token, ...(jsonBody ? { "content-type": "application/json" } : {}) },
    body: jsonBody ? JSON.stringify(jsonBody) : form,
    redirect: "manual", signal: AbortSignal.timeout(timeout),
  });
  const response = await (http || env.TELEGRAM_ROUTER?.fetch?.bind(env.TELEGRAM_ROUTER) || runtimeFetch)(request);
  if (response.status >= 300 && response.status < 400) return { status: response.status, ok: false, body: { delivery_state: request.method === "GET" ? "not_sent" : "delivery_uncertain", error: "compcard_telegram_redirect_rejected" } };
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}
export async function readCompcardDestinations(env, http) {
  const result = await telegramCall(env, DESTINATIONS_PATH, { http, timeout: 195000 });
  if (!Array.isArray(result.body?.destinations)) throw problem("compcard_destinations_unavailable");
  return result.body.destinations.map((row) => ({
    destination: row.destination, chat_id: row.chat_id || null, chat_type: row.chat_type || null,
    title: typeof row.title === "string" ? row.title.slice(0, 256) : null,
    identity_verified: row.identity_verified === true, can_send_photo: row.can_send_photo === true,
    bot_status: row.bot_status || null, ok: row.ok === true, error: row.error || null,
  }));
}
export async function sendApprovedCompcard(env, card, destination, caption, asset, http, expectedChatId) {
  if (card.kind === "text") {
    try {
      const { body } = await telegramCall(env, TEXT_PATH, { http, jsonBody: {
        destination, expected_chat_id: expectedChatId, text: caption, approved_sha256: card.sha256,
      } });
      if (body?.delivery_state === "not_sent") return body;
      if (body?.delivery_state === "sent" && body.destination === destination && body.approved_sha256 === card.sha256 && String(body.chat_id) === String(expectedChatId)) return body;
      return { delivery_state: "delivery_uncertain", error: "compcard_transport_receipt_unverified" };
    } catch { return { delivery_state: "delivery_uncertain", error: "compcard_transport_response_missing" }; }
  }
  const form = new FormData();
  form.set("destination", destination);
  form.set("caption", caption);
  form.set("approved_sha256", card.sha256);
  form.set("expected_chat_id", String(expectedChatId || ""));
  form.set("photo", new Blob([asset.bytes], { type: card.content_type }), `compcard.${card.content_type === "image/png" ? "png" : "jpg"}`);
  try {
    const { body } = await telegramCall(env, PHOTO_PATH, { form, http });
    if (body?.delivery_state === "not_sent") return body;
    if (body?.delivery_state === "sent" && body.destination === destination && body.approved_sha256 === card.sha256 && String(body.chat_id) === String(expectedChatId)) return body;
    return { delivery_state: "delivery_uncertain", error: "compcard_transport_receipt_unverified" };
  } catch { return { delivery_state: "delivery_uncertain", error: "compcard_transport_response_missing" }; }
}

function eligibleCards(manifest, models) {
  const byId = new Map(models.map((model) => [model.id, model]));
  const eligible = [];
  const excluded = [];
  for (const card of manifest.cards) {
    const check = automaticModelAllowed(card.model_id) ? evaluateCard(card, byId.get(card.model_id)) : { ok: false, reason: 'automatic_selection_excluded' };
    if (check.ok) eligible.push(card);
    else excluded.push({ model_id: card.model_id, file_id: card.file_id, reason: check.reason });
  }
  return { eligible, excluded, byId };
}
function captionForLiveCard(card, destination, model) {
  const fields = model?.fields || {};
  const conflicts = ["height_cm", "weight_kg"].some((field) => Number.isFinite(Number(fields[field])) && Number(fields[field]) > 0 && Number(card[field]) !== Number(fields[field]));
  return buildCompcardCaption({ ...card, caption_stats_allowed: card.caption_stats_allowed !== false && !conflicts }, destination);
}
function cardAssetReader(env, bucket, deps, now) {
  return card => card.source === "owner_drive_intake"
    ? readApprovedIntakeAsset(env, bucket, card, { now: typeof now === "function" ? now() : now })
    : (deps.asset || readApprovedCompcardAsset)(card);
}

export async function preflightCompcardDaily(env, options = {}) {
  const now = options.now ?? Date.now();
  const deps = options.deps || {};
  const bucket = deps.bucket || compcardStorage(env);
  if (!bucket) return { ready: false, error: "compcard_state_not_configured", sends: 0, business_writes: 0 };
  const manifest = deps.resolvedManifest || await mergeApprovedIntake(env, bucket, deps.manifest || APPROVED_COMPCARD_MANIFEST, { now });
  const readAsset = cardAssetReader(env, bucket, deps, now);
  const date = compcardClock(now).date;
  const build = String(env.EVENTS_WORKER_BUILD_SHA || "local");
  const schedule = compcardSchedule(env);
  const cadence = publicationCadence(env, date);
  const standardEnabled = enabled(env.HYPE_STANDARD_ENABLED);
  const stored = (await readCompcardJson(bucket, "readiness/latest.json"))?.record;
  const previous = stored?.schema === "hype_compcard_snapshot_v1" ? stored.result : stored;
  if (!options.force && previous?.date === date && previous.build_sha === build && previous.manifest_revision === manifest.revision
       && JSON.stringify(previous.schedule) === JSON.stringify(schedule) && JSON.stringify(previous.cadence) === JSON.stringify(cadence)
       && previous.standard_enabled === standardEnabled
       && previous.updated_at <= now && now - previous.updated_at < READINESS_TTL_MS) return previous;
  const report = { schema: "hype_compcard_readiness_v1", date, build_sha: build, manifest_revision: manifest.revision, updated_at: now,
    schedule, cadence, standard_enabled: standardEnabled, source_folder_id: manifest.source_folder_id, intake: manifest.intake, ready: false, sends: 0, business_writes: 0,
    model_ready: false, standard_ready: false, promotion_ready: false, destinations: [], eligible_counts: {}, excluded: [], asset_probe: null, standard_asset_probe: null,
    promotion_assets: manifest.promotions.length, promotion: null, errors: manifest.intake?.error ? [manifest.intake.error] : [] };
  try { report.destinations = await (deps.destinations || (() => readCompcardDestinations(env)))(); }
  catch (error) { report.errors.push(safeError(error)); }
  try {
    const models = await (deps.models || (() => readCompcardModels(env)))();
    const { eligible, excluded } = eligibleCards(manifest, models);
    report.excluded = excluded;
    for (const card of eligible) report.eligible_counts[card.category] = (report.eligible_counts[card.category] || 0) + 1;
    const history = await readCompcardHistory(bucket, manifest.cards);
    const frozen = (await readCompcardJson(bucket, `plans/${date}/model.json`))?.record;
    // A partially delivered plan must remain runnable even after its exposure
    // reservation activates the cooldown. A new daily choice is only a preview.
    const frozenCard = frozen ? eligible.find((card) => card.id === frozen.card_id && card.sha256 === frozen.sha256) : null;
    const candidate = frozenCard || chooseDailyCard(eligible, history, date) || eligible[0];
    if (candidate) {
      try {
        const asset = await readAsset(candidate);
        report.asset_probe = { model_id: candidate.model_id, file_id: candidate.file_id, sha256: asset.sha256, bytes: asset.bytes.byteLength, verified: asset.sha256 === candidate.sha256 };
      } catch (error) { report.errors.push(safeError(error)); }
    } else report.errors.push("compcard_no_eligible_card");
    if (standardEnabled && cadence.active) {
      const standardCards = eligible.filter(card => card.category === "standard");
      const frozenStandard = (await readCompcardJson(bucket, `plans/${date}/standard.json`))?.record;
      const standardCard = (frozenStandard && standardCards.find(card => card.id === frozenStandard.card_id && card.sha256 === frozenStandard.sha256))
        || chooseDailyCard(standardCards, history, date) || standardCards[0];
      if (standardCard) {
        if (standardCard.id === candidate?.id) report.standard_asset_probe = report.asset_probe;
        else {
          const asset = await readAsset(standardCard);
          report.standard_asset_probe = { model_id: standardCard.model_id, file_id: standardCard.file_id, sha256: asset.sha256, bytes: asset.bytes.byteLength, verified: asset.sha256 === standardCard.sha256 };
        }
      }
    }
  } catch (error) { report.errors.push(safeError(error)); }
  let identityConflict = false;
  for (const destination of ["premium", "standard", "preview"]) {
    const rows = report.destinations.filter((row) => row.destination === destination);
    if (rows.some((row) => row.chat_id && String(row.chat_id) !== manifest.destinations?.[destination])) identityConflict = true;
    if (rows.length !== 1 || !rows[0].ok || !rows[0].identity_verified || !rows[0].can_send_photo
        || !manifest.destinations?.[destination] || String(rows[0].chat_id) !== manifest.destinations[destination]) report.errors.push(`compcard_${destination}_not_ready`);
  }
  const readyRoom = (destination) => report.destinations.some((row) => row.destination === destination && row.ok && row.identity_verified && row.can_send_photo && String(row.chat_id) === manifest.destinations?.[destination]);
  const anyRoomReady = ["premium", "standard", "preview"].some(readyRoom);
  report.model_ready = !identityConflict && anyRoomReady && report.asset_probe?.verified === true;
  report.standard_ready = !identityConflict && (readyRoom("premium") || readyRoom("standard")) && report.standard_asset_probe?.verified === true;
  // Promotion state is independent of the model slots. A corrupt or unknown
  // monthly reservation must hold the campaign, not the afternoon model.
  try {
    const frozenPromotionPlan = (await readCompcardJson(bucket, `plans/${date}/promotion.json`))?.record;
    const promotion = await choosePromotion(manifest, date, now, frozenPromotionPlan, env, bucket);
    if (promotion) {
      await preparePromotion(promotion.card, promotion.destination, deps.asset || readApprovedCompcardAsset);
      report.promotion = { id: promotion.card.id, kind: promotion.card.kind || "photo", destination: promotion.destination, valid_to: promotion.card.valid_to, verified: true };
      report.promotion_ready = !identityConflict && readyRoom(promotion.destination);
    }
  } catch (error) {
    report.promotion_error = safeError(error);
    report.errors.push(report.promotion_error);
  }
  report.ready = report.model_ready || report.standard_ready || report.promotion_ready;
  report.all_destinations_ready = ["premium", "standard", "preview"].every(readyRoom) && !identityConflict;
  await writeCompcardSnapshot(bucket, "readiness/latest.json", report);
  return report;
}

function legacyPromotionDestination(date) {
  const day = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse("2026-10-18T00:00:00Z")) / 86400000);
  return ["premium", "standard", "preview"][((day % 3) + 3) % 3];
}
function promotionDestination(date, env = {}) {
  const cadence = publicationCadence(env, date);
  if (!cadence.active) return legacyPromotionDestination(date);
  const rooms = ["premium", "standard", "preview"];
  const anchor = rooms.indexOf(legacyPromotionDestination(cadence.anchor_date));
  return rooms[(anchor + cadence.promotion_index) % rooms.length];
}
function monthOf(date) { return date.slice(0, 7); }
function monthKey(month) { return `${DOUBLE_MOMENT_MONTHLY_ROOT}${month}.json`; }
function shiftMonth(month, amount) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + amount, 1)).toISOString().slice(0, 7);
}
function firstTuesday(month) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (2 - first.getUTCDay() + 7) % 7;
  return new Date(first.getTime() + offset * 86400000).toISOString().slice(0, 10);
}
function nextDoubleMomentRoom(roundIndex) {
  // November's confirmed Preview delivery is round zero.
  return ["preview", "premium", "standard"][roundIndex % 3];
}
function monthlyRecordValid(record) {
  return record?.schema === "hype_compcard_monthly_promotion_v1"
    && ["available", "reserved", "consumed", "released"].includes(record.status)
    && Number.isSafeInteger(record.round_index) && record.round_index >= 0
    && ["premium", "standard", "preview"].includes(record.destination);
}
async function readMonthlyRecord(bucket, month) {
  const envelope = await readCompcardJson(bucket, monthKey(month));
  if (!envelope) return null;
  if (!monthlyRecordValid(envelope.record) || envelope.record.month !== month) throw problem("compcard_monthly_promotion_record_invalid", false);
  return envelope;
}
async function reconcileExpiredDoubleMomentReservation(bucket, saved, date) {
  const record = saved.record;
  if (record.status !== "reserved") return saved;
  const unknown = () => problem("compcard_double_monthly_prior_reservation_unknown", false);
  const milliseconds = Date.parse(`${record.date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date || "") || monthOf(record.date) !== record.month
      || !Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== record.date
      || record.destination !== nextDoubleMomentRoom(record.round_index)) throw unknown();
  if (record.date >= date) return saved;
  const plan = (await readCompcardJson(bucket, `plans/${record.date}/promotion.json`))?.record;
  const key = `deliveries/${record.date}/promotion/${record.destination}.json`;
  const delivery = await readCompcardJson(bucket, key);
  if (!plan || !delivery) throw unknown();
  const { digest, ...payload } = plan;
  const context = { date: record.date, slot: "promotion", destination: record.destination, model_id: null,
    card_id: DOUBLE_MOMENT_CAMPAIGN_ID, plan_digest: digest, approved_sha256: plan.sha256,
    expected_chat_id: plan.chat_ids?.[record.destination] };
  if (plan.schema !== "hype_compcard_plan_v1" || plan.date !== record.date || plan.slot !== "promotion"
      || plan.card_id !== DOUBLE_MOMENT_CAMPAIGN_ID || plan.model_id !== null || plan.category !== "promotion"
      || !/^[a-f0-9]{64}$/.test(digest || "") || await jsonDigest(payload) !== digest
      || plan.destinations?.length !== 1 || plan.destinations[0] !== record.destination
      || plan.monthly_policy?.version !== 1 || plan.monthly_policy.month !== record.month
      || plan.monthly_policy.round_index !== record.round_index
      || !/^[a-f0-9]{64}$/.test(plan.sha256 || "") || typeof context.expected_chat_id !== "string"
      || !/^-[1-9]\d{0,15}$/.test(context.expected_chat_id) || !Number.isSafeInteger(Number(context.expected_chat_id))
      || delivery.record.schema !== "hype_compcard_delivery_v1"
      || Object.entries(context).some(([field, value]) => delivery.record[field] !== value)) throw unknown();
  const outcome = delivery.record.status;
  const consumed = outcome === "sent" || outcome === "delivery_uncertain";
  if (!consumed && outcome !== "not_sent" && outcome !== "blocked") throw unknown();
  if (!consumed) {
    // Seal the old delivery with its own CAS before releasing the monthly claim.
    // A delayed old-date retry either wins this CAS (so we fail closed), or sees
    // a terminal blocked record and cannot send after the new date is claimed.
    if (delivery.record.receipt != null || !Number.isInteger(delivery.record.attempts)
        || delivery.record.attempts < 1 || delivery.record.attempts > 3
        || delivery.record.lease_until !== 0) throw unknown();
    if (outcome === "not_sent") {
      const sealed = { ...delivery.record, status: "blocked",
        reconciliation: { date, prior_status: outcome, reason: "compcard_window_closed" } };
      if (!await writeCompcardJson(bucket, key, sealed, delivery.etag)) throw unknown();
    }
  }
  const settled = { ...record, status: consumed ? "consumed" : "released", prior_outcome: outcome,
    ...(consumed ? { receipt: delivery.record.receipt || null } : {}) };
  const written = await writeCompcardJson(bucket, monthKey(record.month), settled, saved.etag);
  if (!written) throw unknown();
  return { record: settled, etag: written.etag };
}
async function legacyDoubleMomentExposure(bucket, month, throughDate) {
  if (month < DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH) return null;
  const endDate = throughDate || `${month}-31`;
  const lastDay = new Date(`${month}-01T00:00:00Z`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  const dayLimit = Math.min(Number(endDate.slice(8, 10)), lastDay.getUTCDate());
  for (let day = 1; day <= dayLimit; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const plan = (await readCompcardJson(bucket, `plans/${date}/promotion.json`))?.record;
    if (plan?.card_id !== DOUBLE_MOMENT_CAMPAIGN_ID) continue;
    for (const destination of plan.destinations || []) {
      const delivery = (await readCompcardJson(bucket, `deliveries/${date}/promotion/${destination}.json`))?.record;
      if (delivery?.status === "sent" || delivery?.status === "delivery_uncertain") return { date, destination, status: delivery.status, receipt: delivery.receipt || null };
      if (delivery && !["not_sent", "blocked"].includes(delivery.status)) throw problem("compcard_double_monthly_prior_reservation_unknown", false);
    }
  }
  return null;
}
async function findPriorDoubleMomentRound(bucket, month) {
  let last = null;
  for (let cursor = DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH; cursor < month; cursor = shiftMonth(cursor, 1)) {
    let saved = await readMonthlyRecord(bucket, cursor);
    if (saved?.record.status === "reserved") saved = await reconcileExpiredDoubleMomentReservation(bucket, saved, `${month}-01`);
    if (saved?.record.status === "consumed") {
      last = saved.record;
      continue;
    }
    if (saved?.record.status === "reserved") throw problem("compcard_double_monthly_prior_reservation_unknown", false);
    const legacy = await legacyDoubleMomentExposure(bucket, cursor, null);
    if (!legacy) continue;
    if (cursor === DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH && (legacy.date !== DOUBLE_MOMENT_MONTHLY_ANCHOR_DATE || legacy.destination !== "preview")) {
      throw problem("compcard_double_monthly_anchor_conflict", false);
    }
    const roundIndex = cursor === DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH ? 0 : (last ? last.round_index + 1 : 0);
    const record = { schema: "hype_compcard_monthly_promotion_v1", month: cursor, status: "consumed", date: legacy.date,
      source: "legacy_receipt", round_index: roundIndex, destination: legacy.destination, receipt: legacy.receipt };
    const created = await writeCompcardJson(bucket, monthKey(cursor), record, null);
    last = created ? record : (await readMonthlyRecord(bucket, cursor))?.record || record;
  }
  if (month > DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH && !last) throw problem("compcard_double_monthly_anchor_missing", false);
  return last;
}
async function currentDoubleMomentMonth(bucket, date) {
  const month = monthOf(date);
  let saved = await readMonthlyRecord(bucket, month);
  if (saved) return reconcileExpiredDoubleMomentReservation(bucket, saved, date);
  const legacy = await legacyDoubleMomentExposure(bucket, month, date);
  if (legacy) {
    if (month === DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH
        && (legacy.date !== DOUBLE_MOMENT_MONTHLY_ANCHOR_DATE || legacy.destination !== "preview")) {
      throw problem("compcard_double_monthly_anchor_conflict", false);
    }
    const previous = month === DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH ? null : await findPriorDoubleMomentRound(bucket, month);
    const roundIndex = month === DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH ? 0 : (previous ? previous.round_index + 1 : 0);
    const record = { schema: "hype_compcard_monthly_promotion_v1", month, status: "consumed", date: legacy.date,
      source: "legacy_receipt", round_index: roundIndex, destination: legacy.destination, receipt: legacy.receipt };
    const created = await writeCompcardJson(bucket, monthKey(month), record, null);
    return created ? { record, etag: created.etag } : await readMonthlyRecord(bucket, month);
  }
  if (month === DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH && date > DOUBLE_MOMENT_MONTHLY_ANCHOR_DATE) {
    throw problem("compcard_double_monthly_anchor_missing", false);
  }
  if (date < firstTuesday(month)) return null;
  const previous = month === DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH ? null : await findPriorDoubleMomentRound(bucket, month);
  const roundIndex = month === DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH ? 0 : (previous ? previous.round_index + 1 : 0);
  const record = { schema: "hype_compcard_monthly_promotion_v1", month, status: "available", date: firstTuesday(month),
    round_index: roundIndex, destination: nextDoubleMomentRoom(roundIndex) };
  const created = await writeCompcardJson(bucket, monthKey(month), record, null);
  return created ? { record, etag: created.etag } : await readMonthlyRecord(bucket, month);
}
async function claimDoubleMomentMonth(bucket, date, destination) {
  const month = monthOf(date);
  const current = await currentDoubleMomentMonth(bucket, date);
  if (!current) return { allowed: false };
  const record = current.record;
  if (["consumed", "reserved"].includes(record.status)) {
    // A frozen plan for the already completed anchor date may safely rebuild
    // its summary from the original receipt; it can never send that room twice.
    return { allowed: record.date === date && record.destination === destination, round_index: record.round_index, etag: current.etag };
  }
  if (date < record.date || date < firstTuesday(month) || date < DOUBLE_MOMENT_MONTHLY_ANCHOR_DATE) return { allowed: false };
  if (record.destination !== destination) return { allowed: false };
  const reserved = { ...record, status: "reserved", date, updated_at: Date.now() };
  const saved = await writeCompcardJson(bucket, monthKey(month), reserved, current.etag);
  if (saved) return { allowed: true, round_index: reserved.round_index, etag: saved.etag };
  const latest = await readMonthlyRecord(bucket, month);
  return { allowed: latest?.record.status === "reserved" && latest.record.date === date && latest.record.destination === destination,
    round_index: latest?.record.round_index, etag: latest?.etag };
}
async function settleDoubleMomentMonth(bucket, date, result) {
  const month = monthOf(date);
  const current = await readMonthlyRecord(bucket, month);
  if (!current || current.record.status !== "reserved" || current.record.date !== date) return;
  const outcomes = Array.isArray(result?.outcomes) ? result.outcomes : [];
  const sent = outcomes.some(row => row.status === "sent");
  const uncertain = outcomes.some(row => ["delivery_uncertain", "sending", "preparing"].includes(row.status) || row.state_write_conflict);
  const exhaustedNotSent = outcomes.length > 0 && outcomes.every(row => row.status === "blocked" || row.status === "not_sent" && row.attempts >= 3);
  const knownBlocked = result?.status === "blocked" && result.sent === 0 && result.uncertain === 0;
  const status = sent || uncertain ? "consumed" : exhaustedNotSent || knownBlocked ? "released" : "reserved";
  if (status === current.record.status) return;
  await writeCompcardJson(bucket, monthKey(month), { ...current.record, status, updated_at: Date.now() }, current.etag);
}
function frozenPromotionDestination(plan, date) {
  // Preserve the original policy and destination of every frozen plan, including
  // legacy plans that predate this cadence. No digest or journal key migration.
  if (!plan.cadence_policy) return legacyPromotionDestination(date);
  if (plan.card_id === DOUBLE_MOMENT_CAMPAIGN_ID && plan.monthly_policy?.version === 1
      && plan.monthly_policy.month === monthOf(date) && plan.destinations?.length === 1
      && ["premium", "standard", "preview"].includes(plan.destinations[0])) return plan.destinations[0];
  const policy = plan.cadence_policy;
  if (!Array.isArray(policy.promotion_weekdays)) throw problem("compcard_plan_cadence_invalid", false);
  const env = { HYPE_CADENCE_START_DATE: policy.start_date, HYPE_PROMOTION_WEEKDAYS: policy.promotion_weekdays.join(",") };
  const cadence = publicationCadence(env, date);
  if (!cadence.active || !cadence.promotion_day) throw problem("compcard_plan_cadence_invalid", false);
  return promotionDestination(date, env);
}
function promotionAvailable(card, now) {
  if (card.approved !== true || card.status !== "active" || card.paused === true || card.revoked === true) return false;
  const start = Date.parse(card.valid_from);
  if (!Number.isFinite(start) || now < start) return false;
  if (card.availability_mode === "continuous") return card.valid_to === null;
  if (card.availability_mode !== "bounded") return false;
  const end = Date.parse(card.valid_to);
  return Number.isFinite(end) && start < end && now < end;
}

async function choosePromotion(manifest, date, now, frozenPlan = null, env = {}, bucket) {
  if (!frozenPlan && !publicationCadence(env, date).promotion_day) return null;
  const destination = frozenPlan ? frozenPromotionDestination(frozenPlan, date) : promotionDestination(date, env);
  if (frozenPlan) {
    const cards = manifest.promotions.filter((card) => promotionAvailable(card, now) && card.captions?.[destination]);
    cards.sort((a, b) => a.id.localeCompare(b.id));
    const frozen = cards.find((card) => card.id === frozenPlan.card_id && card.sha256 === frozenPlan.sha256 && card.file_id === frozenPlan.file_id);
    return frozen && frozenPlan.destinations?.length === 1 && frozenPlan.destinations[0] === destination
      ? { card: frozen, destination } : null;
  }
  const cards = manifest.promotions.filter((card) => promotionAvailable(card, now));
  const doubleMoment = cards.find(card => card.id === DOUBLE_MOMENT_CAMPAIGN_ID);
  if (doubleMoment && bucket && monthOf(date) >= DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH) {
    const monthly = await currentDoubleMomentMonth(bucket, date);
    const dueMonthly = monthly && ["available", "released"].includes(monthly.record.status)
      && date >= firstTuesday(monthOf(date)) && date >= DOUBLE_MOMENT_MONTHLY_ANCHOR_DATE;
    if (dueMonthly && doubleMoment.captions?.[monthly.record.destination]) {
      return { card: doubleMoment, destination: monthly.record.destination, monthly_round_index: monthly.record.round_index };
    }
  }
  const monthlyPolicyActive = monthOf(date) >= DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH;
  const candidates = cards.filter(card => (!monthlyPolicyActive || card.id !== DOUBLE_MOMENT_CAMPAIGN_ID) && card.captions?.[destination]);
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  if (!candidates.length) return null;
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return { card: candidates[day % candidates.length], destination };
}

async function preparePromotion(card, destination, readAsset) {
  if (card.kind !== "text") return readAsset(card);
  const text = card.captions[destination];
  if (typeof text !== "string" || !text.trim() || text.length > 4096 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
      || await compcardSha256(new TextEncoder().encode(text.replace(/\r\n?/g, "\n"))) !== card.sha256) throw problem("compcard_promotion_copy_changed", false);
  return { kind: "text", text, sha256: card.sha256 };
}

async function executeSlot(env, manifest, bucket, slot, now, deps, wallClock) {
  const { date } = compcardClock(now);
  const modelSlot = slot === "model" || slot === "standard";
  const readAsset = cardAssetReader(env, bucket, deps, wallClock);
  let monthlyClaimed = false;
  let plan = (await readCompcardJson(bucket, `plans/${date}/${slot}.json`))?.record;
  if (!plan) {
    if (modelSlot) {
      const models = await (deps.models || (() => readCompcardModels(env)))();
      const { eligible, byId } = eligibleCards(manifest, models);
      const history = await readCompcardHistory(bucket, manifest.cards);
      // Frozen sibling choices reserve the identity even if its transport was not_sent.
      // This also handles a changed schedule where the Standard slot runs first.
      const sibling = (await readCompcardJson(bucket, `plans/${date}/${slot === "standard" ? "model" : "standard"}.json`))?.record;
      const candidates = eligible.filter(card => card.model_id !== sibling?.model_id
        && (slot !== "standard" || card.category === "standard"));
      const card = chooseDailyCard(candidates, history, date);
      if (!card) return { date, slot, status: "no_eligible_card", sent: 0 };
      const destinations = destinationsForModelSlot(card.category, slot);
      plan = { schema: "hype_compcard_plan_v1", date, slot, manifest_revision: manifest.revision, created_at: now,
        card_id: card.id, model_id: card.model_id, category: card.category, file_id: card.file_id, sha256: card.sha256,
        room_selection_policy: 1,
        destinations, chat_ids: Object.fromEntries(destinations.map((destination) => [destination, manifest.destinations[destination]])),
        captions: Object.fromEntries(destinations.map((destination) => [destination, captionForLiveCard(card, destination, byId.get(card.model_id))])),
        ...(card.source === "owner_drive_intake" ? { asset_key: card.asset_key } : {}) };
    } else {
      const chosen = await choosePromotion(manifest, date, now, null, env, bucket);
      if (!chosen) return { date, slot, status: "no_approved_promotion", sent: 0, destination: promotionDestination(date, env) };
      const { card, destination } = chosen;
      if (card.id === DOUBLE_MOMENT_CAMPAIGN_ID && monthOf(date) >= DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH) {
        const claim = await claimDoubleMomentMonth(bucket, date, destination);
        if (!claim.allowed) return { date, slot, status: "monthly_promotion_already_consumed", sent: 0, destination };
        monthlyClaimed = true;
      }
      const cadence = publicationCadence(env, date);
      plan = { schema: "hype_compcard_plan_v1", date, slot, manifest_revision: manifest.revision, created_at: now,
        card_id: card.id, model_id: null, category: "promotion", file_id: card.file_id, sha256: card.sha256,
        destinations: [destination], chat_ids: { [destination]: manifest.destinations[destination] }, captions: { [destination]: card.captions[destination] },
        ...(card.id === DOUBLE_MOMENT_CAMPAIGN_ID ? { monthly_policy: { version: 1, month: monthOf(date), round_index: chosen.monthly_round_index ?? (await readMonthlyRecord(bucket, monthOf(date)))?.record.round_index } } : {}),
        ...(cadence.active ? { cadence_policy: { start_date: cadence.start_date, promotion_weekdays: cadence.promotion_weekdays } } : {}) };
    }
    plan.digest = await jsonDigest(plan);
    plan = await freezeCompcardPlan(bucket, date, slot, plan);
  }
  const { digest, ...payload } = plan;
  if (!/^[a-f0-9]{64}$/.test(digest || "") || await jsonDigest(payload) !== digest) return { date, slot, status: "blocked", error: "compcard_plan_integrity_failed", sent: 0 };
  const card = (modelSlot ? manifest.cards : manifest.promotions).find((item) => item.id === plan.card_id && item.sha256 === plan.sha256 && item.file_id === plan.file_id);
  if (!modelSlot && card?.id === DOUBLE_MOMENT_CAMPAIGN_ID && monthOf(date) >= DOUBLE_MOMENT_MONTHLY_ANCHOR_MONTH && !monthlyClaimed) {
    const claim = await claimDoubleMomentMonth(bucket, date, plan.destinations?.[0]);
    if (!claim.allowed) return { date, slot, status: "monthly_promotion_already_consumed", sent: 0, destination: plan.destinations?.[0] };
    monthlyClaimed = true;
  }
  const approvedCardStillMatches = card && plan.model_id === (modelSlot ? card.model_id : null)
    && plan.category === (modelSlot ? card.category : "promotion") && (slot !== "standard" || card.category === "standard")
    && (card.source !== "owner_drive_intake" || plan.asset_key === card.asset_key);
  if (!approvedCardStillMatches || plan.date !== date || plan.slot !== slot) return { date, slot, status: "blocked", error: "compcard_plan_approval_changed", sent: 0 };
  if (modelSlot && plan.room_selection_policy !== undefined && plan.room_selection_policy !== 1) {
    return { date, slot, status: "blocked", error: "compcard_plan_room_policy_invalid", sent: 0 };
  }
  const expected = modelSlot ? (plan.room_selection_policy === 1
    ? destinationsForModelSlot(card.category, slot) : destinationsForCategory(card.category)) : [frozenPromotionDestination(plan, date)];
  if (JSON.stringify(expected) !== JSON.stringify(plan.destinations)) return { date, slot, status: "blocked", error: "compcard_plan_destinations_changed", sent: 0 };
  const outcomes = [];
  let sharedAsset;
  for (const destination of plan.destinations) {
    let outcome;
    try { outcome = await deliverCompcardOnce({
      bucket, key: `deliveries/${date}/${slot}/${destination}.json`, now,
      context: { date, slot, destination, model_id: plan.model_id, card_id: plan.card_id, plan_digest: plan.digest,
        approved_sha256: card.sha256, expected_chat_id: plan.chat_ids[destination] },
      prepare: async () => {
        const current = compcardClock(wallClock());
        if (current.date !== date || !due(current, compcardSchedule(env)[slot])) throw problem("compcard_window_closed", false);
        if (plan.chat_ids[destination] !== manifest.destinations[destination]) throw problem("compcard_destination_approval_changed", false);
        // Keep historical plans and terminal receipts intact, but do not complete
        // a legacy mirror after the owner changed future room routing.
        if (modelSlot && !destinationsForModelSlot(card.category, slot).includes(destination)) {
          throw problem("compcard_legacy_room_selection_conflict", false);
        }
        if (modelSlot) {
          const sibling = (await readCompcardJson(bucket, `plans/${date}/${slot === "standard" ? "model" : "standard"}.json`))?.record;
          if (sibling?.model_id === card.model_id) throw problem("compcard_same_day_model_conflict", false);
        }
        if (!sharedAsset) sharedAsset = modelSlot ? await readAsset(card)
          : await preparePromotion(card, destination, deps.asset || readApprovedCompcardAsset);
        const afterRead = compcardClock(wallClock());
        if (afterRead.date !== date || !due(afterRead, compcardSchedule(env)[slot])) throw problem("compcard_window_closed", false);
        // Revalidate model identity and facts after the possibly slow image read.
        if (modelSlot) {
          // Apply the exclusion to pending legacy sends, without touching terminal receipts.
          if (!automaticModelAllowed(card.model_id)) throw problem("compcard_automatic_selection_excluded", false);
          const model = await (deps.model || ((id) => readCompcardModel(env, id)))(card.model_id);
          const check = evaluateCard(card, model);
          if (!check.ok) throw problem(`compcard_fresh_${check.reason}`, false);
          if (captionForLiveCard(card, destination, model) !== plan.captions[destination]) throw problem("compcard_caption_facts_changed", false);
          if (card.source === "owner_drive_intake") await assertIntakeCardCurrent(env, bucket, card, { now: wallClock() });
        } else if (!promotionAvailable(card, wallClock()) || card.captions?.[destination] !== plan.captions[destination]) throw problem("compcard_promotion_expired", false);
        const beforeSend = compcardClock(wallClock());
        if (beforeSend.date !== date || !due(beforeSend, compcardSchedule(env)[slot])) throw problem("compcard_window_closed", false);
        if (modelSlot) await reserveCompcardExposure(bucket, card, date, now);
        return sharedAsset;
      },
      deliver: (asset) => (deps.send || ((chosen, room, caption, bytes, expectedChat) => sendApprovedCompcard(env, chosen, room, caption, bytes, undefined, expectedChat)))
        (card, destination, plan.captions[destination], asset, plan.chat_ids[destination]),
    }); } catch (error) { outcome = { status: "delivery_uncertain", error: safeError(error), state_write_conflict: true }; }
    outcomes.push({ destination, ...outcome });
  }
  if (modelSlot) {
    try { await settleCompcardExposure(bucket, card, date, now, outcomes, plan.destinations); } catch { /* keep the conservative durable reservation */ }
  }
  const sent = outcomes.filter((row) => row.status === "sent").length;
  const uncertain = outcomes.filter((row) => row.status === "delivery_uncertain" || row.status === "sending").length;
  const result = { date, slot, status: sent === plan.destinations.length ? "sent" : uncertain ? "delivery_uncertain" : "incomplete",
    model_id: plan.model_id, card_id: plan.card_id, category: plan.category, sent, uncertain, outcomes };
  await writeCompcardSnapshot(bucket, `summaries/${date}/${slot}.json`, result);
  if (!modelSlot && card?.id === DOUBLE_MOMENT_CAMPAIGN_ID && monthlyClaimed) await settleDoubleMomentMonth(bucket, date, result);
  return result;
}

export async function runCompcardDaily(env = {}, options = {}) {
  const now = options.now ?? Date.now();
  const deps = options.deps || {};
  if (!enabled(env.HYPE_COMPCARD_ENABLED)) return { status: "disabled" };
  const bucket = deps.bucket || compcardStorage(env);
  if (!bucket) return { status: "not_configured", error: "compcard_state_not_configured" };
  const manifest = await mergeApprovedIntake(env, bucket, deps.manifest || APPROVED_COMPCARD_MANIFEST, { now });
  let clock;
  try {
    clock = compcardClock(now);
    const schedule = compcardSchedule(env);
    const cadence = publicationCadence(env, clock.date);
    const eveningDue = due(clock, schedule.promotion) || due(clock, schedule.standard);
    const frozenPromotion = eveningDue ? (await readCompcardJson(bucket, `plans/${clock.date}/promotion.json`))?.record : null;
    const frozenStandard = eveningDue ? (await readCompcardJson(bucket, `plans/${clock.date}/standard.json`))?.record : null;
    const promotionDue = enabled(env.HYPE_PROMOTION_ENABLED) && !frozenStandard && (cadence.promotion_day || frozenPromotion) && due(clock, schedule.promotion);
    const standardDue = enabled(env.HYPE_STANDARD_ENABLED) && (cadence.standard_day || frozenStandard) && !frozenPromotion && due(clock, schedule.standard);
    const readiness = await preflightCompcardDaily(env, { now, deps: { ...deps, bucket, resolvedManifest: manifest } });
    if (!readiness.ready && !(standardDue && !readiness.eligible_counts?.standard)) {
      const result = promotionDue && readiness.promotion_error
        ? { date: clock.date, status: "failed", error: readiness.promotion_error, sent: 0 }
        : { date: clock.date, status: "not_ready", errors: readiness.errors, sent: 0 };
      log(result);
      return result;
    }
    const results = [];
    const wallClock = options.wallClock || (() => now);
    if (due(clock, schedule.model)) results.push(readiness.model_ready
      ? await executeSlot(env, manifest, bucket, "model", now, deps, wallClock)
      : { date: clock.date, slot: "model", status: "not_ready", sent: 0 });
    // Campaign delivery does not depend on an unrelated model's eligibility.
    if (frozenPromotion && frozenStandard && (due(clock, schedule.standard) || due(clock, schedule.promotion))) {
      results.push({ date: clock.date, slot: "standard", status: "blocked", error: "compcard_evening_plan_conflict", sent: 0 });
    } else if (promotionDue) {
      const selectedPromotion = await choosePromotion(manifest, clock.date, now, frozenPromotion, env, bucket);
      results.push(selectedPromotion && !readiness.promotion_ready
        ? { date: clock.date, slot: "promotion", status: "not_ready", sent: 0, destination: selectedPromotion.destination }
        : await executeSlot(env, manifest, bucket, "promotion", now, deps, wallClock));
    } else if (standardDue) {
      results.push(readiness.standard_ready || !readiness.eligible_counts?.standard
        ? await executeSlot(env, manifest, bucket, "standard", now, deps, wallClock)
        : { date: clock.date, slot: "standard", status: "not_ready", sent: 0 });
    }
    for (const result of results) {
      if (["no_approved_promotion", "no_eligible_card", "not_ready"].includes(result.status)) await writeCompcardSnapshot(bucket, `summaries/${clock.date}/${result.slot}.json`, result);
      log(result);
    }
    return { date: clock.date, status: results.length ? "processed" : "not_due", readiness: "ready", results };
  } catch (error) {
    const result = { date: clock?.date, status: "failed", error: safeError(error) };
    log(result);
    return result;
  }
}

export async function runCompcardDailyScheduled(env, controller) {
  // Delayed cron invocations must not publish yesterday's plan or miss the
  // end-of-window guard by relying on an old scheduledTime.
  return runCompcardDaily(env, { now: Date.now(), wallClock: Date.now });
}



