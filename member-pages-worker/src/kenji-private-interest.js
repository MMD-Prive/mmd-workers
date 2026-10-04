const AUTHORITY = "canonical_private_signup_catalog_v1";
const TABLE = "tblg2z8dENx75yHka";

export async function readKenjiPrivateSignupCatalog(env = {}) {
  const unavailable = { authority: AUTHORITY, status: "unavailable", packages: [] };
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return unavailable;
  try {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_PACKAGES || TABLE)}`);
    url.searchParams.set("filterByFormula", 'OR({code}="standard",{code}="premium")');
    url.searchParams.set("maxRecords", "3");
    for (const field of ["code", "price", "duration_days", "tier", "is_active", "require_approval"]) url.searchParams.append("fields[]", field);
    const request = new Request(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` }, signal: AbortSignal.timeout(2000) });
    const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
    if (!response.ok) return unavailable;
    const body = await response.json();
    if (!Array.isArray(body.records) || body.records.length !== 2) return unavailable;
    const packages = ["standard", "premium"].map(code => {
      const matches = body.records.filter(row => row.fields?.code === code);
      if (matches.length !== 1) return null;
      const f = matches[0].fields;
      if (f.is_active !== true || f.tier !== code || !Number.isSafeInteger(f.price) || f.price <= 0 || f.price > 250000 || f.duration_days !== (code === "standard" ? 365 : 730)) return null;
      return { code, price_thb: f.price, base_years: code === "standard" ? 1 : 2 };
    });
    return packages.every(Boolean) ? { authority: AUTHORITY, status: "verified", packages,
      // Latest owner-confirmed new-member policy (Oct 4). Information only;
      // no personal eligibility, payment, issuance or redeemable points claim.
      new_member_policy: { authority: "owner_approved_private_signup_20261004_v1", welcome_points: 66, premium_total_years: 2, eligibility_requires_review: true, payment_requires_verification: true } } : unavailable;
  } catch { return unavailable; }
}
