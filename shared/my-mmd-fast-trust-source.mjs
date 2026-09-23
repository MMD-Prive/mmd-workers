export const MY_MMD_FAST_TRUST_SCHEMA = Object.freeze({
  canonicalTable: "MMD — LINE OFC Client Import Staging",
  canonicalLineUserIdField: "LINE User ID",
  canonicalRenamedNameField: "Current LINE Rename",
  canonicalClientField: "Canonical Client",
  legacyTable: "LINE OFC Client Import Staging",
  legacyLineUserIdField: "line_user_id",
  legacyRenamedNameField: "line_renamed_name",
});

export function resolveFastTrustAirtableSource(env = {}) {
  const table = clean(env.AIRTABLE_FAST_TRUST_LINE_OFC_STAGING_TABLE)
    || MY_MMD_FAST_TRUST_SCHEMA.canonicalTable;
  const legacy = table === MY_MMD_FAST_TRUST_SCHEMA.legacyTable;
  return {
    table,
    lineUserIdField: safeFieldName(
      env.AIRTABLE_FAST_TRUST_LINE_USER_ID_FIELD,
      legacy
        ? MY_MMD_FAST_TRUST_SCHEMA.legacyLineUserIdField
        : MY_MMD_FAST_TRUST_SCHEMA.canonicalLineUserIdField,
    ),
    renamedNameField: safeFieldName(
      env.AIRTABLE_FAST_TRUST_RENAMED_NAME_FIELD,
      legacy
        ? MY_MMD_FAST_TRUST_SCHEMA.legacyRenamedNameField
        : MY_MMD_FAST_TRUST_SCHEMA.canonicalRenamedNameField,
    ),
    canonicalClientField: safeFieldName(
      env.AIRTABLE_FAST_TRUST_CANONICAL_CLIENT_FIELD,
      MY_MMD_FAST_TRUST_SCHEMA.canonicalClientField,
    ),
  };
}

export function fastTrustLineFormula(lineUserId, source = resolveFastTrustAirtableSource()) {
  const lineId = String(lineUserId || "").trim();
  if (!/^U[0-9a-f]{32}$/i.test(lineId)) return "";
  const field = safeFieldName(source?.lineUserIdField, MY_MMD_FAST_TRUST_SCHEMA.canonicalLineUserIdField);
  return `{${field}}=${formulaString(lineId)}`;
}

export function fastTrustRenamedName(record, source = resolveFastTrustAirtableSource()) {
  const fields = record?.fields && typeof record.fields === "object" ? record.fields : {};
  const names = [
    source?.renamedNameField,
    MY_MMD_FAST_TRUST_SCHEMA.canonicalRenamedNameField,
    MY_MMD_FAST_TRUST_SCHEMA.legacyRenamedNameField,
  ].filter(Boolean);
  for (const name of names) {
    const value = clean(fields[name]);
    if (value) return value;
  }
  return "";
}

export function fastTrustHasCanonicalClient(record, source = resolveFastTrustAirtableSource()) {
  const fields = record?.fields && typeof record.fields === "object" ? record.fields : {};
  const value = fields[source?.canonicalClientField || MY_MMD_FAST_TRUST_SCHEMA.canonicalClientField];
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object" && Array.isArray(value.linkedRecordIds)) return value.linkedRecordIds.length > 0;
  return Boolean(clean(value));
}

export function fastTrustSchemaFieldNames(env = {}) {
  const source = resolveFastTrustAirtableSource(env);
  return {
    table: source.table,
    lineUserIdField: source.lineUserIdField,
    renamedNameField: source.renamedNameField,
    canonicalClientField: source.canonicalClientField,
  };
}

function safeFieldName(value, fallback) {
  const text = clean(value) || fallback;
  if (!text || text.length > 120 || /[{}\r\n]/.test(text)) return fallback;
  return text;
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function clean(value) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
