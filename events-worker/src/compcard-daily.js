import { APPROVED_COMPCARD_MANIFEST } from "./compcard-approved-manifest.js";
import { buildCompcardCaption, chooseDailyCard, destinationsForCategory, evaluateCard } from "./compcard-policy.js";
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

function problem(code, retryable = true) {
  return Object.assign(new Error(code), { code, retryable });
}
function safeError(error) {
  const code = String(error?.code || error?.message || error || "");
  return /^compcard_[a-z0-9_]{1,100}$/.test(code) ? code : "compcard_operation_failed";
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
  return { timezone: "Asia/Bangkok", model: hhmm(env.HYPE_COMPCARD_SEND_AT_ICT, "16:30"), promotion: hhmm(env.HYPE_PROMOTION_SEND_AT_ICT, "20:00"), catchup_minutes: MAX_CATCHUP_MINUTES };
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

export async function readApprovedCompcardAsset(card, http = fetch) {
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
export async function readCompcardModels(env, http = fetch) {
  const { base, table, token } = airtableConfig(env);
  let offset = "";
  const rows = [];
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`https://api.airtable.com/v0/${base}/${table}`);
    url.searchParams.set("pageSize", "100");
    for (const field of MODEL_FIELDS) url.searchParams.append("fields[]", field);
    if (offset) url.searchParams.set("offset", offset);
    const response = await http(url.href, { headers: { authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body?.records)) throw problem("compcard_models_read_failed");
    rows.push(...body.records);
    if (!body.offset) return rows;
    offset = String(body.offset);
  }
  throw problem("compcard_models_pagination_incomplete");
}
async function readCompcardModel(env, modelId, http = fetch) {
  const { base, table, token } = airtableConfig(env);
  if (!/^rec[A-Za-z0-9]+$/.test(modelId || "")) throw problem("compcard_model_id_invalid", false);
  const response = await http(`https://api.airtable.com/v0/${base}/${table}/${modelId}`, {
    headers: { authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(15000),
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
    redirect: "error", signal: AbortSignal.timeout(timeout),
  });
  const response = await (http || env.TELEGRAM_ROUTER?.fetch?.bind(env.TELEGRAM_ROUTER) || fetch)(request);
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
    const check = evaluateCard(card, byId.get(card.model_id));
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

export async function preflightCompcardDaily(env, options = {}) {
  const now = options.now ?? Date.now();
  const deps = options.deps || {};
  const manifest = deps.manifest || APPROVED_COMPCARD_MANIFEST;
  const bucket = deps.bucket || compcardStorage(env);
  if (!bucket) return { ready: false, error: "compcard_state_not_configured", sends: 0, business_writes: 0 };
  const date = compcardClock(now).date;
  const build = String(env.EVENTS_WORKER_BUILD_SHA || "local");
  const previous = await readCompcardJson(bucket, "readiness/latest.json");
  if (!options.force && previous?.record.date === date && previous.record.build_sha === build && previous.record.manifest_revision === manifest.revision
      && previous.record.updated_at <= now && now - previous.record.updated_at < READINESS_TTL_MS) return previous.record;
  const report = { schema: "hype_compcard_readiness_v1", date, build_sha: build, manifest_revision: manifest.revision, updated_at: now,
    schedule: compcardSchedule(env), source_folder_id: manifest.source_folder_id, ready: false, sends: 0, business_writes: 0,
    model_ready: false, promotion_ready: false, destinations: [], eligible_counts: {}, excluded: [], asset_probe: null,
    promotion_assets: manifest.promotions.length, promotion: null, errors: [] };
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
      const asset = await (deps.asset || readApprovedCompcardAsset)(candidate);
      report.asset_probe = { model_id: candidate.model_id, file_id: candidate.file_id, sha256: asset.sha256, bytes: asset.bytes.byteLength, verified: asset.sha256 === candidate.sha256 };
    } else report.errors.push("compcard_no_eligible_card");
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
  const promotion = choosePromotion(manifest, date, now);
  if (promotion) {
    try {
      await preparePromotion(promotion.card, promotion.destination, deps.asset || readApprovedCompcardAsset);
      report.promotion = { id: promotion.card.id, kind: promotion.card.kind || "photo", destination: promotion.destination, valid_to: promotion.card.valid_to, verified: true };
      report.promotion_ready = !identityConflict && readyRoom(promotion.destination);
    } catch (error) { report.errors.push(safeError(error)); }
  }
  report.ready = report.model_ready || report.promotion_ready;
  report.all_destinations_ready = ["premium", "standard", "preview"].every(readyRoom) && !identityConflict;
  await writeCompcardJson(bucket, "readiness/latest.json", report);
  return report;
}

function promotionDestination(date) {
  const day = Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse("2026-10-18T00:00:00Z")) / 86400000);
  return ["premium", "standard", "preview"][((day % 3) + 3) % 3];
}
function choosePromotion(manifest, date, now) {
  const destination = promotionDestination(date);
  const cards = manifest.promotions.filter((card) => card.approved === true && card.captions?.[destination]
    && Number.isFinite(Date.parse(card.valid_from)) && Number.isFinite(Date.parse(card.valid_to))
    && Date.parse(card.valid_from) <= now && now < Date.parse(card.valid_to));
  cards.sort((a, b) => a.id.localeCompare(b.id));
  if (!cards.length) return null;
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return { card: cards[day % cards.length], destination };
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
  let plan = (await readCompcardJson(bucket, `plans/${date}/${slot}.json`))?.record;
  if (!plan) {
    if (slot === "model") {
      const models = await (deps.models || (() => readCompcardModels(env)))();
      const { eligible, byId } = eligibleCards(manifest, models);
      const history = await readCompcardHistory(bucket, manifest.cards);
      const card = chooseDailyCard(eligible, history, date);
      if (!card) return { date, slot, status: "no_eligible_card", sent: 0 };
      const destinations = destinationsForCategory(card.category);
      plan = { schema: "hype_compcard_plan_v1", date, slot, manifest_revision: manifest.revision, created_at: now,
        card_id: card.id, model_id: card.model_id, category: card.category, file_id: card.file_id, sha256: card.sha256,
        destinations, chat_ids: Object.fromEntries(destinations.map((destination) => [destination, manifest.destinations[destination]])),
        captions: Object.fromEntries(destinations.map((destination) => [destination, captionForLiveCard(card, destination, byId.get(card.model_id))])) };
    } else {
      const chosen = choosePromotion(manifest, date, now);
      if (!chosen) return { date, slot, status: "no_approved_promotion", sent: 0, destination: promotionDestination(date) };
      const { card, destination } = chosen;
      plan = { schema: "hype_compcard_plan_v1", date, slot, manifest_revision: manifest.revision, created_at: now,
        card_id: card.id, model_id: null, category: "promotion", file_id: card.file_id, sha256: card.sha256,
        destinations: [destination], chat_ids: { [destination]: manifest.destinations[destination] }, captions: { [destination]: card.captions[destination] } };
    }
    plan.digest = await jsonDigest(plan);
    plan = await freezeCompcardPlan(bucket, date, slot, plan);
  }
  const { digest, ...payload } = plan;
  if (!/^[a-f0-9]{64}$/.test(digest || "") || await jsonDigest(payload) !== digest) return { date, slot, status: "blocked", error: "compcard_plan_integrity_failed", sent: 0 };
  const card = (slot === "model" ? manifest.cards : manifest.promotions).find((item) => item.id === plan.card_id && item.sha256 === plan.sha256 && item.file_id === plan.file_id);
  if (!card || plan.manifest_revision !== manifest.revision || plan.date !== date || plan.slot !== slot) return { date, slot, status: "blocked", error: "compcard_plan_approval_changed", sent: 0 };
  const expected = slot === "model" ? destinationsForCategory(card.category) : [promotionDestination(date)];
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
        if (!sharedAsset) sharedAsset = slot === "model" ? await (deps.asset || readApprovedCompcardAsset)(card)
          : await preparePromotion(card, destination, deps.asset || readApprovedCompcardAsset);
        const afterRead = compcardClock(wallClock());
        if (afterRead.date !== date || !due(afterRead, compcardSchedule(env)[slot])) throw problem("compcard_window_closed", false);
        // Revalidate model identity and facts after the possibly slow image read.
        if (slot === "model") {
          const model = await (deps.model || ((id) => readCompcardModel(env, id)))(card.model_id);
          const check = evaluateCard(card, model);
          if (!check.ok) throw problem(`compcard_fresh_${check.reason}`, false);
          if (captionForLiveCard(card, destination, model) !== plan.captions[destination]) throw problem("compcard_caption_facts_changed", false);
        } else if (!choosePromotion({ ...manifest, promotions: [card] }, date, wallClock())) throw problem("compcard_promotion_expired", false);
        const beforeSend = compcardClock(wallClock());
        if (beforeSend.date !== date || !due(beforeSend, compcardSchedule(env)[slot])) throw problem("compcard_window_closed", false);
        if (slot === "model") await reserveCompcardExposure(bucket, card, date, now);
        return sharedAsset;
      },
      deliver: (asset) => (deps.send || ((chosen, room, caption, bytes, expectedChat) => sendApprovedCompcard(env, chosen, room, caption, bytes, undefined, expectedChat)))
        (card, destination, plan.captions[destination], asset, plan.chat_ids[destination]),
    }); } catch (error) { outcome = { status: "delivery_uncertain", error: safeError(error), state_write_conflict: true }; }
    outcomes.push({ destination, ...outcome });
  }
  if (slot === "model") {
    try { await settleCompcardExposure(bucket, card, date, now, outcomes); } catch { /* keep the conservative durable reservation */ }
  }
  const sent = outcomes.filter((row) => row.status === "sent").length;
  const uncertain = outcomes.filter((row) => row.status === "delivery_uncertain" || row.status === "sending").length;
  const result = { date, slot, status: sent === plan.destinations.length ? "sent" : uncertain ? "delivery_uncertain" : "incomplete",
    model_id: plan.model_id, card_id: plan.card_id, category: plan.category, sent, uncertain, outcomes };
  await writeCompcardJson(bucket, `summaries/${date}/${slot}.json`, result);
  return result;
}

