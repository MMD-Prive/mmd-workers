const ROUTES = Object.freeze([
  {
    command: "payment",
    domain: "payment",
    strong: [
      /(?:สลิป|slip|payment|paid|ชำระ|จ่าย|โอน|ยอดคงเหลือ|เหลือจ่าย|balance due|deposit)/i,
    ],
    weak: [
      /(?:เงิน|ยอด|มัดจำ|หลักฐาน|ถึงยัง|ถึงไหม|ตรวจ(?:สลิป|ยอด)?)/i,
    ],
  },
  {
    command: "membership",
    domain: "membership",
    strong: [
      /(?:สมาชิก|membership|member\s*status|ต่ออายุ|renew(?:al)?|หมดอายุ|วันหมดอายุ|แพ็กเกจ|แพคเกจ)/i,
    ],
    weak: [
      /(?:standard|premium|vip|svip|black\s*card|blackcard|สิทธิ์สมาชิก|active\s*through)/i,
    ],
  },
  {
    command: "booking",
    domain: "booking",
    strong: [
      /(?:การจอง|จอง|booking|book|reservation|คิว|นัด|งานของฉัน|เช็กงาน|เช็คงาน|งานนี้|งานวัน|งานวันที่)/i,
      /(?:model|นายแบบ).*(?:ว่าง|คิว|จอง|วัน|เวลา)/i,
    ],
    weak: [
      /(?:วันนี้|พรุ่งนี้|คืนนี้|วัน(?:จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)|เวลา|กี่โมง|โอเคยัง|ถึงไหน|คอนเฟิร์ม|confirm)/i,
    ],
  },
  {
    command: "coupons",
    domain: "coupons",
    strong: [
      /(?:คูปอง|coupon|voucher)/i,
    ],
    weak: [
      /(?:ใช้ได้ไหม|ใช้ยังไง|หมดอายุ|ส่วนลด)/i,
    ],
  },
  {
    command: "careback",
    domain: "careback",
    strong: [
      /(?:care\s*back|careback|แคร์\s*แบ็ก|แคร์แบ็ก|6\s*years?|6\s*ปี|birthday\s*wish|คำอวยพร|wish)/i,
    ],
    weak: [
      /(?:phase\s*2|anniversary|วันเกิด|ส่วนลดสูงสุด|10%)/i,
    ],
  },
  {
    command: "points",
    domain: "points",
    strong: [
      /(?:แต้ม|คะแนน|points?)/i,
    ],
    weak: [
      /(?:เหลือเท่าไหร่|มีกี่|ยอด|ใช้ได้ไหม|หมดอายุ)/i,
    ],
  },
  {
    command: "next",
    domain: "next_action",
    strong: [
      /(?:ต้องทำอะไรต่อ|ทำอะไรต่อ|ขั้นตอนต่อไป|ขั้นตอนถัดไป|ไปต่อยังไง|ต่อยังไง|next\s*step|what\s*next)/i,
    ],
    weak: [
      /(?:ต่อจากนี้|ตอนนี้ต้อง|ต้องทำ|ไปต่อ)/i,
    ],
  },
  {
    command: "status",
    domain: "status",
    strong: [
      /(?:สถานะบัญชี|สถานะตอนนี้|เช็กสถานะ|เช็คสถานะ|ดูสถานะ|status)/i,
    ],
    weak: [
      /(?:เป็นยังไง|ตอนนี้เป็นไง|เรียบร้อยยัง)/i,
    ],
  },
]);

const PROGRESS_RE = /(?:โอเคยัง|ถึงไหน|เรียบร้อยยัง|เป็นไง|อัปเดต|update|ยัง|แล้วไหม|แล้วหรือยัง)/i;
const QUESTION_RE = /(?:ไหม|มั้ย|หรือยัง|เท่าไหร่|เมื่อไหร่|ยังไง|กี่|อะไร|ไหน|where|when|how|what)/i;

export function routeHypeNaturalLanguage(value) {
  const text = normalize(value);
  if (!text || text.startsWith("/")) return noRoute("empty_or_command");

  const scores = ROUTES.map((route) => {
    let score = 0;
    let strongHits = 0;
    let weakHits = 0;
    for (const re of route.strong) {
      if (re.test(text)) {
        score += 5;
        strongHits += 1;
      }
    }
    for (const re of route.weak) {
      if (re.test(text)) {
        score += 2;
        weakHits += 1;
      }
    }
    if (strongHits && PROGRESS_RE.test(text)) score += 1;
    if (strongHits && QUESTION_RE.test(text)) score += 1;
    return {
      command: route.command,
      domain: route.domain,
      score,
      strong_hits: strongHits,
      weak_hits: weakHits,
    };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.strong_hits - a.strong_hits || a.command.localeCompare(b.command));

  if (!scores.length) return noRoute("no_supported_domain");

  const top = scores[0];
  const second = scores[1] || null;

  // A weak-only hit is not enough to route customer data. Avoid guessing from
  // generic phrases like "ยังไง" or "วันนี้" without a domain signal.
  if (top.strong_hits === 0 || top.score < 5) {
    return noRoute("insufficient_domain_signal", scores.slice(0, 3));
  }

  // When two protected domains are both strongly signalled and nearly tied,
  // ask the customer to clarify rather than choosing a source of truth.
  if (
    second
    && second.strong_hits > 0
    && second.score >= 5
    && Math.abs(top.score - second.score) <= 1
  ) {
    return {
      command: "",
      domain: "",
      routed: false,
      ambiguous: true,
      confidence: 0,
      reason: "multiple_supported_domains",
      candidates: scores.slice(0, 3).map(({ command, domain, score }) => ({ command, domain, score })),
    };
  }

  return {
    command: top.command,
    domain: top.domain,
    routed: true,
    ambiguous: false,
    confidence: confidenceFor(top, second),
    reason: "deterministic_domain_match",
    candidates: scores.slice(0, 3).map(({ command, domain, score }) => ({ command, domain, score })),
  };
}

function confidenceFor(top, second) {
  const gap = top.score - (second?.score || 0);
  if (top.score >= 8 && gap >= 3) return 0.98;
  if (top.score >= 7 && gap >= 2) return 0.95;
  if (top.score >= 6) return 0.9;
  return 0.84;
}

function noRoute(reason, scores = []) {
  return {
    command: "",
    domain: "",
    routed: false,
    ambiguous: false,
    confidence: 0,
    reason,
    candidates: scores.map(({ command, domain, score }) => ({ command, domain, score })),
  };
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
