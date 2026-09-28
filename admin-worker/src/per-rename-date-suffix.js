const THAI_MONTHS = Object.freeze({
  "มค": 1, "มกราคม": 1,
  "กพ": 2, "กุมภาพันธ์": 2,
  "มีค": 3, "มีนาคม": 3,
  "เมย": 4, "เมษายน": 4,
  "พค": 5, "พฤษภาคม": 5,
  "มิย": 6, "มิถุนายน": 6,
  "กค": 7, "กรกฎาคม": 7,
  "สค": 8, "สิงหาคม": 8,
  "กย": 9, "กันยายน": 9,
  "ตค": 10, "ตุลาคม": 10,
  "พย": 11, "พฤศจิกายน": 11,
  "ธค": 12, "ธันวาคม": 12,
});

function clean(value) {
  return String(value ?? "").trim();
}

function asciiDigits(value) {
  const thai = "๐๑๒๓๔๕๖๗๘๙";
  return String(value ?? "").replace(/[๐-๙]/g, (digit) => String(thai.indexOf(digit)));
}

function canonicalYear(value) {
  const raw = asciiDigits(value);
  const year = Number(raw);
  if (!Number.isInteger(year)) return 0;
  if (raw.length <= 2) return year >= 50 ? year + 1957 : year + 2000;
  if (year >= 2400 && year <= 2700) return year - 543;
  if (year >= 1900 && year <= 2200) return year;
  return 0;
}

function isoDate(year, month, day) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function baseNameBefore(raw, start) {
  return raw.slice(0, start)
    .replace(/[\s|,:;]+$/u, "")
    .replace(/(?:\s+[-–—]){1,2}\s*$/u, "")
    .trim();
}

export function parsePerRenameDateSuffix(value) {
  const raw = clean(value);
  if (!raw) return { raw: "", base_name: "", date_label: "", date_iso: "", date_ms: 0, matched: false };

  const normalized = asciiDigits(raw).normalize("NFC");
  let match = normalized.match(/(?:^|\s)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\s*$/u);
  let day = 0;
  let month = 0;
  let year = 0;
  let label = "";
  let start = -1;

  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = canonicalYear(match[3]);
    label = match[0].trim();
    start = match.index + match[0].indexOf(match[1]);
  } else {
    match = normalized.match(/(?:^|\s)(\d{1,2})\s+([ก-๙.]+)\s+(\d{2,4})\s*$/u);
    if (match) {
      day = Number(match[1]);
      month = THAI_MONTHS[match[2].replace(/[.\s]/g, "")] || 0;
      year = canonicalYear(match[3]);
      label = match[0].trim();
      start = match.index + match[0].indexOf(match[1]);
    }
  }

  const dateIso = isoDate(year, month, day);
  if (!dateIso || start < 0) {
    return { raw, base_name: raw, date_label: "", date_iso: "", date_ms: 0, matched: false };
  }

  const baseName = baseNameBefore(raw, start) || raw;
  return {
    raw,
    base_name: baseName,
    date_label: label,
    date_iso: dateIso,
    date_ms: Date.parse(`${dateIso}T00:00:00+07:00`) || 0,
    matched: true,
  };
}
