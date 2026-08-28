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

function accessScopes(records) {
  const text = fieldValues(records.flatMap((record) => [recordFields(record)]), [
    'Membership Tier',
    'VIP Eligible?',
    'SVIP Eligible?',
    'Black Card',
    'Tags',
    'Status'
  ]).join(' ');
  const scopes = [];
  if (/black\\s*card|blackcard|แบล็คการ์ด/i.test(text)) scopes.push('Black Card');
  if (/\\bsvip\\b/i.test(text)) scopes.push('SVIP');
  if (/(?<!s)\\bvip\\b/i.test(text)) scopes.push('VIP');
  if (/#potential\\b/i.test(text)) scopes.push('#Potential');
  return [...new Set(scopes)];
}

function isTruthy(value) {
  return value === true || ['1', 'true', 'yes', 'active', 'ใช่'].includes(asString(value).toLowerCase());
}

export function normalizeMemberAccess(records = [], now = Date.now()) {
  const normalizedRecords = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!normalizedRecords.length) {
    return { resolved: false, status: 'unknown', scopes: [], source: 'none' };
  }

  const fields = normalizedRecords.map(recordFields);
  const expiryValues = fields.flatMap((record) => [
    ...valuesFrom(record['Membership Expiry']),
    ...valuesFrom(record['Expire At'])
  ]);
  const expiryTimes = expiryValues.map((value) => Date.parse(value)).filter(Number.isFinite);
  const statusText = fields
    .flatMap((record) => fieldValues(record, ['Membership Status', 'Status', 'Membership Tier', 'Risk Flag']))
    .join(' ')
    .toLowerCase();
  const activeFlag = fields.some((record) => isTruthy(record['Membership Active?']));
  const expired = expiryTimes.some((time) => time <= now)
    || /expired|inactive|renewal[ _-]?due|หมดอายุ|ยกเลิก/.test(statusText);

  if (expired) {
    return { resolved: true, status: 'expired', scopes: accessScopes(normalizedRecords), source: 'airtable' };
  }

  const active = activeFlag || /active|current|grace|ใช้งาน|ปกติ/.test(statusText);
  if (active) {
    return { resolved: true, status: 'active', scopes: accessScopes(normalizedRecords), source: 'airtable' };
  }

  return { resolved: true, status: 'unknown', scopes: accessScopes(normalizedRecords), source: 'airtable' };
}

export function findModelKeywordMatch(profiles = [], text = '') {
  const normalizedText = normalizeLookup(text);
  if (!normalizedText) return null;

  const matches = [];
  for (const record of profiles) {
    const fields = recordFields(record);
    const candidates = [
      { value: fields.model_key, score: 100 },
      { value: fields.folder_name, score: 100 },
      { value: fields.working_name, score: 90 },
      ...splitAliases(fields.search_aliases).map((value) => ({ value, score: 70 }))
    ];
    let best = null;
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeLookup(candidate.value);
      if (!normalizedCandidate || normalizedCandidate.length < 2) continue;
      const exact = normalizedText === normalizedCandidate;
      const contained = normalizedText.includes(normalizedCandidate);
      if (!exact && !contained) continue;
      const score = candidate.score + (exact ? 20 : 0) + Math.min(normalizedCandidate.length, 20) / 100;
      if (!best || score > best.score) {
        best = { score, phrase: normalizedCandidate };
      }
    }
    if (best) {
      matches.push({
        profile: { ...fields, record_id: asString(record.id) },
        score: best.score,
        phrase: best.phrase
      });
    }
  }

  matches.sort((a, b) => b.score - a.score || b.phrase.length - a.phrase.length);
  if (!matches[0]) return null;
  if (
    matches[1]
    && Math.abs(matches[0].score - matches[1].score) < 0.001
    && matches[0].profile.model_key !== matches[1].profile.model_key
  ) {
    return null;
  }
  return matches[0];
}

export function isModelScopeAllowed(profile, access) {
  if (access?.status !== 'active') return false;
  const tier = normalizeLookup(recordFields(profile).model_tier);
  if (!['gws', 'ems'].includes(tier)) return true;
  const allowed = scopeNames(profile).map(normalizeScope);
  return allowed.some((scope) => access.scopes.includes(scope));
}

