const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_MODELS_TABLE = "Models";
const MODEL_SCAN_LIMIT = 2000;
const AIRTABLE_PAGE_PAUSE_MS = 210;

export const PRIVATE_MODEL_WORK_POLICY_VERSION = "private-model-work-policy-v1";

export function normalizePrivateWork(value) {
  const v = normalizeToken(value);
  if (v === "vip" || v.includes("vip")) return "vip";
  if (v === "pn" || /(^|\s)pn($|\s)/.test(v)) return "pn";
  return "";
}

export function derivePrivateServiceLevel(fields = {}, { allowPathFallback = false } = {}) {
  const canonicalRaw = first(fields, ["private_service_level", "Private Service Level"]);
  const canonical = normalizeToken(canonicalRaw);
  if (canonical) {
    if (canonical === "none") return { level: "none", source: "private_service_level" };
    if (canonical.includes("vip")) return { level: "vip", source: "private_service_level" };
    if (canonical === "pn" || canonical.startsWith("pn ")) return { level: "pn", source: "private_service_level" };
  }

  const formatRaw = first(fields, ["private_work_format", "Private Work Format", "work_format", "Work Format"]);
  const format = normalizeToken(formatRaw);
  if (format) {
    if (format.includes("vip")) return { level: "vip", source: "private_work_format" };
    if (format === "pn" || format.startsWith("pn ")) return { level: "pn", source: "private_work_format" };
  }

  const pnAbility = normalizeToken(first(fields, ["pn_ability", "PN Ability", "pn_compatible", "PN Compatible", "can_pn"]));
  if (["yes", "true", "1", "approved", "allowed"].includes(pnAbility)) {
    return { level: "pn", source: "pn_ability" };
  }

  if (allowPathFallback) {
    const path = normalizeToken(first(fields, ["source_folder", "folder_path", "drive_path", "legacy_folder", "folder_scope_key"]));
    if (path) {
      if (path.includes("exclusive vip") || path.includes("vip models") || path.includes(" vip ") || path.startsWith("vip ")) {
        return { level: "vip", source: "source_folder_migration_fallback" };
      }
      if (path.includes("exclusive pn") || path.includes("pn models") || path.includes(" pn ") || path.startsWith("pn ")) {
        return { level: "pn", source: "source_folder_migration_fallback" };
      }
    }
  }

  return { level: "", source: "unclassified" };
}

export function privateWorkCapabilities(level) {
  const v = normalizePrivateWork(level);
  if (v === "vip") return ["vip", "pn"];
  if (v === "pn") return ["pn"];
  return [];
}

export function privateWorkAllowed(level, requestedWork) {
  const requested = normalizePrivateWork(requestedWork);
  const normalizedLevel = normalizePrivateWork(level);
  if (!requested) return true;
  if (requested === "vip") return normalizedLevel === "vip";
  if (requested === "pn") return normalizedLevel === "vip" || normalizedLevel === "pn";
  return false;
}

export function isPrivateModelSearchRequest(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/g, "") || "/";
    const method = String(request.method || "GET").toUpperCase();
    return method === "GET" && path === "/v1/admin/models/search" && (
      normalizeToken(url.searchParams.get("booking_visibility")) === "private" ||
      Boolean(normalizePrivateWork(url.searchParams.get("private_work") || url.searchParams.get("job_type")))
    );
  } catch {
    return false;
  }
}

