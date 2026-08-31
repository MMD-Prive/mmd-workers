const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS = 7000;
const MIN_AIRTABLE_REQUEST_TIMEOUT_MS = 500;
const MAX_AIRTABLE_REQUEST_TIMEOUT_MS = 10000;
const CANONICAL_MEMBER_ROUTE = "/sigil/member/membership";
const AIRTABLE_MEMBER_ROUTE = "/member/membership";

const CLEARABLE_SESSION_FIELDS = new Set([
  "route_after_liff",
  "payment_intent_session_id",
  "signed_route_token_hash",
]);

const TABLE_DEFAULTS = Object.freeze({
  RENEWAL_SESSIONS: "tblXjQFwo0A2cHseh",
  FLOW_SCREENS: "tbl1g1uRkvLg5NdM1",
  HYPE_LANE_DECISIONS: "tblvUnooDYwVsHY91",
  MODEL_SERVICE_AUDIENCE: "tbluxhFpAAu6yY9mp",
  NON_GAY_PACKAGE_RULES: "tble4VuGT9gPsJ2Sh",
});

const LIFF_INTENTS = new Set(["signup", "renew", "status", "promo", "hall", "continue_payment", "unknown"]);
const SOURCE_CHANNELS = new Set(["telegram_preview", "line_oa", "line_liff", "web_promotion", "member_page", "admin_console", "unknown"]);
const HYPE_DECISION_STATUSES = new Set(["not_started", "asking_intent", "asking_audience", "decided", "manual_review", "blocked", "completed"]);
const HALL_AUDIENCES = new Set(["female_view", "lgbt_view", "manual_review", "unknown"]);
const MODEL_VISIBILITY_MODES = new Set(["show_female_profiles", "show_lgbt_profiles", "manual_review_only", "hold_until_selected"]);
const RENEWAL_FLOW_STATUSES = new Set([
  "started",
  "identity_linked",
  "legacy_match_found",
  "legacy_match_needs_review",
  "member_id_pending",
  "profile_preview_ready",
  "renewal_pending_payment",
  "payment_proof_uploaded",
  "renewal_pending_review",
  "renewal_verified",
  "materialized",
  "blocked",
  "cancelled",
  "error",
]);

const SCREEN_KEYS = new Set([
  "start_intent",
  "audience_select",
  "signup_package",
  "renew_member_lookup",
  "payment_start",
  "hall_route",
  "manual_review",
  "status_result",
]);

const PRICING_LANES = new Set([
  "standard_1199",
  "premium_2999",
  "blackcard_25000",
  "gay_extreme_900",
  "believe_member_2999",
  "special_review",
  "unknown",
]);

const HYPE_PACKAGE_CONTEXTS = new Set([
  "believe_member_2999",
  "special_review",
  "unknown",
]);

const HYPE_ROUTE_TARGETS = new Set([
  "/hall",
  "/believe/inme",
  "manual_review",
]);

const ROUTES = new Set([
  CANONICAL_MEMBER_ROUTE,
  "/member/payments",
  "/member/dashboard",
  "/hall",
  "/member/promotion",
  "manual_review",
]);

export class LiffGatewayStorageError extends Error {
  constructor(code = "LIFF_GATEWAY_STORAGE_UNAVAILABLE") {
    super(code);
    this.code = code;
  }
}

export function getLiffGatewayStore(env = {}) {
  if (isTestStore(env.LIFF_GATEWAY_STORE)) return env.LIFF_GATEWAY_STORE;
  if (!hasAirtableBindings(env)) return null;
  return new AirtableLiffGatewayStore(env);
}

export function hasLiffGatewayStore(env = {}) {
  return Boolean(getLiffGatewayStore(env));
}

class AirtableLiffGatewayStore {
  constructor(env) {
    this.env = env;
  }

