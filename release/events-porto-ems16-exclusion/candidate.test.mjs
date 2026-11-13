// Contract tests always run. Exact-runtime suites explicitly skip when the
// independently obtained local baseline is absent. The release gate MUST supply
// COMBINED_GUARD_BASELINE and reject skips. No deployed handlers are invoked.
// Fixtures and behavioral assertions preserve the reviewed Porto, EMs16 and
// cross-guard experiment at source 977a826273850c6f37818263d629e6303354ee08.
import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  applyCombinedOverlay, validateManifestBytes, digest, PINS, SOURCE_SHA,
  BASELINE_SHA256, CANDIDATE_SHA256, MANIFEST_SHA256,
  BASELINE_BYTES, CANDIDATE_BYTES,
} from './build-candidate.mjs';

const manifestBytes = readFileSync(new URL('./overlay-manifest.json', import.meta.url));
const manifest = validateManifestBytes(manifestBytes);
const baselinePath = process.env.COMBINED_GUARD_BASELINE;
const skipExact = baselinePath ? false : 'COMBINED_GUARD_BASELINE not supplied: exact pinned runtime not tested';
const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = () => { fetchCalls += 1; throw new Error('Network forbidden in combined offline tests'); };
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(fetchCalls, 0, 'offline evidence must not attempt network access');
});

// Extra named exports expose only the existing internal functions to memory
// fixtures. All original runtime bytes remain unchanged before this test suffix.
const TEST_EXPORTS = '\nexport { executeSlot, APPROVED_COMPCARD_MANIFEST, COMPCARD_JOURNAL_ROOT, jsonDigest, captionForLiveCard, eligibleCards, destinationsForCategory, mergeApprovedIntake, INTAKE_READY_FOLDER_ID, INTAKE_REGISTRY_KEY, runCompcardDaily, promotionDestination };\n';
const dataImport = source => import('data:text/javascript;base64,' + Buffer.from(source + TEST_EXPORTS).toString('base64'));
let runtime;
if (baselinePath) {
  const baselineBytes = readFileSync(baselinePath);
  const candidateText = applyCombinedOverlay(baselineBytes, manifestBytes);
  const baselineText = baselineBytes.toString('utf8');
  const [base, candidate] = await Promise.all([dataImport(baselineText), dataImport(candidateText)]);
  runtime = { baselineText, candidateText, base, candidate };
}

// Historical standalone manifest bytes are not release inputs. These exact
// replacement records reproduce the independently reviewed single-guard controls
// solely for in-memory comparison and negative baseline tests.
const STANDALONE_PORTO = {
  "candidate_sha256": "d01134c376e654b38c91146993f0d008b797a64f49e184c6fb30983e314244e0",
  "replacements": [
    {
      "section": "compcard-daily",
      "before": "const check = evaluateCard(card, byId.get(card.model_id));",
      "after": "const check = card.model_id === \"recnl4Fksh6pXEwA1\" ? { ok: false, reason: \"owner_automatic_selection_excluded\" } : evaluateCard(card, byId.get(card.model_id));"
    },
    {
      "section": "compcard-daily",
      "before": "if (plan.chat_ids[destination] !== manifest.destinations[destination]) throw problem(\"compcard_destination_approval_changed\", false);",
      "after": "if (plan.chat_ids[destination] !== manifest.destinations[destination]) throw problem(\"compcard_destination_approval_changed\", false);\n          if (modelSlot && card.model_id === \"recnl4Fksh6pXEwA1\") throw problem(\"compcard_owner_excluded_porto\", false);"
    }
  ]
};
const STANDALONE_EMS16 = {
  "candidate_sha256": "570b7a8e310aa0b6588260ece6139889e1b72c526149aa7510df3ca634a7ed3d",
  "replacements": [
    {
      "section": "compcard-daily",
      "before": "const check = evaluateCard(card, byId.get(card.model_id));",
      "after": "const check = card.model_id === \"recbdC0waCS3qp452\" && [\"exclusive\", \"premium\", \"standard\"].includes(card.category) ? { ok: false, reason: \"owner_private_automation_excluded\" } : evaluateCard(card, byId.get(card.model_id));"
    },
    {
      "section": "compcard-daily",
      "before": "if (plan.chat_ids[destination] !== manifest.destinations[destination]) throw problem(\"compcard_destination_approval_changed\", false);",
      "after": "if (plan.chat_ids[destination] !== manifest.destinations[destination]) throw problem(\"compcard_destination_approval_changed\", false);\n          if (modelSlot && card.model_id === \"recbdC0waCS3qp452\" && [\"exclusive\", \"premium\", \"standard\"].includes(card.category)) throw problem(\"compcard_owner_private_automation_excluded\", false);"
    }
  ]
};
function standaloneControl(baseline, control) {
  assert.equal(digest(baseline), BASELINE_SHA256);
  let text = baseline;
  for (const change of control.replacements) {
    assert.equal(text.split(change.before).length, 2, 'standalone control anchor is unique');
    text = text.replace(change.before, change.after);
  }
  assert.equal(digest(text), control.candidate_sha256, 'standalone control differs from proven experiment');
  return text;
}

// These fail-closed contracts do not depend on access to the runtime module.
test('contract: immutable provenance, manifest and byte-count pins', () => {
  assert.equal(SOURCE_SHA, '977a826273850c6f37818263d629e6303354ee08');
  assert.equal(BASELINE_SHA256, 'd517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee');
  assert.equal(CANDIDATE_SHA256, '0c1d2e76b5d4af4f700dca3bc63d8dc7e0c254b1fd2ab0bb386262a62f3b4898');
  assert.equal(MANIFEST_SHA256, '2794b74e276da6268d0690634377e05d91e1bd9a48cd94db499548567d4d365c');
  assert.equal(BASELINE_BYTES, 207037);
  assert.equal(CANDIDATE_BYTES, 207623);
  assert.ok(Object.isFrozen(PINS));
  assert.equal(PINS.worker, 'events-worker');
  assert.equal(PINS.module, 'model-eta-wrapper.js');
  assert.equal(PINS.expected_version, '88e741df-15bd-40ba-a4ce-f88a2735822b');
  assert.equal(PINS.expected_deployment, 'd9617e88-3f2f-4698-a3e5-3853fd197e06');
  assert.equal(digest(manifestBytes), MANIFEST_SHA256);
});

