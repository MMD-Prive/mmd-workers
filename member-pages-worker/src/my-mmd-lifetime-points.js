import { readMemberAppSession } from "./member-app-api.js";
import { readMemberHistoryRecoveryStatus } from "./member-history-recovery.js";
import {
  lifetimePointsFromPreload,
  readMemberHistoryPreload,
} from "./member-history-preload.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const MEMBERS_TABLE = "tblgWc5VRon5o8Mhk";
const POINTS_LEDGER_TABLE = "tbl5dfnwjUFMLbnWL";
const MAX_RECORDS = 2000;
const TIMEOUT_MS = 8000;
const POLICY = "mmd_points_lifetime_total_phase1";

const ELIGIBLE_PATHS = new Set([
  "/api/member/app/points",
  "/api/member/app/points/",
  "/api/member/app/dashboard",
  "/api/member/app/dashboard/",
  "/api/member/app/profile",
  "/api/member/app/profile/",
  "/api/member/dashboard",
  "/api/member/dashboard/",
  "/member/api/liff/profile",
  "/member/api/liff/profile/",
]);

export function isMyMmdLifetimePointsPath(requestOrUrl) {
  let url;
  try {
    url = requestOrUrl instanceof URL
      ? requestOrUrl
      : new URL(requestOrUrl instanceof Request ? requestOrUrl.url : String(requestOrUrl));
  } catch {
    return false;
  }
  return ELIGIBLE_PATHS.has(url.pathname);
}

export async function prepareMyMmdLifetimePointsContext(request, env = {}) {
  if (!(request instanceof Request) || request.method !== "GET" || !isMyMmdLifetimePointsPath(request)) return null;
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return null;
  const session = await readMemberAppSession(request, env);
  if (!session?.memberId || !session?.lineUserId) return null;

  try {
    try {
      const preload = await readMemberHistoryPreload(env, session.lineUserId);
      const preloadedPoints = lifetimePointsFromPreload(preload, session.memberId);
      if (preloadedPoints) {
        const recoveryState = preload.projection?.history_backfill_status === "reconciled"
          ? "reconciled"
          : "review_required";
        return { ...preloadedPoints, recoveryState, pointsRecoveryPending: false };
      }
    } catch (error) {
      console.warn({ event: "my_mmd_points_preload_lookup_failed", failure_class: safeFailure(error) });
    }

    const recoveryStatus = await readMemberHistoryRecoveryStatus(env, session.lineUserId);
    const recoveryState = normalizeToken(recoveryStatus?.state);
    if (["checking", "in_progress"].includes(recoveryState)) {
      return { state: "checking", recoveryState, pointsRecoveryPending: true };
    }
    if (recoveryState === "blocked") {
      return { state: "blocked", recoveryState, pointsRecoveryPending: false };
    }

    const member = await resolveMember(env, session.memberId);
    if (!member) return null;
    const formula = pointsFormula(member.memberId, member.email);
    if (!formula) return null;
    const records = await airtableList(env, env.AIRTABLE_TABLE_POINTS_LEDGER || POINTS_LEDGER_TABLE, {
      filterByFormula: formula,
      maxRecords: MAX_RECORDS,
    });
    return {
      ...summarizeLifetimePoints(records),
      recoveryState: normalizeToken(recoveryStatus?.state) || null,
      pointsRecoveryPending: false,
    };
  } catch (error) {
    console.warn({ event: "my_mmd_lifetime_points_lookup_failed", failure_class: safeFailure(error) });
    return null;
  }
}

