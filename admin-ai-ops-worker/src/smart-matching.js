export const SMART_MATCH_PATH = "/v1/admin/ai-ops/smart-match/preview";

const PUBLIC_FOLDERS = new Set(["travel", "extreme"]);
const PRIVATE_FOLDERS = new Set(["standard", "premium", "vip", "exclusive"]);
const LANES = new Set(["straight", "gay", "both"]);
const SUPPORTED_CAPABILITY_FLAGS = ["mk", "burn", "live"];
const MAX_RESULTS = 8;

export function normalizeSmartMatchInput(body = {}) {
  const workType = token(body.work_type || body.booking_visibility || body.world);
  const folder = token(body.folder || body.model_folder || body.selected_access_folder);
  const lane = normalizeLane(body.orientation || body.customer_lane || body.private_orientation);
  const clientId = text(body.client_id, 180);
  const memberId = text(body.member_id, 180);
  const query = text(body.q || body.query || body.model_query, 120);
  const requested = {
    mk: truthy(body.mk),
    burn: truthy(body.burn),
    live: truthy(body.live),
    kiss: truthy(body.kiss),
  };

  const errors = [];
  if (!workType || !["public", "private"].includes(workType)) errors.push("work_type_required");
  if (workType === "public" && !PUBLIC_FOLDERS.has(folder)) errors.push("public_folder_required");
  if (workType === "private" && !PRIVATE_FOLDERS.has(folder)) errors.push("private_folder_required");
  if (workType === "private" && !["straight", "gay"].includes(lane)) errors.push("private_orientation_required");
  if (workType === "private" && !clientId && !memberId) errors.push("private_client_identity_required");

  return {
    ok: errors.length === 0,
    errors,
    client_id: clientId,
    member_id: memberId,
    work_type: workType,
    booking_visibility: workType,
    folder,
    orientation: lane,
    query,
    requested_capabilities: requested,
    limit: MAX_RESULTS,
  };
}

export function buildCanonicalModelSearchRoute(input) {
  if (!input?.ok) return null;
  const params = new URLSearchParams();
  if (input.client_id) params.set("client_id", input.client_id);
  if (input.member_id) params.set("member_id", input.member_id);
  params.set("work_type", input.work_type);
  params.set("booking_visibility", input.booking_visibility);
  params.set("folder", input.folder);
  params.set("selected_access_folder", input.folder);
  if (input.orientation) {
    params.set("customer_lane", input.orientation);
    params.set("orientation", input.orientation);
  }
  if (input.query) params.set("q", input.query);
  params.set("limit", "50");
  for (const flag of SUPPORTED_CAPABILITY_FLAGS) {
    if (input.requested_capabilities?.[flag]) params.set(flag, "1");
  }
  return `/v1/admin/models/search?${params.toString()}`;
}

export function rankSmartMatches(searchPayload, input) {
  const rawItems = firstArray(searchPayload, ["items", "models", "records", "results"]);
  const globalWarnings = [];
  if (input?.requested_capabilities?.kiss) {
    globalWarnings.push({
      code: "kiss_capability_not_exposed",
      level: "warning",
      text: "Kiss ถูกเลือก แต่ canonical /v1/admin/models/search ยังไม่ expose capability นี้ จึงไม่ใช้ Kiss ในการกรองหรือให้คะแนน",
    });
  }

  const candidates = rawItems.map((item) => scoreCandidate(item, input));
  candidates.sort((a, b) => b.score - a.score || a.model_name.localeCompare(b.model_name, "en"));

  return {
    ok: true,
    schema_version: "mmd_smart_matching_v1",
    mode: "preview_only",
    owner_mode: "single_owner",
    human_operator: "Per",
    source: "/v1/admin/models/search",
    authority: "backend_eligibility_authority",
    assignment_authority: "Per",
    per_confirmation_required: true,
    input: {
      client_id: input.client_id || "",
      member_id: input.member_id || "",
      work_type: input.work_type,
      folder: input.folder,
      orientation: input.orientation || "",
      requested_capabilities: { ...input.requested_capabilities },
    },
    private_access: searchPayload?.private_access || null,
    candidate_count: candidates.length,
    matches: candidates.slice(0, MAX_RESULTS),
    warnings: globalWarnings,
    ranking_signals_used: [
      "canonical model-search eligibility/filtering",
      "selected work type and folder",
      "customer lane/orientation",
      "explicit MK/Burn/Live capability flags when requested",
      "current sanitized availability signal",
      "model Telegram readiness as a private-work tiebreaker",
    ],
    signals_not_available: [
      "Kiss capability until canonical model search exposes it",
      "free-text chemistry/personality inference",
      "unverified Drive-folder assumptions",
      "client preference/history unless a future verified matching projection exposes it",
    ],
  };
}