test('contract: exact scope is canonical Porto plus private EMs16 on both sources and slots', () => {
  assert.deepEqual(manifest.scope.models, [
    { model_id: 'recnl4Fksh6pXEwA1', canonical_name: 'Porto MJ', slots: ['model', 'standard'], persistence: 'until_explicitly_reenabled', selection_sources: ['static_manifest', 'approved_intake'] },
    { model_id: 'recbdC0waCS3qp452', canonical_name: 'EMs16', private_categories: ['exclusive', 'premium', 'standard'], public_categories_unchanged: ['travel', 'extreme'], slots: ['model', 'standard'], selection_sources: ['static_manifest', 'approved_intake'], persistence: 'until_explicitly_reenabled' },
  ]);
  assert.deepEqual(manifest.sections, [{ name: 'compcard-daily' }]);
  assert.equal(manifest.replacements.length, 2);
  assert.equal(manifest.unrelated_bytes_preserved, true);
  assert.ok(Object.isFrozen(manifest) && Object.isFrozen(manifest.scope.models[0]) && Object.isFrozen(manifest.replacements));
});

test('contract: manifest validation accepts only exact raw UTF-8 bytes, including Buffer and string forms', () => {
  assert.deepEqual(validateManifestBytes(manifestBytes.toString('utf8')), manifest);
  assert.deepEqual(validateManifestBytes(new Uint8Array(manifestBytes)), manifest);
  for (const invalid of [null, undefined, {}, [], 1]) assert.throws(() => validateManifestBytes(invalid), /UTF-8 string or Uint8Array/);
});

for (const [label, change] of [
  ['trailing whitespace', raw => raw + '\n'],
  ['equivalent JSON formatting', raw => JSON.stringify(JSON.parse(raw))],
  ['invalid JSON', () => '{'],
  ['unknown schema field', raw => JSON.stringify({ ...JSON.parse(raw), extra: true })],
  ['worker', raw => raw.replace('events-worker', 'another-worker')],
  ['module', raw => raw.replace('model-eta-wrapper.js', 'index.js')],
  ['version', raw => raw.replace('88e741df', '00000000')],
  ['deployment', raw => raw.replace('d9617e88', '00000000')],
  ['model identity', raw => raw.replaceAll('recnl4Fksh6pXEwA1', 'recWrongIdentity01')],
  ['category scope', raw => raw.replace('"exclusive",', '"travel",')],
  ['selection source', raw => raw.replace('approved_intake', 'unapproved_intake')],
  ['slot', raw => raw.replace('"standard"', '"promotion"')],
  ['section', raw => raw.replaceAll('compcard-daily', 'compcard-intake')],
  ['candidate hash', raw => raw.replace(CANDIDATE_SHA256, '0'.repeat(64))],
  ['replacement content', raw => raw.replaceAll('owner_private_automation_excluded', 'different_reason')],
  ['missing replacement', raw => { const value = JSON.parse(raw); value.replacements.pop(); return JSON.stringify(value); }],
  ['additional replacement', raw => { const value = JSON.parse(raw); value.replacements.push(value.replacements[0]); return JSON.stringify(value); }],
]) {
  test(`contract: reject changed manifest ${label}`, () => {
    const changed = change(manifestBytes.toString('utf8'));
    assert.notEqual(digest(changed), MANIFEST_SHA256);
    assert.throws(() => validateManifestBytes(changed), /manifest changed/);
    assert.throws(() => applyCombinedOverlay('not a runtime', changed), /manifest changed/);
  });
}

test('contract: wrong baseline, malformed input and duplicate/wrong-section anchors fail closed', () => {
  for (const invalid of ['', 'not the pinned live code', '\uFEFF',
    '// src/compcard-daily.js\n' + manifest.replacements.map(row => row.before + row.before).join('\n'),
    '// src/unrelated.js\n' + manifest.replacements.map(row => row.before).join('\n')]) {
    assert.throws(() => applyCombinedOverlay(invalid, manifestBytes), /baseline drift/);
  }
  for (const invalid of [null, {}, 42]) assert.throws(() => applyCombinedOverlay(invalid, manifestBytes), /code must be/);
});

test('contract: importing builder reads/writes nothing and performs no network or CLI work', () => {
  const builderSource = readFileSync(new URL('./build-candidate.mjs', import.meta.url));
  const builderURL = 'data:text/javascript;base64,' + builderSource.toString('base64');
  const script = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const forbidden = () => { throw new Error('Import side effect forbidden'); };
    fs.readFileSync = forbidden;
    fs.writeFileSync = forbidden;
    fs.appendFileSync = forbidden;
    fs.mkdirSync = forbidden;
    fs.openSync = forbidden;
    globalThis.fetch = forbidden;
    syncBuiltinESMExports();
    const api = await import(${JSON.stringify(builderURL)});
    if (typeof api.applyCombinedOverlay !== 'function' || typeof api.validateManifestBytes !== 'function') throw new Error('Missing API');
    process.stdout.write('pure');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8', env: {} });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'pure');
});

function exactSuite(name, body) {
  if (!runtime) test(name, { skip: skipExact }, () => {});
  else describe(name, body);
}

