// Profile prose is not a quote channel. Drop the whole field when it looks
// like pricing; do not try to salvage text around a suspected amount.
export function hasKenjiProfilePriceText(value) {
  const text = String(value ?? "").normalize("NFKC")
    .replace(/\p{Cf}/gu, "");
  return /[\p{Sc}]|บาท|เร[ทต]|ราคา|ค่าจ้าง|ค่าตัว|ค่าบริการ|มัดจำ|พัน|หมื่น|แสน|ล้าน|\b(?:thb|baht|usd|eur|price|pricing|rates?|quote|fees?|deposit|hundred|thousand|million)\b/iu.test(text) ||
    /(?:^|[^\p{L}\p{N}])\p{Nd}|\p{Nd}[,.\s]\p{Nd}|\p{Nd}{3}|\p{Nd}\s*[kKmM]\b/u.test(text);
}
