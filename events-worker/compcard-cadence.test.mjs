import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicationCadence } from './src/compcard-policy.js';
import { compcardSchedule, compcardSha256, runCompcardDaily } from './src/compcard-daily.js';
import { APPROVED_COMPCARD_MANIFEST } from './src/compcard-approved-manifest.js';
import { COMPCARD_JOURNAL_ROOT } from './src/compcard-journal.js';

const at = (date, time = '20:00') => Date.parse(`${date}T${time}:00+07:00`);
const CADENCE = { HYPE_CADENCE_START_DATE: '2026-10-23', HYPE_PROMOTION_WEEKDAYS: '2,5', HYPE_STANDARD_ENABLED: 'true' };
const BYTES = new Uint8Array([137, 80, 78, 71]);
const HASH = await compcardSha256(BYTES);
const ROOM_IDS = { premium: '-1001668261779', standard: '-1002073919780', preview: '-1002393788585' };
const cards = (count = 1) => Array.from({ length: count }, (_, i) => ({
  id: `approved-standard-${i}`, file_id: `approved-standard-${i}`, model_id: `recStandard${i}`, category: 'standard',
  canonical_name: `Standard ${i}`, display_name: `Standard ${i}`, sha256: HASH, content_type: 'image/png', bytes: BYTES.length,
}));
function fixture({ inventory = cards(), send, cadence = true } = {}) {
  const records = new Map();
  let version = 0;
  const bucket = {
    records,
    async get(key) { const row = records.get(key); return row ? { etag: row.etag, text: async () => row.value } : null; },
    async put(key, value, options = {}) {
      const old = records.get(key);
      if (options.onlyIf?.etagDoesNotMatch === '*' && old || options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== old?.etag) return null;
      const row = { etag: `v${++version}`, value: String(value) };
      records.set(key, row);
      return { etag: row.etag };
    },
    read(key) { const row = records.get(COMPCARD_JOURNAL_ROOT + key); return row ? JSON.parse(row.value) : null; },
  };
  const sends = [];
  const models = inventory.map(card => ({ id: card.model_id, fields: {
    working_name: card.canonical_name, status: 'Active', sales_layer: 'private', private_tier: card.category,
  } }));
  const manifest = { revision: 'cadence-fixture', source_folder_id: 'approved-source', destinations: ROOM_IDS,
    cards: inventory, promotions: APPROVED_COMPCARD_MANIFEST.promotions };
  const env = { HYPE_COMPCARD_ENABLED: 'true', HYPE_PROMOTION_ENABLED: 'true', ...(cadence ? CADENCE : {}) };
  const deps = {
    bucket, manifest, models: async () => models, model: async id => models.find(row => row.id === id),
    destinations: async () => Object.entries(ROOM_IDS).map(([destination, chat_id]) => ({ destination, chat_id, ok: true, identity_verified: true, can_send_photo: true })),
    asset: async card => ({ bytes: BYTES, content_type: card.content_type, sha256: card.sha256 }),
    send: async (card, destination, caption, asset, expectedChatId) => {
      sends.push({ card, destination, caption, asset, expectedChatId });
      return send ? send(card, destination, sends.length) : {
        ok: true, delivery_state: 'sent', destination, chat_id: expectedChatId, message_id: sends.length, approved_sha256: card.sha256,
      };
    },
  };
  return { env, deps, bucket, sends, models, manifest };
}
const run = (f, date, time = '20:00', options = {}) => runCompcardDaily(f.env, { now: at(date, time), deps: f.deps, ...options });

test('future cadence leaves 22 October daily promotion intact and starts on 23 October', async () => {
  assert.equal(publicationCadence(CADENCE, '2026-10-22').active, false);
  assert.equal(publicationCadence(CADENCE, '2026-10-23').promotion_day, true);
  assert.equal(publicationCadence(CADENCE, '2026-10-24').standard_day, true);
  assert.equal(publicationCadence({}, '2030-01-01').promotion_day, true);
  const f = fixture();
  const result = await run(f, '2026-10-22');
  assert.equal(result.results[0].slot, 'promotion');
  assert.equal(f.sends[0].destination, 'standard');
  assert.equal(f.bucket.read('plans/2026-10-22/standard.json'), null);
});