export async function runCompcardDaily(env = {}, options = {}) {
  const now = options.now ?? Date.now();
  const deps = options.deps || {};
  if (!enabled(env.HYPE_COMPCARD_ENABLED)) return { status: "disabled" };
  const bucket = deps.bucket || compcardStorage(env);
  if (!bucket) return { status: "not_configured", error: "compcard_state_not_configured" };
  const manifest = deps.manifest || APPROVED_COMPCARD_MANIFEST;
  let clock;
  try {
    clock = compcardClock(now);
    const schedule = compcardSchedule(env);
    const readiness = await preflightCompcardDaily(env, { now, deps: { ...deps, bucket, manifest } });
    if (!readiness.ready) {
      const result = { date: clock.date, status: "not_ready", errors: readiness.errors, sent: 0 };
      log(result);
      return result;
    }
    const results = [];
    const wallClock = options.wallClock || (() => now);
    if (due(clock, schedule.model)) results.push(readiness.model_ready
      ? await executeSlot(env, manifest, bucket, "model", now, deps, wallClock)
      : { date: clock.date, slot: "model", status: "not_ready", sent: 0 });
    // Campaign delivery does not depend on an unrelated model's eligibility.
    if (enabled(env.HYPE_PROMOTION_ENABLED) && due(clock, schedule.promotion)) {
      const selectedPromotion = choosePromotion(manifest, clock.date, now);
      results.push(selectedPromotion && !readiness.promotion_ready
        ? { date: clock.date, slot: "promotion", status: "not_ready", sent: 0, destination: selectedPromotion.destination }
        : await executeSlot(env, manifest, bucket, "promotion", now, deps, wallClock));
    }
    for (const result of results) {
      if (["no_approved_promotion", "no_eligible_card", "not_ready"].includes(result.status)) await writeCompcardJson(bucket, `summaries/${clock.date}/${result.slot}.json`, result);
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
