const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS = 4000;
const MIN_AIRTABLE_REQUEST_TIMEOUT_MS = 500;
const MAX_AIRTABLE_REQUEST_TIMEOUT_MS = 10000;

const CLEARABLE_SESSION_FIELDS = new Set([
  "route_after_liff",
  "payment_intent_session_id",
  "signed_route_token_hash",
]);

const TABLE_DEFAULTS = Object.freeze({
  RENEWAL_SESSIONS: "MMD — LIFF Renewal Sessions",
  FLOW_SCREENS: "MMD — LIFF Flow Screens",
  HYPE_LANE_DECISIONS: "MMD — HYPE Lane Decisions",
  MODEL_SERVICE_AUDIENCE: "MMD — Model Service Audience",
  NON_GAY_PACKAGE_RULES: "MMD — Non-Gay Package Rules",
});

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
  "/member/membership",
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
    const fields = compactFields({
      renewal_session_id: session.session_id,
      liff_intent: session.liff_intent,
      source_channel: session.source_channel,
      hype_decision_status: session.hype_decision_status,
      hall_audience_context: session.hall_audience_context,
      model_visibility_mode: session.model_visibility_mode,
      pricing_lane: session.pricing_lane,
      payment_intent_session_id: session.payment_intent_session_id,
      route_after_liff: session.route_after_liff,
      signed_route_token_hash: session.signed_route_token_hash,
    }, { preserveNullKeys: recordId ? CLEARABLE_SESSION_FIELDS : undefined });
    const table = tableName(this.env, "LIFF_RENEWAL_SESSIONS");
    const record = recordId
      ? await this.write("PATCH", table, { recordId, body: { fields } })
      : await this.write("POST", table, { body: { fields } });
    const resolvedId = String(record?.id || "").trim();
    if (!resolvedId) throw new LiffGatewayStorageError("LIFF_GATEWAY_STORAGE_MALFORMED");
    return { record_id: resolvedId };
  }

  async recordDecision(decision) {
    const renewalSessionId = String(decision.liff_session_id || "").trim();
    if (!renewalSessionId) throw new LiffGatewayStorageError("LIFF_GATEWAY_SESSION_INVALID");

    const sessionRecords = await this.list(tableName(this.env, "LIFF_RENEWAL_SESSIONS"), {
      filterByFormula: `{renewal_session_id}=${formulaString(renewalSessionId)}`,
      maxRecords: 2,
    });
    if (sessionRecords.length !== 1 || !String(sessionRecords[0]?.id || "").trim()) {
      throw new LiffGatewayStorageError("LIFF_GATEWAY_STORAGE_MALFORMED");
    }

    const packageContext = HYPE_PACKAGE_CONTEXTS.has(String(decision.pricing_lane || "").trim())
      ? String(decision.pricing_lane).trim()
      : undefined;
    const routeTarget = HYPE_ROUTE_TARGETS.has(String(decision.route_after_liff || "").trim())
      ? String(decision.route_after_liff).trim()
      : undefined;
    const fields = compactFields({
      decision_id: `hype_lane_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      "LINE Renewal Session": [String(sessionRecords[0].id).trim()],
      source_channel: "line_liff",
      source_path: "/member/liff",
      hall_audience_context: decision.hall_audience_context,
      model_visibility_mode: decision.model_visibility_mode,
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

  async list(table, { filterByFormula, maxRecords } = {}) {
    const record = await this.write("GET", table, { query: { filterByFormula, maxRecords } });
    return Array.isArray(record?.records) ? record.records : [];
  }

  async write(method, table, { recordId = "", body, query } = {}) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(String(this.env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`);
    if (query?.filterByFormula) url.searchParams.set("filterByFormula", query.filterByFormula);
    if (query?.maxRecords) url.searchParams.set("maxRecords", String(query.maxRecords));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), airtableRequestTimeoutMs(this.env));
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

function airtableRequestTimeoutMs(env) {
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
  const pricingLane = String(fields.pricing_lane || "").trim();
  const amountThb = numberField(fields.price_thb);
  const durationDays = numberField(fields.duration_days);
  const pointsAfterVerification = numberField(fields.points_granted);
  const requiresManualReview = Boolean(fields.requires_manual_review) || pricingLane === "blackcard_25000" || requestedCode === "blackcard";
  if (!PRICING_LANES.has(pricingLane) || !Number.isInteger(amountThb) || amountThb < 0 || amountThb > 250000 || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3660 || !Number.isInteger(pointsAfterVerification) || pointsAfterVerification < 0 || pointsAfterVerification > 100000) return null;
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
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

export const LIFF_GATEWAY_ROUTES = ROUTES;