export async function enforcePrivateModelSearchPolicy(request, response, env) {
  if (!(response instanceof Response) || !isPrivateModelSearchRequest(request)) return response;

  const url = new URL(request.url);
  const requestedWork = normalizePrivateWork(url.searchParams.get("private_work") || url.searchParams.get("job_type"));
  if (!requestedWork) return response;

  const body = await response.clone().json().catch(() => null);
  if (!body) return response;
  const coreItems = arrayItems(body);
  const coreErrorCode = errorCode(body);
  const canonicalClientId = clean(url.searchParams.get("client_id"));

  if (response.ok && body.ok !== false && coreItems.length) {
    const ids = coreItems.map((item) => clean(item?.model_id || item?.id)).filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
    const recordsResult = await fetchModelsByIds(env, ids);
    if (!recordsResult.ok) return policyError(503, "private_model_work_policy_unavailable", "Unable to verify the model work level.");

    const kept = [];
    for (const item of coreItems) {
      const modelId = clean(item?.model_id || item?.id);
      const record = recordsResult.records.get(modelId);
      if (!record) continue;
      const derived = derivePrivateServiceLevel(record.fields || {}, { allowPathFallback: false });
      if (!privateWorkAllowed(derived.level, requestedWork)) continue;
      kept.push({
        ...item,
        private_service_level: derived.level,
        private_service_level_source: derived.source,
        private_work_capabilities: privateWorkCapabilities(derived.level),
      });
    }

    return replaceJson(response, {
      ...body,
      items: kept,
      ...(Array.isArray(body.models) ? { models: kept } : {}),
      ...(Array.isArray(body.records) ? { records: kept } : {}),
      count: kept.length,
      requested_private_work: requestedWork,
      private_work_policy_version: PRIVATE_MODEL_WORK_POLICY_VERSION,
    }, "enforced");
  }

  const q = clean(url.searchParams.get("q") || url.searchParams.get("search"));
  const mayOwnerDiscover = /^rec[A-Za-z0-9]+$/.test(canonicalClientId) && q.length >= 2;
  const eligibleFallback = coreErrorCode === "AUTHORITATIVE_MEMBER_NOT_FOUND" || (response.ok && body.ok !== false && coreItems.length === 0);
  if (!mayOwnerDiscover || !eligibleFallback) return response;

  const discovered = await discoverCanonicalPrivateModels(env, url, requestedWork);
  if (!discovered.ok) return policyError(503, "private_model_owner_discovery_unavailable", "Unable to search canonical Models.");
  if (!discovered.items.length && coreErrorCode === "AUTHORITATIVE_MEMBER_NOT_FOUND") return response;

  const payload = {
    ok: true,
    layer: "owner_discovery",
    items: discovered.items,
    count: discovered.items.length,
    owner_discovery: true,
    entitlement_recheck_required: true,
    discovery_reason: coreErrorCode || "canonical_private_inventory_recovery",
    requested_private_work: requestedWork,
    private_work_policy_version: PRIVATE_MODEL_WORK_POLICY_VERSION,
    work_rule: requestedWork === "vip" ? "VIP_ONLY" : "PN_PLUS_VIP",
  };
  return jsonResponse(payload, 200, response.headers, "owner-discovery");
}

export async function guardPrivateJobCreateWork(request, env) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/g, "") || "/";
  if (path !== "/v1/admin/job/create" || String(request.method || "GET").toUpperCase() !== "POST") return null;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  const requestedWork = normalizePrivateWork(body?.work?.job_type || body?.job_type || body?.private_access?.private_work);
  const visibility = normalizeToken(body?.work?.job_visibility || body?.job_visibility || "");
  if (!requestedWork || (visibility && visibility !== "private")) return null;

  const modelId = clean(body?.model?.model_id || body?.model_record_id || body?.model_id);
  if (!/^rec[A-Za-z0-9]+$/.test(modelId)) {
    return policyError(409, "canonical_model_required_for_private_work", "Private work requires a canonical Model record.");
  }

  const recordResult = await fetchModelById(env, modelId);
  if (!recordResult.ok) {
    return policyError(recordResult.status === 404 ? 409 : 503, "canonical_model_lookup_failed", "Unable to verify the selected canonical Model.");
  }

  const derived = derivePrivateServiceLevel(recordResult.record.fields || {}, { allowPathFallback: false });
  if (!derived.level) {
    return policyError(409, "private_model_service_level_unclassified", "The selected Model does not have a canonical private service level yet.");
  }
  if (!privateWorkAllowed(derived.level, requestedWork)) {
    return policyError(409, "private_model_work_not_allowed", requestedWork === "vip"
      ? "This Model is PN-only and cannot be used for a VIP job."
      : "This Model is not approved for PN work.", {
        requested_private_work: requestedWork,
        private_service_level: derived.level,
        allowed_private_work: privateWorkCapabilities(derived.level),
      });
  }
  return null;
}

