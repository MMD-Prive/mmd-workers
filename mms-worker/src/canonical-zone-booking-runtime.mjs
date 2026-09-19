import {
  catalog,
  matchTherapists,
  prebookingAirtableFields,
  prebookingPayload,
} from "./core.mjs";
import { linkedServiceZoneCodes, loadMmsServiceZoneIndex } from "./service-zones-runtime.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const INTERNAL_HOST = "mms.internal";
const PREBOOKING_PATH = "/mms/api/prebookings";
const MATCH_PATH = "/mms/api/therapists/match";
const CANONICAL_ZONE_RE = /^(BKK|NBI|PTE|SPK|SKN|NPT)-[A-Z0-9-]{2,70}$/;
const PREBOOKING_ID_RE = /^mmspre_[a-f0-9]{24}$/;
const DEFAULT_OFFER_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_OFFERS = 5;
const LEGACY_SURROGATE = "Other Bangkok";

/**
 * Canonical Province → Service Zone bridge.
 *
 * Backwards compatibility is deliberate:
 * - legacy clients keep sending old `zone` values and continue through index.js;
 * - new clients send the canonical Zone Code in the existing `zone` property;
 * - the browser does not gain any new authority field;
 * - exact canonical matching uses Airtable linked Service Zone records only.
 */
export async function maybeHandleCanonicalZoneBooking(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (request.method !== "POST" || (path !== PREBOOKING_PATH && path !== MATCH_PATH)) return null;

  const body = await readJsonClone(request);
  const requestedCode = clean(body?.zone, 80).toUpperCase();
  if (!CANONICAL_ZONE_RE.test(requestedCode)) return null;

  requireInternalHost(request, env);
  const zoneIndex = await loadMmsServiceZoneIndex(env);
  const canonicalZone = zoneIndex.byCode.get(requestedCode);
  if (!canonicalZone?.record_id) return json({ ok: false, error: { code: "SERVICE_ZONE_INVALID" } }, 400);

  if (path === MATCH_PATH) {
    const result = await canonicalMatch(env, body, canonicalZone, zoneIndex);
    return json({ ok: true, data: result }, 200);
  }

  return canonicalPrebooking(env, body, canonicalZone, zoneIndex);
}

