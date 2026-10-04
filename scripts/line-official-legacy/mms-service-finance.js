// Historical evidence only. Expected shares are not proof of payout or profit.
function money(value) {
  const raw = String(value == null ? "" : value).trim().replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const amount = Math.round(Number(raw) * 100);
  return Number.isSafeInteger(amount) ? amount : null;
}
function readAmount(row, aliases, note, labels, warnings, name) {
  const values = [];
  for (const alias of aliases) {
    if (row[alias] !== undefined && String(row[alias]).trim() !== "") {
      const parsed = money(row[alias]);
      if (parsed === null) warnings.push(`${name}_invalid`); else values.push(parsed);
    }
  }
  // Only explicit labels. Never interpret dates, a total, or deposits as a course.
  const pattern = new RegExp(`(?:^|[\\n|;])\\s*(?:${labels})\\s*[:=]\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)(?:\\s*(?:บาท|THB|฿))?(?=\\s*(?:$|[\\n|;]))`, "gim");
  let noteOccurrences = 0;
  for (const match of note.matchAll(pattern)) {
    noteOccurrences += 1;
    const parsed = money(match[1]);
    if (parsed === null) warnings.push(`${name}_invalid`); else values.push(parsed);
  }
  if (noteOccurrences > 1) warnings.push(`${name}_multiple_visits_require_event_review`);
  const unique = [...new Set(values)];
  if (unique.length > 1) warnings.push(`${name}_conflicting_or_multiple_visits`);
  return unique.length === 1 ? unique[0] : null;
}
function auditMmsServiceFinance(row = {}, note = "") {
  const warnings = [];
  const course = readAmount(row, ["course_amount_thb", "course_fee", "course_amount"], note, "ค่าคอร์ส|course fee|course amount", warnings, "course");
  const travel = readAmount(row, ["travel_amount_thb", "travel_fee", "transportation_amount"], note, "ค่าเดินทาง|travel fee|travel amount|transportation", warnings, "travel");
  const full = readAmount(row, ["full_amount_thb", "total_amount_thb", "total_amount"], note, "ยอดเต็ม|ยอดรวม|ราคาเต็ม|full amount|total amount", warnings, "full");
  const reportedMms = readAmount(row, ["mms_share_thb", "mms_share"], note, "ส่วน MMS|MMS share", warnings, "mms_share");
  const reportedTherapist = readAmount(row, ["therapist_share_thb", "therapist_share"], note, "ส่วน Therapist|Therapist share", warnings, "therapist_share");
  const total = course !== null && travel !== null ? course + travel : null;
  const mms = total === null ? null : Math.round(total * 30 / 100);
  const therapist = total === null ? null : total - mms;
  for (const [name, value] of [["course",course], ["travel",travel], ["full",full], ["mms_share",reportedMms], ["therapist_share",reportedTherapist]]) {
    if (value === null) warnings.push(`${name}_missing_or_ambiguous`);
  }
  if (full !== null && total !== null && full !== total) warnings.push("full_amount_mismatch");
  if (reportedMms !== null && mms !== null && reportedMms !== mms) warnings.push("mms_share_mismatch");
  if (reportedTherapist !== null && therapist !== null && reportedTherapist !== therapist) warnings.push("therapist_share_mismatch");
  const thb = value => value === null ? null : value / 100;
  return {
    schema: "mms_service_finance_evidence_v1",
    status: warnings.length ? "review_required" : "ready_for_review",
    course_amount_thb: thb(course), travel_amount_thb: thb(travel), reported_full_amount_thb: thb(full),
    calculated_full_amount_thb: thb(total), expected_mms_share_thb: thb(mms), expected_therapist_share_thb: thb(therapist),
    reported_mms_share_thb: thb(reportedMms), reported_therapist_share_thb: thb(reportedTherapist),
    split_basis: "course_plus_travel", mms_percent: 30, therapist_percent: 70,
    payout_verified: false, warnings: [...new Set(warnings)],
  };
}
module.exports = { auditMmsServiceFinance };