exactSuite('exact runtime: Porto evidence', async () => {
  const { baselineText, candidateText, base, candidate } = runtime;
const PORTO = 'recnl4Fksh6pXEwA1';
const at = (date, slot) => Date.parse(`${date}T${slot === 'standard' ? '20:00' : '16:30'}:00+07:00`);
const inventory = base.APPROVED_COMPCARD_MANIFEST.cards.filter(card => card.category === 'standard');
function fixture(cards = inventory) {
  const records = new Map();
  let version = 0; const reads = [];
  const bucket = {
    records,
    async get(key) { reads.push(key); const row = records.get(key); return row ? { etag: row.etag, size: Buffer.byteLength(row.value), text: async () => row.value } : null; },
    async put(key, value, options = {}) {
      const old = records.get(key);
      if ((options.onlyIf?.etagDoesNotMatch === '*' && old) || (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== old?.etag)) return null;
      const row = { etag: `v${++version}`, value: String(value) };
      records.set(key, row); return { etag: row.etag };
    },
    read(key) { const row = records.get(base.COMPCARD_JOURNAL_ROOT + key); return row ? JSON.parse(row.value) : null; },
  };
  const models = cards.map(card => ({ id: card.model_id, fields: { working_name: card.canonical_name, status: 'Active', sales_layer: 'private', private_tier: card.category } }));
  const sends = [];
  const assetReads = [];
  const manifest = { ...base.APPROVED_COMPCARD_MANIFEST, cards };
  const env = { HYPE_COMPCARD_ENABLED: 'true', HYPE_STANDARD_ENABLED: 'true', HYPE_PROMOTION_ENABLED: 'false' };
  const deps = {
    models: async () => models,
    model: async id => models.find(model => model.id === id),
    asset: async card => { assetReads.push(card.model_id); return { bytes: new Uint8Array([1]), sha256: card.sha256, content_type: card.content_type }; },
    send: async (card, destination, caption, asset, chatId) => {
      sends.push({ model_id: card.model_id, destination });
      return { ok: true, delivery_state: 'sent', message_id: sends.length, chat_id: chatId, destination, approved_sha256: card.sha256 };
    },
  };
  return { bucket, records, models, manifest, env, deps, sends, assetReads };
}
const run = (api, f, date = '2026-11-11', slot = 'standard') => api.executeSlot(f.env, f.manifest, f.bucket, slot, at(date, slot), f.deps, () => at(date, slot));
async function history(f) {
  for (const card of inventory) await f.bucket.put(base.COMPCARD_JOURNAL_ROOT + `history/${card.model_id}.json`, JSON.stringify({ model_id: card.model_id, category: card.category, date: card.model_id === PORTO ? '2026-11-04' : card.canonical_name.includes('Simba') ? '2026-11-07' : '2026-11-08', status: 'sent' }));
}
async function freezePorto(f, date = '2026-11-11', slot = 'standard') {
  const card = inventory.find(card => card.model_id === PORTO);
  const destinations = ['premium', 'standard'];
  const plan = { schema: 'hype_compcard_plan_v1', date, slot, manifest_revision: f.manifest.revision, created_at: at(date, slot), card_id: card.id, model_id: card.model_id, category: card.category, file_id: card.file_id, sha256: card.sha256, destinations, chat_ids: Object.fromEntries(destinations.map(destination => [destination, f.manifest.destinations[destination]])), captions: Object.fromEntries(destinations.map(destination => [destination, base.captionForLiveCard(card, destination, f.models.find(model => model.id === card.model_id))])) };
  plan.digest = await base.jsonDigest(plan);
  await f.bucket.put(base.COMPCARD_JOURNAL_ROOT + `plans/${date}/${slot}.json`, JSON.stringify(plan));
  return plan;
}
async function seedDelivery(f, plan, destination, status, extra = {}) {
  const record = {
    schema: 'hype_compcard_delivery_v1', date: plan.date, slot: plan.slot, destination,
    model_id: plan.model_id, card_id: plan.card_id, plan_digest: plan.digest,
    approved_sha256: plan.sha256, expected_chat_id: plan.chat_ids[destination],
    status, attempts: status === 'pending' ? 0 : 1, lease_until: 0,
    created_at: at(plan.date, plan.slot) - 1000,
    receipt: status === 'sent' ? { message_id: 123, chat_id: plan.chat_ids[destination], approved_sha256: plan.sha256 } : null,
    ...extra,
  };
  const key = base.COMPCARD_JOURNAL_ROOT + `deliveries/${plan.date}/${plan.slot}/${destination}.json`;
  await f.bucket.put(key, JSON.stringify(record));
  return { key, value: f.records.get(key).value };
}

test('exact live baseline and only two reversible changes in the daily module', () => {
  assert.equal(digest(baselineText), 'd517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee');
  const reviewed = manifest;
  assert.equal(reviewed.replacements.length, 2);
  assert.deepEqual(reviewed.sections.map(row => row.name), ['compcard-daily']);
  let restored = candidateText;
  for (const row of [...reviewed.replacements].reverse()) restored = restored.replace(row.after, row.before);
  assert.equal(restored, baselineText);
  assert.equal(digest(candidateText), reviewed.candidate_sha256);
});

test('reported Nov 11 history chooses Porto in baseline but sends no one in the candidate', async () => {
  const before = fixture(); const after = fixture();
  await history(before); await history(after);
  const oldHistory = [...after.records].map(([key, value]) => [key, value.value]);
  assert.equal((await run(base, before)).model_id, PORTO);
  const result = await run(candidate, after);
  assert.equal(result.status, 'no_eligible_card');
  assert.deepEqual(after.sends, []);
  assert.deepEqual([...after.records].map(([key, value]) => [key, value.value]), oldHistory);
  assert.equal(after.bucket.read('plans/2026-11-11/standard.json'), null);
});

test('other eligible models remain publishable with original Premium and Standard routing', async () => {
  const f = fixture(); const result = await run(candidate, f);
  assert.notEqual(result.model_id, PORTO);
  assert.equal(result.status, 'sent');
  assert.deepEqual(f.sends.map(row => row.destination), ['premium', 'standard']);
  assert.equal(f.env.HYPE_PROMOTION_ENABLED, 'false');
});

test('Porto-only pending frozen plan cannot read assets or send, and plan/history remain unchanged', async () => {
  const f = fixture(); await history(f); await freezePorto(f);
  const oldPlan = f.records.get(base.COMPCARD_JOURNAL_ROOT + 'plans/2026-11-11/standard.json').value;
  const oldHistory = f.records.get(base.COMPCARD_JOURNAL_ROOT + `history/${PORTO}.json`).value;
  const result = await run(candidate, f);
  assert.equal(result.sent, 0);
  assert.ok(result.outcomes.every(row => row.status === 'blocked' && row.error === 'compcard_owner_excluded_porto'));
  assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
  assert.equal(f.records.get(base.COMPCARD_JOURNAL_ROOT + 'plans/2026-11-11/standard.json').value, oldPlan);
  assert.equal(f.records.get(base.COMPCARD_JOURNAL_ROOT + `history/${PORTO}.json`).value, oldHistory);
});

test('already sent Porto receipts remain truthful, unchanged, and are not re-sent', async () => {
  const f = fixture(); await freezePorto(f);
  assert.equal((await run(base, f)).status, 'sent');
  const oldReceipts = ['premium', 'standard'].map(destination => f.records.get(base.COMPCARD_JOURNAL_ROOT + `deliveries/2026-11-11/standard/${destination}.json`).value);
  const sends = f.sends.length;
  assert.equal((await run(candidate, f)).status, 'sent');
  assert.equal(f.sends.length, sends);
  assert.deepEqual(['premium', 'standard'].map(destination => f.records.get(base.COMPCARD_JOURNAL_ROOT + `deliveries/2026-11-11/standard/${destination}.json`).value), oldReceipts);
});

test('canonical Porto is excluded from fresh selection on both slots and future dates', async () => {
  const porto = inventory.filter(card => card.model_id === PORTO);
  for (const date of ['2026-11-11', '2026-11-12', '2026-12-11', '2027-01-15']) for (const slot of ['model', 'standard']) {
    const before = fixture(porto); const after = fixture(porto);
    assert.equal((await run(base, before, date, slot)).status, 'sent');
    assert.equal((await run(candidate, after, date, slot)).status, 'no_eligible_card');
    assert.deepEqual(after.sends, []); assert.deepEqual(after.assetReads, []);
    assert.equal(after.records.size, 0);
  }
});

test('canonical Porto is excluded from static and intake candidate sources in every category', () => {
  const original = inventory.find(card => card.model_id === PORTO);
  for (const category of ['exclusive', 'premium', 'standard', 'travel', 'extreme']) for (const source of [undefined, 'owner_drive_intake']) {
    const card = { ...original, category, ...(source ? { source } : {}) };
    const result = candidate.eligibleCards({ cards: [card] }, []);
    assert.deepEqual(result.eligible, []);
    assert.equal(result.excluded[0].reason, 'owner_automatic_selection_excluded');
  }
});

test('non-Porto inventories preserve exact outcomes and history', async () => {
  const others = inventory.filter(card => card.model_id !== PORTO);
  const before = fixture(others); const after = fixture(others);
  assert.deepEqual(await run(candidate, after), await run(base, before));
  assert.deepEqual([...after.records].map(([key, value]) => [key, value.value]), [...before.records].map(([key, value]) => [key, value.value]));
});

for (const date of ['2026-11-12', '2026-12-11', '2027-01-15']) for (const slot of ['model', 'standard']) {
  test(`frozen pending Porto is blocked in both destinations on ${date}/${slot}`, async () => {
    const f = fixture(); await freezePorto(f, date, slot);
    const key = base.COMPCARD_JOURNAL_ROOT + `plans/${date}/${slot}.json`;
    const originalPlan = f.records.get(key).value;
    const result = await run(candidate, f, date, slot);
    assert.equal(result.sent, 0);
    assert.deepEqual(result.outcomes.map(row => row.destination), ['premium', 'standard']);
    assert.ok(result.outcomes.every(row => row.status === 'blocked' && row.error === 'compcard_owner_excluded_porto'));
    assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
    assert.equal(f.records.get(key).value, originalPlan);
  });
}
test('future partial sent and uncertain receipts stay byte-identical on both slots while the other destination is blocked', async () => {
  for (const date of ['2026-11-12', '2027-01-15']) for (const slot of ['model', 'standard']) for (const preservedDestination of ['premium', 'standard']) for (const terminal of ['sent', 'delivery_uncertain']) {
    const f = fixture(); const plan = await freezePorto(f, date, slot);
    const saved = await seedDelivery(f, plan, preservedDestination, terminal);
    const pendingDestination = preservedDestination === 'premium' ? 'standard' : 'premium';
    await seedDelivery(f, plan, pendingDestination, 'pending');
    const result = await run(candidate, f, date, slot);
    assert.equal(result.outcomes.find(row => row.destination === preservedDestination).status, terminal);
    assert.equal(result.outcomes.find(row => row.destination === pendingDestination).status, 'blocked');
    assert.equal(f.records.get(saved.key).value, saved.value);
    assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
  }
});
test('future non-Porto selections and receipts remain exactly equivalent on both slots', async () => {
  const others = inventory.filter(card => card.model_id !== PORTO);
  for (const date of ['2026-11-12', '2027-01-15']) for (const slot of ['model', 'standard']) {
    const before = fixture(others); const after = fixture(others);
    assert.deepEqual(await run(candidate, after, date, slot), await run(base, before, date, slot));
    assert.deepEqual([...after.records].map(([key, value]) => [key, value.value]), [...before.records].map(([key, value]) => [key, value.value]));
  }
});
test('future in-flight and expired sending evidence follows baseline truth on both slots', async () => {
  const date = '2027-01-15';
  for (const slot of ['model', 'standard']) for (const destination of ['premium', 'standard']) for (const activeLease of [true, false]) {
    const before = fixture(); const after = fixture();
    const bp = await freezePorto(before, date, slot); const ap = await freezePorto(after, date, slot);
    const extra = { lease_until: activeLease ? at(date, slot) + 60000 : 0 };
    await seedDelivery(before, bp, destination, 'sending', extra);
    const preserved = await seedDelivery(after, ap, destination, 'sending', extra);
    const sibling = destination === 'premium' ? 'standard' : 'premium';
    await seedDelivery(before, bp, sibling, 'sent'); await seedDelivery(after, ap, sibling, 'sent');
    assert.deepEqual(await run(candidate, after, date, slot), await run(base, before, date, slot));
    assert.equal(after.records.get(preserved.key).value, before.records.get(preserved.key).value);
    if (activeLease) assert.equal(after.records.get(preserved.key).value, preserved.value);
    assert.deepEqual(after.sends, []); assert.deepEqual(after.assetReads, []);
  }
});

for (const destination of ['premium', 'standard']) {
  const sibling = destination === 'premium' ? 'standard' : 'premium';
  for (const terminal of ['sent', 'delivery_uncertain']) {
    test(`partial ${terminal} evidence in ${sibling} remains byte-identical while pending ${destination} is blocked`, async () => {
      const f = fixture(); await history(f); const plan = await freezePorto(f);
      const preserved = await seedDelivery(f, plan, sibling, terminal, terminal === 'delivery_uncertain' ? { error: 'compcard_transport_unknown', next_attempt_at: null } : {});
      await seedDelivery(f, plan, destination, 'pending');
      const oldHistory = f.records.get(base.COMPCARD_JOURNAL_ROOT + `history/${PORTO}.json`).value;
      const result = await run(candidate, f);
      const pending = result.outcomes.find(row => row.destination === destination);
      assert.equal(pending.status, 'blocked');
      assert.equal(pending.error, 'compcard_owner_excluded_porto');
      assert.equal(result.outcomes.find(row => row.destination === sibling).status, terminal);
      assert.equal(f.records.get(preserved.key).value, preserved.value);
      assert.equal(f.records.get(base.COMPCARD_JOURNAL_ROOT + `history/${PORTO}.json`).value, oldHistory);
      assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
    });
  }
  for (const state of ['pending', 'preparing', 'not_sent']) {
    test(`retryable ${state} delivery in ${destination} is blocked before any asset or send`, async () => {
      const f = fixture(); const plan = await freezePorto(f);
      const preserved = await seedDelivery(f, plan, sibling, 'sent');
      await seedDelivery(f, plan, destination, state);
      const result = await run(candidate, f);
      assert.equal(result.outcomes.find(row => row.destination === destination).status, 'blocked');
      assert.equal(f.records.get(preserved.key).value, preserved.value);
      assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
    });
  }
  test(`in-flight sending lease in ${destination} remains untouched, with no retry`, async () => {
    const f = fixture(); const plan = await freezePorto(f);
    const preserved = await seedDelivery(f, plan, destination, 'sending', { lease_until: at('2026-11-11', 'standard') + 60000 });
    await seedDelivery(f, plan, sibling, 'pending');
    await run(candidate, f);
    assert.equal(f.records.get(preserved.key).value, preserved.value);
    assert.deepEqual(f.sends, []); assert.deepEqual(f.assetReads, []);
  });
  test(`expired sending evidence in ${destination} follows the unchanged uncertainty path, without retry`, async () => {
    const before = fixture(); const after = fixture();
    const beforePlan = await freezePorto(before); const afterPlan = await freezePorto(after);
    await seedDelivery(before, beforePlan, destination, 'sending');
    const afterRecord = await seedDelivery(after, afterPlan, destination, 'sending');
    await seedDelivery(before, beforePlan, sibling, 'sent');
    await seedDelivery(after, afterPlan, sibling, 'sent');
    assert.deepEqual(await run(candidate, after), await run(base, before));
    assert.equal(after.records.get(afterRecord.key).value, before.records.get(afterRecord.key).value);
    assert.equal(after.bucket.read(`deliveries/2026-11-11/standard/${destination}.json`).status, 'delivery_uncertain');
    assert.deepEqual(after.sends, []); assert.deepEqual(after.assetReads, []);
  });
}

});

