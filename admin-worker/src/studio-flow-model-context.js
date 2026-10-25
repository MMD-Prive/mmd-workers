import { projectCardDesign } from './model-card-design.js';

// Read-only Studio projection. The caller owns the existing Studio admin gate.
const RECORD = /^rec[A-Za-z0-9]{14,24}$/;
const clean = value => String(value ?? '').trim();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const table = env => clean(env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || 'Models');
const formulaText = value => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

async function read(env, suffix) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw fail('model_context_unavailable', 503);
  const endpoint = `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table(env))}${suffix}`;
  let response;
  try {
    response = await fetch(endpoint, {
      headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
  } catch { throw fail('model_context_unavailable', 503); }
  if (response.status === 404) throw fail('model_not_found', 404);
  if (!response.ok) throw fail('model_context_unavailable', 503);
  try { return await response.json(); } catch { throw fail('model_context_unavailable', 503); }
}

export function projectStudioModelContext(record, env = {}) {
  const projection = projectCardDesign(record, env);
  const fields = record.fields || {};
  const design = projection.ok ? projection.design : null;
  const exclusive = design && ['GWs', 'EMs'].includes(design.field);
  return {
    ok: true,
    ready: projection.ok,
    model_record_id: record.id,
    context: {
      display_name: clean(fields.working_name),
      height_cm: design?.height || null,
      weight_kg: design?.weight || null,
      field: design?.field || '',
      world: design?.world || '',
      layer: design ? (design.world === 'public' ? 'Public / MMD Privé' : 'Private / SIGIL') : '',
      run_number: exclusive ? design.title : '',
      model_asset_policy: design ? (exclusive ? 'ai_generated' : 'real_photo') : '',
      province: design?.province || '',
    },
    blockers: projection.ok ? [] : projection.missing,
  };
}

export async function readStudioModelContext(env, modelRecordId) {
  const id = clean(modelRecordId);
  if (!RECORD.test(id)) throw fail('invalid_model_record_id');
  const record = await read(env, `/${encodeURIComponent(id)}`);
  if (record.id !== id) throw fail('model_context_unavailable', 503);
  return projectStudioModelContext(record, env);
}

export async function searchStudioModels(env, query) {
  const q = clean(query).slice(0, 80);
  if (q.length < 2) return { ok: true, items: [] };
  const params = new URLSearchParams({
    maxRecords: '20',
    filterByFormula: `AND({working_name}!="",SEARCH("${formulaText(q.toLowerCase())}",LOWER({working_name})))`,
  });
  const result = await read(env, `?${params}`);
  return {
    ok: true,
    items: (Array.isArray(result.records) ? result.records : []).filter(record => RECORD.test(record.id || '')).map(record => {
      const projected = projectStudioModelContext(record, env);
      return { model_record_id: record.id, display_name: projected.context.display_name, ready: projected.ready, field: projected.context.field, world: projected.context.world };
    }),
  };
}
