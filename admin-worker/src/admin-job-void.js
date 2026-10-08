// admin-worker/src/admin-job-void.js
// Admin "void" of a job that has NO payment activity (e.g. an accidental
// duplicate). Never deletes anything: it sets the session status to Cancelled,
// marks the unpaid payment intent Cancelled and appends an audit note.
// Refuses whenever any payment evidence/verification exists (that is Money
// Truth territory and needs the payment authority, not a void).
// Auth, host and Origin are enforced by the credential-bound route first.

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const T = Object.freeze({
  sessions: "tblC98mKWbzmPuNzX",
  payments: "tblWGGJJOx5eBvBZJ",
  proofs: "tblfJfM4Sqag9zrLi",
});
export const VOID_SESSION = Object.freeze({
  id: "fldLTq2kZbyRv22IA",
  status: "fldmwuvOaiCFdzzRa",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  note: "fldEcDkF7CH9VixWM",
});
const PAY = Object.freeze({
  ref: "fldOO6SY49iDw8VBZ",
  intentStatus: "fld04fr3bRJTohO6y",
  verification: "fldJ7a0Ube9F0bmRy",
});
const PROOF_PAYMENT_REF = "fldyeyV7aL0dkbLLE";
const VOID_MARKER = "[MMD JOB VOID v1]";
const BLOCKING_STATUSES = new Set(["confirmed", "completed"]);

export const VOID_PATH = "/v1/admin/job/void";

const name = (v) => String(v?.name ?? v ?? "").trim();
const lower = (v) => name(v).toLowerCase();

/** Pure decision: can this session be voided? */
export function decideVoid(sessionFields, { payments = [], proofs = [] } = {}) {
  const f = sessionFields || {};
  const status = lower(f[VOID_SESSION.status]);
  if (status === "cancelled" || status === "canceled") return { ok: true, already: true };
  if (BLOCKING_STATUSES.has(status)) return { ok: false, error: "job_already_progressed", http: 409 };
  const paymentStatus = lower(f[VOID_SESSION.paymentStatus]);
  if (paymentStatus && paymentStatus !== "pending") return { ok: false, error: "payment_activity_exists", http: 409 };
  if (proofs.length > 0) return { ok: false, error: "payment_evidence_exists", http: 409 };
  for (const p of payments) {
    const v = lower(p?.fields?.[PAY.verification]);
    if (v && v !== "failed") return { ok: false, error: "payment_activity_exists", http: 409 };
  }
  return { ok: true, already: false };
}

export function buildVoidNote(existing, { actor, reason, at }) {
  const entry = `${VOID_MARKER} ${JSON.stringify({
    voided_at: at,
    voided_by: String(actor?.id || actor?.role || "admin").slice(0, 120),
    reason: reason || null,
  })}`;
  const base = typeof existing === "string" ? existing.trimEnd() : "";
  return base ? `${base}\n${entry}` : entry;
}

export async function handleAdminJobVoidRequest(request, env, actor) {
  if (!actor) return voidJson({ ok: false, error: "unauthorized" }, 401);
  if (request.method.toUpperCase() !== "POST") return voidJson({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin) return voidJson({ ok: false, error: "forbidden_origin" }, 403);
  const role = String(actor.role || "").toLowerCase();
  if (role === "mms_partner") return voidJson({ ok: false, error: "mms_partner_scope_forbidden" }, 403);

  const body = await request.json().catch(() => null);
  const sessionId = String(body?.session_id || "").trim();
  if (!/^[A-Za-z0-9_-]{3,119}$/.test(sessionId)) return voidJson({ ok: false, error: "invalid_session_id" }, 400);
  if (body?.confirm !== true) return voidJson({ ok: false, error: "confirmation_required" }, 400);
  const reason = String(body?.reason || "").trim().slice(0, 200);
  if (!env.AIRTABLE_API_KEY) return voidJson({ ok: false, error: "void_unavailable" }, 503);
  const baseId = env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const tables = {
    sessions: env.AIRTABLE_TABLE_SESSIONS || T.sessions,
    payments: env.AIRTABLE_TABLE_PAYMENTS || T.payments,
    proofs: env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || T.proofs,
  };

  try {
    const sessions = await list(env, baseId, tables.sessions, `{${VOID_SESSION.id}}="${sessionId}"`, Object.values(VOID_SESSION));
    const matching = sessions.filter((r) => String(r.fields?.[VOID_SESSION.id] || "") === sessionId);
    if (matching.length !== 1) return voidJson({ ok: false, error: "job_not_found" }, 404);
    const session = matching[0];
    const ref = String(session.fields?.[VOID_SESSION.paymentRef] || "").trim();
    if (ref && !/^[A-Za-z0-9_-]{3,160}$/.test(ref)) return voidJson({ ok: false, error: "payment_ref_invalid" }, 409);

    let payments = [];
    let proofs = [];
    if (ref) {
      payments = await list(env, baseId, tables.payments, `{${PAY.ref}}="${ref}"`, [PAY.ref, PAY.verification, PAY.intentStatus]);
      proofs = await list(env, baseId, tables.proofs, `{${PROOF_PAYMENT_REF}}="${ref}"`, [PROOF_PAYMENT_REF]);
    }

    const decision = decideVoid(session.fields, { payments, proofs });
    if (!decision.ok) return voidJson({ ok: false, error: decision.error }, decision.http);
    if (decision.already) return voidJson({ ok: true, voided: true, already_voided: true, session_id: sessionId });

    const at = new Date().toISOString();
    await patch(env, baseId, tables.sessions, session.id, {
      [VOID_SESSION.status]: "Cancelled",
      [VOID_SESSION.note]: buildVoidNote(session.fields?.[VOID_SESSION.note], { actor, reason, at }),
    });

    let paymentMarked = 0;
    let warning = null;
    for (const p of payments) {
      try {
        await patch(env, baseId, tables.payments, p.id, { [PAY.intentStatus]: "Cancelled" });
        paymentMarked += 1;
      } catch (_) {
        warning = "payment_intent_not_marked";
      }
    }
    return voidJson({ ok: true, voided: true, session_id: sessionId, payment_intents_marked: paymentMarked, ...(warning ? { warning } : {}) });
  } catch (_) {
    return voidJson({ ok: false, error: "void_unavailable" }, 503);
  }
}

async function list(env, baseId, table, formula, fieldIds) {
  const qs = new URLSearchParams({ pageSize: "5", returnFieldsByFieldId: "true", filterByFormula: formula });
  for (const id of fieldIds) qs.append("fields[]", id);
  const res = await fetch(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(table)}?${qs}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  if (!res.ok) throw new Error(`airtable_${res.status}`);
  return (await res.json()).records || [];
}

async function patch(env, baseId, table, recordId, fields) {
  const res = await fetch(`${AIRTABLE_API}/${baseId}/${encodeURIComponent(table)}/${recordId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`airtable_patch_${res.status}`);
}

function voidJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-robots-tag": "noindex" },
  });
}