export function buildModelKeywordReply({
  profile,
  access,
  recentQueryCount = 1,
  priceRequested = false
} = {}) {
  const name = profileName(profile);
  const fields = recordFields(profile);
  const safeInfo = asString(fields.customer_safe_info);
  const safeRemark = asString(fields.customer_safe_remark);

  if (access?.status === 'expired') {
    return {
      text: 'ข้อมูลของ ' + name + ' ยังพอเช็กได้ครับ แต่ตอนนี้สมาชิกของคุณหมดอายุแล้ว จึงยังไม่สามารถส่งรูปหรือรายละเอียดเพิ่มเติมได้ หากต้องการดูต่อ สามารถต่ออายุสมาชิกกับ MMD ได้ครับ',
      send_image: false,
      send_price: false,
      handoff_required: false,
      reason: 'membership_expired',
      burst: false
    };
  }

  if (access?.status !== 'active') {
    return {
      text: 'ผมขอตรวจสอบสถานะสมาชิกก่อนนะครับ ตอนนี้ยังไม่สามารถเปิดรายละเอียดหรือรูปของ ' + name + ' ได้ครับ',
      send_image: false,
      send_price: false,
      handoff_required: true,
      reason: 'membership_status_unresolved',
      burst: false
    };
  }

  if (recentQueryCount >= MODEL_KEYWORD_BURST_THRESHOLD) {
    return {
      text: 'เลือกคนที่ถูกใจที่สุดมา 3 คนก่อนนะครับ เดี๋ยวเปอร์ช่วยเช็กข้อมูลและรายละเอียดให้ต่อเป็นชุด จะได้ไม่สับสนครับ',
      send_image: false,
      send_price: false,
      handoff_required: true,
      reason: 'model_keyword_burst',
      burst: true
    };
  }

  if (!isModelScopeAllowed(profile, access)) {
    return {
      text: 'รับชื่อ ' + name + ' ไว้แล้วครับ รายละเอียดของกลุ่มนี้ต้องตรวจสิทธิ์สมาชิกก่อน หากมีคนที่สนใจที่สุดส่งมาให้ผมได้ครับ',
      send_image: false,
      send_price: false,
      handoff_required: true,
      reason: 'model_scope_not_allowed',
      burst: false
    };
  }

  const text = [safeInfo, safeRemark]
    .filter(Boolean)
    .join('\\n\\n')
    .concat(
      priceRequested
        ? '\\n\\nเรื่องเรท ผมขอให้เปอร์ตรวจเป็นเคสส่วนตัวก่อนนะครับ เพราะเรทขึ้นกับสถานะและรายละเอียดของแต่ละเคสครับ'
        : ''
    )
    .trim();

  return {
    text: text || 'ผมรับชื่อ ' + name + ' ไว้แล้วครับ เดี๋ยวเปอร์ช่วยตรวจรายละเอียดให้ต่อครับ',
    send_image: false,
    send_price: false,
    handoff_required: priceRequested,
    reason: priceRequested ? 'price_requires_per_review' : 'model_keyword_match',
    burst: false
  };
}

async function trackRecentQuery(env, lineUserId, modelKey, now) {
  const kv = env?.MODEL_KEYWORD_QUERY_KV;
  if (!kv || !lineUserId) return 1;

  try {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(lineUserId + ':' + modelKey)
    );
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const key = 'model-keyword:' + hash;
    const stored = await kv.get(key, { type: 'json' });
    const entries = (Array.isArray(stored) ? stored : [])
      .filter((entry) => Number(entry?.at) > now - MODEL_KEYWORD_BURST_WINDOW_MS);
    entries.push({ at: now });
    await kv.put(key, JSON.stringify(entries), { expirationTtl: Math.ceil(MODEL_KEYWORD_BURST_WINDOW_MS / 1000) });
    return entries.length;
  } catch {
    return 1;
  }
}

export async function resolveModelKeywordRequest({
  env = {},
  text = '',
  lineUserId = '',
  fetchImpl = fetch,
  deadlineAt = 0,
  now = Date.now()
} = {}) {
  if (!isEnabled(env.LINE_KENJI_MODEL_KEYWORD_ENABLED) || !asString(text)) {
    return { matched: false, enabled: false };
  }

  const signalState = createLookupSignal(deadlineAt);
  try {
    const profiles = await fetchRecords({
      env,
      table: tableId(env, 'profiles'),
      formula: 'AND({status}="Active")',
      fields: PROFILE_FIELDS,
      fetchImpl,
      signal: signalState.controller.signal
    });
    const match = findModelKeywordMatch(profiles, text);
    if (!match) return { matched: false, enabled: true };

    const safeLineUserId = asString(lineUserId);
    if (!safeLineUserId) {
      const reply = buildModelKeywordReply({
        profile: match.profile,
        access: { status: 'unknown', scopes: [] },
        priceRequested: containsPriceRequest(text)
      });
      return { matched: true, profile: match.profile, access: { status: 'unknown', scopes: [] }, reply, recent_query_count: 0 };
    }

    const formulaValue = escapedFormulaValue(safeLineUserId);
    const [members, clients] = await Promise.all([
      fetchRecords({
        env,
        table: tableId(env, 'members'),
        formula: '{line_id}="' + formulaValue + '"',
        fields: MEMBER_FIELDS,
        fetchImpl,
        signal: signalState.controller.signal
      }),
      fetchRecords({
        env,
        table: tableId(env, 'clients'),
        formula: '{line_user_id}="' + formulaValue + '"',
        fields: CLIENT_FIELDS,
        fetchImpl,
        signal,
        signal: signalState.controller.signal
      })
    ]);
    const access = normalizeMemberAccess([...members, ...clients], now);
    const recentQueryCount = await trackRecentQuery(
      env,
      safeLineUserId,
      asString(match.profile.model_key || match.profile.folder_name),
      now
    );
    const reply = buildModelKeywordReply({
      profile: match.profile,
      access,
      recentQueryCount,
      priceRequested: containsPriceRequest(text)
    });
    return {
      matched: true,
      profile: match.profile,
      access,
      recent_query_count: recentQueryCount,
      reply
    };
  } finally {
    clearTimeout(signalState.timeout);
  }
}
