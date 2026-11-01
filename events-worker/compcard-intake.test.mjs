import test from 'node:test';
import assert from 'node:assert/strict';
import { INTAKE_READY_FOLDER_ID, INTAKE_REGISTRY_KEY, mergeApprovedIntake, readApprovedIntakeAsset, readApprovedIntakeRegistry, validateIntakeCard } from './src/compcard-intake.js';
import { chooseDailyCard } from './src/compcard-policy.js';
import { compcardSha256, runCompcardDaily } from './src/compcard-daily.js';
import { APPROVED_COMPCARD_MANIFEST } from './src/compcard-approved-manifest.js';
import { COMPCARD_JOURNAL_ROOT } from './src/compcard-journal.js';

const NOW = Date.parse('2026-10-24T20:00:00+07:00');
const ENV = { HYPE_COMPCARD_ENABLED: 'true', HYPE_PROMOTION_ENABLED: 'true', HYPE_STANDARD_ENABLED: 'true',
  HYPE_CADENCE_START_DATE: '2026-10-23', HYPE_PROMOTION_WEEKDAYS: '2,5', HYPE_INTAKE_ENABLED: 'true', HYPE_INTAKE_READY_FOLDER_ID: INTAKE_READY_FOLDER_ID };
function png(size = 32, last = 0) {
  const bytes = new Uint8Array(size);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1322); view.setUint32(20, 1200);
  bytes[size - 1] = last;
  return bytes;
}
async function cardFor(bytes = png(), overrides = {}) {
  const sha256 = await compcardSha256(bytes);
  const file_id = overrides.file_id || 'readyDriveFile001';
  return { id: `intake_${file_id}_${sha256}`, source: 'owner_drive_intake', source_folder_id: INTAKE_READY_FOLDER_ID,
    file_id, model_id: 'recIntakeModel001', canonical_name: 'Example', display_name: 'Example', category: 'standard',
    approved: true, status: 'active', selectable: true, asset_key: `${COMPCARD_JOURNAL_ROOT}intake/assets/${sha256}.json`,
    sha256, content_type: 'image/png', bytes: bytes.length, width: 1322, height: 1200, height_cm: 180, weight_kg: 70, caption_stats_allowed: true,
    review: { reviewed_by: 'assistant', reviewed_at: '2026-10-22T00:00:00.000Z', source_file_id: 'ownerInputFile001', identity_verified: true,
      canonical_facts_verified: true, finished_material: true, visual_qa_passed: true, public_safe: true }, ...overrides };
}
function memoryBucket() {
  const records = new Map(); let version = 0;
  return { records,
    async get(key) { const row = records.get(key); return row ? { etag: row.etag, size: Buffer.byteLength(row.value), text: async () => row.value } : null; },
    async put(key, value, options = {}) {
      const old = records.get(key);
      if (options.onlyIf?.etagDoesNotMatch === '*' && old || options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== old?.etag) return null;
      const row = { etag: `v${++version}`, value: String(value) }; records.set(key, row); return { etag: row.etag };
    },
    json(key) { const row = records.get(key); return row ? JSON.parse(row.value) : null; },
  };
}
const registry = cards => ({ schema: 'hype_compcard_intake_registry_v1', success: true,
  result: { revision: 'reviewed-fixture-v1', ready_folder_id: INTAKE_READY_FOLDER_ID, cards } });
const asset = (card, bytes) => ({ schema: 'hype_compcard_intake_asset_v1', success: true,
  result: { encoding: 'base64', content_type: card.content_type, sha256: card.sha256, data: Buffer.from(bytes).toString('base64') } });
async function fixture({ bytes = png(), legacy = false } = {}) {
  const card = await cardFor(bytes);
  const bucket = memoryBucket();
  await bucket.put(INTAKE_REGISTRY_KEY, JSON.stringify(registry([card])));
  await bucket.put(card.asset_key, JSON.stringify(asset(card, bytes)));
  const original = { ...card, id: '1legacy-card-0001', file_id: '1legacy-card-0001', source: undefined, asset_key: undefined, review: undefined };
  const manifest = { revision: 'legacy-v1', source_folder_id: 'legacy-folder', destinations: APPROVED_COMPCARD_MANIFEST.destinations,
    cards: legacy ? [original] : [], promotions: APPROVED_COMPCARD_MANIFEST.promotions };
  const models = [{ id: card.model_id, fields: { working_name: card.canonical_name, status: 'Active', sales_layer: 'private', private_tier: 'standard', height_cm: 180, weight_kg: 70 } }];
  const sends = [];
  const deps = { bucket, manifest, models: async () => models, model: async id => models.find(row => row.id === id),
    destinations: async () => Object.entries(manifest.destinations).map(([destination, chat_id]) => ({ destination, chat_id, ok: true, identity_verified: true, can_send_photo: true })),
    asset: async chosen => ({ bytes, sha256: chosen.sha256, content_type: chosen.content_type }),
    send: async (chosen, destination, caption, data, expectedChatId) => { sends.push({ card: chosen, destination, caption, data });
      return { ok: true, delivery_state: 'sent', destination, chat_id: expectedChatId, message_id: sends.length, approved_sha256: chosen.sha256 }; },
  };
  return { env: { ...ENV }, bucket, card, original, bytes, manifest, models, sends, deps };
}
const run = (f, date = '2026-10-24', time = '20:00') => runCompcardDaily(f.env, { now: Date.parse(`${date}T${time}:00+07:00`), deps: f.deps });

