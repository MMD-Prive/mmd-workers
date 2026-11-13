import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planModelAssetReview, runCli } from './hype-model-asset-review.mjs';

const modelId = 'recSynthetic001';
const at = '2026-11-13T00:00:00.000Z';
const binding = { root_id: 'synthetic-root', folder_id: 'synthetic-folder', scope_key: 'portrait', evidence_ref: 'binding-read-1' };
function snapshot() {
  return { schema: 'hype_model_asset_snapshot_v1', captured_at: at, scope: { id: 'synthetic-scope', evidence_ref: 'scope-read-1', root_ids: ['synthetic-root'] }, models_complete: true,
    models: [{ model_id: modelId, folder_bindings: [{ ...binding }], inventory_complete: true, inventory_evidence_ref: 'inventory-read-1' }], assets: [] };
}
function asset(overrides = {}) {
  return { asset_id: 'synthetic-file', model_id: modelId, folder_id: binding.folder_id, root_id: binding.root_id, scope_key: binding.scope_key, revision: '1', content_sha256: 'a'.repeat(64), modified_at: '2026-01-01T00:00:00.000Z', kind: 'photo', template_id: null, identity_source: 'canonical_folder_binding', evidence_ref: 'file-read-1', ...overrides };
}
const plan = (s, options = {}) => planModelAssetReview(s, { targetTemplate: 'reviewed-layout-v2', ...options });
const kinds = result => result.tasks.flatMap(task => task.reasons.map(reason => reason.kind));

