const DEFAULT_TABLES = Object.freeze({
  profiles: 'tblk0NqOj3NM5tEjs',
  offerRules: 'tblSbxUGTFqd2CgPy',
  models: 'tblI4B0bI446vp9GX',
  members: 'tblgWc5VRon5o8Mhk',
  clients: 'tblVv58TCbwh5j1fS'
});

export const MODEL_KEYWORD_POLICY_VERSION = 'model-keyword-line-v1';
export const MODEL_KEYWORD_BURST_THRESHOLD = 3;
export const MODEL_KEYWORD_BURST_WINDOW_MS = 10 * 60 * 1000;
export const MODEL_KEYWORD_LOOKUP_TIMEOUT_MS = 700;

const PROFILE_FIELDS = [
  'model_key',
  'folder_name',
  'working_name',
  'search_aliases',
  'customer_safe_info',
  'customer_safe_remark',
  'model_tier',
  'allowed_customer_scope',
  'photo_visibility_policy',
  'deposit_preview_gate',
  'status',
  'include_in_public_kenji'
];

const MEMBER_FIELDS = [
  'line_id',
  'Membership Status',
  'Membership Tier',
  'Membership Expiry',
  'Expire At',
  'Membership Active?',
  'VIP Eligible?',
  'SVIP Eligible?',
  'Black Card',
  'Tags',
  'Risk Flag',
  'Risk Level'
];

const CLIENT_FIELDS = [
  'line_user_id',
  'Status',
  'Membership Status',
  'Membership Tier',
  'Membership Expiry',
  'Expire At',
  'Membership Active?',
  'VIP Eligible?',
  'SVIP Eligible?',
  'Black Card',
  'Tags',
  'Client Name',
  'Client Name (Display)',
  'nickname'
];

function asString(value) {
  if (value && typeof value === 'object' && typeof value.name === 'string') {
    return value.name.trim();
  }
  return String(value || '').trim();
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(asString(value).toLowerCase());
}

function normalizeLookup(value) {
  return asString(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-z0-9ก-๙\\s]/gi, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function valuesFrom(value) {
  if (Array.isArray(value)) return value.flatMap(valuesFrom);
  return [asString(value)].filter(Boolean);
}

function fieldValues(fields, names) {
  return names.flatMap((name) => valuesFrom(fields?.[name]));
}

function splitAliases(value) {
  return valuesFrom(value)
    .flatMap((item) => item.split(/[\\n,|]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function recordFields(record) {
  return record?.fields && typeof record.fields === 'object' ? record.fields : record || {};
}

function profileName(profile) {
  const fields = recordFields(profile);
  return asString(fields.working_name || fields.model_key || fields.folder_name || 'นายแบบ');
}

function escapedFormulaValue(value) {
  return asString(value).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
}

function tableId(env, key) {
  const envKey = {
    profiles: 'AIRTABLE_MODEL_KEYWORD_PROFILES_TABLE_ID',
    offerRules: 'AIRTABLE_MODEL_OFFER_RULES_TABLE_ID',
    models: 'AIRTABLE_MODELS_TABLE_ID',
    members: 'AIRTABLE_MEMBERS_TABLE_ID',
    clients: 'AIRTABLE_CLIENTS_TABLE_ID'
  }[key];
  return asString(env?.[envKey] || DEFAULT_TABLES[key]);
}

function makeAirtableUrl(baseId, table, formula, fields = []) {
  const url = new URL('https://api.airtable.com/v0/' + baseId + '/' + encodeURIComponent(table));
  if (formula) url.searchParams.set('filterByFormula', formula);
  for (const field of fields) url.searchParams.append('fields[]', field);
  url.searchParams.set('pageSize', '100');
  return url;
}

async function fetchRecords({ env, table, formula, fields, fetchImpl, signal }) {
  const baseId = asString(env?.AIRTABLE_BASE_ID);
  const apiKey = asString(env?.AIRTABLE_API_KEY || env?.AIRTABLE_TOKEN);
  if (!baseId || !apiKey || !table) return [];

  try {
    const response = await fetchImpl(makeAirtableUrl(baseId, table, formula, fields), {
      method: 'GET',
      headers: {
        authorization: 'Bearer ' + apiKey,
        accept: 'application/json'
      },
      signal
    });
    if (!response?.ok) return [];
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload?.records) ? payload.records : [];
  } catch {
    return [];
  }
}

function withLookupDeadline(deadlineAt) {
  const remaining = Number(deadlineAt) > Date.now() ? Number(deadlineAt) - Date.now() : MODEL_KEYWORD_LOOKUP_TIMEOUT_MS;
  return Math.max(1, Math.min(MODEL_KEYWORD_LOOKUP_TIMEOUT_MS, remaining));
}

function createLookupSignal(deadlineAt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), withLookupDeadline(deadlineAt));
  return { controller, timeout };
}

function containsPriceRequest(text) {
  return /(ราคา|เรท|เท่าไหร่|เท่าไร|กี่บาท|price|rate|how much|บาท)/i.test(asString(text));
}

function scopeNames(profile) {
  return fieldValues(recordFields(profile), ['allowed_customer_scope'])
    .flatMap((value) => value.split(/[,|/]+/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeScope(value) {
  const text = normalizeLookup(value);
  if (text === 'black card' || text === 'blackcard' || text.includes('แบล็คการ์ด')) return 'Black Card';
  if (text === 'svip') return 'SVIP';
  if (text === 'vip') return 'VIP';
  if (text === '#potential' || text === 'potential') return '#Potential';
  return asString(value);
}

function accessScopes(records) {\n  const text = records\n    .flatMap((record) => fieldValues(recordFields(record), [\n      'Membership Tier',\n      'VIP Eligible?',\n      'SVIP Eligible?',\n      'Black Card',\n      'Tags',\n      'Status'\n    ]))\n    .join(' ');\n  const scopes = [];\n  if (/black\\s*card|blackcard|แบล็คการ์ด/i.test(text)) scopes.push('Black Card');\n  if (/\\bsvip\\b/i.test(text)) scopes.push('SVIP');\n  if (/(?<!s)\\bvip\\b/i.test(text)) scopes.push('VIP');\n  if (/#potential\\b/i.test(text)) scopes.push('#Potential');\n  return [...new Set(scopes)];\n}
