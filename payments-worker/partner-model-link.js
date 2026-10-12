import { createConfirmTokenRecord, getConfirmTokenTtlSeconds, signConfirmToken } from "./index.js";

// Partner-issued model confirmation link.
// Called by partners-worker (service-to-service) after the Partner is authenticated there.
// Mints a normal `model_confirm` token with extra signed claims (via=partner, neutral=true)
// so the model page can render without MMD branding. The token stays scoped to one session.

const AIRTABLE_API = "https://api.airtable.com/v0";
export const PARTNER_MODEL_LINK_PATH = "/v1/internal/confirm/partner-model-link";

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  amountThb: "fldhwC79ndbnEXSZz",
  paymentRef: "fldojgjSQLaO0uQLX",
  payModelThb: "fldlTO5aNfqUmlNWm",
  partnerIdSnapshot: "fld0jkscGAtyX7i2J",
  referralSnapshotJson: "fldfqNBNKkmQdr6Fp",
});

const PAYMENT_FIELDS = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  verificationStatus: "fldJ7a0Ube9F0bmRy",
});

const PARTNER_SYSTEMS = new Set(["co_partner", "profit_share"]);

function clean(value, max = 4096) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function formula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store, private", "x-mmd-partner-model-link": "v1" },
  });
}

function authed(request, env) {
  const expected = clean(env.AUTH_SERVICE_PARTNERS_TO_PAYMENTS, 5000);
  const direct = clean(request.headers.get("x-internal-token"), 5000);
  const bearer = clean(request.headers.get("authorization"), 5000).replace(/^Bearer\s+/i, "");
  return Boolean(expected && (direct === expected || bearer === expected));
}

async function airtable(env, path, init = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 160);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !apiKey) throw Object.assign(new Error("airtable_not_ready"), { status: 503 });
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`airtable_http_${response.status}`), { status: response.status >= 500 ? 503 : 500 });
  return payload;
}

async function findSingle(env, table, fieldName, value) {
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{${fieldName}}='${formula(value)}'`,
    returnFieldsByFieldId: "true",
  });
  const data = await airtable(env, `${encodeURIComponent(table)}?${params.toString()}`, { method: "GET" });
  const rows = Array.isArray(data.records) ? data.records : [];
  return rows.length === 1 ? rows[0] : null;
}

function parseObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function isPartnerModelLinkRequest(path, method) {
  return String(method || "").toUpperCase() === "POST"
    && String(path || "").replace(/\/+$/g, "") === PARTNER_MODEL_LINK_PATH;
}

export async function handlePartnerModelLink(request, env = {}) {
  if (!authed(request, env)) return json({ ok: false, error: "service_auth_required" }, 401);

  const body = await request.json().catch(() => null);
  const sessionId = clean(body?.session_id, 220);
  const partnerId = clean(body?.partner_id, 120);
  const payModel = Number(body?.pay_model_thb);
  const allowed = new Set(["session_id", "partner_id", "pay_model_thb"]);
  if (!sessionId || !partnerId || Object.keys(body || {}).some((key) => !allowed.has(key))) {
    return json({ ok: false, error: "session_id_and_partner_id_required" }, 400);
  }
  if (!Number.isInteger(payModel) || payModel <= 0) {
    return json({ ok: false, error: "pay_model_thb_invalid" }, 400);
  }

  try {
    const sessionsTable = clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 160);
    const paymentsTable = clean(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", 160);
    const session = await findSingle(env, sessionsTable, "session_id", sessionId);
    if (!session?.id) return json({ ok: false, error: "session_not_found" }, 404);
    const sf = session.fields || {};

    // The Partner may only issue links for their own job, and only under a Partner-confirmed system.
    if (clean(sf[SESSION_FIELDS.partnerIdSnapshot], 120) !== partnerId) {
      return json({ ok: false, error: "partner_not_owner_of_session" }, 403);
    }
    const system = clean(parseObject(sf[SESSION_FIELDS.referralSnapshotJson]).system, 40).toLowerCase();
    if (!PARTNER_SYSTEMS.has(system)) return json({ ok: false, error: "partner_system_not_allowed" }, 409);

    const amount = Number(sf[SESSION_FIELDS.amountThb]);
    if (Number.isFinite(amount) && amount > 0 && payModel > amount) {
      return json({ ok: false, error: "pay_model_exceeds_job_amount" }, 409);
    }
    const existingPay = Number(sf[SESSION_FIELDS.payModelThb]);
    if (Number.isFinite(existingPay) && existingPay > 0 && existingPay !== payModel) {
      return json({ ok: false, error: "pay_model_already_set" }, 409);
    }

    const paymentRef = clean(sf[SESSION_FIELDS.paymentRef], 220);
    if (!paymentRef) return json({ ok: false, error: "session_payment_ref_missing" }, 409);
    const payment = await findSingle(env, paymentsTable, "payment_ref", paymentRef);
    if (!payment?.id) return json({ ok: false, error: "payment_not_found" }, 409);
    if (clean(payment.fields?.[PAYMENT_FIELDS.verificationStatus], 40).toLowerCase() !== "verified") {
      return json({ ok: false, error: "payment_not_official_verified" }, 409);
    }
    const paymentType = clean(payment.fields?.[PAYMENT_FIELDS.paymentStage] || "deposit", 80).toLowerCase();
    if (!new Set(["deposit", "full", "final"]).has(paymentType)) {
      return json({ ok: false, error: "payment_type_not_reissuable" }, 409);
    }

    const secret = clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5000);
    if (!secret) return json({ ok: false, error: "confirmation_signing_not_ready" }, 503);

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + getConfirmTokenTtlSeconds(env);
    const claims = {
      kind: "model_confirm",
      role: "model",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentType,
      via: "partner",
      neutral: true,
      iat: issuedAt,
      exp: expiresAt,
    };
    const token = await signConfirmToken(claims, secret);
    await createConfirmTokenRecord(env, token, claims);

    if (!(Number.isFinite(existingPay) && existingPay === payModel)) {
      await airtable(env, `${encodeURIComponent(sessionsTable)}/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: { [SESSION_FIELDS.payModelThb]: payModel }, typecast: false }),
      });
    }

    const base = clean(env.WEB_BASE_URL || "https://mmdbkk.com", 500).replace(/\/+$/, "");
    return json({
      ok: true,
      schema: "mmd_partner_model_link_v1",
      session_id: sessionId,
      system,
      pay_model_thb: payModel,
      expires_at: expiresAt,
      model_confirmation_url: `${base}/sigil/confirm/job-model?t=${encodeURIComponent(token)}`,
      payment_state_mutated: false,
      notification_sent: false,
    });
  } catch (error) {
    return json({ ok: false, error: clean(error?.message || "partner_model_link_failed", 160) }, Number(error?.status || 500));
  }
}
