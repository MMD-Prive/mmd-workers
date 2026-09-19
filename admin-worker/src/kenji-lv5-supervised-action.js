import { resolveKenjiModelAccess, KENJI_MODEL_ACCESS_POLICY_VERSION } from "./kenji-model-access-rpc.js";
import { resolveKenjiLv5LiveContext } from "./kenji-lv5-live-context.js";

export const KENJI_LV5_ACTION_SCHEMA = "mmd.kenji_supervised_action.v1";
export const KENJI_LV5_ACTION_RPC_PATH = "/v1/internal/kenji/actions/execute";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const AUTO_ACTIONS = new Set(["create_booking_request", "capture_booking_intent"]);
const STANDARD_BOOKING_MIN_DURATION_HOURS = 1.5;
const PROTECTED_ACTIONS = new Set([
  "assign_model", "create_calendar_hold", "apply_credit", "confirm_payment", "mark_paid",
  "confirm_job", "cancel_job", "reschedule_job", "grant_membership", "grant_private_access",
]);

function clean(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function token(value) { return clean(value, 160).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function recId(value) { const id = clean(value, 80); return /^rec[A-Za-z0-9]+$/.test(id) ? id : ""; }
function lineId(value) { const id = clean(value, 80); return /^U[0-9a-f]{32}$/i.test(id) ? id : ""; }
function isoDate(value) { const date = clean(value, 10); return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ""; }
function hhmm(value) {
  const time = clean(value, 5);
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const [h, m] = time.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? time : "";
}
function positiveNumber(value) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; }
function compact(value = {}) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item !== null && item !== undefined)); }
function normalizeActionId(value) { const id = clean(value, 180); return /^[A-Za-z0-9:_-]{8,180}$/.test(id) ? id : ""; }
function formulaString(value) { return `"${clean(value, 180).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function stableRefs(actionId) {
  const digest = await sha256Hex(`kenji-lv5-p4|${actionId}`);
  return { booking_ref: `kenji_${digest.slice(0, 24)}`, session_id: `kreq_${digest.slice(0, 24)}`, idempotency_key: digest };
}

function firstAction(context = {}, actionName = "") {
  return (Array.isArray(context?.next_actions) ? context.next_actions : []).find((item) => clean(item?.action, 80) === actionName) || null;
}

async function airtableJson(env, url) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 1000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  if (!apiKey || !baseId) throw new Error("airtable_not_configured");
  const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return response.json();
}

async function verifyCanonicalLineIdentity(env, canonicalClientId, requestedLineId) {
  const table = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS, 120) || DEFAULT_CLIENTS_TABLE;
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  const url = `${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(canonicalClientId)}`;
  try {
    const record = await airtableJson(env, url);
    const fields = record?.fields || {};
    const actual = lineId(fields.line_user_id || fields["LINE User ID"] || fields.lineUserId);
    return Boolean(actual && actual === requestedLineId);
  } catch {
    return false;
  }
}

async function resolveAuthorizedModelMetadata(env, model = {}) {
  const table = clean(env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS, 120) || "models";
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  const apiKey = clean(env.AIRTABLE_API_KEY, 1000);
  if (!baseId || !apiKey) return null;
  const candidates = [
    ["model_code", model.model_code], ["model_lookup_key", model.model_code], ["unique_key", model.model_code],
    ["working_name", model.working_name], ["Working Name", model.working_name],
  ].filter(([, value]) => clean(value, 120));
  for (const [field, value] of candidates) {
    try {
      const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
      url.searchParams.set("maxRecords", "2");
      url.searchParams.set("pageSize", "2");
      url.searchParams.set("filterByFormula", `LOWER({${field}}&"")=${formulaString(clean(value, 120).toLowerCase())}`);
      const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => ({}));
      const records = Array.isArray(payload?.records) ? payload.records : [];
      if (records.length !== 1) continue;
      const fields = records[0].fields || {};
      const visibility = token(fields.booking_visibility || fields.visibility);
      const status = token(fields.status || fields.model_status);
      const folder = token(fields.access_folder || fields.model_access_folder || fields.model_folder);
      if (status && status !== "active") return null;
      if (!["public", "private"].includes(visibility)) return null;
      return { record_id: recId(records[0].id), visibility, folder };
    } catch {}
  }
  return null;
}

export function evaluateKenjiLv5BookingAction(context = {}, modelAccess = {}, intent = {}) {
  const bookingIntent = normalizeBookingIntent(intent);
  const reasons = [];
  if (context?.live_truth_complete !== true) reasons.push("live_truth_incomplete");
  if (context?.fan_in?.identity_resolution !== "canonical") reasons.push("canonical_client_unresolved");
  if (!recId(context?.client_360?.canonical_client_id)) reasons.push("canonical_client_missing");
  if (!clean(context?.client_360?.display_name, 120)) reasons.push("canonical_client_name_missing");
  if (context?.entitlement_live?.member_blocked === true) reasons.push("entitlement_blocked");
  if (context?.fan_in?.sources?.entitlement !== "verified") reasons.push("entitlement_unverified");
  if (context?.calendar_live?.status !== "available") reasons.push("calendar_not_available");
  if (!firstAction(context, "prepare_booking_intent")) reasons.push("booking_not_prepared");
  if (modelAccess?.status !== "match") reasons.push(`model_access_${clean(modelAccess?.status, 40) || "unavailable"}`);
  if (!clean(modelAccess?.model?.working_name, 120)) reasons.push("canonical_model_name_missing");
  if (!recId(modelAccess?.model_access?.record_id)) reasons.push("canonical_model_record_missing");
  if (!["public", "private"].includes(token(modelAccess?.model_access?.visibility))) reasons.push("model_lane_unverified");
  if (!isoDate(bookingIntent.date)) reasons.push("date_missing");
  if (!hhmm(bookingIntent.time)) reasons.push("time_missing");
  if (!clean(bookingIntent.location, 160)) reasons.push("location_missing");
  if (token(bookingIntent.trigger) === "deposit" && !positiveNumber(bookingIntent.amount_thb)) reasons.push("rate_missing");
  return { ok: reasons.length === 0, reasons };
}

export function missingKenjiBookingIntentFields(intent = {}) {
  const normalized = normalizeBookingIntent(intent);
  const missing = [];
  if (!clean(normalized.model_name, 120)) missing.push("model_name");
  if (!isoDate(normalized.date)) missing.push("date");
  if (!hhmm(normalized.time)) missing.push("time");
  if (!clean(normalized.location, 160)) missing.push("location");
  if (!positiveNumber(normalized.amount_thb)) missing.push("rate");
  return missing;
}

function entitlementAccessScope(context = {}) {
  const envelope = token(context?.entitlement_live?.private_visibility_envelope || "none");
  return envelope && envelope !== "none" ? "public_private" : "public_only";
}

function memberStatus(context = {}) {
  const lifecycle = token(context?.entitlement_live?.lifecycle || context?.entitlement_live?.status);
  if (["active", "current"].includes(lifecycle)) return "active";
  return "pending";
}

export function buildKenjiLv5BookingDraftPayload({ context = {}, modelAccess = {}, intent = {}, actionId = "", refs = {}, action = "create_booking_request", resolver = {} } = {}) {
  const normalizedIntent = normalizeBookingIntent(intent);
  const client = context?.client_360 || {};
  const model = modelAccess?.model || {};
  const visibility = token(modelAccess?.model_access?.visibility) === "private" ? "private" : "public";
  const canonicalClientId = recId(client.canonical_client_id);
  const lineUserId = lineId(intent.line_user_id);
  const accessScope = entitlementAccessScope(context);
  return compact({
    booking_ref: clean(refs.booking_ref, 80),
    session_id: clean(refs.session_id, 80),
    request_status: "draft",
    source: "kenji_lv5_p4",
    source_path: "line_ofc",
    client_nickname: clean(client.display_name, 120),
    line_or_member_id: lineUserId,
    member_status: memberStatus(context),
    access_scope: accessScope,
    private_allowed: accessScope === "public_private",
    lane: visibility,
    job_class: visibility === "private" ? "private_review" : "travel",
    model_scope: visibility,
    model_search_query: clean(intent.model_name, 120),
    selected_model_id: recId(modelAccess?.model_access?.record_id),
    selected_model_name: clean(model.working_name, 120),
    resolved_model_key: clean(model.model_code, 80),
    preferred_date: isoDate(normalizedIntent.date),
    preferred_time: hhmm(normalizedIntent.time),
    google_address: clean(normalizedIntent.location, 240),
    suppress_telegram_notify: action === "capture_booking_intent",
    client_notes: "Kenji LV5 P4 booking request. Draft only; official model/job/payment confirmation still required.",
    resolver_payload_json: {
      schema: KENJI_LV5_ACTION_SCHEMA,
      action,
      action_id: clean(actionId, 180),
      canonical_client_id: canonicalClientId,
      identity_resolution: clean(context?.fan_in?.identity_resolution, 40),
      entitlement_authority: "my_mmd_entitlement_resolver_v1",
      model_access_authority: KENJI_MODEL_ACCESS_POLICY_VERSION,
      model_access_visibility: visibility,
      model_access_folder: clean(modelAccess?.model_access?.folder, 80),
      calendar_authority: clean(context?.calendar_live?.source || "admin_calendar_live_projection", 120),
      live_truth_complete: context?.live_truth_complete === true,
      idempotency_key: clean(refs.idempotency_key, 80),
      intent: compact({
        trigger: token(intent.trigger),
        model_name: clean(intent.model_name, 120),
        customer_name_wording: clean(normalizedIntent.customer_name, 120),
        date: isoDate(normalizedIntent.date),
        time: hhmm(normalizedIntent.time),
        end_time: hhmm(normalizedIntent.end_time),
        duration_hours: positiveNumber(normalizedIntent.duration_hours) || STANDARD_BOOKING_MIN_DURATION_HOURS,
        duration_source: clean(normalizedIntent.duration_source, 80) || "mmd_standard_minimum_90m_default",
        location: clean(normalizedIntent.location, 160),
        amount_thb: positiveNumber(normalizedIntent.amount_thb) || undefined,
        original_amount_thb: positiveNumber(normalizedIntent.original_amount_thb) || undefined,
        pricing_adjustment: token(normalizedIntent.pricing_adjustment),
        deposit_amount_thb_wording: positiveNumber(normalizedIntent.deposit_amount_thb) || undefined,
        raw: clean(intent.raw, 1000),
        source_message_id: clean(intent.source_message_id, 120),
      }),
      payment_inference: false,
      protected_actions_pending: ["assign_model", "create_calendar_hold", "confirm_payment", "confirm_job"],
      generated_at: new Date().toISOString(),
      ...resolver,
    },
  });
}

function addHours(time = "", durationHours = 0) {
  const start = hhmm(time);
  const duration = positiveNumber(durationHours);
  if (!start || !duration) return "";
  const [hour, minute] = start.split(":").map(Number);
  const total = ((hour * 60 + minute + Math.round(duration * 60)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function normalizeBookingIntent(input = {}) {
  const time = hhmm(input.time);
  const endTime = hhmm(input.end_time);
  const suppliedDuration = positiveNumber(input.duration_hours);
  const durationHours = time && !endTime
    ? Math.max(STANDARD_BOOKING_MIN_DURATION_HOURS, suppliedDuration || 0)
    : suppliedDuration;
  return compact({
    type: "booking",
    trigger: token(input.trigger),
    model_name: clean(input.model_name, 120),
    customer_name: clean(input.customer_name || input.customer_name_wording, 120),
    date: isoDate(input.date),
    time,
    end_time: endTime,
    duration_hours: durationHours || undefined,
    duration_source: time && !endTime && (!suppliedDuration || suppliedDuration < STANDARD_BOOKING_MIN_DURATION_HOURS)
      ? (suppliedDuration ? "mmd_standard_minimum_90m_floor" : "mmd_standard_minimum_90m_default")
      : clean(input.duration_source, 80),
    location: clean(input.location, 160),
    amount_thb: positiveNumber(input.amount_thb) || undefined,
    original_amount_thb: positiveNumber(input.original_amount_thb) || undefined,
    pricing_adjustment: token(input.pricing_adjustment),
    deposit_amount_thb: positiveNumber(input.deposit_amount_thb || input.deposit_amount_thb_wording) || undefined,
    raw: clean(input.raw, 1000),
    source_message_id: clean(input.source_message_id, 120),
  });
}

function mergeBookingIntent(previous = {}, incoming = {}) {
  return normalizeBookingIntent({ ...normalizeBookingIntent(previous), ...normalizeBookingIntent(incoming) });
}

export function buildKenjiCanonicalJobPayload({ context = {}, modelAccess = {}, intent = {}, actionId = "", refs = {} } = {}) {
  const normalizedIntent = normalizeBookingIntent(intent);
  const client = context?.client_360 || {};
  const model = modelAccess?.model || {};
  const metadata = modelAccess?.model_access || {};
  const visibility = token(metadata.visibility) === "private" ? "private" : "public";
  const startTime = hhmm(normalizedIntent.time);
  const explicitEnd = hhmm(normalizedIntent.end_time);
  const suppliedDuration = positiveNumber(normalizedIntent.duration_hours) || STANDARD_BOOKING_MIN_DURATION_HOURS;
  const minimumEnd = addHours(startTime, Math.max(STANDARD_BOOKING_MIN_DURATION_HOURS, suppliedDuration));
  const explicitSpanMinutes = (() => {
    if (!startTime || !explicitEnd) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = explicitEnd.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return diff;
  })();
  const endTime = explicitEnd && explicitSpanMinutes >= Math.round(Math.max(STANDARD_BOOKING_MIN_DURATION_HOURS, suppliedDuration) * 60)
    ? explicitEnd
    : minimumEnd;
  const canonicalClientId = recId(client.canonical_client_id);
  const canonicalModelId = recId(metadata.record_id);
  return {
    canonical_only: true,
    create_context: "internal_create_job",
    client_record_id: canonicalClientId,
    client_name: clean(client.display_name, 120),
    client: { client_id: canonicalClientId, name: clean(client.display_name, 120) },
    line_identity: { line_user_id: lineId(intent.line_user_id) },
    model_record_id: canonicalModelId,
    model_name: clean(model.working_name || intent.model_name, 120),
    model: {
      model_id: canonicalModelId,
      model_name: clean(model.working_name || intent.model_name, 120),
      lookup_key: clean(model.model_code, 80),
      source: "airtable_models",
    },
    work_type: visibility,
    job_type: visibility,
    job_visibility: visibility,
    model_folder: clean(metadata.folder, 80),
    work: {
      work_type: visibility,
      job_lane: visibility,
      job_visibility: visibility,
      model_folder: clean(metadata.folder, 80),
    },
    schedule: { date: isoDate(normalizedIntent.date), start: hhmm(normalizedIntent.time), end: endTime },
    location: { text: clean(normalizedIntent.location, 160) },
    payment: {
      amount_thb: positiveNumber(normalizedIntent.amount_thb),
      service_amount_thb: positiveNumber(normalizedIntent.amount_thb),
      payment_type: "deposit",
    },
    amount_thb: positiveNumber(normalizedIntent.amount_thb),
    service_amount_thb: positiveNumber(normalizedIntent.amount_thb),
    private_access: { selected_private_folder: clean(metadata.folder, 80) },
    notes: {
      handling: `Kenji LINE OFC deposit-triggered Create Job. Booking ref ${clean(refs.booking_ref, 80)}.`,
      internal: `Action ${clean(actionId, 180)}. Customer wording: ${clean(normalizedIntent.customer_name, 120) || "not supplied"}. Duration: ${positiveNumber(normalizedIntent.duration_hours) || STANDARD_BOOKING_MIN_DURATION_HOURS}h (${clean(normalizedIntent.duration_source, 80) || "mmd_standard_minimum_90m"}). Pricing: ${positiveNumber(normalizedIntent.original_amount_thb) || positiveNumber(normalizedIntent.amount_thb) || "not supplied"} -> ${positiveNumber(normalizedIntent.amount_thb) || "not supplied"} (${token(normalizedIntent.pricing_adjustment) || "none"}). Deposit wording: ${positiveNumber(normalizedIntent.deposit_amount_thb) || "not supplied"}. Payment not verified.`,
    },
  };
}

async function createCanonicalJob(env = {}, payload = {}) {
  const base = clean(env.ADMIN_WORKER_BASE_URL || env.WEB_BASE_URL || "https://www.mmdbkk.com", 400).replace(/\/+$/, "");
  const internalToken = clean(env.INTERNAL_TOKEN, 2000);
  if (!internalToken) return { ok: false, status: 503, error: "internal_token_unavailable", creation_outcome: "not_created" };
  try {
    const response = await fetch(new Request(`${base}/v1/admin/job/create`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "admin-worker-kenji",
      },
      body: JSON.stringify(payload),
    }));
    const data = await response.json().catch(() => null);
    return response.ok && data?.ok === true
      ? { ok: true, status: response.status, data }
      : { ok: false, status: response.status, error: clean(data?.error?.code || data?.error || `job_create_${response.status}`, 160), creation_outcome: clean(data?.creation_outcome || "unknown", 40), data };
  } catch (error) {
    return { ok: false, status: 503, error: clean(error?.message || error, 160), creation_outcome: "unknown" };
  }
}

async function writeBookingDraft(env = {}, payload = {}) {
  const hasBinding = typeof env.SIGIL_BOOKING_WORKER?.fetch === "function";
  const base = clean(env.SIGIL_BOOKING_BASE_URL || "https://sigil.mmdbkk.com", 400).replace(/\/+$/, "");
  const request = new Request(hasBinding ? "https://sigil-booking-worker.internal/sigil/api/booking/intake" : `${base}/sigil/api/booking/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "admin-worker" },
    body: JSON.stringify(payload),
  });
  try {
    const response = hasBinding ? await env.SIGIL_BOOKING_WORKER.fetch(request) : await fetch(request);
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) return { ok: false, status: response.status || 502, error: clean(data?.error || "booking_draft_write_failed", 160), transport: hasBinding ? "service_binding" : "canonical_https" };
    return { ok: true, status: response.status, data, transport: hasBinding ? "service_binding" : "canonical_https" };
  } catch (error) {
    return { ok: false, status: 503, error: clean(error?.message || error, 160) || "booking_draft_write_unavailable", transport: hasBinding ? "service_binding" : "canonical_https" };
  }
}

