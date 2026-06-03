const MONTHS = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function compactWhitespace(value) {
  return clean(value).replace(/\s+/g, " ");
}

function unique(values) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

const CLIENT_LEVEL_RANK = {
  guest: 0,
  "7_days": 1,
  standard: 2,
  premium: 3,
  vip: 4,
  blackcard: 5,
  svip: 6,
};

function extractTags(...values) {
  const text = values.map(clean).join(" ");
  const matches = text.match(/#[a-z0-9_ก-๙]+|-svip-|-vip-|\bblack\s*card\b|\bblackcard\b|\blite\b/gi) || [];
  return unique(matches);
}

function parseNameAndUsername(label) {
  const raw = compactWhitespace(label);
  const usernameMatch = raw.match(/\(([^)]+)\)/);
  const username = usernameMatch ? clean(usernameMatch[1]).replace(/^@/, "") : "";
  const withoutHandle = raw.replace(/\([^)]*\)/g, " ").replace(/#[a-z0-9_ก-๙]+/gi, " ");
  const withoutTier = withoutHandle
    .replace(/-svip-/gi, " ")
    .replace(/-vip-/gi, " ")
    .replace(/\bblack\s*card\b/gi, " ")
    .replace(/\bblackcard\b/gi, " ")
    .replace(/\blite\b/gi, " ");
  const firstPart = compactWhitespace(withoutTier.split(/\s+-\s+| -|-/)[0]);
  return {
    normalized_name: firstPart,
    username_candidate: username,
    mmd_client_name_candidate: firstPart ? (firstPart.startsWith("คุณ") ? firstPart : `คุณ${firstPart}`) : "",
  };
}

function normalizeYear(rawYear) {
  if (/^\d{2}$/.test(rawYear)) return `20${rawYear}`;
  if (/^\d{4}$/.test(rawYear)) return rawYear;
  return "";
}