  async upsertSession(session, recordId = "") {
    const renewalSessionId = String(session.session_id || "").trim();
    if (!renewalSessionId) throw new LiffGatewayStorageError("LIFF_GATEWAY_SESSION_INVALID");
    const fields = compactFields({
      renewal_session_id: renewalSessionId,
      ...(recordId ? {} : {
        line_user_id: lineSubject(session.line_user_id),
        renewal_flow_status: selectValue(session.renewal_flow_status, RENEWAL_FLOW_STATUSES),
        verified_at: verifiedTimestamp(session.verified_at),
      }),
      liff_intent: selectValue(session.liff_intent, LIFF_INTENTS),
      source_channel: selectValue(session.source_channel, SOURCE_CHANNELS),
      hype_decision_status: selectValue(session.hype_decision_status, HYPE_DECISION_STATUSES),
      hall_audience_context: selectValue(session.hall_audience_context, HALL_AUDIENCES),
      model_visibility_mode: selectValue(session.model_visibility_mode, MODEL_VISIBILITY_MODES),
      pricing_lane: selectValue(session.pricing_lane, PRICING_LANES),
      payment_intent_session_id: session.payment_intent_session_id,
      route_after_liff: airtableSessionRoute(session.route_after_liff),
      signed_route_token_hash: session.signed_route_token_hash,
      campaign_code: session.campaign_code,
      campaign_claim_id: session.campaign_claim_id,
      promo_code: session.promo_code,
      promo_status: session.promo_status,
    }, { preserveNullKeys: recordId ? CLEARABLE_SESSION_FIELDS : undefined });
    const table = tableName(this.env, "LIFF_RENEWAL_SESSIONS");
    const record = recordId
      ? await this.write("PATCH", table, { recordId, body: { fields } })
      : await this.write("POST", table, { body: { fields } });
    const resolvedId = String(record?.id || "").trim();
    if (!resolvedId) throw new LiffGatewayStorageError("LIFF_GATEWAY_STORAGE_MALFORMED");
    return { record_id: resolvedId };
  }

  async resolveMembershipReview(lineUserId) {
    const subject = lineSubject(lineUserId);
    if (!subject) throw new LiffGatewayStorageError("LIFF_MEMBERSHIP_REVIEW_IDENTITY_INVALID");
    const records = await this.list(tableName(this.env, "LIFF_RENEWAL_SESSIONS"), {
      filterByFormula: `{line_user_id}=${formulaString(subject)}`,
      maxRecords: 2,
      sort: [{ field: "verified_at", direction: "desc" }],
    });
    if (!records.length) return membershipReview(false, "none", "none");
    const latest = records[0]?.fields;
    if (!latest || typeof latest !== "object") throw new LiffGatewayStorageError("LIFF_MEMBERSHIP_REVIEW_MALFORMED");
    const latestVerifiedAt = verifiedTimestamp(latest.verified_at);
    if (!latestVerifiedAt || (records.length > 1 && latestVerifiedAt === verifiedTimestamp(records[1]?.fields?.verified_at))) {
      throw new LiffGatewayStorageError("LIFF_MEMBERSHIP_REVIEW_AMBIGUOUS");
    }
    const sourceState = String(latest.renewal_flow_status || "").trim();
    return normalizeMembershipReview(sourceState);
  }

