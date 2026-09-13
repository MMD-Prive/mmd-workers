import delegatedWorker from "./client-credit-admin-wrapper.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const PAYMENTS_TABLE = "tblWGGJJOx5eBvBZJ";
const SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const PAYMENT_REF_FIELD = "fldOO6SY49iDw8VBZ";
const PAYMENT_CLIENT_FIELD = "fldcrLuJijj7xr0y8";
const PAYMENT_SESSION_ID_FIELD = "fld2wdhBvc8xrV6y5";
const SESSION_ID_FIELD = "fldLTq2kZbyRv22IA";
const ROUTE = "/v1/admin/client-credits/carry-forward-by-ref";

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

async function findOne(env, tableId, filterByFormula) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 40) || DEFAULT_BASE_ID;
  if (!token) throw new Error("AIRTABLE_CONFIG_MISSING");
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`);
  url.searchParams.set("filterByFormula", filterByFormula);
  url.searchParams.set("pageSize", "2");
  url.searchParams.set("returnFieldsByFieldId", "true");
  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.records)) throw new Error(`AIRTABLE_${response.status}`);
  if (payload.records.length !== 1) return null;
  return payload.records[0];
}

async function handleByRef(request, env, ctx) {
  if (request.method !== "POST") {
    return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required." } }, 405);
  }
  const body = await request.json().catch(() => null);
  const paymentRef = clean(body?.payment_ref, 120);
  if (!paymentRef) {
    return json({ ok: false, error: { code: "PAYMENT_REF_REQUIRED", message: "payment_ref is required." } }, 400);
  }

  try {
    const payment = await findOne(env, PAYMENTS_TABLE, `{Payment Reference}=${formulaString(paymentRef)}`);
    if (!payment?.id) {
      return json({ ok: false, error: { code: "PAYMENT_NOT_UNIQUE", message: "Payment reference could not be resolved uniquely." } }, 409);
    }
    const clientIds = Array.isArray(payment.fields?.[PAYMENT_CLIENT_FIELD]) ? payment.fields[PAYMENT_CLIENT_FIELD] : [];
    const clientId = clientIds.length === 1 ? clean(clientIds[0], 40) : "";
    const sessionId = clean(payment.fields?.[PAYMENT_SESSION_ID_FIELD], 160);
    if (!/^rec[A-Za-z0-9]{14}$/.test(clientId) || !sessionId) {
      return json({ ok: false, error: { code: "PAYMENT_LINK_UNRESOLVED", message: "Payment must have one canonical Client and session_id." } }, 409);
    }

    const session = await findOne(env, SESSIONS_TABLE, `{session_id}=${formulaString(sessionId)}`);
    if (!session?.id) {
      return json({ ok: false, error: { code: "SESSION_NOT_UNIQUE", message: "Session could not be resolved uniquely." } }, 409);
    }

    const url = new URL(request.url);
    url.pathname = "/v1/admin/client-credits/carry-forward";
    const forwardedBody = {
      client_id: clientId,
      source_payment_record_id: payment.id,
      source_session_record_id: session.id,
      amount_thb: body?.amount_thb,
      reason: body?.reason || "admin_carry_forward",
      refundable: body?.refundable === true,
      customer_display_note: body?.customer_display_note,
      internal_note: body?.internal_note,
    };
    const forwarded = new Request(url.toString(), {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(forwardedBody),
    });
    return delegatedWorker.fetch(forwarded, env, ctx);
  } catch (error) {
    return json({ ok: false, error: { code: clean(error?.message, 80) || "CARRY_FORWARD_LOOKUP_FAILED", message: "Carry-forward lookup failed." } }, 503);
  }
}

export default {
  ...delegatedWorker,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === ROUTE) return handleByRef(request, env, ctx);
    return delegatedWorker.fetch(request, env, ctx);
  },
};
