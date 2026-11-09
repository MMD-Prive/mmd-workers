import { seedSyntheticReview } from './history-review-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicationCadence } from './src/compcard-policy.js';
import { compcardSchedule, compcardSha256, runCompcardDaily } from './src/compcard-daily.js';
import { APPROVED_COMPCARD_MANIFEST } from './src/compcard-approved-manifest.js';
import { COMPCARD_JOURNAL_ROOT, deliverCompcardOnce } from './src/compcard-journal.js';

const at = (date, time = '20:00') => Date.parse(`${date}T${time}:00+07:00`);
const CADENCE = { HYPE_CADENCE_START_DATE: '2026-10-23', HYPE_PROMOTION_WEEKDAYS: '2,5', HYPE_STANDARD_ENABLED: 'true' };
const BYTES = new Uint8Array([137, 80, 78, 71]);
const HASH = await compcardSha256(BYTES);
const ROOM_IDS = { premium: '-1001668261779', standard: '-1002073919780', preview: '-1002393788585' };
const cards = (count = 1) => Array.from({ length: count }, (_, i) => ({
  id: `approved-standard-${i}`, file_id: `approved-standard-${i}`, model_id: `recStandard${i}`, category: 'standard',
  canonical_name: `Standard ${i}`, display_name: `Standard ${i}`, sha256: HASH, content_type: 'image/png', bytes: BYTES.length,
}));
const DOUBLE_MOMENT_ID = 'double-moment-continues-2026-telegram';
async function seedNovemberDoubleMomentReceipt(f) {
  const card = f.manifest.promotions.find(row => row.id === DOUBLE_MOMENT_ID);
  const planKey = 'plans/2026-11-03/promotion.json';
  const deliveryKey = 'deliveries/2026-11-03/promotion/preview.json';
  const plan = { schema: 'hype_compcard_plan_v1', date: '2026-11-03', slot: 'promotion', card_id: card.id,
    model_id: null, category: 'promotion', file_id: null, sha256: card.sha256, destinations: ['preview'],
    chat_ids: { preview: ROOM_IDS.preview }, captions: { preview: card.captions.preview } };
  const delivery = { schema: 'hype_compcard_delivery_v1', status: 'sent', attempts: 1,
    receipt: { message_id: 135, chat_id: ROOM_IDS.preview, approved_sha256: card.sha256 } };
  await f.bucket.put(COMPCARD_JOURNAL_ROOT + planKey, JSON.stringify(plan));
  await f.bucket.put(COMPCARD_JOURNAL_ROOT + deliveryKey, JSON.stringify(delivery));
  return { planKey, deliveryKey, plan: JSON.stringify(plan), delivery: JSON.stringify(delivery) };
}
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
const run = async (f, date, time = '20:00', options = {}) => { const now = at(date, time); if (f.env.HYPE_COMPCARD_ENABLED === "true") await seedSyntheticReview(f.deps, now, f.models); return runCompcardDaily(f.env, { now: at(date, time), deps: f.deps, ...options }); };

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
  assert.equal(standardSends.length, 5);
  assert.equal(new Set(standardSends.map(row => row.card.model_id)).size, 5);
  assert.ok(standardSends.every(row => row.destination === 'standard'));
  assert.equal(f.sends.filter(row => row.card.kind === 'text').length, 2);
});