  async recordDecision(decision) {
    const renewalSessionId = String(decision.liff_session_id || "").trim();
    if (!renewalSessionId) throw new LiffGatewayStorageError("LIFF_GATEWAY_SESSION_INVALID");
    const hallAudienceContext = selectValue(decision.hall_audience_context, HALL_AUDIENCES);
    const modelVisibilityMode = selectValue(decision.model_visibility_mode, MODEL_VISIBILITY_MODES);
    const pricingLane = selectValue(decision.pricing_lane, PRICING_LANES);
    const routeAfterLiff = selectValue(decision.route_after_liff, ROUTES);

    const sessionRecords = await this.list(tableName(this.env, "LIFF_RENEWAL_SESSIONS"), {
      filterByFormula: `{renewal_session_id}=${formulaString(renewalSessionId)}`,
      maxRecords: 2,
    });
    if (sessionRecords.length !== 1 || !String(sessionRecords[0]?.id || "").trim()) {
      throw new LiffGatewayStorageError("LIFF_GATEWAY_STORAGE_MALFORMED");
    }

    const packageContext = HYPE_PACKAGE_CONTEXTS.has(pricingLane)
      ? pricingLane
      : undefined;
    const routeTarget = HYPE_ROUTE_TARGETS.has(routeAfterLiff)
      ? routeAfterLiff
      : undefined;
    const fields = compactFields({
      decision_id: `hype_lane_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      "LINE Renewal Session": [String(sessionRecords[0].id).trim()],
      source_channel: "line_liff",
      source_path: CANONICAL_MEMBER_ROUTE,
      hall_audience_context: hallAudienceContext,
      model_visibility_mode: modelVisibilityMode,
      package_context: packageContext,
      route_target: routeTarget,
    });
    await this.write("POST", tableName(this.env, "HYPE_LANE_DECISIONS"), { body: { fields } });
  }

  async loadScreen(screenKey) {
    if (!SCREEN_KEYS.has(screenKey)) return null;
    const records = await this.list(tableName(this.env, "FLOW_SCREENS"), {
      filterByFormula: `{screen_key}=${formulaString(screenKey)}`,
      maxRecords: 1,
    });
    // Production Flow Screens are metadata/risk-guard records. Customer copy and
    // button labels remain server-owned, so Airtable text is never returned as a
    // renderable screen from this adapter.
    return sanitizeScreenRecord(records[0]?.fields, screenKey);
  }

  async resolvePackage(packageCode) {
    const normalized = normalizePackageCode(packageCode);
    if (!normalized) return null;
    const records = await this.list(tableName(this.env, "NON_GAY_PACKAGE_RULES"), {
      filterByFormula: `{package_rule_code}=${formulaString(normalized)}`,
      maxRecords: 2,
    });
    if (records.length !== 1) return null;
    return sanitizePackageRecord(records[0]?.fields, normalized);
  }

  async hasHallAudienceInventory(audienceContext) {
    const field = audienceContext === "female_view"
      ? "show_profile_to_female"
      : audienceContext === "lgbt_view"
        ? "show_profile_to_lgbt"
        : "";
    if (!field) return false;
    const records = await this.list(tableName(this.env, "MODEL_SERVICE_AUDIENCE"), {
      filterByFormula: `AND({hall_public_model_group}=${formulaString("publux_model")}, {${field}}=TRUE())`,
      maxRecords: 1,
    });
    return records.length === 1;
  }

  async list(table, { filterByFormula, maxRecords, sort } = {}) {
    const record = await this.write("GET", table, { query: { filterByFormula, maxRecords, sort } });
    return Array.isArray(record?.records) ? record.records : [];
  }

  async write(method, table, { recordId = "", body, query } = {}) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(String(this.env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`);
    if (query?.filterByFormula) url.searchParams.set("filterByFormula", query.filterByFormula);
    if (query?.maxRecords) url.searchParams.set("maxRecords", String(query.maxRecords));
    for (const [index, item] of (Array.isArray(query?.sort) ? query.sort : []).entries()) {
      url.searchParams.set(`sort[${index}][field]`, String(item?.field || ""));
      url.searchParams.set(`sort[${index}][direction]`, item?.direction === "asc" ? "asc" : "desc");
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), liffGatewayAirtableTimeoutMs(this.env));
    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.env.AIRTABLE_API_KEY}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object") {
        throw new LiffGatewayStorageError(response.status === 401 || response.status === 403 ? "LIFF_GATEWAY_STORAGE_FORBIDDEN" : "LIFF_GATEWAY_STORAGE_UNAVAILABLE");
      }
      return payload;
    } catch (error) {
      const code = error instanceof LiffGatewayStorageError ? error.code : "LIFF_GATEWAY_STORAGE_UNAVAILABLE";
      console.warn({
        event: "liff_gateway_airtable_failure",
        operation: method,
        failure_class: error?.name === "AbortError" ? "timeout" : code === "LIFF_GATEWAY_STORAGE_FORBIDDEN" ? "forbidden" : "storage_unavailable",
        duration_ms: Math.max(0, Date.now() - startedAt),
      });
      if (error instanceof LiffGatewayStorageError) throw error;
      throw new LiffGatewayStorageError();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isTestStore(value) {
  return Boolean(value
    && typeof value.upsertSession === "function"
    && typeof value.recordDecision === "function"
    && typeof value.loadScreen === "function"
    && typeof value.resolvePackage === "function"
    && typeof value.hasHallAudienceInventory === "function");
}

function hasAirtableBindings(env) {
  return Boolean(String(env.AIRTABLE_API_KEY || "").trim() && String(env.AIRTABLE_BASE_ID || "").trim());
}

function tableName(env, key) {
  return String(env[`AIRTABLE_TABLE_${key}`] || TABLE_DEFAULTS[key] || TABLE_DEFAULTS[key.replace(/^LIFF_/, "")] || "").trim();
}

function compactFields(fields, { preserveNullKeys } = {}) {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => {
    if (value === undefined || value === "") return false;
    // Airtable clears an existing field when PATCH receives null. Only the
    // session fields whose lifecycle explicitly supports clearing retain it.
    return value !== null || preserveNullKeys?.has(key);
  }));
}

