import {
  ANALYTICS_SCHEMA,
  BUSINESS_TRUTH_METRICS,
  EVENTS,
  IDENTITY_POLICY,
  INTENT_FUNNELS,
  LANES,
  OPERATIONAL_HEALTH,
  OWNER_DASHBOARD,
} from "../../shared/posthog-conversion-canon.mjs";

const DEFAULT_POSTHOG_HOST = "https://us.posthog.com";
const QUERY_TIMEOUT_MS = 5500;

const TRACKED_EVENTS = Object.freeze([
  EVENTS.PROFILE_VIEWED,
  EVENTS.BOOKING_STARTED,
  EVENTS.BOOKING_RECEIVED,
  EVENTS.PAYMENT_STARTED,
  EVENTS.PAYMENT_VERIFIED,
  EVENTS.MEMBERSHIP_ACTIVATED,
  EVENTS.MY_MMD_LOGIN_STARTED,
  EVENTS.MY_MMD_SESSION_STARTED,
  EVENTS.MMS_PREBOOKING_RECEIVED,
  EVENTS.SHOP_ORDER_CREATED,
  EVENTS.PARTNER_TERMS_ACCEPTED,
]);

const TRACKED_ROUTES = Object.freeze([
  "/member/membership",
  "/pay/membership",
  "/member/login",
  "/male-massage/home",
  "/male-massage/member/mms-booking",
  "/mmd-shop",
  "/shop",
  "/mmd-shop/order",
  "/partner",
  "/partner/terms",
]);

function clean(value, max = 4000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function quoteSql(value) {
  return "'" + String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'";
}

function posthogConfig(env = {}) {
  const apiKey = clean(env.POSTHOG_READ_API_KEY || env.POSTHOG_PERSONAL_API_KEY, 4096);
  const host = clean(env.POSTHOG_QUERY_HOST || DEFAULT_POSTHOG_HOST, 300).replace(/\/+$/, "");
  const projectId = Number(env.POSTHOG_PROJECT_ID || OWNER_DASHBOARD.posthog_project_id);
  return {
    apiKey,
    host,
    projectId: Number.isInteger(projectId) && projectId > 0 ? projectId : OWNER_DASHBOARD.posthog_project_id,
  };
}

function rowsFromQuery(payload) {
  const columns = Array.isArray(payload?.columns) ? payload.columns.map((value) => clean(value, 120)) : [];
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  if (!columns.length || !rows.length) return [];
  return rows.map((row) => {
    if (!Array.isArray(row)) return row && typeof row === "object" ? row : {};
    return Object.fromEntries(columns.map((column, index) => [column, row[index]]));
  });
}

async function posthogHogql(env, query) {
  const { apiKey, host, projectId } = posthogConfig(env);
  if (!apiKey) return { ok: false, state: "read_scope_missing", rows: [], status: 0 };

  let response;
  try {
    response = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      state: "query_unavailable",
      rows: [],
      status: 0,
      reason: clean(error?.message || "posthog_query_failed", 180),
    };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      state: response.status === 401 || response.status === 403 ? "read_scope_missing" : "query_unavailable",
      rows: [],
      status: response.status,
      reason: clean(payload?.detail || payload?.error || `posthog_http_${response.status}`, 180),
    };
  }

  return { ok: true, state: "connected", rows: rowsFromQuery(payload), status: response.status };
}

function eventSummaryQuery() {
  const names = TRACKED_EVENTS.map(quoteSql).join(",");
  return `
SELECT
  event,
  properties.flow AS flow,
  count() AS events_30d,
  countIf(timestamp >= now() - INTERVAL 7 DAY) AS current_7d,
  countIf(timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY) AS previous_7d,
  max(timestamp) AS last_seen
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event IN (${names})
GROUP BY event, flow
ORDER BY event, flow
`.trim();
}

function routeSummaryQuery() {
  const paths = TRACKED_ROUTES.map(quoteSql).join(",");
  return `
SELECT
  properties.$pathname AS pathname,
  count() AS views_30d,
  countIf(timestamp >= now() - INTERVAL 7 DAY) AS current_7d,
  countIf(timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY) AS previous_7d,
  max(timestamp) AS last_seen
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event = '$pageview'
  AND properties.$pathname IN (${paths})
GROUP BY pathname
ORDER BY views_30d DESC
`.trim();
}

function healthQuery() {
  return `
SELECT
  properties.authority AS authority,
  count() AS events_24h,
  max(timestamp) AS last_seen
FROM events
WHERE timestamp >= now() - INTERVAL 1 DAY
  AND event = 'analytics_runtime_health'
GROUP BY authority
ORDER BY authority
`.trim();
}

