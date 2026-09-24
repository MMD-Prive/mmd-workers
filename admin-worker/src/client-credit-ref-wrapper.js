import delegatedWorker from "./client-credit-admin-wrapper.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const PAYMENTS_TABLE = "tblWGGJJOx5eBvBZJ";
const SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const PAYMENT_PROOFS_TABLE = "tblfJfM4Sqag9zrLi";
const CLIENT_CREDITS_TABLE = "tblKvhl2zZm9yYBmT";
const PAYMENT_REF_FIELD = "fldOO6SY49iDw8VBZ";
const PAYMENT_CLIENT_FIELD = "fldcrLuJijj7xr0y8";
const PAYMENT_SESSION_ID_FIELD = "fld2wdhBvc8xrV6y5";
const PAYMENT_PROOFS_BACKLINK_FIELD = "fldCjauctZIE5sYc9";
const SESSION_ID_FIELD = "fldLTq2kZbyRv22IA";
const PROOF_ID_FIELD = "fldz3Tg9eOm19h0Jd";
const PROOF_STATUS_FIELD = "fld45QUtZAl3FEmW4";
const CREDIT_SOURCE_PROOF_FIELD = "fldl1vsEw9FiN1Qf3";
const CREDIT_SOURCE_PROOF_ID_FIELD = "fldMX0rMeNxNvecLE";
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

function airtableConfig(env = {}) {
  return {
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000),
    baseId: clean(env.AIRTABLE_BASE_ID, 40) || DEFAULT_BASE_ID,
  };
}

async function airtableRequest(env, tableId, path = "", init = {}) {
  const { token, baseId } = airtableConfig(env);
  if (!token) throw new Error("AIRTABLE_CONFIG_MISSING");
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}${path}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  for (const [key, value] of Object.entries(init.query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    method: init.method || "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`AIRTABLE_${response.status}`);
  return payload;
}

async function findOne(env, tableId, filterByFormula) {
  const payload = await airtableRequest(env, tableId, "", {
    query: { filterByFormula, pageSize: 2 },
  });
  if (!Array.isArray(payload?.records)) throw new Error("AIRTABLE_MALFORMED");
  if (payload.records.length !== 1) return null;
  return payload.records[0];
}

async function getRecord(env, tableId, recordId) {
  const id = clean(recordId, 40);
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  return airtableRequest(env, tableId, `/${encodeURIComponent(id)}`).catch(() => null);
}

function isOfficialSourceProof(proof) {
  const status = clean(proof?.fields?.[PROOF_STATUS_FIELD], 80).toLowerCase();
  // Historical backfill marks a proof as reviewed only after payments-worker
  // completes its signed handoff. The carry-forward endpoint still independently
  // verifies the official Payment record before it can create a credit.
  return status === "verified" || status === "reviewed";
}

async function findOfficialSourceProofByRef(env, paymentRef) {
  const payload = await airtableRequest(env, PAYMENT_PROOFS_TABLE, "", {
    query: { filterByFormula: `{payment_ref}=${formulaString(paymentRef)}`, pageSize: 4 },
  });
  const matches = (Array.isArray(payload?.records) ? payload.records : []).filter(isOfficialSourceProof);
  return matches.length === 1 ? matches[0] : null;
}

async function resolveVerifiedSourceProof(env, payment, paymentRef) {
  const linkedIds = Array.isArray(payment?.fields?.[PAYMENT_PROOFS_BACKLINK_FIELD])
    ? [...new Set(payment.fields[PAYMENT_PROOFS_BACKLINK_FIELD].map((value) => clean(value, 40)).filter((value) => /^rec[A-Za-z0-9]{14}$/.test(value)))]
    : [];
  if (linkedIds.length === 1) {
    const linked = await getRecord(env, PAYMENT_PROOFS_TABLE, linkedIds[0]);
    if (isOfficialSourceProof(linked)) return linked;
  }
  return findOfficialSourceProofByRef(env, paymentRef).catch(() => null);
}

async function attachCreditProofProvenance(env, creditRecordId, proof) {
  const creditId = clean(creditRecordId, 40);
  const proofRecordId = clean(proof?.id, 40);
  const proofId = clean(proof?.fields?.[PROOF_ID_FIELD], 120);
  if (!/^rec[A-Za-z0-9]{14}$/.test(creditId) || !/^rec[A-Za-z0-9]{14}$/.test(proofRecordId) || !proofId) {
    return { status: "proof_unavailable" };
  }
  await airtableRequest(env, CLIENT_CREDITS_TABLE, `/${encodeURIComponent(creditId)}`, {
    method: "PATCH",
    body: {
      fields: {
        [CREDIT_SOURCE_PROOF_FIELD]: [proofRecordId],
        [CREDIT_SOURCE_PROOF_ID_FIELD]: proofId,
      },
    },
  });
  return { status: "linked", proofRecordId, proofId };
}

async function withProvenanceResult(response, provenance) {
  if (!(response instanceof Response)) return response;
  const contentType = clean(response.headers.get("content-type"), 120).toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response;
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({ ...payload, proof_provenance: provenance }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

    const sourceProof = await resolveVerifiedSourceProof(env, payment, paymentRef);
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
    const response = await delegatedWorker.fetch(forwarded, env, ctx);
    const payload = await response.clone().json().catch(() => null);
    if (!response.ok || payload?.ok !== true || !payload?.credit?.recordId) {
      return withProvenanceResult(response, { status: sourceProof ? "not_written" : "proof_unavailable" });
    }
    if (!sourceProof?.id) return withProvenanceResult(response, { status: "proof_unavailable" });
    try {
      const provenance = await attachCreditProofProvenance(env, payload.credit.recordId, sourceProof);
      return withProvenanceResult(response, provenance);
    } catch (error) {
      return withProvenanceResult(response, { status: "write_failed", error: clean(error?.message, 80) || "PROVENANCE_WRITE_FAILED" });
    }
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
