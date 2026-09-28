import { createConfirmTokenRecord, getConfirmTokenTtlSeconds, signConfirmToken } from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
export const CONFIRM_REISSUE_PATH = "/v1/internal/confirm/reissue";

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  paymentRef: "fldojgjSQLaO0uQLX",
  customerUrl: "fldi9ZdoiUXzSv1rI",
  modelUrl: "fld0mFma9J9yfEaKb",
});

const PAYMENT_FIELDS = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  paymentType: "fldydUWHhqVLMkNSC",
});

function clean(value, max = 4096) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function formula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store, private",
      "x-mmd-confirm-reissue": "v1",
    },
  });
}

function authed(request, env) {
  const expected = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS, 5000);
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
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
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
  if (rows.length !== 1) return null;
  return rows[0];
}

export function isConfirmationReissueRequest(path, method) {
  return String(method || "").toUpperCase() === "POST"
    && String(path || "").replace(/\/+$/g, "") === CONFIRM_REISSUE_PATH;
}

export async function handleConfirmationReissue(request, env = {}) {
  if (!authed(request, env)) return json({ ok: false, error: "service_auth_required" }, 401);

  const body = await request.json().catch(() => null);
  const sessionId = clean(body?.session_id, 220);
  if (!sessionId || Object.keys(body || {}).some((key) => key !== "session_id")) {
    return json({ ok: false, error: "session_id_required" }, 400);
  }

  try {
    const sessionsTable = clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 160);
    const paymentsTable = clean(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", 160);
    const session = await findSingle(env, sessionsTable, "session_id", sessionId);
    if (!session?.id) return json({ ok: false, error: "session_not_found" }, 404);

    const paymentRef = clean(session.fields?.[SESSION_FIELDS.paymentRef], 220);
    if (!paymentRef) return json({ ok: false, error: "session_payment_ref_missing" }, 409);

    const payment = await findSingle(env, paymentsTable, "payment_ref", paymentRef);
    if (!payment?.id) return json({ ok: false, error: "payment_not_found" }, 409);

    const paymentType = clean(
      payment.fields?.[PAYMENT_FIELDS.paymentStage] || payment.fields?.[PAYMENT_FIELDS.paymentType] || "deposit",
      80,
    ).toLowerCase();
    if (!new Set(["deposit", "full", "final", "tips"]).has(paymentType)) {
      return json({ ok: false, error: "payment_type_not_reissuable" }, 409);
    }

    const secret = clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5000);
    if (!secret) return json({ ok: false, error: "confirmation_signing_not_ready" }, 503);

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + getConfirmTokenTtlSeconds(env);
    const claims = (role) => ({
      kind: role === "customer" ? "customer_confirm" : "model_confirm",
      role,
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentType,
      iat: issuedAt,
      exp: expiresAt,
    });

    const customerClaims = claims("customer");
    const modelClaims = claims("model");
    const [customerToken, modelToken] = await Promise.all([
      signConfirmToken(customerClaims, secret),
      signConfirmToken(modelClaims, secret),
    ]);
    await Promise.all([
      createConfirmTokenRecord(env, customerToken, customerClaims),
      createConfirmTokenRecord(env, modelToken, modelClaims),
    ]);

    const base = clean(env.WEB_BASE_URL || "https://mmdbkk.com", 500).replace(/\/+$/, "");
    const customerUrl = `${base}/sigil/confirm/job-confirmation?t=${encodeURIComponent(customerToken)}`;
    const modelUrl = `${base}/sigil/confirm/job-model?t=${encodeURIComponent(modelToken)}`;

    await airtable(env, `${encodeURIComponent(sessionsTable)}/${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [SESSION_FIELDS.customerUrl]: customerUrl,
          [SESSION_FIELDS.modelUrl]: modelUrl,
        },
        typecast: false,
      }),
    });

    return json({
      ok: true,
      schema: "mmd_confirmation_pair_reissue_v1",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentType,
      expires_at: expiresAt,
      customer_confirmation_url_present: true,
      model_confirmation_url_present: true,
      payment_state_mutated: false,
      notification_sent: false,
    });
  } catch (error) {
    return json({ ok: false, error: clean(error?.message || "confirmation_reissue_failed", 160) }, Number(error?.status || 500));
  }
}