async function canonicalPrebooking(env, body, canonicalZone, zoneIndex) {
  const legacyZone = canonicalZone.legacy_zone_label || LEGACY_SURROGATE;
  const validated = prebookingPayload({ ...body, zone: legacyZone });
  const canonicalPayload = {
    ...validated,
    zone: canonicalZone.code,
    service_zone_code: canonicalZone.code,
    service_zone_record_id: canonicalZone.record_id,
    service_zone_label: canonicalZone.label_th,
    service_zone_safe_label: canonicalZone.safe_label_th || canonicalZone.label_th,
    province_code: canonicalZone.province_code,
    province_label_th: canonicalZone.province_label_th,
    legacy_zone: canonicalZone.legacy_zone_label || "",
  };

  const prebookingId = `mmspre_${(await sha256Hex(`prebooking:${validated.idempotency_key}`)).slice(0, 24)}`;
  const nowIso = new Date().toISOString();
  const coordinatorKey = `${validated.service_date}:${validated.service_time}:${canonicalZone.code}`;

  const matching = await canonicalMatch(env, body, canonicalZone, zoneIndex, validated);
  const matchedIds = matching.matches.map((item) => item.therapist_id);
  const status = matchedIds.length ? "Options Ready" : "Pending Coordination";

  const prebookingStub = coordinator(env, "MMS_COORDINATOR", prebookingId);
  const saved = await prebookingStub.savePrebooking(prebookingId, canonicalPayload, matchedIds, status, nowIso);

  if (!saved.created) {
    const dispatch = await readExistingDispatch(env, prebookingId);
    return json({
      ok: true,
      duplicate: true,
      prebooking: publicPrebooking(saved.record),
      service_zone: publicServiceZone(canonicalZone),
      dispatch,
    }, 200);
  }

  const lineUserHash = validated.line_user_id ? await sha256Hex(`line:${validated.line_user_id}`) : "";
  const compatibilityPayload = { ...validated, zone: canonicalZone.legacy_zone_label || LEGACY_SURROGATE };
  const fields = prebookingAirtableFields(compatibilityPayload, {
    prebooking_id: prebookingId,
    line_user_hash: lineUserHash,
    matched_therapist_ids: matchedIds,
    status,
    coordinator_key: coordinatorKey,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (!canonicalZone.legacy_zone_label) delete fields.Zone;
  fields["Service Zone"] = [canonicalZone.record_id];
  fields["Payload JSON"] = JSON.stringify({
    prebooking_id: prebookingId,
    member_ref: validated.member_ref,
    recipient_gender: validated.recipient_gender,
    service_zone_code: canonicalZone.code,
    province_code: canonicalZone.province_code,
    service_date: validated.service_date,
    service_time: validated.service_time,
    duration_minutes: validated.duration_minutes,
    skills: validated.skills,
    requested_therapist_ids: validated.requested_therapist_ids,
  });

  const sync = await createAirtableRecordSafe(env, tableId(env, "PREBOOKINGS"), fields);
  const record = await prebookingStub.setPrebookingSync(prebookingId, {
    airtable_record_id: sync.record_id,
    sync_status: sync.status,
    status,
  }, new Date().toISOString());

  let dispatch = { state: "PENDING_COORDINATION", code: "PREBOOKING_STORAGE_PENDING" };
  if (sync.status === "synced") {
    dispatch = await createCanonicalDispatch(env, {
      prebookingId,
      prebookingRecordId: sync.record_id,
      payload: validated,
      canonicalZone,
      matching,
      zoneIndex,
    });
  }

  return json({
    ok: true,
    prebooking: publicPrebooking(record),
    matched_therapist_ids: matchedIds,
    service_zone: publicServiceZone(canonicalZone),
    dispatch,
    storage: { coordinator: "persisted", airtable: sync.status },
  }, sync.status === "synced" ? 201 : 202);
}

async function canonicalMatch(env, rawBody, canonicalZone, zoneIndex, prevalidated = null) {
  const legacyZone = canonicalZone.legacy_zone_label || LEGACY_SURROGATE;
  let validated;
  if (prevalidated) {
    validated = prevalidated;
  } else {
    const matchBody = {
      idempotency_key: "mms-canonical-match-preview",
      member_ref: "mms-match-preview",
      recipient_gender: rawBody.recipient_gender,
      zone: legacyZone,
      service_date: "2099-01-01",
      service_time: "12:00",
      duration_minutes: 90,
      skills: rawBody.skills,
      requested_therapist_ids: [],
      note: "",
      language: rawBody.language || "th",
    };
    validated = prebookingPayload(matchBody);
  }

  const records = await airtableListAll(env, tableId(env, "THERAPISTS"));
  const exactRecords = records
    .filter((record) => therapistCoversCanonicalZone(record, canonicalZone.code, zoneIndex))
    .map((record) => ({
      ...record,
      fields: {
        ...(record.fields || {}),
        // Core matching still owns gender/skills/status/manual-review policy.
        // These compatibility values exist only in memory after an exact
        // linked-zone filter; they are never persisted back to Airtable.
        "Base Zone": legacyZone,
        "Coverage Zones": [legacyZone],
      },
    }));

  const core = matchTherapists(exactRecords, {
    recipient_gender: validated.recipient_gender,
    zone: legacyZone,
    skills: validated.skills,
  });

  return {
    requires_manual_coordination: core.requires_manual_coordination,
    service_zone: publicServiceZone(canonicalZone),
    matches: core.matches.map((item) => ({
      therapist_id: item.therapist_id,
      display_name: item.display_name,
      verified_skills: item.verified_skills,
      availability_status: item.availability_status,
      public_photo_url: item.public_photo_url,
      matched_skills: item.matched_skills,
      match_score: item.match_score,
      service_zone_code: canonicalZone.code,
      service_zone_label: canonicalZone.safe_label_th || canonicalZone.label_th,
    })),
  };
}

function therapistCoversCanonicalZone(record, requestedCode, zoneIndex) {
  const fields = record?.fields || {};
  const base = linkedServiceZoneCodes(fields["Base Service Zone"], zoneIndex);
  const coverage = linkedServiceZoneCodes(fields["Coverage Service Zones"], zoneIndex);
  return base.includes(requestedCode) || coverage.includes(requestedCode);
}

async function createCanonicalDispatch(env, context) {
  const { prebookingId, payload, canonicalZone, matching } = context;
  requireDispatchConfig(env);

  if (matching.requires_manual_coordination) {
    return { state: "PENDING_COORDINATION", code: "MANUAL_COORDINATION_REQUIRED" };
  }

  const therapists = await airtableListAll(env, tableId(env, "THERAPISTS"));
  const accessById = new Map(therapists.map((record) => [
    clean(record.fields?.["Therapist ID"], 80),
    clean(selectName(record.fields?.["MY MMS Access"]), 40),
  ]));
  const candidates = matching.matches
    .filter((item) => item.availability_status === "Available")
    .filter((item) => accessById.get(item.therapist_id) === "Approved")
    .slice(0, DEFAULT_MAX_OFFERS);
  if (!candidates.length) return { state: "PENDING_COORDINATION", code: "NO_AVAILABLE_APPROVED_THERAPIST" };

  const jobId = await deterministicId("mmsjob", prebookingId);
  const existing = await findAirtableRecord(env, tableId(env, "JOBS"), "Job ID", jobId);
  if (existing) {
    const offers = await airtableListByFormula(env, tableId(env, "OFFERS"), `{Job ID}=${formulaString(jobId)}`, 20);
    return {
      state: clean(selectName(existing.fields?.["Job Status"]), 40).toUpperCase().replace(/ /g, "_") || "OFFERED",
      job_id: jobId,
      offered_count: offers.length,
      duplicate: true,
    };
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAt = now + DEFAULT_OFFER_TTL_MS;
  const serviceStartAt = `${payload.service_date}T${payload.service_time}:00+07:00`;
  if (!Number.isFinite(Date.parse(serviceStartAt))) return { state: "PENDING_COORDINATION", code: "SERVICE_TIME_INVALID" };
  const safeArea = canonicalZone.safe_label_th || canonicalZone.label_th;
  const serviceLabel = skillLabels(payload.skills).join(" · ") || "Male Massage";

  const matchingSnapshot = candidates.map((candidate, index) => ({
    therapist_id: candidate.therapist_id,
    rank: index + 1,
    matched_skills: candidate.matched_skills,
    match_score: candidate.match_score,
    availability_status: candidate.availability_status,
    service_zone_code: canonicalZone.code,
  }));

  await airtableCreate(env, tableId(env, "JOBS"), compact({
    "Job ID": jobId,
    "Prebooking ID": prebookingId,
    Service: serviceLabel,
    "Duration Minutes": payload.duration_minutes,
    "Service Start At": serviceStartAt,
    Zone: safeArea,
    "Safe Area Label": safeArea,
    "Service Zone": [canonicalZone.record_id],
    "Job Status": "Offered",
    "Matching Snapshot JSON": JSON.stringify(matchingSnapshot),
    "Internal Payload JSON": JSON.stringify({
      request_key: `auto:${prebookingId}`,
      member_ref: payload.member_ref || null,
      service_zone_code: canonicalZone.code,
    }),
    Version: 1,
    "Created At": nowIso,
    "Updated At": nowIso,
  }));

  const coordinatorOffers = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const offerId = await deterministicId("mmsoffer", `${jobId}:${candidate.therapist_id}`);
    const safePayload = {
      job_id: jobId,
      service_label: serviceLabel,
      duration_minutes: payload.duration_minutes,
      service_start_at: serviceStartAt,
      area_label: safeArea,
      service_zone_code: canonicalZone.code,
      payout_thb: null,
      expires_at: new Date(expiresAt).toISOString(),
    };
    await airtableCreate(env, tableId(env, "OFFERS"), compact({
      "Offer ID": offerId,
      "Job ID": jobId,
      "Therapist ID": candidate.therapist_id,
      "Offer Status": "Offered",
      "Offered At": nowIso,
      "Expires At": new Date(expiresAt).toISOString(),
      "Match Rank": index + 1,
      "Safe Area Label": safeArea,
      "Safe Payload JSON": JSON.stringify(safePayload),
      Version: 1,
      "Created At": nowIso,
      "Updated At": nowIso,
    }));
    coordinatorOffers.push({ therapist_id: candidate.therapist_id, offer_id: offerId, expires_at: expiresAt });
  }

  await coordinator(env, "MMS_DISPATCH_COORDINATOR", jobId).initialize(jobId, coordinatorOffers, now);
  return {
    state: "OFFERED",
    job_id: jobId,
    offered_count: coordinatorOffers.length,
    expires_at: new Date(expiresAt).toISOString(),
    duplicate: false,
  };
}

async function readExistingDispatch(env, prebookingId) {
  try {
    const jobId = await deterministicId("mmsjob", prebookingId);
    const existing = await findAirtableRecord(env, tableId(env, "JOBS"), "Job ID", jobId);
    if (!existing) return { state: "PENDING_COORDINATION" };
    const offers = await airtableListByFormula(env, tableId(env, "OFFERS"), `{Job ID}=${formulaString(jobId)}`, 20);
    return {
      state: clean(selectName(existing.fields?.["Job Status"]), 40).toUpperCase().replace(/ /g, "_") || "OFFERED",
      job_id: jobId,
      offered_count: offers.length,
      duplicate: true,
    };
  } catch {
    return { state: "PENDING_COORDINATION" };
  }
}

function publicServiceZone(zone) {
  return {
    code: zone.code,
    province_code: zone.province_code,
    province_label_th: zone.province_label_th,
    label_th: zone.label_th,
    safe_label_th: zone.safe_label_th || zone.label_th,
  };
}

function publicPrebooking(record) {
  return {
    prebooking_id: clean(record?.prebooking_id, 80),
    status: clean(record?.status, 80),
    sync_status: clean(record?.sync_status, 80),
    created_at: record?.created_at || null,
    updated_at: record?.updated_at || null,
  };
}

function skillLabels(codes) {
  const byCode = new Map((catalog().skills || []).map((item) => [item.code, item.label]));
  return (Array.isArray(codes) ? codes : []).map((code) => byCode.get(code) || code).filter(Boolean);
}

function coordinator(env, bindingName, key) {
  const binding = env[bindingName];
  if (!binding?.get || !binding?.idFromName) throw runtimeError(503, `${bindingName}_NOT_CONFIGURED`);
  return binding.get(binding.idFromName(key));
}

async function airtableListAll(env, table) {
  requireAirtable(env);
  const records = [];
  let offset = "";
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const payload = await airtableFetch(url, { method: "GET" }, env);
    records.push(...(Array.isArray(payload.records) ? payload.records : []));
    offset = clean(payload.offset, 240);
    if (!offset) break;
  }
  return records;
}

async function airtableListByFormula(env, table, formula, maxRecords = 100) {
  requireAirtable(env);
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", String(Math.min(100, maxRecords)));
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("filterByFormula", formula);
  const payload = await airtableFetch(url, { method: "GET" }, env);
  return Array.isArray(payload.records) ? payload.records : [];
}

async function findAirtableRecord(env, table, field, value) {
  const records = await airtableListByFormula(env, table, `{${field}}=${formulaString(value)}`, 2);
  if (records.length > 1) throw runtimeError(503, "CANONICAL_ID_CONFLICT");
  return records[0] || null;
}

async function airtableCreate(env, table, fields) {
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`;
  return airtableFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  }, env);
}

async function createAirtableRecordSafe(env, table, fields) {
  if (!clean(env.AIRTABLE_API_TOKEN, 500)) return { status: "pending_airtable_secret", record_id: "" };
  try {
    const record = await airtableCreate(env, table, fields);
    return { status: "synced", record_id: clean(record?.id, 80) };
  } catch (error) {
    console.error(JSON.stringify({ event: "mms_canonical_zone_prebooking_sync_failed", code: error?.code || error?.message || "AIRTABLE_ERROR" }));
    return { status: "pending_airtable_retry", record_id: "" };
  }
}

async function airtableFetch(url, init, env) {
  requireAirtable(env);
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`, ...(init.headers || {}) },
    });
  } catch {
    throw runtimeError(503, "AIRTABLE_UNAVAILABLE");
  }
  if (!response.ok) throw runtimeError(503, `AIRTABLE_${response.status}`);
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw runtimeError(503, "AIRTABLE_INVALID_RESPONSE");
  return payload;
}

