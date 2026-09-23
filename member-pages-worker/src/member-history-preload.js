const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const RECONCILIATION_TABLE = "tblNV1b5sMC2fQPxt";
const SCHEMA = "my_mmd_batch_preload_v1";
const DEFAULT_MAX_AGE_MS = 18 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 15 * 60;
const TIMEOUT_MS = 8000;

export async function readMemberHistoryPreload(env = {}, lineUserId, { now = new Date() } = {}) {
  if (!safeLineUserId(lineUserId)) return unavailable("identity_invalid");
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) return unavailable("airtable_not_configured");

  const cacheKey = await preloadCacheKey(lineUserId);
  const cached = await env.LIFF_IDENTITY_KV?.get?.(cacheKey, "json").catch(() => null);
  const cachedResult = validateCachedResult(cached, now, env);
  if (cachedResult) return { ...cachedResult, cache: "hit" };

  const clients = await airtableList(env, env.AIRTABLE_TABLE_CLIENTS || CLIENTS_TABLE, {
    filterByFormula: `{line_user_id}=${formulaString(lineUserId)}`,
    maxRecords: 3,
  });
  if (clients.length !== 1) return unavailable(clients.length > 1 ? "client_ambiguous" : "client_missing");

  const clientId = clean(clients[0]?.id);
  if (!safeRecordId(clientId)) return unavailable("client_invalid");
  const rows = await airtableList(env, env.AIRTABLE_CLIENT_LIFECYCLE_RECONCILIATION_TABLE || RECONCILIATION_TABLE, {
    filterByFormula: `{reconciliation_id}=${formulaString(`client:${clientId}`)}`,
    maxRecords: 2,
  });
  if (rows.length !== 1) return unavailable(rows.length > 1 ? "projection_ambiguous" : "projection_missing", { clientId });

  const projection = parseObject(rows[0]?.fields?.projection_json);
  const validated = validateProjection(projection, { clientId, now, env });
  if (!validated.available) return validated;
  const result = {
    ...validated,
    reconciliationRecordId: clean(rows[0]?.id),
    cache: "miss",
  };
  await env.LIFF_IDENTITY_KV?.put?.(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS }).catch(() => {});
  return result;
}

export function validateProjection(projection, { clientId = "", now = new Date(), env = {} } = {}) {
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) return unavailable("projection_invalid", { clientId });
  if (clean(projection.schema) !== SCHEMA) return unavailable("projection_schema_mismatch", { clientId });
  if (clientId && clean(projection.client_id) !== clean(clientId)) return unavailable("projection_client_mismatch", { clientId });
  if (clean(projection.points_policy?.mode) !== "lifetime_total" || projection.points_policy?.expires !== false) {
    return unavailable("projection_points_policy_mismatch", { clientId });
  }

  const computedMs = Date.parse(clean(projection.computed_at));
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(computedMs) || !Number.isFinite(nowMs)) return unavailable("projection_timestamp_invalid", { clientId });
  const ageMs = Math.max(0, nowMs - computedMs);
  if (ageMs > preloadMaxAgeMs(env)) return unavailable("projection_stale", { clientId, ageMs });

  return {
    available: true,
    reason: "batch_preload_ready",
    clientId: clean(projection.client_id),
    projection,
    ageMs,
    schema: SCHEMA,
  };
}

export function lifetimePointsFromPreload(preload, memberId = "") {
  if (preload?.available !== true) return null;
  const projection = preload.projection || {};
  const projectionMemberId = clean(projection.member_id);
  if (!projectionMemberId || (memberId && projectionMemberId !== clean(memberId))) return null;
  const confirmedBalance = nonNegativeIntOrNull(projection.current_points_confirmed);
  if (confirmedBalance === null) return null;
  return {
    state: "resolved",
    confirmedBalance,
    earnedTotal: nonNegativeInt(projection.points_earned_lifetime_ledger),
    redeemedTotal: nonNegativeInt(projection.points_redeemed_lifetime),
    recordsCount: nonNegativeInt(projection.points_active_record_count),
    currencyLabel: "MMD Points",
    pointsExpire: false,
    expiryPolicy: "none_phase1",
    nearestExpiry: null,
    expiringPoints: 0,
    policy: "mmd_points_lifetime_total_phase1",
    preloadSource: SCHEMA,
    lifetimeServiceSpendThb: money(projection.lifetime_service_spend_thb),
    serviceSpend365dThb: money(projection.eligible_service_spend_365d_thb),
    completedServiceCount: nonNegativeInt(projection.completed_service_count),
    pointsState: bounded(projection.points_state, 40) || null,
    projectionComputedAt: isoDate(projection.computed_at),
  };
}

