#!/usr/bin/env node
// Local metadata reconciliation only. No credentials, network, media or runtime imports.
import { createHash } from 'node:crypto';
import { open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_INPUT_BYTES = 10_000_000;
const MAX_ROWS = 20_000;
const fail = message => { throw new Error(message); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ordered = values => [...values].sort();
function text(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(value)) fail(`Invalid ${label}`);
  return value;
}
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) fail(`Invalid ${label} fields`);
}
function date(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(`Invalid ${label}`);
  return Date.parse(value);
}
function rows(value, label) {
  if (!Array.isArray(value) || value.length > MAX_ROWS) fail(`Invalid ${label}`);
}
function ids(value, label) {
  rows(value, label);
  value.forEach(id => text(id, label));
  if (new Set(value).size !== value.length) fail(`Duplicate ${label}`);
}
function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`Duplicate ${label}`);
}
function modelId(id) {
  if (!/^rec[A-Za-z0-9]{8,40}$/.test(id || '')) fail('Invalid canonical model ID');
}

export function validateSnapshot(snapshot) {
  exact(snapshot, ['schema', 'captured_at', 'scope', 'models_complete', 'models', 'assets'], 'snapshot');
  if (snapshot.schema !== 'hype_model_asset_snapshot_v1') fail('Unsupported snapshot');
  const captured = date(snapshot.captured_at, 'captured_at');
  exact(snapshot.scope, ['id', 'evidence_ref', 'root_ids'], 'scope');
  text(snapshot.scope.id, 'scope ID'); text(snapshot.scope.evidence_ref, 'scope evidence');
  ids(snapshot.scope.root_ids, 'root IDs');
  if (!snapshot.scope.root_ids.length || typeof snapshot.models_complete !== 'boolean') fail('Explicit scope and model coverage required');
  rows(snapshot.models, 'models'); rows(snapshot.assets, 'assets');
  unique(snapshot.models.map(model => model?.model_id), 'model ID');
  const models = new Map();
  const bindings = new Set();
  for (const model of snapshot.models) {
    exact(model, ['model_id', 'folder_bindings', 'inventory_complete', 'inventory_evidence_ref'], 'model');
    modelId(model.model_id);
    if (typeof model.inventory_complete !== 'boolean') fail('Explicit model inventory coverage required');
    text(model.inventory_evidence_ref, 'inventory evidence');
    rows(model.folder_bindings, 'folder bindings');
    const folders = new Set();
    for (const binding of model.folder_bindings) {
      exact(binding, ['root_id', 'folder_id', 'scope_key', 'evidence_ref'], 'binding');
      for (const key of Object.keys(binding)) text(binding[key], key);
      if (!snapshot.scope.root_ids.includes(binding.root_id)) fail('Binding outside approved roots');
      const key = `${binding.root_id}/${binding.folder_id}/${binding.scope_key}`;
      if (bindings.has(key) || folders.has(binding.folder_id)) fail('Ambiguous or duplicate folder binding');
      bindings.add(key); folders.add(binding.folder_id);
    }
    models.set(model.model_id, model);
  }
  unique(snapshot.assets.map(asset => asset?.asset_id), 'asset ID');
  for (const asset of snapshot.assets) {
    exact(asset, ['asset_id', 'model_id', 'folder_id', 'root_id', 'scope_key', 'revision', 'content_sha256', 'modified_at', 'kind', 'template_id', 'identity_source', 'evidence_ref'], 'asset');
    for (const key of ['asset_id', 'folder_id', 'root_id', 'scope_key', 'revision', 'evidence_ref']) text(asset[key], key);
    modelId(asset.model_id);
    const model = models.get(asset.model_id);
    if (!model || !snapshot.scope.root_ids.includes(asset.root_id)) fail('Asset outside canonical model/source scope');
    if (!['canonical_folder_binding', 'reviewed_library_link'].includes(asset.identity_source)) fail('Invalid identity evidence source');
    if (asset.identity_source === 'canonical_folder_binding' && !model.folder_bindings.some(binding => binding.root_id === asset.root_id && binding.folder_id === asset.folder_id && binding.scope_key === asset.scope_key)) fail('Asset lacks an exact canonical folder binding');
    if (asset.identity_source === 'reviewed_library_link' && asset.kind !== 'compcard') fail('Library link must identify a reviewed compcard');
    if (asset.content_sha256 !== null && !/^[a-f0-9]{64}$/.test(asset.content_sha256)) fail('Invalid content hash');
    if (date(asset.modified_at, 'modified_at') > captured) fail('Asset modified after snapshot');
    if (!['photo', 'compcard', 'other', 'unknown'].includes(asset.kind)) fail('Invalid reviewed asset kind');
    if (asset.template_id !== null) text(asset.template_id, 'template ID');
    if (asset.kind !== 'compcard' && asset.template_id !== null) fail('Only a reviewed compcard may have a template');
  }
  return snapshot;
}

