import {
  resolveKenjiLineContinuity,
  writeKenjiLineBookingAccumulatorState,
} from "./kenji-line-continuity-runtime.mjs";
import {
  extractOperationalCustomerName,
  extractOperationalDate,
  extractOperationalDepositAmount,
  extractOperationalDurationHours,
  extractOperationalEndTime,
  extractOperationalLocation,
  extractOperationalModelName,
  extractOperationalRate,
  extractOperationalTime,
} from "./kenji-lv5-line-operational.mjs";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const BOOKING_SIGNAL_RE = /(จอง|book|booking|reserve|นัด|คิว|ว่าง|available|availability|เช็กคิว|เช็คคิว|รับงาน)/i;
const DEPOSIT_RE = /(?:มัดจำ|deposit)/i;
const LOCATION_PREFIX_RE = /(?:^|[\s,])(?:โซน|แถว|สถานที่|ที่)\s*[:：-]?\s*([^,\n]{2,80})/i;
const RATE_PREFIX_RE = /(?:เรท|ราคา|ค่าตัว|ยอดรวม|rate|total|PN)\s*[:：=]?/i;
const MODEL_CODE_NAME_RE = /^\s*((?:EMs?|em[s]?)[-_]?\d{1,4})\s+([A-Za-z][A-Za-z0-9._-]{1,40})\s*$/i;
const DISCOUNT_FROM_RE = /(?:discount(?:ed)?\s+from|จาก(?:ราคา)?ปกติ|ปกติ)\s*[:：-]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i;
const NON_LOCATION_RE = /^(?:โอเค|ok|okay|ครับ|ค่ะ|คะ|ได้|เอา|ใช่|yes|ขอบคุณ|thanks?|ตกลง|รับทราบ|เรียบร้อย|โอ|อือ|อื้อ)[.!\s]*$/i;

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function token(value) {
  return text(value, 120).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function eventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return text(event.message.text, 1000);
  if (event?.type === "postback") return text(event?.postback?.displayText || event?.postback?.data, 1000);
  return "";
}