test('Double Moment is monthly across rooms; the confirmed November receipt anchors Dec/Jan/Feb rotation', async () => {
  const f = fixture({ inventory: cards(5) });
  f.env.HYPE_PROMOTION_SEND_AT_ICT = '10:00';
  f.env.HYPE_STANDARD_SEND_AT_ICT = '20:00';
  const old = await seedNovemberDoubleMomentReceipt(f);

  assert.equal((await run(f, '2026-11-06', '09:59')).status, 'not_due');
  assert.equal((await run(f, '2026-11-06', '10:00')).results[0].status, 'no_approved_promotion');
  assert.equal(f.sends.length, 0);
  assert.equal(f.bucket.read('plans/2026-11-06/standard.json'), null);
  const nov = f.bucket.read('monthly-promotions/double-moment/2026-11.json');
  assert.equal(nov.status, 'consumed');
  assert.equal(nov.date, '2026-11-03');
  assert.equal(nov.destination, 'preview');
  assert.equal(nov.round_index, 0);
  assert.equal(f.bucket.records.get(COMPCARD_JOURNAL_ROOT + old.planKey).value, old.plan);
  assert.equal(f.bucket.records.get(COMPCARD_JOURNAL_ROOT + old.deliveryKey).value, old.delivery);

  assert.equal((await run(f, '2026-11-06', '16:30')).results[0].slot, 'model');
  const afterModel = f.sends.length;
  assert.equal((await run(f, '2026-11-06', '20:00')).status, 'not_due');
  assert.equal(f.sends.length, afterModel);
  assert.equal((await run(f, '2026-11-07', '20:00')).results[0].slot, 'standard');

  assert.equal((await run(f, '2026-12-01', '09:59')).status, 'not_due');
  assert.equal((await run(f, '2026-12-01', '10:00')).results[0].slot, 'promotion');
  assert.equal(f.bucket.read('plans/2026-12-01/promotion.json').destinations[0], 'premium');
  const doubleSends = () => f.sends.filter(row => row.card.id === DOUBLE_MOMENT_ID);
  assert.equal(doubleSends().length, 1);
  await run(f, '2026-12-01', '10:15');
  assert.equal(doubleSends().length, 1);
  await run(f, '2026-12-01', '20:00');
  await run(f, '2026-12-04', '10:00');
  assert.equal(doubleSends().length, 1);
  assert.equal(f.bucket.read('plans/2026-12-04/standard.json'), null);

  assert.equal((await run(f, '2027-01-05', '10:00')).results[0].slot, 'promotion');
  assert.equal(f.bucket.read('plans/2027-01-05/promotion.json').destinations[0], 'standard');
  assert.equal((await run(f, '2027-02-02', '10:00')).results[0].slot, 'promotion');
  assert.equal(f.bucket.read('plans/2027-02-02/promotion.json').destinations[0], 'preview');
  assert.deepEqual([nov.round_index, f.bucket.read('monthly-promotions/double-moment/2026-12.json').round_index,
    f.bucket.read('monthly-promotions/double-moment/2027-01.json').round_index,
    f.bucket.read('monthly-promotions/double-moment/2027-02.json').round_index], [0, 1, 2, 3]);
  assert.equal(doubleSends().length, 3);
});

test('monthly Double Moment claim is atomic across dates and rooms', async () => {
  const f = fixture({ inventory: cards(5) });
  f.env.HYPE_PROMOTION_SEND_AT_ICT = '10:00';
  f.env.HYPE_STANDARD_SEND_AT_ICT = '20:00';
  await seedNovemberDoubleMomentReceipt(f);
  await run(f, '2026-11-06', '10:00');
  await Promise.all([run(f, '2026-12-01', '10:00'), run(f, '2026-12-04', '10:00')]);
  assert.equal(f.sends.filter(row => row.card.id === DOUBLE_MOMENT_ID).length, 1);
  const ledger = f.bucket.read('monthly-promotions/double-moment/2026-12.json');
  assert.ok(['reserved', 'consumed'].includes(ledger.status));
  assert.equal(ledger.round_index, 1);
});

test('uncertain Double Moment outcome consumes the month and advances the next actual room round', async () => {
  const f = fixture({ inventory: cards(5), send: () => ({ delivery_state: 'delivery_uncertain', error: 'compcard_mock_timeout' }) });
  f.env.HYPE_PROMOTION_SEND_AT_ICT = '10:00';
  f.env.HYPE_STANDARD_SEND_AT_ICT = '20:00';
  await seedNovemberDoubleMomentReceipt(f);
  await run(f, '2026-11-06', '10:00');
  await run(f, '2026-12-01', '10:00');
  await run(f, '2026-12-04', '10:00');
  assert.equal(f.sends.filter(row => row.card.id === DOUBLE_MOMENT_ID).length, 1);
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2026-12.json').status, 'consumed');
  assert.equal((await run(f, '2027-01-05', '10:00')).results[0].slot, 'promotion');
  assert.equal(f.bucket.read('plans/2027-01-05/promotion.json').destinations[0], 'standard');
});

test('monthly claim stays reserved through bounded not_sent retries, then reuses the same room next promotion date', async () => {
  const f = fixture({ inventory: cards(5), send: (card, destination, count) => count <= 3
    ? { delivery_state: 'not_sent', error: 'compcard_mock_rejected' }
    : { ok: true, delivery_state: 'sent', destination, chat_id: ROOM_IDS[destination], message_id: count, approved_sha256: card.sha256 } });
  f.env.HYPE_PROMOTION_SEND_AT_ICT = '10:00';
  f.env.HYPE_STANDARD_SEND_AT_ICT = '20:00';
  await seedNovemberDoubleMomentReceipt(f);
  await run(f, '2026-11-06', '10:00');
  await run(f, '2026-12-01', '10:00');
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2026-12.json').status, 'reserved');
  await run(f, '2026-12-01', '10:15');
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2026-12.json').status, 'reserved');
  await run(f, '2026-12-01', '10:30');
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2026-12.json').status, 'released');
  await run(f, '2026-12-04', '10:00');
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2026-12.json').status, 'consumed');
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2026-12.json').date, '2026-12-04');
  assert.equal(f.bucket.read('plans/2026-12-04/promotion.json').destinations[0], 'premium');
  assert.equal(f.sends.filter(row => row.card.id === DOUBLE_MOMENT_ID).length, 4);
});