function tableId(env, suffix) {
  const value = clean(env[`AIRTABLE_${suffix}_TABLE_ID`], 80);
  if (!/^tbl[A-Za-z0-9]{14}$/.test(value)) throw runtimeError(503, `AIRTABLE_${suffix}_TABLE_INVALID`);
  return value;
}

function requireDispatchConfig(env) {
  requireAirtable(env);
  tableId(env, "JOBS");
  tableId(env, "OFFERS");
  if (!env.MMS_DISPATCH_COORDINATOR?.get || !env.MMS_DISPATCH_COORDINATOR?.idFromName) throw runtimeError(503, "DISPATCH_COORDINATOR_NOT_CONFIGURED");
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_BASE_ID, 80) || !clean(env.AIRTABLE_API_TOKEN, 500)) throw runtimeError(503, "AIRTABLE_NOT_CONFIGURED");
}

function requireInternalHost(request, env) {
  const expected = clean(env.MMS_INTERNAL_HOST || INTERNAL_HOST, 160).toLowerCase();
  if (new URL(request.url).hostname.toLowerCase() !== expected) throw runtimeError(404, "NOT_FOUND");
}

async function readJsonClone(request) {
  const clone = request.clone();
  const type = clean(clone.headers.get("content-type"), 120).toLowerCase();
  if (type && !type.startsWith("application/json")) throw runtimeError(415, "JSON_REQUIRED");
  const text = await clone.text();
  if (text.length > 64 * 1024) throw runtimeError(413, "JSON_TOO_LARGE");
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
    return value;
  } catch {
    throw runtimeError(400, "INVALID_JSON");
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deterministicId(prefix, input) {
  return `${prefix}_${(await sha256Hex(input)).slice(0, 24)}`;
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function selectName(value) {
  return value && typeof value === "object" && typeof value.name === "string" ? value.name : value;
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

class CanonicalZoneRuntimeError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function runtimeError(status, code) {
  return new CanonicalZoneRuntimeError(status, code);
}

export function canonicalZoneErrorResponse(error) {
  const status = Number(error?.status) || 503;
  const code = clean(error?.code || error?.message, 120) || "CANONICAL_ZONE_UNAVAILABLE";
  return json({ ok: false, error: { code } }, status);
}

export const canonicalZoneBookingContract = Object.freeze({
  transport_field: "zone",
  canonical_code_pattern: CANONICAL_ZONE_RE.source,
  legacy_fallback: "legacy values continue through index.js",
  exact_authority: "linked Base Service Zone / Coverage Service Zones",
  provinces: Object.freeze(["BKK", "NBI", "PTE", "SPK", "SKN", "NPT"]),
});
