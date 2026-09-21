import delegatedWorker from "./client-credit-ref-wrapper.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const REVIEW_QUEUE_PATH = "/v1/admin/payments/review-queue";
const REVIEW_PATH = "/v1/admin/payments/review";
const PAYMENT_PROOFS_TABLE = "tblfJfM4Sqag9zrLi";
const CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const PAYMENTS_TABLE = "tblWGGJJOx5eBvBZJ";

const PROOF = Object.freeze({
  proofId: "fldz3Tg9eOm19h0Jd",
  paymentRef: "fldyeyV7aL0dkbLLE",
  payment: "fldLTgArSK7U0695K",
  client: "fldQB8ZZ9WSanCNzr",
});
const CLIENT = Object.freeze({
  displayName: "fld7bPB3pWS2wteUU",
  fallbackName: "fldrHqkGQzvBLRxlP",
  lineDisplayName: "fldb7vkM1FWswNm3l",
});
const PAYMENT = Object.freeze({
  ref: "fldOO6SY49iDw8VBZ",
  client: "fldcrLuJijj7xr0y8",
});

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function recordIds(value) {
  return Array.isArray(value) ? [...new Set(value.map((entry) => clean(entry, 40)).filter((entry) => /^rec[A-Za-z0-9]{14}$/.test(entry)))] : [];
}
function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store, private", "content-type": "application/json; charset=utf-8" } });
}
function airtableConfig(env = {}) {
  return {
    baseId: clean(env.AIRTABLE_BASE_ID, 40) || DEFAULT_BASE_ID,
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000),
  };
}
async function airtableRequest(env, tableId, path = "", init = {}) {
  const { baseId, token } = airtableConfig(env);
  if (!baseId || !token) throw new Error("AIRTABLE_CONFIG_MISSING");
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
async function getRecord(env, tableId, recordId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(clean(recordId, 40))) return null;
  return airtableRequest(env, tableId, `/${encodeURIComponent(recordId)}`).catch(() => null);
}
async function findOne(env, tableId, formula) {
  const payload = await airtableRequest(env, tableId, "", {
    query: { filterByFormula: formula, pageSize: 2 },
  });
  const rows = Array.isArray(payload?.records) ? payload.records : [];
  return rows.length === 1 ? rows[0] : null;
}
async function loadProof(env, proofId, proofRecordId = "") {
  const direct = await getRecord(env, PAYMENT_PROOFS_TABLE, proofRecordId);
  if (direct?.id) return direct;
  const normalized = clean(proofId, 120);
  if (!normalized) return null;
  return findOne(env, PAYMENT_PROOFS_TABLE, `{proof_id}=${formulaString(normalized)}`).catch(() => null);
}
async function loadPaymentForProof(env, proof) {
  const linked = recordIds(proof?.fields?.[PROOF.payment]);
  if (linked.length > 1) return { payment: null, ambiguous: true };
  if (linked.length === 1) return { payment: await getRecord(env, PAYMENTS_TABLE, linked[0]), ambiguous: false };
  const paymentRef = clean(proof?.fields?.[PROOF.paymentRef], 180);
  if (!paymentRef) return { payment: null, ambiguous: false };
  const payment = await findOne(env, PAYMENTS_TABLE, `{Payment Reference}=${formulaString(paymentRef)}`).catch(() => null);
  return { payment, ambiguous: false };
}
async function clientContext(env, proof) {
  const ids = recordIds(proof?.fields?.[PROOF.client]);
  if (ids.length > 1) return { ambiguous: true, clientRecordId: null, clientName: null };
  if (ids.length !== 1) return { ambiguous: false, clientRecordId: null, clientName: null };
  const client = await getRecord(env, CLIENTS_TABLE, ids[0]);
  const name = clean(
    client?.fields?.[CLIENT.displayName]
      || client?.fields?.[CLIENT.fallbackName]
      || client?.fields?.[CLIENT.lineDisplayName],
    180,
  );
  return { ambiguous: false, clientRecordId: ids[0], clientName: name || null };
}

export function applyCanonicalClientToReviewItem(item, context = {}) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  if (!context.clientRecordId || context.ambiguous) return item;
  if (item.client_record_id && item.client_record_id !== context.clientRecordId) {
    return { ...item, can_approve: false, review_lane: "needs_enrichment", context_issues: [...new Set([...(item.context_issues || []), "canonical_client_link_ambiguous"])] };
  }
  const keepPreferred = item.client_record_id === context.clientRecordId && item.customer_name_source === "per_rename";
  const issues = Array.isArray(item.context_issues)
    ? item.context_issues.filter((issue) => issue !== "customer_or_job_not_linked")
    : [];
  return {
    ...item,
    client_record_id: context.clientRecordId,
    client_name: context.clientName || item.client_name || null,
    customer_name: (keepPreferred && item.customer_name) || context.clientName || item.customer_name || item.payer_name || null,
    customer_aliases: [...new Set([...(item.customer_aliases || []), item.customer_name, context.clientName].filter(Boolean))],
    identity_state: item.identity_state || "canonical_client_linked",
    context_issues: issues,
    review_lane: issues.length ? "needs_enrichment" : "owner_review",
    can_approve: item.reviewable === true && issues.length === 0,
    match_flags: {
      ...(item.match_flags && typeof item.match_flags === "object" ? item.match_flags : {}),
      linked_client_present: true,
    },
  };
}

