// Profile prose is not a quote channel. Drop the whole field when it looks
// like pricing; do not try to salvage text around a suspected amount.
export function hasKenjiProfilePriceText(value) {
  const text = String(value ?? "").normalize("NFKC")
    .replace(/\p{Cf}/gu, "");
  return /[\p{Sc}]|บาท|เร[ทต]|ราคา|ค่าจ้าง|ค่าตัว|ค่าบริการ|มัดจำ|พัน|หมื่น|แสน|ล้าน|(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)\s*ร้อย|ร้อย(?=เอ็ด|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ยี่)|คิด\s*(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ยี่)|(?:ชั่วโมง|วัน|ครั้ง|งาน)ละ|\b(?:thb|baht|usd|eur|price|pricing|rates?|quote|fees?|deposit|hundred|thousand|million)\b/iu.test(text) ||
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|[a-z]+teen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b[\s-]+(?:per|an?|each)\b/iu.test(text) ||
    /(?:^|[^\p{L}\p{N}])\p{Nd}|\p{Nd}[,.\s]\p{Nd}|\p{Nd}{3}|\p{Nd}\s*[kKmM]\b/u.test(text);
}