function supervisionRequired(actionName) {
  return { ok: false, schema: KENJI_LV5_ACTION_SCHEMA, action: actionName, status: "supervision_required", protected: true, executed: false, authority: "canonical_backend_and_per", protected_actions: [...PROTECTED_ACTIONS] };
}

export async function executeKenjiLv5SupervisedAction(env = {}, input = {}) {
  const action = token(input.action);
  if (PROTECTED_ACTIONS.has(action)) return supervisionRequired(action);
  if (!AUTO_ACTIONS.has(action)) return { ok: false, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "unsupported_action", executed: false };

  const actionId = normalizeActionId(input.action_id || input.idempotency_key);
  const canonicalClientId = recId(input?.client?.canonical_client_id || input.canonical_client_id);
  const requestedLineId = lineId(input?.client?.line_user_id || input.line_user_id);
  const intent = normalizeBookingIntent({ ...(input?.intent || {}),
    model_name: input?.intent?.model_name || input.model_name,
    date: input?.intent?.date || input.date,
    time: input?.intent?.time || input.time,
    location: input?.intent?.location || input.location,
  });
  intent.line_user_id = requestedLineId;
  const captureIntent = action === "capture_booking_intent";
  const completeStandardBooking = Boolean(intent.model_name && intent.date && intent.time && intent.location);
  if (!actionId || !canonicalClientId || !requestedLineId || (!captureIntent && !completeStandardBooking)) {
    return { ok: false, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "invalid_action_request", executed: false };
  }

  const context = await resolveKenjiLv5LiveContext(env, { client: { canonical_client_id: canonicalClientId, line_user_id: requestedLineId }, intent });
  if (recId(context?.client_360?.canonical_client_id) !== canonicalClientId || context?.fan_in?.line_identity_present !== true) {
    return { ok: false, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "canonical_identity_mismatch", executed: false };
  }
  if (!await verifyCanonicalLineIdentity(env, canonicalClientId, requestedLineId)) {
    return { ok: false, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "canonical_line_identity_mismatch", executed: false };
  }

  const refs = await stableRefs(actionId);
  let modelAccess = intent.model_name
    ? await resolveKenjiModelAccess(env, { line_user_id: requestedLineId, query: intent.model_name }).catch(() => ({ status: "unavailable" }))
    : { status: "not_requested" };
  if (modelAccess?.status === "match") modelAccess.model_access = await resolveAuthorizedModelMetadata(env, modelAccess.model);

  if (!captureIntent) {
    const gate = evaluateKenjiLv5BookingAction(context, modelAccess, intent);
    if (!gate.ok) return { ok: false, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "action_blocked", executed: false, blockers: gate.reasons, live_truth_complete: context?.live_truth_complete === true };
  }

  const draftPayload = buildKenjiLv5BookingDraftPayload({ context, modelAccess, intent, actionId, refs, action });
  const write = await writeBookingDraft(env, draftPayload);
  if (!write.ok) return { ok: false, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "write_failed", executed: false, error: write.error, retry_safe: true, transport: write.transport, idempotency_key: refs.idempotency_key, booking_ref: refs.booking_ref };

  if (captureIntent) {
    const snapshot = write.data?.intake_snapshot || {};
    const mergedIntent = mergeBookingIntent(snapshot.intent || {}, intent);
    mergedIntent.line_user_id = requestedLineId;
    if (snapshot.job_receipt?.session_id) {
      return {
        ok: true, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "job_created", executed: true,
        mutation_scope: "canonical_job_create", authority: "admin-worker", transport: write.transport,
        booking_ref: clean(write.data?.booking_ref || refs.booking_ref, 80),
        ...snapshot.job_receipt,
        final_confirmation: false, payment_confirmed: false, model_assigned: false,
      };
    }

    const missing = missingKenjiBookingIntentFields(mergedIntent);
    if (missing.length) {
      return {
        ok: true, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "booking_intent_collected", executed: true,
        mutation_scope: "booking_intent_draft_only", authority: "sigil-booking-worker", transport: write.transport,
        booking_ref: clean(write.data?.booking_ref || refs.booking_ref, 80),
        booking_record_id: recId(write.data?.record_id), request_session_id: clean(write.data?.session_id || refs.session_id, 80),
        missing, final_confirmation: false, payment_confirmed: false, model_assigned: false,
      };
    }

    if (["creating", "review_required"].includes(token(snapshot.job_creation_state))) {
      return {
        ok: true, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "booking_intent_review_required", executed: true,
        mutation_scope: "booking_intent_draft_only", authority: "sigil-booking-worker",
        booking_ref: refs.booking_ref, blockers: [`job_creation_${token(snapshot.job_creation_state)}`],
        final_confirmation: false, payment_confirmed: false,
      };
    }

    const mergedContext = await resolveKenjiLv5LiveContext(env, {
      client: { canonical_client_id: canonicalClientId, line_user_id: requestedLineId },
      intent: mergedIntent,
    });
    modelAccess = await resolveKenjiModelAccess(env, { line_user_id: requestedLineId, query: mergedIntent.model_name }).catch(() => ({ status: "unavailable" }));
    if (modelAccess?.status === "match") modelAccess.model_access = await resolveAuthorizedModelMetadata(env, modelAccess.model);
    const gate = evaluateKenjiLv5BookingAction(mergedContext, modelAccess, mergedIntent);
    if (!gate.ok || token(modelAccess?.model_access?.visibility) === "private") {
      const blockers = [...gate.reasons];
      if (token(modelAccess?.model_access?.visibility) === "private") blockers.push("private_job_requires_orientation_review");
      await writeBookingDraft(env, buildKenjiLv5BookingDraftPayload({
        context: mergedContext, modelAccess, intent: mergedIntent, actionId, refs, action,
        resolver: { job_creation_state: "review_required", job_creation_blockers: blockers },
      }));
      return {
        ok: true, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "booking_intent_review_required", executed: true,
        mutation_scope: "booking_intent_draft_only", authority: "canonical_backend_and_per",
        booking_ref: refs.booking_ref, blockers, final_confirmation: false, payment_confirmed: false,
      };
    }

    const lock = await writeBookingDraft(env, buildKenjiLv5BookingDraftPayload({
      context: mergedContext, modelAccess, intent: mergedIntent, actionId, refs, action,
      resolver: { job_creation_state: "creating", job_creation_started_at: new Date().toISOString() },
    }));
    if (!lock.ok) {
      return { ok: false, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "job_create_lock_failed", executed: false, retry_safe: true, booking_ref: refs.booking_ref };
    }

    const jobPayload = buildKenjiCanonicalJobPayload({ context: mergedContext, modelAccess, intent: mergedIntent, actionId, refs });
    const job = await createCanonicalJob(env, jobPayload);
    if (!job.ok) {
      await writeBookingDraft(env, buildKenjiLv5BookingDraftPayload({
        context: mergedContext, modelAccess, intent: mergedIntent, actionId, refs, action,
        resolver: {
          job_creation_state: "review_required",
          job_creation_error: job.error,
          job_creation_outcome: job.creation_outcome,
        },
      }));
      return {
        ok: true, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "booking_intent_review_required", executed: true,
        mutation_scope: "booking_intent_draft_only", authority: "canonical_backend_and_per", booking_ref: refs.booking_ref,
        blockers: [`job_create:${job.error || "failed"}`], creation_outcome: job.creation_outcome,
        final_confirmation: false, payment_confirmed: false,
      };
    }

    const receipt = compact({
      session_id: clean(job.data?.session_id, 160),
      payment_ref: clean(job.data?.payment_ref, 160),
      customer_confirmation_url: clean(job.data?.customer_confirmation_url, 800),
      model_confirmation_url: clean(job.data?.model_confirmation_url, 800),
      deposit_amount_thb: positiveNumber(job.data?.deposit_amount_thb),
      balance_amount_thb: positiveNumber(job.data?.balance_amount_thb),
      notification_status: clean(job.data?.notification_status, 80),
      created_at: new Date().toISOString(),
    });
    const receiptWrite = await writeBookingDraft(env, buildKenjiLv5BookingDraftPayload({
      context: mergedContext, modelAccess, intent: mergedIntent, actionId, refs, action,
      resolver: { job_creation_state: "created", job_receipt: receipt },
    }));
    return {
      ok: true, schema: KENJI_LV5_ACTION_SCHEMA, action, status: "job_created", executed: true,
      mutation_scope: "canonical_job_create", authority: "admin-worker",
      transport: write.transport, booking_ref: refs.booking_ref, booking_record_id: recId(write.data?.record_id),
      receipt_persisted: receiptWrite.ok === true, ...receipt,
      final_confirmation: false, payment_confirmed: false, model_assigned: false, calendar_hold_created: false,
      protected_actions_pending: ["customer_confirmation", "model_confirmation", "confirm_payment"],
    };
  }

  return {
    ok: true,
    schema: KENJI_LV5_ACTION_SCHEMA,
    action,
    status: "booking_request_created",
    executed: true,
    mutation_scope: "booking_request_draft_only",
    authority: "sigil-booking-worker",
    transport: write.transport,
    booking_ref: clean(write.data?.booking_ref || refs.booking_ref, 80),
    booking_record_id: recId(write.data?.record_id),
    request_session_id: clean(write.data?.session_id || refs.session_id, 80),
    idempotency_key: refs.idempotency_key,
    telegram_notify: write.data?.telegram_notify?.ok === true ? "sent" : (write.data?.telegram_notify?.skipped === true ? "skipped" : "unavailable"),
    final_confirmation: false,
    payment_confirmed: false,
    model_assigned: false,
    calendar_hold_created: false,
    protected_actions_pending: ["assign_model", "create_calendar_hold", "confirm_payment", "confirm_job"],
  };
}