export function hasCanonicalClientMismatch(proofClientIds, paymentClientIds) {
  const proofIds = [...new Set((proofClientIds || []).filter(Boolean))];
  const paymentIds = [...new Set((paymentClientIds || []).filter(Boolean))];
  if (proofIds.length > 1 || paymentIds.length > 1) return true;
  return proofIds.length === 1 && paymentIds.length === 1 && proofIds[0] !== paymentIds[0];
}

async function enrichQueueResponse(response, env) {
  if (!(response instanceof Response) || !response.ok) return response;
  const contentType = clean(response.headers.get("content-type"), 120).toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload || !Array.isArray(payload.items)) return response;
  const items = await Promise.all(payload.items.map(async (item) => {
    const proof = await loadProof(env, item?.proof_id, item?.proof_record_id);
    if (!proof) return item;
    const context = await clientContext(env, proof);
    if (context.ambiguous) {
      const issues = Array.isArray(item.context_issues) ? [...new Set([...item.context_issues, "canonical_client_link_ambiguous"])] : ["canonical_client_link_ambiguous"];
      return { ...item, context_issues: issues, review_lane: "needs_enrichment", can_approve: false };
    }
    return applyCanonicalClientToReviewItem(item, context);
  }));
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-client-provenance", "v1");
  return new Response(JSON.stringify({ ...payload, items }), { status: response.status, statusText: response.statusText, headers });
}

async function validateApprovalClientProvenance(env, body) {
  if (clean(body?.decision, 40).toLowerCase() !== "approve") return null;
  const proofId = clean(body?.proof_id, 120);
  if (!proofId) return null;
  const proof = await loadProof(env, proofId);
  if (!proof) return null;
  const proofClientIds = recordIds(proof.fields?.[PROOF.client]);
  if (proofClientIds.length > 1) return json({ ok: false, error: "canonical_client_context_ambiguous", authority: "admin-worker" }, 409);
  const { payment, ambiguous } = await loadPaymentForProof(env, proof);
  if (ambiguous) return json({ ok: false, error: "canonical_payment_context_ambiguous", authority: "admin-worker" }, 409);
  if (!payment?.id) return null;
  const paymentClientIds = recordIds(payment.fields?.[PAYMENT.client]);
  if (paymentClientIds.length > 1 || hasCanonicalClientMismatch(proofClientIds, paymentClientIds)) {
    return json({ ok: false, error: "payment_proof_client_mismatch", authority: "admin-worker" }, 409);
  }
  return null;
}

async function syncApprovedProofLinks(env, body, response) {
  if (!(response instanceof Response) || !response.ok || clean(body?.decision, 40).toLowerCase() !== "approve") return;
  const payload = await response.clone().json().catch(() => null);
  if (!payload || payload.ok !== true || payload.money_truth_changed !== true) return;
  const proof = await loadProof(env, body?.proof_id);
  if (!proof?.id) return;
  const paymentRef = clean(payload.payment_ref || proof.fields?.[PROOF.paymentRef], 180);
  if (!paymentRef) return;
  const payment = await findOne(env, PAYMENTS_TABLE, `{Payment Reference}=${formulaString(paymentRef)}`).catch(() => null);
  if (!payment?.id) return;
  const paymentClientIds = recordIds(payment.fields?.[PAYMENT.client]);
  if (paymentClientIds.length > 1) return;
  const fields = { [PROOF.payment]: [payment.id] };
  if (paymentClientIds.length === 1) fields[PROOF.client] = [paymentClientIds[0]];
  await airtableRequest(env, PAYMENT_PROOFS_TABLE, `/${encodeURIComponent(proof.id)}`, {
    method: "PATCH",
    body: { fields },
  }).catch(() => null);
}

export default {
  ...delegatedWorker,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = String(request.method || "GET").toUpperCase();
    if (url.pathname === REVIEW_QUEUE_PATH && method === "GET") {
      const response = await delegatedWorker.fetch(request, env, ctx);
      return enrichQueueResponse(response, env);
    }
    if (url.pathname === REVIEW_PATH && method === "POST") {
      const body = await request.clone().json().catch(() => null);
      const blocked = await validateApprovalClientProvenance(env, body);
      if (blocked) return blocked;
      const response = await delegatedWorker.fetch(request, env, ctx);
      await syncApprovedProofLinks(env, body, response);
      return response;
    }
    return delegatedWorker.fetch(request, env, ctx);
  },
};