function revenueQuery() {
  return `
SELECT
  count() AS payments_30d,
  sum(properties.amount_thb) AS verified_thb_30d,
  countIf(timestamp >= now() - INTERVAL 7 DAY) AS current_7d,
  countIf(timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY) AS previous_7d,
  max(timestamp) AS last_seen
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event = 'payment_verified'
`.trim();
}

function indexEventRows(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const event = clean(row?.event, 120);
    if (!event) continue;
    const flow = clean(row?.flow, 120) || "";
    const key = `${event}|${flow}`;
    map.set(key, {
      event,
      flow: flow || null,
      events_30d: finiteNumber(row?.events_30d),
      current_7d: finiteNumber(row?.current_7d),
      previous_7d: finiteNumber(row?.previous_7d),
      last_seen: clean(row?.last_seen, 120) || null,
    });
  }
  return map;
}

function sumEvent(map, event, flow = null) {
  let events30d = 0;
  let current7d = 0;
  let previous7d = 0;
  let lastSeen = null;
  let found = false;

  for (const item of map.values()) {
    if (item.event !== event) continue;
    if (flow !== null && item.flow !== flow) continue;
    found = true;
    events30d += Number(item.events_30d || 0);
    current7d += Number(item.current_7d || 0);
    previous7d += Number(item.previous_7d || 0);
    if (item.last_seen && (!lastSeen || item.last_seen > lastSeen)) lastSeen = item.last_seen;
  }

  return {
    event,
    flow,
    observed: found,
    events_30d: found ? events30d : null,
    current_7d: found ? current7d : null,
    previous_7d: found ? previous7d : null,
    last_seen: lastSeen,
  };
}

function routeMetric(rows, pathname) {
  const row = (Array.isArray(rows) ? rows : []).find((item) => clean(item?.pathname, 300) === pathname);
  return {
    pathname,
    observed: Boolean(row),
    views_30d: row ? finiteNumber(row.views_30d) : null,
    current_7d: row ? finiteNumber(row.current_7d) : null,
    previous_7d: row ? finiteNumber(row.previous_7d) : null,
    last_seen: row ? clean(row.last_seen, 120) || null : null,
  };
}

function metricFromDefinition(eventMap, definition) {
  return sumEvent(eventMap, definition.event, definition.flow ?? null);
}

function buildIntent(eventMap, routeRows, state) {
  const profile = sumEvent(eventMap, EVENTS.PROFILE_VIEWED);
  const bookingStarted = sumEvent(eventMap, EVENTS.BOOKING_STARTED);
  const paymentStarted = sumEvent(eventMap, EVENTS.PAYMENT_STARTED);
  const myMmdLoginStarted = sumEvent(eventMap, EVENTS.MY_MMD_LOGIN_STARTED);

  return {
    state,
    identity: IDENTITY_POLICY.intent_identity,
    person_conversion_scope: "client_only",
    funnels: {
      public_profile_to_booking_start: {
        spec: INTENT_FUNNELS.PUBLIC_PROFILE_TO_BOOKING_START,
        steps: [profile, bookingStarted],
        conversion_rate: null,
        note: "Step volumes are live; person conversion stays PostHog-native and is not inferred from raw counts.",
      },
      my_mmd_login_intent: {
        spec: INTENT_FUNNELS.MY_MMD_LOGIN_INTENT,
        steps: [routeMetric(routeRows, "/member/login"), myMmdLoginStarted],
        conversion_rate: null,
      },
      partner_entry_to_terms: {
        spec: INTENT_FUNNELS.PARTNER_ENTRY_TO_TERMS,
        steps: [routeMetric(routeRows, "/partner"), routeMetric(routeRows, "/partner/terms")],
        conversion_rate: null,
      },
    },
    standalone: {
      payment_started: paymentStarted,
      membership_entry: routeMetric(routeRows, "/member/membership"),
      mms_entry: routeMetric(routeRows, "/male-massage/home"),
      shop_entry: routeMetric(routeRows, "/mmd-shop"),
    },
  };
}

