export const MODEL_SALES_POLICY_VERSION = "model_sales_control_v1_20260921";
export const MODEL_SALES_TIME_ZONE = "Asia/Bangkok";

const ACTIVE_STATES = new Set(["active", "approved", "live", "published"]);
const PRICE_VISIBLE_STATES = new Set([
  "show",
  "visible",
  "customer_visible",
  "customer visible",
  "approved",
  "public",
]);
const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function resolveModelSalesOffer(input = {}) {
  const requestedAt = parseRequestedAt(input.requested_at || input.requestedAt);
  if (!requestedAt) return blocked("invalid_requested_at");

  const modelId = clean(input.model_id || input.modelId, 100);
  const modelKey = clean(input.model_key || input.modelKey, 160).toLowerCase();
  if (!modelId && !modelKey) return blocked("model_identity_required");

  const rules = Array.isArray(input.rules) ? input.rules : [];
  const normalized = rules
    .map((rule, index) => normalizeRule(rule, index))
    .filter((rule) => rule && ruleMatchesModel(rule, modelId, modelKey))
    .filter((rule) => ACTIVE_STATES.has(rule.status))
    .filter((rule) => ruleMatchesLane(rule, input.work_lane || input.workLane))
    .filter((rule) => scheduleMatches(rule, requestedAt));

  const candidates = normalized
    .map((rule) => ({
      rule,
      specificity: specificityFor(rule, input),
      audienceMatched: audienceMatches(rule, input),
    }))
    .filter((candidate) => candidate.specificity > 0)
    .filter((candidate) => candidate.audienceMatched);

  if (!candidates.length) return blocked("no_matching_active_rule");

  candidates.sort(compareCandidates);
  const winner = candidates[0];
  const tied = candidates.filter((candidate) =>
    candidate.specificity === winner.specificity &&
    candidate.rule.priority === winner.rule.priority &&
    candidate.rule.version === winner.rule.version
  );

  if (tied.length > 1) {
    return {
      ...blocked("ambiguous_equal_priority_rules"),
      conflict_rule_ids: tied.map((candidate) => candidate.rule.record_id).filter(Boolean),
    };
  }

  const rule = winner.rule;
  if (rule.sales_visibility === "off") {
    return {
      ...blocked("sales_visibility_off"),
      matched_rule_id: rule.record_id || null,
      matched_rule_key: rule.offer_rule_key || null,
      rule_version: rule.version,
      visibility: "off",
      audience_scope: [...rule.audience_scope],
      requires_per_approval: rule.requires_per_approval,
    };
  }

  const rate = firstFinite(
    rule.customer_sell_rate_thb,
    rule.customer_specific_rate_thb,
    rule.default_rate_thb,
  );
  const canExposeRate = rate != null && priceMayBeExposed(rule.price_visibility);

  return {
    ok: true,
    policy_version: MODEL_SALES_POLICY_VERSION,
    time_zone: MODEL_SALES_TIME_ZONE,
    sellable: true,
    visibility: rule.sales_visibility || "on",
    matched_rule_id: rule.record_id || null,
    matched_rule_key: rule.offer_rule_key || null,
    audience_scope: [...rule.audience_scope],
    customer_rate_thb: canExposeRate ? rate : null,
    price_visible: canExposeRate,
    term_summary: scheduleSummary(rule),
    requires_per_approval: rule.requires_per_approval,
    reason_code: canExposeRate ? "matched_active_rule" : "matched_rate_hidden",
    rule_version: rule.version,
    specificity: specificityName(winner.specificity),
  };
}

export function normalizeModelSalesRule(record = {}, index = 0) {
  return normalizeRule(record, index);
}