test('a private reviewed card merges without mutating static approval and pins its exact bytes', async () => {
  const f = await fixture({ legacy: true });
  const original = JSON.stringify(f.manifest);
  const merged = await mergeApprovedIntake(f.env, f.bucket, f.manifest, { now: NOW });
  assert.equal(merged.cards.length, 2);
  assert.equal(JSON.stringify(f.manifest), original);
  assert.equal(chooseDailyCard(merged.cards, [], '2026-10-24').id, f.card.id);
  const read = await readApprovedIntakeAsset(f.env, f.bucket, f.card, { now: NOW });
  assert.deepEqual(read.bytes, f.bytes);
  const result = await run(f);
  assert.equal(result.results[0].status, 'sent');
  assert.deepEqual(f.sends.map(row => row.destination), ['premium', 'standard']);
  assert.ok(f.sends.every(row => row.card.id === f.card.id));
  assert.equal(f.bucket.json(COMPCARD_JOURNAL_ROOT + 'plans/2026-10-24/standard.json').asset_key, f.card.asset_key);
});

test('a new intake version preserves an unfinished static plan and takes the next eligible turn', async () => {
  const f = await fixture({ legacy: true });
  f.bucket.records.delete(INTAKE_REGISTRY_KEY);
  let failed = false;
  const deliver = f.deps.send;
  f.deps.send = async (...args) => { if (args[1] === 'standard' && !failed) { failed = true; return { delivery_state: 'not_sent', error: 'compcard_mock_rejected' }; } return deliver(...args); };
  await run(f, '2026-10-24', '16:30');
  const key = COMPCARD_JOURNAL_ROOT + 'plans/2026-10-24/model.json';
  const original = f.bucket.records.get(key).value;
  await f.bucket.put(INTAKE_REGISTRY_KEY, JSON.stringify(registry([f.card])));
  await run(f, '2026-10-24', '16:45');
  assert.equal(f.bucket.records.get(key).value, original);
  assert.equal(f.sends.length, 2);
  assert.ok(f.sends.every(row => row.card.id === f.original.id));
  await run(f, '2026-10-31');
  assert.equal(f.sends.length, 4);
  assert.ok(f.sends.slice(2).every(row => row.card.id === f.card.id));
});

test('reviewed identity, folder, category, asset path and numerical facts are mandatory', async () => {
  const base = await cardFor();
  const bad = [ { category: 'exclusive' }, { source_folder_id: 'someOtherPrivateFolder' }, { asset_key: '../secret.json' },
    { asset_key: 'https://example.com/photo.png' }, { model_id: 'unresolved-name' }, { canonical_name: ' Example' },
    { canonical_name: 'Example\nprivate' }, { approved: false }, { status: 'draft' }, { width: 0 }, { height: 9000 },
    { height_cm: '180' }, { weight_kg: Infinity }, { bytes: 10_000_001 }, { file_id: 'https://drive.google.com/foo' },
    { id: 'not-the-hash-version' }, { selectable: undefined }, { review: { ...base.review, visual_qa_passed: false } },
    { review: { ...base.review, reviewed_by: 'unverified-generator' } }, { review: { ...base.review, reviewed_at: '2030-01-01T00:00:00.000Z' } } ];
  for (const change of bad) assert.throws(() => validateIntakeCard({ ...base, ...change }, { now: NOW }), /compcard_intake_/);
});

test('oversized and conflicting registries fail closed without materializing oversized bodies', async () => {
  const f = await fixture();
  let read = false;
  const oversized = { get: async () => ({ size: 1_048_577, text: async () => { read = true; return '{}'; } }) };
  assert.equal((await readApprovedIntakeRegistry(f.env, oversized, { now: NOW })).status, 'invalid');
  assert.equal(read, false);
  for (const list of [Array(501).fill(f.card), [f.card, f.card], [f.card, await cardFor(png(33), { file_id: 'readyDriveFile002' })]]) {
    await f.bucket.put(INTAKE_REGISTRY_KEY, JSON.stringify(registry(list)));
    assert.equal((await readApprovedIntakeRegistry(f.env, f.bucket, { now: NOW })).status, 'invalid');
  }
});