function buildTruth(eventMap, revenueRows, state) {
  const metrics = {};
  for (const [key, definition] of Object.entries(BUSINESS_TRUTH_METRICS)) {
    if (definition.aggregation === "sum") continue;
    metrics[key] = metricFromDefinition(eventMap, definition);
  }

  const revenue = Array.isArray(revenueRows) && revenueRows[0] ? revenueRows[0] : null;
  metrics.payment_verified_thb = {
    event: EVENTS.PAYMENT_VERIFIED,
    property: "amount_thb",
    currency: "THB",
    observed: Boolean(revenue && finiteNumber(revenue.verified_thb_30d) !== null),
    amount_30d: revenue ? finiteNumber(revenue.verified_thb_30d) : null,
    payments_30d: revenue ? finiteNumber(revenue.payments_30d) : null,
    current_7d: revenue ? finiteNumber(revenue.current_7d) : null,
    previous_7d: revenue ? finiteNumber(revenue.previous_7d) : null,
    last_seen: revenue ? clean(revenue.last_seen, 120) || null : null,
  };

  return {
    state,
    identity: IDENTITY_POLICY.business_truth_identity,
    cross_layer_person_join: IDENTITY_POLICY.cross_layer_person_join,
    metrics,
    lanes: LANES,
    note: "Server authority truth is shown as counts/revenue/trends, not joined to browser people.",
  };
}

function buildHealth(rows, state) {
  const observed = new Map((Array.isArray(rows) ? rows : []).map((row) => [clean(row?.authority, 120), row]));
  const authorities = OPERATIONAL_HEALTH.required_authorities.map((authority) => {
    const row = observed.get(authority);
    return {
      authority,
      healthy: Boolean(row),
      events_24h: row ? finiteNumber(row.events_24h) : null,
      last_seen: row ? clean(row.last_seen, 120) || null : null,
    };
  });
  const healthy = authorities.filter((item) => item.healthy).length;
  return {
    state,
    required: authorities.length,
    healthy,
    status: state === "connected" && healthy === authorities.length ? "ok" : state === "connected" ? "degraded" : "unknown",
    authorities,
  };
}

export async function buildOwnerAnalyticsDashboard(env = {}) {
  const config = posthogConfig(env);
  const readConfigured = Boolean(config.apiKey);
  if (!readConfigured) {
    return {
      ok: true,
      schema: OWNER_DASHBOARD.schema,
      analytics_schema: ANALYTICS_SCHEMA,
      generated_at: new Date().toISOString(),
      window_days: OWNER_DASHBOARD.default_window_days,
      compare_days: OWNER_DASHBOARD.compare_days,
      read_only: true,
      source: "posthog",
      project_id: config.projectId,
      state: "read_scope_missing",
      intent: buildIntent(new Map(), [], "read_scope_missing"),
      business_truth: buildTruth(new Map(), [], "read_scope_missing"),
      operational_health: buildHealth([], "read_scope_missing"),
      guardrails: {
        cross_layer_person_conversion: false,
        no_zero_fill_for_unobserved_events: true,
        no_business_truth_mutation: true,
        posthog_ingest_token_never_used_for_reads: true,
      },
    };
  }

  const [eventResult, routeResult, healthResult, revenueResult] = await Promise.all([
    posthogHogql(env, eventSummaryQuery()),
    posthogHogql(env, routeSummaryQuery()),
    posthogHogql(env, healthQuery()),
    posthogHogql(env, revenueQuery()),
  ]);

  const eventMap = indexEventRows(eventResult.rows);
  const connectedParts = [eventResult, routeResult, healthResult].filter((item) => item.ok).length;
  const state = connectedParts === 3 ? "connected" : connectedParts > 0 ? "partial" : eventResult.state || "query_unavailable";

  return {
    ok: true,
    schema: OWNER_DASHBOARD.schema,
    analytics_schema: ANALYTICS_SCHEMA,
    generated_at: new Date().toISOString(),
    window_days: OWNER_DASHBOARD.default_window_days,
    compare_days: OWNER_DASHBOARD.compare_days,
    read_only: true,
    source: "posthog",
    project_id: config.projectId,
    state,
    intent: buildIntent(eventMap, routeResult.rows, eventResult.ok && routeResult.ok ? "connected" : "partial"),
    business_truth: buildTruth(eventMap, revenueResult.rows, eventResult.ok ? "connected" : "partial"),
    operational_health: buildHealth(healthResult.rows, healthResult.ok ? "connected" : "partial"),
    diagnostics: {
      event_query: eventResult.state,
      route_query: routeResult.state,
      health_query: healthResult.state,
      revenue_query: revenueResult.state,
    },
    guardrails: {
      cross_layer_person_conversion: false,
      no_zero_fill_for_unobserved_events: true,
      no_business_truth_mutation: true,
      posthog_ingest_token_never_used_for_reads: true,
    },
  };
}

export const __ownerAnalyticsTest = Object.freeze({
  eventSummaryQuery,
  routeSummaryQuery,
  healthQuery,
  revenueQuery,
  indexEventRows,
  sumEvent,
  buildIntent,
  buildTruth,
  buildHealth,
});
