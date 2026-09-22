export const KENJI_RECOMMENDATION_SCHEMA = "mmd.kenji_recommendation_layer.v1";
export const KENJI_RECOMMENDATION_POLICY_VERSION = "kenji_recommendation_v1_20260921";
export const KENJI_RECOMMENDATION_MODEL_ACCESS_POLICY = "KENJI_MODEL_ACCESS_V1";
export const KENJI_RECOMMENDATION_AVAILABILITY_SCHEMA = "sigil_availability_snapshot_v1";
export const KENJI_RECOMMENDATION_CONTEXT_SCHEMA = "mmd.kenji_conversation_matrix.v1";
export const MAX_PERMISSION_AGE_MS = 10 * 60 * 1000;
export const MAX_RECOMMENDATIONS = 3;
export const MAX_REVIEW_CANDIDATES = 3;

export function text(value, max = 240) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, max);
}

export function token(value, max = 100) {
  return text(value, max)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function list(value) {
  return Array.isArray(value) ? value : [];
}

export function unique(values, limit = 32) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

export function parseTime(value) {
  const parsed = Date.parse(text(value, 100));
  return Number.isFinite(parsed) ? parsed : null;
}

export function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function boolean(value) {
  if (value === true || value === false) return value;
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

export function safeModelKey(value) {
  const candidate = text(value, 120);
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/.test(candidate) ? candidate : "";
}

export function safeHttpsUrl(value) {
  try {
    const url = new URL(text(value, 1200));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function safeDisplayText(value, max = 500) {
  const candidate = text(value, max + 1);
  if (!candidate || candidate.length > max) return "";
  if (/(?:authorization|bearer\s+|password|passwd|secret|token|airtable|record[_ -]?id|admin[_ -]?note|private[_ -]?note|payment[_ -]?(?:ref|proof)|https?:\/\/|\b0\d{8,9}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(candidate)) return "";
  return candidate;
}

export function keywordTokens(value, limit = 24) {
  const raw = Array.isArray(value) ? value : text(value, 1000).split(/[\n,|]/);
  const output = [];
  for (const item of raw) {
    const safe = safeDisplayText(item?.name || item, 180);
    if (!safe) continue;
    const phrase = token(safe);
    if (phrase) output.push(phrase);
    for (const word of safe.split(/\s+/)) {
      const normalized = token(word);
      if (normalized && normalized.length > 1) output.push(normalized);
    }
  }
  return unique(output, limit);
}

export function normalizeLane(value) {
  const lane = token(value);
  if (["gay", "male", "men", "m2m", "ชาย"].includes(lane)) return "gay";
  if (["straight", "female", "women", "m2f", "หญิง"].includes(lane)) return "straight";
  if (["both", "bi", "all", "mixed"].includes(lane)) return "both";
  return "";
}

export function laneCompatible(requestedLane, modelLane) {
  if (!requestedLane) return true;
  if (!modelLane) return false;
  return modelLane === requestedLane || modelLane === "both";
}
