// MODEL_PAYOUT_DESTINATION_SELF_SERVICE
//
// After a model has acknowledged a job (model_ack_at set) they may submit where
// their own payout should be sent. The submission is stored on the canonical
// Models record as `pending`; staff verify it (account name vs registered name)
// and only a `verified` destination may ever produce a payout or a QR.
//
// Safety rules (see docs/MODEL_PAYOUT_AUTO_APPROVE_DESIGN.md):
//  - flag MODEL_PAYOUT_DESTINATION_ENABLED, default OFF
//  - same signed model confirmation token as /v1/confirm/ack; the model record is
//    resolved from the Session's Canonical Model link, never from the request body
//  - a changed destination resets verification to `pending`
//  - the full account reference is never returned, logged or put in an error message
//  - no money moves here; this only records and masks a destination
import { authorizeConfirmationRequest } from "./confirmation-ack.js";

export const PAYOUT_DEST_CONTEXT_PATH = "/v1/confirm/payout-destination/context";
export const PAYOUT_DEST_SUBMIT_PATH = "/v1/confirm/payout-destination";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_MODELS_TABLE = "tblI4B0bI446vp9GX";
const DEFAULT_SESSION_MODEL_ACK = "fldFgkHXivIAThfDz";
const DEFAULT_SESSION_CANONICAL_MODEL = "fldrXQAyOMPCvbOaY";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_TTL_SECONDS = 3600;