function scoreCandidate(item = {}, input) {
  const modelId = text(item.model_id || item.id || item.record_id || item.model_lookup_key, 180);
  const modelName = text(item.model_name || item.name || item.working_name || item.nickname || modelId || "Unknown model", 180);
  const lookupKey = text(item.model_lookup_key || item.lookup_key || item.unique_key || item.model_code, 180);
  const folders = asTokens(item.folders);
  const lane = normalizeLane(item.orientation || item.lane);
  const available = explicitAvailability(item);
  const telegramStatus = token(item.telegram_status);
  const operational = item.operational && typeof item.operational === "object" ? item.operational : {};

  let score = 50; // Entry means canonical model-search already admitted the candidate.
  const reasons = [{ code: "canonical_eligible", weight: 50, text: "ผ่าน canonical model-search eligibility/filter แล้ว" }];
  const missing = [];

  if (folders.includes(input.folder)) {
    score += 20;
    reasons.push({ code: "folder_exact", weight: 20, text: `ตรง folder ${input.folder}` });
  } else {
    missing.push("folder_not_echoed_by_safe_projection");
  }

  if (input.orientation) {
    if (lane === input.orientation) {
      score += 15;
      reasons.push({ code: "lane_exact", weight: 15, text: `ตรง lane ${input.orientation}` });
    } else if (lane === "both") {
      score += 8;
      reasons.push({ code: "lane_both", weight: 8, text: "Model รองรับทั้งสอง lane" });
    } else if (!lane) {
      missing.push("orientation_not_exposed");
    }
  }

  if (available === true) {
    score += 25;
    reasons.push({ code: "available_now", weight: 25, text: "canonical safe projection ระบุว่ายัง bookable/available" });
  } else if (available === false) {
    score -= 30;
    reasons.push({ code: "not_available_now", weight: -30, text: "ตอนนี้ไม่ได้มี available signal" });
  } else {
    missing.push("availability_not_explicit");
  }

  for (const flag of SUPPORTED_CAPABILITY_FLAGS) {
    if (!input.requested_capabilities?.[flag]) continue;
    if (operational[flag] === true) {
      score += 10;
      reasons.push({ code: `${flag}_verified`, weight: 10, text: `${flag.toUpperCase()} ผ่าน explicit capability filter` });
    } else {
      // The backend may filter without echoing the flag; do not penalize or invent false.
      missing.push(`${flag}_capability_not_echoed`);
    }
  }

  if (input.work_type === "private") {
    if (["linked", "verified"].includes(telegramStatus)) {
      score += 8;
      reasons.push({ code: "telegram_ready", weight: 8, text: "Model Telegram linked/verified" });
    } else {
      score -= 12;
      missing.push("model_telegram_not_verified");
    }
  }

  return {
    rank: null,
    model_id: modelId,
    model_name: modelName,
    model_lookup_key: lookupKey,
    score,
    available,
    orientation: lane || "unknown",
    folders,
    telegram_status: telegramStatus || "unknown",
    operational: {
      mk: operational.mk === true,
      burn: operational.burn === true,
      live: operational.live === true,
    },
    reasons,
    missing_evidence: dedupe(missing),
    selection_mode: "Per confirms final model",
  };
}

function explicitAvailability(item) {
  if (typeof item.available === "boolean") return item.available;
  const status = token(item.status);
  if (["available", "ready", "bookable"].includes(status)) return true;
  if (["unavailable", "inactive", "blocked", "paused"].includes(status)) return false;
  return null;
}

function firstArray(value, keys) {
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

function normalizeLane(value) {
  const v = token(value);
  if (["straight", "gay", "both"].includes(v)) return v;
  if (["all", "any", "mixed"] .includes(v)) return "both";
  return "";
}

function asTokens(value) {
  if (Array.isArray(value)) return value.map(token).filter(Boolean);
  return String(value || "").split(/[,|/]/g).map(token).filter(Boolean);
}

function truthy(value) {
  if (value === true || value === 1) return true;
  return ["1", "true", "yes", "on"].includes(token(value));
}

function token(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_").slice(0, 120);
}

function text(value, max = 500) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}
