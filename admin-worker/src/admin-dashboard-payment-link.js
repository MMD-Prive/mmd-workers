// admin-worker/src/admin-dashboard-payment-link.js
// Read-only: returns the existing customer payment link for ONE unpaid job so
// an admin can copy/resend it. Never mints tokens, never changes state, never
// logs the token. Browser auth is enforced by the credential-bound dashboard
// route before this handler runs. List responses never contain tokens.

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE_ID = "tblC98mKWbzmPuNzX";
const DEFAULT_WEB_BASE = "https://mmdbkk.com";

export const PAYMENT_LINK_FIELD_IDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  paymentRef: "fldojgjSQLaO0uQLX",
  customerUrl: "fldi9ZdoiUXzSv1rI",
  paymentStatus: "fldTY5lE6m0kQf72n",
  sessionStatus: "fldmwuvOaiCFdzzRa",
});

export function isAdminDashboardPaymentLinkView(url) {
  return String(url?.searchParams?.get("view") || "").trim().toLowerCase() === "payment_link";
}

export function extractCustomerToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const t = new URL(raw).searchParams.get("t");
    return t && /^[A-Za-z0-9._~-]{16,2000}$/.test(t) ? t : "";
  } catch (_) {
    return "";
  }
}

export function tokenExpiryIso(token) {
  try {
    const part = String(token).split(".")[0];
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const exp = Number(json?.exp);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    return new Date((exp > 1e12 ? exp : exp * 1000)).toISOString();
  } catch (_) {
    return null;
  }
}

export function buildPaymentLink(fields, { now = new Date(), webBase = DEFAULT_WEB_BASE } = {}) {
  const f = fields || {};
  const paymentStatus = String(f[PAYMENT_LINK_FIELD_IDS.paymentStatus]?.name ?? f[PAYMENT_LINK_FIELD_IDS.paymentStatus] ?? "").trim().toLowerCase();
  const sessionStatus = String(f[PAYMENT_LINK_FIELD_IDS.sessionStatus]?.name ?? f[PAYMENT_LINK_FIELD_IDS.sessionStatus] ?? "").trim().toLowerCase();
  if (sessionStatus === "cancelled" || sessionStatus === "canceled") return { ok: false, error: "job_cancelled", status: 409 };
  if (paymentStatus === "paid") return { ok: false, error: "already_paid", status: 409 };
  const token = extractCustomerToken(f[PAYMENT_LINK_FIELD_IDS.customerUrl]);
  if (!token) return { ok: false, error: "payment_link_unavailable", status: 404 };
  const expiresAt = tokenExpiryIso(token);
  if (expiresAt && new Date(expiresAt).getTime() <= now.getTime()) {
    return { ok: false, error: "payment_link_expired", status: 410, expires_at: expiresAt };
  }
  const base = String(webBase || DEFAULT_WEB_BASE).replace(/\/+$/, "");
  return {
    ok: true,
    status: 200,
    payment_link: {
      url: `${base}/sigil/pay?t=${encodeURIComponent(token)}`,
      expires_at: expiresAt,
      payment_status: paymentStatus || "pending",
      payment_ref: String(f[PAYMENT_LINK_FIELD_IDS.paymentRef] || "") || null,
    },
  };
}

export async function handleAdminDashboardPaymentLinkRequest(request, env, actor) {
  if (!actor) return linkJson({ ok: false, error: "unauthorized" }, 401);
  const method = request.method.toUpperCase();
  if (method !== "GET") return linkJson({ ok: false, error: "method_not_allowed" }, 405);

  const url = new URL(request.url);
  const sessionId = String(url.searchParams.get("session_id") || "").trim();
  if (url.searchParams.getAll("session_id").length !== 1 || !/^[A-Za-z0-9_-]{3,119}$/.test(sessionId)) {
    return linkJson({ ok: false, error: "invalid_session_id" }, 400);
  }
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return linkJson({ ok: false, error: "payment_link_unavailable" }, 503);
  }
  const table = env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE_ID;
  const qs = new URLSearchParams({ pageSize: "2", returnFieldsByFieldId: "true" });
  qs.set("filterByFormula", `{${PAYMENT_LINK_FIELD_IDS.sessionId}}="${sessionId}"`);
  for (const id of Object.values(PAYMENT_LINK_FIELD_IDS)) qs.append("fields[]", id);

  try {
    const response = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${qs}`, {
      headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
    });
    if (!response.ok) return linkJson({ ok: false, error: "payment_link_unavailable" }, 503);
    const data = await response.json();
    const records = (data.records || []).filter((r) => String(r.fields?.[PAYMENT_LINK_FIELD_IDS.sessionId] || "") === sessionId);
    if (records.length !== 1) return linkJson({ ok: false, error: "job_not_found" }, 404);
    const result = buildPaymentLink(records[0].fields, { webBase: env.WEB_BASE_URL || DEFAULT_WEB_BASE });
    const { status, ...body } = result;
    return linkJson(body, status);
  } catch (_) {
    return linkJson({ ok: false, error: "payment_link_unavailable" }, 503);
  }
}

function linkJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex",
    },
  });
}
