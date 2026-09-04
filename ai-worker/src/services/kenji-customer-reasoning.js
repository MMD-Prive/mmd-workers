const RESOLVER_SCHEMA = "my_mmd_entitlement_resolver_v1";
const BLOCKED_LIFECYCLES = new Set(["blocked", "suspended", "revoked"]);
const HIGH_VALUE_RECOGNITION = new Set(["vip", "svip", "black_card"]);
const CLIENT_LEVEL_RANK = Object.freeze({
  guest: 0,
  "7_days": 1,
  standard: 2,
  premium: 3,
  vip: 4,
  blackcard: 5,
  svip: 6,
});

const EVIDENCE_SOURCE_STATES = Object.freeze({
  FOUND: "FOUND",
  SEARCHED_NO_MATCH: "SEARCHED_NO_MATCH",
  SOURCE_UNAVAILABLE: "SOURCE_UNAVAILABLE",
});

const EXPECTED_EVIDENCE_SOURCES = Object.freeze([
  "rename_identity",
  "line_oa_1to1",
  "line_crew",
  "chat_exports_attachments",
  "hashtags_tenure",
  "recognition_history",
  "membership_cycles",
  "payment_evidence",
  "resolver_snapshot",
]);

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

function normalizeEvidenceSourceState(value) {
  const raw = typeof value === "string" ? value : first(object(value).state, object(value).status);
  const token = normalize(raw);
  if (token === "found") return EVIDENCE_SOURCE_STATES.FOUND;
  if (token === "searched_no_match") return EVIDENCE_SOURCE_STATES.SEARCHED_NO_MATCH;
  return EVIDENCE_SOURCE_STATES.SOURCE_UNAVAILABLE;
}

function evidenceCount(value) {
  const source = object(value);
  if (Number.isInteger(source.evidence_count) && source.evidence_count >= 0) return source.evidence_count;
  if (Array.isArray(source.evidence_refs)) return source.evidence_refs.length;
  return null;
}

function evidenceSourceEntry(sourceMap, key, derivedFound = false) {
  const hasExplicitState = Object.prototype.hasOwnProperty.call(sourceMap, key);
  const raw = hasExplicitState ? sourceMap[key] : null;
  const detail = object(raw);
  const state = hasExplicitState
    ? normalizeEvidenceSourceState(raw)
    : derivedFound
      ? EVIDENCE_SOURCE_STATES.FOUND
      : EVIDENCE_SOURCE_STATES.SOURCE_UNAVAILABLE;

  let reason = first(detail.reason, detail.unavailable_reason);
  if (!reason) {
    if (!hasExplicitState && derivedFound) reason = "context_contains_relevant_evidence";
    else if (state === EVIDENCE_SOURCE_STATES.SEARCHED_NO_MATCH) reason = "searched_to_available_boundary_no_match";
    else if (state === EVIDENCE_SOURCE_STATES.SOURCE_UNAVAILABLE) reason = "source_not_proven_accessible_or_searched";
    else reason = "relevant_evidence_found";
  }

  return {
    state,
    explicit_source_state: hasExplicitState,
    evidence_count: evidenceCount(raw),
    reason,
  };
}