exactSuite('exact runtime: EMs16 and cross-guard evidence', async () => {
  const baseline = runtime.base;
  const apis = [{ name: 'exact combined overlay', api: runtime.candidate, source: false }];
  const EMS16 = 'recbdC0waCS3qp452';
  const PRIVATE = ['exclusive', 'premium', 'standard'];
  const PUBLIC = ['travel', 'extreme'];
  const ROOT = baseline.COMPCARD_JOURNAL_ROOT;
  const destinationsForCategory = baseline.destinationsForCategory;
  const original = baseline.APPROVED_COMPCARD_MANIFEST.cards.find(card => card.model_id === EMS16);
  assert.ok(original, 'canonical EMs16 exists in pinned runtime approved manifest');
const time = (date, slot) => Date.parse(`${date}T${slot === 'standard' ? '20:00' : '16:30'}:00+07:00`);
const cardFor = (category, extra = {}) => ({ ...original, category, ...extra });
function fixture(cards) {
  const records = new Map(); let etag = 0; const reads = [];
  const bucket = {
    records,
    async get(key) { reads.push(key); const row = records.get(key); return row ? { etag: row.etag, size: Buffer.byteLength(row.value), text: async () => row.value } : null; },
    async put(key, value, options = {}) {
      const old = records.get(key);
      if (options.onlyIf?.etagDoesNotMatch === '*' && old || options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null;
      const row = { value: String(value), etag: String(++etag) }; records.set(key, row); return { etag: row.etag };
    },
  };
  const models = cards.map(card => ({ id: card.model_id, fields: { working_name: card.canonical_name, status: 'Active', sales_layer: PUBLIC.includes(card.category) ? 'public' : 'private', private_tier: card.category, 'MMD Public Category': card.category, visibility: 'private' } }));
  const sends = []; const assets = [];
  const manifest = { ...baseline.APPROVED_COMPCARD_MANIFEST, cards };
  const env = { HYPE_COMPCARD_ENABLED: 'true', HYPE_STANDARD_ENABLED: 'true', HYPE_PROMOTION_ENABLED: 'false' };
  const deps = { bucket, manifest, models: async () => models, model: async id => models.find(row => row.id === id),
    asset: async card => { assets.push(card.model_id); return { bytes: new Uint8Array([1]), content_type: card.content_type, sha256: card.sha256 }; },
    send: async (card, destination, _caption, _asset, chatId) => { sends.push({ model_id: card.model_id, destination }); return { ok: true, delivery_state: 'sent', message_id: sends.length, chat_id: chatId, destination, approved_sha256: card.sha256 }; },
  };
  return { records, bucket, models, manifest, env, deps, sends, assets, reads };
}
async function run(entry, f, date, slot = 'model') {
  const now = time(date, slot);
  return entry.api.executeSlot(f.env, f.manifest, f.bucket, slot, now, f.deps, () => now);
}
async function freeze(entry, f, date, slot, card = f.manifest.cards[0]) {
  const destinations = destinationsForCategory(card.category); // Also exercise legacy frozen mirrors.
  const plan = { schema: 'hype_compcard_plan_v1', date, slot, manifest_revision: f.manifest.revision, created_at: time(date, slot), card_id: card.id, model_id: card.model_id, category: card.category, file_id: card.file_id, sha256: card.sha256, destinations,
    chat_ids: Object.fromEntries(destinations.map(room => [room, f.manifest.destinations[room]])),
    captions: Object.fromEntries(destinations.map(room => [room, entry.api.captionForLiveCard(card, room, f.models[0])])),
    ...(card.source === 'owner_drive_intake' ? { asset_key: card.asset_key } : {}) };
  plan.digest = await entry.api.jsonDigest(plan);
  await f.bucket.put(ROOT + `plans/${date}/${slot}.json`, JSON.stringify(plan)); return plan;
}
async function receipt(f, plan, destination, status, extra = {}) {
  const key = ROOT + `deliveries/${plan.date}/${plan.slot}/${destination}.json`;
  const record = { schema: 'hype_compcard_delivery_v1', date: plan.date, slot: plan.slot, destination, model_id: plan.model_id, card_id: plan.card_id, plan_digest: plan.digest, approved_sha256: plan.sha256, expected_chat_id: plan.chat_ids[destination], status,
    attempts: status === 'pending' ? 0 : 1, lease_until: 0, created_at: time(plan.date, plan.slot) - 1000,
    receipt: status === 'sent' ? { message_id: 123, chat_id: plan.chat_ids[destination], approved_sha256: plan.sha256 } : null, ...extra };
  await f.bucket.put(key, JSON.stringify(record)); return { key, value: f.records.get(key).value };
}
const bytes = f => [...f.records].map(([key, row]) => [key, row.value]);

for (const entry of apis) {
  for (const category of PRIVATE) for (const slot of category === 'standard' ? ['model', 'standard'] : ['model']) {
    test(`${entry.name}: ${category}/${slot} blocks fresh private selections across dates and sources`, async () => {
      for (const date of ['2026-11-12', '2026-11-19', '2027-01-15']) for (const source of [undefined, 'owner_drive_intake']) {
        const card = cardFor(category, source ? { source, asset_key: 'synthetic-only' } : {}); const f = fixture([card]);
        const result = await run(entry, f, date, slot);
        assert.equal(result.status, 'no_eligible_card'); assert.deepEqual(f.sends, []); assert.deepEqual(f.assets, []);
        assert.equal(f.records.has(ROOT + `plans/${date}/${slot}.json`), false);
      }
    });
    test(`${entry.name}: ${category}/${slot} blocks every frozen pending destination without altering plan or exposure`, async () => {
      for (const date of ['2026-11-12', '2027-01-15']) for (const source of [undefined, 'owner_drive_intake']) {
        const card = cardFor(category, source ? { source, asset_key: 'synthetic-only' } : {}); const f = fixture([card]);
        const plan = await freeze(entry, f, date, slot);
        const planKey = ROOT + `plans/${date}/${slot}.json`; const oldPlan = f.records.get(planKey).value;
        const historyKey = ROOT + `history/${EMS16}.json`;
        await f.bucket.put(historyKey, JSON.stringify({ model_id: EMS16, category, date: '2026-10-28', status: 'sent' })); const oldHistory = f.records.get(historyKey).value;
        const result = await run(entry, f, date, slot);
        assert.deepEqual(result.outcomes.map(row => row.destination), plan.destinations);
        assert.ok(result.outcomes.every(row => row.status === 'blocked' && row.error === 'compcard_owner_private_automation_excluded'));
        assert.deepEqual(f.sends, []); assert.deepEqual(f.assets, []);
        assert.equal(f.reads.some(key => key.includes('/intake/assets/')), false);
        assert.equal(f.records.get(planKey).value, oldPlan); assert.equal(f.records.get(historyKey).value, oldHistory);
      }
    });
    test(`${entry.name}: ${category}/${slot} preserves sent/uncertain evidence while blocking remaining destinations`, async () => {
      for (const terminal of ['sent', 'delivery_uncertain']) for (const destination of destinationsForCategory(category)) {
        const f = fixture([cardFor(category)]); const plan = await freeze(entry, f, '2027-01-15', slot);
        const saved = await receipt(f, plan, destination, terminal);
        for (const sibling of plan.destinations.filter(room => room !== destination)) await receipt(f, plan, sibling, 'pending');
        const result = await run(entry, f, plan.date, slot);
        assert.equal(f.records.get(saved.key).value, saved.value);
        assert.equal(result.outcomes.find(row => row.destination === destination).status, terminal);
        assert.ok(result.outcomes.filter(row => row.destination !== destination).every(row => row.status === 'blocked'));
        assert.deepEqual(f.sends, []);
      }
    });
    test(`${entry.name}: ${category}/${slot} keeps active leases/future retries and conservatively settles expired sending`, async () => {
      for (const status of ['preparing', 'sending', 'not_sent']) for (const active of [true, false]) {
        const f = fixture([cardFor(category)]); const plan = await freeze(entry, f, '2027-01-15', slot); const now = time(plan.date, slot);
        const saved = [];
        for (const room of plan.destinations) saved.push(await receipt(f, plan, room, status, status === 'not_sent' ? { next_attempt_at: active ? now + 60000 : now - 1 } : { lease_until: active ? now + 60000 : 0 }));
        const result = await run(entry, f, plan.date, slot);
        assert.deepEqual(f.sends, []); assert.deepEqual(f.assets, []);
        if (active) { for (const row of saved) assert.equal(f.records.get(row.key).value, row.value); }
        else assert.ok(result.outcomes.every(row => row.status === (status === 'sending' ? 'delivery_uncertain' : 'blocked')));
      }
    });
  }
  test(`${entry.name}: approved public work remains publishable, including in Preview with private visibility`, async () => {
    for (const date of ['2026-11-12', '2027-01-15']) for (const category of PUBLIC) {
      const f = fixture([cardFor(category)]); assert.equal((await run(entry, f, date)).status, 'sent');
      assert.deepEqual(f.sends, [{ model_id: EMS16, destination: 'preview' }]); assert.equal(f.env.HYPE_PROMOTION_ENABLED, 'false');
      const frozen = fixture([cardFor(category)]); await freeze(entry, frozen, date, 'model');
      assert.equal((await run(entry, frozen, date)).status, 'sent'); assert.equal(frozen.sends.length, 1);
    }
  });
  test(`${entry.name}: category changes never relabel a frozen private send as public`, async () => {
    const date = '2027-01-15'; const f = fixture([cardFor('exclusive')]); await freeze(entry, f, date, 'model');
    f.models[0].fields.sales_layer = 'public'; f.models[0].fields['MMD Public Category'] = 'travel';
    assert.equal((await run(entry, f, date)).sent, 0); assert.deepEqual(f.assets, []);
    const publicPlan = fixture([cardFor('travel')]); await freeze(entry, publicPlan, date, 'model');
    publicPlan.models[0].fields.sales_layer = 'private'; publicPlan.models[0].fields.private_tier = 'Exclusive Models';
    const result = await run(entry, publicPlan, date); assert.equal(result.sent, 0); assert.deepEqual(publicPlan.sends, []);
    assert.equal(result.outcomes[0].error, 'compcard_fresh_model_category_changed');
    const changedManifest = fixture([cardFor('exclusive')]); await freeze(entry, changedManifest, date, 'model'); changedManifest.manifest.cards[0].category = 'travel';
    assert.equal((await run(entry, changedManifest, date)).error, 'compcard_plan_approval_changed');
  });
  test(`${entry.name}: unrelated models retain exact baseline routes`, async () => {
    for (const category of [...PRIVATE, ...PUBLIC]) for (const slot of category === 'standard' ? ['model', 'standard'] : ['model']) {
      const f = fixture([cardFor(category, { model_id: 'recOtherPrivate01' })]); const result = await run(entry, f, '2027-01-15', slot);
        { assert.equal(result.status, 'sent'); assert.deepEqual(f.sends.map(row => row.destination), destinationsForCategory(category)); }
    }
  });
}

test('exact-live non-EMs16 selection, plan, receipts and history are byte-equivalent to baseline', async () => {
  const candidate = apis.find(row => !row.source);
  for (const category of [...PRIVATE, ...PUBLIC]) for (const slot of category === 'standard' ? ['model', 'standard'] : ['model']) {
    const cards = [cardFor(category, { model_id: 'recOtherPrivate01' })]; const before = fixture(cards); const after = fixture(cards);
    assert.deepEqual(await run(candidate, after, '2027-01-15', slot), await run({ api: baseline }, before, '2027-01-15', slot));
    assert.deepEqual(bytes(after), bytes(before));
  }
});
const combined = apis.find(row => !row.source);
assert.ok(combined && baseline, 'all checks require exact baseline and combined runtime');
const live = runtime.baselineText;
const portoText = standaloneControl(live, STANDALONE_PORTO);
const emsText = standaloneControl(live, STANDALONE_EMS16);
const portoOnly = { api: await dataImport(portoText) };
const emsOnly = { api: await dataImport(emsText) };
const PORTO='recnl4Fksh6pXEwA1';

test('mixed Porto and private EMs16 inventory cannot select either, across both slots and static/intake',async()=>{
 for(const slot of ['model','standard']) for(const source of [undefined,'owner_drive_intake']) {
  const cards=[PORTO,EMS16].map((id,i)=>cardFor('standard',{id:'synthetic-'+i,model_id:id,...(source?{source,asset_key:'synthetic-'+i}:{})}));
  const f=fixture(cards); assert.equal((await run(combined,f,'2027-01-15',slot)).status,'no_eligible_card');
  assert.deepEqual(f.sends,[]);assert.deepEqual(f.assets,[]);assert.equal(f.records.size,0);
  const other=cardFor('standard',{id:'synthetic-other',model_id:'recUnaffected01'});
  const mixed=fixture([...cards,other]); const control=fixture([other]);
  assert.deepEqual(await run(combined,mixed,'2027-01-15',slot),await run({api:baseline},control,'2027-01-15',slot));
  assert.deepEqual(bytes(mixed),bytes(control));
 }
});

test('each guard retains its standalone runtime behavior, including public EMs16 and frozen receipts',async()=>{
 for(const id of [PORTO,EMS16]) for(const category of [...PRIVATE,...PUBLIC])
 for(const slot of category==='standard'?['model','standard']:['model'])
 for(const source of [undefined,'owner_drive_intake']) for(const frozen of [false,true]) {
  const card=cardFor(category,{model_id:id,...(source?{source,asset_key:'synthetic-only'}:{})});
  const c=fixture([card]); const s=fixture([card]); const standalone=id===PORTO?portoOnly:emsOnly;
  if(frozen){await freeze(combined,c,'2027-01-15',slot);await freeze(standalone,s,'2027-01-15',slot);}
  assert.deepEqual(await run(combined,c,'2027-01-15',slot),await run(standalone,s,'2027-01-15',slot));
  assert.deepEqual(bytes(c),bytes(s));assert.deepEqual(c.sends,s.sends);assert.deepEqual(c.assets,s.assets);
 }
});

test('scope is canonical identity and category, not a same-name unrelated model',async()=>{
 for(const name of ['Porto MJ','EMs16']) for(const category of [...PRIVATE,...PUBLIC]) {
  const card=cardFor(category,{model_id:'recUnaffected01',canonical_name:name});
  const c=fixture([card]);const b=fixture([card]);
  assert.deepEqual(await run(combined,c,'2027-01-15'),await run({api:baseline},b,'2027-01-15'));
  assert.deepEqual(bytes(c),bytes(b));assert.equal(c.env.HYPE_PROMOTION_ENABLED,'false');
 }
});

// Unlike category-spoofing fixtures above, these are fully valid standard
// intake envelopes. The pinned registry accepts only standard intake cards;
// public travel/extreme remain covered by the actual static runtime path.
async function approvedIntakeFixture(api, modelId, date, slot) {
  const png = new Uint8Array(32);
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(png.buffer);
  view.setUint32(16, 1322); view.setUint32(20, 1200);
  const sha256 = digest(png);
  const fileId = 'combinedSyntheticIntake01';
  const card = {
    id: `intake_${fileId}_${sha256}`, source: 'owner_drive_intake',
    source_folder_id: api.INTAKE_READY_FOLDER_ID, file_id: fileId,
    model_id: modelId, canonical_name: modelId === PORTO ? 'Porto MJ' : modelId === EMS16 ? 'EMs16' : 'Unaffected',
    display_name: 'Synthetic review fixture', category: 'standard', approved: true,
    status: 'active', selectable: true, asset_key: `${ROOT}intake/assets/${sha256}.json`,
    sha256, content_type: 'image/png', bytes: png.length, width: 1322, height: 1200,
    height_cm: 180, weight_kg: 70, caption_stats_allowed: true,
    review: { reviewed_by: 'owner', reviewed_at: '2026-10-22T00:00:00.000Z',
      source_file_id: 'syntheticSourceFile001', identity_verified: true,
      canonical_facts_verified: true, finished_material: true, visual_qa_passed: true, public_safe: true },
  };
  const f = fixture([card]);
  f.env.HYPE_INTAKE_ENABLED = 'true';
  f.env.HYPE_INTAKE_READY_FOLDER_ID = api.INTAKE_READY_FOLDER_ID;
  await f.bucket.put(api.INTAKE_REGISTRY_KEY, JSON.stringify({
    schema: 'hype_compcard_intake_registry_v1', success: true,
    result: { revision: 'combined-offline-reviewed-v1', ready_folder_id: api.INTAKE_READY_FOLDER_ID, cards: [card] },
  }));
  await f.bucket.put(card.asset_key, JSON.stringify({
    schema: 'hype_compcard_intake_asset_v1', success: true,
    result: { encoding: 'base64', content_type: card.content_type, sha256, data: Buffer.from(png).toString('base64') },
  }));
  f.manifest = await api.mergeApprovedIntake(f.env, f.bucket, { ...f.manifest, cards: [] }, { now: time(date, slot) });
  assert.equal(f.manifest.intake.status, 'ready');
  assert.equal(f.manifest.cards.length, 1);
  f.deps.manifest = f.manifest;
  f.reads.length = 0;
  return f;
}

test('valid approved intake independently proves both exclusions and unchanged unrelated sends on both slots', async () => {
  const date = '2027-01-15';
  for (const modelId of [PORTO, EMS16, 'recUnaffected01']) for (const slot of ['model', 'standard']) for (const frozen of [false, true]) {
    const before = await approvedIntakeFixture(baseline, modelId, date, slot);
    const after = await approvedIntakeFixture(combined.api, modelId, date, slot);
    if (frozen) { await freeze({ api: baseline }, before, date, slot); await freeze(combined, after, date, slot); }
    const saved = bytes(after);
    const expected = await run({ api: baseline }, before, date, slot);
    assert.equal(expected.status, 'sent', 'valid intake control must really reach mocked delivery');
    const result = await run(combined, after, date, slot);
    if (modelId === 'recUnaffected01') {
      assert.deepEqual(result, expected);
      assert.deepEqual(bytes(after), bytes(before));
      assert.deepEqual(after.sends, before.sends);
      assert.ok(after.reads.some(key => key.includes('/intake/assets/')));
    } else {
      assert.deepEqual(after.sends, []);
      assert.deepEqual(after.assets, []);
      assert.equal(after.reads.some(key => key.includes('/intake/assets/')), false);
      assert.equal(after.records.has(ROOT + `history/${modelId}.json`), false);
      if (frozen) {
        const error = modelId === PORTO ? 'compcard_owner_excluded_porto' : 'compcard_owner_private_automation_excluded';
        assert.ok(result.outcomes.every(row => row.status === 'blocked' && row.error === error));
        for (const [key, value] of saved) assert.equal(after.records.get(key).value, value);
      } else {
        assert.equal(result.status, 'no_eligible_card');
        assert.deepEqual(bytes(after), saved);
      }
    }
    assert.equal(after.env.HYPE_PROMOTION_ENABLED, 'false');
  }
});

test('Promotion OFF suppresses the offline daily promotion path, including an existing frozen plan', async () => {
  const date = '2027-01-15'; const now = time(date, 'standard');
  for (const frozen of [false, true]) {
    const results = []; const snapshots = [];
    for (const api of [baseline, combined.api]) {
      const f = fixture([cardFor('travel')]);
      f.deps.destinations = async () => Object.entries(f.manifest.destinations).map(([destination, chat_id]) => ({ destination, chat_id, ok: true, identity_verified: true, can_send_photo: true }));
      const key = ROOT + `plans/${date}/promotion.json`;
      if (frozen) {
        const card = f.manifest.promotions.find(row => row.availability_mode === 'continuous');
        assert.ok(card);
        const destination = api.promotionDestination(date, f.env);
        const plan = { schema: 'hype_compcard_plan_v1', date, slot: 'promotion',
          manifest_revision: f.manifest.revision, created_at: now, card_id: card.id,
          model_id: null, category: 'promotion', file_id: card.file_id, sha256: card.sha256,
          destinations: [destination], chat_ids: { [destination]: f.manifest.destinations[destination] },
          captions: { [destination]: card.captions[destination] } };
        plan.digest = await api.jsonDigest(plan);
        await f.bucket.put(key, JSON.stringify(plan));
      }
      const priorPlan = f.records.get(key)?.value;
      // This is the local core with exclusively memory dependencies, never the
      // worker's fetch/scheduled handler or an HTTP invocation.
      const result = await api.runCompcardDaily(f.env, { now, deps: f.deps, wallClock: () => now });
      assert.equal(result.status, 'not_due');
      assert.equal(result.readiness, 'ready');
      assert.deepEqual(result.results, []);
      assert.deepEqual(f.sends, []);
      assert.equal(f.records.get(key)?.value, priorPlan);
      assert.equal(f.env.HYPE_PROMOTION_ENABLED, 'false');
      results.push(result); snapshots.push(bytes(f));
    }
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(snapshots[0], snapshots[1]);
  }
});

test('old single overlays and combined output cannot be used as the pinned baseline', () => {
  for (const text of [portoText, emsText, runtime.candidateText]) {
    assert.throws(() => applyCombinedOverlay(text, manifestBytes), /baseline drift/);
  }
  for (const control of [portoText, emsText]) assert.equal(control.includes(manifest.replacements[0].before), false);
  const f = fixture([cardFor('standard', { id: 'porto', model_id: PORTO }), cardFor('standard', { id: 'ems', model_id: EMS16 })]);
  const result = combined.api.eligibleCards(f.manifest, f.models);
  assert.deepEqual(result.eligible, []);
  assert.deepEqual(result.excluded.map(row => row.reason), ['owner_automatic_selection_excluded', 'owner_private_automation_excluded']);
});

});

exactSuite('exact runtime: byte preservation and fail-closed inputs', () => {
  test('builder output is deterministic and exactly the proven candidate bytes', () => {
    const { baselineText, candidateText } = runtime;
    assert.equal(Buffer.byteLength(baselineText), BASELINE_BYTES);
    assert.equal(Buffer.byteLength(candidateText), CANDIDATE_BYTES);
    assert.equal(digest(candidateText), CANDIDATE_SHA256);
    assert.equal(applyCombinedOverlay(baselineText), candidateText);
    assert.equal(applyCombinedOverlay(Buffer.from(baselineText), new Uint8Array(manifestBytes)), candidateText);
    let restored = candidateText;
    for (const row of [...manifest.replacements].reverse()) {
      assert.equal(restored.split(row.after).length, 2);
      restored = restored.replace(row.after, row.before);
    }
    assert.ok(Buffer.from(restored).equals(Buffer.from(baselineText)));
  });
  test('only two unique anchors inside compcard-daily are changed; all other sections are byte-identical', () => {
    const { baselineText, candidateText } = runtime;
    const dailyStart = baselineText.indexOf('// src/compcard-daily.js\n');
    const dailyEnd = baselineText.indexOf('\n// src/', dailyStart + 1);
    assert.ok(dailyStart >= 0 && dailyEnd > dailyStart);
    for (const row of manifest.replacements) {
      const at = baselineText.indexOf(row.before);
      assert.equal(baselineText.split(row.before).length, 2);
      assert.ok(at > dailyStart && at + row.before.length < dailyEnd);
      assert.equal(candidateText.split(row.after).length, 2);
    }
    assert.equal(candidateText.slice(0, dailyStart), baselineText.slice(0, dailyStart));
    const candidateEnd = candidateText.indexOf('\n// src/', dailyStart + 1);
    assert.equal(candidateText.slice(candidateEnd), baselineText.slice(dailyEnd));
    const promotionGate = 'else if (enabled2(env.HYPE_PROMOTION_ENABLED) && !frozenStandard && (cadence.promotion_day || frozenPromotion) && due(clock, schedule.promotion))';
    assert.ok(baselineText.includes(promotionGate) && candidateText.includes(promotionGate));
  });
  test('exact baseline mutations, duplicated anchors, wrong section and invalid UTF-8 cannot pass pins', () => {
    const { baselineText } = runtime;
    for (const changed of [baselineText + '\n', baselineText.slice(1), baselineText.replaceAll('\n', '\r\n'),
      baselineText.replace('// src/compcard-daily.js', '// src/wrong-section.js'),
      baselineText.replace(manifest.replacements[0].before, manifest.replacements[0].before.repeat(2)),
      baselineText.replace(manifest.replacements[1].before, ''),
      Buffer.concat([Buffer.from([0xff]), Buffer.from(baselineText)]),
    ]) assert.throws(() => applyCombinedOverlay(changed, manifestBytes), /baseline drift/);
  });
});