test('private assets reject changed bytes, dimensions, HTML, wrong MIME and arbitrary base64', async () => {
  const f = await fixture();
  for (const change of [{ data: Buffer.from('<html>sign in</html>').toString('base64') }, { content_type: 'text/html' },
    { sha256: '0'.repeat(64) }, { data: asset(f.card, f.bytes).result.data.replace(/.$/, '?') }, { data: Buffer.from(png(32, 1)).toString('base64') }]) {
    const payload = asset(f.card, f.bytes); Object.assign(payload.result, change);
    await f.bucket.put(f.card.asset_key, JSON.stringify(payload));
    await assert.rejects(() => readApprovedIntakeAsset(f.env, f.bucket, f.card, { now: NOW }), /compcard_intake_asset_/);
  }
  await f.bucket.put(f.card.asset_key, JSON.stringify(asset(f.card, f.bytes)));
  const wrongDimensions = { ...f.card, width: 1300 };
  await f.bucket.put(INTAKE_REGISTRY_KEY, JSON.stringify(registry([wrongDimensions])));
  await assert.rejects(() => readApprovedIntakeAsset(f.env, f.bucket, wrongDimensions, { now: NOW }), /compcard_intake_asset_changed/);
});

test('a four-megabyte private photo decodes without recursive regex or iterable expansion', async () => {
  const f = await fixture({ bytes: png(4_000_000) });
  const result = await readApprovedIntakeAsset(f.env, f.bucket, f.card, { now: NOW });
  assert.equal(result.bytes.byteLength, 4_000_000);
  assert.equal(result.sha256, f.card.sha256);
});

test('missing or malformed intake cannot stop static cards, their receipts or promotion', async () => {
  for (const invalid of [null, '{not-json', JSON.stringify({ schema: 'wrong', success: true, result: {} })]) {
    const f = await fixture({ legacy: true });
    if (invalid === null) f.bucket.records.delete(INTAKE_REGISTRY_KEY); else await f.bucket.put(INTAKE_REGISTRY_KEY, invalid);
    assert.equal((await run(f, '2026-10-24', '16:30')).results[0].status, 'sent');
    await run(f, '2026-10-24', '16:45');
    assert.equal(f.sends.length, 2);
    assert.ok(f.sends.every(row => row.card.id === f.original.id));
    assert.equal((await run(f, '2026-10-27')).results[0].slot, 'promotion');
    assert.equal(f.sends.length, 3);
  }
});

test('registry changes invalidate readiness even when the writer forgets to change its revision', async () => {
  const f = await fixture();
  const first = await mergeApprovedIntake(f.env, f.bucket, f.manifest, { now: NOW });
  await f.bucket.put(INTAKE_REGISTRY_KEY, JSON.stringify(registry([{ ...f.card, selectable: false }])));
  const next = await mergeApprovedIntake(f.env, f.bucket, f.manifest, { now: NOW });
  assert.notEqual(next.revision, first.revision);
  assert.equal(chooseDailyCard(next.cards, [], '2026-10-24'), null);
});

test('an old version remains usable by its frozen plan after a newer version is approved', async () => {
  const f = await fixture();
  let failed = false;
  const deliver = f.deps.send;
  f.deps.send = async (...args) => { if (args[1] === 'standard' && !failed) { failed = true; return { delivery_state: 'not_sent', error: 'compcard_mock_rejected' }; } return deliver(...args); };
  await run(f);
  const key = COMPCARD_JOURNAL_ROOT + 'plans/2026-10-24/standard.json';
  const originalPlan = f.bucket.records.get(key).value;
  const newBytes = png(33, 1); const newer = await cardFor(newBytes);
  await f.bucket.put(newer.asset_key, JSON.stringify(asset(newer, newBytes)));
  await f.bucket.put(INTAKE_REGISTRY_KEY, JSON.stringify(registry([{ ...f.card, selectable: false }, newer])));
  await run(f, '2026-10-24', '20:30');
  assert.equal(f.bucket.records.get(key).value, originalPlan);
  assert.equal(f.sends.length, 2);
  assert.ok(f.sends.every(row => row.card.id === f.card.id));
});

test('revoking registry approval during model refresh prevents the pending send', async () => {
  const f = await fixture();
  const readModel = f.deps.model;
  f.deps.model = async id => { await f.bucket.put(INTAKE_REGISTRY_KEY, JSON.stringify(registry([]))); return readModel(id); };
  const result = await run(f);
  assert.equal(f.sends.length, 0);
  assert.ok(result.results[0].outcomes.every(row => row.status === 'blocked'));
});

test('live canonical category changes block a ready Standard asset before delivery', async () => {
  const f = await fixture();
  f.deps.model = async () => ({ ...f.models[0], fields: { ...f.models[0].fields, private_tier: 'premium' } });
  await run(f);
  assert.equal(f.sends.length, 0);
});
