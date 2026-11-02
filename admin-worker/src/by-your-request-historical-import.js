const API = 'https://api.airtable.com/v0';
export const HISTORICAL_IMPORT_PATH = '/v1/admin/my-mmd/your-request/historical-import';
const TABLE = 'MMD — Console Inbox';
const EXAMPLES = Object.freeze([
  { historical_key: 'line:410:324', conversation_date: '2025-07-28T14:36:00+07:00', source_ref: '410_20240214_20260724_เดียร์ 8 สค 68.csv row 324-328', query: 'คนนี้อยู่ในโมนี้มัยคับ' },
  { historical_key: 'line:26:3485', conversation_date: '2026-05-05T16:53:00+07:00', source_ref: '26_20250808_20261022_สิงโตน้ำ 9 ตค 68.csv rows 3485-3488', query: 'คุณเปอร์รู้จักไหม' },
  { historical_key: 'line:31:1004', conversation_date: '2025-04-12T16:55:00+07:00', source_ref: '31_20240111_20261021_แท 3 สค 67.csv rows 1004-1006', query: 'คนนี้รับงานไหมค้าบ', social_url: 'https://instagram.com/double.jira' },
  { historical_key: 'line:47:4268', conversation_date: '2025-09-08T14:55:00+07:00', source_ref: '47_20240103_20261017_ปอง - VIP -.csv row 4268', query: 'ติดต่อได้ไหม', social_url: 'https://tiktok.com/@life_withbank' },
]);

export function isHistoricalImportRequest(path, method = 'POST') { return path === HISTORICAL_IMPORT_PATH && String(method).toUpperCase() === 'POST'; }
export async function handleHistoricalImport(request, env, actor) {
  if (!actor?.id) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);
  const body = await request.json().catch(() => null);
  if (!body?.import_authorized || !Array.isArray(body.records)) return json({ ok: false, error: 'IMPORT_AUTHORIZATION_AND_RECORDS_REQUIRED' }, 400);
  const rows = body.records.map(normalizeRow); if (rows.some(row => !row.ok)) return json({ ok: false, error: 'HISTORICAL_RECORD_INVALID' }, 400);
  const unique = [...new Map(rows.map(row => [row.value.historical_key, row.value])).values()];
  if (body.dry_run !== false) return json({ ok: true, dry_run: true, quota_exempt: true, records: unique, count: unique.length });
  try {
    const existing = await listExisting(env); const seen = new Set(existing.map(record => parse(record.fields?.payload_json).historical_key).filter(Boolean)); const imported = [];
    for (const row of unique) { if (seen.has(row.historical_key)) continue; const payload = { schema: 'mmd_customer_request_v1', request_id: `hist_${hashKey(row.historical_key)}`, request_type: 'your_request', source: 'line_history_import', archival: true, quota_exempt: true, historical_key: row.historical_key, created_at: row.conversation_date, status: 'reviewing', canonical_client_id: row.canonical_client_id || null, model: { display_name: row.model_name || null, social: row.social_url || null, reason: row.query, audience: 'unknown' }, evidence_ids: [], missing_original: row.missing_original, historical_provenance: { source_ref: row.source_ref, conversation_date: row.conversation_date, query: row.query }, visibility: 'internal_only' }; imported.push(await create(env, { source: 'line', intent: 'your_request', line_id: payload.request_id, admin_note: `Historical Your Request · ${row.historical_key}`, payload_json: JSON.stringify(payload), status: 'new' })); }
    return json({ ok: true, dry_run: false, quota_exempt: true, imported: imported.length, skipped_duplicates: unique.length - imported.length });
  } catch { return json({ ok: false, error: 'HISTORICAL_IMPORT_UNAVAILABLE' }, 503); }
}
function normalizeRow(row) { if (!row || typeof row !== 'object') return { ok: false }; const historical_key = text(row.historical_key, 160); const source_ref = text(row.source_ref, 500); const query = text(row.query, 1800); const date = text(row.conversation_date, 80); const canonical = text(row.canonical_client_id, 80); if (!historical_key || !source_ref || !query || Number.isNaN(Date.parse(date)) || canonical && !/^rec[A-Za-z0-9]{10,32}$/.test(canonical)) return { ok: false }; return { ok: true, value: { historical_key, source_ref, query, conversation_date: new Date(date).toISOString(), canonical_client_id: canonical || null, model_name: text(row.model_name, 160) || null, social_url: safeUrl(row.social_url), missing_original: row.missing_original !== false } }; }
async function listExisting(env) { const data = await airtable(env, `?pageSize=100&maxRecords=100&filterByFormula=${encodeURIComponent("{source}='line'")}`); return data.records || []; }
async function create(env, fields) { return airtable(env, '', '', { method: 'POST', body: JSON.stringify({ fields }) }); }
async function airtable(env, suffix = '', query = '', init = {}) { const key = text(env.AIRTABLE_API_KEY, 2000); const base = text(env.AIRTABLE_BASE_ID, 100); const table = text(env.AIRTABLE_TABLE_CONSOLE_INBOX, 180) || TABLE; if (!key || !base) throw Error('config'); const fetcher = env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch.bind(env.AIRTABLE_HTTP) : fetch; const response = await fetcher(`${API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}${suffix}${query}`, { ...init, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' } }); if (!response.ok) throw Error('airtable'); return response.json(); }
function parse(value) { try { return JSON.parse(value || '{}'); } catch { return {}; } }
function text(value, max) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function safeUrl(value) { try { const url = new URL(text(value, 500)); return url.protocol === 'https:' ? url.toString() : null; } catch { return null; } }
function hashKey(value) { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0), 16777619); return (hash >>> 0).toString(16).padStart(8, '0') + value.replace(/[^a-z0-9]/gi, '').slice(-12); }
function json(data, status = 200) { return Response.json(data, { status, headers: { 'cache-control': 'no-store, private' } }); }
