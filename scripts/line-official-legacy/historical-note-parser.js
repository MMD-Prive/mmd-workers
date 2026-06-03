const { clean } = require("./canonical-parser.js");

const POINT_RATE_THB = 100;
const THAI_MONTH_PATTERN = [
  "ม.ค.",
  "มกราคม",
  "ก.พ.",
  "กุมภาพันธ์",
  "มี.ค.",
  "มีนาคม",
  "เม.ย.",
  "เมษายน",
  "พ.ค.",
  "พฤษภาคม",
  "มิ.ย.",
  "มิถุนายน",
  "ก.ค.",
  "กรกฎาคม",
  "ส.ค.",
  "สิงหาคม",
  "ก.ย.",
  "กันยายน",
  "ต.ค.",
  "ตุลาคม",
  "พ.ย.",
  "พฤศจิกายน",
  "ธ.ค.",
  "ธันวาคม",
].map((month) => month.replace(/\./g, "\\.")).join("|");

function unique(values) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function numberFromAmount(value) {
  const raw = clean(value).replace(/,/g, "");
  const match = raw.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
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

function detectBareAmbiguousAmounts(note, knownAmounts) {
  const raw = clean(note);
  const ambiguous = [];
  const pattern = /(?<![A-Za-z0-9_\/])(?:\d{1,3}(?:,\d{3})+|\d{4,7})(?:\.\d+)?(?![A-Za-z0-9_\/])/g;
  let match = pattern.exec(raw);
  while (match) {
    const overlapsKnown = knownAmounts.some((item) => match.index >= item.index && match.index < item.end);
    if (!overlapsKnown) {
      const amount = numberFromAmount(match[0]);
      if (amount > 0) {
        ambiguous.push({
          amount,
          token: match[0],
          index: match.index,
          context: contextWindow(raw, match.index, match[0].length),
        });
      }
    }
    match = pattern.exec(raw);
  }
  return ambiguous;
}

function contextWindow(text, index, length) {
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + length + 48);
  return text.slice(start, end);
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

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifyAmount(amountItem) {
  const pre = String(amountItem.pre || "").toLowerCase();
  const post = String(amountItem.post || "").toLowerCase();
  const local = `${pre} ${post}`;
  const context = amountItem.context.toLowerCase();
  if (hasAny(pre, [/direct\s+hand/, /\bhand\s+tip\b/, /\bcash\s+tip\b/, /tip\s+direct/, /ให้มือ/, /ทิปมือ/])) {
    return "tip_direct";
  }
  if (hasAny(pre, [/\btip\b/, /\btips\b/, /ทิป/])) {
    return "tip_mmd";
  }
  if (hasAny(pre, [/renew/, /renewal/, /ต่ออายุ/])) {
    return "renewal_fee";
  }
  if (hasAny(pre, [/membership\s+fee/, /member\s+fee/, /สมัครสมาชิก/, /ค่าสมาชิก/])) {
    return "membership_fee";
  }
  if (hasAny(pre, [/service/, /booking/, /\bjob\b/, /session/, /model/, /mmd confirmation/, /purchase/, /ใช้บริการ/, /งาน/])
    || hasAny(context, [/mmd confirmation/])) {
    return "service";
  }
  if (hasAny(local, [/direct\s+hand/, /\bhand\s+tip\b/, /\bcash\s+tip\b/, /tip\s+direct/, /ให้มือ/, /ทิปมือ/])) {
    return "tip_direct";
  }
  if (hasAny(local, [/\btip\b/, /\btips\b/, /ทิป/])) return "tip_mmd";
  if (hasAny(local, [/renew/, /renewal/, /ต่ออายุ/])) return "renewal_fee";
  if (hasAny(local, [/membership\s+fee/, /member\s+fee/, /สมัครสมาชิก/, /ค่าสมาชิก/])) return "membership_fee";
  if (hasAny(local, [/service/, /booking/, /\bjob\b/, /session/, /model/, /purchase/, /ใช้บริการ/, /งาน/])) return "service";
  return "unknown";
}

function sumBy(events, type) {
  return events
    .filter((event) => event.type === type)
    .reduce((sum, event) => sum + event.amount, 0);
}

function parseHistoricalNote(note) {
  const rawNote = String(note == null ? "" : note);
  const parseNote = clean(rawNote);
  const lower = parseNote.toLowerCase();
  const warnings = [];
  const amounts = detectAmounts(parseNote);
  const bareAmbiguous = detectBareAmbiguousAmounts(parseNote, amounts);
  const amountEvents = amounts.map((item) => ({
    type: classifyAmount(item),
    amount: item.amount,
    token: item.token,
    context: item.context,
  }));

  for (const item of bareAmbiguous) {
    amountEvents.push({
      type: "unknown",
      amount: item.amount,
      token: item.token,
      context: item.context,
    });
  }

  const dates = detectDates(parseNote);
  const paymentRefs = detectPaymentRefs(parseNote);
  const referralBonusCandidate = hasAny(lower, [/referral/, /\brefer\b/, /แนะนำ/]);
  const promotionBonusCandidate = hasAny(lower, [/promotion/, /\bpromo\b/, /campaign/, /แคมเปญ/, /โปรโมชั่น/]);
  const membershipAction = hasAny(lower, [/renew/, /renewal/, /ต่ออายุ/])
    ? "renewal"
    : hasAny(lower, [/membership\s+fee/, /member\s+fee/, /สมัครสมาชิก/, /ค่าสมาชิก/])
      ? "membership_signup"
      : "";
  const detectedPackage = hasAny(lower, [/\blite\b/, /standard/])
    ? "standard_lite"
    : hasAny(lower, [/premium/])
      ? "premium"
      : hasAny(lower, [/blackcard/, /black card/])
        ? "blackcard"
        : hasAny(lower, [/svip/])
          ? "svip"
          : hasAny(lower, [/\bvip\b/])
            ? "vip"
            : "";

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

  const pointsReviewRequired = warnings.length > 0;
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
    referral_bonus_candidate: referralBonusCandidate,
    promotion_bonus_candidate: promotionBonusCandidate,
  };

  return {
    raw_note: rawNote,
    note_detected_amounts: amountEvents.map((event) => ({
      amount: event.amount,
      type: event.type,
      token: event.token,
      context: event.context,
    })),
    note_detected_dates: dates,
    note_detected_package: detectedPackage,
    note_detected_membership_action: membershipAction,
    note_detected_service_count: amountEvents.filter((event) => event.type === "service").length,
    note_detected_payment_refs: paymentRefs,
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
  parseHistoricalNote,
};
