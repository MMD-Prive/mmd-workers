// HYPE_JOB_DAILY shared helpers. Pure, no I/O.

export function clean(value, max = 200) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function firstText(...values) {
  for (const value of values) {
    const candidate = Array.isArray(value) ? value.find((entry) => clean(entry)) : value;
    const text = clean(candidate);
    if (text) return text;
  }
  return "";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function token(value) {
  return clean(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
}

// ICT (Asia/Bangkok, UTC+7, no DST). Uses Intl like the rest of admin-worker.
export function ictDate(ms) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function ictMinutes(ms) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return get("hour") * 60 + get("minute");
}

export function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

// Returns YYYY-MM-DD in ICT, or "" when the value is missing/unparseable.
export function normalizeJobDate(value) {
  const raw = clean(Array.isArray(value) ? value[0] : value, 80);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return validDate(raw) ? raw : "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
      const ms = Date.parse(raw);
      return Number.isFinite(ms) ? ictDate(ms) : "";
    }
    const day = raw.slice(0, 10);
    return validDate(day) ? day : "";
  }
  return "";
}

function validDate(day) {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day;
}

// Minutes since midnight ICT, or null when missing/unparseable.
export function parseStartMinutes(value) {
  const raw = clean(Array.isArray(value) ? value[0] : value, 80);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && /(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ictMinutes(ms) : null;
  }
  const match = raw.match(/(?:^|T|\s)(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\.\d+)?$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

export function maskRef(value) {
  const text = clean(value, 180);
  if (!text) return "";
  return text.length <= 6 ? "…" + text.slice(-2) : "…" + text.slice(-4);
}

export function formatThb(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} THB`;
}

export function errorClass(error) {
  const name = clean(error?.name, 40) || "Error";
  const message = clean(error?.message, 80).replace(/[^\w:.\- ]/g, "");
  return message ? `${name}:${message}` : name;
}