test('a prior-month confirmed not_sent outage does not advance the actual Double Moment round', async () => {
  const f = fixture({ inventory: cards(5), send: () => ({ delivery_state: 'not_sent', error: 'compcard_mock_outage' }) });
  f.env.HYPE_PROMOTION_SEND_AT_ICT = '10:00';
  await seedNovemberDoubleMomentReceipt(f);
  await run(f, '2026-11-06', '10:00');
  await run(f, '2026-12-01', '10:00');
  const december = f.bucket.read('monthly-promotions/double-moment/2026-12.json');
  assert.equal(december.status, 'reserved');
  assert.equal(f.bucket.read('deliveries/2026-12-01/promotion/premium.json').status, 'not_sent');

  f.deps.send = async (card, destination, caption, asset, chatId) => {
    f.sends.push({ card, destination, caption, asset, expectedChatId: chatId });
    return { ok: true, delivery_state: 'sent', destination, chat_id: chatId, message_id: 902, approved_sha256: card.sha256 };
  };
  await run(f, '2027-01-05', '10:00');
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2026-12.json').status, 'released');
  const january = f.bucket.read('monthly-promotions/double-moment/2027-01.json');
  assert.equal(january.round_index, 1);
  assert.equal(january.destination, 'premium');
  assert.equal(january.status, 'consumed');
  assert.equal(f.bucket.read('plans/2027-01-05/promotion.json').destinations[0], 'premium');
});

test('unknown prior-month reservation fails closed without advancing or sending', async () => {
  const f = fixture({ inventory: cards(5) });
  f.env.HYPE_PROMOTION_SEND_AT_ICT = '10:00';
  await seedNovemberDoubleMomentReceipt(f);
  await run(f, '2026-11-06', '10:00');
  const card = f.manifest.promotions.find(row => row.id === DOUBLE_MOMENT_ID);
  await f.bucket.put(COMPCARD_JOURNAL_ROOT + 'monthly-promotions/double-moment/2026-12.json', JSON.stringify({
    schema: 'hype_compcard_monthly_promotion_v1', month: '2026-12', status: 'reserved', date: '2026-12-01',
    round_index: 1, destination: 'premium',
  }));
  await f.bucket.put(COMPCARD_JOURNAL_ROOT + 'plans/2026-12-01/promotion.json', JSON.stringify({
    schema: 'hype_compcard_plan_v1', date: '2026-12-01', slot: 'promotion', card_id: card.id,
    destinations: ['premium'], sha256: card.sha256, file_id: card.file_id,
  }));
  await f.bucket.put(COMPCARD_JOURNAL_ROOT + 'deliveries/2026-12-01/promotion/premium.json', JSON.stringify({
    schema: 'hype_compcard_delivery_v1', status: 'sending', attempts: 1,
  }));
  const result = await run(f, '2027-01-05', '10:00');
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'compcard_double_monthly_prior_reservation_unknown');
  assert.equal(f.sends.length, 0);
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2027-01.json'), null);
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
  assert.equal(f.sends.length, 2);
  assert.deepEqual(f.sends.map(row => row.destination), ['premium', 'standard']);
  assert.equal((await run(f, '2026-10-31')).results[0].status, 'publication_review_hold');
  assert.equal(f.sends.length, 2);
});

test('Standard repeats and concurrent cron calls keep independent per-room receipts', async () => {
  const f = fixture();
  await Promise.all([run(f, '2026-10-24'), run(f, '2026-10-24')]);
  await run(f, '2026-10-24', '20:15');
  assert.equal(f.sends.length, 1);
  assert.equal(f.bucket.read('deliveries/2026-10-24/standard/premium.json'), null);
  assert.equal(f.bucket.read('deliveries/2026-10-24/standard/standard.json').attempts, 1);
  assert.equal(f.bucket.read('summaries/2026-10-24/standard.json').result.sent, 1);
});

