const PACKAGE_SUFFIXES = Object.freeze({
  trial: "Gp",
  guest: "Gp",
  guest_pass: "Gp",
  standard: "St",
  standard_lite: "St",
  lite: "St",
  premium: "Pm",
  blackcard: "Bc",
  black_card: "Bc",
  bc: "Bc",
  vip: "Vp",
  svip: "Sv",
});

const MATERIALIZATION_TRIGGERS = Object.freeze(new Set([
  "renewal_verified",
  "official_payment_verified",
  "member_dashboard_access",
  "sigil_booking_request",
  "admin_commit",
]));

const CUSTOMER_VISIBLE_FIELDS = Object.freeze([
  "display_name_for_kenji",
  "client_id_display",
  "membership_package",
  "membership_status",
  "membership_expiry",
  "points_balance_confirmed",
  "vip_status",
  "blackcard_status",
  "svip_status_visible",
  "birthday_month_day",
  "birthday_promo_opt_in",
]);

function toText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function compactSpaces(value) {
  return toText(value).normalize("NFKC").replace(/\s+/g, " ").trim();
}

function stripToIdStem(value) {
  return compactSpaces(value)
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 8);
}

function titleStem(value) {
  const stem = stripToIdStem(value);
  if (!stem) return "";
  return stem.slice(0, 1).toUpperCase() + stem.slice(1);
}

function normalizeCanonicalId(value) {
  return stripToIdStem(value).toLowerCase();
}

function firstLatinInitial(value) {
  const match = compactSpaces(value).match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : "";
}