async function discoverCanonicalPrivateModels(env, url, requestedWork) {
  const q = clean(url.searchParams.get("q") || url.searchParams.get("search"));
  const selectedFolder = normalizeAccessFolder(url.searchParams.get("selected_access_folder") || url.searchParams.get("folder"));
  const selectedLane = normalizeLane(url.searchParams.get("selected_orientation") || url.searchParams.get("customer_lane"));
  const services = clean(url.searchParams.get("service_options")).split(",").map((v) => normalizeToken(v)).filter(Boolean);
  const scan = await scanModels(env);
  if (!scan.ok) return { ok: false, items: [] };

  const qNorm = normalizeSearch(q);
  const ranked = [];
  for (const record of scan.records) {
    const fields = record?.fields || {};
    if (!isActive(fields) || !isPrivateModel(fields)) continue;
    const score = queryScore(record, fields, qNorm);
    if (!score) continue;

    const folder = inferAccessFolder(fields);
    if (selectedFolder && folder && folder !== selectedFolder) continue;
    if (selectedFolder && !folder) continue;

    const lane = inferLane(fields);
    if (selectedLane && lane && lane !== selectedLane && lane !== "both") continue;
    if (!services.every((service) => serviceAllowed(fields, service))) continue;

    const derived = derivePrivateServiceLevel(fields, { allowPathFallback: true });
    if (!privateWorkAllowed(derived.level, requestedWork)) continue;
    ranked.push({ score, item: sanitizeDiscoveryModel(record, fields, folder, lane, derived) });
  }

  ranked.sort((a, b) => b.score - a.score || String(a.item.model_name).localeCompare(String(b.item.model_name), "th"));
  return { ok: true, items: ranked.slice(0, 50).map((entry) => entry.item) };
}

function sanitizeDiscoveryModel(record, fields, folder, lane, derived) {
  const modelName = first(fields, ["working_name", "display_name", "model_name", "nickname", "name", "Name"]);
  return {
    model_id: clean(record?.id),
    model_name: modelName,
    model_lookup_key: first(fields, ["model_lookup_key", "unique_key", "model_code", "Model Code"]),
    lookup_key: first(fields, ["model_lookup_key", "unique_key", "model_code", "Model Code"]),
    telegram_username: first(fields, ["telegram_username", "Telegram Username"]),
    telegram_status: first(fields, ["telegram_username", "Telegram Username"]) ? "linked" : "missing",
    status: first(fields, ["status", "Status", "availability_status", "Availability Status"]) || "active",
    tier: folder,
    access_folder: folder,
    folders: folder ? [folder] : [],
    orientation: lane,
    lane,
    source: "owner_canonical_inventory_private_work_v1",
    legacy_folder: first(fields, ["source_folder", "folder_path", "drive_folder", "folder_name"]),
    private_service_level: derived.level,
    private_service_level_source: derived.source,
    private_work_capabilities: privateWorkCapabilities(derived.level),
    entitlement_recheck_required: true,
  };
}

