const PRIVATE_FOLDERS = new Set(["standard", "premium", "vip", "exclusive"]);

export const SIGIL_CUSTOMER_SEARCH_POLICY_VERSION = "sigil-customer-search-v1";
export const PUBLIC_MODEL_MIN_BUDGET_THB = 5000;
export const MODEL_BODY_TYPES = new Set(["lean", "athletic", "muscular", "slim", "soft"]);
export const MODEL_SKIN_TONES = new Set(["fair", "light", "medium", "tan", "deep"]);

export function normalizeSearchMode(value) {
  const token = cleanToken(value);
  return token === "search" || token === "sigil_search" ? "search" : "booking";
}

export function normalizeCustomerLane(value) {
  const token = cleanToken(value);
  if (["straight", "str8", "hetero"].includes(token)) return "straight";
  if (["gay"].includes(token)) return "gay";
  if (["both", "either", "any", "bi", "bisexual"].includes(token)) return "both";
  return "";
}

export function normalizeWorkLane(value) {
  const token = cleanToken(value);
  if (token === "pn" || token === "np") return "pn";
  if (token === "vip") return "vip";
  return "";
}

export function allowedCustomerModelFolders(snapshot = {}) {
  if (!snapshot || snapshot.schema_version !== "my_mmd_entitlement_resolver_v1") return [];
  if (snapshot.member_blocked === true || snapshot.access?.new_model_reveals_allowed !== true) return [];
  const envelope = cleanToken(snapshot.access?.private_visibility_envelope || "none");
  if (envelope === "standard") return ["standard"];
  if (envelope === "premium") return ["standard", "premium"];
  // VIP/SVIP/Black Card stay fail-closed here. Their private/protected folders
  // require an explicit curated approval / per-model gate before customer reveal.
  return [];
}

export function protectedCustomerModelAccess(snapshot = {}) {
  const envelope = cleanToken(snapshot?.access?.private_visibility_envelope || "none");
  return ["vip", "svip", "black_card", "blackcard"].includes(envelope);
}

export function inferCustomerModelFolder(fields = {}) {
  const explicit = normalizeFolder(first(fields, ["access_folder", "model_access_folder", "model_folder", "Access Folder"]));
  if (explicit) return explicit;

  const tier = cleanToken([
    first(fields, ["model_tier", "Model Tier"]),
    first(fields, ["approved_client_visibility"]),
    first(fields, ["private_tier", "Private Tier"]),
  ].filter(Boolean).join(" "));
  if (tier.includes("exclusive") || tier.includes("black")) return "exclusive";
  if (tier.includes("vip")) return "vip";
  if (tier.includes("premium")) return "premium";
  if (tier.includes("standard") || tier.includes("lite")) return "standard";

  const path = cleanToken(first(fields, ["source_folder", "folder_path", "drive_path", "folder_scope_key"]));
  if (path.includes("exclusive")) return "exclusive";
  if (path.includes("premium")) return "premium";
  if (path.includes("standard") || path.includes("lite")) return "standard";
  if (path.includes("_vip_") || path.startsWith("vip_") || path.endsWith("_vip")) return "vip";
  return "";
}

export function isProtectedCampaignModel(fields = {}) {
  const values = [
    first(fields, ["model_code", "model_lookup_key", "unique_key"]),
    first(fields, ["working_name", "Working Name", "display_name", "Display Name"]),
    first(fields, ["nickname", "username", "folder_name", "private_real_name"]),
    first(fields, ["recognition_class", "exclusive_group"]),
  ].map((value) => String(value || "").trim());
  return values.some((value) => /(?:^|[^a-z0-9])(gws|ems)[\s_-]*0*\d{1,3}(?=$|[^a-z0-9])/i.test(value))
    || values.some((value) => ["gws", "ems"].includes(cleanToken(value)));
}

export function modelCustomerLane(fields = {}) {
  const token = cleanToken(first(fields, [
    "orientation_label", "Orientation Label", "orientation", "model_orientation",
    "customer_lane", "Customer Lane", "model_lane", "Model Lane",
  ]));
  if (token.includes("straight")) return "straight";
  if (token.includes("gay")) return "gay";
  if (["both", "bi", "bisexual", "either"].includes(token) || token.includes("both")) return "both";
  return "";
}

