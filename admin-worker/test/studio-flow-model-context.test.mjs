import test from 'node:test';
import assert from 'node:assert/strict';
import { projectStudioModelContext, readStudioModelContext, searchStudioModels } from '../src/studio-flow-model-context.js';

const id = 'recAAAAAAAAAAAAAA';
const env = { AIRTABLE_API_KEY: 'test-only', AIRTABLE_BASE_ID: 'base-test' };
const fields = { working_name: 'Ice T', sales_layer: 'public', 'MMD Public Category': 'Travel', height_cm: 178, weight_kg: 69, status: 'active' };
test('Studio projection preserves canonical names, classification and source privacy', () => {
  for (const name of ['Ice T', 'Todd TR', 'ชื่อภาษาไทย']) {
    const result = projectStudioModelContext({ id, fields: { ...fields, working_name: name, private_original_key: 'must-not-leak', line_user_id: 'must-not-leak' } });
    assert.equal(result.context.display_name, name); assert.equal(result.context.field, 'EN');
    assert.equal(result.context.layer, 'Public / MMD Privé'); assert.equal(result.ready, true);
    assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
  }
});
test('exclusive context preserves full assigned RUN and requires protected image policy', () => {
  const result = projectStudioModelContext({ id, fields: { ...fields, working_name: 'EMs19', sales_layer: 'private', recognition_class: 'EMs' } });
  assert.equal(result.ready, true); assert.equal(result.context.run_number, 'EMs19');
  assert.equal(result.context.model_asset_policy, 'ai_generated');
});
test('incomplete or conflicting canonical context stays unavailable', () => {
  const incomplete = projectStudioModelContext({ id, fields: { ...fields, weight_kg: '' } });
  assert.equal(incomplete.ready, false); assert.equal(incomplete.context.field, '');
  assert.equal(incomplete.context.model_asset_policy, ''); assert.ok(incomplete.blockers.includes('weight_kg'));
  assert.equal(projectStudioModelContext({ id, fields: { ...fields, recognition_class: 'GWs' } }).ready, false);
});
test('search is read-only, safely quotes the formula and limits returned fields', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, undefined);
    const u = new URL(url); assert.equal(u.searchParams.get('maxRecords'), '20');
    assert.ok(u.searchParams.get('filterByFormula').includes('ice\\"'));
    return Response.json({ records: [{ id, fields: { ...fields, email: 'private@example.test' } }] });
  };
  try {
    const result = await searchStudioModels(env, 'Ice"');
    assert.deepEqual(Object.keys(result.items[0]).sort(), ['display_name', 'field', 'model_record_id', 'ready', 'world']);
  } finally { globalThis.fetch = previous; }
});
test('context lookup rejects malformed identifiers and hides provider errors', async () => {
  await assert.rejects(readStudioModelContext(env, '../Models'), /invalid_model_record_id/);
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response('secret provider detail', { status: 500 });
  try { await assert.rejects(readStudioModelContext(env, id), error => error.message === 'model_context_unavailable' && error.status === 503); }
  finally { globalThis.fetch = previous; }
});