function fingerprint(asset) {
  // Same content under a new Drive metadata revision is not a new photograph.
  return asset.content_sha256 ? `sha256:${asset.content_sha256}` : `revision:${asset.revision}`;
}
function assetEvidence(asset) {
  return [asset.asset_id, asset.model_id, asset.root_id, asset.folder_id, asset.scope_key, fingerprint(asset), asset.kind, asset.template_id, asset.identity_source, asset.evidence_ref];
}

export function planModelAssetReview(current, { previous = null, targetTemplate, decisions = [] } = {}) {
  validateSnapshot(current); text(targetTemplate, 'target template');
  if (previous) {
    validateSnapshot(previous);
    if (current.scope.id !== previous.scope.id || JSON.stringify(ordered(current.scope.root_ids)) !== JSON.stringify(ordered(previous.scope.root_ids))) fail('Previous snapshot scope differs');
    if (date(previous.captured_at, 'previous captured_at') > date(current.captured_at, 'captured_at')) fail('Previous snapshot is newer');
  }
  rows(decisions, 'decisions');
  const reviewed = new Map();
  for (const decision of decisions) {
    exact(decision, ['review_key', 'state', 'reviewed_at', 'evidence_ref'], 'decision');
    if (!/^[a-f0-9]{64}$/.test(decision.review_key || '') || !['reviewed', 'deferred'].includes(decision.state)) fail('Invalid review decision');
    date(decision.reviewed_at, 'reviewed_at'); text(decision.evidence_ref, 'decision evidence');
    if (reviewed.has(decision.review_key)) fail('Duplicate review decision');
    reviewed.set(decision.review_key, decision);
  }
  const oldAssets = new Map((previous?.assets || []).map(asset => [asset.asset_id, asset]));
  const currentAssets = new Map(current.assets.map(asset => [asset.asset_id, asset]));
  const oldModels = new Map((previous?.models || []).map(model => [model.model_id, model]));
  const byModel = new Map();
  for (const asset of current.assets) {
    if (!byModel.has(asset.model_id)) byModel.set(asset.model_id, []);
    byModel.get(asset.model_id).push(asset);
  }
  const previousByModel = new Map();
  for (const asset of previous?.assets || []) {
    if (!previousByModel.has(asset.model_id)) previousByModel.set(asset.model_id, []);
    previousByModel.get(asset.model_id).push(asset);
  }
  const tasks = [];
  for (const model of [...current.models].sort((a, b) => a.model_id.localeCompare(b.model_id))) {
    const assets = (byModel.get(model.model_id) || []).sort((a, b) => a.asset_id.localeCompare(b.asset_id));
    const cards = assets.filter(asset => asset.kind === 'compcard');
    const reasons = [];
    const add = (kind, affected = []) => reasons.push({ kind, asset_ids: ordered(affected.map(asset => asset.asset_id)) });
    if (!model.folder_bindings.length) add('missing_folder_binding');
    if (!model.inventory_complete) add('incomplete_inventory');
    const unknown = assets.filter(asset => asset.kind === 'unknown');
    if (unknown.length) add('unclassified_assets', unknown);
    // Absence is only established within the declared, fully reconciled source scope.
    if (!cards.length && model.inventory_complete && model.folder_bindings.length && !unknown.length) add('no_compcard_in_verified_scope');
    if (cards.some(card => card.template_id === null)) add('template_review_required', cards.filter(card => card.template_id === null));
    if (cards.length && cards.every(card => card.template_id !== null && card.template_id !== targetTemplate)) add('legacy_template_review', cards);
    if (!previous) {
      const photos = assets.filter(asset => asset.kind === 'photo');
      if (photos.length) add('initial_baseline_review', photos);
    }
    else {
      const fresh = [], changed = [], rebound = [], uncertain = [];
      for (const asset of assets) {
        if (!['photo', 'compcard'].includes(asset.kind)) continue;
        const old = oldAssets.get(asset.asset_id);
        if (!old) fresh.push(asset);
        else if (old.model_id !== asset.model_id || old.root_id !== asset.root_id || old.folder_id !== asset.folder_id || old.scope_key !== asset.scope_key || old.identity_source !== asset.identity_source) rebound.push(asset);
        else if (old.content_sha256 && asset.content_sha256) {
          if (old.content_sha256 !== asset.content_sha256) changed.push(asset);
        } else if (old.revision !== asset.revision || old.content_sha256 !== asset.content_sha256) uncertain.push(asset);
      }
      if (fresh.length) add('newly_observed_assets', fresh);
      if (changed.length) add('changed_assets', changed);
      if (rebound.length) add('asset_binding_changed', rebound);
      if (uncertain.length) add('asset_change_unverified', uncertain);
      const missing = (previousByModel.get(model.model_id) || []).filter(asset => !currentAssets.has(asset.asset_id));
      if (missing.length) add(model.inventory_complete ? 'assets_absent_in_verified_scope' : 'asset_absence_unverified', missing);
      const departed = (previousByModel.get(model.model_id) || []).map(asset => currentAssets.get(asset.asset_id)).filter(asset => asset && asset.model_id !== model.model_id);
      if (departed.length) reasons.push({ kind: 'asset_binding_departed', asset_ids: ordered(departed.map(asset => asset.asset_id)), current_bindings: departed.map(asset => [asset.asset_id, asset.model_id, asset.root_id, asset.folder_id, asset.scope_key]).sort() });
      const oldModel = oldModels.get(model.model_id);
      if (oldModel && hash(oldModel.folder_bindings.map(b => [b.root_id, b.folder_id, b.scope_key]).sort()) !== hash(model.folder_bindings.map(b => [b.root_id, b.folder_id, b.scope_key]).sort())) add('model_folder_bindings_changed');
    }
    if (!reasons.length) continue;
    const reviewKey = hash([current.scope.id, current.scope.evidence_ref, ordered(current.scope.root_ids), targetTemplate, model.model_id, model.inventory_complete, model.inventory_evidence_ref, model.folder_bindings.map(b => [b.root_id, b.folder_id, b.scope_key, b.evidence_ref]).sort(), reasons, assets.map(assetEvidence)]);
    const decision = reviewed.get(reviewKey);
    tasks.push({ model_id: model.model_id, review_key: reviewKey, reasons, state: decision?.state || 'pending_review', decision: decision || null, live_eligible: false });
  }
  const currentModelIds = new Set(current.models.map(model => model.model_id));
  const missingModels = (previous?.models || []).filter(model => !currentModelIds.has(model.model_id)).map(model => model.model_id).sort();
  return {
    schema: 'hype_model_asset_review_plan_v1', captured_at: current.captured_at,
    scope: current.scope, target_template: targetTemplate,
    evidence_authority: 'caller_supplied_snapshot_not_independently_verified',
    models_complete: current.models_complete, model_count: current.models.length,
    baseline_comparison: previous ? 'compared' : 'not_available',
    absent_model_ids: missingModels, absent_models_verified_in_scope: current.models_complete,
    live_eligible: false, generation_permitted: false, publication_permitted: false,
    tasks,
  };
}