test('an uncertain Standard destination never retries or mirrors to Premium', async () => {
  const f = fixture({ send: (card, destination, count) => destination === 'standard'
    ? { delivery_state: 'delivery_uncertain', error: 'compcard_mock_timeout' }
    : { ok: true, delivery_state: 'sent', destination, chat_id: ROOM_IDS[destination], message_id: count, approved_sha256: card.sha256 } });
  await run(f, '2026-10-24');
  await run(f, '2026-10-24', '20:30');
  assert.equal(f.sends.length, 1);
  assert.equal(f.bucket.read('deliveries/2026-10-24/standard/premium.json'), null);
  assert.equal(f.bucket.read('deliveries/2026-10-24/standard/standard.json').status, 'delivery_uncertain');
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
  const other = { ...cards()[0], id: 'exclusive-original', file_id: 'exclusive-original', model_id: 'recOther', category: 'premium', canonical_name: 'Other', display_name: 'Other' };
  const f = fixture({ inventory: [other, ...cards()] });
  await run(f, '2026-10-24', '16:30');
  assert.equal(f.bucket.read('plans/2026-10-24/model.json').category, 'premium');
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
  assert.match(config, /HYPE_PROMOTION_SEND_AT_ICT\s*=\s*"10:00"/);
  assert.match(config, /HYPE_STANDARD_ENABLED\s*=\s*"true"/);
  assert.match(config, /HYPE_STANDARD_SEND_AT_ICT\s*=\s*"20:00"/);
});

// Regression coverage for expired monthly reservations and independent slots.
const DECEMBER_MONTH = 'monthly-promotions/double-moment/2026-12.json';
const DECEMBER_PLAN = 'plans/2026-12-01/promotion.json';
const DECEMBER_DELIVERY = 'deliveries/2026-12-01/promotion/premium.json';
const putRecord = (f, key, value) => f.bucket.put(COMPCARD_JOURNAL_ROOT + key, JSON.stringify(value));
const rawRecord = (f, key) => f.bucket.records.get(COMPCARD_JOURNAL_ROOT + key)?.value;
async function expiredReservation(attempts = 1, lastTime = '11:15') {
  const f = fixture({ inventory: cards(5), send: (card, destination, count) => count <= attempts
    ? { delivery_state: 'not_sent', error: 'compcard_mock_outage' }
    : { ok: true, delivery_state: 'sent', destination, chat_id: ROOM_IDS[destination], message_id: count, approved_sha256: card.sha256 } });
  f.env.HYPE_PROMOTION_SEND_AT_ICT = '10:00';
  f.env.HYPE_STANDARD_SEND_AT_ICT = '20:00';
  await seedNovemberDoubleMomentReceipt(f);
  if (attempts === 2) await run(f, '2026-12-01', '11:00');
  await run(f, '2026-12-01', lastTime);
  assert.equal(f.bucket.read(DECEMBER_MONTH).status, 'reserved');
  assert.equal(f.bucket.read(DECEMBER_DELIVERY).attempts, attempts);
  return f;
}

for (const attempts of [1, 2]) test(`expired confirmed not_sent after ${attempts} attempts recovers in the same room/round`, async () => {
  const f = await expiredReservation(attempts);
  const originalPlan = rawRecord(f, DECEMBER_PLAN);
  const originalDelivery = f.bucket.read(DECEMBER_DELIVERY);
  const novemberReceipt = rawRecord(f, 'deliveries/2026-11-03/promotion/preview.json');
  assert.equal((await run(f, '2026-12-01', '11:30')).status, 'not_due');
  assert.equal((await run(f, '2026-12-04', '10:00')).results[0].status, 'sent');
  const closed = f.bucket.read(DECEMBER_DELIVERY);
  assert.equal(closed.status, 'blocked');
  assert.deepEqual({ ...closed, status: originalDelivery.status, reconciliation: undefined }, { ...originalDelivery, reconciliation: undefined });
  assert.deepEqual(closed.reconciliation, { date: '2026-12-04', prior_status: 'not_sent', reason: 'compcard_window_closed' });
  assert.equal(rawRecord(f, DECEMBER_PLAN), originalPlan);
  assert.equal(rawRecord(f, 'deliveries/2026-11-03/promotion/preview.json'), novemberReceipt);
  assert.equal(f.bucket.read(DECEMBER_MONTH).round_index, 1);
  assert.equal(f.bucket.read(DECEMBER_MONTH).destination, 'premium');
  assert.equal(f.bucket.read(DECEMBER_MONTH).date, '2026-12-04');
  await run(f, '2026-12-04', '10:15');
  await run(f, '2026-12-01', '11:20'); // Delayed execution carrying its earlier clock.
  assert.equal(f.sends.length, attempts + 1);
  await run(f, '2027-01-05', '10:00');
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2027-01.json').round_index, 2);
  assert.equal(f.sends.at(-1).destination, 'standard');
});