function normalizePackageCode(value) {
  return compactSpaces(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeSuffixDisplay(value) {
  const raw = compactSpaces(value).replace(/[^A-Za-z]/g, "").slice(0, 2);
  if (!raw) return "";
  if (raw.length === 1) return raw.toUpperCase();
  return raw.slice(0, 1).toUpperCase() + raw.slice(1).toLowerCase();
}

export function buildMmdClientId(input = {}) {
  const nickname = titleStem(input.nickname || input.mmd_client_name || input.display_name || input.line_display_name);
  const validationWarnings = [];

  if (nickname.length < 3) {
    validationWarnings.push("nickname_too_short");
  }

  const hiddenName = Boolean(input.hidden_name || input.name_hidden || input.use_package_suffix);
  const firstNameInitial = firstLatinInitial(input.first_name || input.firstName || input.legal_first_name);
  const lastNameInitial = firstLatinInitial(input.last_name || input.lastName || input.legal_last_name);

  let suffixCode = "";
  let suffixType = "review_required";

  if (!hiddenName && firstNameInitial && lastNameInitial) {
    suffixCode = `${firstNameInitial}${lastNameInitial}`;
    suffixType = "legal_initials";
  } else {
    const packageCode = normalizePackageCode(input.package_code || input.membership_package || input.package || input.tier);
    suffixCode = PACKAGE_SUFFIXES[packageCode] || "";
    suffixType = suffixCode ? "package_fallback" : "review_required";
    if (!suffixCode) validationWarnings.push("package_suffix_missing");
  }

  const suffixDisplay = normalizeSuffixDisplay(suffixCode);
  if (suffixDisplay.length < 2) validationWarnings.push("suffix_incomplete");

  const clientIdDisplay = nickname && suffixDisplay ? `${nickname} ${suffixDisplay}` : "";
  const clientIdCanonical = clientIdDisplay ? `${normalizeCanonicalId(nickname)}${suffixDisplay.toLowerCase()}` : "";

  return {
    mmd_client_name: nickname,
    client_id_display: clientIdDisplay,
    client_id_canonical: clientIdCanonical,
    suffix_code: suffixDisplay,
    suffix_type: suffixType,
    client_id_source: suffixType === "legal_initials" ? "legal_name" : suffixType === "package_fallback" ? "hidden_name_package" : "review_required",
    client_id_confidence: validationWarnings.length ? "review_required" : "high",
    validation_warnings: validationWarnings,
    immutable_after_materialization: true,
  };
}

export function parseLatestSignupFromRenamedName(value) {
  const text = compactSpaces(value);
  const dateMatch = text.match(/(?:^|\s)(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s|$)/) || text.match(/(?:^|\s)(\d{4})-(\d{1,2})-(\d{1,2})(?:\s|$)/);

  if (!dateMatch) {
    return {
      line_renamed_name: text,
      latest_signup_date_raw: "",
      membership_cycle_start_at: "",
      parse_confidence: "low",
    };
  }

  let year;
  let month;
  let day;
  let raw;

  if (dateMatch[1].length === 4) {
    year = Number(dateMatch[1]);
    month = Number(dateMatch[2]);
    day = Number(dateMatch[3]);
    raw = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  } else {
    day = Number(dateMatch[1]);
    month = Number(dateMatch[2]);
    const rawYear = Number(dateMatch[3]);
    year = rawYear < 100 ? 2000 + rawYear : rawYear;
    raw = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
  }

  const valid = year >= 2020 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
  const iso = valid ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";

  return {
    line_renamed_name: text,
    latest_signup_date_raw: raw,
    membership_cycle_start_at: iso,
    parse_confidence: iso ? "medium" : "review_required",
  };
}

function firstValue(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return "";
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pickPackage(value) {
  const code = normalizePackageCode(value);
  if (["standard", "standard_lite", "lite"].includes(code)) return "Standard";
  if (code === "premium") return "Premium";
  if (["trial", "guest", "guest_pass", "7_days"].includes(code)) return "Trial";
  return firstValue(value, "Unknown");
}

function safeJson(value) {
  if (!value || typeof value !== "object") return {};
  return value;
}

export function buildKenjiMemorySnapshot(input = {}) {
  const client = safeJson(input.client);
  const entitlement = safeJson(input.entitlement);
  const points = safeJson(input.points);
  const legacy = safeJson(input.legacy);
  const conversation = safeJson(input.conversation);
  const birthday = safeJson(input.birthday);

  const idCandidate = buildMmdClientId({
    nickname: firstValue(client.mmd_client_name, client.nickname, client.username, client.line_display_name, legacy.normalized_name),
    first_name: client.first_name,
    last_name: client.last_name,
    hidden_name: client.name_hidden ?? legacy.name_hidden,
    package_code: firstValue(entitlement.package_code, client.membership_package, legacy.parsed_membership_package, legacy.parsed_client_level),
  });

  const confirmedPoints = toNumber(
    points.points_balance_confirmed ?? points.confirmed_points ?? client.points_balance_confirmed ?? client["Points Balance"] ?? client.Points_Balance ?? client.points_balance,
    0,
  );

  const displayName = firstValue(
    client.kenji_display_name,
    client.mmd_client_name,
    client.nickname,
    idCandidate.mmd_client_name,
    client.username,
    client.line_display_name,
  );

  const packageLabel = pickPackage(firstValue(entitlement.package_code, client.membership_package, legacy.parsed_membership_package, legacy.parsed_client_level));

  return {
    schema: "mmd.kenji_memory_snapshot.v1",
    client_record_id: firstValue(client.id, client.record_id),
    line_user_id_redacted: redactLineUserId(firstValue(client.line_user_id, legacy.line_user_id, input.line_user_id)),
    display_name_for_kenji: displayName,
    mmd_client_name: firstValue(client.mmd_client_name, client.nickname, displayName),
    client_id_display: firstValue(client.client_id_display, client.username, idCandidate.client_id_display),
    client_id_canonical: firstValue(client.client_id_canonical, client.username_canonical, normalizeCanonicalId(client.username), idCandidate.client_id_canonical),
    suffix_code: firstValue(client.suffix_code, idCandidate.suffix_code),
    suffix_type: firstValue(client.suffix_type, idCandidate.suffix_type),
    client_id_locked: Boolean(client.client_id_locked || client.username || idCandidate.client_id_canonical),
    membership_package: packageLabel,
    membership_status: firstValue(entitlement.member_status, entitlement.access_status, client.membership_status, client.status, "unknown"),
    membership_expiry: firstValue(entitlement.expire_at, client.membership_expiry, client.expire_at, client["Expire At"]),
    points_balance_confirmed: confirmedPoints,
    points_pending_review: toNumber(points.points_pending_review ?? legacy.proposed_points, 0),
    points_customer_visible: confirmedPoints,
    vip_status: firstValue(client.vip_status, entitlement.vip_status, "not_shown"),
    blackcard_status: firstValue(client.blackcard_status, client.black_card_status, entitlement.blackcard_status, "not_shown"),
    svip_status_visible: firstValue(client.svip_status_visible, client.svip_status, entitlement.svip_status, "not_shown"),
    birthday_month_day: firstValue(birthday.birth_month_day, client.birth_month_day),
    birthday_promo_opt_in: Boolean(birthday.birthday_promo_opt_in || client.birthday_promo_opt_in),
    conversation_summary: firstValue(conversation.summary, client.conversation_summary),
    service_history_summary: firstValue(input.service_history_summary, client.service_history_summary, legacy.service_history_summary),
    client_preference_summary: firstValue(input.client_preference_summary, legacy.client_preference_summary),
    kenji_handling_note: firstValue(input.kenji_handling_note, client.kenji_handling_note),
    internal_visibility_guard: {
      hide_ban_status_from_customer: true,
      hide_raw_notes_from_customer: true,
      hide_risk_notes_from_customer: true,
      use_confirmed_points_only_for_customer: true,
      svip_is_per_only_manual_decision: true,
    },
    materialization_status: firstValue(input.materialization_status, "snapshot_only"),
    updated_at: new Date().toISOString(),
  };
}

export function buildCustomerVisibleProfile(snapshot = {}) {
  const safe = {};
  for (const field of CUSTOMER_VISIBLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(snapshot, field)) safe[field] = snapshot[field];
  }
  safe.points_balance = toNumber(snapshot.points_balance_confirmed, 0);
  safe.points_pending_review = undefined;
  return safe;
}

export function buildKenjiSafeContext(snapshot = {}) {
  return {
    display_name: firstValue(snapshot.display_name_for_kenji, snapshot.mmd_client_name),
    client_id_display: firstValue(snapshot.client_id_display),
    tier: firstValue(snapshot.membership_package),
    membership_status: firstValue(snapshot.membership_status),
    active_points: toNumber(snapshot.points_balance_confirmed, 0),
    points_updated_at: firstValue(snapshot.updated_at),
    renewal_status: firstValue(snapshot.renewal_status, snapshot.materialization_status, "unknown"),
    service_history_summary: firstValue(snapshot.service_history_summary),
    conversation_summary: firstValue(snapshot.conversation_summary),
    kenji_handling_note: firstValue(snapshot.kenji_handling_note),
  };
}

export function canMaterializeFromTrigger(trigger) {
  return MATERIALIZATION_TRIGGERS.has(toText(trigger));
}

function redactLineUserId(value) {
  const text = toText(value);
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

export { CUSTOMER_VISIBLE_FIELDS, MATERIALIZATION_TRIGGERS, PACKAGE_SUFFIXES };
