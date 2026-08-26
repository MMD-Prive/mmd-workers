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

const CANCEL_PATTERNS = [
  /ยกเลิกงาน/gi,
  /งานยกเลิก/gi,
  /ขอยกเลิก/gi,
  /ลูกค้ายกเลิก/gi,
  /ไม่ได้เกิดงาน/gi,
  /งานไม่เกิด/gi,
  /ไม่ได้ไปงาน/gi,
  /ไม่ได้รับงาน/gi,
  /\bcancel(?:led|ed)?\b/gi,
  /\bjob\s+cancel(?:led|ed)?\b/gi,
];

function unique(values) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function numberFromAmount(value) {
  const raw = clean(value).replace(/,/g, "");
  const match = raw.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function contextWindow(text, index, length) {
  const start = Math.max(0, index - 56);
  const end = Math.min(text.length, index + length + 56);
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
          pre: raw.slice(Math.max(0, match.index - 44), match.index),
          post: raw.slice(match.index + token.length, Math.min(raw.length, match.index + token.length + 36)),
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

function detectCancellation(note) {
  const raw = String(note == null ? "" : note);
  const evidence = [];
  for (const pattern of CANCEL_PATTERNS) {
    const matches = raw.match(pattern) || [];
    evidence.push(...matches);
  }
  return {
    cancelled: evidence.length > 0,
    evidence: unique(evidence),
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

function classifyServiceRole(amountItem) {
  const local = `${amountItem.pre || ""} ${amountItem.post || ""} ${amountItem.context || ""}`.toLowerCase();
  if (hasAny(local, [/ยอดรวม/, /ยอดสุทธิ/, /สุทธิ/, /net\s+total/, /final\s+total/, /total\s+due/, /amount\s+due/])) return "final_total";
  if (hasAny(local, [/discount\s*\d*%?\s*from/, /ก่อนลด/, /ราคาเต็ม/, /gross/, /original\s+price/, /full\s+price/])) return "gross_total";
  if (hasAny(local, [/มัดจำ/, /deposit/])) return "deposit";
  if (hasAny(local, [/ชำระหน้างาน/, /จ่ายหน้างาน/, /คงเหลือ/, /ยอดคงเหลือ/, /balance\s+due/, /remaining/])) return "balance";
  if (hasAny(local, [/เราค้าง/, /mmd\s+owes/, /we\s+owe/, /ค้างโมเดล/, /ค้างให้/])) return "internal_balance";
  return "service_amount";
}

function sumBy(events, type) {
  return events.filter((event) => event.type === type).reduce((sum, event) => sum + event.amount, 0);
}

function reconcileServiceSpend({ cancelled, amounts, amountEvents }) {
  if (cancelled) {
    return {
      amount: 0,
      basis: "cancelled_zero",
      reviewRequired: false,
      roles: [],
    };
  }

  const serviceAmountItems = amounts.filter((item) => classifyAmount(item) === "service");
  const roles = serviceAmountItems.map((item) => ({ amount: item.amount, role: classifyServiceRole(item), token: item.token, context: item.context }));
  const byRole = (role) => roles.filter((item) => item.role === role).map((item) => item.amount);
  const uniqueFinal = Array.from(new Set(byRole("final_total")));
  if (uniqueFinal.length === 1) {
    return { amount: uniqueFinal[0], basis: "explicit_final_total", reviewRequired: false, roles };
  }
  if (uniqueFinal.length > 1) {
    return { amount: 0, basis: "review_required", reviewRequired: true, roles };
  }

  const deposits = byRole("deposit");
  const balances = byRole("balance");
  if (deposits.length === 1 && balances.length === 1) {
    return { amount: deposits[0] + balances[0], basis: "deposit_plus_balance", reviewRequired: false, roles };
  }
  if (deposits.length > 1 || balances.length > 1) {
    return { amount: 0, basis: "review_required", reviewRequired: true, roles };
  }

  const genericService = byRole("service_amount");
  if (genericService.length === 1) {
    return { amount: genericService[0], basis: "single_service_amount", reviewRequired: false, roles };
  }
  if (genericService.length > 1) {
    return { amount: 0, basis: "review_required", reviewRequired: true, roles };
  }

  const fallbackService = amountEvents.filter((event) => event.type === "service").map((event) => event.amount);
  if (fallbackService.length === 1) {
    return { amount: fallbackService[0], basis: "single_service_amount", reviewRequired: false, roles };
  }

  return { amount: 0, basis: fallbackService.length ? "review_required" : "no_service_amount", reviewRequired: fallbackService.length > 0, roles };
}

function parseHistoricalNote(note) {
  const rawNote = String(note == null ? "" : note);
  const parseNote = clean(rawNote);
  const lower = parseNote.toLowerCase();
  const warnings = [];
  const cancellation = detectCancellation(parseNote);
  const amounts = detectAmounts(parseNote);
  const bareAmbiguous = detectBareAmbiguousAmounts(parseNote, amounts);
  const amountEvents = amounts.map((item) => ({ type: classifyAmount(item), amount: item.amount, token: item.token, context: item.context }));

  for (const item of bareAmbiguous) {
    amountEvents.push({ type: "unknown", amount: item.amount, token: item.token, context: item.context });
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

  const rawServiceAmount = sumBy(amountEvents, "service");
  const tipAmountMmd = sumBy(amountEvents, "tip_mmd");
  const tipAmountDirect = sumBy(amountEvents, "tip_direct");
  const membershipFeeAmount = sumBy(amountEvents, "membership_fee");
  const renewalFeeAmount = sumBy(amountEvents, "renewal_fee");
  const unknownAmount = sumBy(amountEvents, "unknown");
  const reconciliation = reconcileServiceSpend({ cancelled: cancellation.cancelled, amounts, amountEvents });
  const serviceAmount = cancellation.cancelled ? 0 : reconciliation.amount;
  const pointsEligibleAmount = serviceAmount;
  const pointsIneligibleAmount = tipAmountMmd + tipAmountDirect + membershipFeeAmount + renewalFeeAmount + unknownAmount;
  const proposedPoints = pointsEligibleAmount / POINT_RATE_THB;

  if (unknownAmount > 0 && !cancellation.cancelled) warnings.push("ambiguous_amount_requires_review");
  if (reconciliation.reviewRequired) warnings.push("service_amount_reconciliation_required");
  if (membershipFeeAmount > 0) warnings.push("membership_fee_not_auto_counted");
  if (renewalFeeAmount > 0) warnings.push("renewal_fee_not_auto_counted");
  if (referralBonusCandidate) warnings.push("referral_bonus_review_required");
  if (promotionBonusCandidate) warnings.push("promotion_bonus_review_required");
  if (parseNote && dates.length && !amountEvents.length && !cancellation.cancelled) warnings.push("date_without_classified_amount_review_required");

  const pointsReviewRequired = warnings.length > 0;
  const historicalServiceStatus = cancellation.cancelled
    ? "cancelled"
    : reconciliation.reviewRequired
      ? "review_required"
      : serviceAmount > 0
        ? "completed"
        : "unknown";

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
    cancellation: {
      cancelled: cancellation.cancelled,
      evidence: cancellation.evidence,
    },
    reconciliation: {
      basis: reconciliation.basis,
      reconciled_service_amount: serviceAmount,
      raw_service_amount_sum: rawServiceAmount,
      roles: reconciliation.roles,
    },
  };

  return {
    raw_note: rawNote,
    note_detected_amounts: amountEvents.map((event) => ({ amount: event.amount, type: event.type, token: event.token, context: event.context })),
    note_detected_dates: dates,
    note_detected_package: detectedPackage,
    note_detected_membership_action: membershipAction,
    note_detected_service_count: cancellation.cancelled ? 0 : amountEvents.filter((event) => event.type === "service").length,
    note_detected_payment_refs: paymentRefs,
    service_amount: serviceAmount,
    reconciled_service_amount: serviceAmount,
    reconciliation_basis: reconciliation.basis,
    historical_service_status: historicalServiceStatus,
    cancellation_evidence: cancellation.evidence.join(" | "),
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
      "Cancelled jobs are recorded as cancelled and generate zero service spend and zero points.",
      "For completed service notes, explicit final/net total is preferred over gross price and payment breakdowns.",
      "If no final total exists, one deposit plus one remaining balance may be reconciled as the service total.",
      "Gross price, final total, deposit and balance must never be added together as separate spend.",
      "Only reconciled service purchase through MMD generates staged proposed_points.",
      "Tips through MMD are customer detail only and generate no points.",
      "Direct hand tips never count as points.",
      "Membership and renewal fees are review-required and not auto-counted.",
      "Referral/promotion bonuses are review-required unless explicit campaign rules exist.",
    ].join("\n"),
    points_confidence: parseNote
      ? cancellation.cancelled
        ? 0.95
        : pointsReviewRequired
          ? 0.5
          : serviceAmount > 0
            ? 0.9
            : 0.2
      : 0,
    points_review_required: pointsReviewRequired,
    points_parse_warnings: unique(warnings),
  };
}

module.exports = {
  POINT_RATE_THB,
  detectCancellation,
  parseHistoricalNote,
  reconcileServiceSpend,
};
