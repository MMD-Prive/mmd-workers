const RESOLVER_SCHEMA = "my_mmd_entitlement_resolver_v1";
const BLOCKED_LIFECYCLES = new Set(["blocked", "suspended", "revoked"]);
const HIGH_VALUE_RECOGNITION = new Set(["vip", "svip", "black_card"]);

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function first(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalize(value) {
  return text(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9ก-๙]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function asTags(...values) {
  const output = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) output.push(text(item));
      continue;
    }
    const raw = text(value);
    if (!raw) continue;
    for (const item of raw.split(/[,\n]+/)) output.push(text(item));
  }
  return unique(output);
}

function parseYear(rawYear, currentYear) {
  const raw = text(rawYear);
  if (/^20\d{2}$/.test(raw)) {
    const year = Number(raw);
    return year <= currentYear + 1 ? year : null;
  }
  if (!/^\d{2}$/.test(raw)) return null;

  const short = Number(raw);
  const gregorian = 2000 + short;
  if (gregorian >= 2020 && gregorian <= currentYear + 1) return gregorian;

  // LINE OFC legacy tags sometimes used Buddhist-year shorthand, e.g. #mem65 = 2565 = 2022.
  const thaiShorthand = 2500 + short - 543;
  if (thaiShorthand >= 2020 && thaiShorthand <= currentYear + 1) return thaiShorthand;
  return null;
}

