import { fastTrustLineFormula, fastTrustSchemaFieldNames, resolveFastTrustAirtableSource } from "../shared/my-mmd-fast-trust-source.mjs";

const token = String(process.env.AIRTABLE_API_KEY || "").trim();
const baseId = String(process.env.AIRTABLE_BASE_ID || "").trim();
if (!token) throw new Error("AIRTABLE_API_KEY is required");
if (!baseId) throw new Error("AIRTABLE_BASE_ID is required");

const source = resolveFastTrustAirtableSource(process.env);
const fields = fastTrustSchemaFieldNames(process.env);
const probeLine = "U00000000000000000000000000000000";
const formula = fastTrustLineFormula(probeLine, source);
if (!formula) throw new Error("Fast Trust probe formula could not be built");

const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(source.table)}`);
url.searchParams.set("filterByFormula", formula);
url.searchParams.set("maxRecords", "1");
for (const field of [fields.lineUserIdField, fields.renamedNameField, fields.canonicalClientField]) {
  url.searchParams.append("fields[]", field);
}

const response = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
    accept: "application/json",
  },
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || !Array.isArray(payload.records)) {
  const type = String(payload?.error?.type || `HTTP_${response.status}`).slice(0, 120);
  const message = String(payload?.error?.message || "").slice(0, 200);
  throw new Error(`My MMD Fast Trust Airtable schema preflight failed: ${type}${message ? `: ${message}` : ""}`);
}

console.log(JSON.stringify({
  ok: true,
  table: fields.table,
  line_user_id_field: fields.lineUserIdField,
  renamed_name_field: fields.renamedNameField,
  canonical_client_field: fields.canonicalClientField,
  returned_records: payload.records.length,
}));
