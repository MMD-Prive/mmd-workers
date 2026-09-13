const { clean } = require("./canonical-parser.js");

const POINT_RATE_THB = 100;
const THAI_MONTH_PATTERN = [
  "ม.ค.", "มกราคม", "ก.พ.", "กุมภาพันธ์", "มี.ค.", "มีนาคม",
  "เม.ย.", "เมษายน", "พ.ค.", "พฤษภาคม", "มิ.ย.", "มิถุนายน",
  "ก.ค.", "กรกฎาคม", "ส.ค.", "สิงหาคม", "ก.ย.", "กันยายน",
  "ต.ค.", "ตุลาคม", "พ.ย.", "พฤศจิกายน", "ธ.ค.", "ธันวาคม",
].map((month) => month.replace(/\./g, "\\.")).join("|");

function unique(values) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function numberFromAmount(value) {
  const raw = clean(value).replace(/,/g, "");
  const match = raw.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function contextWindow(text, index, length) {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + length + 48);
  return text.slice(start, end);
}

function detectAmounts(note) {
  const raw = clean(note);
  const patterns = [
    /(?:฿|thb|บาท)\s*([0-9][0-9,]*(?:\.\d+)?)/gi,
    /([0-9][0-9,]*(?:\.\d+)?)\s*(?:thb|บาท|฿)/gi,
  ];
  const amounts = [];
  for (const pattern of patterns) {
    let match = pattern.exec(raw);
    while (match) {
      const token = match[0];
      const amount = numberFromAmount(match[1] || token);
      if (amount > 0) {
        amounts.push({
          amount,
          token,
          index: match.index,
          end: match.index + token.length,
          pre: raw.slice(Math.max(0, match.index - 36), match.index),
          post: raw.slice(match.index + token.length, Math.min(raw.length, match.index + token.length + 24)),
          context: contextWindow(raw, match.index, token.length),
        });
      }
      match = pattern.exec(raw);
    }
  }

  const seen = new Set();
  return amounts.filter((item) => {
    const key = `${item.amount}:${item.index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isClearlyNonMoneyBareNumber(raw, match) {
  const token = String(match?.[0] || "").replace(/,/g, "");
  const amount = Number(token);
  if (!Number.isFinite(amount)) return true;

  const before = raw.slice(Math.max(0, match.index - 30), match.index).toLowerCase();
  const after = raw.slice(match.index + match[0].length, Math.min(raw.length, match.index + match[0].length + 30)).toLowerCase();
  const local = `${before} ${match[0]} ${after}`;

  if ((amount >= 1900 && amount <= 2100) || (amount >= 2500 && amount <= 2700)) return true;
  if (/(?:อายุ|age|สูง|height|น้ำหนัก|weight|นน\.?|size|ไซ[ซส์]|ขนาด|เสื้อ|shirt|อก|เอว|waist)\s*[:=\-]?\s*$/i.test(before)) return true;
  if (/^\s*(?:cm|cms|ซม\.?|kg|kgs|กก\.?|ปี|years?|y\/o|นิ้ว|inch|inches|xl|xxl|[sml])\b/i.test(after)) return true;
  if (/(?:profile|ข้อมูลลูกค้า|customer|client).{0,24}(?:age|อายุ|height|สูง|weight|น้ำหนัก|size|ขนาด)/i.test(local)) return true;
  return false;
}

function detectBareAmbiguousAmounts(note, knownAmounts) {
  const raw = clean(note);
  const ambiguous = [];
  const pattern = /(?<![A-Za-z0-9_\/])(?:\d{1,3}(?:,\d{3})+|\d{4,7})(?:\.\d+)?(?![A-Za-z0-9_\/])/g;
  let match = pattern.exec(raw);
  while (match) {
    const overlapsKnown = knownAmounts.some((item) => match.index >= item.index && match.index < item.end);
    if (!overlapsKnown && !isClearlyNonMoneyBareNumber(raw, match)) {
      const amount = numberFromAmount(match[0]);
      if (amount > 0) ambiguous.push({ amount, token: match[0], index: match.index, context: contextWindow(raw, match.index, match[0].length) });
    }
    match = pattern.exec(raw);
  }
  return ambiguous;
}

function detectDates(note) {
  const raw = clean(note);
  const dates = [
    ...(raw.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g) || []),
    ...(raw.match(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g) || []),
    ...(raw.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b/gi) || []),
    ...(raw.match(new RegExp(`\\b\\d{1,2}\\s*(?:${THAI_MONTH_PATTERN})\\s*\\d{2,4}\\b`, "gi")) || []),
  ];
  return unique(dates);
}

function detectPaymentRefs(note) {
  const raw = clean(note);
  const refs = raw.match(/\b(?:ref|reference|txn|tx|slip|payment)\s*[:#-]?\s*([a-z0-9_-]{4,40})\b/gi) || [];
  return unique(refs);
}

function normalizeClock(value) {
  const match = clean(value).match(/^(\d{1,2})[.:](\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function detectTimes(note) {
  const raw = String(note == null ? "" : note);
  const pairs = [];
  const ranges = /(?:เวลา\s*)?(\d{1,2}[.:]\d{2})\s*(?:-|–|—|ถึง|to)\s*(\d{1,2}[.:]\d{2})/gi;
  let range = ranges.exec(raw);
  while (range) {
    const start = normalizeClock(range[1]);
    const end = normalizeClock(range[2]);
    if (start && end) pairs.push({ start, end, token: range[0] });
    range = ranges.exec(raw);
  }

  if (pairs.length === 1) return { start: pairs[0].start, end: pairs[0].end, candidates: pairs };
  if (pairs.length > 1) return { start: "", end: "", candidates: pairs };

  const labeled = [];
  const pattern = /(?:เวลา|time|start|เริ่ม)\s*[:=\-]?\s*(\d{1,2}[.:]\d{2})/gi;
  let match = pattern.exec(raw);
  while (match) {
    const time = normalizeClock(match[1]);
    if (time) labeled.push(time);
    match = pattern.exec(raw);
  }
  const single = unique(labeled);
  return { start: single.length === 1 ? single[0] : "", end: "", candidates: single.map((start) => ({ start, end: "" })) };
}

function durationMinutes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0 && minutes >= -720) minutes += 1440;
  return minutes > 0 && minutes <= 1440 ? minutes : 0;
}

function detectLabelValues(note, labels, max = 120) {
  const raw = String(note == null ? "" : note);
  const label = labels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:^|\\n|[|;])\\s*(?:${label})\\s*[:=\\-]?\\s*([^\\n|;]{2,${max}})`, "gi");
  const values = [];
  let match = pattern.exec(raw);
  while (match) {
    const value = clean(match[1]).replace(/\s{2,}/g, " ");
    if (value) values.push(value);
    match = pattern.exec(raw);
  }
  return unique(values);
}

function detectServiceType(note) {
  const raw = String(note == null ? "" : note);
  const labeled = detectLabelValues(raw, ["service", "job type", "ประเภทงาน", "บริการ"], 80);
  if (labeled.length === 1) return { value: labeled[0], candidates: labeled };
  if (labeled.length > 1) return { value: "", candidates: labeled };
  const keywords = [
    ["companion", /\bcompanion\b/i],
    ["dinner", /\bdinner\b|ทานข้าว|กินข้าว/i],
    ["appearance", /\bappearance\b|ออกงาน/i],
    ["travel", /\btravel\b|ทริป|เดินทาง/i],
    ["massage", /\bmassage\b|นวด/i],
  ];
  const matches = keywords.filter(([, pattern]) => pattern.test(raw)).map(([value]) => value);
  return { value: matches.length === 1 ? matches[0] : "", candidates: matches };
}

function detectServiceDetails(note) {
  const times = detectTimes(note);
  const modelCandidates = detectLabelValues(note, ["model", "models", "talent", "นายแบบ", "โมเดล"], 100);
  const locationCandidates = detectLabelValues(note, ["location", "venue", "สถานที่", "โรงแรม", "hotel", "คอนโด", "condo"], 120);
  const areaCandidates = detectLabelValues(note, ["area", "zone", "โซน", "ย่าน", "เขต"], 80);
  const service = detectServiceType(note);
  return {
    model_text: modelCandidates.length === 1 ? modelCandidates[0] : "",
    model_candidates: modelCandidates,
    start_time: times.start,
    end_time: times.end,
    time_candidates: times.candidates,
    location_text: locationCandidates.length === 1 ? locationCandidates[0] : "",
    location_candidates: locationCandidates,
    area_text: areaCandidates.length === 1 ? areaCandidates[0] : "",
    area_candidates: areaCandidates,
    service_type: service.value,
    service_type_candidates: service.candidates,
    duration_minutes: durationMinutes(times.start, times.end),
  };
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyAmount(amountItem) {
  const pre = String(amountItem.pre || "").toLowerCase();
  const post = String(amountItem.post || "").toLowerCase();
  const local = `${pre} ${post}`;
  const context = amountItem.context.toLowerCase();
  if (hasAny(pre, [/direct\s+hand/, /\bhand\s+tip\b/, /\bcash\s+tip\b/, /tip\s+direct/, /ให้มือ/, /ทิปมือ/])) return "tip_direct";
  if (hasAny(pre, [/\btip\b/, /\btips\b/, /ทิป/])) return "tip_mmd";
  if (hasAny(pre, [/renew/, /renewal/, /ต่ออายุ/])) return "renewal_fee";
  if (hasAny(pre, [/membership\s+fee/, /member\s+fee/, /สมัครสมาชิก/, /ค่าสมาชิก/])) return "membership_fee";
  if (hasAny(pre, [/service/, /booking/, /\bjob\b/, /session/, /model/, /mmd confirmation/, /purchase/, /ใช้บริการ/, /งาน/]) || hasAny(context, [/mmd confirmation/])) return "service";
  if (hasAny(local, [/direct\s+hand/, /\bhand\s+tip\b/, /\bcash\s+tip\b/, /tip\s+direct/, /ให้มือ/, /ทิปมือ/])) return "tip_direct";
  if (hasAny(local, [/\btip\b/, /\btips\b/, /ทิป/])) return "tip_mmd";
  if (hasAny(local, [/renew/, /renewal/, /ต่ออายุ/])) return "renewal_fee";
  if (hasAny(local, [/membership\s+fee/, /member\s+fee/, /สมัครสมาชิก/, /ค่าสมาชิก/])) return "membership_fee";
  if (hasAny(local, [/service/, /booking/, /\bjob\b/, /session/, /model/, /purchase/, /ใช้บริการ/, /งาน/])) return "service";
  return "unknown";
}

function sumBy(events, type) {
  return events.filter((event) => event.type === type).reduce((sum, event) => sum + event.amount, 0);
}

function parseHistoricalNote(note) {
  const rawNote = String(note == null ? "" : note);
  const parseNote = clean(rawNote);
  const lower = parseNote.toLowerCase();
  const warnings = [];
  const amounts = detectAmounts(parseNote);
  const bareAmbiguous = detectBareAmbiguousAmounts(parseNote, amounts);
  const amountEvents = amounts.map((item) => ({ type: classifyAmount(item), amount: item.amount, token: item.token, context: item.context }));
  for (const item of bareAmbiguous) amountEvents.push({ type: "unknown", amount: item.amount, token: item.token, context: item.context });

  const dates = detectDates(parseNote);
  const paymentRefs = detectPaymentRefs(parseNote);
  const serviceDetails = detectServiceDetails(rawNote);
  const referralBonusCandidate = hasAny(lower, [/referral/, /\brefer\b/, /แนะนำ/]);
  const promotionBonusCandidate = hasAny(lower, [/promotion/, /\bpromo\b/, /campaign/, /แคมเปญ/, /โปรโมชั่น/]);
  const membershipAction = hasAny(lower, [/renew/, /renewal/, /ต่ออายุ/]) ? "renewal" : hasAny(lower, [/membership\s+fee/, /member\s+fee/, /สมัครสมาชิก/, /ค่าสมาชิก/]) ? "membership_signup" : "";
  const detectedPackage = hasAny(lower, [/\blite\b/, /standard/]) ? "standard_lite" : hasAny(lower, [/premium/]) ? "premium" : hasAny(lower, [/blackcard/, /black card/]) ? "blackcard" : hasAny(lower, [/svip/]) ? "svip" : hasAny(lower, [/\bvip\b/]) ? "vip" : "";

  const serviceAmount = sumBy(amountEvents, "service");
  const tipAmountMmd = sumBy(amountEvents, "tip_mmd");
  const tipAmountDirect = sumBy(amountEvents, "tip_direct");
  const membershipFeeAmount = sumBy(amountEvents, "membership_fee");
  const renewalFeeAmount = sumBy(amountEvents, "renewal_fee");
  const unknownAmount = sumBy(amountEvents, "unknown");
  const pointsEligibleAmount = serviceAmount;
  const pointsIneligibleAmount = tipAmountMmd + tipAmountDirect + membershipFeeAmount + renewalFeeAmount + unknownAmount;
  const proposedPoints = pointsEligibleAmount / POINT_RATE_THB;

  if (unknownAmount > 0) warnings.push("ambiguous_amount_requires_review");
  if (membershipFeeAmount > 0) warnings.push("membership_fee_not_auto_counted");
  if (renewalFeeAmount > 0) warnings.push("renewal_fee_not_auto_counted");
  if (referralBonusCandidate) warnings.push("referral_bonus_review_required");
  if (promotionBonusCandidate) warnings.push("promotion_bonus_review_required");
  if (parseNote && dates.length && !amountEvents.length) warnings.push("date_without_classified_amount_review_required");
  if (serviceDetails.model_candidates.length > 1) warnings.push("multiple_models_require_review");
  if (serviceDetails.location_candidates.length > 1) warnings.push("multiple_locations_require_review");
  if (serviceDetails.time_candidates.length > 1) warnings.push("multiple_time_ranges_require_review");
  if (serviceDetails.service_type_candidates.length > 1) warnings.push("multiple_service_types_require_review");

  const pointsReviewRequired = warnings.some((warning) => !warning.startsWith("multiple_") || warning === "multiple_service_types_require_review");
  const customerDetails = {
    generosity_signal: tipAmountMmd > 0 || tipAmountDirect > 0,
    tip_amount_mmd: tipAmountMmd,
    tip_amount_direct: tipAmountDirect,
    direct_hand_tip_points_policy: "never_counts_for_points",
    mmd_tip_points_policy: "detail_only_no_points",
  };
  const historicalEvents = {
    raw_note_present: Boolean(rawNote),
    amounts: amountEvents,
    dates,
    payment_refs: paymentRefs,
    service_details: serviceDetails,
    referral_bonus_candidate: referralBonusCandidate,
    promotion_bonus_candidate: promotionBonusCandidate,
  };

  return {
    raw_note: rawNote,
    note_detected_amounts: amountEvents.map((event) => ({ amount: event.amount, type: event.type, token: event.token, context: event.context })),
    note_detected_dates: dates,
    note_detected_package: detectedPackage,
    note_detected_membership_action: membershipAction,
    note_detected_service_count: amountEvents.filter((event) => event.type === "service").length,
    note_detected_payment_refs: paymentRefs,
    note_detected_model_text: serviceDetails.model_text,
    note_detected_start_time: serviceDetails.start_time,
    note_detected_end_time: serviceDetails.end_time,
    note_detected_location_text: serviceDetails.location_text,
    note_detected_area_text: serviceDetails.area_text,
    note_detected_service_type: serviceDetails.service_type,
    note_detected_duration_minutes: serviceDetails.duration_minutes,
    service_detail_candidates: serviceDetails,
    service_amount: serviceAmount,
    tip_amount_mmd: tipAmountMmd,
    tip_amount_direct: tipAmountDirect,
    membership_fee_amount: membershipFeeAmount,
    renewal_fee_amount: renewalFeeAmount,
    referral_bonus_candidate: referralBonusCandidate,
    promotion_bonus_candidate: promotionBonusCandidate,
    unknown_amount: unknownAmount,
    points_eligible_amount: pointsEligibleAmount,
    points_ineligible_amount: pointsIneligibleAmount,
    customer_detail_json: customerDetails,
    model_review_incentive_signal: referralBonusCandidate ? "referral_review" : promotionBonusCandidate ? "promotion_review" : "",
    historical_events_json: historicalEvents,
    proposed_points: proposedPoints,
    points_policy_basis: [
      "Locked rate: 100 THB = 1 point.",
      "Only service purchase through MMD generates staged proposed_points.",
      "Tips through MMD are customer detail only and generate no points.",
      "Direct hand tips never count as points.",
      "Membership and renewal fees are review-required and not auto-counted.",
      "Referral/promotion bonuses are review-required unless explicit campaign rules exist.",
    ].join("\n"),
    points_confidence: parseNote ? (pointsReviewRequired ? 0.5 : amountEvents.length ? 0.86 : 0.2) : 0,
    points_review_required: pointsReviewRequired,
    points_parse_warnings: unique(warnings),
  };
}

module.exports = {
  POINT_RATE_THB,
  detectServiceDetails,
  durationMinutes,
  normalizeClock,
  parseHistoricalNote,
};