test('includes old model with no compcard independent of modification dates', () => {
  const s = snapshot(); s.assets = [asset()];
  assert.ok(kinds(plan(s)).includes('no_compcard_in_verified_scope'));
  assert.ok(kinds(plan(s)).includes('initial_baseline_review'));
  assert.ok(!kinds(plan(s)).includes('newly_observed_assets'));
});
test('empty complete model inventory is still included', () => assert.ok(kinds(plan(snapshot())).includes('no_compcard_in_verified_scope')));
test('partial inventories never prove a missing card', () => {
  const s = snapshot(); s.models[0].inventory_complete = false;
  assert.ok(kinds(plan(s)).includes('incomplete_inventory'));
  assert.ok(!kinds(plan(s)).includes('no_compcard_in_verified_scope'));
});
test('unclassified images prevent absence claims', () => {
  const s = snapshot(); s.assets = [asset({ kind: 'unknown' })];
  assert.ok(kinds(plan(s)).includes('unclassified_assets'));
  assert.ok(!kinds(plan(s)).includes('no_compcard_in_verified_scope'));
});
test('unbound model is a gap, not a missing card', () => {
  const s = snapshot(); s.models[0].folder_bindings = [];
  assert.ok(kinds(plan(s)).includes('missing_folder_binding'));
  assert.ok(!kinds(plan(s)).includes('no_compcard_in_verified_scope'));
});
test('legacy pattern requires explicit version evidence', () => {
  const s = snapshot(); s.assets = [asset({ kind: 'compcard', template_id: 'reviewed-layout-v1' })];
  assert.ok(kinds(plan(s)).includes('legacy_template_review'));
  s.assets[0].template_id = null;
  assert.ok(kinds(plan(s)).includes('template_review_required'));
  assert.ok(!kinds(plan(s)).includes('legacy_template_review'));
});
test('current template avoids repeating completed layout work', () => {
  const s = snapshot(); s.assets = [asset({ kind: 'compcard', template_id: 'reviewed-layout-v1' }), asset({ asset_id: 'current-card', kind: 'compcard', template_id: 'reviewed-layout-v2' })];
  assert.ok(!kinds(plan(s, { previous: s })).includes('legacy_template_review'));
  assert.equal(plan(s, { previous: s }).tasks.length, 0);
  assert.equal(plan(s).tasks.length, 0);
});
test('new file is newly observed, not assumed newly created model', () => {
  const old = snapshot(), s = snapshot(); s.assets = [asset()];
  assert.ok(kinds(plan(s, { previous: old })).includes('newly_observed_assets'));
});
test('changed bytes under same file ID reopen asset review', () => {
  const old = snapshot(); old.assets = [asset()]; const s = structuredClone(old); s.assets[0].content_sha256 = 'b'.repeat(64);
  assert.ok(kinds(plan(s, { previous: old })).includes('changed_assets'));
});
test('metadata revision alone with identical content does not create changed asset', () => {
  const old = snapshot(); old.assets = [asset()]; const s = structuredClone(old); s.assets[0].revision = '2'; s.assets[0].modified_at = at;
  assert.ok(!kinds(plan(s, { previous: old })).includes('changed_assets'));
});
test('revision or newly available hash without both hashes is unverified change', () => {
  const old = snapshot(); old.assets = [asset({ content_sha256: null })]; const s = structuredClone(old); s.assets[0].revision = '2';
  assert.ok(kinds(plan(s, { previous: old })).includes('asset_change_unverified'));
  assert.ok(!kinds(plan(s, { previous: old })).includes('changed_assets'));
  s.assets[0].revision = '1'; s.assets[0].content_sha256 = 'a'.repeat(64);
  assert.ok(kinds(plan(s, { previous: old })).includes('asset_change_unverified'));
});
test('removed files stay reviewable and incomplete scan does not claim absence', () => {
  const old = snapshot(); old.assets = [asset()]; const s = snapshot();
  assert.ok(kinds(plan(s, { previous: old })).includes('assets_absent_in_verified_scope'));
  s.models[0].inventory_complete = false;
  assert.ok(kinds(plan(s, { previous: old })).includes('asset_absence_unverified'));
});
test('model binding changes are surfaced even without files', () => {
  const old = snapshot(), s = snapshot(); s.models[0].folder_bindings[0].folder_id = 'different-folder';
  assert.ok(kinds(plan(s, { previous: old })).includes('model_folder_bindings_changed'));
});
test('same file moved across exact model bindings is not silently reused', () => {
  const old = snapshot(); old.assets = [asset()]; const s = structuredClone(old);
  s.models[0].folder_bindings[0].folder_id = 'new-folder'; s.assets[0].folder_id = 'new-folder';
  assert.ok(kinds(plan(s, { previous: old })).includes('asset_binding_changed'));
});
test('missing model list preserves whether global coverage is incomplete', () => {
  const old = snapshot(), s = snapshot(); s.models = []; s.models_complete = false;
  const result = plan(s, { previous: old });
  assert.deepEqual(result.absent_model_ids, [modelId]); assert.equal(result.absent_models_verified_in_scope, false);
});
test('unchanged evidence keeps stable review key and decisions never approve publication', () => {
  const s = snapshot(); const first = plan(s); const key = first.tasks[0].review_key;
  const decisions = [{ review_key: key, state: 'reviewed', reviewed_at: at, evidence_ref: 'review-note-1' }];
  s.captured_at = '2026-11-14T00:00:00.000Z';
  const result = plan(s, { decisions });
  assert.equal(result.tasks[0].review_key, key); assert.equal(result.tasks[0].state, 'reviewed');
  assert.equal(result.live_eligible, false); assert.equal(result.generation_permitted, false); assert.equal(result.publication_permitted, false);
  assert.equal(result.tasks[0].live_eligible, false);
});
test('new media, evidence or template invalidates old review decisions', () => {
  const s = snapshot(), key = plan(s).tasks[0].review_key;
  const decisions = [{ review_key: key, state: 'deferred', reviewed_at: at, evidence_ref: 'review-note-1' }];
  for (const change of [x => x.assets.push(asset()), x => x.models[0].inventory_evidence_ref = 'new-evidence']) {
    const next = structuredClone(s); change(next); assert.equal(plan(next, { decisions }).tasks[0].state, 'pending_review');
  }
  assert.equal(planModelAssetReview(s, { targetTemplate: 'next-template', decisions }).tasks[0].state, 'pending_review');
});
test('input order does not change work identity', () => {
  const s = snapshot(); s.assets = [asset(), asset({ asset_id: 'other-file' })];
  const before = plan(s); s.assets.reverse(); assert.deepEqual(plan(s), before);
});
test('input objects remain unchanged', () => { const s = snapshot(), before = structuredClone(s); plan(s); assert.deepEqual(s, before); });