function normalizeRule(record, index) {
  if (!record || typeof record !== "object") return null;
  const fields = record.fields && typeof record.fields === "object" ? record.fields : record;
  const linkedModelIds = values(fields.Model || fields.model || fields.model_ids)
    .map((value) => clean(value?.id || value, 100))
    .filter(Boolean);
  const linkedClientIds = values(fields.Client || fields.client || fields.client_ids)
    .map((value) => clean(value?.id || value, 100))
    .filter(Boolean);

  return {
    record_id: clean(record.id || fields.record_id || `rule_${index}`, 100),
    offer_rule_key: clean(fields.offer_rule_key || fields.rule_key, 180),
    model_ids: linkedModelIds,
    model_key: clean(fields.model_key, 160).toLowerCase(),
    client_ids: linkedClientIds,
    client_identity_key: clean(fields.client_identity_key, 180).toLowerCase(),
    offer_type: token(fields.offer_type),
    default_rate_thb: finite(fields.default_rate_thb),
    customer_specific_rate_thb: finite(fields.customer_specific_rate_thb),
    customer_sell_rate_thb: finite(fields.customer_sell_rate_thb),
    audience_scope: values(fields.audience_scope).map((value) => canonicalAudience(value?.name || value)).filter(Boolean),
    price_visibility: clean(selectName(fields.price_visibility), 100).toLowerCase(),
    effective_from: clean(fields.effective_from_at || fields.effective_from, 100),
    effective_until: clean(fields.effective_until_at || fields.effective_until, 100),
    sales_visibility: token(selectName(fields.sales_visibility) || "on") || "on",
    schedule_type: token(selectName(fields.schedule_type) || "always") || "always",
    days_of_week: values(fields.days_of_week).map((value) => canonicalDay(value?.name || value)).filter(Boolean),
    start_time_local: normalizeTime(fields.start_time_local),
    end_time_local: normalizeTime(fields.end_time_local),
    priority: integer(fields.priority, 0),
    status: token(selectName(fields.status)),
    requires_per_approval: yes(fields.requires_per_approval),
    version: Math.max(1, integer(fields.version, 1)),
    updated_at: clean(fields.updated_at || fields.reviewed_at, 100),
  };
}

function blocked(reason) {
  return {
    ok: true,
    policy_version: MODEL_SALES_POLICY_VERSION,
    time_zone: MODEL_SALES_TIME_ZONE,
    sellable: false,
    visibility: "off",
    matched_rule_id: null,
    matched_rule_key: null,
    audience_scope: [],
    customer_rate_thb: null,
    price_visible: false,
    term_summary: "",
    requires_per_approval: false,
    reason_code: reason,
    rule_version: null,
    specificity: null,
  };
}

function ruleMatchesModel(rule, modelId, modelKey) {
  if (modelId && rule.model_ids.includes(modelId)) return true;
  return Boolean(modelKey && rule.model_key && rule.model_key === modelKey);
}

function ruleMatchesLane(rule, requestedLane) {
  const lane = token(requestedLane);
  if (!lane || !rule.offer_type) return true;
  if (["default", "all", "any", "general"].includes(rule.offer_type)) return true;
  return rule.offer_type === lane;
}

function specificityFor(rule, input) {
  const clientId = clean(input.client_id || input.clientId, 100);
  const clientKey = clean(input.client_identity_key || input.clientIdentityKey, 180).toLowerCase();

  const exactClient =
    (clientId && rule.client_ids.includes(clientId)) ||
    (clientKey && rule.client_identity_key && rule.client_identity_key === clientKey);
  if (exactClient) return 4;

  if (rule.client_ids.length || rule.client_identity_key) return 0;

  if (rule.audience_scope.length) return 3;

  if (hasSchedule(rule)) return 2;

  return 1;
}

function audienceMatches(rule, input) {
  if (!rule.audience_scope.length) return true;
  const available = canonicalAudiencesFromSnapshot(input.entitlement_snapshot || input.entitlementSnapshot || {});
  if (input.per_review_approved === true || input.perReviewApproved === true) available.add("per_review");
  if (clean(input.client_id || input.clientId, 100) || clean(input.client_identity_key || input.clientIdentityKey, 180)) {
    available.add("exact_client");
  }
  return rule.audience_scope.some((scope) => available.has(scope));
}

export function canonicalAudiencesFromSnapshot(snapshot = {}) {
  const output = new Set();
  const active = new Set(
    values(snapshot?.capability_state?.active || snapshot?.active_capabilities || snapshot?.capabilities)
      .map((value) => token(value?.name || value))
      .filter(Boolean)
  );
  const access = snapshot?.access && typeof snapshot.access === "object" ? snapshot.access : {};

  if (active.size || access.member === true || access.public_member === true || access.member_access === true) {
    output.add("public_member");
  }
  if (active.has("elite") || access.elite === true) output.add("elite");
  if (active.has("red_card") || active.has("redcard") || access.red_card === true) output.add("red_card");
  if (active.has("private_standard") || active.has("standard") || access.standard === true) output.add("standard");
  if (active.has("private_premium") || active.has("premium") || access.premium === true) output.add("premium");
  if (active.has("vip") || active.has("black_card") || active.has("blackcard") || access.vip === true || access.black_card === true) {
    output.add("vip_black_card");
  }
  if (active.has("svip") || access.svip === true) output.add("svip");
  return output;
}