test('promotion reservation errors remain visible without blocking the independent afternoon model', async () => {
  const f = await expiredReservation();
  await putRecord(f, DECEMBER_DELIVERY, { ...f.bucket.read(DECEMBER_DELIVERY), status: 'sending' });
  const before = rawRecord(f, DECEMBER_MONTH);
  const result = await run(f, '2027-01-05', '16:30');
  assert.equal(result.results[0].slot, 'model');
  assert.equal(result.results[0].status, 'sent');
  assert.equal(f.sends.filter(row => row.card.id === DOUBLE_MOMENT_ID).length, 1);
  const readiness = f.bucket.read('readiness/latest.json').result;
  assert.equal(readiness.model_ready, true);
  assert.equal(readiness.promotion_ready, false);
  assert.equal(readiness.promotion_error, 'compcard_double_monthly_prior_reservation_unknown');
  assert.ok(readiness.errors.includes(readiness.promotion_error));
  assert.equal(rawRecord(f, DECEMBER_MONTH), before);
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2027-01.json'), null);
});

test('malformed promotion JSON cannot block the independent afternoon model', async () => {
  const f = fixture({ inventory: cards(5) });
  f.env.HYPE_PROMOTION_SEND_AT_ICT = '10:00';
  f.env.HYPE_STANDARD_SEND_AT_ICT = '20:00';
  await f.bucket.put(COMPCARD_JOURNAL_ROOT + 'plans/2027-01-05/promotion.json', '{broken');
  const result = await run(f, '2027-01-05', '16:30');
  assert.equal(result.results[0].slot, 'model');
  assert.equal(result.results[0].status, 'sent');
  assert.equal(f.bucket.read('readiness/latest.json').result.promotion_ready, false);
  assert.equal(rawRecord(f, 'plans/2027-01-05/promotion.json'), '{broken');
});

for (const status of ['pending', 'preparing', 'sending', 'unknown']) test(`expired ${status} delivery stays reserved and never resends`, async () => {
  const f = await expiredReservation();
  await putRecord(f, DECEMBER_DELIVERY, { ...f.bucket.read(DECEMBER_DELIVERY), status });
  const before = rawRecord(f, DECEMBER_MONTH);
  const result = await run(f, '2026-12-04', '10:00');
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'compcard_double_monthly_prior_reservation_unknown');
  assert.equal(f.sends.length, 1);
  assert.equal(rawRecord(f, DECEMBER_MONTH), before);
  assert.equal(f.bucket.read('plans/2026-12-04/promotion.json'), null);
});

for (const status of ['sent', 'delivery_uncertain']) test(`expired ${status} delivery consumes the month without changing its receipt`, async () => {
  const f = await expiredReservation();
  const receipt = status === 'sent' ? { message_id: 781, chat_id: ROOM_IDS.premium, approved_sha256: f.bucket.read(DECEMBER_PLAN).sha256 } : null;
  await putRecord(f, DECEMBER_DELIVERY, { ...f.bucket.read(DECEMBER_DELIVERY), status, receipt });
  const before = rawRecord(f, DECEMBER_DELIVERY);
  await run(f, '2026-12-04', '10:00');
  assert.equal(f.sends.length, 1);
  assert.equal(f.bucket.read(DECEMBER_MONTH).status, 'consumed');
  assert.equal(f.bucket.read(DECEMBER_MONTH).round_index, 1);
  assert.equal(rawRecord(f, DECEMBER_DELIVERY), before);
  await run(f, '2027-01-05', '10:00');
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2027-01.json').round_index, 2);
  assert.equal(f.sends.at(-1).destination, 'standard');
});

for (const [label, alter] of [
  ['missing plan', async f => f.bucket.records.delete(COMPCARD_JOURNAL_ROOT + DECEMBER_PLAN)],
  ['missing delivery', async f => f.bucket.records.delete(COMPCARD_JOURNAL_ROOT + DECEMBER_DELIVERY)],
  ['plan integrity', async f => putRecord(f, DECEMBER_PLAN, { ...f.bucket.read(DECEMBER_PLAN), category: 'other' })],
  ['delivery digest', async f => putRecord(f, DECEMBER_DELIVERY, { ...f.bucket.read(DECEMBER_DELIVERY), plan_digest: 'a'.repeat(64) })],
  ['delivery destination', async f => putRecord(f, DECEMBER_DELIVERY, { ...f.bucket.read(DECEMBER_DELIVERY), destination: 'preview' })],
  ['delivery schema', async f => putRecord(f, DECEMBER_DELIVERY, { ...f.bucket.read(DECEMBER_DELIVERY), schema: 'invalid' })],
  ['contradictory receipt', async f => putRecord(f, DECEMBER_DELIVERY, { ...f.bucket.read(DECEMBER_DELIVERY), receipt: { message_id: 123 } })],
  ['outstanding lease', async f => putRecord(f, DECEMBER_DELIVERY, { ...f.bucket.read(DECEMBER_DELIVERY), lease_until: at('2026-12-04', '10:10') })],
  ['invalid attempts', async f => putRecord(f, DECEMBER_DELIVERY, { ...f.bucket.read(DECEMBER_DELIVERY), attempts: 0 })],
  ['invalid calendar date', async f => putRecord(f, DECEMBER_MONTH, { ...f.bucket.read(DECEMBER_MONTH), date: '2026-12-00' })],
  ['wrong reservation month', async f => putRecord(f, DECEMBER_MONTH, { ...f.bucket.read(DECEMBER_MONTH), date: '2026-11-01' })],
  ['wrong room round', async f => putRecord(f, DECEMBER_MONTH, { ...f.bucket.read(DECEMBER_MONTH), round_index: 2 })],
]) test(`expired reservation with ${label} fails closed`, async () => {
  const f = await expiredReservation();
  await alter(f);
  const before = rawRecord(f, DECEMBER_MONTH);
  const result = await run(f, '2026-12-04', '10:00');
  assert.equal(result.status, 'failed');
  assert.equal(f.sends.length, 1);
  assert.equal(rawRecord(f, DECEMBER_MONTH), before);
});