function selectValue(value, allowed) {
  if (value === undefined || value === null || value === "") return value;
  const normalized = String(value).trim();
  if (!allowed.has(normalized)) throw new LiffGatewayStorageError("LIFF_GATEWAY_SCHEMA_MISMATCH");
  return normalized;
}

function airtableSessionRoute(value) {
  const route = selectValue(value, ROUTES);
  return route === CANONICAL_MEMBER_ROUTE ? AIRTABLE_MEMBER_ROUTE : route;
}

export function liffGatewayAirtableTimeoutMs(env = {}) {
  const configured = Number(env.AIRTABLE_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(configured)) return DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS;
  return Math.min(MAX_AIRTABLE_REQUEST_TIMEOUT_MS, Math.max(MIN_AIRTABLE_REQUEST_TIMEOUT_MS, configured));
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function normalizePackageCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(code) ? code : "";
}

function lineSubject(value) {
  const subject = String(value || "").trim();
  return /^U[0-9A-Za-z_-]{8,159}$/.test(subject) ? subject : "";
}

function verifiedTimestamp(value) {
  const timestamp = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)) return "";
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : "";
}

function membershipReview(exists, state, sourceState) {
  return {
    membership_review: { exists, state, authoritative: true },
    source_state: sourceState,
  };
}

function normalizeMembershipReview(sourceState) {
  if (!RENEWAL_FLOW_STATUSES.has(sourceState)) return membershipReview(true, "incomplete", sourceState || "unknown");
  if (sourceState === "legacy_match_needs_review") return membershipReview(true, "pending_application", sourceState);
  if (sourceState === "member_id_pending") return membershipReview(true, "approved_awaiting_member_creation", sourceState);
  if (["renewal_pending_payment", "payment_proof_uploaded", "renewal_pending_review"].includes(sourceState)) {
    return membershipReview(true, "pending_payment_review", sourceState);
  }
  if (["blocked", "cancelled"].includes(sourceState)) return membershipReview(true, "rejected", sourceState);
  if (sourceState === "error") return membershipReview(true, "incomplete", sourceState);
  return membershipReview(true, "none", sourceState);
}

function sanitizeScreenRecord(fields, screenKey) {
  if (!fields || typeof fields !== "object") return null;
  if (String(fields.screen_key || "").trim() !== screenKey) return null;
  const status = String(fields.status || "").trim().toLowerCase();
  if (status && status !== "active") return null;
  // The production schema contains headline/body/button text, backend_action,
  // next_route_default, and risk_guard. None are trusted as executable or
  // customer-authoritative output here. The gateway falls back to server-owned
  // screen copy/actions instead.
  return null;
}

function sanitizePackageRecord(fields, requestedCode) {
  if (!fields || typeof fields !== "object") return null;
  if (normalizePackageCode(fields.package_rule_code) !== requestedCode) return null;
  const pricingLane = String(fields.pricing_lane || "").trim();
  const amountThb = numberField(fields.price_thb);
  const durationDays = numberField(fields.duration_days);
  const pointsAfterVerification = numberField(fields.points_granted);
  if (typeof fields.requires_manual_review !== "boolean") return null;
  const requiresManualReview = fields.requires_manual_review;
  if (!HYPE_PACKAGE_CONTEXTS.has(pricingLane) || !Number.isInteger(amountThb) || amountThb < 0 || amountThb > 250000 || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3660 || !Number.isInteger(pointsAfterVerification) || pointsAfterVerification < 0 || pointsAfterVerification > 100000) return null;
  return {
    package_code: requestedCode,
    pricing_lane: pricingLane,
    amount_thb: amountThb,
    duration_days: durationDays,
    points_after_verification: pointsAfterVerification,
    requires_manual_review: requiresManualReview,
  };
}

function numberField(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : NaN;
}

export const LIFF_GATEWAY_ROUTES = ROUTES;