export function customerLaneMatches(fields = {}, requested = "") {
  const wanted = normalizeCustomerLane(requested);
  if (!wanted) return true;
  const modelLane = modelCustomerLane(fields);
  if (!modelLane) return false; // customer search never guesses an unknown Model lane.
  if (wanted === "both") return ["straight", "gay", "both"].includes(modelLane);
  return modelLane === "both" || modelLane === wanted;
}

export function defaultDurationOptions(folder = "", fields = {}) {
  const explicit = parseDurations(first(fields, [
    "customer_duration_options", "Customer Duration Options",
    "duration_options", "Duration Options",
    "booking_duration_minutes", "Booking Duration Minutes",
  ]));
  if (explicit.length) return explicit;
  const normalized = normalizeFolder(folder);
  if (normalized === "premium") return [90];
  if (normalized === "standard") return [90, 120];
  return [];
}

export function normalizeBudget(input = {}) {
  const direct = positiveNumber(input.budget_thb || input.budget || input.budget_max_thb);
  const band = cleanToken(input.budget_band);
  if (direct) return { provided: true, min_thb: 0, max_thb: direct, label: String(Math.round(direct)) };
  if (["5000_10000", "5_10", "5k_10k"].includes(band)) return { provided: true, min_thb: 5000, max_thb: 10000, label: "5000_10000" };
  if (["under_10000", "under10k"].includes(band)) return { provided: true, min_thb: 0, max_thb: 10000, label: "under_10000" };
  if (["10000_20000", "10_20", "10k_20k"].includes(band)) return { provided: true, min_thb: 10000, max_thb: 20000, label: "10000_20000" };
  if (["20000_30000", "20_30", "20k_30k"].includes(band)) return { provided: true, min_thb: 20000, max_thb: 30000, label: "20000_30000" };
  if (["30000_plus", "30k_plus"].includes(band)) return { provided: true, min_thb: 30000, max_thb: null, label: "30000_plus" };
  return { provided: false, min_thb: 0, max_thb: null, label: "" };
}

export function publicBudgetFloorError(input = {}, budget = normalizeBudget(input)) {
  if (!budget?.provided) return "";
  const direct = positiveNumber(input.budget_thb || input.budget || input.budget_max_thb);
  if (direct && direct < PUBLIC_MODEL_MIN_BUDGET_THB) return "public_budget_below_minimum";
  const band = cleanToken(input.budget_band);
  if (["under_10000", "under10k"].includes(band)) return "public_budget_below_minimum";
  if (Number.isFinite(Number(budget.max_thb)) && Number(budget.max_thb) > 0 && Number(budget.max_thb) < PUBLIC_MODEL_MIN_BUDGET_THB) {
    return "public_budget_below_minimum";
  }
  return "";
}

export function priceFitsBudget(price, budget = {}) {
  if (!budget?.provided || !Number.isFinite(Number(price))) return true;
  const amount = Number(price);
  if (Number.isFinite(Number(budget.max_thb)) && Number(budget.max_thb) > 0 && amount > Number(budget.max_thb)) return false;
  return true;
}

export function sanitizeTelegramReference(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !["t.me", "telegram.me", "www.telegram.me"].includes(host)) return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString().slice(0, 500);
  } catch {
    return "";
  }
}

export function safeSearchIntent(input = {}) {
  const mode = normalizeSearchMode(input.search_mode || input.intent_type || input.mode);
  const customerLane = normalizeCustomerLane(input.customer_lane || input.preference_lane || input.orientation);
  const workLane = normalizeWorkLane(input.work_lane || input.job_class || input.private_work);
  const budget = normalizeBudget(input);
  const spec = String(input.spec || input.preference_spec || "").trim().slice(0, 1200);
  const preferredName = String(input.preferred_model_name || input.model_name || input.model_search_query || "").trim().slice(0, 160);
  const telegramReference = sanitizeTelegramReference(input.telegram_post_url || input.telegram_reference || input.telegram_link);
  const fallbackAllowed = input.fallback_allowed === true || ["1", "true", "yes", "similar"].includes(cleanToken(input.fallback_allowed));
  const profileFilters = normalizeProfileFilters(input);
  const errors = [];
  if (mode === "search" && !budget.provided) errors.push("budget_required");
  if (input.customer_lane && !customerLane) errors.push("customer_lane_invalid");
  if ((input.work_lane || input.job_class || input.private_work) && !workLane) errors.push("work_lane_invalid");
  if ((input.telegram_post_url || input.telegram_reference || input.telegram_link) && !telegramReference) errors.push("telegram_reference_invalid");
  errors.push(...profileFilters.errors);
  return {
    mode,
    customer_lane: customerLane,
    work_lane: workLane,
    budget,
    spec,
    preferred_model_name: preferredName,
    telegram_reference: telegramReference,
    fallback_allowed: fallbackAllowed,
    profile_filters: profileFilters.filters,
    errors,
  };
}