for (const status of ['preparing', 'sending']) test(`a competing ${status} claim defeats the no-send seal and holds the month`, async () => {
  const f = await expiredReservation();
  const put = f.bucket.put.bind(f.bucket);
  let raced = false;
  f.bucket.put = async (key, value, options) => {
    const row = JSON.parse(value);
    if (!raced && key === COMPCARD_JOURNAL_ROOT + DECEMBER_DELIVERY && row.reconciliation) {
      raced = true;
      await put(key, JSON.stringify({ ...f.bucket.read(DECEMBER_DELIVERY), status }), {});
    }
    return put(key, value, options);
  };
  const result = await run(f, '2026-12-04', '10:00');
  assert.equal(raced, true);
  assert.equal(result.status, 'failed');
  assert.equal(f.bucket.read(DECEMBER_MONTH).status, 'reserved');
  assert.equal(f.bucket.read(DECEMBER_DELIVERY).status, status);
  assert.equal(f.sends.length, 1);
});

test('a conflicting consumed monthly CAS is never overwritten or treated as released', async () => {
  const f = await expiredReservation();
  const put = f.bucket.put.bind(f.bucket);
  let raced = false;
  f.bucket.put = async (key, value, options) => {
    const row = JSON.parse(value);
    if (!raced && key === COMPCARD_JOURNAL_ROOT + DECEMBER_MONTH && row.status === 'released') {
      raced = true;
      await put(key, JSON.stringify({ ...f.bucket.read(DECEMBER_MONTH), status: 'consumed' }), {});
    }
    return put(key, value, options);
  };
  await run(f, '2026-12-04', '10:00');
  assert.equal(raced, true);
  assert.equal(f.bucket.read(DECEMBER_MONTH).status, 'consumed');
  assert.equal(f.sends.length, 1);
});

test('a crash after sealing the old delivery can recover without losing the room or round', async () => {
  const f = await expiredReservation();
  const put = f.bucket.put.bind(f.bucket);
  f.bucket.put = async (key, value, options) => {
    if (key === COMPCARD_JOURNAL_ROOT + DECEMBER_MONTH && JSON.parse(value).status === 'released') throw new Error('compcard_mock_storage_outage');
    return put(key, value, options);
  };
  assert.equal((await run(f, '2026-12-04', '10:00')).status, 'failed');
  assert.equal(f.bucket.read(DECEMBER_DELIVERY).status, 'blocked');
  assert.equal(f.bucket.read(DECEMBER_MONTH).status, 'reserved');
  assert.equal(f.sends.length, 1);
  f.bucket.put = put;
  assert.equal((await run(f, '2026-12-04', '10:30')).results[0].status, 'sent');
  assert.equal(f.bucket.read(DECEMBER_MONTH).destination, 'premium');
  assert.equal(f.bucket.read(DECEMBER_MONTH).round_index, 1);
  assert.equal(f.sends.length, 2);
});

test('concurrent expired-date recovery sends once across candidate dates', async () => {
  const f = await expiredReservation();
  await Promise.all([run(f, '2026-12-04', '10:00'), run(f, '2026-12-04', '10:00'), run(f, '2026-12-08', '10:00')]);
  assert.equal(f.sends.length, 2);
  assert.equal(f.bucket.read(DECEMBER_MONTH).status, 'consumed');
  assert.equal(f.bucket.read(DECEMBER_MONTH).destination, 'premium');
  assert.equal(f.bucket.read(DECEMBER_MONTH).round_index, 1);
});