export const DESTINATION_TYPES = Object.freeze(["promptpay_phone", "promptpay_national_id", "bank_account"]);
const STATUS_PENDING = "pending";
const STATUS_VERIFIED = "verified";

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function withCors(request, env, response) {
  const origin = clean(request.headers.get("origin"), 500);
  const allowed = clean(env.ALLOWED_ORIGINS || "", 5000)
    .replace(/^['"]|['"]$/g, "")
    .split(",")
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  if (origin && allowed.includes(origin)) headers.set("access-control-allow-origin", origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function isDestinationEnabled(env = {}) {
  return clean(env.MODEL_PAYOUT_DESTINATION_ENABLED, 20).toLowerCase() === "true";
}

export function destinationFieldConfig(env = {}) {
  const config = {
    modelsTable: clean(env.AT_MODELS__TABLE || DEFAULT_MODELS_TABLE, 100),
    sessionModelAck: clean(env.AT_SESSIONS__MODEL_ACK_AT || DEFAULT_SESSION_MODEL_ACK, 100),
    sessionCanonicalModel: clean(env.AT_SESSIONS__CANONICAL_MODEL || DEFAULT_SESSION_CANONICAL_MODEL, 100),
    type: clean(env.AT_MODELS__PAYOUT_DEST_TYPE, 100),
    bank: clean(env.AT_MODELS__PAYOUT_DEST_BANK, 100),
    name: clean(env.AT_MODELS__PAYOUT_DEST_NAME, 100),
    ref: clean(env.AT_MODELS__PAYOUT_DEST_REF, 100),
    status: clean(env.AT_MODELS__PAYOUT_DEST_STATUS, 100),
    submittedAt: clean(env.AT_MODELS__PAYOUT_DEST_SUBMITTED_AT, 100),
    verifiedBy: clean(env.AT_MODELS__PAYOUT_DEST_VERIFIED_BY, 100),
    verifiedAt: clean(env.AT_MODELS__PAYOUT_DEST_VERIFIED_AT, 100),
  };
  const required = ["type", "bank", "name", "ref", "status", "submittedAt", "verifiedBy", "verifiedAt"];
  config.ready = required.every((key) => Boolean(config[key]));
  return config;
}

export function normalizeThaiPhone(raw) {
  let digits = String(raw || "").replace(/[\s\-().]/g, "");
  if (digits.startsWith("+66")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("66") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return /^0[0-9]{9}$/.test(digits) ? digits : null;
}

export function isValidThaiNationalId(raw) {
  const digits = String(raw || "").replace(/[\s-]/g, "");
  if (!/^[0-9]{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(digits[12]);
}

export function normalizeBankAccount(raw) {
  const digits = String(raw || "").replace(/[\s-]/g, "");
  return /^[0-9]{10,15}$/.test(digits) ? digits : null;
}

export function maskReference(ref) {
  const value = String(ref || "");
  if (value.length < 4) return value ? "••••" : "";
  return `••••${value.slice(-4)}`;
}

// Returns { ok:true, value } or { ok:false, error } where error is a stable code.
// Error codes never contain submitted values.
export function validateDestination(input = {}) {
  const type = clean(input.type, 40);
  if (!DESTINATION_TYPES.includes(type)) return { ok: false, error: "invalid_destination_type" };

  const accountName = clean(input.account_name, 200).replace(/\s+/g, " ");
  if (accountName.length < 2 || accountName.length > 100 || /^[0-9\s]+$/.test(accountName)) {
    return { ok: false, error: "invalid_account_name" };
  }

  let ref = null;
  let bankName = "";
  if (type === "promptpay_phone") {
    ref = normalizeThaiPhone(input.account_ref);
    if (!ref) return { ok: false, error: "invalid_promptpay_phone" };
  } else if (type === "promptpay_national_id") {
    const digits = String(input.account_ref || "").replace(/[\s-]/g, "");
    if (!isValidThaiNationalId(digits)) return { ok: false, error: "invalid_promptpay_national_id" };
    ref = digits;
  } else {
    ref = normalizeBankAccount(input.account_ref);
    if (!ref) return { ok: false, error: "invalid_bank_account" };
    bankName = clean(input.bank_name, 100).replace(/\s+/g, " ");
    if (bankName.length < 2 || bankName.length > 60) return { ok: false, error: "invalid_bank_name" };
  }
  return { ok: true, value: { type, accountName, ref, bankName } };
}

function sameDestination(existing, next) {
  return (
    existing.type === next.type &&
    existing.ref === next.ref &&
    existing.bankName.toLowerCase() === next.bankName.toLowerCase() &&
    existing.accountName.toLowerCase() === next.accountName.toLowerCase()
  );
}

function airtableAuth(env = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !apiKey) {
    const error = new Error("airtable_not_ready");
    error.status = 503;
    throw error;
  }
  return { baseId, apiKey };
}

async function airtableRequest(env, path, init = {}) {
  const { baseId, apiKey } = airtableAuth(env);
  const response = await fetch(`${AIRTABLE_API}/${baseId}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Never include the response body: it can echo submitted values.
    const error = new Error("airtable_request_failed");
    error.status = response.status >= 500 ? 503 : 502;
    throw error;
  }
  return data;
}

function resolveModelRecordId(session, config) {
  const link = session?.fields?.[config.sessionCanonicalModel];
  if (!Array.isArray(link) || link.length !== 1) return null;
  const id = typeof link[0] === "string" ? link[0] : link[0]?.id;
  return /^rec[A-Za-z0-9]{14}$/.test(String(id || "")) ? id : null;
}

async function readModelDestination(env, config, modelRecordId) {
  const query = new URLSearchParams({ returnFieldsByFieldId: "true" });
  for (const id of [config.type, config.bank, config.name, config.ref, config.status]) query.append("fields[]", id);
  const record = await airtableRequest(
    env,
    `${encodeURIComponent(config.modelsTable)}/${encodeURIComponent(modelRecordId)}?${query.toString()}`,
    { method: "GET" },
  );
  const fields = record?.fields || {};
  const status = clean(fields[config.status], 40).toLowerCase();
  return {
    type: clean(fields[config.type], 40),
    bankName: clean(fields[config.bank], 100),
    accountName: clean(fields[config.name], 200),
    ref: clean(fields[config.ref], 100),
    status: status || "none",
  };
}

function publicView(destination) {
  if (!destination || !destination.ref) return { status: "none" };
  return {
    status: destination.status,
    type: destination.type,
    bank_name: destination.bankName || null,
    masked_ref: maskReference(destination.ref),
  };
}

async function consumeRateLimit(env, sessionId) {
  const kv = env.PAY_SESSIONS_KV;
  if (!kv) return true; // token verification already requires this KV; fail open only for tests without it
  const key = `pdest:rl:${clean(sessionId, 200)}`;
  const current = Number(await kv.get(key)) || 0;
  if (current >= RATE_LIMIT_MAX) return false;
  await kv.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_TTL_SECONDS });
  return true;
}

function errorResponse(request, env, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = status >= 500 || status === 502 ? clean(error?.message, 80) || "payout_destination_failed" : "payout_destination_failed";
  return withCors(request, env, json({ ok: false, error: code }, status));
}

async function authorizeModel(request, env, authorize) {
  const authorized = await authorize(request, env);
  if (authorized.response) return { response: authorized.response };
  if (authorized.expectedRole !== "model") {
    return { response: withCors(request, env, json({ ok: false, error: "model_role_required" }, 403)) };
  }
  return authorized;
}

function preconditions(request, env, authorized, config) {
  if (!authorized.session?.fields?.[config.sessionModelAck]) {
    return withCors(request, env, json({ ok: false, error: "model_ack_required" }, 409));
  }
  if (!config.ready) {
    return withCors(request, env, json({ ok: false, error: "payout_destination_not_configured" }, 503));
  }
  return null;
}

export async function handlePayoutDestinationContext(request, env = {}, deps = {}) {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (method !== "POST") return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));
  if (!isDestinationEnabled(env)) return withCors(request, env, json({ ok: true, enabled: false }));

  const authorize = deps.authorize || authorizeConfirmationRequest;
  try {
    const authorized = await authorizeModel(request, env, authorize);
    if (authorized.response) return authorized.response;
    const config = destinationFieldConfig(env);
    const blocked = preconditions(request, env, authorized, config);
    if (blocked) {
      // Not acknowledged yet: tell the page to keep the form hidden rather than error.
      const body = await blocked.clone().json().catch(() => ({}));
      if (body.error === "model_ack_required") return withCors(request, env, json({ ok: true, enabled: true, can_submit: false, status: "none" }));
      return blocked;
    }
    const modelRecordId = resolveModelRecordId(authorized.session, config);
    if (!modelRecordId) return withCors(request, env, json({ ok: false, error: "model_record_not_resolved" }, 409));
    const destination = await readModelDestination(env, config, modelRecordId);
    return withCors(request, env, json({ ok: true, enabled: true, can_submit: true, destination: publicView(destination) }));
  } catch (error) {
    return errorResponse(request, env, error);
  }
}

export async function handlePayoutDestinationSubmit(request, env = {}, deps = {}) {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return withCors(request, env, new Response(null, { status: 204 }));
  if (method !== "POST") return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));
  if (!isDestinationEnabled(env)) return withCors(request, env, json({ ok: false, error: "not_enabled" }, 404));

  const authorize = deps.authorize || authorizeConfirmationRequest;
  try {
    const authorized = await authorizeModel(request, env, authorize);
    if (authorized.response) return authorized.response;
    const config = destinationFieldConfig(env);
    const blocked = preconditions(request, env, authorized, config);
    if (blocked) return blocked;

    const modelRecordId = resolveModelRecordId(authorized.session, config);
    if (!modelRecordId) return withCors(request, env, json({ ok: false, error: "model_record_not_resolved" }, 409));

    if (!(await consumeRateLimit(env, authorized.claims.session_id))) {
      return withCors(request, env, json({ ok: false, error: "too_many_attempts" }, 429));
    }

    const checked = validateDestination(authorized.body?.destination || authorized.body || {});
    if (!checked.ok) return withCors(request, env, json({ ok: false, error: checked.error }, 422));
    const next = checked.value;

    const existing = await readModelDestination(env, config, modelRecordId);
    if (existing.status === STATUS_VERIFIED && sameDestination(existing, next)) {
      return withCors(request, env, json({ ok: true, unchanged: true, destination: publicView(existing) }));
    }

    await airtableRequest(env, `${encodeURIComponent(config.modelsTable)}/${encodeURIComponent(modelRecordId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [config.type]: next.type,
          [config.bank]: next.bankName || null,
          [config.name]: next.accountName,
          [config.ref]: next.ref,
          [config.status]: STATUS_PENDING,
          [config.submittedAt]: new Date().toISOString(),
          [config.verifiedBy]: null,
          [config.verifiedAt]: null,
        },
      }),
    });

    return withCors(request, env, json({
      ok: true,
      unchanged: false,
      destination: publicView({ ...next, bankName: next.bankName, status: STATUS_PENDING }),
    }));
  } catch (error) {
    return errorResponse(request, env, error);
  }
}