test('a week has two promotions and five Standard evenings with no Preview model leak', async () => {
  const f = fixture({ inventory: cards(5) });
  const resultSlots = [];
  for (const day of [23, 24, 25, 26, 27, 28, 29]) resultSlots.push((await run(f, `2026-10-${day}`)).results[0].slot);
  assert.deepEqual(resultSlots, ['promotion', 'standard', 'standard', 'standard', 'promotion', 'standard', 'standard']);
  const standardSends = f.sends.filter(row => row.card.category === 'standard');
  assert.equal(standardSends.length, 10);
  assert.equal(new Set(standardSends.map(row => row.card.model_id)).size, 5);
  assert.ok(standardSends.every(row => ['premium', 'standard'].includes(row.destination)));
  assert.equal(f.sends.filter(row => row.card.kind === 'text').length, 2);
});

test('promotion rooms advance by eligible promotion dates and Double remains continuous', async () => {
  const f = fixture({ inventory: [] });
  for (const date of ['2026-10-23', '2026-10-27', '2026-10-30', '2026-11-03', '2026-11-06', '2026-11-10']) await run(f, date);
  assert.deepEqual(f.sends.map(row => row.destination), ['preview', 'premium', 'standard', 'preview', 'premium', 'standard']);
  assert.ok(f.sends.slice(3).every(row => row.card.id === 'double-moment-continues-2026-telegram'));
  assert.ok(f.sends.slice(3).every(row => row.card.financial_campaign_id === 'promo_double_moment_sep2026'));
});

test('afternoon and Standard evening share same-day exposure and seven-day cooldown', async () => {
  const f = fixture({ inventory: cards(2) });
  const afternoon = await run(f, '2026-10-24', '16:30');
  const evening = await run(f, '2026-10-24');
  assert.equal(afternoon.results[0].slot, 'model');
  assert.equal(evening.results[0].slot, 'standard');
  assert.notEqual(afternoon.results[0].model_id, evening.results[0].model_id);
  assert.equal((await run(f, '2026-10-25')).results[0].status, 'no_eligible_card');
  assert.equal((await run(f, '2026-10-26', '16:30')).results[0].status, 'no_eligible_card');
  assert.equal(f.sends.length, 4);
  assert.equal((await run(f, '2026-10-31')).results[0].status, 'sent');
  assert.equal(f.sends.length, 6);
});

test('Standard repeats and concurrent cron calls keep independent per-room receipts', async () => {
  const f = fixture();
  await Promise.all([run(f, '2026-10-24'), run(f, '2026-10-24')]);
  await run(f, '2026-10-24', '20:15');
  assert.equal(f.sends.length, 2);
  assert.equal(f.bucket.read('deliveries/2026-10-24/standard/premium.json').attempts, 1);
  assert.equal(f.bucket.read('deliveries/2026-10-24/standard/standard.json').attempts, 1);
  assert.equal(f.bucket.read('summaries/2026-10-24/standard.json').result.sent, 2);
});

test('an uncertain Standard destination never retries while its sibling completes', async () => {
  const f = fixture({ send: (card, destination, count) => destination === 'premium'
    ? { delivery_state: 'delivery_uncertain', error: 'compcard_mock_timeout' }
    : { ok: true, delivery_state: 'sent', destination, chat_id: ROOM_IDS[destination], message_id: count, approved_sha256: card.sha256 } });
  await run(f, '2026-10-24');
  await run(f, '2026-10-24', '20:30');
  assert.equal(f.sends.length, 2);
  assert.equal(f.bucket.read('deliveries/2026-10-24/standard/premium.json').status, 'delivery_uncertain');
  assert.equal(f.bucket.read('deliveries/2026-10-24/standard/standard.json').status, 'sent');
  assert.equal((await run(f, '2026-10-25')).results[0].status, 'no_eligible_card');
});

test('empty Standard inventory skips without promoting or borrowing another category', async () => {
  for (const inventory of [[], cards().map(card => ({ ...card, category: 'premium' }))]) {
    const f = fixture({ inventory });
    const result = await run(f, '2026-10-24');
    assert.equal(result.results[0].status, 'no_eligible_card');
    assert.equal(result.results[0].slot, 'standard');
    assert.equal(f.sends.length, 0);
    assert.equal(f.bucket.read('plans/2026-10-24/promotion.json'), null);
  }
});