function scheduleMatches(rule, requestedAt) {
  const requestedMs = requestedAt.getTime();
  const start = parseIso(rule.effective_from);
  const end = parseIso(rule.effective_until);
  if (start && requestedMs < start.getTime()) return false;
  if (end && requestedMs >= end.getTime()) return false;

  if (rule.schedule_type !== "weekly_recurring") return true;
  const local = bangkokParts(requestedAt);
  if (rule.days_of_week.length && !rule.days_of_week.includes(local.day)) return false;
  if (!rule.start_time_local && !rule.end_time_local) return true;
  const minute = local.hour * 60 + local.minute;
  const startMinute = timeMinutes(rule.start_time_local);
  const endMinute = timeMinutes(rule.end_time_local);
  if (startMinute == null && endMinute == null) return true;
  if (startMinute != null && endMinute == null) return minute >= startMinute;
  if (startMinute == null && endMinute != null) return minute < endMinute;
  if (startMinute <= endMinute) return minute >= startMinute && minute < endMinute;
  return minute >= startMinute || minute < endMinute;
}

function hasSchedule(rule) {
  return Boolean(
    rule.effective_from ||
    rule.effective_until ||
    rule.schedule_type !== "always" ||
    rule.days_of_week.length ||
    rule.start_time_local ||
    rule.end_time_local
  );
}

function compareCandidates(left, right) {
  if (right.specificity !== left.specificity) return right.specificity - left.specificity;
  if (right.rule.priority !== left.rule.priority) return right.rule.priority - left.rule.priority;
  if (right.rule.version !== left.rule.version) return right.rule.version - left.rule.version;
  return (
    String(right.rule.updated_at || "").localeCompare(String(left.rule.updated_at || "")) ||
    String(left.rule.record_id || "").localeCompare(String(right.rule.record_id || ""))
  );
}

function specificityName(value) {
  return ({ 4: "exact_client", 3: "audience", 2: "scheduled_model", 1: "model_default" })[value] || null;
}

function priceMayBeExposed(value) {
  const normalized = clean(value, 100).toLowerCase();
  if (!normalized) return false;
  return PRICE_VISIBLE_STATES.has(normalized);
}

function scheduleSummary(rule) {
  const parts = [];
  if (rule.schedule_type && rule.schedule_type !== "always") parts.push(rule.schedule_type);
  if (rule.effective_from) parts.push(`from ${rule.effective_from}`);
  if (rule.effective_until) parts.push(`until ${rule.effective_until}`);
  if (rule.days_of_week.length) parts.push(rule.days_of_week.join(","));
  if (rule.start_time_local || rule.end_time_local) {
    parts.push(`${rule.start_time_local || "00:00"}-${rule.end_time_local || "24:00"} Bangkok`);
  }
  return parts.join(" · ");
}

function canonicalAudience(value) {
  const raw = token(value);
  const map = {
    public_member: "public_member",
    public: "public_member",
    member: "public_member",
    elite: "elite",
    red_card: "red_card",
    redcard: "red_card",
    standard: "standard",
    private_standard: "standard",
    premium: "premium",
    private_premium: "premium",
    vip_black_card: "vip_black_card",
    vip_blackcard: "vip_black_card",
    vip: "vip_black_card",
    black_card: "vip_black_card",
    blackcard: "vip_black_card",
    svip: "svip",
    per_review: "per_review",
    exact_client: "exact_client",
  };
  return map[raw] || "";
}

function canonicalDay(value) {
  const raw = clean(value, 30).slice(0, 3).toLowerCase();
  const map = { sun:"Sun", mon:"Mon", tue:"Tue", wed:"Wed", thu:"Thu", fri:"Fri", sat:"Sat" };
  return map[raw] || "";
}

function bangkokParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MODEL_SALES_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    day: canonicalDay(get("weekday")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

function parseRequestedAt(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const text = clean(value, 100);
  if (!text) return new Date();
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseIso(value) {
  const text = clean(value, 100);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeTime(value) {
  const raw = clean(value, 20);
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeMinutes(value) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function selectName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value.name || value.value || "";
  return value;
}

function values(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function yes(value) {
  const normalized = token(selectName(value));
  return value === true || ["yes", "true", "1", "required"].includes(normalized);
}

function token(value) {
  return clean(selectName(value), 180)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(...valuesToCheck) {
  for (const value of valuesToCheck) if (Number.isFinite(value)) return value;
  return null;
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}