function buildEvidenceDiscovery({ context, rename, tags, recognition, latestCycle, latestRenewal, expiry, currentState }) {
  const sourceMap = object(context.evidence_sources || context.evidence_source_states || context.source_states);
  const hasChatArtifacts =
    (Array.isArray(context.chat_exports) && context.chat_exports.length > 0) ||
    (Array.isArray(context.attachments) && context.attachments.length > 0) ||
    (Array.isArray(context.screenshots) && context.screenshots.length > 0);
  const paymentEvidence = context.payment_evidence;
  const hasPaymentEvidence =
    (Array.isArray(paymentEvidence) && paymentEvidence.length > 0) ||
    (paymentEvidence && typeof paymentEvidence === "object" && !Array.isArray(paymentEvidence) && Object.keys(paymentEvidence).length > 0);
  const hasMembershipCycleEvidence =
    Object.keys(latestCycle).length > 0 ||
    (Array.isArray(context.membership_cycles) && context.membership_cycles.length > 0) ||
    Boolean(latestRenewal || expiry);

  const sources = {
    rename_identity: evidenceSourceEntry(sourceMap, "rename_identity", Boolean(rename)),
    line_oa_1to1: evidenceSourceEntry(sourceMap, "line_oa_1to1", false),
    line_crew: evidenceSourceEntry(sourceMap, "line_crew", false),
    chat_exports_attachments: evidenceSourceEntry(sourceMap, "chat_exports_attachments", hasChatArtifacts),
    hashtags_tenure: evidenceSourceEntry(sourceMap, "hashtags_tenure", tags.length > 0),
    recognition_history: evidenceSourceEntry(sourceMap, "recognition_history", recognition.signals.length > 0),
    membership_cycles: evidenceSourceEntry(sourceMap, "membership_cycles", hasMembershipCycleEvidence),
    payment_evidence: evidenceSourceEntry(sourceMap, "payment_evidence", hasPaymentEvidence),
    resolver_snapshot: evidenceSourceEntry(sourceMap, "resolver_snapshot", currentState.valid),
  };

  const unavailableSources = EXPECTED_EVIDENCE_SOURCES.filter(
    (key) => sources[key].state === EVIDENCE_SOURCE_STATES.SOURCE_UNAVAILABLE,
  );
  const searchedNoMatchSources = EXPECTED_EVIDENCE_SOURCES.filter(
    (key) => sources[key].state === EVIDENCE_SOURCE_STATES.SEARCHED_NO_MATCH,
  );
  const foundSources = EXPECTED_EVIDENCE_SOURCES.filter(
    (key) => sources[key].state === EVIDENCE_SOURCE_STATES.FOUND,
  );

  return {
    schema_version: "mmd.kenji_evidence_source_states.v1",
    required_sources: [...EXPECTED_EVIDENCE_SOURCES],
    sources,
    found_sources: foundSources,
    searched_no_match_sources: searchedNoMatchSources,
    unavailable_sources: unavailableSources,
    evidence_incomplete: unavailableSources.length > 0,
    note_ready: unavailableSources.length === 0,
    unavailable_is_not_not_found: true,
    authority_boundary: "discovery_only_no_entitlement_creation",
  };
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

function clientLevelPatterns() {
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

function deriveClientLevel(context, rename, tags) {
  const evidence = `${text(rename)} ${tags.join(" ")}`.trim();
  const tokens = [];
  for (const { level, pattern } of clientLevelPatterns()) {
    const matches = evidence.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) || [];
    for (const match of matches) tokens.push({ level, token: text(match) });
  }

  const ambiguous = /\b(?:maybe|possible|possibly|unclear|unknown|review)\b.{0,16}\b(?:guest|visitor|7\s*days?|7days|7d|trial|lite|standard|premium|vip|svip|black\s*card|blackcard)\b/i.test(evidence)
    || /\b(?:guest|visitor|7\s*days?|7days|7d|trial|lite|standard|premium|vip|svip|black\s*card|blackcard)\b.{0,8}\?/i.test(evidence);
  if (ambiguous) {
    return {
      level: "review_required",
      source: "line_oa_rename_tags",
      evidence_tokens: tokens,
      warning: "ambiguous_client_level_review_required",
      authority_boundary: "relationship_classification_not_current_access",
    };
  }

  if (tokens.length) {
    const selected = tokens
      .slice()
      .sort((a, b) => CLIENT_LEVEL_RANK[a.level] - CLIENT_LEVEL_RANK[b.level])
      .at(-1);
    return {
      level: selected.level,
      source: "line_oa_rename_tags",
      evidence_tokens: tokens,
      warning: "",
      authority_boundary: "relationship_classification_not_current_access",
    };
  }

  const hasMemberSignal = tags.some((tag) => /^#client$/i.test(tag) || /^#mem/i.test(tag));
  if (hasMemberSignal) {
    return {
      level: "premium",
      source: "line_oa_member_signal_inference",
      evidence_tokens: [],
      warning: "inferred_premium_from_member_signal",
      authority_boundary: "relationship_classification_not_current_access",
    };
  }

  const hasContactEvidence = Boolean(first(
    context.line_user_id,
    context.email,
    context.member_email,
    context.phone,
    context.member_phone,
    context.username,
    context.line_id,
    context.handle,
  ));
  if (hasContactEvidence) {
    return {
      level: "guest",
      source: "contact_identity_without_member_signal",
      evidence_tokens: [],
      warning: "",
      authority_boundary: "relationship_classification_not_current_access",
    };
  }

  return {
    level: "unknown",
    source: "unknown",
    evidence_tokens: [],
    warning: "client_level_unknown",
    authority_boundary: "relationship_classification_not_current_access",
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
  const clientLevel = deriveClientLevel(context, rename, tags);
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
  const evidenceDiscovery = buildEvidenceDiscovery({
    context,
    rename,
    tags,
    recognition,
    latestCycle,
    latestRenewal,
    expiry,
    currentState,
  });
  const identityResolved = Boolean(rename);
  const strategy = chooseStrategy({ identityResolved, currentState, recognition, tenure });
  const cta = chooseCta(packageInfo.package_base, currentState.lifecycle, currentState.blocked || !identityResolved || !currentState.valid);
  const warnings = unique([
    identityResolved ? "" : "rename_required_for_identity_resolution",
    packageInfo.warning,
    clientLevel.level === "review_required" ? clientLevel.warning : "",
    clientLevel.level === "unknown" ? clientLevel.warning : "",
    currentState.warning,
    !latestRenewal ? "latest_signup_or_renewal_missing" : "",
    !expiry ? "expiry_missing" : "",
    tenure.parse_confidence === "review_required" ? "tenure_tag_review_required" : "",
    evidenceDiscovery.evidence_incomplete ? "evidence_incomplete" : "",
    ...evidenceDiscovery.unavailable_sources.map((source) => `evidence_source_unavailable:${source}`),
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
    client_level: {
      authority: "line_ofc_rename_tag_canonical_parser",
      level: clientLevel.level,
      source: clientLevel.source,
      evidence_tokens: clientLevel.evidence_tokens,
      warning: clientLevel.warning,
      is_current_access_authority: false,
      authority_boundary: clientLevel.authority_boundary,
    },
    evidence_discovery: evidenceDiscovery,
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
    membership_resolution: {
      client_level: clientLevel.level,
      client_level_authority: "line_ofc_rename_tag_canonical_parser",
      current_access_authority: RESOLVER_SCHEMA,
      current_access_lifecycle: currentState.lifecycle,
      current_access_rights: currentState.rights,
      display_client_level_and_current_access_separately: true,
      client_level_never_grants_current_access: true,
      protected_levels_require_current_capability_and_allowlist_review: true,
    },
    conversation: {
      strategy,
      acknowledge_history_and_tenure: HIGH_VALUE_RECOGNITION.has(recognition.level) || Number(tenure.membership_cycles_observed || 0) > 0,
      never_treat_historical_vip_svip_blackcard_as_current_access: true,
      do_not_treat_returning_customer_as_new_lead: strategy === "returning_high_value_expired" || strategy === "returning_expired",
      unavailable_source_must_not_be_described_as_not_found: true,
      exhaustive_note_ready: evidenceDiscovery.note_ready,
      cta,
    },
    review_required: warnings.length > 0 || strategy === "review_required" || strategy === "restricted_human_review",
    warnings,
  };
}

export { RESOLVER_SCHEMA, EVIDENCE_SOURCE_STATES, EXPECTED_EVIDENCE_SOURCES, CLIENT_LEVEL_RANK };