// Quotes describe agreed job amounts; they never prove collection or payout.
export function mmsJobPricing(course, travel) {
  const satang = (value) => {
    if (typeof value !== "number" && typeof value !== "string") throw new Error("MMS_JOB_AMOUNT_INVALID");
    const text = String(value).trim();
    if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(text)) throw new Error("MMS_JOB_AMOUNT_INVALID");
    const [whole, decimal = ""] = text.split(".");
    const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    if (!Number.isSafeInteger(amount)) throw new Error("MMS_JOB_AMOUNT_INVALID");
    return amount;
  };
  const courseSatang = satang(course), travelSatang = satang(travel);
  if (courseSatang <= 0) throw new Error("MMS_JOB_AMOUNT_INVALID");
  const total = courseSatang + travelSatang;
  const mms = Math.round(total * 30 / 100);
  return { course_amount_thb: courseSatang / 100, travel_amount_thb: travelSatang / 100, full_amount_thb: total / 100, mms_share_thb: mms / 100, therapist_share_thb: (total - mms) / 100, payment_verified: false, payout_verified: false };
}
