const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const months = [
  ["jan", "january", "มค", "มกราคม"],
  ["feb", "february", "กพ", "กุมภาพันธ์"],
  ["mar", "march", "มีค", "มีนาคม"],
  ["apr", "april", "เมย", "เมษายน"],
  ["may", "พค", "พฤษภาคม"],
  ["jun", "june", "มิย", "มิถุนายน"],
  ["jul", "july", "กค", "กรกฎาคม"],
  ["aug", "august", "สค", "สิงหาคม"],
  ["sep", "sept", "september", "กย", "กันยายน"],
  ["oct", "october", "ตค", "ตุลาคม"],
  ["nov", "november", "พย", "พฤศจิกายน"],
  ["dec", "december", "ธค", "ธันวาคม"],
];
const normalized = (text) =>
  String(text || "")
    .normalize("NFKC")
    .replace(/[๐-๙]/g, (x) => String(THAI_DIGITS.indexOf(x)))
    .replace(/\r/g, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "");
const monthNumber = (token) =>
  months.findIndex((list) =>
    list.includes(token.toLowerCase().replace(/[.\s]/g, "")),
  ) + 1;
function yearNumber(raw) {
  let year = Number(raw);
  if (year < 100) year = year >= 50 ? 2500 + year - 543 : 2000 + year;
  else if (year >= 2400) year -= 543;
  return year;
}
function isoDate(day, month, year) {
  year = yearNumber(year);
  day = Number(day);
  month = Number(month);
  if (
    year < 1900 ||
    year > 2199 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;
}
export function readTransferTime(text) {
  const raw = normalized(text);
  const dates = [];
  const add = (match, date) => {
    if (
      date &&
      !dates.some(
        (d) => match.index < d.end && match.index + match[0].length > d.start,
      )
    )
      dates.push({
        date,
        start: match.index,
        end: match.index + match[0].length,
      });
  };
  for (const m of raw.matchAll(
    /\b((?:20|25)\d{2})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/g,
  ))
    add(m, isoDate(m[3], m[2], m[1]));
  for (const m of raw.matchAll(
    /(?<!\d)(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})(?!\d)/g,
  ))
    add(m, isoDate(m[1], m[2], m[3]));
  for (const m of raw.matchAll(
    /(?<!\d)(\d{1,2})\s+([A-Za-zก-๙.]+)\s+(\d{4}|\d{2})(?!\d)/g,
  )) {
    const month = monthNumber(m[2]);
    if (month) add(m, isoDate(m[1], month, m[3]));
  }
  for (const m of raw.matchAll(
    /\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4}|\d{2})(?!\d)/g,
  )) {
    const month = monthNumber(m[1]);
    if (month && !/\d\s*$/.test(raw.slice(0, m.index)))
      add(m, isoDate(m[2], month, m[3]));
  }
  const values = new Set();
  for (const date of dates) {
    // Pair the time with its date, not an unrelated device clock elsewhere on an image.
    const nearby = raw
      .slice(date.end, date.end + 90)
      .split("\n")
      .slice(0, 3)
      .join("\n");
    const m = nearby.match(
      /(?:^|[^\d,.])(\d{1,2})([:.])(\d{2})(?::(\d{2}))?(?!\d)\s*([ap]\.?\s*m\.?)?/i,
    );
    if (!m) continue;
    const context = nearby.slice(0, m.index + m[0].length);
    if (m[2] === "." && !/เวลา|time|น\.|[ap]\.?\s*m/i.test(context)) continue;
    let hour = Number(m[1]);
    const minute = Number(m[3]),
      second = Number(m[4] || 0),
      ampm = (m[5] || "").replace(/[.\s]/g, "").toLowerCase();
    if (
      minute > 59 ||
      second > 59 ||
      hour > 23 ||
      (ampm && (hour < 1 || hour > 12))
    )
      continue;
    if (ampm) hour = (hour % 12) + (ampm === "pm" ? 12 : 0);
    const suffix = nearby
      .slice(m.index + m[0].length)
      .match(/^(Z|[+-]\d{2}:?\d{2})/i)?.[1];
    let zone = suffix || "+07:00";
    if (suffix && suffix.toUpperCase() !== "Z") {
      const parts = suffix.replace(":", "");
      if (
        Number(parts.slice(1, 3)) > 14 ||
        Number(parts.slice(3)) > 59 ||
        (Number(parts.slice(1, 3)) === 14 && Number(parts.slice(3)) !== 0)
      )
        continue;
      zone = parts.slice(0, 3) + ":" + parts.slice(3);
    }
    const timestamp = `${date.date}T${String(hour).padStart(2, "0")}:${m[3]}:${String(second).padStart(2, "0")}${zone}`;
    if (Number.isFinite(Date.parse(timestamp)))
      values.add(new Date(timestamp).toISOString());
  }
  return values.size === 1 ? [...values][0] : "";
}
export function readTransferAmount(text) {
  const lines = normalized(text)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const candidates = [];
  const money = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?";
  const label =
    /(?:จำนวนเงิน|ยอด(?:เงิน)?(?:ที่)?โอน|ยอดเงิน|จำนวนที่โอน|transfer\s*amount|\bamount(?:\s*transferred)?\b)/i;
  const reject =
    /ค่าธรรมเนียม|fee\b|balance|ยอดคงเหลือ|reference|transaction\s*(?:id|no)|บัญชี|account|หมายเลข/i;
  const add = (raw, score) => {
    const n = Number(raw.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0 && n <= 1e9)
      candidates.push({ value: n, score });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (reject.test(line)) continue;
    if (label.test(line)) {
      const tail = line.slice(line.search(label)).replace(label, "");
      const m = tail.match(
        new RegExp(
          "^\\s*[:：]?\\s*(?:THB|฿)?\\s*(" + money + ")\\s*(?:บาท|THB|฿)?\\s*$",
          "i",
        ),
      );
      if (m) add(m[1], 3);
      else
        for (const next of lines.slice(i + 1, i + 3)) {
          if (reject.test(next)) break;
          const n = next.match(
            new RegExp(
              "^(?:THB|฿)?\\s*(" + money + ")\\s*(?:บาท|THB|฿)?$",
              "i",
            ),
          );
          if (n) {
            add(n[1], 3);
            break;
          }
        }
    }
    const currency = line.match(
      new RegExp(
        "(?:THB|฿)\\s*(" +
          money +
          ")(?![\\d,.])|(?<![\\d,.\\-])(" +
          money +
          ")\\s*(?:บาท|THB)",
        "i",
      ),
    );
    if (currency) add(currency[1] || currency[2], 2);
    const standalone = line.match(
      /^\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*$/,
    );
    if (standalone) add(standalone[1], 1);
  }
  if (!candidates.length) return null;
  const score = Math.max(...candidates.map((x) => x.score)),
    values = new Set(
      candidates.filter((x) => x.score === score).map((x) => x.value),
    );
  return values.size === 1 ? [...values][0] : null;
}
export function readBankReference(text) {
  return (
    normalized(text).match(
      /(?:เลขที่รายการ|รหัสรายการ|เลข(?:ที่)?อ้างอิง|transaction\s*(?:id|ref(?:erence)?|no\.?)|reference(?:\s*no\.?)?)\s*[:：#]?\s*([A-Z0-9-]{6,64})/i,
    )?.[1] || ""
  );
}