async function fetchModelsByIds(env, ids) {
  const uniqueIds = [...new Set(ids.filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  const records = new Map();
  if (!uniqueIds.length) return { ok: true, records };
  const apiKey = clean(env?.AIRTABLE_API_KEY);
  const baseId = clean(env?.AIRTABLE_BASE_ID);
  const table = modelsTable(env);
  if (!apiKey || !baseId || !table) return { ok: false, records };

  for (let start = 0; start < uniqueIds.length; start += 25) {
    const batch = uniqueIds.slice(start, start + 25);
    const formula = `OR(${batch.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    });
    if (!response.ok) return { ok: false, records };
    const data = await response.json().catch(() => ({}));
    for (const record of Array.isArray(data.records) ? data.records : []) records.set(record.id, record);
    if (start + 25 < uniqueIds.length) await pause(AIRTABLE_PAGE_PAUSE_MS);
  }
  return { ok: true, records };
}

async function fetchModelById(env, modelId) {
  const apiKey = clean(env?.AIRTABLE_API_KEY);
  const baseId = clean(env?.AIRTABLE_BASE_ID);
  const table = modelsTable(env);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503, record: null };
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(modelId)}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
  });
  if (response.status === 404) return { ok: false, status: 404, record: null };
  if (!response.ok) return { ok: false, status: response.status, record: null };
  return { ok: true, status: 200, record: await response.json() };
}

async function scanModels(env) {
  const apiKey = clean(env?.AIRTABLE_API_KEY);
  const baseId = clean(env?.AIRTABLE_BASE_ID);
  const table = modelsTable(env);
  if (!apiKey || !baseId || !table) return { ok: false, records: [] };

  const records = [];
  let offset = "";
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    });
    if (!response.ok) return { ok: false, records: [] };
    const data = await response.json().catch(() => ({}));
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = clean(data.offset);
    if (records.length >= MODEL_SCAN_LIMIT && offset) return { ok: false, records: [] };
    if (offset) await pause(AIRTABLE_PAGE_PAUSE_MS);
  } while (offset);
  return { ok: true, records };
}

function queryScore(record, fields, qNorm) {
  if (!qNorm) return 1;
  const values = [
    record?.id,
    first(fields, ["working_name", "Working Name"]),
    first(fields, ["nickname", "Nickname"]),
    first(fields, ["model_name", "Model Name"]),
    first(fields, ["display_name", "Display Name"]),
    first(fields, ["model_lookup_key", "unique_key", "model_code", "Model Code"]),
    first(fields, ["run_number", "Run Number"]),
    first(fields, ["folder_name", "source_folder"]),
  ].map(normalizeSearch).filter(Boolean);
  if (values.some((value) => value === qNorm)) return 300;
  if (values.some((value) => value.includes(qNorm))) return 240;
  const tokens = qNorm.split(/\s+/).filter(Boolean);
  if (tokens.length && tokens.every((token) => values.some((value) => value.includes(token)))) return 220;
  return 0;
}

function isActive(fields) {
  const status = normalizeToken(first(fields, ["status", "Status", "canonical_profile_status", "Canonical Profile Status", "availability_status"]));
  return ["active", "approved", "live", "available"].includes(status);
}

function isPrivateModel(fields) {
  if (scalar(fields?.can_work_private) === "true" || fields?.can_work_private === true) return true;
  const sales = normalizeToken(first(fields, ["sales_layer", "Sales Layer", "booking_visibility", "Booking Visibility"]));
  if (sales.includes("private") || sales.includes("sigil") || sales.includes("exclusive")) return true;
  const path = normalizeToken(first(fields, ["source_folder", "folder_path", "folder_scope_key"]));
  return path.includes("exclusive") || path.includes("private models") || path.startsWith("private ");
}

function inferAccessFolder(fields) {
  const explicit = normalizeAccessFolder(first(fields, ["access_folder", "model_access_folder", "model_folder", "Access Folder"]));
  if (explicit) return explicit;
  const tier = normalizeToken([
    first(fields, ["model_tier", "Model Tier"]),
    first(fields, ["approved_client_visibility"]),
    first(fields, ["private_tier", "Private Tier"]),
  ].filter(Boolean).join(" "));
  if (tier.includes("exclusive") || tier.includes("black")) return "exclusive";
  if (tier.includes("vip")) return "vip";
  if (tier.includes("premium")) return "premium";
  if (tier.includes("standard") || tier.includes("lite")) return "standard";

  const path = normalizeToken(first(fields, ["source_folder", "folder_path", "drive_path"]));
  if (path.includes("exclusive")) return "exclusive";
  if (path.includes("vip models") || path.includes(" vip ")) return "vip";
  if (path.includes("premium")) return "premium";
  if (path.includes("standard")) return "standard";
  return "";
}

function normalizeAccessFolder(value) {
  const v = normalizeToken(value);
  if (v.includes("exclusive") || v.includes("black")) return "exclusive";
  if (v.includes("vip")) return "vip";
  if (v.includes("premium")) return "premium";
  if (v.includes("standard") || v.includes("lite")) return "standard";
  return "";
}

function inferLane(fields) {
  const v = normalizeToken(first(fields, ["orientation_label", "Orientation Label", "orientation", "model_orientation", "model_gender", "Model Gender"]));
  if (v.includes("straight")) return "straight";
  if (v.includes("gay")) return "gay";
  if (v === "both" || v === "bi" || v.includes("both")) return "both";
  return "";
}

function normalizeLane(value) {
  const v = normalizeToken(value);
  if (v.includes("straight")) return "straight";
  if (v.includes("gay")) return "gay";
  if (v === "both" || v === "bi" || v.includes("both")) return "both";
  return "";
}

function serviceAllowed(fields, service) {
  const aliases = {
    mk: ["mk_ability", "MK Ability", "mk", "MK"],
    burn: ["burn_ability", "Burn Ability", "burn", "Burn"],
    kiss: ["kiss_ability", "Kiss Ability", "kiss", "Kiss"],
    live: ["live_ability", "Live Ability", "live", "Live"],
  }[service];
  if (!aliases) return true;
  const value = normalizeToken(first(fields, aliases));
  return ["yes", "true", "1", "active", "approved", "allowed"].includes(value);
}

function arrayItems(body) {
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.models)) return body.models;
  if (Array.isArray(body?.records)) return body.records;
  return [];
}

function errorCode(body) {
  const error = body?.error;
  if (error && typeof error === "object") return clean(error.code || error.error_code || body.error_code);
  return clean(body?.error_code);
}

function replaceJson(response, payload, mode) {
  return jsonResponse(payload, response.status, response.headers, mode);
}

function jsonResponse(payload, status = 200, baseHeaders = null, mode = "enforced") {
  const headers = new Headers(baseHeaders || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.delete("content-length");
  headers.set("x-mmd-private-work-policy", PRIVATE_MODEL_WORK_POLICY_VERSION);
  headers.set("x-mmd-private-work-policy-mode", mode);
  return new Response(JSON.stringify(payload), { status, headers });
}

function policyError(status, code, message, extra = {}) {
  return jsonResponse({
    ok: false,
    error: { code, message },
    error_code: code,
    private_work_policy_version: PRIVATE_MODEL_WORK_POLICY_VERSION,
    ...extra,
  }, status, null, "blocked");
}

function modelsTable(env) {
  return clean(env?.AIRTABLE_TABLE_MODELS_ID || env?.AIRTABLE_TABLE_MODELS || DEFAULT_MODELS_TABLE);
}

function first(fields, keys) {
  for (const key of keys) {
    if (!fields || !Object.prototype.hasOwnProperty.call(fields, key)) continue;
    const value = scalar(fields[key]);
    if (value) return value;
  }
  return "";
}

function scalar(value) {
  if (Array.isArray(value)) return value.length ? scalar(value[0]) : "";
  if (value && typeof value === "object") return clean(value.name ?? value.value ?? value.label ?? value.id ?? "");
  if (value === true) return "true";
  if (value === false) return "false";
  return clean(value);
}

function normalizeToken(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[_/\\|:+-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSearch(value) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ก-๙]+/g, " ").replace(/\s+/g, " ").trim();
}

function clean(value) {
  return String(value ?? "").trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
