// Server-only projection for internal booking notifications. Never an entitlement.
const INDEX = 'tblwn6I9VWie5d7Ui';
const CLIENTS = 'tblVv58TCbwh5j1fS';
const recordId = value => /^rec[A-Za-z0-9]{14,24}$/.test(value || '');
const lineId = value => /^U[0-9a-f]{32}$/i.test(value || '');
const clean = value => typeof value === 'string' ? value.trim() : '';
const quote = value => JSON.stringify(value);
export async function resolveBookingPerRename(env, verifiedLineUserId) {
  if (!lineId(verifiedLineUserId) || !env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return null;
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      lookup(env, verifiedLineUserId, controller.signal),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('identity_timeout')); }, 3000); }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}
async function lookup(env, uid, signal) {
  const table = env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID || env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX || INDEX;
  const rows = await listAll(env, table, 'line_user_id', uid, signal);
  return project(env, uid, rows, signal);
}
async function listAll(env, table, field, uid, signal) {
  const rows = [], offsets = new Set(); let offset = '';
  do {
    const qs = new URLSearchParams({ filterByFormula: `{${field}}=${quote(uid)}`, pageSize: '100' });
    if (offset) qs.set('offset', offset);
    const page = await read(env, table, qs, signal);
    if (!Array.isArray(page.records)) throw Error('identity_malformed');
    rows.push(...page.records);
    offset = clean(page.offset);
    if (rows.length > 2000 || (offset && (rows.length >= 2000 || offsets.has(offset)))) throw Error('identity_incomplete');
    offsets.add(offset);
  } while (offset);
  return rows;
}
async function project(env, uid, rows, signal) {
  const matches = rows.filter(row => {
    const f = row.fields || {};
    return f.line_user_id === uid && clean(f.identity_key).toLowerCase().startsWith('line_ofc_per_rename:')
      && f.source_type === 'line_ofc_staging' && f.resolution_status === 'linked'
      && f.session_lookup_status === 'canonical_ready' && f.candidate_only !== true
      && Array.isArray(f.linked_client) && f.linked_client.length === 1 && recordId(f.linked_client[0])
      && clean(f.preferred_name);
  });
  if (!matches.length) return null;
  // Conflicting/incomplete same-UID evidence must not disappear during filtering.
  if (rows.some(row => row.fields?.line_user_id !== uid || !matches.includes(row))) return null;
  const ids = new Set(matches.map(row => row.fields.linked_client[0]));
  // Never choose between conflicting canonical identities or remembered names.
  const names = new Set(matches.map(row => clean(row.fields.preferred_name)));
  if (ids.size !== 1 || names.size !== 1) return null;
  const id = [...ids][0], clients = env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CLIENTS;
  const currentStaging = await listAll(env, env.AIRTABLE_TABLE_LINE_OFC_CURRENT_STAGING_ID || 'tblOs8yyLK09SKrCt', 'LINE User ID', uid, signal);
  const legacyStaging = await listAll(env, env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || 'tbl1u0foFBvgFpT9G', 'line_user_id', uid, signal);
  for (const row of currentStaging) {
    const f=row.fields || {};
    if (f['LINE User ID'] !== uid || f['Import Status'] !== 'matched' || !Array.isArray(f['Canonical Client']) || f['Canonical Client'].length !== 1 || f['Canonical Client'][0] !== id || clean(f['Current LINE Rename']) !== [...names][0]) return null;
  }
  for (const row of legacyStaging) {
    const f=row.fields || {};
    if (f.line_user_id !== uid || f.review_status !== 'committed' || f.decision !== 'link_existing_client' || f.match_type !== 'line_user_id_exact' || f.dry_run_only === true || !Array.isArray(f.matched_client) || f.matched_client.length !== 1 || f.matched_client[0] !== id || (clean(f.line_renamed_name) && clean(f.line_renamed_name) !== [...names][0])) return null;
  }
  for (const row of matches) {
    const f=row.fields;
    let ownerEvidence=false;
    try { ownerEvidence=f.source_record_id === 'owner:'+id && f.confidence === 'owner_confirmed' && JSON.parse(f.source_snapshot_json || '{}').schema === 'mmd_owner_customer_identity_v1'; } catch {}
    if (!ownerEvidence && !currentStaging.some(source=>source.id===f.source_record_id) && !legacyStaging.some(source=>source.id===f.source_record_id && clean(source.fields?.line_renamed_name) === [...names][0])) return null;
  }

  const direct = await read(env, clients, new URLSearchParams({filterByFormula:`{line_user_id}=${quote(uid)}`,maxRecords:'2'}), signal);
  if (!Array.isArray(direct.records) || direct.records.length > 1 || (direct.records.length === 1 && direct.records[0].id !== id) || direct.offset) return null;
  const client = await read(env, clients + '/' + id, null, signal);
  if (client.id !== id || (clean(client.fields?.line_user_id) && client.fields.line_user_id !== uid)) return null;
  const name = [...names][0].replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').slice(0,160);
  if (!name || /U[0-9a-f]{32}/i.test(name)) return null;
  return { per_rename: name, source: 'linked_per_rename_index_v1' };
}
async function read(env, table, qs, signal) {
  if (signal.aborted) throw Error('identity_timeout');
  const url = 'https://api.airtable.com/v0/' + encodeURIComponent(env.AIRTABLE_BASE_ID) + '/' + table.split('/').map(encodeURIComponent).join('/') + (qs ? '?' + qs : '');
  const init = {headers:{authorization:'Bearer '+env.AIRTABLE_API_KEY}, signal};
  const response = await (env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(new Request(url,init)) : fetch(url,init));
  if (!response.ok) throw Error('identity_unavailable');
  return response.json();
}