function eventId(event = {}) {
  return text(event?.message?.id || event?.webhookEventId || event?.replyToken, 120).replace(/[^A-Za-z0-9_-]/g, "_");
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function freshDraft(value = {}, now = new Date()) {
  const updated = Date.parse(text(value.updated_at, 80));
  if (!Number.isFinite(updated)) return false;
  return now.getTime() - updated <= DRAFT_TTL_MS;
}

function activeDraft(value = {}, now = new Date()) {
  const draft = object(value);
  if (!draft.draft_id || !freshDraft(draft, now)) return false;
  return ["collecting", "ready", "action_failed"].includes(token(draft.status));
}

function parseLooseAmount(raw = "") {
  const match = text(raw, 120).match(/^\s*(?:ราคา|เรท|rate|total)?\s*[:：=]?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:บาท|thb)?\s*$/i);
  if (!match) return 0;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

function placeLike(raw = "") {
  const value = text(raw, 160);
  if (!value || value.length < 2 || value.length > 80 || NON_LOCATION_RE.test(value)) return "";
  if (/^[0-9,.:/\-\s]+$/.test(value)) return "";
  if (RATE_PREFIX_RE.test(value) || DEPOSIT_RE.test(value)) return "";
  return value;
}

function extractModelCodeName(raw = "") {
  const match = text(raw, 160).match(MODEL_CODE_NAME_RE);
  if (!match) return null;
  return { model_code: text(match[1], 40), working_name: text(match[2], 80) };
}

function extractDiscountFromAmount(raw = "") {
  const match = text(raw, 200).match(DISCOUNT_FROM_RE);
  if (!match) return 0;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

function looseLocationBesideTime(raw = "") {
  const withoutClock = text(raw, 160)
    .replace(/(?:เวลา\s*)?\d{1,2}[:.]\d{2}/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return placeLike(withoutClock);
}

export function parseKenjiBookingFragment(event = {}, currentIntent = "", {
  now = new Date(),
  priorActive = false,
} = {}) {
  const raw = eventText(event);
  const codeName = extractModelCodeName(raw);
  const modelName = extractOperationalModelName(raw) || text(codeName?.model_code, 40);
  const date = extractOperationalDate(raw, now);
  const time = extractOperationalTime(raw);
  const durationHours = extractOperationalDurationHours(raw);
  const endTime = extractOperationalEndTime(raw, time);
  const explicitLocation = LOCATION_PREFIX_RE.test(raw);
  let location = explicitLocation ? extractOperationalLocation(raw, modelName) : "";
  let amount = extractOperationalRate(raw);
  const originalAmount = extractDiscountFromAmount(raw);
  const depositAmount = extractOperationalDepositAmount(raw);
  const deposit = DEPOSIT_RE.test(raw);
  const bookingSignal = BOOKING_SIGNAL_RE.test(raw) || Boolean(codeName);
  const intent = token(currentIntent);

  if (!amount && priorActive) {
    amount = parseLooseAmount(raw);
  }
  if (!location && priorActive && time && !modelName && !date && !durationHours && !endTime && !amount && !depositAmount) {
    location = looseLocationBesideTime(raw);
  }
  if (!location && priorActive && !modelName && !date && !time && !durationHours && !endTime && !amount && !depositAmount) {
    location = placeLike(raw);
  }

  return {
    raw,
    current_intent: intent,
    booking_signal: bookingSignal,
    deposit_signal: deposit,
    model_name: modelName,
    model_working_name_hint: text(codeName?.working_name, 80),
    customer_name: extractOperationalCustomerName(raw),
    date,
    time,
    end_time: endTime,
    duration_hours: durationHours,
    location,
    amount_thb: amount,
    original_amount_thb: originalAmount,
    pricing_adjustment: amount && originalAmount && originalAmount > amount ? "discount" : "",
    deposit_amount_thb: depositAmount,
  };
}

function startSignal(fragment = {}) {
  return fragment.booking_signal === true
    || fragment.deposit_signal === true
    || Boolean(text(fragment.model_name, 120))
    || ["availability_request"].includes(token(fragment.current_intent));
}

function materialFields(fragment = {}) {
  const fields = {};
  if (text(fragment.model_name, 120)) fields.model_name = text(fragment.model_name, 120);
  if (text(fragment.model_working_name_hint, 120)) fields.model_working_name_hint = text(fragment.model_working_name_hint, 120);
  if (text(fragment.customer_name, 120)) fields.customer_name = text(fragment.customer_name, 120);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text(fragment.date, 10))) fields.date = text(fragment.date, 10);
  if (/^\d{2}:\d{2}$/.test(text(fragment.time, 5))) fields.time = text(fragment.time, 5);
  if (/^\d{2}:\d{2}$/.test(text(fragment.end_time, 5))) fields.end_time = text(fragment.end_time, 5);
  if (positiveNumber(fragment.duration_hours)) fields.duration_hours = positiveNumber(fragment.duration_hours);
  if (text(fragment.location, 160)) fields.location = text(fragment.location, 160);
  if (positiveNumber(fragment.amount_thb)) fields.amount_thb = positiveNumber(fragment.amount_thb);
  if (positiveNumber(fragment.original_amount_thb)) fields.original_amount_thb = positiveNumber(fragment.original_amount_thb);
  if (text(fragment.pricing_adjustment, 40)) fields.pricing_adjustment = text(fragment.pricing_adjustment, 40);
  if (positiveNumber(fragment.deposit_amount_thb)) fields.deposit_amount_thb = positiveNumber(fragment.deposit_amount_thb);
  if (fragment.deposit_signal === true) fields.trigger = "deposit";
  return fields;
}

export function requiredKenjiBookingFields(draft = {}) {
  const required = ["model_name", "date", "time", "location", "amount_thb"];
  if (token(draft.trigger) === "deposit") required.push("duration_or_end_time");
  return required;
}

export function missingKenjiBookingFields(draft = {}) {
  return requiredKenjiBookingFields(draft).filter((field) => {
    if (field === "duration_or_end_time") return !text(draft.end_time, 5) && !positiveNumber(draft.duration_hours);
    if (field === "amount_thb") return !positiveNumber(draft.amount_thb);
    return !text(draft[field], 160);
  });
}

function newDraftId(conversationHash = "", sourceEventId = "") {
  const a = text(conversationHash, 80).slice(0, 16);
  const b = text(sourceEventId, 80).slice(-24) || "event";
  return `kbd1_${a}_${b}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 72);
}

function meaningfulChange(prior = {}, fields = {}) {
  return Object.entries(fields).some(([key, value]) => String(prior[key] ?? "") !== String(value ?? ""));
}

export function mergeKenjiBookingDraftV1({
  prior = {},
  fragment = {},
  conversationHash = "",
  sourceEventId = "",
  now = new Date(),
} = {}) {
  const stamp = now.toISOString();
  const previous = object(prior);
  const wasActive = activeDraft(previous, now);
  const fields = materialFields(fragment);
  const priorActioned = token(previous.status) === "actioned" || token(previous.action_state) === "executed";
  const explicitNewBooking = startSignal(fragment) && meaningfulChange(previous, fields);

  if (priorActioned && !explicitNewBooking) {
    return {
      accepted: Object.keys(fields).length > 0,
      changed: false,
      locked: true,
      draft: previous,
    };
  }

  const base = wasActive && !priorActioned ? previous : {};
  if (!Object.keys(base).length && !startSignal(fragment)) {
    return { accepted: false, changed: false, locked: false, draft: previous };
  }

  const draftId = text(base.draft_id, 80) || newDraftId(conversationHash, sourceEventId);
  const merged = {
    ...base,
    schema: "mmd.kenji_booking_accumulator.v1",
    draft_id: draftId,
    action_id: `matrix:${draftId}`.slice(0, 180),
    ...fields,
    started_at: text(base.started_at, 80) || stamp,
    updated_at: stamp,
    source_event_ids: [...new Set([...(Array.isArray(base.source_event_ids) ? base.source_event_ids : []), sourceEventId].filter(Boolean))].slice(-12),
    field_sources: { ...object(base.field_sources) },
    revision: Math.max(0, Number(base.revision) || 0),
    action_state: text(base.action_state, 40) || "not_started",
  };

  for (const key of Object.keys(fields)) {
    merged.field_sources[key] = sourceEventId;
  }
  const changed = !Object.keys(base).length || meaningfulChange(base, fields);
  if (changed) merged.revision += 1;

  const missing = missingKenjiBookingFields(merged);
  merged.missing_fields = missing;
  merged.ready = missing.length === 0;
  merged.status = merged.ready ? "ready" : "collecting";

  return {
    accepted: true,
    changed,
    locked: false,
    draft: merged,
  };
}

function mergedIntent(draft = {}, raw = "") {
  return {
    type: "booking",
    ...(token(draft.trigger) === "deposit" ? { trigger: "deposit" } : {}),
    model_name: text(draft.model_name, 120),
    customer_name: text(draft.customer_name, 120),
    date: text(draft.date, 10),
    time: text(draft.time, 5),
    end_time: text(draft.end_time, 5),
    duration_hours: positiveNumber(draft.duration_hours),
    location: text(draft.location, 160),
    amount_thb: positiveNumber(draft.amount_thb),
    deposit_amount_thb: positiveNumber(draft.deposit_amount_thb),
    raw: text(raw, 1000),
    matrix_draft_id: text(draft.draft_id, 80),
    matrix_action_id: text(draft.action_id, 180),
  };
}

export async function accumulateKenjiLineBookingDraft({
  env = {},
  event = {},
  currentIntent = "",
  now = new Date(),
} = {}) {
  const continuity = await resolveKenjiLineContinuity({
    env,
    event,
    currentIntent,
    now: now.toISOString(),
  });
  const prior = object(continuity?.matrix?.payload_json)?.booking_draft_v1 || {};
  const priorActive = activeDraft(prior, now);
  const fragment = parseKenjiBookingFragment(event, currentIntent, { now, priorActive });
  const merged = mergeKenjiBookingDraftV1({
    prior,
    fragment,
    conversationHash: continuity.conversation_hash,
    sourceEventId: eventId(event),
    now,
  });

  if (!merged.accepted) {
    return {
      accepted: false,
      active: priorActive,
      continuity,
      fragment,
      draft: prior,
      merged_intent: priorActive ? mergedIntent(prior, eventText(event)) : null,
      action_allowed: false,
    };
  }

  let write = null;
  if (merged.changed || !priorActive) {
    write = await writeKenjiLineBookingAccumulatorState({
      env,
      continuity,
      bookingDraft: merged.draft,
      lastEventId: eventId(event),
      now: now.toISOString(),
    });
  }

  return {
    accepted: true,
    active: true,
    continuity,
    fragment,
    draft: merged.draft,
    merged_intent: mergedIntent(merged.draft, eventText(event)),
    action_allowed: merged.draft.ready === true && merged.locked !== true && token(merged.draft.action_state) !== "executed",
    locked: merged.locked === true,
    write,
  };
}

export async function recordKenjiBookingAccumulatorAction({
  env = {},
  event = {},
  currentIntent = "",
  draft = {},
  actionResult = {},
  now = new Date(),
} = {}) {
  if (!text(draft?.draft_id, 80)) return { skipped: true, reason: "booking_draft_missing" };
  const continuity = await resolveKenjiLineContinuity({
    env,
    event,
    currentIntent,
    now: now.toISOString(),
  });
  const latest = object(continuity?.matrix?.payload_json)?.booking_draft_v1 || {};
  if (text(latest.draft_id, 80) !== text(draft.draft_id, 80)) {
    return { skipped: true, reason: "booking_draft_changed" };
  }

  const receipt = object(actionResult.receipt);
  const next = {
    ...latest,
    updated_at: now.toISOString(),
    action_state: actionResult.executed === true ? "executed" : actionResult.attempted === true ? "failed" : text(latest.action_state, 40) || "not_started",
    status: actionResult.executed === true ? "actioned" : actionResult.attempted === true ? "action_failed" : text(latest.status, 40),
    action_result: {
      status: text(actionResult.status, 80),
      booking_ref: text(receipt.booking_ref, 80),
      booking_record_id: text(receipt.booking_record_id, 80),
      request_session_id: text(receipt.request_session_id, 120),
      session_id: text(receipt.session_id, 120),
      final_confirmation: receipt.final_confirmation === true,
      payment_confirmed: receipt.payment_confirmed === true,
    },
  };

  return writeKenjiLineBookingAccumulatorState({
    env,
    continuity,
    bookingDraft: next,
    lastEventId: eventId(event),
    now: now.toISOString(),
  });
}

export const KENJI_BOOKING_ACCUMULATOR_INTERNALS = Object.freeze({
  activeDraft,
  materialFields,
  parseLooseAmount,
  placeLike,
  extractModelCodeName,
  extractDiscountFromAmount,
  looseLocationBesideTime,
  mergedIntent,
});
