import { boolean, safeDisplayText, safeModelKey, text, token, unique } from "./kenji-recommendation-contract-v1.mjs";

export const SIGIL_AVAILABILITY_SNAPSHOT_SCHEMA = "sigil_availability_snapshot_v1";
export const SIGIL_AVAILABILITY_KV_PREFIX = "availability:v1:";

export const SIGIL_AVAILABILITY_STATE_TTL_SECONDS = Object.freeze({
  available_now: 15 * 60,
  available_today: 6 * 60 * 60,
  available_soon: 24 * 60 * 60,
  limited: 6 * 60 * 60,
  unavailable: 6 * 60 * 60,
  unknown: 5 * 60,
});

const ALLOWED_STATES = new Set(Object.keys(SIGIL_AVAILABILITY_STATE_TTL_SECONDS));
const ALLOWED_CONFIDENCE = new Set(["operator_confirmed", "model_confirmed", "system_derived"]);
const LOCATION_DENY_RE = /(?:gps|latitude|longitude|lat\b|lng\b|hotel|room|ห้อง|โรงแรม|address|ที่อยู่|route|eta|customer|client|payment)/i;

function cleanLocationLabel(value, max = 80) {
  const safe = safeDisplayText(value, max);
  if (!safe || LOCATION_DENY_RE.test(safe)) return "";
  if (/\d{5,}/.test(safe)) return "";
  return safe;
}

function normalizeZones(value) {
  const raw = Array.isArray(value) ? value : [];
  return unique(raw
    .map((item) => cleanLocationLabel(item?.name || item, 60))
    .map((item) => token(item, 60))
    .filter(Boolean), 12);
}

function stateBucket(state) {
  if (state === "available_now") return "now";
  if (state === "available_today") return "today";
  if (state === "available_soon") return "soon";
  if (state === "limited") return "limited";
  if (state === "unavailable") return "unavailable";
  return "unknown";
}

function requestedExpiryMs(input, nowMs, maxTtlSeconds) {
  const explicit = Date.parse(text(input?.expires_at, 100));
  const ttl = Number(input?.ttl_seconds);
  const maxExpiry = nowMs + maxTtlSeconds * 1000;
  if (Number.isFinite(explicit) && explicit > nowMs) return Math.min(explicit, maxExpiry);
  if (Number.isFinite(ttl) && ttl > 0) return Math.min(nowMs + ttl * 1000, maxExpiry);
  return maxExpiry;
}

export function availabilityStateFromModelProfile(profile = {}) {
  const status = token(profile.availability_status);
  if (status === "vacation") return "unavailable";
  if (status === "busy") return "unavailable";
  if (profile.available_now === true) return "available_now";
  if (status === "available") return "available_today";
  return "unknown";
}

export function buildSigilAvailabilitySnapshot(input = {}, options = {}) {
  const nowMs = Number.isFinite(Number(options.now_ms)) ? Number(options.now_ms) : Date.now();
  const modelKey = safeModelKey(options.model_key || input.model_key);
  if (!modelKey) return { ok: false, status: 400, error: "model_key_invalid" };

  const state = token(input.safe_availability_state || input.availability_state || input.state);
  if (!ALLOWED_STATES.has(state)) return { ok: false, status: 400, error: "availability_state_invalid" };

  const confidence = token(options.confidence || input.confidence || (
    options.source === "model_app" ? "model_confirmed" : "operator_confirmed"
  ));
  if (!ALLOWED_CONFIDENCE.has(confidence)) {
    return { ok: false, status: 400, error: "availability_confidence_invalid" };
  }

  const maxTtlSeconds = SIGIL_AVAILABILITY_STATE_TTL_SECONDS[state];
  const expiryMs = requestedExpiryMs(input, nowMs, maxTtlSeconds);
  const ttlSeconds = Math.max(60, Math.ceil((expiryMs - nowMs) / 1000));
  const city = cleanLocationLabel(input?.location_scope?.city || input.city, 80);
  const zones = normalizeZones(input?.location_scope?.zones || input.zones);
  const rawFlags = input.operational_flags && typeof input.operational_flags === "object"
    ? input.operational_flags
    : {};
  const operationalFlags = {};
  for (const key of ["burn", "mk", "live"]) {
    if (Object.prototype.hasOwnProperty.call(rawFlags, key)) operationalFlags[key] = boolean(rawFlags[key]);
  }

  const snapshot = {
    schema: SIGIL_AVAILABILITY_SNAPSHOT_SCHEMA,
    model_key: modelKey,
    safe_availability_state: state,
    availability_bucket: stateBucket(state),
    city,
    zones,
    operational_flags: operationalFlags,
    confidence,
    updated_at: new Date(nowMs).toISOString(),
    expires_at: new Date(expiryMs).toISOString(),
  };

  return {
    ok: true,
    status: 200,
    key: `${SIGIL_AVAILABILITY_KV_PREFIX}${modelKey}`,
    ttl_seconds: ttlSeconds,
    snapshot,
  };
}

export function safeAvailabilityReceipt(snapshot = {}) {
  return {
    schema: snapshot.schema === SIGIL_AVAILABILITY_SNAPSHOT_SCHEMA ? snapshot.schema : "",
    model_key: safeModelKey(snapshot.model_key),
    safe_availability_state: token(snapshot.safe_availability_state),
    availability_bucket: token(snapshot.availability_bucket),
    city: cleanLocationLabel(snapshot.city, 80),
    zones: normalizeZones(snapshot.zones),
    operational_flags: {
      ...(Object.prototype.hasOwnProperty.call(snapshot.operational_flags || {}, "burn")
        ? { burn: boolean(snapshot.operational_flags.burn) } : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot.operational_flags || {}, "mk")
        ? { mk: boolean(snapshot.operational_flags.mk) } : {}),
      ...(Object.prototype.hasOwnProperty.call(snapshot.operational_flags || {}, "live")
        ? { live: boolean(snapshot.operational_flags.live) } : {}),
    },
    confidence: ALLOWED_CONFIDENCE.has(token(snapshot.confidence)) ? token(snapshot.confidence) : "",
    updated_at: text(snapshot.updated_at, 100),
    expires_at: text(snapshot.expires_at, 100),
  };
}
