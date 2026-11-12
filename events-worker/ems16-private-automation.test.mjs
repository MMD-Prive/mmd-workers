import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedSyntheticReview } from './history-review-fixture.mjs';
import { privateAutomationAllowed, chooseDailyCard, evaluateCard, destinationsForCategory, destinationsForModelSlot } from './src/compcard-policy.js';
import { applyEms16PrivateOverlay, digest, BASELINE_SHA256, CANDIDATE_SHA256, MANIFEST_SHA256 } from '../release/events-ems16-private-exclusion/build-candidate.mjs';

// Every send is a memory-only stub. Never invoke a deployed scheduled or send handler.
globalThis.fetch = () => { throw new Error('Network forbidden in EMs16 offline tests'); };
const EMS16 = 'recbdC0waCS3qp452';
const PRIVATE = ['exclusive', 'premium', 'standard'];
const PUBLIC = ['travel', 'extreme'];
const ROOT = 'hype-compcards/v1/';
const exports = '\nexport { executeSlot, APPROVED_COMPCARD_MANIFEST, jsonDigest, captionForLiveCard, eligibleCards };\n';
const dataImport = source => import('data:text/javascript;base64,' + Buffer.from(source + exports).toString('base64'));
const sourceURL = new URL('./src/compcard-daily.js', import.meta.url);
const sourceText = readFileSync(sourceURL, 'utf8');
const normal = await dataImport(sourceText.replace(/from (["'])(\.\/[^"']+)\1/g, (_match, quote, path) => `from ${quote}${new URL(path, sourceURL).href}${quote}`));
const apis = [{ name: 'normal source', api: normal, source: true }];
let baseline;
if (process.env.EMS16_LIVE_BASELINE) {
  const live = readFileSync(process.env.EMS16_LIVE_BASELINE, 'utf8');
  baseline = await dataImport(live);
  apis.push({ name: 'exact live overlay', api: await dataImport(applyEms16PrivateOverlay(live)), source: false });
}
const original = normal.APPROVED_COMPCARD_MANIFEST.cards.find(card => card.model_id === EMS16);
assert.ok(original, 'canonical EMs16 exists in authoritative approved manifest');
const time = (date, slot) => Date.parse(`${date}T${slot === 'standard' ? '20:00' : '16:30'}:00+07:00`);
const cardFor = (category, extra = {}) => ({ ...original, category, ...extra });
function fixture(cards) {
  const records = new Map(); let etag = 0;
  const bucket = {
    records,
    async get(key) { const row = records.get(key); return row ? { etag: row.etag, text: async () => row.value } : null; },
    async put(key, value, options = {}) {
      const old = records.get(key);
      if (options.onlyIf?.etagDoesNotMatch === '*' && old || options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null;
      const row = { value: String(value), etag: String(++etag) }; records.set(key, row); return { etag: row.etag };
    },
  };
  const models = cards.map(card => ({ id: card.model_id, fields: { working_name: card.canonical_name, status: 'Active', sales_layer: PUBLIC.includes(card.category) ? 'public' : 'private', private_tier: card.category, 'MMD Public Category': card.category, visibility: 'private' } }));
  const sends = []; const assets = [];
  const manifest = { ...normal.APPROVED_COMPCARD_MANIFEST, cards };
  const env = { HYPE_COMPCARD_ENABLED: 'true', HYPE_STANDARD_ENABLED: 'true', HYPE_PROMOTION_ENABLED: 'false' };
  const deps = { bucket, manifest, models: async () => models, model: async id => models.find(row => row.id === id),
    asset: async card => { assets.push(card.model_id); return { bytes: new Uint8Array([1]), content_type: card.content_type, sha256: card.sha256 }; },
    send: async (card, destination, _caption, _asset, chatId) => { sends.push({ model_id: card.model_id, destination }); return { ok: true, delivery_state: 'sent', message_id: sends.length, chat_id: chatId, destination, approved_sha256: card.sha256 }; },
  };
  return { records, bucket, models, manifest, env, deps, sends, assets };
}
async function run(entry, f, date, slot = 'model') {
  const now = time(date, slot);
  if (entry.source) await seedSyntheticReview(f.deps, now, f.models);
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

test('documented sales layer/category mapping, not private visibility or destination, defines scope', () => {
  for (const category of PRIVATE) {
    const card = cardFor(category); const f = fixture([card]);
    assert.equal(privateAutomationAllowed(card), false);
    assert.equal(evaluateCard(card, f.models[0]).reason, 'owner_private_automation_excluded');
    assert.equal(chooseDailyCard([card], [], '2027-01-15'), null);
    for (const layer of ['private', 'both']) {
      const other = { ...card, model_id: 'recOtherPrivate01' };
      assert.equal(evaluateCard(other, { id: other.model_id, fields: { ...f.models[0].fields, sales_layer: layer } }).ok, true);
    }
  }
  for (const category of PUBLIC) {
    const card = cardFor(category); const f = fixture([card]);
    assert.equal(privateAutomationAllowed(card), true);
    assert.equal(evaluateCard(card, f.models[0]).ok, true); // visibility=private is not a work ban.
    assert.equal(chooseDailyCard([card], [], '2027-01-15'), card);
    assert.equal(evaluateCard(card, { ...f.models[0], fields: { ...f.models[0].fields, sales_layer: 'private', private_tier: 'Exclusive Models' } }).reason, 'model_category_changed');
  }
  assert.equal(privateAutomationAllowed({ model_id: 'recOtherPrivate01', category: 'exclusive' }), true);
});

test('source guard rechecks frozen plans before asset reads and keeps existing independent exclusions', () => {
  const guard = 'if (modelSlot && !privateAutomationAllowed(card))';
  assert.ok(sourceText.indexOf(guard) < sourceText.indexOf('if (!sharedAsset)'));
  assert.ok(sourceText.includes('slot === "model" || slot === "standard"'));
  for (const id of ['recW0Whpu9maVjYF6', 'recnl4Fksh6pXEwA1']) assert.equal(chooseDailyCard([cardFor('travel', { model_id: id })], [], '2027-01-15'), null);
});

test('offline overlay has exact immutable pins and only two reversible daily guards', () => {
  const raw = readFileSync(new URL('../release/events-ems16-private-exclusion/overlay-manifest.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(raw);
  assert.equal(digest(raw), MANIFEST_SHA256);
  assert.equal(manifest.baseline_sha256, BASELINE_SHA256); assert.equal(manifest.candidate_sha256, CANDIDATE_SHA256);
  assert.deepEqual(manifest.scope.private_categories, PRIVATE); assert.deepEqual(manifest.scope.public_categories_unchanged, PUBLIC);
  assert.equal(manifest.scope.model_id, EMS16);
  assert.deepEqual(manifest.sections, [{ name: 'compcard-daily' }]); assert.equal(manifest.replacements.length, 2);
  assert.throws(() => applyEms16PrivateOverlay('not the pinned live code'), /baseline drift/);
  assert.throws(() => applyEms16PrivateOverlay('', raw + '\n'), /manifest changed/);
});

test('exact-live overlay execution requires the independently obtained pinned module', { skip: !process.env.EMS16_LIVE_BASELINE }, () => { assert.ok(baseline); });

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
  test(`${entry.name}: unrelated models retain existing routes and independent main-source holds`, async () => {
    for (const category of [...PRIVATE, ...PUBLIC]) for (const slot of category === 'standard' ? ['model', 'standard'] : ['model']) {
      const f = fixture([cardFor(category, { model_id: 'recOtherPrivate01' })]); const result = await run(entry, f, '2027-01-15', slot);
      // Main already holds multi-room publication; do not weaken that unrelated policy.
      if (entry.source && category === 'exclusive') { assert.equal(result.status, 'publication_review_hold'); assert.deepEqual(f.sends, []); }
      else { assert.equal(result.status, 'sent'); assert.deepEqual(f.sends.map(row => row.destination), entry.source ? destinationsForModelSlot(category, slot) : destinationsForCategory(category)); }
    }
  });
}

test('exact-live non-EMs16 selection, plan, receipts and history are byte-equivalent to baseline', { skip: !baseline }, async () => {
  const candidate = apis.find(row => !row.source);
  for (const category of [...PRIVATE, ...PUBLIC]) for (const slot of category === 'standard' ? ['model', 'standard'] : ['model']) {
    const cards = [cardFor(category, { model_id: 'recOtherPrivate01' })]; const before = fixture(cards); const after = fixture(cards);
    assert.deepEqual(await run(candidate, after, '2027-01-15', slot), await run({ api: baseline }, before, '2027-01-15', slot));
    assert.deepEqual(bytes(after), bytes(before));
  }
});