test('cross-month recovery seals earlier no-send before reusing its unconsumed round', async () => {
  const f = await expiredReservation();
  const oldPlan = rawRecord(f, DECEMBER_PLAN);
  assert.equal((await run(f, '2027-01-05', '10:00')).results[0].status, 'sent');
  assert.equal(f.bucket.read(DECEMBER_DELIVERY).status, 'blocked');
  assert.equal(f.bucket.read(DECEMBER_MONTH).status, 'released');
  assert.equal(f.bucket.read('monthly-promotions/double-moment/2027-01.json').round_index, 1);
  assert.equal(f.sends.at(-1).destination, 'premium');
  await run(f, '2026-12-01', '11:20');
  assert.equal(f.sends.length, 2);
  assert.equal(rawRecord(f, DECEMBER_PLAN), oldPlan);
});

test('a stale earlier-date executor cannot retry the sealed journal even before its old window closes', async () => {
  const f = await expiredReservation(1, '10:00');
  const prior = f.bucket.read(DECEMBER_DELIVERY);
  await run(f, '2026-12-04', '10:00');
  const fields = ['date', 'slot', 'destination', 'model_id', 'card_id', 'plan_digest', 'approved_sha256', 'expected_chat_id'];
  const result = await deliverCompcardOnce({
    bucket: f.bucket, key: DECEMBER_DELIVERY, now: at('2026-12-01', '10:15'),
    context: Object.fromEntries(fields.map(key => [key, prior[key]])),
    prepare: () => assert.fail('The sealed old-date attempt must not prepare'),
    deliver: () => assert.fail('The sealed old-date attempt must not reach transport'),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.duplicate, true);
  assert.equal(f.sends.length, 2);
});

test('excluded Tinn identity never enters either new room plan, including alternate assets', async () => {
  const inventory = [...cards(2), ...cards(2).map((card, i) => ({ ...card, id: 'tinn-' + i, model_id: 'recW0Whpu9maVjYF6', canonical_name: 'Tinn F', display_name: 'AAA Tinn F' }))];
  const f = fixture({ inventory });
  const before = JSON.stringify(f.models);
  await run(f, '2026-10-24', '16:30');
  await run(f, '2026-10-24');
  assert.deepEqual(f.sends.map(row => row.destination), ['premium', 'standard']);
  assert.notEqual(f.sends[0].card.model_id, f.sends[1].card.model_id);
  assert.ok(f.sends.every(row => row.card.model_id !== 'recW0Whpu9maVjYF6'));
  assert.equal(JSON.stringify(f.models), before);
  assert.ok(f.bucket.read('readiness/latest.json').result.excluded.every(row => row.reason === 'automatic_selection_excluded'));
});

test('a frozen not_sent afternoon identity is not reused in Standard even without exposure', async () => {
  const f = fixture({ inventory: cards(2), send: (card, destination) => ({ delivery_state: 'not_sent' }) });
  await run(f, '2026-10-24', '16:30');
  await run(f, '2026-10-24');
  assert.equal(f.sends.length, 2);
  assert.notEqual(f.sends[0].card.model_id, f.sends[1].card.model_id);
});

test('one remaining Standard person is skipped rather than mirrored or cooldown relaxed', async () => {
  const f = fixture({ inventory: [cards()[0], { ...cards()[0], id: 'tinn', model_id: 'recW0Whpu9maVjYF6' }] });
  await run(f, '2026-10-24', '16:30');
  assert.equal((await run(f, '2026-10-24')).results[0].status, 'no_eligible_card');
  assert.equal((await run(f, '2026-10-25')).results[0].status, 'no_eligible_card');
  assert.equal(f.sends.length, 1);
  assert.equal(f.bucket.read('plans/2026-10-24/standard.json'), null);
});

async function seedLegacyModelPlan(f, card, date = '2026-10-24') {
  const { buildCompcardCaption } = await import('./src/compcard-policy.js');
  const plan = { schema: 'hype_compcard_plan_v1', date, slot: 'model', card_id: card.id, model_id: card.model_id,
    category: card.category, file_id: card.file_id, sha256: card.sha256, destinations: ['premium', 'standard'],
    chat_ids: { premium: ROOM_IDS.premium, standard: ROOM_IDS.standard },
    captions: Object.fromEntries(['premium', 'standard'].map(room => [room, buildCompcardCaption(card, room)])) };
  plan.digest = await compcardSha256(new TextEncoder().encode(JSON.stringify(plan)));
  await putRecord(f, 'plans/' + date + '/model.json', plan);
  return plan;
}

test('legacy frozen plan is immutable but its pending mirror fails closed', async () => {
  const f = fixture({ inventory: cards(2) });
  await seedLegacyModelPlan(f, f.manifest.cards[0]);
  const original = rawRecord(f, 'plans/2026-10-24/model.json');
  await run(f, '2026-10-24', '16:30');
  const receipt = rawRecord(f, 'deliveries/2026-10-24/model/standard.json');
  await run(f, '2026-10-24', '16:45');
  assert.equal(f.sends.length, 0);
  assert.equal(f.bucket.read('deliveries/2026-10-24/model/standard.json').error, 'compcard_legacy_room_selection_conflict');
  assert.equal(rawRecord(f, 'plans/2026-10-24/model.json'), original);
  assert.equal(rawRecord(f, 'deliveries/2026-10-24/model/standard.json'), receipt);
  await run(f, '2026-10-24');
  assert.equal(f.sends.length, 1);
  assert.notEqual(f.sends[0].card.model_id, f.manifest.cards[0].model_id);
});

test('pending legacy Tinn sends are held without rewriting the frozen plan', async () => {
  const tinn = { ...cards()[0], model_id: 'recW0Whpu9maVjYF6' };
  const f = fixture({ inventory: [tinn, cards(2)[1]] });
  await seedLegacyModelPlan(f, tinn);
  const original = rawRecord(f, 'plans/2026-10-24/model.json');
  await run(f, '2026-10-24', '16:30');
  assert.equal(f.sends.length, 0);
  assert.equal(rawRecord(f, 'plans/2026-10-24/model.json'), original);
  assert.equal(f.bucket.read('deliveries/2026-10-24/model/premium.json').error, 'compcard_automatic_selection_excluded');
});

test('already sent legacy Tinn receipts and sent summary remain truthful after exclusion', async () => {
  const tinn = { ...cards()[0], model_id: 'recW0Whpu9maVjYF6' };
  const f = fixture({ inventory: [tinn, cards(2)[1]] });
  const plan = await seedLegacyModelPlan(f, tinn);
  for (const destination of plan.destinations) {
    await deliverCompcardOnce({
      bucket: f.bucket, key: `deliveries/2026-10-24/model/${destination}.json`, now: at('2026-10-24', '16:30'),
      context: { date: plan.date, slot: plan.slot, destination, model_id: plan.model_id, card_id: plan.card_id,
        plan_digest: plan.digest, approved_sha256: plan.sha256, expected_chat_id: ROOM_IDS[destination] },
      prepare: async () => ({}),
      deliver: async () => ({ ok: true, destination, delivery_state: 'sent', message_id: 42, chat_id: ROOM_IDS[destination], approved_sha256: plan.sha256 }),
    });
  }
  const keys = ['plans/2026-10-24/model.json', ...plan.destinations.map(room => `deliveries/2026-10-24/model/${room}.json`)];
  const before = keys.map(key => rawRecord(f, key));
  const result = await run(f, '2026-10-24', '16:45');
  assert.equal(result.results[0].status, 'sent');
  assert.equal(result.results[0].sent, 2);
  assert.equal(f.bucket.read('summaries/2026-10-24/model.json').result.status, 'sent');
  assert.deepEqual(keys.map(key => rawRecord(f, key)), before);
  assert.equal(f.sends.length, 0);
});

test('single-room confirmed not_sent keeps prior no-exposure semantics', async () => {
  const f = fixture({ send: () => ({ delivery_state: 'not_sent' }) });
  await run(f, '2026-10-24');
  assert.equal(f.bucket.read('history/' + f.manifest.cards[0].model_id + '.json').status, 'not_sent');
  assert.equal((await run(f, '2026-10-25')).results[0].status, 'incomplete');
  assert.equal(f.sends.length, 2);
});

test('legacy frozen sibling identity collision blocks both pending rooms without rewriting plans', async () => {
  const f = fixture({ inventory: cards(2) });
  const plan = await seedLegacyModelPlan(f, f.manifest.cards[0]);
  const { digest, ...payload } = plan;
  const sibling = { ...payload, slot: 'standard' };
  sibling.digest = await compcardSha256(new TextEncoder().encode(JSON.stringify(sibling)));
  await putRecord(f, 'plans/2026-10-24/standard.json', sibling);
  const before = ['model', 'standard'].map(slot => rawRecord(f, `plans/2026-10-24/${slot}.json`));
  await run(f, '2026-10-24', '16:30');
  await run(f, '2026-10-24');
  assert.equal(f.sends.length, 0);
  assert.equal(f.bucket.read('deliveries/2026-10-24/model/premium.json').error, 'compcard_same_day_model_conflict');
  assert.equal(f.bucket.read('deliveries/2026-10-24/standard/standard.json').error, 'compcard_same_day_model_conflict');
  assert.deepEqual(['model', 'standard'].map(slot => rawRecord(f, `plans/2026-10-24/${slot}.json`)), before);
});