test('an unrelated afternoon asset outage does not block a valid Standard evening', async () => {
  const other = { ...cards()[0], id: 'exclusive-original', file_id: 'exclusive-original', model_id: 'recOther', category: 'exclusive', canonical_name: 'Other', display_name: 'Other' };
  const f = fixture({ inventory: [other, ...cards()] });
  await run(f, '2026-10-24', '16:30');
  assert.equal(f.bucket.read('plans/2026-10-24/model.json').category, 'exclusive');
  f.deps.asset = async card => { if (card.id === other.id) throw new Error('compcard_drive_read_failed'); return { bytes: BYTES, sha256: card.sha256 }; };
  const result = await run(f, '2026-10-24');
  assert.equal(result.results[0].slot, 'standard');
  assert.equal(result.results[0].status, 'sent');
});

test('a legacy frozen promotion keeps its digest and prevents a new Standard evening', async () => {
  const f = fixture({ cadence: false, send: (card, destination, count) => count === 1
    ? { delivery_state: 'not_sent', error: 'compcard_mock_rejected' }
    : { ok: true, delivery_state: 'sent', destination, chat_id: ROOM_IDS[destination], message_id: count, approved_sha256: card.sha256 } });
  await run(f, '2026-10-24');
  const original = f.bucket.records.get(COMPCARD_JOURNAL_ROOT + 'plans/2026-10-24/promotion.json').value;
  Object.assign(f.env, CADENCE);
  await run(f, '2026-10-24', '20:15');
  assert.equal(f.sends.length, 2);
  assert.ok(f.sends.every(row => row.destination === 'premium' && row.card.kind === 'text'));
  assert.equal(f.bucket.records.get(COMPCARD_JOURNAL_ROOT + 'plans/2026-10-24/promotion.json').value, original);
  assert.equal(f.bucket.read('plans/2026-10-24/standard.json'), null);
});

test('a frozen new promotion preserves its policy and uncertain receipt after a calendar edit', async () => {
  const f = fixture({ send: () => ({ delivery_state: 'delivery_uncertain', error: 'compcard_mock_timeout' }) });
  await run(f, '2026-10-27');
  const original = f.bucket.records.get(COMPCARD_JOURNAL_ROOT + 'plans/2026-10-27/promotion.json').value;
  f.env.HYPE_PROMOTION_WEEKDAYS = '1,4';
  await run(f, '2026-10-27', '20:15');
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].destination, 'premium');
  assert.equal(f.bucket.records.get(COMPCARD_JOURNAL_ROOT + 'plans/2026-10-27/promotion.json').value, original);
  assert.equal(f.bucket.read('plans/2026-10-27/standard.json'), null);
});

test('calendar configuration rejects ambiguous weekdays, invalid dates and overlapping model slots', () => {
  for (const weekdays of ['', '2,2', '7', '-1', 'Tuesday,Friday', '2,', ' ']) {
    assert.throws(() => publicationCadence({ ...CADENCE, HYPE_PROMOTION_WEEKDAYS: weekdays }, '2026-10-23'), /cadence_weekdays_invalid/);
  }
  assert.throws(() => publicationCadence({ ...CADENCE, HYPE_CADENCE_START_DATE: '2026-02-30' }, '2026-10-23'), /cadence_start_invalid/);
  assert.throws(() => compcardSchedule({ ...CADENCE, HYPE_STANDARD_SEND_AT_ICT: '17:00' }), /schedule_overlap/);
  assert.equal(compcardSchedule({ ...CADENCE, HYPE_STANDARD_SEND_AT_ICT: '18:00' }).standard, '18:00');
  const changed = publicationCadence({ ...CADENCE, HYPE_CADENCE_START_DATE: '2026-10-24', HYPE_PROMOTION_WEEKDAYS: '0,3' }, '2026-10-28');
  assert.equal(changed.anchor_date, '2026-10-25');
  assert.equal(changed.promotion_index, 1);
});

test('production config explicitly enables the future Tuesday/Friday cadence', () => {
  const config = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
  assert.match(config, /HYPE_CADENCE_START_DATE\s*=\s*"2026-10-23"/);
  assert.match(config, /HYPE_PROMOTION_WEEKDAYS\s*=\s*"2,5"/);
  assert.match(config, /HYPE_STANDARD_ENABLED\s*=\s*"true"/);
  assert.match(config, /HYPE_STANDARD_SEND_AT_ICT\s*=\s*"20:00"/);
});