function parseMemberSinceToken(token) {
  const raw = clean(token);
  const body = raw.replace(/^#mem/i, "");
  if (!body) {
    return { value: "", raw, warning: "empty_member_since_token" };
  }

  const monthYear = body.match(/^([a-zA-Z]+)(\d{2}|\d{4})$/);
  if (monthYear) {
    const month = MONTHS[monthYear[1].toLowerCase()];
    const year = normalizeYear(monthYear[2]);
    if (month && year) return { value: `${year}-${month}`, raw, warning: "" };
    return { value: "", raw, warning: "ambiguous_member_since_token" };
  }

  const year = normalizeYear(body);
  if (year) return { value: year, raw, warning: "" };

  return { value: "", raw, warning: "ambiguous_member_since_token" };
}

function selectMemberSinceToken(parsedTokens, warnings) {
  const valid = parsedTokens.filter((item) => item.value);
  if (warnings.length || parsedTokens.some((item) => item.warning)) {
    return {
      member_since: valid.map((item) => item.value).sort().at(-1) || "",
      chosen_member_since_token: "",
      chosen_member_since_strategy: "review_required",
    };
  }
  if (!valid.length) {
    return {
      member_since: "",
      chosen_member_since_token: "",
      chosen_member_since_strategy: "review_required",
    };
  }
  const selected = valid
    .slice()
    .sort((a, b) => a.value.localeCompare(b.value) || a.raw.localeCompare(b.raw))
    .at(-1);
  return {
    member_since: selected.value,
    chosen_member_since_token: selected.raw,
    chosen_member_since_strategy: valid.length === 1 ? "only_valid_member_token" : "latest_valid_member_token",
  };
}

function hasLiteDateSignal(text) {
  const raw = clean(text);
  if (!/\blite\b/i.test(raw)) return false;
  return /\blite\b.{0,24}(#mem[a-z0-9]+|\d{1,2}[/-]\d{1,2}[/-]?\d{0,4}|\d{4}|\d{2})/i.test(raw)
    || /(#mem[a-z0-9]+|\d{1,2}[/-]\d{1,2}[/-]?\d{0,4}|\d{4}|\d{2}).{0,24}\blite\b/i.test(raw);
}

function levelTokenPatterns() {
  return [
    { level: "guest", pattern: /#guest\b|\bguest\b|\bvisitor\b|\bno\s+membership\b|\bnon[-\s]?member\b/i },
    { level: "7_days", pattern: /#?(?:7\s*days?|7days|7[-\s]?day|7d)\b|\btrial\b|7\s*วัน/i },
    { level: "standard", pattern: /#standard\b|\bstandard\b|\blite\b/i },
    { level: "premium", pattern: /#premium\b|\bpremium\b/i },
    { level: "vip", pattern: /-vip-|#vip\b|\bvip\b/i },
    { level: "blackcard", pattern: /#blackcard\b|\bblack\s*card\b|\bblack-card\b|\bblackcard\b/i },
    { level: "svip", pattern: /-svip-|#svip\b|\bsvip\b/i },
  ];
}

function detectClientLevelTokens(text, { hasContactEvidence = false, hasMemberSignal = false } = {}) {
  const raw = clean(text);
  const tokens = [];
  for (const { level, pattern } of levelTokenPatterns()) {
    const matches = raw.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) || [];
    for (const match of matches) tokens.push({ level, token: clean(match) });
  }

  const lower = raw.toLowerCase();
  const ambiguous = /\b(?:maybe|possible|possibly|unclear|unknown|review)\b.{0,16}\b(?:guest|visitor|7\s*days?|7days|7d|trial|lite|standard|premium|vip|svip|black\s*card|blackcard)\b/i.test(raw)
    || /\b(?:guest|visitor|7\s*days?|7days|7d|trial|lite|standard|premium|vip|svip|black\s*card|blackcard)\b.{0,8}\?/i.test(raw);
  if (ambiguous) {
    return {
      client_level: "review_required",
      client_level_raw: tokens.map((item) => item.token).join(", "),
      client_level_tokens: tokens,
      warning: "ambiguous_client_level_review_required",
    };
  }

  if (!tokens.length && hasMemberSignal) {
    return {
      client_level: "premium",
      client_level_raw: "",
      client_level_tokens: [],
      warning: "inferred_premium_from_member_signal",
    };
  }

  if (!tokens.length && hasContactEvidence) {
    return {
      client_level: "guest",
      client_level_raw: "",
      client_level_tokens: [],
      warning: "",
    };
  }

  if (!tokens.length && lower) {
    return {
      client_level: "unknown",
      client_level_raw: "",
      client_level_tokens: [],
      warning: "",
    };
  }

  if (!tokens.length) {
    return {
      client_level: "unknown",
      client_level_raw: "",
      client_level_tokens: [],
      warning: "",
    };
  }

  const selected = tokens
    .slice()
    .sort((a, b) => CLIENT_LEVEL_RANK[a.level] - CLIENT_LEVEL_RANK[b.level])
    .at(-1);
  return {
    client_level: selected.level,
    client_level_raw: selected.token,
    client_level_tokens: tokens,
    warning: "",
  };
}

function parseCanonicalLineOfc(input = {}) {
  const nickname = clean(input.nickname || input.line_renamed_name || input.raw_display_label || input.label || input.name);
  const explicitTags = Array.isArray(input.tags) ? input.tags.join(" ") : clean(input.tags || input.line_tags_raw || input.legacy_tags);
  const note = clean(input.note || input.notes || input.memo || input.description);
  const lineDisplayName = clean(input.line_display_name || input.display_name);
  const lineUserId = clean(input.line_user_id || input.userId || input.user_id);
  const hasContactEvidence = Boolean(lineUserId || clean(input.email || input.member_email || input.phone || input.member_phone || input.username || input.line_id || input.handle));
  const text = [nickname, explicitTags, note].filter(Boolean).join(" ");
  const tags = extractTags(text);
  const lowerText = text.toLowerCase();
  const nameParts = parseNameAndUsername(nickname || lineDisplayName);
  const warnings = [];
  const memberTokenWarnings = [];

  const memberTokens = unique(tags.filter((tag) => /^#mem/i.test(tag)));
  const parsedMemberTokens = memberTokens.map(parseMemberSinceToken);
  for (const parsed of parsedMemberTokens) {
    if (parsed.warning) {
      const warning = `${parsed.warning}:${parsed.raw}`;
      memberTokenWarnings.push(warning);
      warnings.push(warning);
    }
  }

  const hasClient = tags.some((tag) => /^#client$/i.test(tag));
  const hasPurchased = tags.some((tag) => /^#purchased$/i.test(tag));
  const hasMemberSignal = hasClient || parsedMemberTokens.some((item) => item.value);
  const ambiguousMemberSignal = parsedMemberTokens.some((item) => item.warning);
  const liteSignal = hasLiteDateSignal(text);
  const clientLevel = detectClientLevelTokens(text, { hasContactEvidence, hasMemberSignal });
  if (clientLevel.warning) warnings.push(clientLevel.warning);

  let membershipTier = "none";
  if (clientLevel.client_level === "blackcard") membershipTier = "blackcard";
  else if (clientLevel.client_level === "svip") membershipTier = "svip";
  else if (clientLevel.client_level === "vip") membershipTier = "vip";

  let membershipPackage = "none";
  if (liteSignal) membershipPackage = "standard_lite";
  else if (clientLevel.client_level === "premium" || hasMemberSignal) membershipPackage = "premium";

  let membershipStatus = "none";
  if (ambiguousMemberSignal) membershipStatus = "review_required";
  else if (hasClient || hasMemberSignal) membershipStatus = "member";
  else if (hasPurchased) membershipStatus = "purchased";

  if (/\bmem[a-z]+\b/i.test(lowerText) && !memberTokens.length) {
    memberTokenWarnings.push("member_signal_missing_hash_review_required");
    warnings.push("member_signal_missing_hash_review_required");
    membershipStatus = "review_required";
  }

  const memberSinceSelection = selectMemberSinceToken(parsedMemberTokens, memberTokenWarnings);
  const memberSince = memberSinceSelection.member_since;
  const memberSinceRaw = memberSinceSelection.chosen_member_since_token
    || parsedMemberTokens.map((item) => item.raw).filter(Boolean).sort().at(-1)
    || "";
  const memberSinceCandidates = parsedMemberTokens.map((item) => ({
    token: item.raw,
    member_since: item.value,
    warning: item.warning,
  }));
  const parseConfidence = (() => {
    if (warnings.length) return 0.45;
    if (hasClient && (memberSince || hasPurchased || membershipTier !== "none" || membershipPackage !== "none")) return 0.92;
    if (hasClient || memberSince || hasPurchased) return 0.82;
    if (membershipTier !== "none" || liteSignal) return 0.65;
    return 0.25;
  })();

  return {
    client_level: clientLevel.client_level,
    client_level_raw: clientLevel.client_level_raw,
    client_level_tokens: clientLevel.client_level_tokens,
    membership_status: membershipStatus,
    membership_tier: membershipTier,
    membership_package: membershipPackage,
    member_since: memberSince,
    member_since_raw: memberSinceRaw,
    all_member_tokens: memberTokens,
    chosen_member_since_token: memberSinceSelection.chosen_member_since_token,
    chosen_member_since_strategy: memberSinceSelection.chosen_member_since_strategy,
    member_since_candidates: memberSinceCandidates,
    has_purchased: hasPurchased,
    parse_confidence: parseConfidence,
    parse_warnings: unique(warnings),
    normalized_name: nameParts.normalized_name,
    username_candidate: clean(input.username || input.line_id || input.handle) || nameParts.username_candidate,
    mmd_client_name_candidate: nameParts.mmd_client_name_candidate,
    line_user_id: lineUserId,
    line_display_name: lineDisplayName,
    line_renamed_name: nickname,
    line_tags_raw: explicitTags,
    detected_tags: tags,
  };
}

module.exports = {
  MONTHS,
  clean,
  extractTags,
  parseCanonicalLineOfc,
  parseMemberSinceToken,
};