async function readJson(path) {
  const file = await open(resolve(path), 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) fail('Input must be a JSON file of at most 10 MB');
    const bytes = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await file.read(bytes, size, bytes.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX_INPUT_BYTES) fail('Input exceeds 10 MB');
    return JSON.parse(bytes.subarray(0, size).toString('utf8'));
  } finally { await file.close(); }
}

export async function runCli(args, log = console.log) {
  if (args.length === 1 && args[0] === '--help') {
    log('Usage: node scripts/hype-model-asset-review.mjs --current snapshot.json --target-template TEMPLATE_ID --out plan.json [--previous old-snapshot.json] [--decisions decisions.json]\nLocal metadata only. No scan, generation, approval, upload or send.'); return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--current', '--previous', '--target-template', '--decisions', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || Object.hasOwn(options, args[i])) fail('Invalid CLI options; see --help');
    options[args[i]] = args[i + 1];
  }
  if (!options['--current'] || !options['--target-template'] || !options['--out']) fail('Missing required CLI options; see --help');
  const result = planModelAssetReview(await readJson(options['--current']), {
    previous: options['--previous'] ? await readJson(options['--previous']) : null,
    decisions: options['--decisions'] ? await readJson(options['--decisions']) : [],
    targetTemplate: options['--target-template'],
  });
  await writeFile(resolve(options['--out']), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  log(JSON.stringify({ model_count: result.model_count, review_count: result.tasks.length, models_complete: result.models_complete, generated: false, uploaded: false, sent: false }));
  return result;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