for (const [name, change] of [
  ['duplicate canonical model', s => s.models.push(structuredClone(s.models[0]))],
  ['duplicate asset ID', s => s.assets.push(asset(), asset())],
  ['ambiguous folder binding', s => s.models.push({ ...structuredClone(s.models[0]), model_id: 'recSynthetic002' })],
  ['out of scope binding', s => s.models[0].folder_bindings[0].root_id = 'unapproved-root'],
  ['unbound asset', s => s.assets.push(asset({ folder_id: 'unknown-folder' }))],
  ['unknown model', s => s.assets.push(asset({ model_id: 'recSynthetic002' }))],
  ['fake canonical identity', s => s.models[0].model_id = 'nickname'],
  ['invalid timestamp', s => s.captured_at = 'yesterday'],
  ['future modified date', s => s.assets.push(asset({ modified_at: '2027-01-01T00:00:00.000Z' }))],
  ['missing completeness', s => delete s.models[0].inventory_complete],
  ['extra approval claim', s => s.approved = true],
  ['private profile or URL', s => s.assets.push({ ...asset(), url: 'https://example.com/private' })],
  ['photo template inference', s => s.assets.push(asset({ template_id: 'layout-v1' }))],
  ['hash injection', s => s.assets.push(asset({ content_sha256: 'not-a-hash' }))],
]) test(`rejects ${name}`, () => { const s = snapshot(); change(s); assert.throws(() => plan(s)); });

test('rejects mixed previous scope and reversed chronology', () => {
  const s = snapshot(), old = snapshot(); old.scope.id = 'wrong-scope'; assert.throws(() => plan(s, { previous: old }));
  old.scope.id = s.scope.id; old.captured_at = '2026-11-14T00:00:00.000Z'; assert.throws(() => plan(s, { previous: old }));
});
test('duplicate or approving decisions are rejected', () => {
  const s = snapshot(), review_key = plan(s).tasks[0].review_key;
  const decision = { review_key, state: 'reviewed', reviewed_at: at, evidence_ref: 'review-1' };
  assert.throws(() => plan(s, { decisions: [decision, decision] }));
  assert.throws(() => plan(s, { decisions: [{ ...decision, state: 'approved' }] }));
});
test('CLI local plan is private, repeat and symlink outputs cannot overwrite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-asset-review-'));
  try {
    const input = join(dir, 'input.json'), out = join(dir, 'plan.json'); await writeFile(input, JSON.stringify(snapshot()));
    const args = ['--current', input, '--target-template', 'layout-v2', '--out', out];
    const logs = []; await runCli(args, value => logs.push(value));
    assert.equal((await stat(out)).mode & 0o777, 0o600); assert.equal(JSON.parse(logs[0]).sent, false);
    const original = await readFile(out, 'utf8'); await assert.rejects(runCli(args)); assert.equal(await readFile(out, 'utf8'), original);
    const link = join(dir, 'link.json'); await symlink(input, link);
    await assert.rejects(runCli([...args.slice(0, -1), link]));
    assert.deepEqual(JSON.parse(await readFile(input, 'utf8')), snapshot());
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('CLI rejects malformed options before any writes', async () => {
  for (const args of [[], ['--current'], ['--publish', 'yes'], ['--current', 'a', '--current', 'b'], ['--current', '--out']]) await assert.rejects(runCli(args));
});
test('no network access is used during planning', () => {
  const oldFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error('network forbidden'); };
  try { assert.equal(plan(snapshot()).publication_permitted, false); } finally { globalThis.fetch = oldFetch; }
});

test('explicit reviewed Library links support shared card folders without name matching', () => {
  const s = snapshot();
  s.models.push({ ...structuredClone(s.models[0]), model_id: 'recSynthetic002', folder_bindings: [{ ...binding, folder_id: 'second-model-folder' }] });
  s.assets = [asset({ kind: 'compcard', folder_id: 'shared-card-folder', identity_source: 'reviewed_library_link', template_id: 'reviewed-layout-v2' }), asset({ asset_id: 'second-card', model_id: 'recSynthetic002', kind: 'compcard', folder_id: 'shared-card-folder', identity_source: 'reviewed_library_link', template_id: 'reviewed-layout-v2' })];
  assert.equal(plan(s, { previous: s }).tasks.length, 0);
  s.assets[0].kind = 'photo'; s.assets[0].template_id = null; assert.throws(() => plan(s));
});

