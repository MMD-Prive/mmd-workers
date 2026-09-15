const AIRTABLE_API = "https://api.airtable.com/v0";
const ENTITLEMENTS_TABLE = "tblNImdF9PKAxhXGi";

function clean(value, max = 1000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function code(value) {
  return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isRecordId(value) {
  return /^rec[a-zA-Z0-9]{10,}$/.test(clean(value, 120));
}

function addUtcYears(value, years) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

async function patchEntitlement(env, recordId, fields) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  const table = clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || ENTITLEMENTS_TABLE, 160);
  if (!baseId || !apiKey || !isRecordId(recordId)) throw new Error("premium_term_airtable_not_ready");
  const url = `${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  const request = new Request(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  if (!response.ok) throw new Error(`premium_term_airtable_${response.status}`);
}

function rebuild(response, data) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function reconcilePremiumReviewedMembershipTerm(request, response, env = {}) {
  if (!response?.ok) return response;
  const body = await request.clone().json().catch(() => null);
  if (!body || code(body.package_code || body.package) !== "premium") return response;

  const data = await response.clone().json().catch(() => null);
  if (!data?.ok || data.entitlement_materialized !== true || !isRecordId(data.entitlement_record_id)) return response;

  // New reviewed-proof materialization is already canonical: Premium is two
  // calendar years from verified payment. Keep this wrapper only as a
  // backward-compatibility guard for legacy one-year responses so a canonical
  // response can never be extended to three years.
  if (data.membership_term === "2_years" || data.membership_expiry_rule === "2_years_from_verified_payment") {
    return response;
  }

  const oneYearExpiry = clean(data.membership_expire_at, 120);
  const twoYearExpiry = addUtcYears(oneYearExpiry, 1);
  if (!twoYearExpiry) return response;

  try {
    await patchEntitlement(env, data.entitlement_record_id, {
      expire_at: twoYearExpiry.toISOString(),
      membership_expiry_rule: "2_years_from_verified_payment",
    });
  } catch (error) {
    return rebuild(response, {
      ...data,
      ok: false,
      error: clean(error?.message || error || "premium_term_reconcile_failed", 300),
      authority: "payments-worker",
    });
  }

  return rebuild(response, {
    ...data,
    membership_expire_at: twoYearExpiry.toISOString(),
    membership_term: "2_years",
    membership_expiry_rule: "2_years_from_verified_payment",
    premium_term_reconciled: true,
  });
}