export function normalizeProfileFilters(input = {}) {
  const filters = {
    min_height_cm: boundedInteger(input.min_height_cm, 100, 230),
    max_height_cm: boundedInteger(input.max_height_cm, 100, 230),
    min_weight_kg: boundedInteger(input.min_weight_kg, 30, 200),
    max_weight_kg: boundedInteger(input.max_weight_kg, 30, 200),
    body_type: cleanToken(input.body_type),
    skin_tone: cleanToken(input.skin_tone),
  };
  const errors = [];
  for (const key of ["min_height_cm", "max_height_cm", "min_weight_kg", "max_weight_kg"]) {
    const raw = input[key];
    if (raw !== undefined && raw !== null && String(raw).trim() && filters[key] === null) errors.push(`${key}_invalid`);
  }
  if (filters.min_height_cm !== null && filters.max_height_cm !== null && filters.min_height_cm > filters.max_height_cm) errors.push("height_range_invalid");
  if (filters.min_weight_kg !== null && filters.max_weight_kg !== null && filters.min_weight_kg > filters.max_weight_kg) errors.push("weight_range_invalid");
  if (filters.body_type && !MODEL_BODY_TYPES.has(filters.body_type)) errors.push("body_type_invalid");
  if (filters.skin_tone && !MODEL_SKIN_TONES.has(filters.skin_tone)) errors.push("skin_tone_invalid");
  for (const key of Object.keys(filters)) if (filters[key] === null) delete filters[key];
  return { filters, errors };
}

export function modelProfileMatches(fields = {}, filters = {}) {
  const height = finiteProfileNumber(first(fields, ["height_cm"]));
  const weight = finiteProfileNumber(first(fields, ["weight_kg"]));
  if (filters.min_height_cm !== undefined && (height === null || height < filters.min_height_cm)) return false;
  if (filters.max_height_cm !== undefined && (height === null || height > filters.max_height_cm)) return false;
  if (filters.min_weight_kg !== undefined && (weight === null || weight < filters.min_weight_kg)) return false;
  if (filters.max_weight_kg !== undefined && (weight === null || weight > filters.max_weight_kg)) return false;
  if (filters.body_type && cleanToken(first(fields, ["body_type"])) !== filters.body_type) return false;
  if (filters.skin_tone && cleanToken(first(fields, ["skin_tone"])) !== filters.skin_tone) return false;
  return true;
}

function boundedInteger(value, min, max) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function finiteProfileNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseDurations(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,/\s]+/);
  return [...new Set(values.map((item) => Number(String(item).replace(/[^0-9.]/g, ""))).filter((n) => Number.isFinite(n) && n >= 60 && n <= 1440).map((n) => Math.round(n)))].sort((a, b) => a - b).slice(0, 6);
}

function positiveNumber(value) {
  const n = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeFolder(value) {
  const token = cleanToken(value);
  if (token.includes("exclusive") || token.includes("black")) return "exclusive";
  if (token.includes("vip")) return "vip";
  if (token.includes("premium")) return "premium";
  if (token.includes("standard") || token.includes("lite")) return "standard";
  return "";
}

function first(fields, names) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value)) {
      const joined = value.map((item) => item?.name || item?.id || item).filter(Boolean).join(" ");
      if (joined) return joined;
    } else if (value !== undefined && value !== null && String(value).trim()) {
      return value;
    }
  }
  return "";
}

function cleanToken(value) {
  return String(value == null ? "" : value).trim().toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