test('binding object property order does not reopen a review', () => {
  const s = snapshot(), key = plan(s).tasks[0].review_key;
  const b = s.models[0].folder_bindings[0];
  s.models[0].folder_bindings[0] = { evidence_ref: b.evidence_ref, scope_key: b.scope_key, folder_id: b.folder_id, root_id: b.root_id };
  assert.equal(plan(s).tasks[0].review_key, key);
});

test('asset rebinding keeps a review for both source and destination Models', () => {
  const old = snapshot();
  old.models.push({ ...structuredClone(old.models[0]), model_id: 'recSynthetic002', folder_bindings: [{ ...binding, folder_id: 'second-folder' }] });
  old.assets = [asset({ kind: 'compcard', template_id: 'reviewed-layout-v2' }), asset({ asset_id: 'retained-card', kind: 'compcard', template_id: 'reviewed-layout-v2' })];
  const s = structuredClone(old); s.assets[0].model_id = 'recSynthetic002'; s.assets[0].folder_id = 'second-folder';
  const result = plan(s, { previous: old });
  const source = result.tasks.find(task => task.model_id === modelId);
  const destination = result.tasks.find(task => task.model_id === 'recSynthetic002');
  assert.ok(source.reasons.some(reason => reason.kind === 'asset_binding_departed'));
  assert.ok(destination.reasons.some(reason => reason.kind === 'asset_binding_changed'));
  assert.ok(!source.reasons.some(reason => reason.kind === 'assets_absent_in_verified_scope'));
});

test('canonical model IDs must be primitive strings, not coercible arrays', () => {
  const s = snapshot(); s.models[0].model_id = [modelId];
  assert.throws(() => plan(s), /canonical model ID/);
});
test('physical canonical folders cannot bind two Models through different scopes', () => {
  const s = snapshot();
  s.models.push({ ...structuredClone(s.models[0]), model_id: 'recSynthetic002', folder_bindings: [{ ...binding, scope_key: 'another-lane' }] });
  assert.throws(() => plan(s), /Ambiguous or duplicate folder binding/);
});
test('physical canonical folders cannot bind two Models through different roots', () => {
  const s = snapshot(); s.scope.root_ids.push('second-root');
  s.models.push({ ...structuredClone(s.models[0]), model_id: 'recSynthetic002', folder_bindings: [{ ...binding, root_id: 'second-root' }] });
  assert.throws(() => plan(s), /Ambiguous or duplicate folder binding/);
});
test('removed source bindings cannot prove missing assets or cards', () => {
  const old = snapshot(); old.models[0].folder_bindings.push({ ...binding, folder_id: 'retained-folder' });
  old.assets = [asset({ kind: 'compcard', template_id: 'reviewed-layout-v2' })];
  const s = structuredClone(old); s.models[0].folder_bindings = [s.models[0].folder_bindings[1]]; s.assets = [];
  const reasons = kinds(plan(s, { previous: old }));
  assert.ok(reasons.includes('model_folder_bindings_changed'));
  assert.ok(reasons.includes('asset_absence_unverified'));
  assert.ok(!reasons.includes('assets_absent_in_verified_scope'));
  assert.ok(!reasons.includes('no_compcard_in_verified_scope'));
});

for (const [label, malformed] of [['array', ['a'.repeat(64)]], ['object', { value: 'a'.repeat(64) }], ['number', 123]]) {
  test(`rejects JSON ${label} instead of content hash`, () => {
    const s = snapshot(); s.assets = [asset({ content_sha256: malformed })];
    assert.throws(() => plan(JSON.parse(JSON.stringify(s))), /Invalid content hash/);
  });
  test(`rejects JSON ${label} instead of review key`, () => {
    const decision = { review_key: malformed, state: 'reviewed', reviewed_at: at, evidence_ref: 'review-note-1' };
    assert.throws(() => plan(snapshot(), { decisions: JSON.parse(JSON.stringify([decision])) }), /Invalid review decision/);
  });
}
test('null model ID and review key are invalid while null content hash is explicit unknown', () => {
  const s = snapshot(); s.models[0].model_id = null; assert.throws(() => plan(s));
  const valid = snapshot(); valid.assets = [asset({ content_sha256: null })]; assert.doesNotThrow(() => plan(valid));
  assert.throws(() => plan(snapshot(), { decisions: [{ review_key: null, state: 'reviewed', reviewed_at: at, evidence_ref: 'review-1' }] }));
});