export function recoveryStatusFromPreload(preload, trigger = "preload", now = new Date()) {
  if (preload?.available !== true) return null;
  const projection = preload.projection || {};
  const pending = nonNegativeInt(projection.unresolved_history_reviews)
    + nonNegativeInt(projection.unqueued_legacy_history_count)
    + nonNegativeInt(projection.private_history_candidate_count);
  const reconciled = clean(projection.history_backfill_status) === "reconciled"
    && clean(projection.identity?.state) !== "review_required";
  return {
    state: reconciled ? "reconciled" : "review_required",
    source_note_count: nonNegativeInt(projection.source_note_count),
    candidate_count: nonNegativeInt(projection.completed_service_count),
    pending_review_count: pending,
    materialized_count: nonNegativeInt(projection.completed_service_count),
    verified_service_spend_thb: money(projection.lifetime_service_spend_thb),
    lifetime_service_spend_thb: money(projection.lifetime_service_spend_thb),
    service_spend_365d_thb: money(projection.eligible_service_spend_365d_thb),
    completed_service_count: nonNegativeInt(projection.completed_service_count),
    historical_points_recovered: nonNegativeInt(projection.points_earned_lifetime_ledger),
    historical_points_added: 0,
    current_points_total: nonNegativeIntOrNull(projection.current_points_confirmed),
    points_expire: false,
    source_pending: false,
    preload_source: SCHEMA,
    projection_computed_at: isoDate(projection.computed_at),
    trigger: bounded(trigger, 32) || "preload",
    reason: reconciled ? "batch_preload_ready" : "batch_preload_review_required",
    updated_at: new Date(now).toISOString(),
  };
}

function validateCachedResult(value, now, env) {
  if (!value || typeof value !== "object" || value.available !== true) return null;
  const validated = validateProjection(value.projection, { clientId: value.clientId, now, env });
  if (!validated.available) return null;
  return {
    ...validated,
    reconciliationRecordId: clean(value.reconciliationRecordId),
  };
}

async function airtableList(env, table, { filterByFormula = "", maxRecords = 2 } = {}) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("pageSize", String(Math.min(100, maxRecords)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const request = new Request(url.toString(), {
      headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" },
      signal: controller.signal,
    });
    const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || !Array.isArray(payload.records)) throw new Error(`airtable_${response.status || "malformed"}`);
    return payload.records.slice(0, maxRecords);
  } finally {
    clearTimeout(timeout);
  }
}

function unavailable(reason, extra = {}) {
  return { available: false, reason, ...extra, schema: SCHEMA };
}

function preloadMaxAgeMs(env) {
  const configured = Number(env.MY_MMD_PRELOAD_MAX_AGE_MS);
  return Number.isFinite(configured) && configured >= 60 * 60 * 1000 ? configured : DEFAULT_MAX_AGE_MS;
}

async function preloadCacheKey(lineUserId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clean(lineUserId)));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
  return `my-mmd-preload:v1:${hash}`;
}

function formulaString(value) {
  return `'${clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(clean(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function nonNegativeInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function nonNegativeIntOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

function isoDate(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeLineUserId(value) {
  return /^U[a-f0-9]{32}$/i.test(clean(value));
}

function safeRecordId(value) {
  return /^rec[A-Za-z0-9]{6,32}$/.test(clean(value));
}

function bounded(value, length) {
  return clean(value).slice(0, length);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

export const __test = Object.freeze({
  CACHE_TTL_SECONDS,
  DEFAULT_MAX_AGE_MS,
  SCHEMA,
  preloadCacheKey,
  validateCachedResult,
});
