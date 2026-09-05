import studioWorker from "./studio-real-worker.js";

const MODEL_SESSION_CURRENT_PATH = "/v1/model/session/current";
const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE = "tblC98mKWbzmPuNzX";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (path === MODEL_SESSION_CURRENT_PATH && method === "GET") {
      const upstream = await studioWorker.fetch(request, env, ctx);
      return projectModelCurrentResponse(upstream, env);
    }

    return studioWorker.fetch(request, env, ctx);
  },
};

export function sanitizeModelFinancePayload(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeModelFinancePayload(item));
  if (!value || typeof value !== "object") return value;

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenModelFinanceKey(key)) continue;
    output[key] = sanitizeModelFinancePayload(item);
  }
  return output;
}

export function projectModelFinancePayload(value, finance = { status: "checking" }) {
  const payload = sanitizeModelFinancePayload(value);
  const session = resolveSessionObject(payload);
  if (!session) return payload;

  if (finance?.status === "resolved" && safeMoney(finance.expected_payout_thb) !== null) {
    session.expected_payout_thb = safeMoney(finance.expected_payout_thb);
    session.payout_status = normalizePayoutStatus(finance.payout_status) || "expected";
  } else {
    session.payout_status = "checking";
  }

  return payload;
}

async function projectModelCurrentResponse(upstream, env) {
  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return upstream;

  const body = await upstream.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return upstream;

  let finance = { status: "checking" };
  if (upstream.ok && body.ok !== false) {
    const sessionId = sessionIdFromPayload(body);
    if (sessionId) finance = await findModelExpectedPayout(env, sessionId).catch(() => ({ status: "checking" }));
  }

  const projected = projectModelFinancePayload(body, finance);
  const headers = new Headers(upstream.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(projected), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function findModelExpectedPayout(env, sessionId) {
  if (!env?.AIRTABLE_API_KEY || !env?.AIRTABLE_BASE_ID) return { status: "checking" };

  const table = clean(env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE);
  const sessionFields = unique([
    clean(env.AT_SESSIONS__SESSION_ID),
    clean(env.AIRTABLE_SESSIONS_SESSION_ID_FIELD),
    "session_id",
    "Session ID",
  ]);

  for (const field of sessionFields) {
    const result = await airtableFindBySessionId(env, table, field, sessionId);
    if (result.schemaError) continue;
    if (!result.ok) return { status: "checking" };
    if (result.records.length !== 1) return { status: "checking" };

    const fields = result.records[0]?.fields || {};
    const expected = firstMoney(fields, unique([
      clean(env.AT_SESSIONS__MODEL_PAYOUT_AMOUNT_THB),
      "pay_model_thb",
    ]));
    if (expected === null) return { status: "checking" };

    const payoutStatus = firstText(fields, [
      clean(env.AT_SESSIONS__MODEL_PAYOUT_STATUS),
      "model_payout_status",
      "payout_status",
    ]);
    return {
      status: "resolved",
      expected_payout_thb: expected,
      payout_status: normalizePayoutStatus(payoutStatus) || "expected",
    };
  }

  return { status: "checking" };
}

async function airtableFindBySessionId(env, table, field, sessionId) {
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{${field}}="${escapeFormula(sessionId)}"`,
  });
  const response = await fetch(
    `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${params.toString()}`,
    { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` } },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = JSON.stringify(data || {});
    return {
      ok: false,
      schemaError: response.status === 422 || /unknown field|invalid.*field/i.test(detail),
      records: [],
    };
  }
  return { ok: true, schemaError: false, records: Array.isArray(data.records) ? data.records : [] };
}

function resolveSessionObject(payload) {
  if (payload?.session && typeof payload.session === "object" && !Array.isArray(payload.session)) return payload.session;
  if (payload?.data?.session && typeof payload.data.session === "object" && !Array.isArray(payload.data.session)) return payload.data.session;
  return null;
}

function sessionIdFromPayload(payload) {
  const session = resolveSessionObject(payload);
  return clean(session?.session_id || payload?.session_id || payload?.data?.session_id);
}

function isForbiddenModelFinanceKey(key) {
  const normalized = normalizeKey(key);
  if (["amount", "amount_thb", "total", "total_thb", "expected_payout_thb"].includes(normalized)) return true;
  return /(?:^|_)(?:payment_ref|provider(?:_|$)|slip(?:_|$)|bank(?:_|$)|margin(?:_|$)|commission(?:_|$)|settlement(?:_|$)|payout_evidence(?:_|$)|customer_(?:total|amount|charge|spend)|balance_due|remaining_balance|quoted_price|agreed_final_price|deposit(?:_|$)|pay_model(?:_|$)|model_payout_amount(?:_|$))/.test(normalized);
}

function normalizePayoutStatus(value) {
  const status = normalizeKey(value);
  return new Set(["expected", "pending", "pending_review", "verified", "paid", "hold", "checking"]).has(status) ? status : "";
}

function normalizeKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function firstMoney(fields, names) {
  for (const name of names) {
    if (!name || !Object.prototype.hasOwnProperty.call(fields, name)) continue;
    const value = safeMoney(fields[name]);
    if (value !== null) return value;
  }
  return null;
}

function firstText(fields, names) {
  for (const name of names) {
    if (!name || !Object.prototype.hasOwnProperty.call(fields, name)) continue;
    const value = clean(fields[name]);
    if (value) return value;
  }
  return "";
}

function safeMoney(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 100000000 ? number : null;
}

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePath(pathname = "") {
  const normalized = String(pathname || "/").replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/g, "") : normalized || "/";
}

function clean(value) {
  return String(value ?? "").trim();
}