function parseMemberTag(tag, currentYear) {
  const raw = text(tag);
  const match = raw.match(/^#mem([a-z]+)?(\d{2}|\d{4})$/i);
  if (!match) return null;
  const year = parseYear(match[2], currentYear);
  if (!year) return { raw, year: null, confidence: "review_required" };
  return {
    raw,
    year,
    month_hint: match[1] ? match[1].toLowerCase() : "",
    confidence: "reviewed_legacy_tag",
  };
}

function buildTenure(tags, now) {
  const currentYear = new Date(now).getUTCFullYear();
  const memberTags = tags.filter((tag) => /^#mem/i.test(tag));
  const parsed = memberTags.map((tag) => parseMemberTag(tag, currentYear)).filter(Boolean);
  const years = unique(parsed.map((item) => item.year).filter(Boolean)).sort((a, b) => a - b);
  const firstYear = years[0] || null;
  const latestYear = years.at(-1) || null;
  return {
    member_tags: memberTags,
    membership_cycles_observed: unique(memberTags).length,
    first_year_hint: firstYear,
    latest_year_hint: latestYear,
    relationship_years_approx: firstYear ? Math.max(0, currentYear - firstYear) : null,
    parse_confidence: parsed.some((item) => item.confidence === "review_required") ? "review_required" : years.length ? "medium" : "unknown",
  };
}

function buildRecognition(rename, tags) {
  const renameText = text(rename);
  const tagText = tags.join(" ");
  const all = `${renameText} ${tagText}`;
  const renameHasBlackCard = /\bblack\s*card\b|\bblackcard\b/i.test(renameText);
  const signals = [];
  if (/-svip-|#svip\b|\bsvip\b/i.test(all)) signals.push("svip");
  if (/\bblack\s*card\b|\bblackcard\b|#blackcard\b/i.test(all)) signals.push("black_card");
  if (/-vip-|#vip\b|\bvip\b/i.test(all)) signals.push("vip");

  let level = "none";
  if (signals.includes("svip")) level = "svip";
  else if (signals.includes("black_card")) level = "black_card";
  else if (signals.includes("vip")) level = "vip";

  return {
    level,
    signals: unique(signals),
    historical_blackcard_paid_confirmed: renameHasBlackCard,
    historical_blackcard_tag_signal: !renameHasBlackCard && /\bblack\s*card\b|\bblackcard\b|#blackcard\b/i.test(tagText),
    authority_boundary: "history_and_conversation_only",
  };
}

function normalizePackage(value) {
  const token = normalize(value);
  if (!token) return "unknown";
  if (["premium", "private_premium", "premium_private"].includes(token)) return "premium";
  if (["lite", "standard_lite", "standardlite"].includes(token)) return "standard_lite";
  if (["7_days", "7_day", "7days", "guest", "guest_pass", "trial", "trial_guest_pass"].includes(token)) return "7_days";
  if (["standard", "private_standard", "standard_private"].includes(token)) return "standard";
  return "unknown";
}

function derivePackage(context, latestCycle, rename, tags) {
  const explicit = first(
    latestCycle.package_code,
    latestCycle.membership_package,
    latestCycle.package,
    context.latest_package,
    context.package_code,
    context.membership_package,
  );
  const explicitNormalized = normalizePackage(explicit);
  if (explicitNormalized !== "unknown") {
    return { package_base: explicitNormalized, source: "reviewed_latest_cycle", warning: "" };
  }

  const evidence = `${text(rename)} ${tags.join(" ")}`;
  if (/\b(?:7\s*days?|7days|7d|trial)\b|7\s*วัน/i.test(evidence)) {
    return { package_base: "7_days", source: "legacy_signal", warning: "" };
  }
  if (/\blite\b/i.test(evidence)) {
    return { package_base: "standard_lite", source: "legacy_signal", warning: "" };
  }
  if (/\bpremium\b/i.test(evidence)) {
    return { package_base: "premium", source: "legacy_signal", warning: "" };
  }
  if (/\bstandard\b/i.test(evidence)) {
    return { package_base: "standard", source: "legacy_signal", warning: "" };
  }
  if (tags.some((tag) => /^#client$/i.test(tag) || /^#mem/i.test(tag))) {
    return { package_base: "premium", source: "legacy_member_without_lite_inference", warning: "legacy_package_inference_requires_review" };
  }
  return { package_base: "unknown", source: "unknown", warning: "package_base_missing" };
}

function parseDateFromRename(rename) {
  const value = text(rename);
  let match = value.match(/(?:^|\s)(\d{4})-(\d{1,2})-(\d{1,2})(?:\s|$)/);
  if (match) {
    const iso = `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    return Number.isFinite(Date.parse(`${iso}T00:00:00Z`)) ? iso : "";
  }
  match = value.match(/(?:^|\s)(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s|$)/);
  if (!match) return "";
  const yearNumber = Number(match[3]);
  const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
  const iso = `${String(year).padStart(4, "0")}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  return Number.isFinite(Date.parse(`${iso}T00:00:00Z`)) ? iso : "";
}

function safeRights(snapshot) {
  const access = object(snapshot.access);
  return {
    public_service_access: access.public_service_access === true,
    guest_pass_access: access.guest_pass_access === true,
    red_card_request_lane: access.red_card_request_lane === true,
    private_visibility_envelope: first(access.private_visibility_envelope, "none"),
    protected_allowlist_required: access.protected_allowlist_required === true,
    protected_capabilities_active: Array.isArray(access.protected_capabilities_active) ? unique(access.protected_capabilities_active.map(normalize)) : [],
    new_model_reveals_allowed: access.new_model_reveals_allowed === true,
  };
}

function emptyRights() {
  return {
    public_service_access: false,
    guest_pass_access: false,
    red_card_request_lane: false,
    private_visibility_envelope: "none",
    protected_allowlist_required: false,
    protected_capabilities_active: [],
    new_model_reveals_allowed: false,
  };
}

function resolveCurrentState(snapshot) {
  if (!snapshot || snapshot.schema_version !== RESOLVER_SCHEMA || snapshot.fail_closed !== true || !snapshot.access) {
    return { valid: false, lifecycle: "unknown", blocked: true, rights: emptyRights(), warning: "canonical_resolver_snapshot_required" };
  }

  if (snapshot.member_blocked === true) {
    return { valid: true, lifecycle: "blocked", blocked: true, rights: emptyRights(), warning: "member_blocked_fail_closed" };
  }

  const state = object(snapshot.capability_state);
  const active = Array.isArray(state.active) ? state.active : [];
  const expiringSoon = Array.isArray(state.expiring_soon) ? state.expiring_soon : [];
  const grace = Array.isArray(state.grace) ? state.grace : [];
  const inactive = Array.isArray(state.inactive) ? state.inactive : [];
  const recognized = Array.isArray(state.recognized) ? state.recognized : [];
  const lifecycleTokens = [...active, ...expiringSoon, ...grace, ...inactive].map(normalize);
  const hasBlockedToken = lifecycleTokens.some((token) => BLOCKED_LIFECYCLES.has(token));
  if (hasBlockedToken) {
    return { valid: true, lifecycle: "blocked", blocked: true, rights: emptyRights(), warning: "blocked_capability_state" };
  }

  let lifecycle = "unknown";
  if (active.length) lifecycle = "active";
  else if (expiringSoon.length) lifecycle = "expiring_soon";
  else if (grace.length) lifecycle = "grace";
  else if (inactive.length || recognized.length) lifecycle = "expired";

  return { valid: true, lifecycle, blocked: false, rights: safeRights(snapshot), warning: "" };
}

function chooseCta(packageBase, lifecycle, blocked) {
  if (blocked) return "human_review";
  if (lifecycle === "active") return "continue_member_service";
  if (lifecycle === "expiring_soon") return "renew_current_cycle";
  if (!["expired", "grace"].includes(lifecycle)) return "review_membership_status";
  if (packageBase === "premium") return "renew_premium";
  if (packageBase === "standard_lite") return "renew_lite";
  if (packageBase === "7_days") return "restart_or_upgrade_from_7_days";
  if (packageBase === "standard") return "renew_standard";
  return "membership_reactivation_review";
}

function chooseStrategy({ identityResolved, currentState, recognition, tenure }) {
  if (!identityResolved) return "review_required";
  if (!currentState.valid) return "review_required";
  if (currentState.blocked) return "restricted_human_review";
  if (currentState.lifecycle === "active") return "active_member_continuation";
  if (currentState.lifecycle === "expiring_soon") return "expiring_member_renewal";
  if (currentState.lifecycle === "grace") return "grace_reactivation";
  if (currentState.lifecycle === "expired") {
    const longTenure = Number(tenure.relationship_years_approx || 0) >= 2 || Number(tenure.membership_cycles_observed || 0) >= 2;
    return HIGH_VALUE_RECOGNITION.has(recognition.level) || longTenure ? "returning_high_value_expired" : "returning_expired";
  }
  return "review_required";
}

export function reasonKenjiCustomerContext(input = {}, options = {}) {
  const context = object(input.customer_context || input);
  const latestCycle = object(context.latest_cycle);
  const legacy = object(context.legacy);
  const rename = first(context.rename, context.line_renamed_name, context.renamed_name, legacy.line_renamed_name);
  const tags = asTags(context.hashtags, context.tags, context.legacy_tags, legacy.tags, legacy.legacy_tags, legacy.line_tags_raw);
  const now = options.now || context.evaluated_at || new Date().toISOString();
  const tenure = buildTenure(tags, now);
  const recognition = buildRecognition(rename, tags);
  const packageInfo = derivePackage(context, latestCycle, rename, tags);
  const latestRenewal = first(
    latestCycle.renewed_at,
    latestCycle.renewal_date,
    latestCycle.signup_date,
    latestCycle.start_at,
    context.latest_renewal_at,
    context.latest_signup_at,
    context.membership_cycle_start_at,
    parseDateFromRename(rename),
  );
  const expiry = first(latestCycle.expire_at, latestCycle.expiry, context.expire_at, context.membership_expiry);
  const currentState = resolveCurrentState(context.entitlement_snapshot);
  const identityResolved = Boolean(rename);
  const strategy = chooseStrategy({ identityResolved, currentState, recognition, tenure });
  const cta = chooseCta(packageInfo.package_base, currentState.lifecycle, currentState.blocked || !identityResolved || !currentState.valid);
  const warnings = unique([
    identityResolved ? "" : "rename_required_for_identity_resolution",
    packageInfo.warning,
    currentState.warning,
    !latestRenewal ? "latest_signup_or_renewal_missing" : "",
    !expiry ? "expiry_missing" : "",
    tenure.parse_confidence === "review_required" ? "tenure_tag_review_required" : "",
  ]);

  return {
    schema_version: "mmd.kenji_customer_reasoning.v1",
    evaluated_at: new Date(now).toISOString(),
    read_only: true,
    identity: {
      primary_reference: rename,
      resolution: identityResolved ? "rename" : "review_required",
      secondary_identifiers_are_matching_only: true,
      matching_evidence_present: {
        line_user_id: Boolean(first(context.line_user_id, legacy.line_user_id)),
        email: Boolean(first(context.email, context.member_email)),
        phone: Boolean(first(context.phone, context.member_phone)),
      },
    },
    tenure,
    historical_recognition: recognition,
    latest_membership_cycle: {
      package_base: packageInfo.package_base,
      package_source: packageInfo.source,
      latest_signup_or_renewal: latestRenewal,
      expiry,
    },
    canonical_current_state: {
      authority: RESOLVER_SCHEMA,
      resolver_snapshot_valid: currentState.valid,
      lifecycle: currentState.lifecycle,
      member_blocked: currentState.blocked,
      rights: currentState.rights,
    },
    conversation: {
      strategy,
      acknowledge_history_and_tenure: HIGH_VALUE_RECOGNITION.has(recognition.level) || Number(tenure.membership_cycles_observed || 0) > 0,
      never_treat_historical_vip_svip_blackcard_as_current_access: true,
      do_not_treat_returning_customer_as_new_lead: strategy === "returning_high_value_expired" || strategy === "returning_expired",
      cta,
    },
    review_required: warnings.length > 0 || strategy === "review_required" || strategy === "restricted_human_review",
    warnings,
  };
}

export { RESOLVER_SCHEMA };
