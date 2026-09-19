const LINK_PREFIX = "MMS_PREBOOKING:";
const SESSION_PREFIX = "MMS_SESSION:";

export function buildMmsCanonicalJobPayload(prebooking = {}, therapists = [], input = {}) {
  const prebookingId = clean(prebooking.prebooking_id);
  if (!prebookingId) throw bridgeError("mms_prebooking_id_required");
  if (clean(prebooking.status) !== "Confirmed") throw bridgeError("mms_prebooking_not_confirmed");

  const memberRef = clean(input.client_name || prebooking.member_ref);
  if (!memberRef) throw bridgeError("mms_client_required");

  const matchedIds = uniqueStrings(prebooking.matched_therapist_ids);
  if (!matchedIds.length) throw bridgeError("mms_matched_therapist_required");
  const therapistNames = matchedIds.map((id) => {
    const therapist = therapists.find((item) => clean(item?.therapist_id) === id);
    return clean(therapist?.display_name || therapist?.therapist_id || id);
  }).filter(Boolean);
  if (!therapistNames.length) throw bridgeError("mms_matched_therapist_required");

  const jobDate = clean(prebooking.service_date);
  const startTime = normalizeClock(prebooking.service_time);
  const durationMinutes = Number(prebooking.duration_minutes || 0);
  if (!jobDate) throw bridgeError("mms_service_date_required");
  if (!startTime) throw bridgeError("mms_service_time_required");
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw bridgeError("mms_duration_required");

  const endTime = addMinutesToClock(startTime, durationMinutes);
  const locationName = clean(input.location_name || prebooking.zone);
  if (!locationName) throw bridgeError("mms_location_required");

  const amountThb = Number(input.amount_thb || 0);
  if (!Number.isFinite(amountThb) || amountThb <= 0) throw bridgeError("mms_amount_required");

  const paymentType = clean(input.payment_type).toLowerCase();
  if (!new Set(["deposit", "full"]).has(paymentType)) throw bridgeError("mms_payment_type_required");

  const paymentMethod = clean(input.payment_method || "promptpay");
  const marker = `${LINK_PREFIX}${prebookingId}`;
  const skills = uniqueStrings(prebooking.selected_skills);
  const noteParts = [marker, "Source: MMS internal admin"];
  if (skills.length) noteParts.push(`Skills: ${skills.join(", ")}`);

  return {
    client_name: memberRef,
    model_name: therapistNames.join(", "),
    job_type: "MMS",
    job_date: jobDate,
    start_time: startTime,
    end_time: endTime,
    location_name: locationName,
    amount_thb: amountThb,
    payment_type: paymentType,
    payment_method: paymentMethod,
    note: noteParts.join(" | "),
    work: {
      job_lane: "mms",
      work_type: "mms",
    },
    model: {
      model_name: therapistNames.join(", "),
    },
    job_details: {
      job_date: jobDate,
      start_time: startTime,
      end_time: endTime,
      location_name: locationName,
    },
    payment: {
      amount_thb: amountThb,
      payment_type: paymentType,
      payment_method: paymentMethod,
    },
    notes: {
      operation_note: noteParts.join(" | "),
    },
  };
}

export function linkedSessionFromNotes(notes = "") {
  const match = String(notes || "").match(/(?:^|\s|\|)MMS_SESSION:([^\s|]+)/i);
  return clean(match?.[1]);
}

export function linkedPrebookingFromNotes(notes = "") {
  const match = String(notes || "").match(/(?:^|\s|\|)MMS_PREBOOKING:([^\s|]+)/i);
  return clean(match?.[1]);
}

export function appendMmsJobReceipt(notes = "", { prebookingId = "", sessionId = "", paymentRef = "" } = {}) {
  const markers = [
    prebookingId ? `${LINK_PREFIX}${clean(prebookingId)}` : "",
    sessionId ? `${SESSION_PREFIX}${clean(sessionId)}` : "",
    paymentRef ? `MMS_PAYMENT_REF:${clean(paymentRef)}` : "",
  ].filter(Boolean);
  const existing = clean(notes).split("|").map((part) => clean(part)).filter(Boolean);
  const withoutReceiptMarkers = existing.filter((part) => !/^MMS_(?:PREBOOKING|SESSION|PAYMENT_REF):/i.test(part));
  return [...markers, ...withoutReceiptMarkers].join(" | ").slice(0, 4000);
}

export function addMinutesToClock(clock, minutes) {
  const normalized = normalizeClock(clock);
  const delta = Number(minutes || 0);
  if (!normalized || !Number.isFinite(delta)) return "";
  const [hour, minute] = normalized.split(":").map(Number);
  const total = ((hour * 60 + minute + Math.round(delta)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function normalizeClock(value = "") {
  const raw = clean(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => clean(item)).filter(Boolean))];
}

function bridgeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function clean(value) {
  return String(value ?? "").trim();
}