export async function applyMyMmdLifetimePointsResponse(request, response, context) {
  if (!(response instanceof Response) || !context || !response.ok || !isMyMmdLifetimePointsPath(request)) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object") return response;
  const path = new URL(request.url).pathname;
  const patched = patchLifetimePointsPayload(path, payload, context);
  if (JSON.stringify(patched) === JSON.stringify(payload)) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-points-policy", POLICY);
  return new Response(JSON.stringify(patched), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function summarizeLifetimePoints(records = []) {
  const seen = new Set();
  let earnedTotal = 0;
  let redeemedTotal = 0;
  let balance = 0;
  let recordsCount = 0;

  for (const record of Array.isArray(records) ? records : []) {
    const fields = record?.fields || {};
    const status = normalizeToken(fields.transaction_status || fields.status);
    if (!["posted", "completed", "verified"].includes(status)) continue;
    if (fields.reversed_at || status === "reversed") continue;
    const dedupeKey = clean(fields.idempotency_key || fields.logical_source_id || fields.transaction_id || fields.source_event_id || fields.service_event_id || fields.session_id || record?.id);
    if (dedupeKey && seen.has(dedupeKey)) continue;
    if (dedupeKey) seen.add(dedupeKey);
    const points = pointsValue(fields);
    if (points === null) continue;
    recordsCount += 1;
    balance += points;
    if (points >= 0) earnedTotal += points;
    else redeemedTotal += Math.abs(points);
  }

  return {
    state: "resolved",
    confirmedBalance: Math.max(0, Math.trunc(balance)),
    earnedTotal: Math.max(0, Math.trunc(earnedTotal)),
    redeemedTotal: Math.max(0, Math.trunc(redeemedTotal)),
    recordsCount,
    currencyLabel: "MMD Points",
    pointsExpire: false,
    expiryPolicy: "none_phase1",
    nearestExpiry: null,
    expiringPoints: 0,
    policy: POLICY,
  };
}

export function patchLifetimePointsPayload(path, payload, summary) {
  if (summary?.pointsRecoveryPending === true || ["checking", "in_progress"].includes(normalizeToken(summary?.recoveryState))) {
    return patchPendingLifetimePointsPayload(path, payload);
  }
  if (normalizeToken(summary?.recoveryState) === "blocked" || summary?.state === "blocked") {
    return patchBlockedLifetimePointsPayload(path, payload);
  }

  const safeSummary = {
    confirmedBalance: summary.confirmedBalance,
    earnedTotal: summary.earnedTotal,
    redeemedTotal: summary.redeemedTotal,
    currencyLabel: "MMD Points",
    recordsCount: summary.recordsCount,
    pointsExpire: false,
    expiryPolicy: "none_phase1",
    nearestExpiry: null,
    expiringPoints: 0,
    lifetimeServiceSpendThb: money(summary.lifetimeServiceSpendThb),
    serviceSpend365dThb: money(summary.serviceSpend365dThb),
    completedServiceCount: nonNegativeInt(summary.completedServiceCount),
  };

  if (/^\/api\/member\/app\/points\/?$/.test(path)) {
    const current = isObject(payload.summary) ? payload.summary : {};
    return {
      ...payload,
      state: "resolved",
      summary: { ...current, ...safeSummary },
      pointsPolicy: { expires: false, mode: "lifetime_total", phase: 1 },
    };
  }

  if (/^\/api\/member\/app\/dashboard\/?$/.test(path)) {
    const current = isObject(payload.points) ? payload.points : {};
    return {
      ...payload,
      points: { ...current, ...safeSummary },
      pointsRecoveryPending: false,
      pointsPolicy: { expires: false, mode: "lifetime_total", phase: 1 },
    };
  }

  if (/^\/api\/member\/app\/profile\/?$/.test(path)) {
    return {
      ...payload,
      points_confirmed: summary.confirmedBalance,
      points_records_count: summary.recordsCount,
      lifetime_service_spend_thb: money(summary.lifetimeServiceSpendThb),
      service_spend_365d_thb: money(summary.serviceSpend365dThb),
      completed_service_count: nonNegativeInt(summary.completedServiceCount),
      points_expire: false,
      points_policy: "lifetime_total_phase1",
    };
  }

  if (/^\/api\/member\/dashboard\/?$/.test(path)) {
    const data = isObject(payload.data) ? payload.data : {};
    const points = isObject(data.points) ? data.points : {};
    return {
      ...payload,
      data: {
        ...data,
        points: {
          ...points,
          status: "verified",
          value: summary.confirmedBalance,
          active_points: summary.confirmedBalance,
          records_count: summary.recordsCount,
          expiring_points: 0,
          nearest_expiry: null,
          expiry_policy: "none_phase1",
          lifetime_service_spend_thb: money(summary.lifetimeServiceSpendThb),
          service_spend_365d_thb: money(summary.serviceSpend365dThb),
          completed_service_count: nonNegativeInt(summary.completedServiceCount),
        },
      },
    };
  }

  if (/^\/member\/api\/liff\/profile\/?$/.test(path)) {
    const data = isObject(payload.data) ? payload.data : {};
    const customer360 = isObject(data.customer_360) ? data.customer_360 : {};
    const points = isObject(customer360.points) ? customer360.points : {};
    return {
      ...payload,
      data: {
        ...data,
        points: summary.confirmedBalance,
        points_records_count: summary.recordsCount,
        lifetime_service_spend_thb: money(summary.lifetimeServiceSpendThb),
        service_spend_365d_thb: money(summary.serviceSpend365dThb),
        completed_service_count: nonNegativeInt(summary.completedServiceCount),
        points_expire: false,
        points_policy: "lifetime_total_phase1",
        customer_360: {
          ...customer360,
          points: {
            ...points,
            status: "verified",
            active_points: summary.confirmedBalance,
            records_count: summary.recordsCount,
            expiring_points: 0,
            nearest_expiry: null,
            expiry_policy: "none_phase1",
            lifetime_service_spend_thb: money(summary.lifetimeServiceSpendThb),
            service_spend_365d_thb: money(summary.serviceSpend365dThb),
            completed_service_count: nonNegativeInt(summary.completedServiceCount),
          },
        },
      },
    };
  }

  return payload;
}

function patchPendingLifetimePointsPayload(path, payload) {
  if (/^\/api\/member\/app\/points\/?$/.test(path)) {
    return {
      ...payload,
      state: "checking",
      summary: {
        ...(isObject(payload.summary) ? payload.summary : {}),
        confirmedBalance: null,
        earnedTotal: null,
        redeemedTotal: null,
      },
      pointsRecoveryPending: true,
    };
  }
  if (/^\/api\/member\/app\/dashboard\/?$/.test(path)) {
    return {
      ...payload,
      points: {
        ...(isObject(payload.points) ? payload.points : {}),
        confirmedBalance: null,
        earnedTotal: null,
        redeemedTotal: null,
      },
      pointsRecoveryPending: true,
    };
  }
  if (/^\/api\/member\/app\/profile\/?$/.test(path)) {
    return { ...payload, points_confirmed: null, points_records_count: null, points_recovery_pending: true };
  }
  if (/^\/api\/member\/dashboard\/?$/.test(path)) {
    const data = isObject(payload.data) ? payload.data : {};
    return {
      ...payload,
      data: {
        ...data,
        points: {
          ...(isObject(data.points) ? data.points : {}),
          status: "checking",
          value: null,
          active_points: null,
        },
      },
    };
  }
  if (/^\/member\/api\/liff\/profile\/?$/.test(path)) {
    const data = isObject(payload.data) ? payload.data : {};
    const customer360 = isObject(data.customer_360) ? data.customer_360 : {};
    return {
      ...payload,
      data: {
        ...data,
        points: null,
        points_records_count: null,
        points_recovery_pending: true,
        customer_360: {
          ...customer360,
          points: {
            ...(isObject(customer360.points) ? customer360.points : {}),
            status: "checking",
            active_points: null,
          },
        },
      },
    };
  }
  return payload;
}

function patchBlockedLifetimePointsPayload(path, payload) {
  if (/^\/api\/member\/app\/dashboard\/?$/.test(path)) {
    return {
      ...payload,
      points: {
        ...(isObject(payload.points) ? payload.points : {}),
        confirmedBalance: null,
        earnedTotal: null,
        redeemedTotal: null,
      },
      pointsRecoveryPending: false,
      pointsRecoveryState: "blocked",
    };
  }
  if (/^\/api\/member\/app\/points\/?$/.test(path)) {
    return {
      ...payload,
      state: "checking",
      summary: {
        ...(isObject(payload.summary) ? payload.summary : {}),
        confirmedBalance: null,
        earnedTotal: null,
        redeemedTotal: null,
      },
      pointsRecoveryPending: false,
      pointsRecoveryState: "blocked",
    };
  }
  return payload;
}

async function resolveMember(env, memberId) {
  const rows = await airtableList(env, env.AIRTABLE_TABLE_MEMBERS || MEMBERS_TABLE, {
    filterByFormula: `{member_id}=${formulaString(memberId)}`,
    maxRecords: 2,
  });
  if (rows.length !== 1) return null;
  const fields = rows[0].fields || {};
  const canonicalMemberId = clean(fields.member_id || memberId);
  if (!canonicalMemberId) return null;
  return {
    memberId: canonicalMemberId,
    email: normalizeEmail(fields["Contact Email"] || fields.email),
  };
}

function pointsFormula(memberId, email) {
  const clauses = [];
  if (memberId) clauses.push(`{member_id}=${formulaString(memberId)}`);
  if (email) clauses.push(`LOWER({member_email}&"")=${formulaString(email)}`);
  if (!clauses.length) return "";
  return clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
}

async function airtableList(env, table, { filterByFormula = "", maxRecords = MAX_RECORDS } = {}) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
    url.searchParams.set("pageSize", String(Math.min(100, Math.max(1, maxRecords - records.length))));
    if (offset) url.searchParams.set("offset", offset);
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
      records.push(...payload.records.slice(0, maxRecords - records.length));
      offset = clean(payload.offset);
    } finally {
      clearTimeout(timeout);
    }
  } while (offset && records.length < maxRecords);
  return records;
}

function pointsValue(fields = {}) {
  const explicit = Number(fields.points);
  if (Number.isFinite(explicit)) return Math.trunc(explicit);
  const amount = Number(fields.eligible_amount_thb ?? fields.amount_thb);
  return Number.isFinite(amount) ? Math.floor(amount / 100) : null;
}

function formulaString(value) {
  return `'${clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeToken(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function safeFailure(error) {
  return clean(error?.code || error?.message || "unavailable").replace(/[^A-Za-z0-9_:-]/g, "_").slice(0, 80) || "unavailable";
}
